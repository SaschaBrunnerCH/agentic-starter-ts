import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gh, ghJson, limitEnvironmentToMain } from "../shared/github.ts";
import * as json from "../shared/json-shape.ts";

// Sets up pull-request previews: a separate repository whose GitHub Pages site
// serves one directory per pull request, a deploy key that may push to it, kept as a
// secret of the environment "previews" that only main may use, and the variables
// .github/workflows/pr-preview.yml reads. It writes only what
// is missing, so a second run reports no changes. See engineering/operations/deployment.md.

const keySecret = "PREVIEWS_DEPLOY_KEY";
const environmentName = "previews";
const changes: string[] = [];

const answers = (args: readonly string[]) => {
  try {
    return gh(args);
  } catch {
    return undefined;
  }
};

const repository = ghJson(
  ["repo", "view", "--json", "nameWithOwner,visibility"],
  json.object({ nameWithOwner: json.string, visibility: json.string }),
);
const previews = `${repository.nameWithOwner}-previews`;
const keyTitle = `previews from ${repository.nameWithOwner}`;
console.log(`Repository: ${repository.nameWithOwner}\nPreviews:   ${previews}`);

// The repository, with the visibility of this one. Its history only ever holds builds.
if (answers(["api", `repos/${previews}`]) === undefined) {
  gh([
    "repo",
    "create",
    previews,
    `--${repository.visibility.toLowerCase()}`,
    "--add-readme",
    "--description",
    `Pull-request previews of ${repository.nameWithOwner}; written by its PR preview workflow`,
  ]);
  changes.push(`repository ${previews} created`);
}

// The gh-pages branch, started from the default branch, without Jekyll processing.
if (answers(["api", `repos/${previews}/branches/gh-pages`]) === undefined) {
  const head = ghJson(
    ["api", `repos/${previews}/commits/HEAD`],
    json.object({ sha: json.string }),
  ).sha;
  gh([
    "api",
    "-X",
    "POST",
    `repos/${previews}/git/refs`,
    "-f",
    "ref=refs/heads/gh-pages",
    "-f",
    `sha=${head}`,
  ]);
  gh([
    "api",
    "-X",
    "PUT",
    `repos/${previews}/contents/.nojekyll`,
    "-f",
    "message=Serve files as they are",
    "-f",
    "content=",
    "-f",
    "branch=gh-pages",
  ]);
  changes.push("branch gh-pages created");
}

// Pages from the gh-pages branch.
const pagesShape = json.object({ html_url: json.string });
let pages = answers(["api", `repos/${previews}/pages`]);
if (pages === undefined) {
  pages = gh(
    ["api", "-X", "POST", `repos/${previews}/pages`, "--input", "-"],
    JSON.stringify({ source: { branch: "gh-pages", path: "/" } }),
  );
  changes.push("GitHub Pages enabled from gh-pages");
}
const url = json.parseJson(pages, pagesShape, "gh api pages").html_url;

// The environment that holds the key. A repository secret would reach every workflow
// run, a pull request's own workflow changes included; an environment secret reaches
// only jobs that name the environment and run from main.
const environment = limitEnvironmentToMain(`repos/${repository.nameWithOwner}`, environmentName);
changes.push(...environment.changes);
if (environment.others.length > 0) {
  throw new Error(
    `The environment ${environmentName} also allows ${environment.others.join(", ")}; remove them in the repository's environment settings and run again.`,
  );
}

// The deploy key: write access to the previews repository and nothing else. A new
// key is made when the key or the secret is missing; the private half is never
// written outside a temporary directory.
const keys = ghJson(
  ["api", `repos/${previews}/keys`],
  json.array(json.object({ id: json.number, title: json.string })),
);
const secretNames = (args: readonly string[]) =>
  ghJson(
    ["secret", "list", ...args, "--json", "name"],
    json.array(json.object({ name: json.string })),
  ).map((secret) => secret.name);
const existing = keys.filter((key) => key.title === keyTitle);
if (existing.length !== 1 || !secretNames(["--env", environmentName]).includes(keySecret)) {
  for (const key of existing) gh(["api", "-X", "DELETE", `repos/${previews}/keys/${key.id}`]);
  const directory = mkdtempSync(join(tmpdir(), "previews-key-"));
  try {
    const file = join(directory, "key");
    const made = spawnSync(
      "ssh-keygen",
      ["-t", "ed25519", "-N", "", "-C", keyTitle, "-f", file, "-q"],
      { encoding: "utf8" },
    );
    if (made.error !== undefined || made.status !== 0) {
      throw new Error(`ssh-keygen failed: ${made.error?.message ?? made.stderr}`);
    }
    const created = ghJson(
      ["api", "-X", "POST", `repos/${previews}/keys`, "--input", "-"],
      json.object({ id: json.number }),
      JSON.stringify({
        title: keyTitle,
        key: readFileSync(`${file}.pub`, "utf8").trim(),
        read_only: false,
      }),
    );
    try {
      gh(["secret", "set", keySecret, "--env", environmentName], readFileSync(file, "utf8"));
    } catch (error) {
      // The private half is deleted below, so a key without its secret could never be
      // used, and a second run would take the pair as set up. Remove it again.
      gh(["api", "-X", "DELETE", `repos/${previews}/keys/${created.id}`]);
      throw error;
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  changes.push(
    `deploy key created and stored as the secret ${keySecret} of the environment ${environmentName}`,
  );
}
// A repository secret of the same name, from an earlier setup, would still reach
// pull-request workflows.
if (secretNames([]).includes(keySecret)) {
  gh(["secret", "delete", keySecret]);
  changes.push(`repository secret ${keySecret} removed`);
}

// The variables the workflows read.
const variables = new Map(
  ghJson(
    ["variable", "list", "--json", "name,value"],
    json.array(json.object({ name: json.string, value: json.string })),
  ).map((variable) => [variable.name, variable.value]),
);
for (const [name, value] of [
  ["PREVIEWS_REPOSITORY", previews],
  ["PREVIEWS_URL", url],
] as const) {
  if (variables.get(name) !== value) {
    gh(["variable", "set", name, "--body", value]);
    changes.push(`variable ${name} set to ${value}`);
  }
}

console.log(
  changes.length === 0 ? "\nNo changes." : `\nChanged:\n${changes.map((c) => `- ${c}`).join("\n")}`,
);
console.log(`\nPreviews will appear at ${url.replace(/\/?$/u, "/")}pr-<number>/`);
