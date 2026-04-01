// setup.ts — prepares the target directory and ensures no pre-existing output file
import { mkdirSync, rmSync } from "fs";

export function setup() {
  mkdirSync("/tmp/brain-eval-s07", { recursive: true });
  try {
    rmSync("/tmp/brain-eval-s07/hello.txt");
  } catch {}
}

export function teardown() {
  try {
    rmSync("/tmp/brain-eval-s07", { recursive: true });
  } catch {}
}
