import OpenAI from "openai";
import { CONFIG } from "./config";

// Reasoning LLM via Codex OAuth proxy
const client = new OpenAI({
  baseURL: CONFIG.llmBaseUrl,
  apiKey: "codex-oauth", // proxy handles auth
});


export async function callLLM(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  options?: { model?: string; temperature?: number; json?: boolean }
): Promise<string> {
  const response = await client.chat.completions.create({
    model: options?.model ?? CONFIG.reasoningModel,
    messages,
    temperature: options?.temperature ?? 0.3,
  });
  return response.choices[0]?.message?.content ?? "";
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
  const response = await fetch(`${CONFIG.embeddingBaseUrl}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: CONFIG.embeddingModel, prompt: text }),
  });
  const data = await response.json() as { embedding: number[] };
  return data.embedding;
}
