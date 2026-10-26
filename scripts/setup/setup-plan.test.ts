import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { githubSetupPlan, previewsSetupPlan, printSetupPlan } from "./setup-plan.ts";
import { priorityOptions, statusOptions, views } from "./setup-configuration.ts";
import * as json from "../shared/json-shape.ts";

const source = resolve(import.meta.dirname, "../..");
const repo = "example-owner/product";
const base = `repos/${repo}`;
const preview = `${base}-previews`;
const fixtures: string[] = [];
afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "hosted-plan-"));
  fixtures.push(root);
  cpSync(join(source, ".github"), join(root, ".github"), { recursive: true });
  writeFileSync(join(root, ".github/CODEOWNERS"), "* @example-owner\n");
  writeFileSync(join(root, "package.json"), '{"name":"product"}');
  writeFileSync(
    join(root, "index.html"),
    '<title>Product</title><meta name="description" content="Product description">',
  );
  mkdirSync(join(root, "bin"));
  writeFileSync(join(root, "bin/package.json"), '{"type":"commonjs"}');
  writeFileSync(
    join(root, "bin/gh"),
    `#!${process.execPath}\n${readFileSync(join(source, "scripts/setup/fixtures/hosted-cli.txt"), "utf8")}`,
    { mode: 0o755 },
  );
  writeFileSync(
    join(root, "bin/ssh-keygen"),
    `#!${process.execPath}\nrequire('node:fs').appendFileSync('calls.jsonl','KEYGEN SENTINEL\\n');process.exit(76);`,
    { mode: 0o755 },
  );
  const labels = json.parseJson(
    readFileSync(join(root, ".github/labels.json"), "utf8"),
    json.array(json.object({ name: json.string, color: json.string, description: json.string })),
    "labels",
  );
  const responses: Record<string, unknown> = {
    repository: {
      id: "repository-id",
      name: "product",
      nameWithOwner: repo,
      url: `https://github.com/${repo}`,
      owner: { login: "example-owner" },
      visibility: "PUBLIC",
      squashMergeAllowed: true,
      mergeCommitAllowed: false,
      rebaseMergeAllowed: false,
      deleteBranchOnMerge: true,
    },
    scopes: "x-oauth-scopes: repo, project\n",
    labels,
    owner: {
      data: {
        repositoryOwner: {
          id: "owner-id",
          projectsV2: {
            nodes: [
              {
                id: "project-id",
                number: 1,
                title: "product",
                url: "https://github.com/users/example-owner/projects/1",
                closed: false,
              },
            ],
          },
        },
      },
    },
    linked: { data: { repository: { projectsV2: { nodes: [{ id: "project-id" }] } } } },
    project: {
      data: {
        node: {
          fields: {
            nodes: [
              {
                id: "status",
                name: "Status",
                options: statusOptions.map((o, i) => ({ ...o, id: `status-${i}` })),
              },
              {
                id: "priority",
                name: "Priority",
                options: priorityOptions.map((o, i) => ({ ...o, id: `priority-${i}` })),
              },
            ],
          },
          views: {
            nodes: views.map(([name, layout, filter], i) => ({
              id: `view-${i}`,
              name,
              layout,
              filter,
            })),
          },
        },
      },
    },
    [`${base}/vulnerability-alerts`]: "",
    [`${base}/automated-security-fixes`]: { enabled: true },
    [`${base}/actions/permissions/workflow`]: {
      default_workflow_permissions: "read",
      can_approve_pull_request_reviews: false,
    },
    [base]: {
      security_and_analysis: {
        secret_scanning: { status: "enabled" },
        secret_scanning_push_protection: { status: "enabled" },
      },
    },
    [`${base}/pages`]: { build_type: "workflow" },
    [`${base}/immutable-releases`]: { enabled: true },
    [`${base}/private-vulnerability-reporting`]: { enabled: true },
    [`${base}/actions/variables?per_page=100`]: [
      { variables: [{ name: "PAGES_DEPLOYMENT_ENABLED", value: "false" }] },
    ],
    [preview]: { id: 123 },
    [`${preview}/branches/gh-pages`]: { name: "gh-pages" },
    [`${preview}/pages`]: { html_url: "https://example-owner.github.io/product-previews/" },
    [`${preview}/keys`]: [{ id: 1, title: `previews from ${repo}` }],
    environmentSecrets: [{ name: "PREVIEWS_DEPLOY_KEY" }],
    repositorySecrets: [],
    variables: [
      { name: "PREVIEWS_REPOSITORY", value: `${repo}-previews` },
      { name: "PREVIEWS_URL", value: "https://example-owner.github.io/product-previews/" },
    ],
  };
  for (const name of ["github-pages", "browser-farm", "previews"]) {
    responses[`${base}/environments/${name}`] = {
      deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
    };
    responses[`${base}/environments/${name}/deployment-branch-policies`] = {
      branch_policies: [{ name: "main", type: "branch" }],
    };
  }
  const rules = ["main-integrity.json", "main-review.json", "release-tags.json"].map((file) =>
    json.parseJson(
      readFileSync(join(root, ".github/rulesets", file), "utf8"),
      json.object({ name: json.string }),
      file,
    ),
  );
  responses[`${base}/rulesets`] = rules.map((rule, i) => ({ id: i + 1, name: rule.name }));
  for (const [i, file] of [
    "main-integrity.json",
    "main-review.json",
    "release-tags.json",
  ].entries())
    responses[`${base}/rulesets/${i + 1}`] = JSON.parse(
      readFileSync(join(root, ".github/rulesets", file), "utf8"),
    );
  function save(readOnly = true) {
    writeFileSync(join(root, "hosted.json"), JSON.stringify({ responses, readOnly }));
  }
  function read(args: readonly string[]) {
    const result = spawnSync(join(root, "bin/gh"), args, { cwd: root, encoding: "utf8" });
    if (result.status !== 0) throw new Error(result.stderr);
    return result.stdout;
  }
  function cli(entry: string, args: readonly string[] = []) {
    if (!readFileSync(join(root, "package.json"), "utf8").includes('"type"')) {
      cpSync(join(source, "scripts"), join(root, "scripts"), { recursive: true });
      writeFileSync(join(root, "package.json"), '{"name":"product","type":"module"}');
    }
    return spawnSync(process.execPath, [join(root, "scripts/setup", entry), ...args], {
      cwd: root,
      env: { ...process.env, PATH: join(root, "bin") },
      encoding: "utf8",
    });
  }
  save();
  return { root, responses, save, read, cli };
}

