import type { EffectorResult } from "./types";

type EffectorFn = (payload: unknown) => Promise<EffectorResult>;

const effectors: Record<string, EffectorFn> = {
  respond: respondEffector,
  readFile: readFileEffector,
  writeFile: writeFileEffector,
  bash: bashEffector,
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
    const { path } = payload as { path: string };
    const content = await Bun.file(path).text();
    return {
      success: true,
      data: content.slice(0, 10000), // Cap output
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

async function bashEffector(payload: unknown): Promise<EffectorResult> {
  const start = performance.now();
  try {
    const { command } = payload as { command: string };
    const proc = Bun.spawn(["bash", "-c", command], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const timeout = setTimeout(() => proc.kill(), 30000);
    const exitCode = await proc.exited;
    clearTimeout(timeout);

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();

    return {
      success: exitCode === 0,
      data: (stdout + (stderr ? `\nSTDERR: ${stderr}` : "")).slice(0, 10000),
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
