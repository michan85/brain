import { callLLM, extractJson } from "./llm";
import { CONFIG } from "./config";
import { buildEvaluatorPrompt } from "./prompts";
import { startSpan } from "./perf";
import type {
  PFCOutput,
  LoopState,
  EvaluationResult,
  Prediction,
  PredictionError,
  Action,
} from "./types";

// ---------------------------------------------------------------------------
// Stale-State Detection
// ---------------------------------------------------------------------------

const STALE_HISTORY_SIZE = 5;
const STALE_THRESHOLD = 3; // how many consecutive similar outputs trigger staleness
const SIMILARITY_CUTOFF = 0.85; // above this, two strings are considered "the same"

/** Ring buffer of recent output content strings, used for stale-state detection. */
const recentOutputs: string[] = [];

/**
 * Compute a simple normalized bigram-overlap similarity between two strings.
 * Returns a value in [0, 1] where 1 means identical.
 */
function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;

  const bigrams = (s: string): Set<string> => {
    const set = new Set<string>();
    const lower = s.toLowerCase();
    for (let i = 0; i < lower.length - 1; i++) {
      set.add(lower.slice(i, i + 2));
    }
    return set;
  };

  const setA = bigrams(a);
  const setB = bigrams(b);
  let intersection = 0;
  for (const bg of setA) {
    if (setB.has(bg)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

/**
 * Track an output string and return true if the last STALE_THRESHOLD outputs
 * are essentially identical (high string similarity).
 */
export function detectStaleState(outputContent: string): boolean {
  recentOutputs.push(outputContent);
  if (recentOutputs.length > STALE_HISTORY_SIZE) {
    recentOutputs.shift();
  }

  if (recentOutputs.length < STALE_THRESHOLD) return false;

  // Check whether the last STALE_THRESHOLD entries are all pairwise similar
  const tail = recentOutputs.slice(-STALE_THRESHOLD);
  for (let i = 0; i < tail.length; i++) {
    for (let j = i + 1; j < tail.length; j++) {
      if (stringSimilarity(tail[i]!, tail[j]!) < SIMILARITY_CUTOFF) {
        return false;
      }
    }
  }
  return true;
}

/** Reset stale-state tracking (e.g. between sessions). */
export function resetStaleState(): void {
  recentOutputs.length = 0;
}

// ---------------------------------------------------------------------------
// Prediction Error Computation (pure — no LLM call)
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "shall",
  "should", "may", "might", "must", "can", "could", "to", "of", "in",
  "for", "on", "with", "at", "by", "from", "as", "into", "through",
  "during", "before", "after", "and", "but", "or", "nor", "not", "so",
  "yet", "both", "either", "neither", "each", "every", "all", "any",
  "few", "more", "most", "other", "some", "such", "no", "only", "own",
  "same", "than", "too", "very", "just", "it", "its", "this", "that",
  "these", "those", "i", "me", "my", "we", "our", "you", "your", "he",
  "him", "his", "she", "her", "they", "them", "their", "what", "which",
  "who", "whom", "how", "when", "where", "why",
]);

const ERROR_KEYWORDS = [
  "error", "fail", "failed", "failure", "exception", "crash", "crashed",
  "abort", "aborted", "denied", "unauthorized", "forbidden", "timeout",
  "timed out", "reject", "rejected", "invalid", "broken", "fatal",
  "panic", "not found", "404", "500", "502", "503",
];

const SUCCESS_KEYWORDS = [
  "success", "succeeded", "ok", "done", "completed", "created", "updated",
  "resolved", "passed", "approved", "200", "201", "accepted",
];

/** Extract significant (non-stop) words from a string. */
function significantWords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
  return new Set(words);
}

/**
 * Compute prediction error between a prediction and the actual result.
 * Pure function — no LLM call, uses keyword overlap for deviation.
 */
export function computePredictionError(
  prediction: Prediction,
  actualResult: string
): PredictionError {
  const expectedWords = significantWords(prediction.expectedResult);
  const actualWords = significantWords(actualResult);

  // Compute overlap ratio relative to the expected words set
  let overlap = 0;
  for (const word of expectedWords) {
    if (actualWords.has(word)) overlap++;
  }
  const maxSize = Math.max(expectedWords.size, 1);
  const overlapRatio = overlap / maxSize;
  const deviation = Math.min(1, Math.max(0, 1 - overlapRatio));

  // Derive surprise from deviation
  const surprise: PredictionError["surprise"] =
    deviation > 0.8 ? "critical"
    : deviation > 0.5 ? "high"
    : deviation >= 0.2 ? "low"
    : "none";

  // Derive valence from actual result content
  const lowerActual = actualResult.toLowerCase();
  const hasError = ERROR_KEYWORDS.some((kw) => lowerActual.includes(kw));
  const hasSuccess = SUCCESS_KEYWORDS.some((kw) => lowerActual.includes(kw));
  const valence: PredictionError["valence"] =
    hasError ? "negative" : hasSuccess ? "positive" : "neutral";

  return {
    prediction,
    actual: actualResult,
    deviation,
    surprise,
    valence,
  };
}

