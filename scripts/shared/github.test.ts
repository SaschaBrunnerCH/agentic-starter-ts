import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";

let directory = "";
let env: NodeJS.ProcessEnv;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "github-target-"));
  mkdirSync(join(directory, "scripts/shared"), { recursive: true });
  cpSync(import.meta.dirname, join(directory, "scripts/shared"), {
    recursive: true,
    filter: (path) => !path.endsWith(".test.ts"),
  });
  mkdirSync(join(directory, "bin"));
  writeFileSync(join(directory, "package.json"), '{"type":"module"}');
  writeFileSync(join(directory, "calls.jsonl"), "");
  env = {
    ...process.env,
    PATH: `${join(directory, "bin")}:${process.env.PATH ?? ""}`,
    GH_HOST: "wrong.example",
    GH_REPO: "wrong.example/other/repository",
    FIXTURE_IDENTITY: "https://github.com/owner/app",
    FIXTURE_KEEP: "preserved",
  };
  writeFileSync(
    join(directory, "bin/gh"),
    `#!${process.execPath}
import {appendFileSync,readFileSync} from 'node:fs';
const args=process.argv.slice(2);
const call={args,cwd:process.cwd(),host:process.env.GH_HOST,repo:process.env.GH_REPO,keep:process.env.FIXTURE_KEEP};
appendFileSync('calls.jsonl',JSON.stringify(call)+'\\n');
if(args[0]==='repo'&&args[1]==='view'&&args[3]==='url') console.log(JSON.stringify({url:process.env.FIXTURE_IDENTITY}));
else if(process.env.FIXTURE_FAIL) {console.error('fixture failure');process.exit(23);}
else console.log(JSON.stringify({...call,input:readFileSync(0,'utf8')}));
`,
    { mode: 0o755 },
  );
  writeFileSync(
    join(directory, "invoke.ts"),
    `import {gh} from './scripts/shared/github.ts';
const before=JSON.stringify(process.env);
try { console.log(gh(JSON.parse(process.argv[2]),'input bytes')); if(process.env.FIXTURE_TWICE) gh(['api','user']); }
finally {if(JSON.stringify(process.env)!==before) throw new Error('Caller environment mutated');}
`,
  );
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));
function invoke(args: string[], extra: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, [join(directory, "invoke.ts"), JSON.stringify(args)], {
    cwd: directory,
    env: { ...env, ...extra },
    encoding: "utf8",
  });
}
const calls = () =>
  readFileSync(join(directory, "calls.jsonl"), "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line): unknown => JSON.parse(line));

it.each(["github.com", "enterprise.example"])(
  "routes existing gh calls to the checkout on %s",
  (host) => {
    const result = invoke(["issue", "edit", "7", "--title", "Changed"], {
      FIXTURE_IDENTITY: `https://${host}/owner/app`,
    });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      host,
      repo: `${host}/owner/app`,
      keep: "preserved",
      cwd: directory,
      input: "input bytes",
    });
    expect(calls()[0]).toEqual({
      args: ["repo", "view", "--json", "url"],
      cwd: directory,
      keep: "preserved",
    });
  },
);
it("routes REST and GraphQL to the same host, preserves explicit preview endpoints and caches discovery", () => {
  const result = invoke(["api", "repos/owner/app-previews/keys", "--method", "POST"], {
    FIXTURE_IDENTITY: "https://enterprise.example/owner/app",
    FIXTURE_TWICE: "1",
  });
  expect(result.status, result.stderr).toBe(0);
  expect(calls()).toHaveLength(3);
  expect(calls()[1]).toMatchObject({
    args: [
      "api",
      "repos/owner/app-previews/keys",
      "--method",
      "POST",
      "--hostname",
      "enterprise.example",
    ],
    host: "enterprise.example",
  });
  expect(calls()[2]).toMatchObject({ args: ["api", "user", "--hostname", "enterprise.example"] });
  const graph = invoke(["api", "graphql", "-f", "query=query{viewer{login}}"]);
  expect(graph.status, graph.stderr).toBe(0);
  expect(JSON.parse(graph.stdout)).toMatchObject({
    args: ["api", "graphql", "-f", "query=query{viewer{login}}", "--hostname", "github.com"],
  });
});
it.each([
  ["api", "user", "--hostname", "other.example"],
  ["issue", "edit", "7", "--repo", "other/app"],
  ["pr", "merge", "https://github.com/other/app/pull/7"],
])("refuses conflicting target %j before the operation", (...args) => {
  const result = invoke(args);
  expect(result.status).not.toBe(0);
  expect(calls()).toHaveLength(1);
});
it.each([
  "invalid",
  "http://github.com/owner/app",
  "https://user:password@example.invalid/owner/app",
  "https://github.com/owner/app?other=1",
])("refuses invalid repository identity %s", (url) => {
  const result = invoke(["issue", "edit", "7"], { FIXTURE_IDENTITY: url });
  expect(result.status).not.toBe(0);
  expect(calls()).toHaveLength(1);
});
it("preserves operation failures", () => {
  const result = invoke(["api", "user"], { FIXTURE_FAIL: "1" });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("fixture failure");
});
