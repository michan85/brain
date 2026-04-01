import { generateId, now } from "./utils";
import type { ScratchEntry } from "./types";

const traces: ScratchEntry[] = [];

export function writeScratch(
  sessionId: string,
  type: ScratchEntry["type"],
  content: string
): string {
  const id = generateId();
  traces.push({ id, sessionId, timestamp: now(), type, content });
  return id;
}

export function readScratch(sessionId: string): ScratchEntry[] {
  return traces.filter((t) => t.sessionId === sessionId);
}

export function clearScratch(sessionId: string): void {
  const toRemove = new Set(
    traces.filter((t) => t.sessionId === sessionId).map((t) => t.id)
  );
  for (let i = traces.length - 1; i >= 0; i--) {
    if (toRemove.has(traces[i]!.id)) traces.splice(i, 1);
  }
}
