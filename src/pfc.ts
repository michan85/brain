import { callLLM, extractJson } from "./llm";
import { formatSenseForWorkingMemory, writeSenseToScratch, type SenseFindings } from "./sense";
import { formatActForWorkingMemory, writeActToScratch, type ActFindings } from "./act";
import { CONFIG } from "./config";
import { buildPFCPrompt } from "./prompts";
import { evaluate } from "./evaluator";
import { executeEffector } from "./effectors";
import { writeScratch, readScratch } from "./scratch";
import { generateId, now } from "./utils";
import { createLogger, type IterationRecord } from "./logger";
import type {
  SensorOutput,
  ActivatedSubgraph,
  LoopState,
  PFCOutput,
  Thought,
  Action,
  Goal,
  EffectorResult,
} from "./types";

export async function runPFCLoop(
  sensorOutput: SensorOutput,
  activatedContext: ActivatedSubgraph,
  sessionId: string
): Promise<string> {
  const logger = createLogger(sessionId, CONFIG.logDir ?? "");
  const loopStartTime = performance.now();

  const state: LoopState = {
    sensorOutputs: [sensorOutput],
    goals: [
      {
        id: generateId(),
        description: `Respond to: "${String(sensorOutput.raw).slice(0, 100)}"`,
        depth: 0,
        status: "active",
        completionCriteria: "User receives a helpful, accurate response",
      },
    ],
    activatedContext,
    workingMemory: [],
    iterationCount: 0,
  };

  let finalResponse = "";
  let terminationReason: "done" | "fatigue" | "error" = "fatigue";
  let completedIterations = 0;

  for (let i = 0; i < CONFIG.maxIterations; i++) {
    const iterStart = performance.now();
    state.iterationCount = i;

    // Snapshot scratch count before this iteration
    const scratchBefore = (await readScratch(sessionId)).length;

    // Build prompt and get PFC output
    const messages = buildPFCPrompt(state);
    const llmStart = performance.now();
    const raw = await callLLM(messages, { json: true });
    const llmDurationMs = performance.now() - llmStart;

    let output: PFCOutput;
    try {
      const parsed = JSON.parse(extractJson(raw));
      if (parsed.kind === "action" && parsed.effectorId) {
        output = { kind: "action", effectorId: parsed.effectorId, payload: parsed.payload, timestamp: now() };
      } else if (parsed.kind === "thought" && parsed.content) {
        output = { kind: "thought", content: parsed.content, timestamp: now() };
      } else {
        output = { kind: "thought", content: raw.slice(0, 1000), timestamp: now() };
      }
    } catch {
      // JSON parsing failed — check if there's a respond action buried in the raw output
      const respondMatch = raw.match(/"effectorId"\s*:\s*"respond"[\s\S]*?"message"\s*:\s*"([\s\S]*?)(?:"\s*\})/);
      if (respondMatch) {
        output = { kind: "action", effectorId: "respond", payload: { message: respondMatch[1] }, timestamp: now() };
      } else {
        output = { kind: "thought", content: raw.slice(0, 1000), timestamp: now() };
      }
    }

    // Log to console
    if (output.kind === "thought") {
      console.log(`  💭 [thought] ${output.content}`);
    } else {
      console.log(`  ⚡ [action] ${output.effectorId}: ${JSON.stringify(output.payload).slice(0, 200)}`);
    }

    // Tracking for iteration record
    let effectorId: string | undefined;
    let effectorPayload: unknown;
    let effectorResultRecord: { success: boolean; durationMs: number; error?: string } | undefined;
    let effectorDurationMs: number | undefined;
    let outputContent: string;

    // Process based on output type
    if (output.kind === "thought") {
      outputContent = output.content;
      // Add to working memory, cap at max
      state.workingMemory.push(output as Thought);
      if (state.workingMemory.length > CONFIG.maxWorkingMemoryThoughts) {
        state.workingMemory.shift();
      }
      await writeScratch(sessionId, "thought", output.content);
    } else {
      // Execute the effector
      const action = output as Action;
      effectorId = action.effectorId;
      effectorPayload = action.payload;
      outputContent = `${action.effectorId}: ${JSON.stringify(action.payload).slice(0, 200)}`;

      const effectorStart = performance.now();
      const result = await executeEffector(action.effectorId, action.payload);
      effectorDurationMs = performance.now() - effectorStart;
      state.lastEffectorResult = result;
      effectorResultRecord = {
        success: result.success,
        durationMs: result.durationMs,
        error: result.error,
      };

      // Push action result summary into working memory
      let resultSummary: string;
      if (action.effectorId === "sense" && result.success && result.data) {
        const findings = result.data as SenseFindings;
        resultSummary = formatSenseForWorkingMemory(
          (action.payload as any)?.task ?? "investigation",
          findings
        );
        await writeSenseToScratch(sessionId, findings);
      } else if (action.effectorId === "act" && result.success && result.data) {
        const findings = result.data as ActFindings;
        resultSummary = formatActForWorkingMemory(
          (action.payload as any)?.task ?? "execution",
          findings
        );
        await writeActToScratch(sessionId, findings);
      } else {
        resultSummary = `[${action.effectorId}] ${result.success ? "OK" : "ERROR"}: ${String(result.data).slice(0, 3000)}`;
      }
      state.workingMemory.push({
        kind: "thought",
        content: resultSummary,
        timestamp: now(),
      });
      if (state.workingMemory.length > CONFIG.maxWorkingMemoryThoughts) {
        state.workingMemory.shift();
      }

      await writeScratch(
        sessionId,
        "action_result",
        `${action.effectorId}: ${result.success ? "success" : "error"} — ${String(result.data).slice(0, 500)}`
      );

      // If it's a respond action, capture the response
      if (action.effectorId === "respond") {
        finalResponse = String(result.data);
      }
    }

    // Evaluate
    const evaluation = await evaluate(output, state);
    state.lastEvaluation = evaluation;

    await writeScratch(sessionId, "evaluator_signal",
      `${evaluation.status} | ${evaluation.quality} | ${evaluation.surprise} — ${evaluation.rationale}`,
      {
        evaluatorAnnotation: {
          quality: evaluation.quality,
          surprise: evaluation.surprise,
          tags: [],
        },
      }
    );

    console.log(
      `  📊 [eval] ${evaluation.status} | ${evaluation.quality} | ${evaluation.rationale}`
    );

    // Handle redirect: inject the hint into working memory so PFC course-corrects
    if (evaluation.status === "redirect" && evaluation.redirectHint) {
      console.log(`  🔀 [redirect] ${evaluation.redirectHint}`);
      state.workingMemory.push({
        kind: "thought",
        content: `[REDIRECT from evaluator] You are off track. ${evaluation.redirectHint}`,
        timestamp: now(),
      });
      if (state.workingMemory.length > CONFIG.maxWorkingMemoryThoughts) {
        state.workingMemory.shift();
      }
      await writeScratch(sessionId, "evaluator_signal",
        `[redirect] ${evaluation.redirectHint}`,
        {
          evaluatorAnnotation: {
            quality: evaluation.quality,
            surprise: evaluation.surprise,
            tags: ["redirect"],
          },
        }
      );
    }

    // Collect scratch writes from this iteration
    const scratchAfter = await readScratch(sessionId);
    const scratchWrites = scratchAfter.slice(scratchBefore).map((e) => e.content);

    const totalDurationMs = performance.now() - iterStart;
    completedIterations = i + 1;

    // Build and log iteration record
    const record: IterationRecord = {
      iteration: i,
      timestamp: now(),
      goals: state.goals,
      activatedNodeCount: state.activatedContext.nodes.length,
      activatedNodeIds: state.activatedContext.nodes.map((n) => n.node.id),
      seedNodeIds: state.activatedContext.seedNodeIds,
      workingMemorySize: state.workingMemory.length,
      outputKind: output.kind,
      outputContent,
      effectorId,
      effectorPayload,
      effectorResult: effectorResultRecord,
      evaluationStatus: evaluation.status,
      evaluationQuality: evaluation.quality,
      evaluationSurprise: evaluation.surprise,
      prediction: null,
      predictionError: null,
      reactivationTriggered: false,
      reactivationSource: null,
      scratchWrites,
      llmDurationMs,
      effectorDurationMs,
      totalDurationMs,
    };
    logger.logIteration(record);

    if (evaluation.status === "done") {
      terminationReason = "done";
      break;
    }
  }

  const loopEndTime = performance.now();
  const response = finalResponse || "I wasn't able to produce a response within the iteration limit.";

  logger.finalize({
    sessionId,
    startTime: loopStartTime,
    endTime: loopEndTime,
    totalIterations: completedIterations,
    terminationReason,
    finalResponse: response,
  });

  return response;
}
