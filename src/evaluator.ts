import { callLLM, extractJson } from "./llm";
import { CONFIG } from "./config";
import { buildEvaluatorPrompt } from "./prompts";
import type { PFCOutput, LoopState, EvaluationResult } from "./types";

export async function evaluate(
  output: PFCOutput,
  state: LoopState
): Promise<EvaluationResult> {
  // If the PFC used the "respond" effector, we're done
  if (output.kind === "action" && output.effectorId === "respond") {
    return {
      status: "done",
      quality: "productive",
      surprise: "none",
      rationale: "Agent produced a response to the user.",
    };
  }

  const messages = buildEvaluatorPrompt(output, state);
  const response = await callLLM(messages, {
    model: CONFIG.evaluatorModel,
    json: true,
  });

  try {
    const parsed = JSON.parse(extractJson(response));
    const status = parsed.status === "done" ? "done"
      : parsed.status === "redirect" ? "redirect"
      : "continue";
    return {
      status,
      quality: parsed.quality ?? "neutral",
      surprise: parsed.surprise ?? "none",
      rationale: parsed.rationale ?? "",
      redirectHint: status === "redirect" ? (parsed.redirectHint ?? parsed.redirect_hint ?? "") : undefined,
    };
  } catch {
    return {
      status: "continue",
      quality: "neutral",
      surprise: "none",
      rationale: "Failed to parse evaluator response.",
    };
  }
}
