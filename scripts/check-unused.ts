import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

// knip reads tool configurations (Playwright, Vite, Vitest …) by running them, and some differ
// when CI=true. The check runs knip both ways, so a file used only outside CI is found on the
// developer's machine and not first in the PR build. See engineering/agents/local-verification.md.

/** The environments knip runs in: as on a developer's machine, and as in CI. */
export function knipEnvironments(
  environment: NodeJS.ProcessEnv,
): Array<{ label: string; environment: NodeJS.ProcessEnv }> {
  const { CI: _ci, ...local } = environment;
  return [
    { label: "without CI", environment: local },
    { label: "with CI=true", environment: { ...local, CI: "true" } },
  ];
}

/** Runs knip in `cwd` both ways; returns the labels of the runs that found something. */
export function checkUnused(cwd: string, knip: string): string[] {
  return knipEnvironments(process.env).flatMap(({ label, environment }) => {
    console.log(`── knip ${label}`);
    const result = spawnSync(knip, ["--no-progress"], { cwd, env: environment, stdio: "inherit" });
    return result.status === 0 ? [] : [label];
  });
}

if (import.meta.main) {
  const root = resolve(import.meta.dirname, "..");
  const failed = checkUnused(root, resolve(root, "node_modules/.bin/knip"));
  if (failed.length > 0) {
    console.error(`Unused code found ${failed.join(" and ")}.`);
    process.exitCode = 1;
  }
}
