export const CONFIG = {
  // LLM (via Codex OAuth proxy)
  llmBaseUrl: "http://127.0.0.1:10531/v1",
  reasoningModel: process.env.BRAIN_MODEL ?? "gpt-5.2",
  evaluatorModel: process.env.BRAIN_EVALUATOR_MODEL ?? "gpt-5.1-codex-mini",
  temperature: parseFloat(process.env.BRAIN_TEMPERATURE ?? "0.3"),
  // Embeddings via local Ollama (nomic-embed-text)
  embeddingBaseUrl: "http://localhost:11434",
  embeddingModel: process.env.BRAIN_EMBED_MODEL ?? "nomic-embed-text",
  embeddingDimensions: 768,

  // Graph activation
  seedLimit: 10,
  spreadHops: 2,
  decayFactor: 0.5,
  minActivationThreshold: 0.1,
  maxObservationsPerNode: 5,

  // PFC Loop
  maxIterations: parseInt(process.env.BRAIN_MAX_ITERATIONS ?? "10", 10),
  maxWorkingMemoryThoughts: 10,

  // Database
  dbPath: process.env.BRAIN_DB_PATH ?? "file:brain.db",

  // Logging
  logDir: process.env.BRAIN_LOG_DIR ?? "",
};
