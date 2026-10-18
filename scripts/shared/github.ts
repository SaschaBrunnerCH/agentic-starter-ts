import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import * as json from "./json-shape.ts";
import { object, parseJson, type Shape } from "./json-shape.ts";

export const root = resolve(import.meta.dirname, "../..");

/** Runs the GitHub CLI in the repository and returns its output; throws with gh's own message. */
export function gh(args: readonly string[], input?: string): string {
  const result = spawnSync("gh", args, { cwd: root, encoding: "utf8", input });
  if (result.error) {
    throw new Error(`Could not run gh (${result.error.message}). Install the GitHub CLI.`);
  }
  if (result.status !== 0) {
    throw new Error(`gh ${args.slice(0, 3).join(" ")} failed:\n${result.stderr}${result.stdout}`);
  }
  return result.stdout;
}

/** Runs gh and checks the JSON it prints against `shape`. */
export function ghJson<T>(args: readonly string[], shape: Shape<T>, input?: string): T {
  return parseJson(gh(args, input), shape, `gh ${args.slice(0, 3).join(" ")}`);
}

function graphqlArgs(query: string, variables: Readonly<Record<string, string>>) {
  const args = ["api", "graphql", "-f", `query=${query}`];
  for (const [name, value] of Object.entries(variables)) args.push("-f", `${name}=${value}`);
  return args;
}

/** Runs a GraphQL query and checks its `data` against `shape`. */
export function graphql<T>(
  query: string,
  shape: Shape<T>,
  variables: Readonly<Record<string, string>> = {},
): T {
  return parseJson(gh(graphqlArgs(query, variables)), object({ data: shape }), "gh api graphql")
    .data;
}

/** Runs a GraphQL mutation whose result is not needed; gh fails on an error. */
export function mutation(query: string): void {
  gh(graphqlArgs(query, {}));
}

// GitHub Actions; the ruleset requires the PR build status from this app and no other.
const actionsApp = "github-actions";

/** The latest `PR build` check of GitHub Actions on a commit. */
export function prBuild(
  nameWithOwner: string,
  commit: string,
): "success" | "failure" | "pending" | "missing" {
  // One commit can have several runs; the newest one decides, and identifiers only grow.
  const runs = gh([
    "api",
    "--paginate",
    `repos/${nameWithOwner}/commits/${commit}/check-runs?check_name=PR%20build&per_page=100`,
    "--jq",
    `.check_runs[] | select(.app.slug == "${actionsApp}") | [.id, .status, .conclusion // ""] | @tsv`,
  ])
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => {
      const [id = "0", status = "", conclusion = ""] = line.split("\t");
      return { id: Number(id), status, conclusion };
    });
  const latest = runs.toSorted((a, b) => b.id - a.id)[0];
  if (latest === undefined) return "missing";
  if (latest.status !== "completed") return "pending";
  return latest.conclusion === "success" ? "success" : "failure";
}

/** A string as a GraphQL string literal. */
export const quote = (text: string) => JSON.stringify(text);

const isMain = (entry: { name: string; type?: string }) =>
  entry.name === "main" && entry.type !== "tag";

/**
 * Creates the environment `name` if it is missing and lets only the branch main use
 * it, so a workflow run from any other branch, a pull request's included, never gets
 * its secrets. Returns what it changed, and other branches someone allowed by hand.
 */
export function limitEnvironmentToMain(
  repositoryPath: string,
  name: string,
): { changes: string[]; others: string[] } {
  const changes: string[] = [];
  const environmentPath = `${repositoryPath}/environments/${name}`;
  let environment: string | undefined;
  try {
    environment = gh(["api", environmentPath]);
  } catch {
    environment = undefined;
  }
  const policy =
    environment === undefined
      ? null
      : parseJson(
          environment,
          object({
            deployment_branch_policy: json.nullable(
              object({
                protected_branches: json.boolean,
                custom_branch_policies: json.boolean,
              }),
            ),
          }),
          `gh api environments/${name}`,
        ).deployment_branch_policy;
  if (policy?.protected_branches !== false || !policy.custom_branch_policies) {
    gh(
      ["api", "-X", "PUT", environmentPath, "--input", "-"],
      JSON.stringify({
        deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
      }),
    );
    changes.push(`environment ${name} limited to chosen branches`);
  }
  const policies = ghJson(
    ["api", `${environmentPath}/deployment-branch-policies`],
    object({
      branch_policies: json.array(object({ name: json.string, type: json.optional(json.string) })),
    }),
  ).branch_policies;
  if (!policies.some(isMain)) {
    gh([
      "api",
      "-X",
      "POST",
      `${environmentPath}/deployment-branch-policies`,
      "-f",
      "name=main",
      "-f",
      "type=branch",
    ]);
    changes.push(`environment ${name} may be used from main`);
  }
  return {
    changes,
    others: policies.filter((entry) => !isMain(entry)).map((entry) => entry.name),
  };
}
