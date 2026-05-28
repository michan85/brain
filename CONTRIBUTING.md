# Contributing

## Status

This is a research prototype. Internals and APIs will change without notice.
There is no stability guarantee, no deprecation policy, and no support SLA.

## Requirements

- [Bun](https://bun.sh) >= 1.3
- [Ollama](https://ollama.com) running locally with the `nomic-embed-text` model
  pulled (`ollama pull nomic-embed-text`). Required for embeddings.
- An OpenAI API key (or a compatible endpoint).

## Setup

```sh
git clone <repo-url> brain
cd brain
bun install
cp .env.example .env
# Edit .env and set OPENAI_API_KEY
```

See `.env.example` for the full list of supported variables (model selection,
base URLs, DB path, sampling temperature).

## Running

Entry point:

```sh
bun run src/index.ts
```

## Tests

```sh
bun test
```

Tests are unit-level and do not require an API key or a running Ollama.

## Evals

The evaluation framework lives under `evals/`. See `evals/README.md` for how
scenarios are structured, run, and graded. Note that LLM-driven evals require
`OPENAI_API_KEY` and a reachable Ollama endpoint.

## Issues

File issues on the GitHub repository. Include the scenario, command, and
relevant trajectory output where applicable.
