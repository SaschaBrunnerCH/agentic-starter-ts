import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { readSetup, setupRecovery } from "./task-setup.ts";

const source = resolve(import.meta.dirname, "../..");
let temporary = "",
  main = "",
  worktree = "",
  handoff = "",
  events = "";
let env: NodeJS.ProcessEnv;
function git(cwd: string, args: string[]) {
  const result = spawnSync("git", args, { cwd, env, encoding: "utf8" });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}
function run(args: string[], extra: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, [join(main, "scripts/workflow/task.ts"), ...args], {
    cwd: main,
    env: { ...env, ...extra },
    encoding: "utf8",
  });
}
const journal = () => readFileSync(events, "utf8").trim().split("\n").filter(Boolean);
beforeEach(() => {
  temporary = mkdtempSync(join(tmpdir(), "task-start-"));
  main = join(temporary, "app");
  worktree = join(temporary, "app-9-fixture");
  handoff = join(main, ".git/agent-handoffs/issue-9.md");
  events = join(temporary, "events.jsonl");
  writeFileSync(events, "");
  const binaries = join(temporary, "bin");
  mkdirSync(binaries);
  env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))),
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    PATH: `${binaries}:${process.env.PATH ?? ""}`,
    FIXTURE_EVENTS: events,
    FIXTURE_USER: "owner",
    FIXTURE_ASSIGNEE: "owner",
  };
  git(temporary, ["init", "-q", "--bare", "origin.git"]);
  mkdirSync(main);
  git(main, ["init", "-q", "-b", "main"]);
  cpSync(join(source, "scripts"), join(main, "scripts"), {
    recursive: true,
    filter: (path) => !path.endsWith(".test.ts"),
  });
  writeFileSync(join(main, "package.json"), '{"type":"module"}\n');
  writeFileSync(join(main, ".gitignore"), "node_modules/\n");
  symlinkSync(join(source, "node_modules"), join(main, "node_modules"), "dir");
  const log = `const log=(kind,args)=>{appendFileSync(process.env.FIXTURE_EVENTS,JSON.stringify({kind,args,cwd:process.cwd()})+'\\n')};`;
  writeFileSync(
    join(main, "scripts/workflow/issue.ts"),
    `import {appendFileSync,writeFileSync} from 'node:fs';import {spawnSync} from 'node:child_process';${log}const args=process.argv.slice(2);log('issue',args);if(!args.includes('--check')&&process.env.FIXTURE_ADVANCE){writeFileSync('wanted-commit.txt','wanted commit');for(const command of [['add','.'],['-c','user.name=Fixture','-c','user.email=fixture@example.test','commit','-qm','Retain wanted work']])if(spawnSync('git',command).status!==0)process.exit(94);}process.exit(args[0]==='claim'&&!args.includes('--check')?Number(process.env.FIXTURE_CLAIM_FAIL??0):0);`,
  );
  writeFileSync(
    join(binaries, "gh"),
    `#!/usr/bin/env node\nimport {appendFileSync} from 'node:fs';${log}const args=process.argv.slice(2);log('gh',args);if(args[0]==='api'&&args[1]==='user')console.log(process.env.FIXTURE_USER);else if(args[0]==='issue'&&args.includes('title,labels'))console.log(JSON.stringify({title:'Fixture',labels:[{name:'bug'}]}));else if(args[0]==='issue'&&args.includes('assignees'))console.log(JSON.stringify({assignees:[{login:process.env.FIXTURE_ASSIGNEE}]}));else process.exit(91);`,
    { mode: 0o755 },
  );
  writeFileSync(
    join(binaries, "pnpm"),
    `#!/usr/bin/env node\nimport {appendFileSync} from 'node:fs';${log}const args=process.argv.slice(2);log('pnpm',args);process.exit(args[0]==='install'?Number(process.env.FIXTURE_INSTALL_FAIL??0):args[0]==='check:hooks'?Number(process.env.FIXTURE_HOOK_FAIL??0):92);`,
    { mode: 0o755 },
  );
  git(main, ["add", "."]);
  git(main, [
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.test",
    "commit",
    "-qm",
    "Create fixture",
  ]);
  git(main, ["remote", "add", "origin", join(temporary, "origin.git")]);
  git(main, ["push", "-q", "origin", "main"]);
});
afterEach(() => rmSync(temporary, { recursive: true, force: true }));

