// setup.ts — copies incident context files for L05 Session 1 investigation
import { mkdirSync, copyFileSync, rmSync } from "fs";
import { join, dirname } from "path";

const CONTEXT_DIR = join(import.meta.dir, "context");

const files: Array<{ src: string; dest: string }> = [
  { src: "cloudwatch_metrics.json", dest: "/tmp/brain-eval-l05/cloudwatch_metrics.json" },
  { src: "deployment_log.json", dest: "/tmp/brain-eval-l05/deployment_log.json" },
  { src: "checkout_service_logs.txt", dest: "/tmp/brain-eval-l05/checkout_service_logs.txt" },
];

export function setup() {
  for (const { src, dest } of files) {
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(join(CONTEXT_DIR, src), dest);
  }
}

export function teardown() {
  try {
    rmSync("/tmp/brain-eval-l05", { recursive: true });
  } catch {}
}
