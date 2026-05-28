import OpenAI from "openai";
import { CONFIG } from "./config";
import { startSpan } from "./perf";

// Reasoning LLM client. Endpoint and credentials are configurable via env
// (OPENAI_BASE_URL, OPENAI_API_KEY) — see src/config.ts and .env.example.
const client = new OpenAI({
  baseURL: CONFIG.llmBaseUrl,
  apiKey: CONFIG.llmApiKey,
});


export async function callLLM(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  options?: { model?: string; temperature?: number; json?: boolean }
): Promise<string> {
  const model = options?.model ?? CONFIG.reasoningModel;
  const promptLength = messages.reduce((sum, m) => sum + m.content.length, 0);
  const endSpan = startSpan("callLLM", { model, promptLength });
  const response = await client.chat.completions.create({
    model,
    messages,
    temperature: options?.temperature ?? 0.3,
  });
  const result = response.choices[0]?.message?.content ?? "";
  endSpan({ responseLength: result.length });
  return result;
}

/** Extract the first valid JSON object from LLM response that may contain fences or extra text */
export function extractJson(text: string): string {
  // Try to find JSON in code fences
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) return fenceMatch[1]!.trim();

  // Find the first complete JSON object by brace-counting
  const start = text.indexOf("{");
  if (start === -1) return text.trim();

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    if (ch === "}") { depth--; if (depth === 0) return text.slice(start, i + 1); }
  }

  return text.trim();
}

export async function embed(text: string): Promise<number[]> {
  const endSpan = startSpan("embed", { textLength: text.length });
  const response = await fetch(`${CONFIG.embeddingBaseUrl}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: CONFIG.embeddingModel, prompt: text }),
  });
  const data = await response.json() as { embedding: number[] };
  endSpan({ embeddingDimensions: data.embedding?.length ?? 0 });
  return data.embedding;
}
