// setup.ts — copies staged context files to their expected locations
import { mkdirSync, copyFileSync, rmSync } from "fs";
import { join, dirname } from "path";

const CONTEXT_DIR = join(import.meta.dir, "context");

const files: Array<{ src: string; dest: string }> = [
  { src: "infra/aws-cost-report.json", dest: "/tmp/brain-eval-c08/infra/aws-cost-report.json" },
  { src: "infra/ec2-inventory.json", dest: "/tmp/brain-eval-c08/infra/ec2-inventory.json" },
  { src: "infra/ecs-services.json", dest: "/tmp/brain-eval-c08/infra/ecs-services.json" },
  { src: "infra/rds-config.json", dest: "/tmp/brain-eval-c08/infra/rds-config.json" },
  { src: "infra/s3-buckets.json", dest: "/tmp/brain-eval-c08/infra/s3-buckets.json" },
  { src: "infra/architecture-notes.md", dest: "/tmp/brain-eval-c08/infra/architecture-notes.md" },
];

export function setup() {
  for (const { src, dest } of files) {
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(join(CONTEXT_DIR, src), dest);
  }
}

export function teardown() {
  try {
    rmSync("/tmp/brain-eval-c08", { recursive: true });
  } catch {}
}
