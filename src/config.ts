export const CONFIG = {
  // LLM (OpenAI-compatible endpoint; configurable via env)
  // Defaults to the public OpenAI API. To use a local Codex OAuth proxy, set
  // OPENAI_BASE_URL=http://127.0.0.1:10531/v1 and leave OPENAI_API_KEY unset.
  llmBaseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
  llmApiKey: process.env.OPENAI_API_KEY ?? "codex-oauth",
  reasoningModel: process.env.BRAIN_MODEL ?? "gpt-5.2",
  evaluatorModel: process.env.BRAIN_EVALUATOR_MODEL ?? "gpt-5.1-codex-mini",
  temperature: parseFloat(process.env.BRAIN_TEMPERATURE ?? "0.3"),
  // Embeddings via Ollama-compatible endpoint (nomic-embed-text by default)
  embeddingBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
  embeddingModel: process.env.BRAIN_EMBED_MODEL ?? "nomic-embed-text",
  embeddingDimensions: 768,

  // Graph activation
  seedLimit: 10,
  spreadHops: 2,
  decayFactor: 0.5,
  minActivationThreshold: 0.1,
  minSimilarityThreshold: parseFloat(process.env.BRAIN_MIN_SIMILARITY ?? "0.45"),
  maxObservationsPerNode: 5,
  recencyWeight: 0.2,
  edgeHalfLifeMs: parseInt(process.env.BRAIN_EDGE_HALF_LIFE_MS ?? String(30 * 24 * 60 * 60 * 1000), 10),

  // PFC Loop
  maxIterations: parseInt(process.env.BRAIN_MAX_ITERATIONS ?? "10", 10),
  maxWorkingMemoryThoughts: 10,
  compressionBatchSize: 4,
  driftThreshold: parseFloat(process.env.BRAIN_DRIFT_THRESHOLD ?? "0.4"),
  driftCheckInterval: parseInt(process.env.BRAIN_DRIFT_CHECK_INTERVAL ?? "3", 10),

  // Database
  dbPath: process.env.BRAIN_DB_PATH ?? "file:brain.db",

  // Logging
  logDir: process.env.BRAIN_LOG_DIR ?? "",
};
