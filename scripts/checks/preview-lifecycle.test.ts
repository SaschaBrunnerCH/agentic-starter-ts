import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";

const workflow = readFileSync(
  resolve(import.meta.dirname, "../../.github/workflows/pr-preview.yml"),
  "utf8",
);
function script(name: string) {
  const section = workflow.split(`      - name: ${name}\n`)[1]?.split(/^ {6}- name:/mu)[0];
  const body = section?.split("        run: |\n")[1];
  if (body === undefined) throw new Error(`Missing executable workflow step: ${name}`);
  const lines: string[] = [];
  for (const line of body.split("\n")) {
    if (line !== "" && !line.startsWith("          ")) break;
    lines.push(line.slice(10));
  }
  return lines.join("\n");
}
type Pull = { state: string; head: string };
let directory = "",
  checkout = "",
  origin = "",
  stateFile = "",
  output = "",
  comments = "";
let pulls: Record<string, Pull>;
let env: NodeJS.ProcessEnv;
const a = "a".repeat(40),
  b = "b".repeat(40);
function git(cwd: string, args: string[]) {
  const result = spawnSync("git", args, { cwd, env, encoding: "utf8" });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}
const state = () => writeFileSync(stateFile, JSON.stringify(pulls));
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "preview-lifecycle-"));
  checkout = join(directory, "runner");
  origin = join(directory, "origin.git");
  stateFile = join(directory, "pulls.json");
  output = join(directory, "output");
  comments = join(directory, "comments");
  const bin = join(directory, "bin"),
    seed = join(directory, "seed");
  mkdirSync(bin);
  mkdirSync(checkout);
  mkdirSync(seed);
  mkdirSync(join(directory, "runner-temp"));
  const realGit = (process.env.PATH ?? "")
    .split(delimiter)
    .map((part) => join(part, "git"))
    .find(existsSync);
  if (realGit === undefined) throw new Error("Git unavailable for disposable controls");
  env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))),
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    RUNNER_TEMP: join(directory, "runner-temp"),
    FIXTURE_GIT: realGit,
    FIXTURE_ORIGIN: origin,
    FIXTURE_STATE: stateFile,
    FIXTURE_COMMENTS: comments,
    FIXTURE_RACE_MARKER: join(directory, "raced"),
    FIXTURE_REOPEN_MARKER: join(directory, "reopened"),
    PATH: `${bin}:${process.env.PATH ?? ""}`,
    GITHUB_REPOSITORY: "example/source",
    GITHUB_REPOSITORY_OWNER: "example",
    HEAD_BRANCH: "topic",
    CLOSED: "",
    GITHUB_OUTPUT: output,
    GITHUB_STEP_SUMMARY: join(directory, "summary"),
    PREVIEWS_REPOSITORY: "example/previews",
    PREVIEWS_URL: "https://example.test/previews/",
    DEPLOY_KEY: "synthetic-test-key",
    HEAD_SHA: a,
    PULL_REQUEST: "1",
  };
  pulls = {
    "1": { state: "open", head: a },
    "2": { state: "closed", head: a },
    "3": { state: "open", head: b },
  };
  state();
  writeFileSync(comments, "");
  writeFileSync(output, "");
  git(seed, ["init", "-qb", "gh-pages"]);
  for (const n of [1, 2, 3]) {
    mkdirSync(join(seed, `pr-${n}`));
    writeFileSync(join(seed, `pr-${n}/index.html`), `old ${n}`);
  }
  git(seed, ["add", "."]);
  git(seed, [
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.test",
    "commit",
    "-qm",
    "Seed previews",
  ]);
  git(directory, ["init", "--bare", "-q", origin]);
  git(seed, ["remote", "add", "origin", origin]);
  git(seed, ["push", "-q", "origin", "gh-pages"]);
  mkdirSync(join(checkout, "site"));
  writeFileSync(join(checkout, "site/index.html"), `candidate ${a}`);
  writeFileSync(
    join(bin, "gh"),
    String.raw`#!/usr/bin/env node
import {readFileSync,writeFileSync,appendFileSync} from 'node:fs';
const args=process.argv.slice(2), endpoint=args.find(x=>x==='meta'||x.startsWith('repos/'));
if(endpoint==='meta'){console.log('github.com synthetic-host-key');process.exit(0)}
if(!endpoint)process.exit(90);
if(process.env.FIXTURE_API_FAIL&&endpoint.includes('/pulls'))process.exit(91);
const pulls=JSON.parse(readFileSync(process.env.FIXTURE_STATE,'utf8'));
const match=/\/pulls\/(\d+)$/.exec(endpoint);
if(match){const pull=pulls[match[1]];if(!pull)process.exit(92);let observed=pull.state;if(match[1]==='1'&&args.includes('.state')&&process.env.FIXTURE_REOPEN){let count=0;try{count=Number(readFileSync(process.env.FIXTURE_REOPEN_MARKER,'utf8'))}catch{};writeFileSync(process.env.FIXTURE_REOPEN_MARKER,String(++count));if(count===2)observed='closed';}console.log(args.includes('.state')?observed:pull.state+'\t'+pull.head)}
else if(endpoint.endsWith('/pulls')){if(pulls['1'].state==='open')console.log('1 '+pulls['1'].head)}
else if(endpoint.endsWith('/comments')&&args.includes('--paginate'))console.log('');
else if(endpoint.includes('/issues/')&&(args.includes('POST')||args.includes('PATCH'))){appendFileSync(process.env.FIXTURE_COMMENTS,args.find(x=>x.startsWith('body='))+'\n')}
else process.exit(93);
`,
    { mode: 0o755 },
  );
  writeFileSync(
    join(bin, "git"),
    String.raw`#!/usr/bin/env node
import {spawnSync} from 'node:child_process';import {existsSync,readFileSync,writeFileSync} from 'node:fs';
const args=process.argv.slice(2);
if(args[0]==='clone'){const index=args.findIndex(x=>x.startsWith('git@github.com:'));if(index<0||args[index]!=='git@github.com:example/previews.git')process.exit(94);args[index]=process.env.FIXTURE_ORIGIN;}
const result=spawnSync(process.env.FIXTURE_GIT,args,{stdio:'inherit'});
if(args[0]==='push'&&result.status===0&&process.env.FIXTURE_RACE&&!existsSync(process.env.FIXTURE_RACE_MARKER)){
 const pulls=JSON.parse(readFileSync(process.env.FIXTURE_STATE,'utf8'));
 if(process.env.FIXTURE_RACE==='close')pulls['1'].state='closed';else pulls['1'].head='b'.repeat(40);
 writeFileSync(process.env.FIXTURE_STATE,JSON.stringify(pulls));writeFileSync(process.env.FIXTURE_RACE_MARKER,'done');
}
process.exit(result.status??1);
`,
    { mode: 0o755 },
  );
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));
function run(name: string, extra: NodeJS.ProcessEnv = {}) {
  return spawnSync("bash", ["-c", script(name)], {
    cwd: checkout,
    env: { ...env, ...extra },
    encoding: "utf8",
  });
}
function synchronize(extra: NodeJS.ProcessEnv = {}) {
  rmSync(join(checkout, "previews"), { recursive: true, force: true });
  writeFileSync(output, "");
  return run("Synchronize preview state", extra);
}
const files = () =>
  git(directory, ["--git-dir", origin, "ls-tree", "-r", "--name-only", "gh-pages"]);
