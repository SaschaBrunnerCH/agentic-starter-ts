import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { arch, type } from "node:os";
import { gh, ghJson, root } from "./github.ts";
import { scriptArguments } from "./script-arguments.ts";
import * as json from "./json-shape.ts";
import {
  type Device,
  type DeviceResult,
  parseEndpoints,
  projects,
  renderReport,
  reportMarker,
} from "./device-tests.ts";

// Runs the browser tests on this machine's browsers and on farm devices, and reports
// the results on a pull request, so the extra coverage costs no CI minutes. See
// engineering/agents/browser-testing.md.
const usage = `Usage: pnpm test:devices [--project <name>]... [--endpoints <file>] [--base-url <url>] [--report <pr>]

  --project <name>   A project of playwright.config.ts (${projects.join(", ")}); repeatable.
                     Without --project and --endpoints, every project runs.
  --endpoints <file> Farm devices, one "<name> <project> <endpoint>" per line. Keep the file
                     outside the repository: endpoints carry credentials.
  --base-url <url>   Test a deployed URL or a preview instead of the local build.
  --report <pr>      Post the results on the pull request; it must be open, at the
                     checked-out commit, with a clean working tree.`;

function git(args: readonly string[]): string {
  return spawnSync("git", args, { cwd: root, encoding: "utf8" }).stdout.trim();
}

function main(): number {
  const args = scriptArguments();
  const local: string[] = [];
  let endpointsFile: string | undefined;
  let baseUrl: string | undefined;
  let report: string | undefined;
  for (let index = 0; index < args.length; index += 2) {
    const [name, value] = [args[index], args[index + 1]];
    if (value === undefined || value.startsWith("--")) {
      console.log(usage);
      return name === "help" || name === "--help" ? 0 : 2;
    }
    if (name === "--project") local.push(value);
    else if (name === "--endpoints") endpointsFile = value;
    else if (name === "--base-url") baseUrl = value;
    else if (name === "--report") report = value;
    else {
      console.log(usage);
      return 2;
    }
  }
  const unknown = local.filter((project) => !(projects as readonly string[]).includes(project));
  if (unknown.length > 0) {
    console.error(`Unknown project: ${unknown.join(", ")}. Use one of ${projects.join(", ")}.`);
    return 2;
  }
  // What the run really uses, settings inherited from the shell included, so the
  // report names it.
  const target = baseUrl ?? process.env.BROWSER_TEST_BASE_URL;
  const inheritedEndpoint = process.env.REMOTE_BROWSER_WS_ENDPOINT;
  const devices: Device[] = [
    ...(local.length === 0 && endpointsFile === undefined ? [...projects] : local).map(
      (project) => ({
        name: inheritedEndpoint === undefined ? project : `${project} (remote browser)`,
        project,
      }),
    ),
    ...(endpointsFile === undefined
      ? []
      : parseEndpoints(readFileSync(endpointsFile, "utf8"), projects)),
  ];

  const commit = git(["rev-parse", "HEAD"]);
  // Checked before the run and again before the report is posted.
  const reportProblems = (pr: string) => {
    const pull = ghJson(
      ["pr", "view", pr, "--json", "number,state,headRefOid"],
      json.object({ number: json.number, state: json.string, headRefOid: json.string }),
    );
    const problems = [
      ...(pull.state === "OPEN" ? [] : [`#${pull.number} is ${pull.state}`]),
      ...(pull.headRefOid === commit
        ? []
        : [
            `#${pull.number} is at ${pull.headRefOid.slice(0, 8)}, the checkout at ${commit.slice(0, 8)}`,
          ]),
      ...(git(["status", "--porcelain"]) === "" ? [] : ["the working tree has changes"]),
      ...(git(["rev-parse", "HEAD"]) === commit ? [] : ["the checked-out commit changed"]),
    ];
    return problems;
  };
  if (report !== undefined) {
    const problems = reportProblems(report);
    if (problems.length > 0) {
      console.error(`Not reported, so nothing was run: ${problems.join("; ")}.`);
      return 1;
    }
  }
  // The local build of exactly this commit, unless a deployed URL is tested.
  if (
    target === undefined &&
    spawnSync("pnpm", ["build"], { cwd: root, stdio: "inherit" }).status !== 0
  ) {
    return 1;
  }

  const results: DeviceResult[] = [];
  for (const device of devices) {
    console.log(`\n── ${device.name} (${device.project})`);
    const env = { ...process.env };
    if (device.endpoint !== undefined) env.REMOTE_BROWSER_WS_ENDPOINT = device.endpoint;
    if (target !== undefined) env.BROWSER_TEST_BASE_URL = target;
    const started = performance.now();
    const run = spawnSync(
      "pnpm",
      [
        "exec",
        "node",
        "scripts/browser-test.ts",
        "--project",
        device.project,
        "--output",
        `test-results/${device.name}`,
      ],
      { cwd: root, stdio: "inherit", env },
    );
    results.push({
      ...device,
      passed: run.status === 0,
      seconds: (performance.now() - started) / 1000,
    });
  }

  const body = renderReport(results, {
    commit: commit.slice(0, 8),
    target: target ?? "the local build",
    machine: `${type()} ${arch()}`,
    date: new Date().toISOString().slice(0, 10),
  });
  console.log(`\n${body}`);
  if (report !== undefined) {
    const changed = reportProblems(report);
    if (changed.length > 0) {
      console.error(`\nNot reported: during the run, ${changed.join("; ")}.`);
      return 1;
    }
    const repository = ghJson(
      ["repo", "view", "--json", "nameWithOwner"],
      json.object({ nameWithOwner: json.string }),
    ).nameWithOwner;
    const me = gh(["api", "user", "--jq", ".login"]).trim();
    // One report per pull request, replaced by the next run.
    const existing = ghJson(
      ["api", "--paginate", "--slurp", `repos/${repository}/issues/${report}/comments`],
      json.array(
        json.array(
          json.object({
            id: json.number,
            body: json.string,
            user: json.object({ login: json.string }),
          }),
        ),
      ),
    )
      .flat()
      .find((comment) => comment.user.login === me && comment.body.startsWith(reportMarker));
    if (existing === undefined) {
      gh(
        ["api", "-X", "POST", `repos/${repository}/issues/${report}/comments`, "-F", "body=@-"],
        body,
      );
    } else {
      gh(
        [
          "api",
          "-X",
          "PATCH",
          `repos/${repository}/issues/comments/${existing.id}`,
          "-F",
          "body=@-",
        ],
        body,
      );
    }
    console.log(`\nReported on #${report}.`);
  }
  return results.every((result) => result.passed) ? 0 : 1;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
