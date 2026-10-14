import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { headingAnchors, localLinks } from "./markdown-links.ts";

// Agents and people find the rules through links. A link to a file or heading
// that is gone silently removes a rule, so every local link must resolve.
const root = resolve(import.meta.dirname, "..");
const files = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "*.md"], {
  cwd: root,
  encoding: "utf8",
})
  .stdout.split("\n")
  .filter((file) => file !== "" && existsSync(resolve(root, file)));

const anchorsOf = new Map<string, Set<string>>();
function anchors(path: string): Set<string> {
  let known = anchorsOf.get(path);
  if (known === undefined) {
    known = headingAnchors(readFileSync(path, "utf8"));
    anchorsOf.set(path, known);
  }
  return known;
}

const failures: string[] = [];
let checked = 0;
for (const file of files) {
  const source = resolve(root, file);
  for (const link of localLinks(readFileSync(source, "utf8"))) {
    checked += 1;
    const target = link.path === "" ? source : resolve(dirname(source), link.path);
    const shown = `${link.path}${link.anchor === undefined ? "" : `#${link.anchor}`}`;
    if (!existsSync(target)) failures.push(`${file}: ${shown} does not exist`);
    else if (
      link.anchor !== undefined &&
      link.anchor !== "" &&
      statSync(target).isFile() &&
      target.endsWith(".md") &&
      !anchors(target).has(link.anchor.toLowerCase())
    ) {
      failures.push(`${file}: ${shown} names a heading that does not exist`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`PASS · ${checked} local links in ${files.length} Markdown files resolve`);
}
