import { scriptArguments } from "../shared/script-arguments.ts";
import { cli } from "./workload-runtime.ts";
try {
  process.exitCode = await cli(scriptArguments());
} catch (error) {
  console.error(error instanceof Error ? error.message : "Workload command failed.");
  process.exitCode = 1;
}