// ---------------------------------------------------------------------------
// Consecutive counterproductive tracking (for redirect signals)
// ---------------------------------------------------------------------------

let consecutiveCounterproductive = 0;

export function resetConsecutiveCounterproductive(): void {
  consecutiveCounterproductive = 0;
}

// ---------------------------------------------------------------------------
// Main evaluate() function
// ---------------------------------------------------------------------------

export async function evaluate(
  output: PFCOutput,
  state: LoopState,
  prediction?: Prediction
): Promise<EvaluationResult> {
  const endSpan = startSpan("evaluate", { model: CONFIG.evaluatorModel, outputKind: output.kind });
  // If the PFC used the "respond" effector, we're done
  if (output.kind === "action" && output.effectorId === "respond") {
    consecutiveCounterproductive = 0;
    endSpan({ status: "done", shortCircuit: true });
    return {
      status: "done",
      quality: "productive",
      surprise: "none",
      rationale: "Agent produced a response to the user.",
    };
  }

  // Compute prediction error if we have a prediction and an effector result
  let predictionError: PredictionError | undefined;
  if (prediction && state.lastEffectorResult) {
    const actualStr =
      typeof state.lastEffectorResult.data === "string"
        ? state.lastEffectorResult.data
        : JSON.stringify(state.lastEffectorResult.data ?? "");
    predictionError = computePredictionError(prediction, actualStr);
  }

  // Track stale state from the output content
  const outputContent =
    output.kind === "thought"
      ? output.content
      : JSON.stringify((output as Action).payload);
  const isStale = detectStaleState(outputContent);

  // Build the LLM evaluator prompt, augmenting with prediction error info
  const messages = buildEvaluatorPrompt(output, state);
  // Append prediction error context to the user message so the LLM is aware
  if (predictionError) {
    const peInfo = [
      `\nPrediction error context:`,
      `  Expected: "${predictionError.prediction.expectedResult}"`,
      `  Actual (truncated): "${predictionError.actual.slice(0, 300)}"`,
      `  Deviation: ${predictionError.deviation.toFixed(2)}`,
      `  Surprise: ${predictionError.surprise}`,
      `  Valence: ${predictionError.valence}`,
    ].join("\n");
    const lastMsg = messages[messages.length - 1]!;
    lastMsg.content += peInfo;
  }
  if (isStale) {
    const lastMsg = messages[messages.length - 1]!;
    lastMsg.content +=
      "\n\nWARNING: Stale state detected — the last 3 outputs are nearly identical. The agent appears to be stuck in a loop. Consider redirect or done.";
  }

  const response = await callLLM(messages, {
    model: CONFIG.evaluatorModel,
    json: true,
  });

  try {
    const parsed = JSON.parse(extractJson(response));
    const quality = parsed.quality ?? "neutral";

    // Track consecutive counterproductive for redirect escalation
    if (quality === "counterproductive") {
      consecutiveCounterproductive++;
    } else {
      consecutiveCounterproductive = 0;
    }

    // Determine status — force redirect if stuck
    let status: EvaluationResult["status"] =
      parsed.status === "done" ? "done"
      : parsed.status === "redirect" ? "redirect"
      : "continue";

    // Escalate to redirect if counterproductive for 2+ consecutive iterations
    if (
      status === "continue" &&
      consecutiveCounterproductive >= 2
    ) {
      status = "redirect";
    }

    // Force redirect if stale state detected and LLM didn't already flag it
    if (isStale && status === "continue") {
      status = "redirect";
    }

    // Determine surprise — use prediction error surprise if available, else LLM's
    const surprise: EvaluationResult["surprise"] =
      predictionError?.surprise ?? parsed.surprise ?? "none";
    const hasHighSurprise = surprise === "high" || surprise === "critical";

    // Build reactivation query — prefer LLM's query, fall back to prediction error context
    let reactivationQuery: string | undefined;
    if (hasHighSurprise) {
      reactivationQuery = parsed.reactivationQuery ?? parsed.reactivation_query ?? undefined;
      // If prediction error triggered high surprise but LLM didn't provide a query,
      // synthesize one from the prediction error
      if (!reactivationQuery && predictionError) {
        reactivationQuery = `${predictionError.prediction.expectedResult} vs actual: ${predictionError.actual.slice(0, 150)}`;
      }
    }

    // Build redirect action for status=redirect
    const redirectAction =
      status === "redirect"
        ? (parsed.redirectAction ?? parsed.redirect_action ?? undefined)
        : undefined;

    const result: EvaluationResult = {
      status,
      quality,
      surprise,
      rationale: parsed.rationale ?? "",
      redirectHint:
        status === "redirect"
          ? (parsed.redirectHint ?? parsed.redirect_hint ?? "Re-evaluate approach.")
          : undefined,
      reactivationQuery,
      redirectAction,
      predictionError,
    };

    endSpan({ status, quality, surprise });
    return result;
  } catch {
    endSpan({ error: "parse_failure" });
    return {
      status: "continue",
      quality: "neutral",
      surprise: predictionError?.surprise ?? "none",
      rationale: "Failed to parse evaluator response.",
      predictionError,
    };
  }
}
