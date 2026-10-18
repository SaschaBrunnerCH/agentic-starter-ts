/**
 * `AGENTS.md` is the one instruction source. Codex, GitHub Copilot's coding
 * agent, Cursor and others read it directly; tools with their own file name
 * get a pointer file whose exact content is fixed here.
 */
export const pointerFiles: Readonly<Record<string, string>> = {
  "CLAUDE.md": "@AGENTS.md\n",
  ".github/copilot-instructions.md":
    "Follow the repository instructions in [AGENTS.md](../AGENTS.md). This file adds nothing to them.\n",
  // Gemini CLI reads GEMINI.md unless its settings name another file.
  ".gemini/settings.json": '{\n  "context": {\n    "fileName": "AGENTS.md"\n  }\n}\n',
};

/**
 * Files other tools read as instructions. One that exists must be registered above as a
 * pointer; otherwise rules would live outside AGENTS.md without any check.
 */
export const otherInstructionFiles = [
  "GEMINI.md",
  "AGENT.md",
  "CLAUDE.local.md",
  ".claude/CLAUDE.md",
  ".claude/rules",
  ".clinerules",
  ".junie",
  ".cursorrules",
  ".cursor/rules",
  // Hermes Agent reads it instead of AGENTS.md.
  ".hermes.md",
  ".windsurfrules",
  ".github/instructions",
] as const;

/**
 * Codex stops reading project instructions at 32 KiB, and other tools recommend far less.
 * Shorten the guardrail table and move explanations into engineering/ pages before this is reached.
 */
export const instructionByteLimit = 16 * 1024;

export type GuardrailRow = Readonly<{ rule: string; mechanism: string; status: string }>;

const guardrailStatuses = ["Enforced", "Mixed", "Review-only", "Advisory"] as const;

/** What counts as a mechanism: code, hooks, workflows and hosted configuration. A document enforces nothing. */
const enforcingPrefixes = [
  "scripts/",
  ".githooks/",
  ".github/workflows/",
  ".github/rulesets/",
  ".github/dependabot.yml",
  ".claude/settings.json",
];

/** Reads the rows of the table under the "## Guardrails" heading. */
export function guardrailRows(agentsMarkdown: string): GuardrailRow[] {
  const section = /^## Guardrails\n([\s\S]*?)(?=^## )/mu.exec(agentsMarkdown)?.[1] ?? "";
  return section
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .slice(2)
    .map((line) => {
      const cells = line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim());
      return { rule: cells[0] ?? "", mechanism: cells[1] ?? "", status: cells[2] ?? "" };
    });
}

/** Commands of pnpm itself, which name no script of package.json. */
const pnpmCommands = new Set(["install", "exec", "audit", "licenses", "sbom", "add", "update"]);

/** The `pnpm <script>` commands and repository paths a mechanism cell names in backticks. */
export function mechanismReferences(mechanism: string): { scripts: string[]; paths: string[] } {
  const scripts: string[] = [];
  const paths: string[] = [];
  for (const [, code] of mechanism.matchAll(/`([^`]+)`/gu)) {
    if (code === undefined) continue;
    const script = /^pnpm (?:run )?([\w:-]+)(?: [^`]*)?$/u.exec(code)?.[1];
    if (script !== undefined) {
      if (!pnpmCommands.has(script)) scripts.push(script);
    } else if (/^[\w.-]+(?:\/[\w.-]+)*\.\w+$/u.test(code) || code.includes("/")) paths.push(code);
  }
  return { scripts, paths };
}

/** Problems in one row: an unknown status, or an automated status with nothing to run. */
export function rowProblems(
  row: GuardrailRow,
  known: Readonly<{ scripts: ReadonlySet<string>; pathExists: (path: string) => boolean }>,
): string[] {
  const problems: string[] = [];
  if (!(guardrailStatuses as readonly string[]).includes(row.status)) {
    problems.push(`unknown status "${row.status}"`);
  }
  const { scripts, paths } = mechanismReferences(row.mechanism);
  for (const script of scripts) {
    if (!known.scripts.has(script)) problems.push(`names missing script "${script}"`);
  }
  for (const path of paths) {
    if (!known.pathExists(path)) problems.push(`names missing path "${path}"`);
  }
  const enforcing = paths.filter((path) =>
    enforcingPrefixes.some((prefix) => path.startsWith(prefix)),
  );
  if (
    (row.status === "Enforced" || row.status === "Mixed") &&
    scripts.length + enforcing.length === 0
  ) {
    problems.push(`is ${row.status} but names no script, hook, workflow or ruleset`);
  }
  return problems;
}
