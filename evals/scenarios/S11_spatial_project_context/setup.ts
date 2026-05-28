import { mkdir, rm } from "node:fs/promises";

const BASE = "/tmp/brain-eval-s11/ledger";

const packageJson = {
  name: "ledger",
  version: "0.9.0",
  description: "Budget tracking application for small businesses and freelancers",
  module: "src/index.ts",
  type: "module",
  private: true,
};

export async function setup() {
  await mkdir(BASE, { recursive: true });
  await Bun.write(`${BASE}/package.json`, JSON.stringify(packageJson, null, 2));
}

export async function teardown() {
  await rm("/tmp/brain-eval-s11", { recursive: true, force: true });
}

/**
 * The harness should set the agent's working directory to this path
 * before running the loop, so the spatial sensor reads it as cwd.
 */
export const cwd = BASE;
