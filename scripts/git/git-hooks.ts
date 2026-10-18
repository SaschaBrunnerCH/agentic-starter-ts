import { accessSync, constants } from "node:fs";
import { join } from "node:path";

/** The Git hooks the gate depends on, as tracked under `.githooks`. */
export const GATE_HOOKS = ["pre-commit", "commit-msg", "pre-push"] as const;

/**
 * What keeps the gate's hooks from running, in the hooks directory Git resolves for the
 * current worktree (`git rev-parse --git-path hooks`): each hook that is missing there or
 * cannot be executed. Empty when all of them would run.
 */
export function hookProblems(hooksDirectory: string): string[] {
  return GATE_HOOKS.flatMap((hook) => {
    const path = join(hooksDirectory, hook);
    try {
      accessSync(path, constants.X_OK);
      return [];
    } catch {
      return [`${hook} is missing or not executable at ${path}`];
    }
  });
}
