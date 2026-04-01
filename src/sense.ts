import { CONFIG } from "./config";
import { callLLM, extractJson } from "./llm";
import { writeScratch } from "./scratch";
import { now } from "./utils";
import type { EffectorResult } from "./types";

export interface SenseFindings {
  summary: string;
  entities: {
    name: string;
    type: string;
    observations: string[];
  }[];
  edges: {
    source: string;
    target: string;
    relation: string;
  }[];
}

interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

const MAX_TOOL_ROUNDS = 8;
const MAX_READ_CHARS = 8000;

export async function senseEffector(payload: unknown): Promise<EffectorResult> {
  const start = performance.now();
  try {
    const { task, source, hints } = payload as {
      task: string;
      source: string;
      hints?: string[];
    };

    const findings = await investigate(task, source, hints);

    return {
      success: true,
      data: findings,
      durationMs: performance.now() - start,
    };
  } catch (e: any) {
    return {
      success: false,
      data: null,
      error: e.message,
      durationMs: performance.now() - start,
    };
  }
}

const SENSE_TIMEOUT_MS = 60_000; // 60s hard ceiling for the entire investigation

async function investigate(
  task: string,
  source: string,
  hints?: string[]
): Promise<SenseFindings> {
  const deadline = Date.now() + SENSE_TIMEOUT_MS;
  const messages: { role: "system" | "user" | "assistant" | "tool"; content: string; tool_call_id?: string }[] = [
    {
      role: "system",
      content: `You are a research assistant investigating a source to extract structured knowledge.

You have access to these tools:
- readFile(path, offset?, limit?): Read a file. Returns content with line count metadata.
- bash(command): Run a shell command. Returns stdout/stderr.

To use a tool, respond with JSON:
{"tool": "readFile", "args": {"path": "/some/path"}}
or
{"tool": "bash", "args": {"command": "ls -la /some/dir"}}

When you have gathered enough information, respond with your findings as JSON:
{"done": true, "findings": {
  "summary": "concise answer to the task",
  "entities": [{"name": "...", "type": "...", "observations": ["fact 1", "fact 2"]}],
  "edges": [{"source": "entity A", "target": "entity B", "relation": "uses"}]
}}

RULES:
- Investigate efficiently. If the source path points directly to a file, read it first. If search hints include file paths, read those files directly before exploring.
- Only fall back to broad exploration (ls, find) if direct file reads don't work.
- Read only what's relevant to the task. Don't read every file.
- Output ONLY a single JSON object per response.
- When you have enough to answer the task, return findings immediately. Don't over-investigate.`,
    },
    {
      role: "user",
      content: `Task: ${task}\nSource: ${source}${hints?.length ? `\nSearch hints: ${hints.join(", ")}` : ""}`,
    },
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    if (Date.now() > deadline) {
      console.log("    ⏱️ [sense] hit timeout ceiling, forcing extraction");
      break;
    }
    const response = await callLLM(
      messages as any,
      { model: CONFIG.evaluatorModel, temperature: 0.2 }
    );

    let parsed: any;
    try {
      parsed = JSON.parse(extractJson(response));
    } catch {
      // If we can't parse, push the raw response and try again
      messages.push({ role: "assistant", content: response });
      messages.push({ role: "user", content: "Please respond with valid JSON — either a tool call or your findings." });
      continue;
    }

    // Check if done
    if (parsed.done && parsed.findings) {
      return parsed.findings as SenseFindings;
    }

    // Execute tool call
    if (parsed.tool) {
      messages.push({ role: "assistant", content: JSON.stringify(parsed) });

      const toolResult = await executeSenseTool(parsed.tool, parsed.args ?? {});
      messages.push({ role: "user", content: `[Tool result: ${parsed.tool}]\n${toolResult}` });
      console.log(`    🔬 [sense:${parsed.tool}] ${summarizeToolCall(parsed.tool, parsed.args)}`);
      continue;
    }

    // Neither done nor tool call — prompt for proper response
    messages.push({ role: "assistant", content: response });
    messages.push({ role: "user", content: "Please either call a tool or return your findings." });
  }

  // Max rounds reached — force extraction from what we have
  messages.push({
    role: "user",
    content: "You've reached the investigation limit. Return your findings now based on what you've gathered so far. Respond with {\"done\": true, \"findings\": {...}}",
  });

  const finalResponse = await callLLM(
    messages as any,
    { model: CONFIG.evaluatorModel, temperature: 0.1 }
  );

  try {
    const parsed = JSON.parse(extractJson(finalResponse));
    if (parsed.findings) return parsed.findings as SenseFindings;
    if (parsed.done && parsed.findings) return parsed.findings as SenseFindings;
  } catch {}

  // Fallback
  return {
    summary: "Investigation reached iteration limit without structured findings.",
    entities: [],
    edges: [],
  };
}

async function executeSenseTool(
  tool: string,
  args: Record<string, unknown>
): Promise<string> {
  if (tool === "readFile") {
    try {
      const path = args.path as string;
      const content = await Bun.file(path).text();
      const lines = content.split("\n");
      const offset = (args.offset as number) ?? 0;
      const limit = (args.limit as number) ?? 500;
      const selected = lines.slice(offset, offset + limit);
      const hasMore = offset + limit < lines.length;

      let result = selected.join("\n");
      if (hasMore || offset > 0) {
        result = `[${lines.length} lines total | showing ${offset + 1}-${Math.min(offset + limit, lines.length)}]${hasMore ? ` [more at offset ${offset + limit}]` : ""}\n${result}`;
      }
      return result.slice(0, MAX_READ_CHARS);
    } catch (e: any) {
      return `Error: ${e.message}`;
    }
  }

  if (tool === "bash") {
    try {
      const command = args.command as string;
      const proc = Bun.spawn(["bash", "-c", command], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const timeout = setTimeout(() => proc.kill(), 15000);
      const exitCode = await proc.exited;
      clearTimeout(timeout);

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const full = stdout + (stderr ? `\nSTDERR: ${stderr}` : "");
      if (full.length > MAX_READ_CHARS) {
        return `[${full.split("\n").length} lines, ${full.length} chars — truncated]\n${full.slice(0, MAX_READ_CHARS)}`;
      }
      return full || "(no output)";
    } catch (e: any) {
      return `Error: ${e.message}`;
    }
  }

  return `Unknown tool: ${tool}`;
}

function summarizeToolCall(tool: string, args: Record<string, unknown>): string {
  if (tool === "readFile") return `${args.path}${args.offset ? ` @${args.offset}` : ""}`;
  if (tool === "bash") return String(args.command).slice(0, 100);
  return JSON.stringify(args).slice(0, 100);
}

export function formatSenseForWorkingMemory(
  task: string,
  findings: SenseFindings
): string {
  const entityNames = findings.entities.map((e) => `${e.name} (${e.type})`).join(", ");
  return `[sense] Investigated: "${task}"\nEntities found: ${entityNames || "none"}\nSummary: ${findings.summary}`;
}

export async function writeSenseToScratch(
  sessionId: string,
  findings: SenseFindings
): Promise<void> {
  for (const entity of findings.entities) {
    for (const obs of entity.observations) {
      await writeScratch(sessionId, "observation", `[${entity.name}] ${obs}`);
    }
  }
}
