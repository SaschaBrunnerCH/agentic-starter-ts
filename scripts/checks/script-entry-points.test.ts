import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const outside = mkdtempSync(join(tmpdir(), "script-entry-points-"));
afterAll(() => rmSync(outside, { recursive: true, force: true }));

// A hook may set GIT_DIR/GIT_INDEX_FILE. Child commands must inspect this checkout.
const env = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")),
);
const run = (entry: string, args: string[] = []) =>
  spawnSync(process.execPath, [resolve(root, "scripts", entry), ...args], {
    cwd: outside,
    env,
    encoding: "utf8",
  });

it.each(["workflow/issue.ts", "workflow/task.ts", "release/release.ts"])(
  "%s retains its help command outside the caller's checkout",
  (entry) => {
    const result = run(entry, ["help"]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("Usage: pnpm");
  },
);

it("checks repository links and installed hooks from outside the checkout", () => {
  for (const [entry, args] of [
    ["checks/check-links.ts", []],
    ["git/install-hooks.ts", ["--check"]],
  ] satisfies [string, string[]][]) {
    const result = run(entry, args);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("PASS");
  }
});

it("the relocated commit hook accepts ordinary text and rejects attribution", () => {
  const message = join(outside, "message.txt");
  writeFileSync(message, "Group engineering scripts by responsibility\n");
  expect(run("git/check-commit-message.ts", [message]).status).toBe(0);
  writeFileSync(message, "Group scripts\n\nCo-Authored-By: Example <test@example.com>\n");
  const rejected = run("git/check-commit-message.ts", [message]);
  expect(rejected.status).toBe(1);
  expect(rejected.stderr).toContain("Commit rejected");
});
