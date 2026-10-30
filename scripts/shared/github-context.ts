/** The checkout's canonical hosted identity, as returned by gh repo view. */
export function repositoryContext(repositoryUrl: string) {
  let url: URL;
  try {
    url = new URL(repositoryUrl);
  } catch (error) {
    throw new Error("Invalid repository URL.", { cause: error });
  }
  const path = /^\/([\w.-]+)\/([\w.-]+)\/?$/u.exec(url.pathname);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || !path)
    throw new Error(
      "Repository identity must be an HTTPS owner/repository URL without credentials.",
    );
  return { hostname: url.host, repository: `${path[1]}/${path[2]}` };
}
export type RepositoryContext = ReturnType<typeof repositoryContext>;

// Skip payload/format option values before inspecting targets; body text is data,
// even when it looks like a targeting flag or URL. These are the shared callers' options.
const valueOptions = new Set([
  "--body",
  "--body-file",
  "--title",
  "--description",
  "--json",
  "--jq",
  "--template",
  "--input",
  "--method",
  "-X",
  "--header",
  "-H",
  "--field",
  "-F",
  "--raw-field",
  "-f",
  "--label",
  "--add-label",
  "--remove-label",
  "--assignee",
  "--add-assignee",
  "--remove-assignee",
  "--env",
  "--color",
  "--limit",
  "--state",
  "--search",
  "--match-head-commit",
  "--subject",
]);

export function githubArguments(args: readonly string[], context: RepositoryContext): string[] {
  const positionals: string[] = [];
  const hosts: string[] = [];
  const repositories: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index] ?? "";
    if (arg === "--") {
      positionals.push(...args.slice(index + 1));
      break;
    }
    if (valueOptions.has(arg)) {
      index++;
      continue;
    }
    const target = /^(--hostname|--repo|-R)(?:=(.*))?$/u.exec(arg);
    const attached = /^-R(.+)$/u.exec(arg);
    if (target || attached) {
      const name = target?.[1] ?? "-R";
      const value = target ? (target[2] ?? args[++index]) : attached?.[1];
      if (!value || value.startsWith("-")) throw new Error(`Missing target value for ${name}.`);
      (name === "--hostname" ? hosts : repositories).push(value);
    } else if (!arg.startsWith("-")) positionals.push(arg);
  }
  if (hosts.some((host) => host.toLowerCase() !== context.hostname))
    throw new Error(`Explicit hostname must match checkout server ${context.hostname}.`);
  const matchesRepository = (repository: string) => {
    const target = repository.startsWith("https://")
      ? repositoryContext(repository)
      : repositoryContext(
          `https://${repository.split("/").length === 2 ? `${context.hostname}/` : ""}${repository}`,
        );
    return (
      target.hostname === context.hostname &&
      target.repository.toLowerCase() === context.repository.toLowerCase()
    );
  };
  if (repositories.some((repository) => !matchesRepository(repository)))
    throw new Error("Explicit repository must match the script checkout.");
  const reference = positionals[2];
  if (
    positionals[0] === "repo" &&
    ["view", "edit"].includes(positionals[1] ?? "") &&
    reference &&
    !matchesRepository(reference)
  )
    throw new Error("Explicit repository must match the script checkout.");
  if (
    ["pr", "issue"].includes(positionals[0] ?? "") &&
    reference &&
    /^https?:\/\//iu.test(reference)
  ) {
    const url = new URL(reference);
    const repository = url.pathname.split("/").slice(1, 3).join("/");
    if (!matchesRepository(`${url.origin}/${repository}`) || url.username || url.password)
      throw new Error("Issue or pull request URL must match the script checkout.");
  }
  if (args[0] !== "api") return [...args];
  // Explicit API paths can name another repository (preview setup does this),
  // but an absolute endpoint must not override the checkout's server.
  if (positionals.slice(1).some((arg) => /^https?:\/\//iu.test(arg)))
    throw new Error("Use server-relative API endpoints, not absolute URLs.");
  return [...args, ...(hosts.length === 0 ? ["--hostname", context.hostname] : [])];
}
