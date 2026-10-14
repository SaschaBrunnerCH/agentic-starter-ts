// The decisions of `pnpm check:dependencies`, kept apart from git and pnpm so they
// can be tested. See engineering/agents/dependency-automation.md.

/** The `name@version` entries of a pnpm lockfile's `packages` section. */
export function lockedPackages(lockfile: string): Set<string> {
  const found = new Set<string>();
  let inPackages = false;
  for (const line of lockfile.split("\n")) {
    if (/^\S/u.test(line)) inPackages = line === "packages:";
    else if (inPackages) {
      const entry = /^ {2}'?([^\s'][^']*?)'?:$/u.exec(line)?.[1];
      if (entry !== undefined) found.add(entry);
    }
  }
  return found;
}

/** Splits `@scope/name@1.2.3` into its name and version. */
export function splitEntry(entry: string): { name: string; version: string } {
  const at = entry.lastIndexOf("@");
  return at <= 0
    ? { name: entry, version: "" }
    : { name: entry.slice(0, at), version: entry.slice(at + 1) };
}

export type DependencyChange = Readonly<{
  name: string;
  version: string;
  /** The versions the base had of the same package; empty when it is new. */
  previous: readonly string[];
}>;

/** Package versions in `head` that `base` did not have. */
export function dependencyChanges(base: string, head: string): DependencyChange[] {
  const before = lockedPackages(base);
  const versionsBefore = new Map<string, string[]>();
  for (const entry of before) {
    const { name, version } = splitEntry(entry);
    versionsBefore.set(name, [...(versionsBefore.get(name) ?? []), version]);
  }
  return [...lockedPackages(head)]
    .filter((entry) => !before.has(entry))
    .map((entry) => {
      const { name, version } = splitEntry(entry);
      return { name, version, previous: versionsBefore.get(name) ?? [] };
    })
    .toSorted((a, b) => a.name.localeCompare(b.name));
}

function unparseable(): never {
  throw new Error("unparseable");
}

/**
 * Whether an SPDX licence expression is allowed: `A OR B` needs one allowed side,
 * `A AND B` needs both; AND binds tighter than OR, and parentheses group. `A WITH B`
 * counts as one licence, allowed only when listed as written. A missing licence or
 * an expression that does not parse is not allowed.
 */
export function licenseAllowed(expression: string, allowed: ReadonlySet<string>): boolean {
  const tokens = expression.match(/[()]|[^\s()]+/gu) ?? [];
  let position = 0;
  const peek = () => tokens[position];
  // OR and AND evaluate every side, so the whole expression is parsed.
  const either = (): boolean => {
    let result = both();
    while (peek() === "OR") {
      position += 1;
      result = both() || result;
    }
    return result;
  };
  const both = (): boolean => {
    let result = single();
    while (peek() === "AND") {
      position += 1;
      result = single() && result;
    }
    return result;
  };
  const single = (): boolean => {
    const token = tokens[position];
    position += 1;
    if (token === "(") {
      const result = either();
      if (tokens[position] !== ")") unparseable();
      position += 1;
      return result;
    }
    if (token === undefined || ["(", ")", "AND", "OR", "WITH"].includes(token)) unparseable();
    let license = token ?? "";
    if (peek() === "WITH") {
      const exception = tokens[position + 1];
      if (exception === undefined || exception === "(" || exception === ")") unparseable();
      license = `${license} WITH ${exception}`;
      position += 2;
    }
    return allowed.has(license);
  };
  try {
    const result = either();
    return position === tokens.length && result;
  } catch {
    return false;
  }
}

/**
 * Runtime dependencies whose licence is not allowed. Every runtime dependency is
 * checked, not only new versions: a package already locked as a development tool
 * becomes a runtime dependency without a new lockfile entry. A package named in
 * `allowedPackages` is accepted under any licence: the owner has recorded why.
 */
export function licenseProblems(
  runtimeLicenses: ReadonlyMap<string, string>,
  allowed: ReadonlySet<string>,
  allowedPackages: ReadonlySet<string> = new Set(),
): string[] {
  return [...runtimeLicenses]
    .filter(([entry]) => !allowedPackages.has(splitEntry(entry).name))
    .filter(([, license]) => !licenseAllowed(license, allowed))
    .map(([entry, license]) => `${entry} is a runtime dependency under "${license}"`)
    .toSorted();
}
