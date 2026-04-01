// setup.ts — copies staged context files to their expected locations
import { mkdirSync, copyFileSync, rmSync } from "fs";
import { join, dirname } from "path";

const CONTEXT_DIR = join(import.meta.dir, "context");

const files: Array<{ src: string; dest: string }> = [
  { src: "ci-status.json", dest: "/tmp/brain-eval-s03/ci-status.json" },
];

export function setup() {
  for (const { src, dest } of files) {
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(join(CONTEXT_DIR, src), dest);
  }
}

export function teardown() {
  for (const { dest } of files) {
    try {
      rmSync(dirname(dest), { recursive: true });
    } catch {}
  }
}
