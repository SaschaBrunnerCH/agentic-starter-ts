import { supervisorMain } from "./heavy-runtime.ts";
try {
  process.exitCode = await supervisorMain();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Heavy supervision failed.");
  process.exit(1);
}
