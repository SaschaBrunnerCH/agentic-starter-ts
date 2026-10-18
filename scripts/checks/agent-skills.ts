/**
 * Skills live once under `.agents/skills/<name>/`, where Codex reads them; Claude Code reads
 * them through a link `.claude/skills/<name>`. Every skill runs only when a person names it,
 * never on the agent's own decision.
 */
export const skillsDirectory = ".agents/skills";
export const claudeSkillsDirectory = ".claude/skills";

/** The frontmatter of a SKILL.md, as its lines, or undefined without one. */
function frontmatter(skill: string): string[] | undefined {
  const match = /^---\n([\s\S]*?)\n---\n/u.exec(skill);
  return match?.[1]?.split("\n");
}

/**
 * What keeps one skill manual-only: its SKILL.md for Claude Code and its
 * `agents/openai.yaml` for Codex.
 */
export function skillProblems(
  name: string,
  skill: string | undefined,
  openaiYaml: string | undefined,
): string[] {
  if (skill === undefined) return ["has no SKILL.md"];
  const fields = frontmatter(skill);
  if (fields === undefined) return ["SKILL.md has no frontmatter"];
  const problems: string[] = [];
  if (!fields.includes(`name: ${name}`)) problems.push(`SKILL.md does not name itself ${name}`);
  if (!fields.includes("disable-model-invocation: true")) {
    problems.push("SKILL.md lacks disable-model-invocation: true, so Claude Code may start it");
  }
  if (openaiYaml === undefined || !/^ {2}allow_implicit_invocation: false$/mu.test(openaiYaml)) {
    problems.push(
      "agents/openai.yaml lacks policy.allow_implicit_invocation: false, so Codex may start it",
    );
  }
  return problems;
}