it("starts a real worktree, installs frozen dependencies, checks hooks and records completion", () => {
  const result = run(["start", "9"]);
  expect(result.status, result.stderr).toBe(0);
  expect(existsSync(join(worktree, ".git"))).toBe(true);
  expect(git(worktree, ["branch", "--show-current"])).toBe("fix/9-fixture");
  expect(readSetup(readFileSync(handoff, "utf8"))).toMatchObject({
    stage: "complete",
    completed: ["claim", "install", "hooks"],
    owner: "owner",
  });
  const calls = journal();
  expect(calls.filter((line) => line.includes('"kind":"pnpm"'))).toEqual([
    JSON.stringify({ kind: "pnpm", args: ["install", "--frozen-lockfile"], cwd: worktree }),
    JSON.stringify({ kind: "pnpm", args: ["check:hooks"], cwd: worktree }),
  ]);
  const before = journal();
  expect(run(["inspect", "9"]).status).toBe(0);
  expect(journal()).toEqual(before); // Inspection performs no API/install writes.
  expect(run(["resume", "9"]).status).toBe(0);
  expect(journal()).toEqual(before);
});
it.each(["install", "hooks"])(
  "retains a failed %s and explicitly resumes only its pending local steps",
  (step) => {
    const failure =
      step === "install" ? { FIXTURE_INSTALL_FAIL: "17" } : { FIXTURE_HOOK_FAIL: "19" };
    const result = run(["start", "9"], failure);
    expect(result.status).toBe(1);
    expect(result.stdout).not.toContain("Started issue");
    const receipt = readSetup(readFileSync(handoff, "utf8"));
    expect(receipt?.stage).toBe(step);
    expect(receipt?.failure).toContain(step === "install" ? "exit 17" : "exit 19");
    writeFileSync(join(worktree, "wanted.txt"), "preserve this work");
    const before = journal();
    const original = readFileSync(handoff, "utf8");
    expect(receipt).toBeDefined();
    if (receipt === undefined) throw new Error("Missing failed setup receipt");
    for (const command of setupRecovery(receipt)) expect(original).toContain(command);
    const inspected = run(["inspect", "9"]);
    expect(inspected.status).toBe(1);
    expect(inspected.stdout).toContain("Original failure");
    expect(journal()).toEqual(before);
    expect(readFileSync(handoff, "utf8")).toBe(original);
    const resumed = run(["resume", "9"]);
    expect(resumed.status, resumed.stderr).toBe(0);
    expect(readFileSync(join(worktree, "wanted.txt"), "utf8")).toBe("preserve this work");
    expect(readSetup(readFileSync(handoff, "utf8"))?.stage).toBe("complete");
    const after = journal().slice(before.length);
    expect(after.filter((line) => line.includes('"kind":"pnpm"'))).toHaveLength(
      step === "install" ? 2 : 1,
    );
    expect(after.some((line) => line.includes('"kind":"issue"'))).toBe(false);
  },
);
it("preserves a partially failed claim without automatically repeating remote writes", () => {
  const result = run(["start", "9"], { FIXTURE_CLAIM_FAIL: "13" });
  expect(result.status).toBe(1);
  expect(existsSync(worktree)).toBe(true);
  expect(readSetup(readFileSync(handoff, "utf8"))).toMatchObject({ stage: "claim", completed: [] });
  const before = journal();
  expect(run(["resume", "9"]).status).toBe(1);
  expect(journal()).toEqual(before);
});
it("removes only its fresh unclaimed worktree but retains the failure receipt", () => {
  expect(run(["start", "9"], { FIXTURE_CLAIM_FAIL: "13", FIXTURE_ASSIGNEE: "other" }).status).toBe(
    1,
  );
  expect(existsSync(worktree)).toBe(false);
  expect(existsSync(handoff)).toBe(true);
  expect(readSetup(readFileSync(handoff, "utf8"))?.failure).toContain("exit 13");
});
it("refuses changed ownership without performing pending setup", () => {
  expect(run(["start", "9"], { FIXTURE_INSTALL_FAIL: "17" }).status).toBe(1);
  const before = journal();
  const original = readFileSync(handoff, "utf8");
  const resumed = run(["resume", "9"], { FIXTURE_USER: "other" });
  expect(resumed.status).toBe(1);
  expect(resumed.stderr).toContain("ownership differs");
  expect(
    journal()
      .slice(before.length)
      .some((line) => line.includes('"kind":"pnpm"')),
  ).toBe(false);
  expect(readFileSync(handoff, "utf8")).toBe(original);
});
it("retains a legacy handoff rather than restarting or declaring it ready", () => {
  mkdirSync(join(main, ".git/agent-handoffs"));
  writeFileSync(handoff, "# Existing owned work\n");
  const before = journal();
  expect(run(["start", "9"]).status).toBe(1);
  expect(run(["inspect", "9"]).status).toBe(1);
  expect(
    journal()
      .slice(before.length)
      .some((line) => line.includes('"kind":"issue"')),
  ).toBe(false);
  expect(readFileSync(handoff, "utf8")).toBe("# Existing owned work\n");
});

it("retains commits that appear during a failed claim instead of deleting an advanced branch", () => {
  const result = run(["start", "9"], {
    FIXTURE_CLAIM_FAIL: "13",
    FIXTURE_ASSIGNEE: "other",
    FIXTURE_ADVANCE: "1",
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("branch advanced");
  expect(existsSync(worktree)).toBe(true);
  expect(readFileSync(join(worktree, "wanted-commit.txt"), "utf8")).toBe("wanted commit");
  expect(readSetup(readFileSync(handoff, "utf8"))?.stage).toBe("claim");
});
