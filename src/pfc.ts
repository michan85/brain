import { callLLM, extractJson, embed } from "./llm";
import { formatSenseForWorkingMemory, writeSenseToScratch, type SenseFindings } from "./sense";
import { formatActForWorkingMemory, writeActToScratch, type ActFindings } from "./act";
import { CONFIG } from "./config";
import { buildPFCPrompt } from "./prompts";
import { evaluate } from "./evaluator";
import { executeEffector } from "./effectors";
import { activate } from "./graph";
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
  Prediction,
  EffectorResult,
} from "./types";

const MAX_REACTIVATIONS_PER_LOOP = 3;

export async function runPFCLoop(
  sensorOutput: SensorOutput,
  activatedContext: ActivatedSubgraph,
  sessionId: string,
  opts?: { logDir?: string }
): Promise<string> {
  const logger = createLogger(sessionId, opts?.logDir ?? CONFIG.logDir ?? "");
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
  let reactivationCount = 0;

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
    let goalAction: "push" | "pop" | undefined;
    let subGoal: { description: string; completionCriteria: string } | undefined;
    let prediction: Prediction | undefined;
    let reactivationHints: string[] = [];

    try {
      const parsed = JSON.parse(extractJson(raw));
      if (parsed.kind === "action" && parsed.effectorId) {
        // Extract prediction if present
        if (parsed.prediction && parsed.prediction.expectedResult) {
          prediction = {
            expectedResult: parsed.prediction.expectedResult,
            confidence: typeof parsed.prediction.confidence === "number" ? parsed.prediction.confidence : 0.5,
          };
        }
        output = { kind: "action", effectorId: parsed.effectorId, payload: parsed.payload, prediction, timestamp: now() };
      } else if (parsed.kind === "thought" && parsed.content) {
        // Extract goal action if present
        if (parsed.goalAction === "push" || parsed.goalAction === "pop") {
          goalAction = parsed.goalAction;
        }
        if (parsed.goalAction === "push" && parsed.subGoal && parsed.subGoal.description) {
          subGoal = {
            description: parsed.subGoal.description,
            completionCriteria: parsed.subGoal.completionCriteria ?? "",
          };
        }
        // Extract reactivation hints if present
        if (Array.isArray(parsed.reactivationHints) && parsed.reactivationHints.length > 0) {
          reactivationHints = parsed.reactivationHints.filter((h: unknown) => typeof h === "string" && h.length > 0);
        }
        output = { kind: "thought", content: parsed.content, reactivationHints, timestamp: now() };
      } else {
        output = { kind: "thought", content: raw.slice(0, 1000), reactivationHints: [], timestamp: now() };
      }
    } catch {
      // JSON parsing failed — check if there's a respond action buried in the raw output
      const respondMatch = raw.match(/"effectorId"\s*:\s*"respond"[\s\S]*?"message"\s*:\s*"([\s\S]*?)(?:"\s*\})/);
      if (respondMatch) {
        output = { kind: "action", effectorId: "respond", payload: { message: respondMatch[1] }, timestamp: now() };
      } else {
        output = { kind: "thought", content: raw.slice(0, 1000), reactivationHints: [], timestamp: now() };
      }
    }

    // --- Goal Stack Management ---
    if (goalAction === "push" && subGoal) {
      // Find the current leaf goal (deepest active goal)
      const leafGoal = [...state.goals].reverse().find((g) => g.status === "active");
      const newGoal: Goal = {
        id: generateId(),
        description: subGoal.description,
        depth: (leafGoal?.depth ?? 0) + 1,
        status: "active",
        parentId: leafGoal?.id,
        completionCriteria: subGoal.completionCriteria,
      };
      state.goals.push(newGoal);
      console.log(`  🎯 [goal push] depth=${newGoal.depth}: ${newGoal.description}`);
    } else if (goalAction === "pop") {
      // Find and complete the current leaf goal (deepest active goal)
      const leafIdx = state.goals.map((g, idx) => ({ g, idx }))
        .reverse()
        .find(({ g }) => g.status === "active" && g.depth > 0);
      if (leafIdx) {
        state.goals[leafIdx.idx]!.status = "completed";
        console.log(`  ✅ [goal pop] completed: ${leafIdx.g.description}`);
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

      // --- Explicit (PFC-requested) reactivation ---
      if (reactivationHints.length > 0 && reactivationCount < MAX_REACTIVATIONS_PER_LOOP) {
        for (const hint of reactivationHints) {
          if (reactivationCount >= MAX_REACTIVATIONS_PER_LOOP) break;
          console.log(`  🔄 [reactivate:explicit] "${hint}"`);
          const hintEmbedding = await embed(hint);
          const newContext = await activate({
            modality: "reactivation",
            timestamp: now(),
            raw: hint,
            entities: [],
            embedding: hintEmbedding,
            metadata: { source: "pfc_explicit" },
            urgency: 0.7,
          });

          if (newContext.nodes.length > 0) {
            const existingIds = new Set(state.activatedContext.nodes.map((n) => n.node.id));
            const newNodes = newContext.nodes.filter((n) => !existingIds.has(n.node.id));
            const newEdges = newContext.edges.filter(
              (e) => !state.activatedContext.edges.some((ex) => ex.id === e.id)
            );
            state.activatedContext.nodes.push(...newNodes);
            state.activatedContext.edges.push(...newEdges);

            console.log(`  🔄 [reactivate:explicit] Added ${newNodes.length} nodes, ${newEdges.length} edges`);
            state.workingMemory.push({
              kind: "thought",
              content: `[REACTIVATION:explicit] Pulled in ${newNodes.length} new context nodes for "${hint}": ${newNodes.map((n) => n.node.name).join(", ")}`,
              reactivationHints: [],
              timestamp: now(),
            });
            if (state.workingMemory.length > CONFIG.maxWorkingMemoryThoughts) {
              state.workingMemory.shift();
            }
          }
          reactivationCount++;
        }
      }
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
        reactivationHints: [],
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

    // Evaluate (pass prediction so evaluator can compute prediction error)
    const evaluation = await evaluate(output, state, prediction);
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
        reactivationHints: [],
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

    // --- Surprise-driven reactivation ---
    // When surprise is high/critical and the evaluator provides a query,
    // re-query the graph to pull in relevant context the PFC didn't have before.
    let reactivationTriggered = false;
    if (
      evaluation.reactivationQuery &&
      (evaluation.surprise === "high" || evaluation.surprise === "critical") &&
      reactivationCount < MAX_REACTIVATIONS_PER_LOOP
    ) {
      console.log(`  🔄 [reactivate:surprise] "${evaluation.reactivationQuery}"`);
      const reactivationEmbedding = await embed(evaluation.reactivationQuery);
      const newContext = await activate({
        modality: "reactivation",
        timestamp: now(),
        raw: evaluation.reactivationQuery,
        entities: [],
        embedding: reactivationEmbedding,
        metadata: { source: "evaluator_surprise" },
        urgency: evaluation.surprise === "critical" ? 1.0 : 0.8,
      });

      if (newContext.nodes.length > 0) {
        // Merge new nodes into existing context (don't duplicate)
        const existingIds = new Set(state.activatedContext.nodes.map((n) => n.node.id));
        const newNodes = newContext.nodes.filter((n) => !existingIds.has(n.node.id));
        const newEdges = newContext.edges.filter(
          (e) => !state.activatedContext.edges.some((ex) => ex.id === e.id)
        );
        state.activatedContext.nodes.push(...newNodes);
        state.activatedContext.edges.push(...newEdges);
        reactivationTriggered = true;

        console.log(`  🔄 [reactivate:surprise] Added ${newNodes.length} nodes, ${newEdges.length} edges`);
        state.workingMemory.push({
          kind: "thought",
          content: `[REACTIVATION:surprise] Surprise detected — pulled in ${newNodes.length} new context nodes: ${newNodes.map((n) => n.node.name).join(", ")}`,
          reactivationHints: [],
          timestamp: now(),
        });
        if (state.workingMemory.length > CONFIG.maxWorkingMemoryThoughts) {
          state.workingMemory.shift();
        }
      }
      reactivationCount++;
    }

    // TODO: Drift-driven reactivation (Section 5.5 trigger #2)
    // Needs embedding comparison infrastructure: embed current working memory state,
    // compare cosine similarity against original activation query embedding,
    // trigger reactivation when similarity drops below threshold.

    // Collect scratch writes from this iteration
    const scratchAfter = await readScratch(sessionId);
    const scratchWrites = scratchAfter.slice(scratchBefore).map((e) => e.content);

    const totalDurationMs = performance.now() - iterStart;
    completedIterations = i + 1;

    // Also mark reactivation triggered if explicit reactivation happened this iteration
    if (reactivationHints.length > 0 && reactivationCount > 0) {
      reactivationTriggered = true;
    }

    // Build reactivation source from both surprise and explicit triggers
    const reactivationSource = evaluation.reactivationQuery
      ?? (reactivationHints.length > 0 ? reactivationHints.join("; ") : null);

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
      prediction: prediction ? { expectedResult: prediction.expectedResult, confidence: prediction.confidence } : null,
      predictionError: null,
      reactivationTriggered,
      reactivationSource,
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
