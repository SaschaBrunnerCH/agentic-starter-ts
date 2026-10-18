import { readFileSync } from "node:fs";
import * as json from "../shared/json-shape.ts";

const labelShape = json.object({ name: json.string, color: json.string, description: json.string });
export type ProjectLabel = Readonly<json.ShapeOf<typeof labelShape>>;

// These names are part of the workflow's vocabulary. Product areas are configurable.
const requiredLabels = [
  "needs-triage",
  "needs-info",
  "ready-for-agent",
  "ready-for-human",
  "wontfix",
  "bug",
  "enhancement",
  "documentation",
  "investigation",
  "verification",
  "epic",
  "decision-needed",
  "area:engineering",
];

export function parseProjectLabels(text: string, source: string): ProjectLabel[] {
  const labels = json.parseJson(text, json.array(labelShape), source);
  const names = new Set<string>();
  for (const [index, label] of labels.entries()) {
    const at = `${source}[${index}]`;
    if (!label.name.trim() || label.name !== label.name.trim() || label.name.length > 50) {
      throw new Error(`${at}.name must contain 1–50 characters without surrounding whitespace`);
    }
    if (!/^[0-9a-f]{6}$/iu.test(label.color)) {
      throw new Error(`${at}.color must be six hexadecimal digits without #`);
    }
    if (label.description.length > 100) {
      throw new Error(`${at}.description must contain at most 100 characters`);
    }
    const key = label.name.toLowerCase();
    if (names.has(key))
      throw new Error(`${at}.name duplicates label "${label.name}" (case-insensitive)`);
    names.add(key);
  }
  const missing = requiredLabels.filter((name) => !labels.some((label) => label.name === name));
  if (missing.length)
    throw new Error(`${source} is missing required workflow labels: ${missing.join(", ")}`);
  return labels.map((label) => ({ ...label, color: label.color.toLowerCase() }));
}

/** Loading is deliberately separate from all remote operations. */
export function loadProjectLabels(path: string): ProjectLabel[] {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new Error(`Cannot read label configuration ${path}; restore or create it before setup`);
  }
  return parseProjectLabels(text, path);
}

/** Only create/update configured labels. Unconfigured hosted labels are never deleted. */
export function labelChanges(configured: readonly ProjectLabel[], hosted: readonly ProjectLabel[]) {
  return configured.flatMap((label) => {
    const existing = hosted.find((candidate) => candidate.name === label.name);
    return existing?.color.toLowerCase() === label.color &&
      existing.description === label.description
      ? []
      : [{ label, exists: existing !== undefined }];
  });
}
