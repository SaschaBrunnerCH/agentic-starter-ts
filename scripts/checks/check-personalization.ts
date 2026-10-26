import { ghJson, root } from "../shared/github.ts";
import * as json from "../shared/json-shape.ts";
import { personalizationProblems } from "../setup/personalization.ts";

const repository = ghJson(["repo", "view", "--json", "url"], json.object({ url: json.string }));
const problems = personalizationProblems(root, repository.url);
if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exitCode = 1;
} else {
  console.log("PASS · project ownership, package identity and HTML metadata are personalized");
}
