import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as json from "../shared/json-shape.ts";

/** Checks project identity without changing files or hosted settings. */
export function personalizationProblems(root: string, repositoryUrl: string): string[] {
  const manifest = json.parseJson(
    readFileSync(join(root, "package.json"), "utf8"),
    json.object({ name: json.string }),
    "package.json",
  );
  const html = readFileSync(join(root, "index.html"), "utf8");
  const owners = readFileSync(join(root, ".github/CODEOWNERS"), "utf8")
    .split("\n")
    .map((line) => line.split("#")[0]?.trim() ?? "")
    .filter((line) => line.startsWith("* ") || line.startsWith("*\t"))
    .flatMap((line) => line.split(/\s+/u).slice(1));
  const problems: string[] = [];
  if (
    owners.length === 0 ||
    owners.some(
      (owner) => !/^@[a-z\d](?:[a-z\d-]*[a-z\d])?(?:\/[a-z\d][a-z\d_.-]*)?$/iu.test(owner),
    )
  ) {
    problems.push(".github/CODEOWNERS: set a global * owner using @user or @org/team.");
  }
  const repository = new URL(repositoryUrl);
  const owner = repository.pathname.split("/")[1]?.toLowerCase();
  if (
    repository.href.replace(/\/$/u, "").toLowerCase() ===
    "https://github.com/saschabrunnerch/agentic-starter-ts"
  ) {
    return problems;
  }
  if (
    owner !== "saschabrunnerch" &&
    owners.some((value) => value.toLowerCase() === "@saschabrunnerch")
  ) {
    problems.push(
      ".github/CODEOWNERS: replace the inherited template owner with the project's owner.",
    );
  }
  if (manifest.name.trim() === "" || manifest.name === "agentic-starter-ts") {
    problems.push("package.json: replace the template name with the project's package name.");
  }
  const title = /<title\b[^>]*>([\s\S]*?)<\/title>/iu.exec(html)?.[1]?.trim();
  if (!title || title === "Application") {
    problems.push("index.html: set the product's title.");
  }
  const description = [...html.matchAll(/<meta\b[^>]*>/giu)].find((match) =>
    /\bname\s*=\s*["']description["']/iu.test(match[0]),
  )?.[0];
  const content =
    description === undefined
      ? undefined
      : /\bcontent\s*=\s*(["'])([\s\S]*?)\1/iu.exec(description)?.[2]?.trim();
  if (!content || content === "Replace this description with one sentence about the application.") {
    problems.push("index.html: replace the template description with a product description.");
  }
  return problems;
}
