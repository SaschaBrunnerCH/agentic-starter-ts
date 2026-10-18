/**
 * The scopes from `required` that a classic token lacks, read from the
 * `X-OAuth-Scopes` header GitHub returns with every API response. Without the
 * header, as for a fine-grained token, the scopes cannot be read and nothing is
 * reported; a missing permission then fails at the call that needs it.
 */
export function missingScopes(apiResponseHead: string, required: readonly string[]): string[] {
  const header = /^x-oauth-scopes:(.*)$/imu.exec(apiResponseHead)?.[1];
  if (header === undefined) return [];
  const granted = new Set(
    header
      .split(",")
      .map((scope) => scope.trim())
      .filter((scope) => scope !== ""),
  );
  return required.filter((scope) => !granted.has(scope));
}
