import { spawn } from "node:child_process";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");

type CommandResult = Readonly<{
  code: number;
  stderr: string;
  stdout: string;
}>;

function run(command: string, args: readonly string[]): Promise<CommandResult> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    let stdout = "";
    child.stderr.setEncoding("utf8");
    child.stdout.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => (stderr += chunk));
    child.stdout.on("data", (chunk: string) => (stdout += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolveRun({ code: code ?? 2, stderr, stdout }));
  });
}

async function trackedPaths() {
  const result = await run("git", ["ls-files", "-z"]);
  if (result.code !== 0) {
    throw new Error(`Could not list tracked files:\n${result.stderr}${result.stdout}`);
  }
  return result.stdout.split("\0").filter(Boolean);
}

const requestedPaths = process.argv.slice(2);
const paths = requestedPaths.length > 0 ? requestedPaths : await trackedPaths();
const scope = requestedPaths.length > 0 ? "files" : "tracked files";
if (paths.length === 0) {
  console.log("PASS · no files require secret scanning");
} else {
  const executable = resolve(repositoryRoot, "node_modules", ".bin", "secretlint");
  const result = await run(executable, ["--no-color", "--no-glob", ...paths]);
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  if (result.code !== 0) process.exitCode = result.code;
  else console.log(`PASS · secretlint accepted ${paths.length} ${scope}`);
}
