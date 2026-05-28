import { senseEffector } from "./sense";
import { actEffector } from "./act";
import { deliberateEffector } from "./deliberate";
import type { EffectorResult } from "./types";

type EffectorFn = (payload: unknown) => Promise<EffectorResult>;

const effectors: Record<string, EffectorFn> = {
  respond: respondEffector,
  sense: senseEffector,
  act: actEffector,
  deliberate: deliberateEffector,
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
