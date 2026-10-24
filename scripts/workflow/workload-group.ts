import { groupMain } from "./workload-runtime.ts";
try {
  process.exitCode = await groupMain();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Workload group failed.");
  process.exit(1);
}
