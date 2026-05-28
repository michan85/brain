import { callLLM, embed, extractJson } from "./llm";
import { now } from "./utils";
import { startSpan } from "./perf";
import type { SensorOutput, ExtractedEntity } from "./types";

export async function processTextInput(input: string): Promise<SensorOutput> {
  const endSpan = startSpan("processTextInput", { inputLength: input.length });
  // Entity extraction and embedding in parallel
  const [entities, embedding] = await Promise.all([
    extractEntities(input),
    embed(input),
  ]);

  endSpan({ entityCount: entities.length });
  return {
    modality: "text",
    timestamp: now(),
    raw: input,
    entities,
    embedding,
    metadata: {},
    urgency: 0.5,
  };
}

async function extractEntities(input: string): Promise<ExtractedEntity[]> {
  const response = await callLLM(
    [
      {
        role: "system",
        content: `Extract entities from the user's input. Return JSON: {"entities": [{"name": "entity name", "type": "person|concept|object|service|file|project|tool", "confidence": 0.0-1.0}]}. Extract people, projects, services, files, concepts, and tools mentioned. Be concise — only extract what's explicitly mentioned or strongly implied. If no entities are found, return an empty array.`,
      },
      { role: "user", content: input },
    ],
    { model: "gpt-5.1-codex-mini" }
  );

  try {
    const parsed = JSON.parse(extractJson(response));
    return parsed.entities ?? [];
  } catch {
    return [];
  }
}
