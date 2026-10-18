import { readFile } from "node:fs/promises";
import { attributionLine } from "./attribution.ts";

const messagePath = process.argv[2];

if (!messagePath) {
  console.error("Usage: check-commit-message.ts <message-file>");
  process.exitCode = 2;
} else {
  const offendingLine = attributionLine(await readFile(messagePath, "utf8"));
  if (offendingLine !== undefined) {
    console.error("Commit rejected: remove the AI attribution trailer:");
    console.error(offendingLine);
    process.exitCode = 1;
  }
}
