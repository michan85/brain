// setup.ts — copies staged context files to their expected locations
import { mkdirSync, copyFileSync, rmSync } from "fs";
import { join, dirname } from "path";

const CONTEXT_DIR = join(import.meta.dir, "context");
const BASE_DEST = "/tmp/brain-eval-c07/ecommerce-app";

const files: Array<{ src: string; dest: string }> = [
  { src: "ecommerce-app/src/models/order.py", dest: `${BASE_DEST}/src/models/order.py` },
  { src: "ecommerce-app/src/models/user.py", dest: `${BASE_DEST}/src/models/user.py` },
  { src: "ecommerce-app/src/models/product.py", dest: `${BASE_DEST}/src/models/product.py` },
  { src: "ecommerce-app/src/db/schema.sql", dest: `${BASE_DEST}/src/db/schema.sql` },
  { src: "ecommerce-app/src/reports/dashboard_queries.sql", dest: `${BASE_DEST}/src/reports/dashboard_queries.sql` },
  { src: "ecommerce-app/tests/test_orders.py", dest: `${BASE_DEST}/tests/test_orders.py` },
  { src: "ecommerce-app/requirements.txt", dest: `${BASE_DEST}/requirements.txt` },
  { src: "ecommerce-app/docker-compose.yml", dest: `${BASE_DEST}/docker-compose.yml` },
];

export function setup() {
  for (const { src, dest } of files) {
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(join(CONTEXT_DIR, src), dest);
  }
}

export function teardown() {
  try {
    rmSync("/tmp/brain-eval-c07", { recursive: true });
  } catch {}
}
