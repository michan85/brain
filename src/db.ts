import { createClient, type Client } from "@libsql/client";
import { CONFIG } from "./config";

let db: Client;

export async function initDb(): Promise<Client> {
  db = createClient({ url: CONFIG.dbPath });

  await db.batch(
    [
      `CREATE TABLE IF NOT EXISTS nodes (
        id         TEXT PRIMARY KEY,
        type       TEXT NOT NULL,
        name       TEXT NOT NULL,
        metadata   TEXT DEFAULT '{}',
        created_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS observations (
        id         TEXT PRIMARY KEY,
        node_id    TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
        content    TEXT NOT NULL,
        embedding  F32_BLOB(${CONFIG.embeddingDimensions}),
        created_at INTEGER NOT NULL
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
      `CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type)`,
      `CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name)`,
      `CREATE INDEX IF NOT EXISTS idx_observations_node ON observations(node_id)`,
      `CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id)`,
      `CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id)`,
      `CREATE INDEX IF NOT EXISTS idx_obs_vec ON observations(libsql_vector_idx(embedding, 'metric=cosine'))`,
    ],
    "write"
  );

  return db;
}

export function getDb(): Client {
  if (!db) throw new Error("Database not initialized — call initDb() first");
  return db;
}
