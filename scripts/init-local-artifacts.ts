import { initializeLocalArtifacts } from "./local-artifacts.ts";

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--help") {
  console.log(
    "Usage: pnpm local:init [--exclude]\nInitialize the primary checkout's ignored .local/README.md. --exclude uses Git info/exclude instead of .gitignore.",
  );
} else if (args.length > 1 || (args.length === 1 && args[0] !== "--exclude")) {
  console.error("Usage: pnpm local:init [--exclude]");
  process.exitCode = 1;
} else {
  console.log(
    `Local artifacts: ${initializeLocalArtifacts(process.cwd(), args[0] === "--exclude")}`,
  );
}
