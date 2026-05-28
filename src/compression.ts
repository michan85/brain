import { callLLM } from "./llm";
import { CONFIG } from "./config";
import { now } from "./utils";
import type { Thought } from "./types";

/**
 * Compress multiple thoughts into a single summary thought using the LLM.
 * Preserves key facts, decisions, and findings from the original thoughts.
 */
export async function compressWorkingMemory(thoughts: Thought[]): Promise<Thought> {
  if (thoughts.length === 0) {
    return { kind: "thought", content: "[COMPRESSED] (empty)", timestamp: now(), reactivationHints: [] };
  }
  if (thoughts.length === 1) {
    return { ...thoughts[0]!, content: `[COMPRESSED] ${thoughts[0]!.content}` };
  }
  const thoughtTexts = thoughts.map((t, i) => `[${i + 1}] ${t.content}`).join("\n");

  const summary = await callLLM(
    [
      {
        role: "system",
        content:
          "Compress these reasoning traces into a single concise summary preserving key facts, decisions, and findings. Be brief but preserve all important information.",
      },
      {
        role: "user",
        content: thoughtTexts,
      },
    ],
    { model: CONFIG.evaluatorModel, temperature: 0.2 }
  );

  // Merge reactivation hints from all compressed thoughts
  const mergedHints = [
    ...new Set(thoughts.flatMap((t) => t.reactivationHints)),
  ];

  return {
    kind: "thought",
    content: `[COMPRESSED] ${summary}`,
    timestamp: now(),
    reactivationHints: mergedHints,
  };
}

/**
 * If working memory exceeds the max, compress the oldest batch of thoughts
 * into a single compressed thought. Returns the (possibly modified) array.
 */
export async function maybeCompressWorkingMemory(
  workingMemory: Thought[]
): Promise<Thought[]> {
  if (workingMemory.length <= CONFIG.maxWorkingMemoryThoughts) {
    return workingMemory;
  }

  const batchSize = CONFIG.compressionBatchSize;

  // Don't compress if we don't have enough old thoughts to form a batch
  if (workingMemory.length < batchSize + 1) {
    // Fall back to shift to stay within limit
    return workingMemory.slice(workingMemory.length - CONFIG.maxWorkingMemoryThoughts);
  }

  const toCompress = workingMemory.slice(0, batchSize);
  const rest = workingMemory.slice(batchSize);
  const compressed = await compressWorkingMemory(toCompress);

  return [compressed, ...rest];
}
