import { describe, expect, it } from "vitest";
import { missingScopes } from "./token-scopes.ts";

const head = (scopes: string) =>
  `HTTP/2.0 200 OK\r\nX-Oauth-Scopes: ${scopes}\r\nServer: GitHub.com\r\n`;

describe("missingScopes", () => {
  it("names the required scopes a classic token lacks", () => {
    expect(missingScopes(head("gist, read:org, repo, workflow"), ["repo", "project"])).toEqual([
      "project",
    ]);
  });

  it("reports nothing when every required scope is granted", () => {
    expect(missingScopes(head("project, repo"), ["repo", "project"])).toEqual([]);
  });

  it("reports every required scope for a token with none", () => {
    expect(missingScopes(head(""), ["repo", "project"])).toEqual(["repo", "project"]);
  });

  it("cannot tell without the header, as for a fine-grained token", () => {
    expect(missingScopes("HTTP/2.0 200 OK\r\nServer: GitHub.com\r\n", ["project"])).toEqual([]);
  });
});
