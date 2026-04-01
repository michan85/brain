import { callLLM, extractJson } from "./llm";
import { formatSenseForWorkingMemory, writeSenseToScratch, type SenseFindings } from "./sense";
import { CONFIG } from "./config";
import { buildPFCPrompt } from "./prompts";
import { evaluate } from "./evaluator";
import { executeEffector } from "./effectors";
import { writeScratch } from "./scratch";
import { generateId, now } from "./utils";
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

  for (let i = 0; i < CONFIG.maxIterations; i++) {
    state.iterationCount = i;

    // Build prompt and get PFC output
    const messages = buildPFCPrompt(state);
    const raw = await callLLM(messages, { json: true });

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

    // Process based on output type
    if (output.kind === "thought") {
      // Add to working memory, cap at max
      state.workingMemory.push(output as Thought);
      if (state.workingMemory.length > CONFIG.maxWorkingMemoryThoughts) {
        state.workingMemory.shift();
      }
      writeScratch(sessionId, "thought", output.content);
    } else {
      // Execute the effector
      const action = output as Action;
      const result = await executeEffector(action.effectorId, action.payload);
      state.lastEffectorResult = result;

      // Push action result summary into working memory
      let resultSummary: string;
      if (action.effectorId === "sense" && result.success && result.data) {
        const findings = result.data as SenseFindings;
        resultSummary = formatSenseForWorkingMemory(
          (action.payload as any)?.task ?? "investigation",
          findings
        );
        writeSenseToScratch(sessionId, findings);
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

      writeScratch(
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

    writeScratch(
      sessionId,
      "evaluator_signal",
      `${evaluation.status} | ${evaluation.quality} | ${evaluation.surprise} — ${evaluation.rationale}`
    );

    console.log(
      `  📊 [eval] ${evaluation.status} | ${evaluation.quality} | ${evaluation.rationale}`
    );

    if (evaluation.status === "done") {
      break;
    }
  }

  return finalResponse || "I wasn't able to produce a response within the iteration limit.";
}
