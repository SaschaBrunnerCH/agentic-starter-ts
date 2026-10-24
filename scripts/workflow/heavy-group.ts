import { groupMain } from "./heavy-runtime.ts";
try {
  process.exitCode = await groupMain();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Heavy group failed.");
  process.exit(1);
}
