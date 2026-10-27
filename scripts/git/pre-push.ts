import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pushPlan, pushedObjects } from "./push-rules.ts";

// The pre-push hook: first make sure the checks describe the pushed commits, then run them.
const root = resolve(import.meta.dirname, "../..");
const run = (args: readonly string[]) => spawnSync("git", args, { cwd: root, encoding: "utf8" });
// A failed Git command stops the push: empty output must never read as a clean tree.
const git = (args: readonly string[]) => {
  const result = run(args);
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.error?.message ?? result.stderr}`);
  }
  return result.stdout.trim();
};

try {
  // A tag object is peeled to its commit; one that peels to no commit is kept as it is
  // and then cannot match the checked-out commit. A commit is published when a remote
  // branch contains it.
  const refs = pushedObjects(readFileSync(0, "utf8")).map(({ object, remoteRef }) => {
    const peeled = run(["rev-parse", "--verify", "--quiet", `${object}^{commit}`]);
    const commit = peeled.status === 0 ? peeled.stdout.trim() : object;
    const published =
      peeled.status === 0 && git(["branch", "--remotes", "--contains", commit]) !== "";
    return { remoteRef, commit, published };
  });
  const head = git(["rev-parse", "HEAD"]);
  const plan = pushPlan(git(["status", "--porcelain"]), head, refs);
  if (plan.problems.length > 0) {
    console.error(`Push refused: ${plan.problems.join("; ")}.`);
    process.exitCode = 1;
  } else if (!plan.needsChecks) {
    console.log("Only tags of commits already on a remote branch: nothing new to check.");
  } else {
    // Validate the push in its actual hook context, then let child repositories
    // discover their own Git state instead of inheriting this checkout/index.
    const env = { ...process.env };
    for (const name of git(["rev-parse", "--local-env-vars"]).split("\n")) delete env[name];
    const checks = spawnSync("pnpm", ["check:push"], { cwd: root, stdio: "inherit", env });
    // A file edited or a commit made while the checks ran means they tested something
    // other than what is pushed.
    const after = pushPlan(git(["status", "--porcelain"]), head, refs).problems;
    if (git(["rev-parse", "HEAD"]) !== head) after.push("the checked-out commit changed");
    if (checks.status === 0 && after.length > 0) {
      console.error(`Push refused: while the checks ran, ${after.join("; ")}. Push again.`);
      process.exitCode = 1;
    } else process.exitCode = checks.status ?? 1;
  }
} catch (error) {
  console.error(`Push refused: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
