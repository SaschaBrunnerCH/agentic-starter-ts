# Local workload coordination

In an agentic development workflow, a **workload** is a resource-intensive operation an agent runs to implement or verify a change: a test suite, build, complete verification gate, browser acceptance run or fresh-project adoption check. A **reservation** is ownership of the shared execution slot for that operation and its supported children. One workload can still use many internal workers.

## Why workloads take turns

**Worktrees separate files; they still share the machine.** Independent agents can each start commands that launch several workers, assuming capacity is available. Overlapping workloads compete for CPU, memory, disk and GPU resources across repositories.

- **Longer runtimes:** workers spend more time waiting for resources.
- **Timeouts and intermittent failures:** operations that pass alone can exceed their time limits under contention.
- **Memory pressure:** swapping slows the machine; exhausted memory can terminate processes.
- **Poor responsiveness:** browsers, editors and other agent sessions become sluggish.
- **Misleading diagnosis:** an agent can mistake contention for a regression, increase timeouts or retry immediately, adding more competing work.

For example, one agent runs the complete gate while another starts browser acceptance. Both normally pass independently. Under contention, rendering slows and a browser test times out; an immediate retry adds load without addressing the cause. A timeout still needs investigation rather than being assumed to be contention.

**Local workload coordination makes participating workloads take turns.** It limits concurrent workloads, not CPU/RAM usage, and does not prove the machine is idle. Planning, reading and editing can continue while verification waits for the shared slot.

## Why the reservation uses an OS lock

Checking load before launch cannot reserve capacity atomically: independent sessions can both observe an idle machine. The coordinator uses an OS advisory lock on a permanent file inode so cooperating repositories share one reservation with a kernel-managed lifetime. WSL2/Linux use util-linux `flock --no-fork`; macOS uses Perl's core file-locking interface with bounded acquisition and descriptor inheritance. These OS prerequisites avoid an npm dependency or persistent service while keeping one command interface. See the primary documentation for [flock execution and exit status](https://kernel.googlesource.com/pub/scm/utils/util-linux/util-linux/+/master/sys-utils/flock.1.adoc), [Perl advisory locks](https://perldoc.perl.org/functions/flock) and [descriptor inheritance](https://perldoc.perl.org/variables/%24%5EF).

The Node supervisor retains the reservation across the complete workload. Ownership is published atomically before work starts, and nested commands verify ancestry and register groups before execution. The separate browser GPU lock keeps its own resource lifecycle and is acquired after the shared slot. Reusing it for all verification would couple standalone tests and builds to browser state.

A directory/PID lock implemented only in Node would need to resolve stale-recovery races itself. Kernel lock release still cannot prove that a crashed supervisor's children have ended, so recorded survivors and uncertain ownership block new work under the [recovery procedure](#cancellation-and-recovery). Stale records never authorize signalling. This conservative boundary can require owner reconciliation; avoiding overlap takes precedence over automatic recovery.

