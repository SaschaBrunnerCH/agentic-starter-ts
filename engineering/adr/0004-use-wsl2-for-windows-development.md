---
status: accepted
---

# 0004 Use WSL2 for Windows development

## Context

The full repository gate uses pinned workflow-checking tools with macOS and Linux builds. Windows contributors already need WSL to run that gate, while browser/GPU acceptance has working native Windows entrypoints. Leaving the development boundary implicit makes agents discover it late, after worktree creation or partial checks, and encourages mixing toolchains and dependency installations.

Independent development environments also make local resource coordination harder to define. Choosing one supported Windows development path establishes a boundary for later tooling without claiming that WSL isolates the workstation's CPU, memory or GPU.

## Decision

Support WSL2, macOS and Linux for coding-agent sessions, Git/Node/pnpm development, builds, tests and full verification. On Windows use a Linux-filesystem WSL2 checkout, Linux executables and independently installed dependencies. [README setup](../../README.md#windows-development-with-wsl2) owns the procedure.

Check the Node.js platform before task startup, the full gate and adoption verification. Reject unsupported platforms with actionable WSL2 guidance. Apply the same rule in CI. The guard checks the operating system, not the complete machine configuration: both WSL generations report Linux, so the owner verifies WSL2 during setup. Supported macOS/Linux tooling prerequisites still apply.

Keep native Windows browser/GPU and device acceptance available through its documented separate checkout/toolchain. Preserve installation and standalone commands for that workflow and diagnostics. Record the driver OS and tested browser OS separately; WSL rendering does not establish native Windows behavior or performance.

## Consequences

- Windows development has one documented path aligned with the Linux gate and agent tooling; unsupported full workflows fail before expensive work or task claims.
- Contributors need WSL2 access on Windows. Machines whose policy prevents WSL2 need another supported development environment; native Windows alone cannot run the complete workflow.
- Native Windows browser testing retains separate dependencies, caches, processes and evidence. The development policy does not remove this maintenance obligation.
- Standalone commands can still execute on Windows. Their availability is deliberate, but does not promise a complete native Windows development path.
- The check does not prove WSL generation, toolchain provenance, hardware rendering or host-wide resource exclusion. Setup verification, browser evidence and cooperative resource coordination serve those distinct purposes.

## Alternatives

- **Support full native Windows development.** Requires a Windows path for every gate dependency and process-management behavior; adds a second Windows development environment without removing WSL's existing use.
- **Recommend WSL without checking workflow boundaries.** Leaves failure discovery late and permits partial verification to look like a supported path.
- **Reject every Windows command or remove native browser support.** Prevents useful native Chrome/Edge acceptance and diagnostics without simplifying the full development gate.
- **Silently relaunch commands in WSL.** Obscures checkout, toolchain, identity and dependency ownership; explicit setup keeps those choices visible.