it("reports both fully configured setups unchanged, preserves a disabled Pages choice and renders a successful plan", () => {
  const f = fixture();
  const github = githubSetupPlan(f.root, f.read),
    previews = previewsSetupPlan(f.root, f.read);
  expect([...github.items, ...previews.items].every((i) => i.status === "unchanged")).toBe(true);
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  expect(printSetupPlan(github)).toBe(true);
  expect(log).toHaveBeenCalledWith(expect.stringContaining("No changes applied"));
});
it("defers dependent resources when the Project, environments and preview repository do not exist", () => {
  const f = fixture();
  f.responses.owner = { data: { repositoryOwner: { projectsV2: { nodes: [] } } } };
  for (const path of [
    preview,
    `${base}/environments/github-pages`,
    `${base}/environments/browser-farm`,
    `${base}/environments/previews`,
    `${base}/pages`,
    `${base}/vulnerability-alerts`,
    `${base}/immutable-releases`,
    `${base}/private-vulnerability-reporting`,
  ])
    f.responses[path] = { httpError: 404 };
  f.responses[`${base}/rulesets`] = [];
  f.responses[`${base}/actions/variables?per_page=100`] = [{ variables: [] }];
  f.responses[base] = {};
  f.responses.labels = [];
  f.responses.environmentSecrets = [];
  f.save();
  const github = githubSetupPlan(f.root, f.read),
    previews = previewsSetupPlan(f.root, f.read);
  expect(
    github.items.some(
      (item) => item.status === "deferred" && item.description.includes("no future IDs"),
    ),
  ).toBe(true);
  expect(
    previews.items.some(
      (item) => item.status === "deferred" && item.description.includes("actual Pages URL"),
    ),
  ).toBe(true);
  expect(github.items.some((i) => i.description.includes("create ruleset"))).toBe(true);
  expect(readFileSync(join(f.root, "calls.jsonl"), "utf8")).not.toContain(`${preview}/keys`);
});
it("reports drift, missing fields/views, custom options and unsafe branch policies without removing them", () => {
  const f = fixture();
  f.responses.linked = { data: { repository: { projectsV2: { nodes: [] } } } };
  f.responses.project = {
    data: {
      node: {
        fields: { nodes: [{ id: "priority", name: "Priority", options: [{ name: "Custom" }] }] },
        views: { nodes: [] },
      },
    },
  };
  f.responses[`${base}/environments/github-pages`] = { deployment_branch_policy: null };
  f.responses[`${base}/environments/github-pages/deployment-branch-policies`] = {
    branch_policies: [
      { name: "main", type: "tag" },
      { name: "feature", type: "branch" },
    ],
  };
  f.responses[`${base}/rulesets/1`] = {
    name: "main-integrity",
    enforcement: "disabled",
    target: "branch",
    rules: [],
  };
  f.responses[`${base}/actions/variables?per_page=100`] = [{ variables: [] }];
  f.responses[`${base}/automated-security-fixes`] = { enabled: false };
  f.responses[`${base}/actions/permissions/workflow`] = {
    default_workflow_permissions: "write",
    can_approve_pull_request_reviews: true,
  };
  f.save();
  const plan = githubSetupPlan(f.root, f.read);
  expect(plan.items.filter((i) => i.status === "blocked")).toHaveLength(3);
  expect(
    plan.items.some((item) => item.status === "change" && item.description.includes("P2, Custom")),
  ).toBe(true);
  vi.spyOn(console, "log").mockImplementation(() => {});
  expect(printSetupPlan(plan)).toBe(false);
});
it("plans missing Priority and Todo migration while preserving custom Status options", () => {
  const f = fixture();
  f.responses.project = {
    data: {
      node: {
        fields: {
          nodes: [
            { id: "status", name: "Status", options: [{ name: "Todo" }, { name: "Custom" }] },
          ],
        },
        views: { nodes: [{ name: "Ready", layout: "BOARD_LAYOUT", filter: null }] },
      },
    },
  };
  f.responses[`${base}/actions/variables?per_page=100`] = [
    { variables: [] },
    { variables: [{ name: "OTHER", value: "x" }] },
  ];
  f.save();
  const plan = githubSetupPlan(f.root, f.read);
  expect(
    plan.items.filter((i) => i.description.includes("Project") && i.status === "change").length,
  ).toBeGreaterThan(2);
  expect(
    plan.items.some(
      (item) =>
        item.status === "change" && item.description.includes("PAGES_DEPLOYMENT_ENABLED=true"),
    ),
  ).toBe(true);
});
it("plans preview branch, Pages, secret-pair and variable repair without generating keys", () => {
  const f = fixture();
  f.responses[`${preview}/branches/gh-pages`] = { httpError: 404 };
  f.responses[`${preview}/pages`] = { httpError: 404 };
  f.responses[`${preview}/keys`] = [
    { id: 1, title: `previews from ${repo}` },
    { id: 2, title: `previews from ${repo}` },
    { id: 3, title: "unrelated" },
  ];
  f.responses.environmentSecrets = [];
  f.responses.repositorySecrets = [{ name: "PREVIEWS_DEPLOY_KEY" }];
  f.responses.variables = [];
  f.save();
  const plan = previewsSetupPlan(f.root, f.read);
  expect(
    plan.items.some(
      (item) => item.status === "deferred" && item.description.includes("replace 2 matching keys"),
    ),
  ).toBe(true);
  expect(plan.items.filter((i) => i.status === "change")).toHaveLength(4);
  expect(readFileSync(join(f.root, "calls.jsonl"), "utf8")).not.toMatch(
    /KEYGEN|secret.*set|mutation/u,
  );
});
it.each([403, 401, 429, 500])("propagates HTTP %i without treating it as absence", (code) => {
  const f = fixture();
  f.responses[preview] = { httpError: code };
  f.save();
  expect(() => previewsSetupPlan(f.root, f.read)).toThrow(`HTTP ${code}`);
});
it("rejects malformed hosted JSON and missing scopes", () => {
  const f = fixture();
  f.responses[`${preview}/keys`] = "not-json";
  f.save();
  expect(() => previewsSetupPlan(f.root, f.read)).toThrow("did not return JSON");
  f.responses.scopes = "x-oauth-scopes: repo\n";
  f.save();
  expect(() => githubSetupPlan(f.root, f.read)).toThrow("Missing GitHub scopes: project");
});
it("validates labels before reads and personalization after the identity read", () => {
  const f = fixture();
  const read = vi.fn(f.read);
  writeFileSync(join(f.root, ".github/labels.json"), "[]");
  expect(() => githubSetupPlan(f.root, read)).toThrow();
  expect(read).not.toHaveBeenCalled();
  writeFileSync(join(f.root, "package.json"), '{"name":"agentic-starter-ts"}');
  expect(() => previewsSetupPlan(f.root, read)).toThrow("package.json");
  expect(read).toHaveBeenCalledTimes(1);
});
it.each(["setup-github.ts", "setup-previews.ts"])(
  "%s dry-run uses only the read-only CLI surface",
  (entry) => {
    const f = fixture();
    f.responses.environmentSecrets = [];
    f.save();
    const result = f.cli(entry, ["--dry-run"]);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("No changes applied");
  },
);
function differences(entry: string) {
  const f = fixture();
  if (entry === "setup-github.ts") {
    const configured = json.parseJson(
      JSON.stringify(f.responses.labels),
      json.array(json.object({ name: json.string, color: json.string, description: json.string })),
      "fixture labels",
    );
    // One missing label and one changed label exercise both reconciliation paths.
    f.responses.labels = configured
      .slice(1)
      .map((label, index) =>
        index === 0 ? { ...label, color: "ffffff", description: "Outdated" } : label,
      );
    f.responses.repository = {
      id: "repository-id",
      name: "product",
      nameWithOwner: repo,
      url: `https://github.com/${repo}`,
      owner: { login: "example-owner" },
      squashMergeAllowed: false,
      mergeCommitAllowed: true,
      rebaseMergeAllowed: true,
      deleteBranchOnMerge: false,
    };
  } else {
    f.responses.variables = [];
    f.responses.repositorySecrets = [{ name: "PREVIEWS_DEPLOY_KEY" }];
  }
  return f;
}
it.each(["setup-github.ts", "setup-previews.ts"])(
  "%s applies the differences reported by its plan",
  (entry) => {
    const f = differences(entry);
    f.save();
    const before = f.cli(entry, ["--dry-run"]);
    expect(before.status, before.stderr).toBe(0);
    expect(before.stdout).toContain("[change]");
    f.save(false);
    const applied = f.cli(entry);
    expect(applied.status, applied.stderr).toBe(0);
    expect(applied.stdout).not.toContain("No changes");
    if (entry === "setup-github.ts") {
      expect(before.stdout).toContain("update label");
      expect(before.stdout).toContain("create label");
      expect(applied.stdout).toContain("updated");
      expect(applied.stdout).toContain("created");
      expect(applied.stdout).toContain("merge settings set to squash only");
    } else {
      expect(before.stdout).toContain("remove legacy repository-level");
      expect(applied.stdout).toContain("repository secret PREVIEWS_DEPLOY_KEY removed");
      expect(applied.stdout).toContain("variable PREVIEWS_URL set");
    }
  },
);
it.each(["setup-github.ts", "setup-previews.ts"])(
  "%s becomes a no-op after applying differences",
  (entry) => {
    const f = differences(entry);
    f.save(false);
    const first = f.cli(entry);
    expect(first.status, first.stderr).toBe(0);
    expect(first.stdout).not.toContain("No changes");
    const second = f.cli(entry);
    expect(second.status, second.stderr).toBe(0);
    expect(second.stdout).toContain("No changes");
  },
);

it.each(["setup-github.ts", "setup-previews.ts"])(
  "%s plans missing resources without dependent reads or writes",
  (entry) => {
    const f = fixture();
    f.responses.owner = { data: { repositoryOwner: { projectsV2: { nodes: [] } } } };
    f.responses[preview] = { httpError: 404 };
    f.responses[`${base}/environments/previews`] = { httpError: 404 };
    f.save();
    const result = f.cli(entry, ["--dry-run"]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("[deferred]");
    expect(result.stdout).toContain("No changes applied");
  },
);
it("returns a nonzero CLI status for blocked plans and permission failures", () => {
  const f = fixture();
  f.responses[`${base}/environments/previews/deployment-branch-policies`] = {
    branch_policies: [{ name: "main", type: "tag" }],
  };
  f.save();
  const blocked = f.cli("setup-previews.ts", ["--dry-run"]);
  expect(blocked.status).toBe(1);
  expect(blocked.stdout).toContain("[blocked]");
  f.responses[preview] = { httpError: 403 };
  f.save();
  const denied = f.cli("setup-previews.ts", ["--dry-run"]);
  expect(denied.status).toBe(1);
  expect(denied.stderr).toContain("HTTP 403");
  expect(denied.stdout).not.toContain("No changes applied");
});
