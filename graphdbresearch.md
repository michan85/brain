# Graph + Vector Database Evaluation

Research for the brain-inspired agent architecture's storage layer.

## Problem Statement

The architecture requires a single storage system that supports both **graph structure** (nodes, edges, multi-hop traversal) and **vector search** (cosine similarity over 1536-dimensional OpenAI embeddings). The retrieval pattern is spreading activation: find seed nodes via vector similarity, then traverse the graph outward with decaying activation.

### Requirements

- **Embeddable / lightweight** — no separate server process, runs in the same Node.js process or as a local file
- **TypeScript-friendly** — first-class JS/TS SDK, not a Python-first afterthought
- **Scale target** — 10k-100k entity nodes, 100k-1M observation nodes, sub-100ms activation queries
- **Persistence** — durable to disk, survives restarts
- **Graph traversal** — multi-hop with decay, not just flat key-value lookup
- **Vector ANN** — approximate nearest neighbor search; brute-force is too slow past ~50k rows

---

## Options Evaluated

### 1. libSQL (Turso's SQLite fork) — RECOMMENDED

**What it is.** Turso's open-source fork of SQLite. Adds native vector search (DiskANN-based ANN indexing), `vector_top_k()` virtual table function, and all the standard SQLite relational machinery. Ships as a single embeddable library.

**Graph capability.** Graph structure is modeled with relational tables (nodes, edges, observations) and queried with recursive CTEs. This is not native graph syntax, but recursive CTEs are well-understood, performant in SQLite, and sufficient for 2-4 hop traversal with decay.

**Vector capability.** Native `vector(1536)` column type with DiskANN-based indexing. `vector_top_k('idx_name', query_vector, k)` returns approximate nearest neighbors. Cosine distance supported. Handles 1M+ vectors efficiently.

**Embeddable?** Yes. `@libsql/client` with `file:` URL opens a local database file. Zero server processes. ~10MB overhead.

**TS SDK quality.** `@libsql/client` is Turso's official SDK, actively maintained. Works with Drizzle ORM for typed schema management and migrations. Drizzle has first-class libSQL support.

**Maturity.** SQLite foundation is the most battle-tested embedded database in existence. libSQL's vector extensions are newer (2024) but backed by Turso's commercial product and active development. Turso published a blog post specifically about building personal knowledge graphs with libSQL, which maps almost exactly to our use case.

**Verdict.** Best fit. Embeddable, fast ANN, graph via CTEs, excellent TS tooling, tiny footprint.

### 2. SurrealDB 3.0 — Strong Alternative

**What it is.** Multi-model database: document store + graph + vector in one engine. Native graph traversal with arrow syntax (`->edge->node`). HNSW vector indexing. Markets itself as the "context layer for AI agents."

**Graph capability.** First-class. `RELATE` creates edges, `->` and `<-` syntax for traversal. Native graph primitives, no CTE workarounds needed. Record links give direct node-to-node references.

**Vector capability.** HNSW vector indexing added in 2.x, maturing in 3.0. Supports cosine, euclidean, and other distance metrics on high-dimensional vectors.

**Embeddable?** Partially. `@surrealdb/node` bundles the Rust engine and can run in-process. But the engine is ~161MB, which is heavy for an embedded use case. Startup time is noticeable.

**TS SDK quality.** `@surrealdb/node` is official. The API is reasonable but uses SurrealQL (a proprietary query language), not SQL. Less community tooling, no Drizzle equivalent. Query strings are not type-checked.

**Maturity.** Younger ecosystem. SurrealDB has pivoted scope several times. The 3.0 release is promising but the community is smaller than SQLite's by orders of magnitude. Breaking changes between major versions have been common.

**Verdict.** The best developer experience for graph queries. The arrow syntax is genuinely nice. But the 161MB engine size, proprietary query language, and younger ecosystem make it a riskier choice. Strong fallback if recursive CTEs in libSQL become unmanageable.

### 3. SQLite + sqlite-vec — Conservative Choice

**What it is.** Standard SQLite with Alex Garcia's `sqlite-vec` extension for vector operations.

**Graph capability.** Same as libSQL — relational tables with recursive CTEs.

**Vector capability.** `sqlite-vec` provides vector column types and distance functions, but uses **brute-force search only** (no ANN index). Every query scans all vectors. The `vectorlite` extension adds HNSW indexing but is less maintained and harder to install.

