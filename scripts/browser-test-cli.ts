// IPC gives Playwright its graceful interrupt on every OS. Killing the CLI from
// outside can bypass its web-server teardown, especially on Windows.
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

let interrupted = false;
const notify = () => {
  if (process.listenerCount("SIGINT") > 0) process.emit("SIGINT");
  else setTimeout(notify, 50).unref();
};
const interrupt = () => {
  if (interrupted) return;
  interrupted = true;
  notify();
};
process.on("message", (message) => {
  if (message === "interrupt") interrupt();
});
process.on("disconnect", interrupt);
process.channel?.unref();
await import(pathToFileURL(createRequire(import.meta.url).resolve("@playwright/test/cli")).href);
