// Isolate the on-disk cache per test worker AND wipe it once per run, so
// parallel test files and consecutive runs can never see each other's
// cached payloads (production default dir is ".cache").
import fs from "node:fs";
import path from "node:path";

process.env.CACHE_DIR = `.cache-test-${process.env.VITEST_WORKER_ID ?? "1"}`;
fs.rmSync(path.join(process.cwd(), process.env.CACHE_DIR), { recursive: true, force: true });
