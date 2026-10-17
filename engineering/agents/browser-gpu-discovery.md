# Discover browser GPU access

Before declaring hardware unavailable, run `pnpm browser:doctor` for the application's graphics API. A software result from one browser/backend is a failed candidate, not a verdict on the machine. Discovery is built into `pnpm test:browser`; no skill or project-specific launch recipe is needed.

Start with `pnpm test:devices --project chromium`: it builds and tests on **this machine**, discovers its local browser/GPU path, and records the result. The same command works in PowerShell, cmd and POSIX shells. Use `--help` on `test:browser`, `test:devices` or `browser:doctor` for setup and device guidance; no browser is launched by help. Missing hardware proof stays a reported failure. Configure only the APIs and supported devices the application actually uses.

```sh
pnpm browser:doctor --api webgl2
pnpm browser:doctor --api webgpu
pnpm browser:doctor --api webgl2 --api webgpu
pnpm build
pnpm test:browser --api webgl2
pnpm test:browser --api webgl2 --project mobile-chrome
```

`--api` is repeatable and overrides `BROWSER_GPU_APIS` for this invocation. A phone project emulates a viewport and touch on this machine; it does not use a phone GPU.

`BROWSER_GPU_EXECUTABLE` chooses one installed Chromium-based browser exclusively. Without it, discovery inventories installed Chrome, Chromium and Edge paths appropriate to the OS; missing optional browsers and tools require no automatic installation. `BROWSER_GPU_APIS` accepts `webgl`, `webgl2`, `webgpu`, or a comma-separated combination. WebGL 1 is the default. Legacy `BROWSER_WEBGPU=required` adds WebGPU; an explicit `webgpu` API alone has no WebGL dependency.

## What runs

The doctor and tests use the same resolver. It explores a short list sequentially, with a 12-second browser-launch bound, an eight-second API probe bound, a 20-second attempt watchdog and a search budget below three minutes including normal cleanup. Linux tries the browser's default, ANGLE/OpenGL and Vulkan backends. WSL additionally tries scoped Mesa D3D12. Only after headless candidates fail does Linux try a task-owned Xvfb display, if installed. Windows and macOS keep the browser's default platform backend. Wayland session variables are removed from candidate browser processes; driver overrides apply to that candidate only.

Each required API runs on a loopback secure origin. WebGL clears a tiny canvas and reads its pixel. WebGPU clears a texture, submits work and reads it back. Hardware acceptance needs a recognized adapter identity, successful work and no CPU/software or fallback indication. Masked/generic/missing identity is unknown and cannot pass. A known vendor identity is useful browser evidence, not independent attestation of the physical device or an uncontended workstation.

The accepted executable/channel, arguments, API list, browser environment changes and display are resolved **before** Playwright loads the worker configuration. Both Chromium projects connect to that same task-owned, probed browser process, which remains alive until acceptance ends. Direct `playwright test` with hardware required stops and points here; use `pnpm test:browser --project <name>` or `pnpm test:devices`. Each acceptance invocation probes again; there is no persistent success cache. Application failures stay failed: discovery never reruns failed application tests with another profile.

CI and remote browser connections default to functional mode. `BROWSER_GPU=required` in CI still runs discovery; an explicit remote hardware requirement fails with instructions to verify on the rendering host. Local discovery cannot establish a remote adapter. Other browser engines are functional checks unless their own acceptance proves hardware; a Chromium probe never establishes Firefox, WebKit, Safari or real-phone coverage. `BROWSER_GPU=off` waives hardware verification and makes no claim about which adapter the browser actually chooses.

## Platform paths and limits

