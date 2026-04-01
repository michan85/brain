import { senseEffector } from "./sense";
import type { EffectorResult } from "./types";

type EffectorFn = (payload: unknown) => Promise<EffectorResult>;

const effectors: Record<string, EffectorFn> = {
  respond: respondEffector,
  readFile: readFileEffector,
  writeFile: writeFileEffector,
  bash: bashEffector,
  sense: senseEffector,
};

export async function executeEffector(
  id: string,
  payload: unknown
): Promise<EffectorResult> {
  const fn = effectors[id];
  if (!fn) {
    return {
      success: false,
      data: null,
      error: `Unknown effector: ${id}`,
      durationMs: 0,
    };
  }
  return fn(payload);
}

async function respondEffector(payload: unknown): Promise<EffectorResult> {
  const start = performance.now();
  const message = typeof payload === "string" ? payload : (payload as any)?.message ?? String(payload);
  return {
    success: true,
    data: message,
    durationMs: performance.now() - start,
  };
}

async function readFileEffector(payload: unknown): Promise<EffectorResult> {
  const start = performance.now();
  try {
    const { path, offset, limit } = payload as { path: string; offset?: number; limit?: number };
    const content = await Bun.file(path).text();
    const lines = content.split("\n");
    const totalLines = lines.length;
    const totalChars = content.length;

    const startLine = offset ?? 0;
    const lineLimit = limit ?? 500;
    const selectedLines = lines.slice(startLine, startLine + lineLimit);
    const chunk = selectedLines.join("\n");
    const hasMore = startLine + lineLimit < totalLines;

    let result = chunk;
    if (hasMore || startLine > 0) {
      result = `[File: ${path} | ${totalLines} lines, ${totalChars} chars | Showing lines ${startLine + 1}-${Math.min(startLine + lineLimit, totalLines)} of ${totalLines}]\n${hasMore ? `[Use offset: ${startLine + lineLimit} to read more]\n` : ""}\n${chunk}`;
    }

    return {
      success: true,
      data: result,
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

async function writeFileEffector(payload: unknown): Promise<EffectorResult> {
  const start = performance.now();
  try {
    const { path, content } = payload as { path: string; content: string };
    await Bun.write(path, content);
    return {
      success: true,
      data: `Written ${content.length} bytes to ${path}`,
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

// Cache last bash output so the agent can page through it
let lastBashOutput: { command: string; lines: string[]; full: string } | null = null;

async function bashEffector(payload: unknown): Promise<EffectorResult> {
  const start = performance.now();
  const MAX_LINES = 200;
  try {
    const { command, offset, limit } = payload as {
      command?: string;
      offset?: number;
      limit?: number;
    };

    // If paging through previous output
    if (!command && lastBashOutput && offset !== undefined) {
      const lineLimit = limit ?? MAX_LINES;
      const startLine = offset;
      const selected = lastBashOutput.lines.slice(startLine, startLine + lineLimit);
      const hasMore = startLine + lineLimit < lastBashOutput.lines.length;
      const data = `[Previous command: ${lastBashOutput.command} | ${lastBashOutput.lines.length} lines | Showing lines ${startLine + 1}-${Math.min(startLine + lineLimit, lastBashOutput.lines.length)}]\n${hasMore ? `[Use offset: ${startLine + lineLimit} to read more]\n` : ""}\n${selected.join("\n")}`;
      return { success: true, data, durationMs: performance.now() - start };
    }

    if (!command) {
      return { success: false, data: null, error: "No command provided", durationMs: 0 };
    }

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
    const lines = full.split("\n");

    // Cache for paging
    lastBashOutput = { command, lines, full };

    let data: string;
    const lineLimit = limit ?? MAX_LINES;
    const startLine = offset ?? 0;

    if (lines.length > lineLimit) {
      const selected = lines.slice(startLine, startLine + lineLimit);
      const hasMore = startLine + lineLimit < lines.length;
      data = `[Command output: ${lines.length} lines, ${full.length} chars | Showing lines ${startLine + 1}-${Math.min(startLine + lineLimit, lines.length)} of ${lines.length}]\n${hasMore ? `[Use bash effector with offset: ${startLine + lineLimit} (no command) to page through more]\n` : ""}\n${selected.join("\n")}`;
    } else {
      data = full;
    }

    return {
      success: exitCode === 0,
      data,
      error: exitCode !== 0 ? `Exit code: ${exitCode}` : undefined,
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
