import { describe, expect, it } from "vitest";
import { workflowPermissionsDiffer, rulesetDrift, type Ruleset } from "./ruleset-drift.ts";

const file: Ruleset = {
  name: "Main integrity",
  target: "branch",
  enforcement: "active",
  conditions: { ref_name: { include: ["~DEFAULT_BRANCH"], exclude: [] } },
  bypass_actors: [],
  rules: [
    { type: "deletion" },
    {
      type: "required_status_checks",
      parameters: {
        strict_required_status_checks_policy: true,
        required_status_checks: [{ context: "PR build", integration_id: 15368 }],
      },
    },
  ],
};

const hosted = (change: (ruleset: Ruleset) => void): Ruleset => {
  const copy = structuredClone(file);
  // GitHub returns keys in its own order and adds defaulted parameters.
  copy.conditions = { ref_name: { exclude: [], include: ["~DEFAULT_BRANCH"] } };
  copy.rules![1]!.parameters!.do_not_enforce_on_create = false;
  change(copy);
  return copy;
};

describe("rulesetDrift", () => {
  it("accepts the hosted form of the same ruleset", () => {
    expect(
      rulesetDrift(
        file,
        hosted(() => {}),
      ),
    ).toEqual([]);
  });

  it("reports a relaxed parameter, a removed rule and an added bypass", () => {
    expect(
      rulesetDrift(
        file,
        hosted((ruleset) => {
          ruleset.rules![1]!.parameters!.strict_required_status_checks_policy = false;
          ruleset.rules!.shift();
          ruleset.bypass_actors = [
            { actor_id: 5, actor_type: "RepositoryRole", bypass_mode: "always" },
          ];
        }),
      ),
    ).toEqual([
      "bypass actors differ",
      "rule deletion is missing",
      "rule required_status_checks: strict_required_status_checks_policy differs",
    ]);
  });

  it("reports disabled enforcement, another required check and a rule the file lacks", () => {
    expect(
      rulesetDrift(
        file,
        hosted((ruleset) => {
          ruleset.enforcement = "disabled";
          ruleset.rules![1]!.parameters!.required_status_checks = [{ context: "Other" }];
          ruleset.rules!.push({ type: "required_signatures" });
        }),
      ),
    ).toEqual([
      "enforcement differs",
      "rule required_status_checks: required_status_checks differs",
      "rule required_signatures is not in the file",
    ]);
  });
});

describe("workflowPermissionsDiffer", () => {
  it("accepts a read-only token that cannot approve", () => {
    expect(
      workflowPermissionsDiffer({
        default_workflow_permissions: "read",
        can_approve_pull_request_reviews: false,
      }),
    ).toBe(false);
  });

  it("notices a writing token and an approving workflow", () => {
    expect(
      workflowPermissionsDiffer({
        default_workflow_permissions: "write",
        can_approve_pull_request_reviews: false,
      }),
    ).toBe(true);
    expect(
      workflowPermissionsDiffer({
        default_workflow_permissions: "read",
        can_approve_pull_request_reviews: true,
      }),
    ).toBe(true);
  });
});
