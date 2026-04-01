// setup.ts — copies staged context files to their expected locations
import { mkdirSync, copyFileSync, rmSync } from "fs";
import { join, dirname } from "path";

const CONTEXT_DIR = join(import.meta.dir, "context");

const files: Array<{ src: string; dest: string }> = [
  { src: "deploy-log-1.json", dest: "/tmp/brain-eval-c02/deploy-log-1.json" },
  { src: "deploy-log-2.json", dest: "/tmp/brain-eval-c02/deploy-log-2.json" },
  { src: "order-mapper.ts", dest: "/tmp/brain-eval-c02/src/mappers/order-mapper.ts" },
];

export function setup() {
  for (const { src, dest } of files) {
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(join(CONTEXT_DIR, src), dest);
  }
}

export function teardown() {
  try {
    rmSync("/tmp/brain-eval-c02", { recursive: true });
  } catch {}
}
