/** Full development workflows run on WSL2, macOS or Linux.
 * Browser acceptance has its own platform contract and does not call this guard.
 * Node reports both WSL generations as linux; verify WSL2 during machine setup.
 */
export function requireDevelopmentPlatform(platform: string = process.platform): void {
  if (platform === "linux" || platform === "darwin") return;
  throw new Error(
    `Development workflows require WSL2, macOS or Linux; this Node.js process runs on ${platform}. ` +
      "On Windows, open a WSL2 shell, clone into its Linux filesystem (for example ~/projects), " +
      "install Linux Git, Node.js and pnpm, then rerun the command there. " +
      "See README.md#windows-development-with-wsl2. Native Windows browser/GPU acceptance remains available.",
  );
}
