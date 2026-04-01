// setup.ts — copies staged context files to their expected locations
import { mkdirSync, copyFileSync, rmSync } from "fs";
import { join, dirname } from "path";

const CONTEXT_DIR = join(import.meta.dir, "context");

const files: Array<{ src: string; dest: string }> = [
  { src: "sprint-data.json", dest: "/tmp/brain-eval-c04/sprint-data.json" },
  { src: "incidents.json", dest: "/tmp/brain-eval-c04/incidents.json" },
  { src: "cost-data.json", dest: "/tmp/brain-eval-c04/cost-data.json" },
  { src: "q2-planning.json", dest: "/tmp/brain-eval-c04/q2-planning.json" },
];

export function setup() {
  for (const { src, dest } of files) {
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(join(CONTEXT_DIR, src), dest);
  }
}

export function teardown() {
  try {
    rmSync("/tmp/brain-eval-c04", { recursive: true });
  } catch {}
}
