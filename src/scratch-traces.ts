import { getDb } from "./db";
import { generateId, now } from "./utils";
import type { ScratchTrace, ScratchTraceType, EvaluatorAnnotation } from "./types";

// --- Write ---

export async function writeScratch(
  sessionId: string,
  type: ScratchTraceType,
  content: string,
  opts?: {
    loopIterationId?: string;
    evaluatorAnnotation?: EvaluatorAnnotation;
    relatedNodeIds?: string[];
  }
): Promise<string> {
  const db = getDb();
  const id = generateId();
  const timestamp = now();

  await db.execute({
    sql: `INSERT INTO scratch_traces
          (id, session_id, loop_iteration_id, timestamp, type, content, evaluator_annotation, related_node_ids, consolidated)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    args: [
      id,
      sessionId,
      opts?.loopIterationId ?? "",
      timestamp,
      type,
      content,
      opts?.evaluatorAnnotation ? JSON.stringify(opts.evaluatorAnnotation) : null,
      JSON.stringify(opts?.relatedNodeIds ?? []),
    ],
  });

  return id;
}

// --- Read ---

export async function readScratch(sessionId: string): Promise<ScratchTrace[]> {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM scratch_traces WHERE session_id = ? ORDER BY timestamp ASC",
    args: [sessionId],
  });
  return result.rows.map(rowToTrace);
}

export async function readUnconsolidated(opts?: {
  limit?: number;
  type?: ScratchTraceType;
}): Promise<ScratchTrace[]> {
  const db = getDb();
  let sql = "SELECT * FROM scratch_traces WHERE consolidated = 0";
  const args: (string | number | null)[] = [];

  if (opts?.type) {
    sql += " AND type = ?";
    args.push(opts.type);
  }

  sql += " ORDER BY timestamp ASC";

  if (opts?.limit) {
    sql += " LIMIT ?";
    args.push(opts.limit);
  }

  const result = await db.execute({ sql, args });
  return result.rows.map(rowToTrace);
}

// --- Update ---

export async function markConsolidated(traceIds: string[]): Promise<void> {
  if (traceIds.length === 0) return;
  const db = getDb();
  const placeholders = traceIds.map(() => "?").join(",");
  await db.execute({
    sql: `UPDATE scratch_traces SET consolidated = 1 WHERE id IN (${placeholders})`,
    args: traceIds,
  });
}

export async function annotateTrace(
  traceId: string,
  annotation: EvaluatorAnnotation
): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: "UPDATE scratch_traces SET evaluator_annotation = ? WHERE id = ?",
    args: [JSON.stringify(annotation), traceId],
  });
}

// --- Delete ---

export async function clearScratch(sessionId: string): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: "DELETE FROM scratch_traces WHERE session_id = ?",
    args: [sessionId],
  });
}

// --- Helpers ---

function rowToTrace(row: Record<string, unknown>): ScratchTrace {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    loopIterationId: row.loop_iteration_id as string,
    timestamp: row.timestamp as number,
    type: row.type as ScratchTraceType,
    content: row.content as string,
    evaluatorAnnotation: row.evaluator_annotation
      ? JSON.parse(row.evaluator_annotation as string)
      : undefined,
    relatedNodeIds: JSON.parse((row.related_node_ids as string) || "[]"),
    consolidated: Boolean(row.consolidated),
  };
}
