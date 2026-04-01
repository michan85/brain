import { CONFIG } from "./config";
import { callLLM, extractJson } from "./llm";
import { writeScratch } from "./scratch";
import type { EffectorResult } from "./types";

export interface ActFindings {
  summary: string;
  changes: string[];
  verified: boolean;
}

const MAX_TOOL_ROUNDS = 20;
const MAX_OUTPUT_CHARS = 8000;

export async function actEffector(payload: unknown): Promise<EffectorResult> {
  const start = performance.now();
  try {
    const { task, context } = payload as {
      task: string;
      context?: string;
    };

    const findings = await execute(task, context);

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

async function execute(
  task: string,
  context?: string
): Promise<ActFindings> {
  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    {
      role: "system",
      content: `You are an execution assistant that carries out tasks by reading, writing files, and running commands.

You have access to these tools:
- readFile(path, offset?, limit?): Read a file. Returns content with line count metadata.
- writeFile(path, content): Write content to a file (creates or overwrites).
- bash(command): Run a shell command. Returns stdout/stderr.

To use a tool, respond with JSON:
{"tool": "readFile", "args": {"path": "/some/path"}}
{"tool": "writeFile", "args": {"path": "/some/path", "content": "file content"}}
{"tool": "bash", "args": {"command": "bun test"}}

When you have completed the task, respond with:
{"done": true, "result": {
  "summary": "what was accomplished",
  "changes": ["list", "of", "files", "modified"],
  "verified": true
}}

RULES:
- Read before you write. Understand existing code before modifying it.
- Make targeted changes. Don't rewrite files unnecessarily.
- Verify your work when possible (run tests, check output).
- Output ONLY a single JSON object per response.
- When you've completed the task, return results immediately. Don't over-verify.
- If the task is unclear or impossible, return done with a summary explaining why.`,
    },
    {
      role: "user",
      content: `Task: ${task}${context ? `\nContext: ${context}` : ""}\nWorking directory: ${process.cwd()}`,
    },
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await callLLM(
      messages as any,
      { model: CONFIG.evaluatorModel, temperature: 0.2 }
    );

    let parsed: any;
    try {
      parsed = JSON.parse(extractJson(response));
    } catch {
      messages.push({ role: "assistant", content: response });
      messages.push({ role: "user", content: "Please respond with valid JSON — either a tool call or your result." });
      continue;
    }

    // Check if done
    if (parsed.done && parsed.result) {
      return parsed.result as ActFindings;
    }

    // Execute tool call
    if (parsed.tool) {
      messages.push({ role: "assistant", content: JSON.stringify(parsed) });

      const toolResult = await executeActTool(parsed.tool, parsed.args ?? {});
      messages.push({ role: "user", content: `[Tool result: ${parsed.tool}]\n${toolResult}` });
      console.log(`    🔧 [act:${parsed.tool}] ${summarizeToolCall(parsed.tool, parsed.args)}`);
      continue;
    }

    // Neither done nor tool call
    messages.push({ role: "assistant", content: response });
    messages.push({ role: "user", content: "Please either call a tool or return your result." });
  }

  // Max rounds reached — force completion
  messages.push({
    role: "user",
    content: "You've reached the execution limit. Return your result now based on what you've accomplished so far. Respond with {\"done\": true, \"result\": {...}}",
  });

  const finalResponse = await callLLM(
    messages as any,
    { model: CONFIG.evaluatorModel, temperature: 0.1 }
  );

  try {
    const parsed = JSON.parse(extractJson(finalResponse));
    if (parsed.result) return parsed.result as ActFindings;
    if (parsed.done && parsed.result) return parsed.result as ActFindings;
  } catch {}

  return {
    summary: "Execution reached iteration limit without structured result.",
    changes: [],
    verified: false,
  };
}

async function executeActTool(
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
      return result.slice(0, MAX_OUTPUT_CHARS);
    } catch (e: any) {
      return `Error: ${e.message}`;
    }
  }

  if (tool === "writeFile") {
    try {
      const path = args.path as string;
      const content = args.content as string;
      await Bun.write(path, content);
      return `Written ${content.length} bytes to ${path}`;
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
      const timeout = setTimeout(() => proc.kill(), 30000);
      const exitCode = await proc.exited;
      clearTimeout(timeout);

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const full = stdout + (stderr ? `\nSTDERR: ${stderr}` : "");
      if (full.length > MAX_OUTPUT_CHARS) {
        return `[${full.split("\n").length} lines, ${full.length} chars — truncated]\n${full.slice(0, MAX_OUTPUT_CHARS)}`;
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
  if (tool === "writeFile") return `${args.path} (${String(args.content).length} bytes)`;
  if (tool === "bash") return String(args.command).slice(0, 100);
  return JSON.stringify(args).slice(0, 100);
}

export function formatActForWorkingMemory(
  task: string,
  findings: ActFindings
): string {
  const changes = findings.changes.length > 0 ? findings.changes.join(", ") : "none";
  return `[act] Executed: "${task}"\nChanges: ${changes}\nVerified: ${findings.verified}\nSummary: ${findings.summary}`;
}

export async function writeActToScratch(
  sessionId: string,
  findings: ActFindings
): Promise<void> {
  await writeScratch(sessionId, "action_result", `[act] ${findings.summary} | Changes: ${findings.changes.join(", ") || "none"} | Verified: ${findings.verified}`);
}