A native locking package, machine service or resource scheduler adds installation and allocation commitments beyond one cooperative slot. Revisit those options only when measurements show that the current boundary is insufficient. Neither process-name scanning nor this reservation proves machine-wide exclusion; [supported boundaries](#supported-boundary-and-verification) remain explicit.

## Where workloads fit

| Development activity | Examples                                                    | Shared slot?                                                 |
| -------------------- | ----------------------------------------------------------- | ------------------------------------------------------------ |
| Understand and plan  | Read code, inspect issues, discuss a solution               | No                                                           |
| Implement            | Edit code and documentation                                 | No                                                           |
| Verify               | Tests, builds, browser checks, the gate and adoption checks | Yes                                                          |
| Review and deliver   | Inspect diffs, prepare a PR, read CI results                | No; any local verification launched here reserves separately |

A complete gate holds one reservation while its tests and build run within it. Nested commands and their workers reuse that verified reservation. GitHub CI follows its own execution rules; local coordination is explicitly bypassed for `CI=true` or `CI=1`.

## Reservation lifecycle

![Shared workload lifecycle: wait, check previous ownership, run, finish foreground children and release. Cancellation releases only after proved cleanup. After a supervisor crash, recorded survivors or uncertain state block new work even when the OS lock is free.](../diagrams/workload-lifecycle.svg)

[Full-size diagram](../diagrams/workload-lifecycle.svg) · [Editable Excalidraw source](../diagrams/workload-lifecycle.excalidraw). The diagram shows lifecycle stages, not additional ownership metadata statuses.

Text equivalent: wait for the OS lock, check previous ownership, run, finish supported foreground children and release. Nested commands share the reservation; abrupt frontend loss leaves supervised work running. Cancellation stops only verified owned work and releases after cleanup. After a supervisor crash, a free OS lock alone is insufficient: recorded survivors or uncertain state block new work. The [recovery procedure](#cancellation-and-recovery) below owns the inspection and retry steps.

## Commands and participation

The command name is `pnpm workload`; this guide uses **workload** for the complete operation it coordinates and **reservation** for ownership of the shared slot.

```sh
pnpm workload run --label verification --timeout 300 -- pnpm check:push
pnpm workload status
```

`run` preserves the caller's working directory, standard input/output/error, argument boundaries and command result. It performs no shell evaluation and never retries an executed command. The default wait is 300 seconds; `--timeout 0` attempts acquisition once. A timeout returns 75 without starting work. A command returning 75 runs once and keeps that result. Labels should name a purpose, such as unit-tests, without credentials or command arguments.

These entrypoints reserve automatically: `check:push`, `test`, `build`, `check:adoption`, `test:browser`, `test:devices`, `browser:doctor` and `browser:cli`. Regression-proof test execution reserves through `runOnBase`. The gate holds one reservation across its checks; adoption holds it across its independent project fixtures. Nested participating commands verify process ownership and reuse that reservation, including across pnpm-created process groups. Use the supported entrypoints: invoking the underlying tools directly does not acquire a slot.

Browser entrypoints retain their cache preloads. Acquisition order is **shared slot, then GPU lock**. The GPU lock remains responsible for verified profiles, renderer evidence and browser/display cleanup. Do not acquire a workload reservation from inside an independently owned GPU reservation.

`status` reads advisory ownership without creating state or acquiring a slot. It prints the `owner.json` path, recorded and current boot identities, recorded/observed supervisor identities, recorded group leaders and observed live group members with PID, parent/group IDs and process-start identities. Observed IDs can be reused: this output never authorizes signalling. It is not a full process inventory, resource-utilization report or proof that the machine is idle.

## Adopting the coordinator

1. **Prepare the environment.** Install the [platform prerequisites](#platforms-and-prerequisites), then run `pnpm install --frozen-lockfile` in the new checkout. Supported commands participate automatically; no service or repository-specific lock is needed.
2. **Check existing ownership.** Run `pnpm workload status` before the first gate. Repositories sharing the slot must use a compatible coordinator protocol and the same state directory in one user/OS/PID namespace. If another implementation already owns that state, preserve its records and coordinate adoption across participating repositories before using this runner. Do not use another state directory to bypass active or uncertain work.
3. **Preserve sharing when personalizing.** Keep the default per-user state path and protocol independent of the repository name. If the workstation deliberately uses `WORKLOAD_STATE_DIR`, give all participating repositories the same absolute local path; worktrees inherit that choice. Do not copy ownership files into a new repository.
4. **Include new workloads.** Keep the existing wrapped entrypoints when changing the application or framework. Wrap newly added resource-intensive commands with `pnpm workload run --label <purpose> -- <command> [arguments]`. Internal worker limits remain the command's responsibility. Acquire the shared slot before any GPU reservation, and inspect host activity outside participation.

The [fresh-project adoption check](local-verification.md#fresh-project-adoption) exercises the inherited reservation through independent React and framework-free fixtures. It verifies those command paths; it does not migrate an existing workstation coordinator or establish cross-OS coordination.

## Platforms and prerequisites

- **WSL2:** Linux Node/pnpm, util-linux `flock`, and readable Linux process/boot information under `/proc`.
- **macOS:** `perl` with its core `Fcntl` and `Time::HiRes` modules, plus OS `ps` and `sysctl`. The Perl launcher uses the OS advisory file lock and keeps its descriptor across execution of the Node supervisor. No npm package or persistent service is installed.
- **Linux:** The same prerequisites as WSL2. BusyBox's `flock` is not a substitute for the util-linux flags this runner uses.

Missing prerequisites fail before the workload starts; installation is an explicit machine-setup action. On other operating systems, including native Windows browser acceptance, the command executes normally without coordination. CI bypass is explicit: only `CI=true` or `CI=1` bypasses. Unset, empty, `false`, `0`, and other values retain local coordination on supported systems. This bypass does not change the separate development-platform guard.

## State and protocol

All cooperating repositories and worktrees must use the same absolute state directory and protocol. The default is `~/.local/state/agent-workload/`; `WORKLOAD_STATE_DIR` overrides it for deliberate shared configuration or isolated tests. Keep it on a local filesystem with reliable advisory locking and within one OS/PID namespace. Changing the directory creates a different reservation, not extra machine capacity.

The directory is private to the user. Its permanent `lock` file keeps the same inode across runs and recovery. Never delete, truncate or replace it to unlock a workload. `owner.json` is atomically replaced and contains protocol version 1, a run identity, purpose label, working directory, boot identity, timestamps, supervisor/process-group identities and eventual result. It excludes command arguments and environment variables. Unreadable, invalid, foreign-owned or unsafe state blocks execution rather than being guessed away. State written by another implementation or protocol is not silently migrated: cooperating repositories must adopt the same protocol together. Preserve existing records and do not choose a second directory merely to bypass an active reservation.

A private, short control socket lives under a deterministic user/state-specific directory in `/tmp`, avoiding macOS socket-path limits with long home/state paths. It is transient; the permanent lock is always in the state directory. A supervisor removes stale control sockets only after acquiring the OS lock and rejecting any surviving recorded work.

An inherited `WORKLOAD_RUN` identifies a candidate reservation; it is not proof of ownership. The runner checks the live supervisor identity, boot and actual process ancestry. Each participating group registers before starting its command. Its Node group leader stays alive until the initial command and supported foreground group children finish. This covers children that outlive their immediate command, and keeps the reservation after a frontend exits.

## Cancellation and recovery

Coordinated runs handle SIGINT, SIGTERM and terminal hang-up (SIGHUP) as cancellation, returning 143. A waiting command stops only its own launcher and never signals the slot owner. Cancelling a running reservation sends graceful termination to verified owned groups; groups escalate after two seconds and the supervisor has a bounded fallback. Once the final live group is gone, earlier cleanup uncertainty or an elapsed deadline does not retain a barrier. Normal command exits and signals keep their corresponding result. CI/unsupported-OS bypass retains ordinary child-command results.

A frontend crash leaves its supervisor and reservation running. If the supervisor crashes and the kernel releases the lock, the next runner checks the recorded boot and groups before starting anything. Live recorded work blocks recovery, including ambiguous reused group identities. Zombies do not count as live work; a previous boot is distinguished from the current one. Recovery never signals stale records. If current ownership or cleanup cannot be proved, leave the barrier intact and involve the owner rather than killing processes by name or guessed PID.

For inspection, use `pnpm workload status` and compare recorded/observed boot, process-start and group identities. When the recorded foreground work finishes, retry the original command: recovery reuses the permanent lock inode. The reservation has no execution-duration timeout: a helper that stays alive in a supported group keeps the slot until it exits or the owning run is cancelled. `--timeout` bounds acquisition only. Invalid metadata needs the owner's [manual reconciliation](#invalid-or-incompatible-metadata); there is no force-unlock shortcut.

### Invalid or incompatible metadata

An invalid `owner.json` can hide surviving work. Preserve the record and establish its provenance and the state of the previous run locally; do not copy raw metadata into shared logs. A free OS lock proves only that no participating coordinator currently holds it, not that its children have finished. If the owner cannot establish that all previous work has ended, leave the record in place. Permissions or foreign ownership must be resolved as setup problems, not hidden by clearing metadata.

For a known existing state directory, set the same absolute path used by the participating repositories:

```sh
export WORKLOAD_STATE_DIR="${WORKLOAD_STATE_DIR:-$HOME/.local/state/agent-workload}"
```

On **WSL2**, open a temporary inspection shell only after acquiring the existing permanent lock; failure means leave the current reservation alone. The waiting `flock` parent retains the lock until the shell exits:

```sh
test -f "$WORKLOAD_STATE_DIR/lock" &&
  flock --exclusive --nonblock --conflict-exit-code 75 "$WORKLOAD_STATE_DIR/lock" /bin/sh
```

On **macOS**, the waiting Perl parent holds the existing lock while the inspection shell is open:

```sh
perl -MFcntl=:flock -e '
  open(my $lock, "+<", $ARGV[0]) or die "Cannot open existing workload lock\n";
  flock($lock, LOCK_EX | LOCK_NB) or die "Workload lock is held\n";
  system("/bin/sh");
  exit($? == -1 ? 1 : $? >> 8);
' "$WORKLOAD_STATE_DIR/lock"
```

On **Linux**, use the WSL2 command above. These are owner inspection shells, not workload launchers; do not run another coordinated workload from inside them. Acquiring the lock grants no permission to stop processes or bypass uncertain cleanup.

Only after the owner proves all previous work has ended and confirms that participating repositories use the same protocol, quarantine the invalid record from inside that locked shell. Choose a new private archive name if `owner.reviewed.json` already exists. This preserves the original record while leaving the permanent `lock` file untouched:

```sh
test ! -e "$WORKLOAD_STATE_DIR/owner.reviewed.json" &&
  mv "$WORKLOAD_STATE_DIR/owner.json" "$WORKLOAD_STATE_DIR/owner.reviewed.json"
exit
```

Then retry the original command outside the inspection shell. The runner publishes a new record under the same OS lock. Never switch state directories, replace the permanent lock inode or signal processes from stale records to bypass surviving work.

## Supported boundary and verification

Normal foreground processes whose children inherit their process group are covered. Participating nested commands may establish new groups after registration. Arbitrary daemons, double-forking processes and detached groups that bypass the runner are outside the tracked boundary. Process-table checks and cooperative ownership are not a security sandbox. Other users, separate WSL distributions, native Windows activity, containers with separate PID namespaces and nonparticipating commands are not automatically coordinated. Continue checking host load, and leave other sessions' processes, containers and ports alone.

There is no FIFO guarantee, persistent queue, automatic retry, priority, CPU/RAM allocation or permission to increase simultaneous workloads. Waiting does not survive a reboot.

Bounded process tests use private temporary state and owned fixtures, never the live shared slot or another session's processes. They exercise argument/result preservation, real pnpm gate/test/build nesting, cancellation and escalation, frontend/command/supervisor SIGKILL, foreground survivors, invalid state, reboot and identity-reuse cases. macOS parser fixtures and a real Perl-driver check complement platform-native runs; they do not establish physical macOS acceptance. Record the actual tested platforms and commit in the PR. The existing browser cache/API/renderer protections and every coverage floor remain in force.
