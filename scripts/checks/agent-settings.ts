/** The committed settings file of Claude Code. Other tools ignore it. */
export const agentSettingsPath = ".claude/settings.json";

/** Denials the file must keep: every dotenv file at any depth, and shell fetches. */
export const requiredDenials = [
  "Read(**/.env)",
  "Read(**/.env.*)",
  "Bash(curl:*)",
  "Bash(wget:*)",
] as const;

/**
 * Why a committed agent settings file is not acceptable. It may only take permissions
 * away: a rule that grants one, a hook or any other setting would change what an agent
 * may do for everyone who clones the repository, through an ordinary commit.
 */
export function agentSettingsProblems(source: string): string[] {
  let settings: unknown;
  try {
    settings = JSON.parse(source);
  } catch {
    return ["is not valid JSON"];
  }
  if (settings === null || typeof settings !== "object" || Array.isArray(settings)) {
    return ["is not a JSON object"];
  }
  const problems: string[] = [];
  for (const key of Object.keys(settings)) {
    if (key !== "permissions") problems.push(`sets "${key}"; only permissions.deny is allowed`);
  }
  const permissions = (settings as { permissions?: unknown }).permissions;
  if (permissions === null || typeof permissions !== "object" || Array.isArray(permissions)) {
    problems.push("has no permissions object");
    return problems;
  }
  for (const key of Object.keys(permissions)) {
    if (key !== "deny") problems.push(`sets permissions.${key}; only permissions.deny is allowed`);
  }
  const deny = (permissions as { deny?: unknown }).deny;
  if (!Array.isArray(deny) || deny.length === 0 || deny.some((rule) => typeof rule !== "string")) {
    problems.push("permissions.deny must be a non-empty list of rules");
  } else {
    const missing = requiredDenials.filter((rule) => !deny.includes(rule));
    if (missing.length > 0) problems.push(`permissions.deny lacks ${missing.join(", ")}`);
  }
  return problems;
}
