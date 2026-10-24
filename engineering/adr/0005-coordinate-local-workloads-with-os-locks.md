---
status: accepted
---

# 0005 Coordinate local workloads with OS locks

## Context

Independent agent sessions can observe an idle machine simultaneously and launch competing test/build workloads. Worktrees isolate files while sharing workstation capacity. Sequential checks inside one gate and the browser GPU lock do not reserve CPU/memory/disk capacity across independent repository commands. Process-name scanning gives weak ownership and cannot prove cleanup after a frontend crash.

The development platforms are WSL2, macOS and Linux under [ADR 0004](0004-use-wsl2-for-windows-development.md). Coordination must preserve pnpm nesting, browser cache/GPU protections and actual command results without an npm dependency or persistent machine service.

## Decision

Provide one cooperative per-user workload slot with a stable, private, versioned protocol outside repositories. The public interface is the generic `pnpm workload run` and advisory `pnpm workload status`; [workload guidance](../agents/workload-coordination.md) owns commands, prerequisites, state, cancellation, recovery and supported process boundaries.

Use an OS advisory file lock on a permanent inode. WSL2/Linux use util-linux `flock --no-fork`; macOS uses Perl's core file-locking interface with a bounded acquisition loop and descriptor inheritance. This adds documented OS prerequisites, not an npm package or daemon. The launcher executes a Node supervisor, which retains the kernel reservation across the complete workload. [util-linux documents no-fork and exit-status behavior](https://kernel.googlesource.com/pub/scm/utils/util-linux/util-linux/+/master/sys-utils/flock.1.adoc); Perl documents [advisory locking](https://perldoc.perl.org/functions/flock) and [descriptor inheritance](https://perldoc.perl.org/variables/%24%5EF).

Publish minimal ownership atomically before work starts. Nested commands verify live ancestry and register their execution group before running. Keep a group leader alive through supported foreground children; a frontend alone does not own the reservation. Linux boot/start identities use `/proc`; macOS uses `sysctl` boot identity and `ps` process snapshots. If a supervisor dies, a free lock alone never proves cleanup: recorded surviving groups block the next workload. Reused identities, unreadable state and unproved cleanup are conservative barriers; stale recovery records never authorize signalling.

Preserve the existing GPU lock and acquire it after the shared slot. CI with `CI=true` or `CI=1`, and unsupported operating systems, keep ordinary command execution. The separate development-platform policy still applies.

## Consequences

- Participating repositories/worktrees share one reservation and can identify its owner instead of competing silently. Lightweight reading, planning and editing can continue.
- Real-process tests must exercise pnpm nesting, inherited streams, cancellation, escalation, crashes and survivors; pure protocol decisions remain measured independently of OS command wrappers. Existing coverage floors remain unchanged.
- OS tooling and process visibility are prerequisites. Platform simulations and testing the Perl driver on Linux do not establish physical macOS acceptance.
- This is cooperative serialization within one user/OS/PID namespace, not scheduling, resource accounting, machine-idle proof or a security boundary. Unregistered detached daemons and other environments retain the limits in the procedure.
- A bounded wait can expire, cancellation with ambiguous ownership can retain a barrier, and the owner may need to reconcile invalid state. Reliability takes precedence over silently overlapping uncertain work.

## Alternatives

- **Inspect load before launch.** Useful for nonparticipants but cannot reserve capacity atomically.
- **Use the browser GPU lock for all work.** Mixes distinct resource lifecycles and leaves standalone tests/builds dependent on browser-specific state.
- **Use only a Node directory/PID lock.** Avoids OS tools but stale recovery has its own races and does not inherit kernel lock lifetime; conservatively refusing all automatic recovery would burden normal crashes.
- **Add a native locking package, cgroups, systemd or a persistent scheduler.** Adds installation, service or allocation commitments beyond one cooperative slot. Revisit only with measurements from actual use.
- **Assume Linux flock flags exist on macOS.** Leaves an advertised development platform without an implementation. A small platform-specific driver keeps the command interface generic.
