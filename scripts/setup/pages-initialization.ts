/** Initialize automatic deployment only after successful hosted setup; preserve explicit choices. */
export function pagesInitializationNeeded(
  existing: string | undefined,
  pagesConfigured: boolean,
  mainOnly: boolean,
  setupComplete: boolean,
): boolean {
  return existing === undefined && pagesConfigured && mainOnly && setupComplete;
}
