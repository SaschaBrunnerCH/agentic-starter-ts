import { spawnSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { dependencyChanges, licenseProblems } from "./dependency-review.ts";
import * as json from "../shared/json-shape.ts";

// Lists the package versions this branch adds against main, and refuses any runtime
// dependency whose licence is not in .github/allowed-licenses.json. In CI the list
// goes to the job summary, so the reviewer sees every new package.

const root = resolve(import.meta.dirname, "../..");

function run(command: string, args: readonly string[]): string {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8" });
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed: ${result.error?.message ?? result.stderr}`,
    );
  }
  return result.stdout;
}

const licensesShape = json.record(
  json.array(json.object({ name: json.string, versions: json.array(json.string) })),
);

/** `name@version` to licence, from pnpm's licence list. */
function licenses(args: readonly string[]): Map<string, string> {
  const listed = json.parseJson(
    run("pnpm", ["licenses", "list", "--json", ...args]),
    licensesShape,
    "pnpm licenses list",
  );
  const found = new Map<string, string>();
  for (const [license, packages] of Object.entries(listed)) {
    for (const entry of packages) {
      for (const version of entry.versions) found.set(`${entry.name}@${version}`, license);
    }
  }
  return found;
}

try {
  const base = spawnSync("git", ["merge-base", "HEAD", "origin/main"], {
    cwd: root,
    encoding: "utf8",
  });
  if (base.status !== 0) {
    throw new Error("origin/main is not available; fetch it (git fetch origin main) and run again");
  }
  const baseCommit = base.stdout.trim();
  const before = spawnSync("git", ["show", `${baseCommit}:pnpm-lock.yaml`], {
    cwd: root,
    encoding: "utf8",
  });
  const changes = dependencyChanges(
    before.status === 0 ? before.stdout : "",
    readFileSync(resolve(root, "pnpm-lock.yaml"), "utf8"),
  );
  const allowed = new Set(
    json.parseJson(
      readFileSync(resolve(root, ".github/allowed-licenses.json"), "utf8"),
      json.array(json.string),
      ".github/allowed-licenses.json",
    ),
  );
  // Packages accepted under their own terms, each with the owner's recorded reason.
  const allowedPackages = new Set(
    Object.keys(
      json.parseJson(
        readFileSync(resolve(root, ".github/allowed-packages.json"), "utf8"),
        json.record(json.string),
        ".github/allowed-packages.json",
      ),
    ),
  );
  const runtime = licenses(["--prod"]);
  const all = changes.length === 0 ? new Map<string, string>() : licenses([]);
  const problems = licenseProblems(runtime, allowed, allowedPackages);

  const rows = changes.map((change) => {
    const key = `${change.name}@${change.version}`;
    return {
      ...change,
      license: all.get(key) ?? runtime.get(key) ?? "unknown",
      use: runtime.has(key) ? "runtime" : "development",
    };
  });
  console.log(`${changes.length} package version(s) added against ${baseCommit.slice(0, 8)}`);
  for (const row of rows) {
    const was = row.previous.length === 0 ? "new" : `was ${row.previous.join(", ")}`;
    console.log(`- ${row.name} ${row.version} (${was}; ${row.license}; ${row.use})`);
  }
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary !== undefined && summary !== "") {
    appendFileSync(
      summary,
      [
        `### Dependency changes against \`${baseCommit.slice(0, 8)}\``,
        "",
        rows.length === 0
          ? "No package version added."
          : [
              "| Package | Version | Before | Licence | Use |",
              "| --- | --- | --- | --- | --- |",
              ...rows.map(
                (row) =>
                  `| ${row.name} | ${row.version} | ${row.previous.join(", ") || "new"} | ${row.license} | ${row.use} |`,
              ),
            ].join("\n"),
        "",
      ].join("\n"),
    );
  }
  if (problems.length > 0) {
    console.error(
      `\nLicence not allowed: ${problems.join("; ")}. Replace the package, or, with the owner's decision, add the licence to .github/allowed-licenses.json or the package with its reason to .github/allowed-packages.json.`,
    );
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
