const deleted = /^0+$/u;

/** One ref of a push, with its object peeled to a commit. */
export type PushedRef = Readonly<{
  remoteRef: string;
  commit: string;
  /** Whether a remote branch already contains the commit. */
  published: boolean;
}>;

/**
 * The refs of what Git passes to a pre-push hook, one line per ref:
 * "<local ref> <local object> <remote ref> <remote object>". Deletions are left out:
 * they publish no source. The local ref is not used, since it can be any revision,
 * such as a commit id or HEAD.
 */
export function pushedObjects(pushed: string): { object: string; remoteRef: string }[] {
  return pushed
    .split("\n")
    .map((line) => line.trim().split(/\s+/u))
    .filter(([, object = ""]) => object !== "" && !deleted.test(object))
    .map(([, object = "", remoteRef = ""]) => ({ object, remoteRef }));
}

/**
 * What a push needs: the checks, unless it only publishes tags of commits a remote
 * branch already contains, and the reasons the checks would not describe what is
 * pushed. The checks run on the checked-out commit, so every ref they cover has to
 * point at it, from a clean working tree.
 */
export function pushPlan(
  statusPorcelain: string,
  head: string,
  refs: readonly PushedRef[],
): { needsChecks: boolean; problems: string[] } {
  const checked = refs.filter((ref) => ref.remoteRef.startsWith("refs/heads/") || !ref.published);
  if (checked.length === 0) return { needsChecks: false, problems: [] };
  const problems: string[] = [];
  const changes = statusPorcelain.split("\n").filter((line) => line !== "");
  if (changes.length > 0) {
    problems.push(
      `the working tree has ${changes.length} uncommitted or untracked file(s), so the checks would test something other than the pushed commit; commit them or set them aside (git stash -u)`,
    );
  }
  for (const ref of checked) {
    if (ref.commit !== head) {
      problems.push(
        `${ref.remoteRef} would get ${ref.commit.slice(0, 8)}, but the checked-out commit is ${head.slice(0, 8)}; push from the worktree that has it checked out`,
      );
    }
  }
  return { needsChecks: true, problems };
}
