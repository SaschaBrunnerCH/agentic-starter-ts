import { describe, expect, it } from "vitest";
import { githubArguments, repositoryContext } from "./github-context.ts";

const context = repositoryContext("https://enterprise.example/Owner/App/");
describe("repository identity", () => {
  it("normalizes the URL host and preserves the repository name", () => {
    expect(context).toEqual({ hostname: "enterprise.example", repository: "Owner/App" });
    expect(repositoryContext("https://GITHUB.com/owner/app").hostname).toBe("github.com");
  });
  it.each([
    "invalid",
    "http://github.com/o/r",
    "https://user@github.com/o/r",
    "https://github.com/o/r?a=1",
    "https://github.com/o/r#x",
    "https://github.com/o",
    "https://github.com/o/r/extra",
  ])("refuses malformed identity %s", (url) => {
    expect(() => repositoryContext(url)).toThrow(/repository|Repository/u);
  });
});
describe("explicit targets", () => {
  it.each([
    ["pr", "view", "7"],
    ["issue", "edit", "7", "--repo", "owner/app"],
    ["pr", "view", "7", "-ROwner/App"],
    ["pr", "view", "7", "-R=owner/app"],
    ["repo", "view", "enterprise.example/owner/app"],
    ["repo", "edit", "https://enterprise.example/owner/app"],
    ["pr", "view", "https://enterprise.example/owner/app/pull/7"],
    ["issue", "view", "https://enterprise.example/Owner/App/issues/7"],
    ["issue", "comment", "7", "--body", "--repo=other/app"],
    ["issue", "edit", "7", "--title", "https://other.example/other/app/issues/7"],
    ["repo", "create", "Owner/App-previews", "--private"],
    ["issue", "view", "--", "7"],
  ])("preserves matching targets and payload data: %j", (...args) => {
    expect(githubArguments(args, context)).toEqual(args);
  });
  it.each([
    ["issue", "edit", "7", "--repo=other/app"],
    ["issue", "edit", "7", "-Rother/app"],
    ["issue", "edit", "7", "--repo", "github.com/Owner/App"],
    ["repo", "view", "other/app"],
    ["repo", "edit", "other/app"],
    ["pr", "merge", "https://enterprise.example/other/app/pull/7"],
    ["issue", "edit", "https://github.com/Owner/App/issues/7"],
    ["pr", "view", "https://user@enterprise.example/Owner/App/pull/7"],
    ["api", "user", "--hostname=other.example"],
    ["api", "user", "--hostname", "enterprise.example", "--hostname", "other.example"],
    ["api", "https://other.example/api/v3/user"],
    ["api", "--cache", "1h", "https://other.example/api/v3/user"],
    ["api", "user", "--hostname"],
    ["issue", "edit", "7", "--repo", "--title", "Changed"],
    ["issue", "edit", "7", "--repo="],
  ])("refuses target override %j", (...args) => {
    expect(() => githubArguments(args, context)).toThrow();
  });
  it("adds the API host while keeping intentional cross-repository endpoints", () => {
    expect(
      githubArguments(["api", "--paginate", "repos/Owner/App-previews/keys"], context),
    ).toEqual([
      "api",
      "--paginate",
      "repos/Owner/App-previews/keys",
      "--hostname",
      "enterprise.example",
    ]);
    const args = [
      "api",
      "graphql",
      "--hostname=enterprise.example",
      "-f",
      "query=query{viewer{login}}",
    ];
    expect(githubArguments(args, context)).toEqual(args);
  });
});
