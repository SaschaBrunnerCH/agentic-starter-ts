import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

// The pre-push hook and the PR build run this one list, so a push that passes
// locally meets the same checks remotely. Add a check here and to the
// guardrail table in AGENTS.md in the same pull request.
const checks = [
  "format:check",
  "lint",
  "typecheck",
  "check:unused",
  "check:secrets",
  "check:workflows",
  "check:agents",
  "check:links",
  "check:dependencies",
  "check:hooks",
  "test",
  "build",
  // Measures what build wrote, so it runs after it.
  "check:bundle",
] as const;

const root = resolve(import.meta.dirname, "../..");
const failures: string[] = [];

for (const check of checks) {
  console.log(`\n── pnpm ${check}`);
  const result = spawnSync("pnpm", ["--silent", check], { cwd: root, stdio: "inherit" });
  if (result.status !== 0) failures.push(check);
}

if (failures.length > 0) {
  console.error(`\nLocal verification failed: ${failures.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log(`\nLocal verification passed: ${checks.join(", ")}`);
}