| Rendering environment         | Investigate                                                                                                                            | Meaning of a pass                                                                                              |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Native Windows                | Installed Chrome or Edge; normal graphics backend; observe the selected integrated/discrete adapter                                    | Windows browser/API on that adapter; no other engine or mobile claim                                           |
| Native Linux                  | Default backend, OpenGL, Vulkan; render-device permissions and libraries; optional private Xvfb                                        | This browser/API and Linux driver path; Xvfb supplies a display, not a GPU                                     |
| WSL / WSLg                    | `/dev/dxg`, Mesa D3D12/OpenGL independently of Vulkan; `/dev/dri` may be absent                                                        | Observed translated GPU rendering; performance does not stand for native Windows                               |
| Native macOS                  | Installed Chrome or Edge, normal platform backend; inspect identity and required API                                                   | This browser/API on macOS; Safari needs its own acceptance                                                     |
| Container or VM               | Device exposure, permissions, driver libraries and actual renderer                                                                     | Label virtualization; virtual adapters do not establish native-device performance                              |
| Hardware CI or remote browser | Run discovery/acceptance where the browser renders, rather than inferring from the test-driver OS                                      | Explicit hardware requirements stay requirements; unavailable proof is a blocker                               |
| WSL driving Windows           | Use an isolated Windows checkout and Windows Node/browser for native acceptance; serve the exact build where that browser can reach it | Record driver OS and browser OS separately; Linux executable discovery does not launch Windows `.exe` browsers |

Candidate logic is not physical-platform verification. Record which machine/engine/API was actually exercised and which remain unverified. [Issue #5](https://github.com/SaschaBrunnerCH/agentic-starter-ts/issues/5) retains the real-platform acceptance work. Native Windows-from-WSL orchestration and non-Chromium hardware probes are not implemented here.

## Evidence and recovery

Every invocation writes a unique `.local/browser-gpu/<run>/report.json`, per-attempt `chrome-gpu.txt` when available, and `selected-profile.json` on success. Earlier failures survive a later success. The report retains the reproduction arguments, and discovery prints `pnpm browser:doctor --profile <selected-profile.json>` to reproduce that browser/backend/API choice; it rechecks hardware and allocates a new private display when needed. Reports include browser version, launch profile, each API's observed identity/readback and failure reason, OS/WSL/container indicators, device access and only named graphics environment variables. They do not dump the environment or use a daily browser profile. Preserve wanted reports before removing a task worktree; a later run creates a new directory. The ordinary browser evidence links the selected profile and report.

Read failed candidates' diagnostics before changing settings. Driver tools such as `glxinfo` and `vulkaninfo` suggest a next candidate; they do not prove browser rendering. Different API/backend results are expected. Check device access, blocklisted drivers, installed browser version, dual-GPU selection and display initialization. Prefer a scoped candidate over changing the owner's graphics preferences. Optional diagnostic tools are installed by the owner, never by discovery.

A lock at `~/.cache/browser-gpu-tests/lock` coordinates participating runners sharing that user home. Windows and WSL user homes may differ, so their locks may not coordinate either. Other projects may use different locks or none; check workstation load before a heavy run. Discovery never stops another run. A live, unreadable or abandoned lock blocks instead of being deleted automatically: inspect its recorded owner and establish that its exact browser/profile/display resources are gone before recovering it. Cancellation closes owned resources; unproved cleanup retains the barrier and reports a failure. Discovery owns the Playwright browser server, its disposable profile, private display and probe server, and verifies their closure. No visible desktop windows or process-name kills.

Before a performance claim, verify the application's **actual** context/adapter and expected painted frame on its declared device, with a deliberate software/no-adapter control through the same hardware gate. A scratch probe, readiness flag or smooth animation loop cannot establish scene correctness. Keep application-specific screenshot thresholds, shader compilation, device-loss/recovery and interaction checks in that application's acceptance suite; derive them from positive and negative scenes. A hardware identity never excuses a black canvas or a failed assertion.

## Primary references

- [Chromium: GPU hardware in headless Chrome](https://chromium.googlesource.com/chromium/src/+/HEAD/docs/gpu/using-gpu-hardware-in-headless-chrome.md): Vulkan is one possible Linux route.
- [Microsoft: GPU selection in WSLg](https://github.com/microsoft/wslg/wiki/GPU-selection-in-WSLg) and [Mesa D3D12](https://docs.mesa3d.org/drivers/d3d12.html): translated OpenGL and scoped adapter selection.
- [Playwright browsers](https://playwright.dev/docs/browsers): engine/distribution compatibility and installed-browser limitations.
