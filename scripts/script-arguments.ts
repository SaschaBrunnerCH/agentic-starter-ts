/**
 * The arguments of a command script. pnpm passes a "--" typed before them on to the
 * script, as in `pnpm task -- start 12`; it is dropped, so both forms work.
 */
export function scriptArguments(argv: readonly string[] = process.argv): string[] {
  const args = argv.slice(2);
  return args[0] === "--" ? args.slice(1) : args;
}
