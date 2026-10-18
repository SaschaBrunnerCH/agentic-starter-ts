# Browser and device setup findings

Date: 2026-10-18. Related coordination: issue #80. This record preserves installation
and launch findings from a local browser/device session. It introduces no demo
script, dependency, supported integration or change to routine browser acceptance.

## Environment and method

Desktop suite runs used source revision `b9afd6385f4e565001d0b2ee8eaff931ea46837d`;
its application matched `main` at `36f0f8a55b8a05d1e8a1a5396da7b7cff50d0d23`.
Physical devices and later desktop viewing runs opened the deployed HTTPS starter;
its exact deployed commit was not independently attested. Those runs cannot
establish acceptance of a particular source commit.

| Rendering target    | Observed environment                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Native Windows x64  | Node.js 24.11.0, pnpm 12.10.1, Playwright 1.64.0; Chrome 155.0.8059.82, Playwright Firefox 157.0 and WebKit 27.2                           |
| Ubuntu 24.04 in WSL | Linux Node.js 24.19.0, pnpm 12.10.1, Playwright 1.64.0, WSLg 1.0.73.2; Chrome 152.0.7977.75, Playwright Firefox 157.0 and WebKit 27.2      |
| Android phone       | Samsung SM-A576B, Android 16, Chrome 155.0.8059.81; native Windows ADB 36.0.0 over authorized USB                                          |
| iPad                | iPad13,16, iPadOS/Safari 26.6.1, Chrome 152.7977.64, Firefox 158.0; native Windows `pymobiledevice3` 11.26.1 in an isolated uv environment |

The method was to install host-specific dependencies and browsers, verify device
trust/transport, foreground the intended browser, inspect only the project tab,
and check the application's canvases and pixel readback. Initial desktop runs
used the existing 11 cases per engine. Device journeys used separate injected
browser events; they were not the desktop suite or native touch acceptance.

## Desktop installation and launch

