import { existsSync } from "node:fs";
import { readdir, readFile, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { agentSettingsPath, agentSettingsProblems } from "./agent-settings.ts";
import { claudeSkillsDirectory, skillProblems, skillsDirectory } from "./agent-skills.ts";
import * as json from "./json-shape.ts";
import {
  guardrailRows,
  instructionByteLimit,
  otherInstructionFiles,
  pointerFiles,
  rowProblems,
} from "./agent-entry-points.ts";

const root = resolve(import.meta.dirname, "..");
const failures: string[] = [];

for (const [path, expected] of Object.entries(pointerFiles)) {
  const actual = await readFile(resolve(root, path), "utf8").catch(() => undefined);
  if (actual === undefined) failures.push(`${path} is missing; it must point to AGENTS.md`);
  else if (actual !== expected) {
    failures.push(`${path} must contain only its pointer to AGENTS.md; move rules into AGENTS.md`);
  }
}

for (const path of otherInstructionFiles) {
  if (existsSync(resolve(root, path)) && !(path in pointerFiles)) {
    failures.push(
      `${path} is an instruction file outside AGENTS.md; move its rules into AGENTS.md, or register it as a pointer in scripts/agent-entry-points.ts`,
    );
  }
}

const agentSettings = await readFile(resolve(root, agentSettingsPath), "utf8").catch(
  () => undefined,
);
if (agentSettings === undefined) failures.push(`${agentSettingsPath} is missing`);
else {
  for (const problem of agentSettingsProblems(agentSettings)) {
    failures.push(`${agentSettingsPath} ${problem}`);
  }
}

const skills = existsSync(resolve(root, skillsDirectory))
  ? await readdir(resolve(root, skillsDirectory))
  : [];
for (const name of skills) {
  const path = `${skillsDirectory}/${name}`;
  const optional = (file: string) =>
    readFile(resolve(root, path, file), "utf8").catch(() => undefined);
  for (const problem of skillProblems(
    name,
    await optional("SKILL.md"),
    await optional("agents/openai.yaml"),
  )) {
    failures.push(`${path} ${problem}`);
  }
  const target = await realpath(resolve(root, claudeSkillsDirectory, name)).catch(() => undefined);
  if (target !== resolve(root, path)) {
    failures.push(`${claudeSkillsDirectory}/${name} must be a link to ../../${path}`);
  }
}
const claudeSkills = existsSync(resolve(root, claudeSkillsDirectory))
  ? await readdir(resolve(root, claudeSkillsDirectory))
  : [];
for (const name of claudeSkills.filter((entry) => !skills.includes(entry))) {
  failures.push(
    `${claudeSkillsDirectory}/${name} is a skill only Claude Code reads; move it to ${skillsDirectory}/${name} and link it`,
  );
}

const manifest = json.parseJson(
  await readFile(resolve(root, "package.json"), "utf8"),
  json.object({ scripts: json.optional(json.record(json.string)) }),
  "package.json",
);
const known = {
  scripts: new Set(Object.keys(manifest.scripts ?? {})),
  pathExists: (path: string) => existsSync(resolve(root, path)),
};
const agents = await readFile(resolve(root, "AGENTS.md"), "utf8");
const agentsBytes = Buffer.byteLength(agents);
if (agentsBytes > instructionByteLimit) {
  failures.push(
    `AGENTS.md is ${agentsBytes} bytes, above ${instructionByteLimit}; shorten the cells of the guardrail table and move explanations into pages under engineering/, which AGENTS.md links`,
  );
}
const rows = guardrailRows(agents);
if (rows.length === 0) failures.push("AGENTS.md has no guardrail table under ## Guardrails");
for (const row of rows) {
  for (const problem of rowProblems(row, known)) {
    failures.push(`AGENTS.md guardrail "${row.rule}" ${problem}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `PASS · ${Object.keys(pointerFiles).length} pointer files match; ${skills.length} skills run only when named; ${rows.length} guardrail rows name existing mechanisms`,
  );
}
