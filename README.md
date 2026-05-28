# brain

A deliberation engine for autonomous agents.

> **Status:** research prototype. APIs, schemas, and architecture will change without notice. Not production-ready.

## What this is

AI coding agents fail in a consistent way: they're **overconfident and under-deliberative.** They take the first plausible path, commit immediately, and never look back. When an early assumption turns out to be wrong, every downstream decision compounds the error silently.

This project is an attempt to build a layer that wraps around any agent and forces it to reason with rigor — before, during, and after execution. It implements seven operations as a continuous loop:

1. **Sense** the current state of the world.
2. **Explore** the problem space — surface perspectives, constraints, prior lessons.
3. **Commit** to an approach with explicit assumptions and recorded alternatives.
4. **Plan** an ordered sequence of steps whose preconditions reference those assumptions.
5. **Validate** at every step — not just "does it work" but "do our assumptions still hold?"
6. **Propagate** corrections through the decision graph when an assumption breaks.
7. **Converge** when the expected value of more deliberation is less than the cost.

The deliberation loop maps directly to well-characterized neural circuits (active inference, default mode network, anterior PFC, hippocampus, ACC). See [docs/01-vision.md](docs/01-vision.md) for the full framing and [docs/02-architecture.md](docs/02-architecture.md) for the implementation.

## Quick start

Requires [Bun](https://bun.com) >= 1.3 and [Ollama](https://ollama.com) running locally with the `nomic-embed-text` model pulled for embeddings.

```bash
git clone https://github.com/hancockmh/brain.git
cd brain
bun install
cp .env.example .env
# edit .env and set OPENAI_API_KEY
ollama pull nomic-embed-text
bun run src/index.ts
```

## Configuration

All runtime config is read from environment variables. Bun auto-loads `.env`. See [`.env.example`](.env.example) for the full list; the essentials:

| Variable | Default | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | — | Required for reasoning LLM calls |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | OpenAI-compatible endpoint (e.g. a local proxy) |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Embedding endpoint |
| `BRAIN_MODEL` | `gpt-5.2` | Reasoning model |
| `BRAIN_DB_PATH` | `file:brain.db` | SQLite knowledge graph |

## Repository layout

```
src/            Core engine — sense, graph, PFC loop, dreamer, evaluator, effectors
app/            Demo apps (simple-chat)
evals/          Scenario-based evaluation harness — see evals/README.md
docs/           Vision, architecture, design docs
```

## Running tests

```bash
bun test
```

## Running evaluations

```bash
bun run evals/run-eval.ts <scenario-id>
bun run evals/run-all.ts
```

See [evals/README.md](evals/README.md) for the scoring rubric and scenario taxonomy.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
