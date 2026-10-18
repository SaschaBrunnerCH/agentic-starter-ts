import * as json from "../shared/json-shape.ts";

/** The parts of a ruleset this comparison reads; GitHub returns more. */
export const rulesetShape = json.object({
  name: json.string,
  target: json.optional(json.string),
  enforcement: json.optional(json.string),
  conditions: json.optional(json.anything),
  bypass_actors: json.optional(
    json.array(
      json.object({
        actor_id: json.optional(json.nullable(json.number)),
        actor_type: json.optional(json.string),
        bypass_mode: json.optional(json.string),
      }),
    ),
  ),
  rules: json.optional(
    json.array(
      json.object({ type: json.string, parameters: json.optional(json.record(json.anything)) }),
    ),
  ),
});
export type Ruleset = json.ShapeOf<typeof rulesetShape>;

const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, inner: unknown) =>
    inner !== null && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner).toSorted(([a], [b]) => a.localeCompare(b)))
      : inner,
  );

/**
 * How a hosted ruleset differs from its file. GitHub adds parameters with default
 * values, so only what the file states is compared; a rule the file does not have is a difference.
 */
export function rulesetDrift(file: Ruleset, hosted: Ruleset): string[] {
  const drift: string[] = [];
  for (const key of ["target", "enforcement", "conditions"] as const) {
    if (canonical(file[key]) !== canonical(hosted[key])) drift.push(`${key} differs`);
  }
  const actors = (ruleset: Ruleset) =>
    (ruleset.bypass_actors ?? [])
      .map((actor) => `${actor.actor_type}:${actor.actor_id ?? ""}:${actor.bypass_mode}`)
      .toSorted();
  if (canonical(actors(file)) !== canonical(actors(hosted))) drift.push("bypass actors differ");

  const hostedRules = new Map((hosted.rules ?? []).map((rule) => [rule.type, rule]));
  for (const rule of file.rules ?? []) {
    const match = hostedRules.get(rule.type);
    if (match === undefined) {
      drift.push(`rule ${rule.type} is missing`);
      continue;
    }
    for (const [name, value] of Object.entries(rule.parameters ?? {})) {
      if (canonical(value) !== canonical(match.parameters?.[name])) {
        drift.push(`rule ${rule.type}: ${name} differs`);
      }
    }
    hostedRules.delete(rule.type);
  }
  for (const type of hostedRules.keys()) drift.push(`rule ${type} is not in the file`);
  return drift;
}

export const workflowPermissionsShape = json.object({
  default_workflow_permissions: json.string,
  can_approve_pull_request_reviews: json.boolean,
});
export type WorkflowPermissions = Readonly<json.ShapeOf<typeof workflowPermissionsShape>>;

/** The workflow permissions every repository gets: a token that only reads, and no approving. */
export const wantedWorkflowPermissions: WorkflowPermissions = {
  default_workflow_permissions: "read",
  can_approve_pull_request_reviews: false,
};

/** Whether the hosted workflow permissions allow more than wanted. */
export function workflowPermissionsDiffer(hosted: WorkflowPermissions): boolean {
  return (
    hosted.default_workflow_permissions !==
      wantedWorkflowPermissions.default_workflow_permissions ||
    hosted.can_approve_pull_request_reviews !==
      wantedWorkflowPermissions.can_approve_pull_request_reviews
  );
}
