import { createClient, type Client } from "@libsql/client";
import { CONFIG } from "./config";

let db: Client;

export async function initDb(): Promise<Client> {
  db = createClient({ url: CONFIG.dbPath });

  await db.batch(
    [
      `CREATE TABLE IF NOT EXISTS nodes (
        id                TEXT PRIMARY KEY,
        type              TEXT NOT NULL,
        name              TEXT NOT NULL,
        metadata          TEXT DEFAULT '{}',
        created_at        INTEGER NOT NULL,
        last_activated_at INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE TABLE IF NOT EXISTS observations (
        id                TEXT PRIMARY KEY,
        node_id           TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
        content           TEXT NOT NULL,
        embedding         F32_BLOB(${CONFIG.embeddingDimensions}),
        confidence        REAL NOT NULL DEFAULT 1.0,
        created_at        INTEGER NOT NULL,
        last_activated_at INTEGER NOT NULL DEFAULT 0,
        superseded_by     TEXT REFERENCES observations(id)
      )`,
      `CREATE TABLE IF NOT EXISTS edges (
        id         TEXT PRIMARY KEY,
        source_id  TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
        target_id  TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
        relation   TEXT,
        weight     REAL NOT NULL DEFAULT 1.0,
        metadata   TEXT DEFAULT '{}',
        created_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS scratch_traces (
        id                  TEXT PRIMARY KEY,
        session_id          TEXT NOT NULL,
        loop_iteration_id   TEXT NOT NULL DEFAULT '',
        timestamp           INTEGER NOT NULL,
        type                TEXT NOT NULL,
        content             TEXT NOT NULL,
        evaluator_annotation TEXT,
        related_node_ids    TEXT DEFAULT '[]',
        consolidated        INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type)`,
      `CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name)`,
      `CREATE INDEX IF NOT EXISTS idx_observations_node ON observations(node_id)`,
      `CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id)`,
      `CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id)`,
      `CREATE INDEX IF NOT EXISTS idx_obs_vec ON observations(libsql_vector_idx(embedding, 'metric=cosine'))`,
      `CREATE INDEX IF NOT EXISTS idx_scratch_session ON scratch_traces(session_id)`,
      `CREATE INDEX IF NOT EXISTS idx_scratch_consolidated ON scratch_traces(consolidated)`,
      `CREATE INDEX IF NOT EXISTS idx_scratch_type ON scratch_traces(type)`,
    ],
    "write"
  );

  return db;
}

export function getDb(): Client {
  if (!db) throw new Error("Database not initialized — call initDb() first");
  return db;
}