it("publishes exact candidate bytes, keeps open previews and reconciles closed previews in the same job", () => {
  const admission = run("Find the pull request");
  expect(admission.status, admission.stderr).toBe(0);
  expect(readFileSync(output, "utf8")).toContain("number=1");
  const result = synchronize();
  expect(result.status, result.stderr).toBe(0);
  expect(files()).toBe("pr-1/index.html\npr-3/index.html");
  expect(git(directory, ["--git-dir", origin, "show", "gh-pages:pr-1/index.html"])).toBe(
    `candidate ${a}`,
  );
  expect(readFileSync(output, "utf8")).toContain("published=1");
  expect(run("Link the preview on the pull request").status).toBe(0);
  expect(readFileSync(comments, "utf8")).toContain(
    "Preview of aaaaaaaa: https://example.test/previews/pr-1/",
  );
});
it("suppresses publication when closure follows initial admission", () => {
  expect(run("Find the pull request").status).toBe(0);
  pulls["1"] = { state: "closed", head: a };
  state();
  const result = synchronize();
  expect(result.status, result.stderr).toBe(0);
  expect(files()).toBe("pr-3/index.html");
  expect(readFileSync(output, "utf8")).toBe("");
});
it.each(["close", "head"])("reconciles a %s race during the actual local push", (race) => {
  const result = synchronize({ FIXTURE_RACE: race });
  expect(result.status, result.stderr).toBe(0);
  expect(files()).toBe("pr-3/index.html");
  expect(readFileSync(output, "utf8")).toBe("");
});
it("retains cleanup when a late publisher follows it", () => {
  pulls["1"] = { state: "closed", head: a };
  state();
  expect(synchronize({ PULL_REQUEST: "", HEAD_SHA: "" }).status).toBe(0);
  expect(synchronize().status).toBe(0);
  expect(files()).toBe("pr-3/index.html");
});
it("removes a published preview when cleanup follows it", () => {
  expect(synchronize().status).toBe(0);
  pulls["1"] = { state: "closed", head: a };
  state();
  expect(synchronize({ PULL_REQUEST: "", HEAD_SHA: "" }).status).toBe(0);
  expect(files()).toBe("pr-3/index.html");
});
it("rejects unknown API state without changing the remote preview tree", () => {
  const before = git(directory, ["--git-dir", origin, "rev-parse", "gh-pages"]);
  const result = synchronize({ FIXTURE_API_FAIL: "1" });
  expect(result.status).not.toBe(0);
  expect(git(directory, ["--git-dir", origin, "rev-parse", "gh-pages"])).toBe(before);
});
it("does not label an old build current after a head change or closure before linking", () => {
  expect(synchronize().status).toBe(0);
  pulls["1"] = { state: "open", head: b };
  state();
  expect(run("Link the preview on the pull request").status).toBe(0);
  pulls["1"] = { state: "closed", head: a };
  state();
  expect(run("Link the preview on the pull request").status).toBe(0);
  expect(readFileSync(comments, "utf8")).toBe("");
});
it("keeps publication and reconciliation in one non-cancelling trusted job", () => {
  expect(workflow).toContain("group: previews-${{ needs.admit.outputs.group }}");
  expect(workflow).toContain("needs: [admit]");
  expect(workflow).toContain("cancel-in-progress: false");
  expect(workflow).toContain("pull_request_target:");
  expect(workflow).toContain("types: [closed]");
  expect(workflow).not.toMatch(/checkout@|node scripts\//u);
  expect(workflow).toContain("run-id: ${{ github.event.workflow_run.id }}");
  expect(
    existsSync(resolve(import.meta.dirname, "../../.github/workflows/pr-preview-cleanup.yml")),
  ).toBe(false);
});

it("does not announce a removed candidate when a PR reopens during reconciliation", () => {
  const result = synchronize({ FIXTURE_REOPEN: "1" });
  expect(result.status, result.stderr).toBe(0);
  expect(files()).toBe("pr-3/index.html");
  expect(readFileSync(output, "utf8")).toBe("");
  expect(synchronize().status).toBe(0);
  expect(readFileSync(output, "utf8")).toContain("published=1");
});

it("routes publication and closure to the same PR group without a cleanup candidate", () => {
  expect(run("Find the pull request").status).toBe(0);
  expect(readFileSync(output, "utf8")).toContain("group=pr-1");
  writeFileSync(output, "");
  expect(run("Find the pull request", { CLOSED: "1", HEAD_SHA: "" }).status).toBe(0);
  expect(readFileSync(output, "utf8")).toBe("group=pr-1\n");
  writeFileSync(output, "");
  expect(run("Find the pull request", { CLOSED: "", HEAD_SHA: "" }).status).toBe(0);
  expect(readFileSync(output, "utf8")).toBe("group=reconciliation\n");
  expect(run("Find the pull request", { CLOSED: "invalid" }).status).not.toBe(0);
});
it("coordinates a superseded build without admitting its artifact", () => {
  pulls["1"] = { state: "open", head: b };
  state();
  expect(run("Find the pull request").status).toBe(0);
  expect(readFileSync(output, "utf8")).toBe("group=pr-1\n");
});
