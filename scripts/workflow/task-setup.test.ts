import { describe, expect, it } from "vitest";
import {
  readSetup,
  setupHandoff,
  setupRecovery,
  setupResult,
  type TaskSetup,
} from "./task-setup.ts";
const setup: TaskSetup = {
  issue: 9,
  owner: "owner",
  directory: "/work/app's task",
  branch: "fix/9-fixture",
  base: "a".repeat(40),
  stage: "claim",
  completed: [],
};
describe("setup receipts", () => {
  it("round-trips within the authored handoff and preserves notes during updates", () => {
    const original = "# Task\n\nWanted notes\n";
    const first = setupHandoff(original, setup);
    const install = setupResult(setup, "claim");
    const second = setupHandoff(first + "\nMore notes\n", install);
    expect(readSetup(second)).toEqual(install);
    expect(second).toContain("Wanted notes");
    expect(second).toContain("More notes");
    expect(second.split("<!-- task-setup -->")).toHaveLength(2);
    expect(readSetup(original)).toBeUndefined();
  });
  it("preserves the failed step and removes its failure only after successful recovery", () => {
    const install = setupResult(setup, "claim");
    const failed = setupResult(install, "install", "exit 17");
    expect(readSetup(setupHandoff("", failed))).toEqual({ ...install, failure: "exit 17" });
    const hooks = setupResult(failed, "install");
    expect(hooks.failure).toBeUndefined();
    expect(setupResult(hooks, "hooks")).toMatchObject({
      stage: "complete",
      completed: ["claim", "install", "hooks"],
    });
  });
  it("shows exact local recovery with safe directory quoting, and never retries a claim", () => {
    expect(setupRecovery(setup)[0]).toBe("pnpm issue show 9");
    const install = setupResult(setup, "claim");
    expect(setupRecovery(install)).toEqual([
      "cd '/work/app'\\''s task' && pnpm install --frozen-lockfile",
      "cd '/work/app'\\''s task' && pnpm check:hooks",
      "pnpm task resume 9 # explicitly retry only the remaining local setup steps",
    ]);
    const hooks = setupResult(install, "install");
    expect(setupRecovery(hooks)).toHaveLength(2);
    expect(setupRecovery(setupResult(hooks, "hooks"))).toEqual([]);
  });
  it.each([
    "<!-- task-setup -->",
    "<!-- /task-setup -->",
    "<!-- /task-setup -->x<!-- task-setup -->",
  ])("rejects malformed framing: %s", (text) => {
    expect(() => readSetup(text)).toThrow("Malformed");
    expect(() => setupHandoff(text, setup)).toThrow("Malformed");
  });
  it.each([
    { issue: 0 },
    { owner: "" },
    { branch: "" },
    { directory: "" },
    { stage: "unknown" },
    { base: "short" },
    { completed: ["unknown"] },
    { stage: "complete" },
    { stage: "install", completed: [] },
  ])("rejects inconsistent or invalid receipt %j", (change) => {
    expect(() => readSetup(setupHandoff("", { ...setup, ...change }))).toThrow();
  });
});

it("rejects ambiguous duplicated receipts", () => {
  const receipt = setupHandoff("", setup);
  expect(() => readSetup(receipt + receipt)).toThrow("duplicate");
  expect(() => setupHandoff(receipt + receipt, setup)).toThrow("duplicate");
});

it("persists current recovery commands and removes completed instructions from the handoff", () => {
  const install = setupResult(setup, "claim");
  const pending = setupHandoff("# Wanted notes", install);
  for (const command of setupRecovery(install)) expect(pending).toContain(command);
  const hooks = setupResult(install, "install");
  const installed = setupHandoff(pending, hooks);
  expect(installed).not.toContain("pnpm install --frozen-lockfile");
  for (const command of setupRecovery(hooks)) expect(installed).toContain(command);
  const complete = setupHandoff(installed, setupResult(hooks, "hooks"));
  expect(complete).not.toContain("pnpm check:hooks");
  expect(complete).toContain("Wanted notes");
});

it("reads the original metadata-only receipt format", () => {
  const original = `<!-- task-setup -->\n\`\`\`json\n${JSON.stringify(setup)}\n\`\`\`\n<!-- /task-setup -->`;
  expect(readSetup(original)).toEqual(setup);
});