A separate Windows-drive checkout with native Node/pnpm completed frozen
installation, browser installation and build. WSL used a Linux checkout and
Linux dependencies. The browser cache initializer selected different Windows
and Linux directories. Reproduction steps are in the
[installation guide](../agents/browser-device-coverage.md#install-and-launch-on-windows-and-wsl-separately);
Microsoft's [filesystem guidance](https://learn.microsoft.com/en-us/windows/wsl/filesystems)
supports choosing the filesystem for the tools being run.

The existing Windows global pnpm shim and a network-path checkout caused startup
errors before tests ran; a Windows-drive checkout and working native pnpm resolved
setup. These were host installation failures, not application failures. A later
manual Firefox `-width 850 -height 510` launch opened the numeric address `850`,
displayed as `0.0.3.82`. Removing those startup arguments removed the extra page.
Use [Playwright viewport configuration](https://playwright.dev/docs/emulation#viewport)
for page layout instead of assuming browser geometry flags are accepted.

Chrome and Firefox on Windows painted WebGL2 and WebGPU. WSL Chrome painted
WebGL2 but had no WebGPU adapter; WSL Firefox exposed no WebGPU API. The tested
Windows/WSL WebKit builds exposed no WebGPU API, while the actual iPad Safari
painted it. These are observations of these builds, not permanent support claims.
Playwright documents [platform-dependent browser behavior](https://playwright.dev/docs/browsers).

The initial WSL suite passed 33/33 cases, including unavailable-API behavior.
Windows passed 29/33: Firefox had a reduced-motion failure and two context-close
timeouts; WebKit had a narrow-viewport painted-coast failure. Original-suite
control runs reproduced the motion and WebKit paint failures; a later Firefox
viewing run also failed a painted-coast assertion. Successful installation and
later viewing loops do not resolve those failures or establish GPU acceptance.

## Android USB and wireless

ADB authorization succeeded before the intended Chrome tab appeared. Waking and
unlocking the phone and explicitly launching Chrome's Main activity with the
HTTPS URL made it visible and inspectable. The
[Android cable recipe](../agents/browser-device-coverage.md#android-cable) contains
the launch commands. Both application graphics rendered over USB inspection.

A wireless pairing QR scan remained in pairing mode. Default-interface mDNS
discovery found no pairing service; a query on the Wi-Fi adapter saw a connection
advertisement without establishing pairing or a browser connection. Manual pairing
also did not establish control. USB worked; wireless remains unverified.
[ADB's wireless procedure](https://developer.android.com/tools/adb#connect-to-a-device-over-wi-fi)
distinguishes pairing from connecting and explains the discovery dependency.
One failed setup is not evidence that Android wireless debugging is impossible.

## Optional Windows-to-iPad USB path

The existing Windows Apple device service discovered one trusted USB iPad. Its
installation from scratch was not tested. Follow the tool's
[installation prerequisites](https://github.com/doronz88/pymobiledevice3/blob/master/docs/installation.md)
and [uv setup](https://docs.astral.sh/uv/getting-started/installation/) for a new
host. With the intended device trusted/unlocked and other devices excluded,
the following reproduces the isolated tool version and dependency cutoff used
in the investigation, with a free loopback port:

```powershell
uv run --no-project --with pymobiledevice3==11.26.1 --exclude-newer 2026-10-11T19:00:00Z python -m pymobiledevice3 webinspector cdp --host 127.0.0.1 --port 9222
```

Keep the bridge running and open its loopback landing page in desktop Chrome;
select only the owned test page and keep device/tab listings private. See the
[bridge guide](https://github.com/doronz88/pymobiledevice3/blob/master/docs/guides/webview-debugging.md)
for the protocol and prerequisites. This command is optional host tooling;
the starter neither installs it nor connects its phone-emulation projects to it.
It is a historical reproduction pin, not a recommendation to ignore later fixes.

Safari Web Inspector was enabled. Chrome additionally needed its own inspection
switch and a relaunch, as [Chrome documents](https://developer.chrome.com/blog/debugging-chrome-on-ios).
Attaching while apps were in the background timed out. Foregrounding Chrome or
Firefox on the project page allowed inspection, screenshots and graphics readback.
A separate developer-service path switched apps with Developer Mode already
enabled; this did not prove Developer Mode necessary for ordinary inspection.
Manual foregrounding avoids needing that extra integration.

Safari rendered both graphics, but its separate automation follow-up could not
complete native input: clicks were unsupported and an injected accessibility
check stalled. Chrome/Firefox custom journeys also needed follow-ups after
harness failures. None establishes one clean full-suite or native-input pass.

Wi-Fi trust authenticated a device-management connection. Browser inspection
still terminated or timed out, including after Chrome was foregrounded.
Removing an optional notification observer in a diagnostic probe did not make
the normal device-enforced inspector handshake succeed. The cause was not
established; do not diagnose the Web Inspector switch as off from that timeout
or claim that Wi-Fi browser control worked.

## Limits and next use

For another setup, follow the linked guide, verify transport, foreground page,
requested API work and expected frame separately, and record actual input and
cleanup. A device disconnect prevented final verification of in-page stop and
restoration of a temporary Android stay-awake override. Stopping host processes
was not proof of device cleanup; reconnect or use local device controls.

These observations come from one workstation and one device of each kind. Raw
logs, screenshots and temporary adapters remain local because they contain host
and device context. Their exclusion prevents exact replay of the custom device
journeys; this record preserves methods and outcomes, not independently repeatable
acceptance artifacts. The Windows build number was not retained. No farm, native
Linux workstation, macOS inspection or successful wireless browser path was tested.

USB was the demonstrated fallback to wireless failures. Apple's standard Mac
inspection path remains documented in the
[device guide](../agents/browser-device-coverage.md#iphoneipad-cable-and-wireless);
this investigation did not replace or test it. Revisit wireless support with a
freshly verified tool/device combination and an unplugged inspection test.
Device-specific installation, browser inspection and native automation remain
separate optional integrations. No demo runner is proposed.
