import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";

let directory = "",
  root = "",
  head = "",
  config = "",
  events = "";
let env: NodeJS.ProcessEnv;
function git(args: string[]) {
  const result = spawnSync("git", args, { cwd: root, env, encoding: "utf8" });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "hook-child-env-"));
  root = join(directory, "app");
  const bin = join(directory, "bin");
  mkdirSync(bin);
  mkdirSync(join(root, "scripts/git"), { recursive: true });
  events = join(directory, "events.json");
  env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))),
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    PATH: `${bin}:${process.env.PATH ?? ""}`,
    FIXTURE_KEEP: "preserved",
    FIXTURE_EVENTS: events,
    FIXTURE_CHILD: join(directory, "child"),
  };
  for (const file of ["pre-push.ts", "push-rules.ts"])
    cpSync(join(import.meta.dirname, file), join(root, "scripts/git", file));
  writeFileSync(join(root, "package.json"), '{"type":"module"}\n');
  writeFileSync(join(root, "README.md"), "source\n");
  git(["init", "-qb", "main"]);
  git(["add", "."]);
  git([
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.test",
    "commit",
    "-qm",
    "Create fixture",
  ]);
  head = git(["rev-parse", "HEAD"]);
  config = readFileSync(join(root, ".git/config"), "utf8");
  writeFileSync(
    join(bin, "pnpm"),
    `#!/usr/bin/env node
import {spawnSync} from 'node:child_process';import {writeFileSync} from 'node:fs';
writeFileSync(process.env.FIXTURE_EVENTS,JSON.stringify({args:process.argv.slice(2),cwd:process.cwd(),keep:process.env.FIXTURE_KEEP,gitDir:process.env.GIT_DIR,index:process.env.GIT_INDEX_FILE}));
if(process.env.FIXTURE_CHECK_EXIT)process.exit(Number(process.env.FIXTURE_CHECK_EXIT));
const init=spawnSync('git',['init','-q',process.env.FIXTURE_CHILD],{encoding:'utf8'});
if(init.status!==0)process.exit(71);
const found=spawnSync('git',['rev-parse','--show-toplevel'],{cwd:process.env.FIXTURE_CHILD,encoding:'utf8'});
if(found.status!==0||found.stdout.trim()!==process.env.FIXTURE_CHILD)process.exit(72);
if(process.env.FIXTURE_CHANGE_SOURCE)writeFileSync('README.md','changed during checks');
`,
    { mode: 0o755 },
  );
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));
function hook(extra: NodeJS.ProcessEnv = {}, pushed = head) {
  return spawnSync(process.execPath, [join(root, "scripts/git/pre-push.ts")], {
    cwd: root,
    env: {
      ...env,
      GIT_DIR: join(root, ".git"),
      GIT_WORK_TREE: root,
      GIT_INDEX_FILE: join(root, ".git/index"),
      ...extra,
    },
    input: `refs/heads/main ${pushed} refs/heads/main ${"0".repeat(40)}\n`,
    encoding: "utf8",
  });
}
it("validates in the real hook context but isolates child Git fixtures and preserves caller state", () => {
  const before = { ...env };
  const result = hook();
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(readFileSync(events, "utf8"))).toEqual({
    args: ["check:push"],
    cwd: root,
    keep: "preserved",
  });
  expect(readFileSync(join(root, ".git/config"), "utf8")).toBe(config);
  expect(git(["rev-parse", "HEAD"])).toBe(head);
  expect(git(["status", "--porcelain"])).toBe("");
  expect(env).toEqual(before);
});
it("propagates child failure rather than accepting a clean parent", () => {
  expect(hook({ FIXTURE_CHECK_EXIT: "23" }).status).toBe(23);
});
it("still refuses source changes before or during checks", () => {
  writeFileSync(join(root, "README.md"), "dirty before");
  expect(hook().status).toBe(1);
  writeFileSync(join(root, "README.md"), "source\n");
  const changed = hook({ FIXTURE_CHANGE_SOURCE: "1" });
  expect(changed.status).toBe(1);
  expect(changed.stderr).toContain("while the checks ran");
});
it("still refuses an outgoing commit other than the checkout", () => {
  const result = hook({}, "b".repeat(40));
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("checked-out commit");
});
