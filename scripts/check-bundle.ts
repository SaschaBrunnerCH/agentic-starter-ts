import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { budgetKinds, budgetProblems, totals } from "./bundle-budget.ts";
import * as json from "./json-shape.ts";

// Checks the gzip size of the production build in dist/ against bundle-budget.json.
// Run after `pnpm build`.

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)],
  );
}

try {
  const limits = json.parseJson(
    readFileSync(resolve(root, "bundle-budget.json"), "utf8"),
    json.object({ javascript: json.number, css: json.number, html: json.number }),
    "bundle-budget.json",
  );
  const built = files(dist).map((path) => ({
    path: relative(dist, path),
    gzipBytes: gzipSync(readFileSync(path)).length,
  }));
  const sums = totals(built);
  for (const kind of budgetKinds) {
    console.log(
      `${kind.padEnd(10)} ${String(sums[kind]).padStart(7)} of ${limits[kind]} gzip bytes`,
    );
  }
  const problems = budgetProblems(sums, limits);
  if (problems.length > 0) {
    console.error(`\nOver budget: ${problems.join("; ")}. See bundle-budget.json.`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(
    error instanceof Error && "code" in error && error.code === "ENOENT"
      ? `No build to measure (${error.message}); run pnpm build first.`
      : error instanceof Error
        ? error.message
        : error,
  );
  process.exitCode = 1;
}
