/** Setup accepts one explicit mode; unknown flags never fall through to apply. */
export function setupMode(args: readonly string[]): "apply" | "help" | "dry-run" {
  if (args.length === 0) return "apply";
  if (args.length === 1) {
    if (args[0] === "--help" || args[0] === "-h" || args[0] === "help") return "help";
    if (args[0] === "--dry-run") return "dry-run";
  }
  throw new Error("Unsupported setup arguments. Use --help for usage; modes cannot be combined.");
}

export function setupUsage(command: string): string {
  return `Usage: pnpm ${command} [--help | --dry-run]\n\nNo arguments: apply missing or differing hosted settings.\n--dry-run: read hosted metadata and list proposed changes; write nothing.\n--help, -h, help: show this help without configuration or GitHub access.\n`;
}
