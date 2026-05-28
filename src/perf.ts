interface Span {
  name: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  metadata?: Record<string, unknown>;
}

// Global spans array
const spans: Span[] = [];

/**
 * Start a span. Returns a function to end it.
 * Call the returned function with optional extra metadata to close the span.
 */
export function startSpan(
  name: string,
  metadata?: Record<string, unknown>
): (endMetadata?: Record<string, unknown>) => void {
  const startMs = performance.now();
  return (endMetadata?: Record<string, unknown>) => {
    const endMs = performance.now();
    spans.push({
      name,
      startMs,
      endMs,
      durationMs: endMs - startMs,
      metadata: metadata || endMetadata
        ? { ...metadata, ...endMetadata }
        : undefined,
    });
  };
}

/** Write all collected spans to a JSON file with a summary header. */
export async function writePerf(path: string): Promise<void> {
  const sorted = [...spans].sort((a, b) => a.startMs - b.startMs);

  const summary: Record<
    string,
    { count: number; totalMs: number; avgMs: number; maxMs: number; minMs: number }
  > = {};

  for (const s of sorted) {
    if (!summary[s.name]) {
      summary[s.name] = { count: 0, totalMs: 0, avgMs: 0, maxMs: 0, minMs: Infinity };
    }
    const entry = summary[s.name]!;
    entry.count++;
    entry.totalMs += s.durationMs;
    entry.maxMs = Math.max(entry.maxMs, s.durationMs);
    entry.minMs = Math.min(entry.minMs, s.durationMs);
    entry.avgMs = entry.totalMs / entry.count;
  }

  // Round numeric values for readability
  for (const key of Object.keys(summary)) {
    const e = summary[key]!;
    e.totalMs = Math.round(e.totalMs * 100) / 100;
    e.avgMs = Math.round(e.avgMs * 100) / 100;
    e.maxMs = Math.round(e.maxMs * 100) / 100;
    e.minMs = Math.round(e.minMs * 100) / 100;
  }

  await Bun.write(path, JSON.stringify({ summary, spans: sorted }, null, 2));
}

/** Get all recorded spans (read-only snapshot). */
export function getSpans(): Span[] {
  return spans;
}

/** Clear all recorded spans. */
export function clearSpans(): void {
  spans.length = 0;
}
