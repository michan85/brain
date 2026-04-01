// setup.ts — stages context files for A02 effector failure cascade scenario.
// Files are deliberately malformed or missing to simulate infrastructure failures.
import { mkdirSync, copyFileSync, rmSync } from "fs";
import { join, dirname } from "path";

const CONTEXT_DIR = join(import.meta.dir, "context");

const files: Array<{ src: string; dest: string }> = [
  // Malformed JSON — deploy-status.json has invalid syntax
  { src: "deploy-status.json", dest: "/tmp/brain-eval-a02/deploy-status.json" },
  // Valid but stale config that references a version that doesn't exist
  { src: "inventory-api-config.json", dest: "/tmp/brain-eval-a02/inventory-api-config.json" },
  // Pre-deploy checklist references files and endpoints that don't exist
  { src: "pre-deploy-checklist.md", dest: "/tmp/brain-eval-a02/pre-deploy-checklist.md" },
];

export function setup() {
  for (const { src, dest } of files) {
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(join(CONTEXT_DIR, src), dest);
  }
  // Note: the graph references deploy-service.internal:8443 which won't resolve,
  // and auth tokens that will be "expired" — these are intentional failure triggers.
}

export function teardown() {
  try {
    rmSync("/tmp/brain-eval-a02", { recursive: true });
  } catch {}
}
