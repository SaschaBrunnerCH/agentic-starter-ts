import { describe, expect, it } from "vitest";
import { agentSettingsProblems, requiredDenials } from "./agent-settings.ts";

const settings = (value: unknown) => agentSettingsProblems(JSON.stringify(value));

describe("agentSettingsProblems", () => {
  it("accepts a file that only denies, with the required denials", () => {
    expect(settings({ permissions: { deny: [...requiredDenials, "Read(./secrets/**)"] } })).toEqual(
      [],
    );
  });

  it("refuses a deny list that dropped a required denial", () => {
    expect(settings({ permissions: { deny: ["Read(./.env)", "Bash(curl:*)"] } })).toEqual([
      "permissions.deny lacks Read(**/.env), Read(**/.env.*), Bash(wget:*)",
    ]);
  });

  it("rejects a granted permission and a changed default mode", () => {
    expect(
      settings({
        permissions: {
          deny: [...requiredDenials],
          allow: ["Bash(gh pr merge:*)"],
          defaultMode: "x",
        },
      }),
    ).toEqual([
      "sets permissions.allow; only permissions.deny is allowed",
      "sets permissions.defaultMode; only permissions.deny is allowed",
    ]);
  });

  it("rejects hooks and other settings", () => {
    expect(settings({ permissions: { deny: [...requiredDenials] }, hooks: {}, env: {} })).toEqual([
      'sets "hooks"; only permissions.deny is allowed',
      'sets "env"; only permissions.deny is allowed',
    ]);
  });

  it("rejects an emptied deny list, a missing permissions object and broken JSON", () => {
    expect(settings({ permissions: { deny: [] } })).toEqual([
      "permissions.deny must be a non-empty list of rules",
    ]);
    expect(settings({})).toEqual(["has no permissions object"]);
    expect(agentSettingsProblems("{")).toEqual(["is not valid JSON"]);
  });
});
