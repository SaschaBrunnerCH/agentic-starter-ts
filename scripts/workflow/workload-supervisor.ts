import { supervisorMain } from "./workload-runtime.ts";
try {
  process.exitCode = await supervisorMain();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Workload supervision failed.");
  process.exit(1);
}
