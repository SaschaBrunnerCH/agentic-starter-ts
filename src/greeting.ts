/** Builds the heading of the starter application; replace it with the first real module. */
export function greeting(name: string): string {
  const trimmed = name.trim();
  return trimmed === "" ? "Hello." : `Hello, ${trimmed}.`;
}
