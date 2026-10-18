// The decisions of `pnpm check:bundle`, kept apart from the file system so they can be
// tested. See engineering/agents/local-verification.md.

export const budgetKinds = ["javascript", "css", "html"] as const;
export type BudgetKind = (typeof budgetKinds)[number];

/** The kind a built file counts towards, or undefined for files without a budget. */
export function budgetKind(path: string): BudgetKind | undefined {
  if (/\.m?js$/u.test(path)) return "javascript";
  if (path.endsWith(".css")) return "css";
  if (path.endsWith(".html")) return "html";
  return undefined;
}

/** Gzip sizes summed by kind. */
export function totals(files: readonly { path: string; gzipBytes: number }[]) {
  const sums: Record<BudgetKind, number> = { javascript: 0, css: 0, html: 0 };
  for (const file of files) {
    const kind = budgetKind(file.path);
    if (kind !== undefined) sums[kind] += file.gzipBytes;
  }
  return sums;
}

/** The kinds over their limit. */
export function budgetProblems(
  sums: Readonly<Record<BudgetKind, number>>,
  limits: Readonly<Record<BudgetKind, number>>,
): string[] {
  return budgetKinds
    .filter((kind) => sums[kind] > limits[kind])
    .map((kind) => `${kind} is ${sums[kind]} gzip bytes, above its budget of ${limits[kind]}`);
}
