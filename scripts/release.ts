import { spawnSync } from "node:child_process";
import { gh, ghJson, prBuild, root } from "./github.ts";
import { scriptArguments } from "./script-arguments.ts";
import * as json from "./json-shape.ts";
import { format, parseVersion, releaseProblems } from "./release-rules.ts";

// Tags the head of main as a release. The tag starts .github/workflows/release.yml,
// which builds the release in CI. See engineering/operations/releases.md.

const usage = `Usage: pnpm release <version> [--authorized-by-owner]

  Checks that the head of origin/main may be released as v<version>. With
  --authorized-by-owner, after the owner has said yes to this version, it creates
  and pushes the tag; a pushed release tag cannot be moved or deleted.`;

function git(args: readonly string[]): string {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.error?.message ?? result.stderr}`);
  }
  return result.stdout.trim();
}

function release(requested: string, authorized: boolean): number {
  git(["fetch", "--quiet", "--tags", "origin", "main"]);
  const head = git(["rev-parse", "HEAD"]);
  const repository = ghJson(
    ["repo", "view", "--json", "nameWithOwner"],
    json.object({ nameWithOwner: json.string }),
  ).nameWithOwner;
  // The pull request whose squash merge made this commit; its PR build tested the tree.
  const source = ghJson(
    ["api", `repos/${repository}/commits/${head}/pulls`],
    json.array(
      json.object({
        number: json.number,
        merge_commit_sha: json.nullable(json.string),
        head: json.object({ sha: json.string }),
      }),
    ),
  ).find((pull) => pull.merge_commit_sha === head);
  const facts = {
    requested,
    tags: git(["tag", "--list", "v*"]).split("\n").filter(Boolean),
    uncommitted: git(["status", "--porcelain"]) !== "",
    atMainHead: head === git(["rev-parse", "origin/main"]),
    build: source === undefined ? ("missing" as const) : prBuild(repository, source.head.sha),
  };
  console.log(`Commit:   ${head}${source === undefined ? "" : ` (#${source.number})`}`);
  console.log(`PR build: ${facts.build}`);
  const problems = releaseProblems(facts);
  if (problems.length > 0) {
    console.error(`\nNo release: ${problems.join("; ")}.`);
    return 1;
  }
  const version = parseVersion(requested);
  if (version === undefined) return 1;
  const tag = `v${format(version)}`;
  if (!authorized) {
    console.log(`\n${tag} may be released. Show the owner the version and the commit.`);
    console.log(`After an explicit yes: pnpm release ${format(version)} --authorized-by-owner`);
    return 0;
  }
  git(["tag", "--annotate", tag, "--message", tag, head]);
  try {
    git(["push", "origin", `refs/tags/${tag}`]);
  } catch (error) {
    // A push can fail after GitHub accepted the tag. Ask GitHub before deciding.
    let remote: string;
    try {
      remote = git(["ls-remote", "origin", `refs/tags/${tag}`]);
    } catch {
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}\nWhether ${tag} reached GitHub is unknown; the local tag is kept. Check with: git ls-remote origin refs/tags/${tag}`,
        { cause: error },
      );
    }
    if (remote === "") {
      // Nothing was published; remove the local tag so the same command can run again.
      git(["tag", "--delete", tag]);
      throw error;
    }
    if (!remote.startsWith(git(["rev-parse", `refs/tags/${tag}`]))) {
      throw new Error(
        `GitHub has another ${tag} than the one tagged here; the local tag is kept. Do not move a release tag; ask the owner.`,
        { cause: error },
      );
    }
    console.log(`\nThe push reported an error, but GitHub has ${tag}.`);
  }
  console.log(`\nPushed ${tag}. The release workflow builds and publishes it:`);
  console.log(
    gh([
      "run",
      "list",
      "--workflow",
      "release.yml",
      "--limit",
      "1",
      "--json",
      "url",
      "--jq",
      ".[0].url // empty",
    ]).trim() || `https://github.com/${repository}/actions/workflows/release.yml`,
  );
  return 0;
}

const [requested, flag] = scriptArguments();
try {
  if (
    requested === undefined ||
    requested === "help" ||
    (flag !== undefined && flag !== "--authorized-by-owner")
  ) {
    console.log(usage);
    process.exitCode = requested === undefined || requested === "help" ? 0 : 2;
  } else process.exitCode = release(requested, flag === "--authorized-by-owner");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