**Embeddable?** Yes, it is SQLite.

**TS SDK quality.** `better-sqlite3` is excellent. Drizzle supports it.

**Maturity.** SQLite is maximally mature. `sqlite-vec` is actively maintained by one developer (Alex Garcia) but does not have corporate backing.

**Verdict.** Works for prototyping at small scale. Brute-force vector search becomes a bottleneck past ~50k observations. libSQL gets you the same SQLite foundation with real ANN indexing.

### 4. Neo4j — Too Heavy

**What it is.** The gold standard graph database. Property graph model, Cypher query language, vector indexes added in 5.x.

**Graph capability.** Best in class. Cypher is the most expressive graph query language available.

**Vector capability.** Native vector indexes with ANN search. Works well.

**Embeddable?** No. Requires a JVM server process. 512MB+ RAM baseline. Neo4j Embedded exists but is Java-only.

**TS SDK quality.** `neo4j-driver` is solid but assumes a client-server architecture.

**Maturity.** Very mature. Production-proven at massive scale.

**Verdict.** Overkill. The JVM requirement and server process disqualify it for an embedded architecture. If we ever need to scale to millions of nodes with complex graph analytics, this is where we'd migrate.

### 5. FalkorDB — No Embedded JS

**What it is.** Graph database (formerly RedisGraph) with vector support. Cypher-compatible.

**Graph capability.** Good. Cypher support, optimized for graph traversal.

**Vector capability.** Vector similarity search supported.

**Embeddable?** No. Requires a Redis server. FalkorDBLite exists but is Python-only — no JavaScript/TypeScript embedded option.

**TS SDK quality.** Client library exists but assumes Redis connection.

**Maturity.** Moderate. Smaller community than Neo4j.

**Verdict.** Disqualified by the Redis server requirement and lack of embedded JS support.

### 6. Kuzu — Acquired, Unavailable

**What it is.** Was an embeddable graph database with Cypher support, vector search, and a Node.js binding. Almost ideal for this use case.

**What happened.** Apple acquired Kuzu in October 2025. The npm package is deprecated. The RyuGraph community fork exists but has not published npm packages yet.

**Verdict.** Dead option for now. If RyuGraph publishes a stable npm package, it would be worth re-evaluating. The architecture (embeddable, Cypher, vector, JS bindings) was exactly what we need.

### 7. DuckDB — Wrong Tool

**What it is.** Embeddable analytical (OLAP) database. Excellent for columnar analytics, not designed for graph workloads.

**Graph capability.** No graph primitives. Recursive CTEs exist but DuckDB's optimizer is tuned for analytical scans, not graph traversal patterns.

**Vector capability.** VSS extension is experimental. Not production-ready.

**Verdict.** Wrong tool for this job. DuckDB excels at analytics over large datasets, not graph traversal with vector search.

### 8. LanceDB — No Graph

**What it is.** Embeddable vector database built on Lance columnar format. Excellent for vector search and multi-modal data.

**Graph capability.** None. Pure vector store. No relational joins, no graph traversal.

**Vector capability.** Best-in-class for pure vector workloads. IVF-PQ indexing, fast ANN search.

**Verdict.** Would need to be paired with a separate graph store, defeating the single-system goal.

### 9. Custom In-Memory Store

**What it is.** Hand-rolled Map/Set structures in TypeScript with a vector index library (e.g., `hnswlib-node`).

**Graph capability.** Whatever we build. Full control.

**Vector capability.** Whatever we build. Libraries like `hnswlib-node` provide ANN.

**Embeddable?** By definition.

**Verdict.** Fine for prototyping. No persistence (or we build our own serialization), memory-bound (100k nodes with 1536-dim embeddings is ~600MB in RAM), and every feature is our maintenance burden. Not viable for production.

---

## Decision

**Primary: libSQL.** It gives us embeddable SQLite with real ANN vector search and graph-via-CTEs in a single file database. The TypeScript toolchain (libsql/client + Drizzle) is mature. The footprint is tiny.

**Fallback: SurrealDB.** If recursive CTEs for graph traversal become painful to write and maintain (deeply nested multi-hop queries, complex edge filtering), SurrealDB's native graph syntax would be worth the tradeoffs.

