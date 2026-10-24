import { scriptArguments } from "../shared/script-arguments.ts";
import { cli } from "./heavy-runtime.ts";
try {
  process.exitCode = await cli(scriptArguments());
} catch (error) {
  console.error(error instanceof Error ? error.message : "Heavy command failed.");
  process.exitCode = 1;
}
