export const CONFIG = {
  // LLM (via Codex OAuth proxy)
  llmBaseUrl: "http://127.0.0.1:10531/v1",
  reasoningModel: "gpt-5.2",
  evaluatorModel: "gpt-5.1-codex-mini",
  // Embeddings via local Ollama (nomic-embed-text)
  embeddingBaseUrl: "http://localhost:11434",
  embeddingModel: "nomic-embed-text",
  embeddingDimensions: 768,

  // Graph activation
  seedLimit: 10,
  spreadHops: 2,
  decayFactor: 0.5,
  minActivationThreshold: 0.1,
  maxObservationsPerNode: 5,

  // PFC Loop
  maxIterations: 5,
  maxWorkingMemoryThoughts: 10,

  // Database
  dbPath: "file:brain.db",
} as const;