**Abstraction layer.** The `GraphActivationService` interface abstracts the storage backend. The PFC loop and other components call `activate(query, options)` and get back activated subgraphs. Swapping libSQL for SurrealDB (or a future Kuzu/RyuGraph) requires implementing one interface, not rewriting the architecture.

---

## Implementation: Schema and Query Patterns

### Table Schema (libSQL)

```sql
-- Entity nodes (people, projects, concepts, etc.)
CREATE TABLE nodes (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL,           -- 'person', 'project', 'concept', ...
  name        TEXT NOT NULL,
  metadata    TEXT,                     -- JSON blob for flexible attributes
  embedding   F32_BLOB(1536),          -- aggregated embedding for the node
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_nodes_type ON nodes(type);
CREATE INDEX idx_nodes_embedding ON vector_top_k(nodes, embedding);

-- Observations: atomic facts attached to nodes
CREATE TABLE observations (
  id          TEXT PRIMARY KEY,
  node_id     TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  embedding   F32_BLOB(1536),          -- embedding of this observation's content
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_observations_node ON observations(node_id);
CREATE INDEX idx_observations_embedding ON vector_top_k(observations, embedding);

-- Edges: typed, weighted relationships between nodes
CREATE TABLE edges (
  id          TEXT PRIMARY KEY,
  source_id   TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  target_id   TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,           -- 'works_on', 'related_to', 'depends_on', ...
  weight      REAL NOT NULL DEFAULT 1.0,
  metadata    TEXT,                     -- JSON blob
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_edges_source ON edges(source_id);
CREATE INDEX idx_edges_target ON edges(target_id);
CREATE INDEX idx_edges_type ON edges(type);
```

### Spreading Activation Query Pattern

Activation happens in two steps, matching the hippocampal retrieval model from the architecture.

**Step 1: Vector search for seed nodes.** Find the top-k observations most similar to the input query embedding, then resolve their parent nodes.

```sql
-- Find seed nodes via vector similarity on observations
SELECT DISTINCT
  n.id,
  n.type,
  n.name,
  MIN(o.distance) AS activation  -- closest observation = strongest activation
FROM vector_top_k('idx_observations_embedding', :query_embedding, 20) AS vt
JOIN observations o ON o.id = vt.id
JOIN nodes n ON n.id = o.node_id
GROUP BY n.id
ORDER BY activation ASC
LIMIT 10;
```

**Step 2: Graph traversal with decay.** Starting from seed nodes, traverse edges outward with exponentially decaying activation. This is the spreading activation pass.

```sql
-- Spreading activation via recursive CTE
WITH RECURSIVE activated(id, type, name, depth, activation) AS (
  -- Base case: seed nodes from vector search (passed as parameter)
  SELECT id, type, name, 0 AS depth, activation
  FROM seed_nodes  -- temp table or CTE from Step 1

  UNION ALL

  -- Recursive case: traverse edges with decay
  SELECT
    n.id,
    n.type,
    n.name,
    a.depth + 1,
    a.activation * e.weight * :decay_factor  -- e.g., decay_factor = 0.5
  FROM activated a
  JOIN edges e ON e.source_id = a.id
  JOIN nodes n ON n.id = e.target_id
  WHERE a.depth < :max_depth                  -- e.g., max_depth = 3
    AND a.activation * e.weight * :decay_factor > :min_activation  -- prune weak signals
    AND n.id NOT IN (SELECT id FROM activated)  -- prevent cycles
)
SELECT id, type, name, MIN(depth) AS depth, MAX(activation) AS activation
FROM activated
GROUP BY id
ORDER BY activation DESC;
```

In practice, these two queries run in sequence inside a single `GraphActivationService.activate()` call. The seed results from Step 1 feed into Step 2 as the base case of the recursive CTE. The final result is a ranked list of activated nodes — the "subgraph" that gets loaded into working memory for the PFC loop.

### Performance Notes

- DiskANN index on 1M 1536-dim vectors: sub-10ms top-k retrieval (Turso benchmarks)
- Recursive CTE with 3-hop max depth over 100k nodes: typically <50ms with proper indexing
- Total activation query: expect <100ms for the full two-step pattern
- Database file size: ~2-4GB for 100k nodes with 1M observations (dominated by embedding storage)
