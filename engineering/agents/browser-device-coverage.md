# Browser and device coverage

Start with `pnpm test:devices --project chromium`: build and test on this machine.
The package commands work in PowerShell, cmd and POSIX shells. Install the chosen
Playwright browsers and an installed Chrome, Chromium or Edge for hardware
discovery; `pnpm browser:doctor --help` explains prerequisites. Select only the
APIs the application uses, as the [GPU guide](browser-gpu-discovery.md) describes.

[![Browser and device test paths: Playwright across Windows, WSL, Linux and macOS; local Android and iPhone/iPad over cable or wireless; emulation and farm protocols shown separately](../diagrams/browser-device-matrix.svg)](../diagrams/browser-device-matrix.svg)

Open the graphic for full size. Built-in, documented and separate-integration
labels describe possible paths; record actual test results separately using the
[evidence format](#record-actual-evidence). The table below is its text counterpart;
the [provider comparison](#provider-comparison) helps choose remote coverage.

## Declare the supported matrix

Describe supported combinations explicitly. A useful row contains browser and
engine/version, rendering OS/version, device or viewport, required graphics API,
input/scenario and evidence status. Record the test-driver OS separately: WSL
controlling a Windows browser is a Windows browser result, while a Linux browser
in WSL is translated Linux rendering. Neither is a native Linux workstation run.

| Target                      | Windows, WSL, Linux and macOS paths                                        | Evidence and limits                                                                                                                  |
| --------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Chromium, Chrome or Edge    | `chromium`; installed browser discovery for required GPU runs              | Chromium engine. Chrome/Edge distribution, policies and codecs can differ; discovery choosing Chrome does not test Edge too.         |
| Firefox / Gecko             | `firefox`, using Playwright's patched Firefox build                        | Functional engine coverage. Shipping Firefox and its graphics adapter need their own acceptance.                                     |
| Playwright WebKit           | `webkit`, using the OS-specific Playwright build                           | Functional WebKit coverage. It is not shipping Safari, and Linux WebKit does not establish macOS/iOS coverage.                       |
| Shipping Safari             | macOS Safari; Safari on an actual iPhone/iPad                              | Check on that OS/device by hand or through a separately supported automation path. No built-in Safari connection.                    |
| Phone emulation             | `mobile-chrome` (Pixel 7); `mobile-safari` (iPhone 15) on the developer OS | Desktop engines with viewport, touch and user-agent settings. Only phone Chromium shares local GPU verification.                     |
| Tablet emulation            | Optional descriptor example below, on the developer OS                     | Portrait/landscape layout and emulated touch; no physical-tablet or mobile performance claim.                                        |
| Real Android phones/tablets | Chrome inspection through USB/Wi-Fi; device opens a reachable build        | Browser executes on Android. Another Android browser needs its own supported interface and engine checks.                            |
| Real iPhone/iPad            | Reachable build from any host; standard Safari inspection from a Mac       | Browser executes on iOS/iPadOS. Record its actual browser/engine rather than inferring it from a desktop browser's name.             |
| Containers, VMs and farms   | Browser host may differ from the driver host; provider-specific connection | Record physical device, simulator, emulator, virtual GPU or software renderer separately. Remote availability is not GPU acceptance. |

The configured inventory remains Chromium, Firefox, WebKit, phone Chromium and
phone WebKit; the starter adds no tablet project or provider adapter.
[Playwright's browser documentation](https://playwright.dev/docs/browsers)
explains distribution and OS differences. Native ChromeOS, embedded views or
other environments belong in a derived application's matrix when it supports
them; the starter does not claim their verification.

Choose representative phone/tablet sizes, portrait/landscape, DPR and relevant
mouse, keyboard, touch or pen journeys. Include zoom, reduced motion, network
conditions, media and assistive technology when the application depends on them.
An emulated tap or JavaScript-injected gesture does not establish native multitouch,
TalkBack, VoiceOver or keyboard usability. Test those declared combinations on
the actual browser/device with the required input or assistive tool.

Keep [focused PR acceptance](browser-testing.md#as-the-suite-grows) and the full
declared inventory at enforced release verification. Do not form a Cartesian
product of every engine, OS, device, API and scenario. Keep unavailable rows
visible as **unverified**, with the missing machine/tool or failure reason.
The starter's enforced release smoke remains Chromium at root/nested paths; it
does not enforce a derived application's complete supported matrix.

## Reach a real device from a laptop

Use an available local phone or tablet as a first-class acceptance target. Follow
the cable or wireless recipe below, then rotate the device, use real finger
gestures and the on-screen keyboard, and check layout, focus, scrolling and the
declared accessibility journey. Verify required WebGL/WebGPU work and the expected
application frame on that device. Record whether input came from a person, native
automation or injected browser events; connectivity and emulated taps do not
establish these physical-device results.

Build first. For a trusted network, `pnpm preview --host 0.0.0.0 --port 4173 --strictPort`
serves the build; open the laptop's reachable address on the device. Verify the
exact build and each host boundary, firewall and asset/API origin. A phone's
`localhost` means that phone. LAN HTTP can check ordinary UI, but secure-context
features such as WebGPU need trusted HTTPS or a verified secure loopback route.
Check `window.isSecureContext` and the requested API on the rendering device;
an ignored certificate warning or desktop adapter is not evidence.

### Android: cable

Use standalone [Platform Tools/ADB](https://developer.android.com/tools/adb) on
Windows, Linux or macOS; an Android Studio installation is optional. Enable
developer options and USB debugging, connect a data cable, unlock the device and
approve its debugging authorization. Windows may need an OEM USB driver; Linux
may need device permissions. Device security features can disable debugging;
follow the manufacturer's instructions, for example
[Samsung Auto Blocker](https://www.samsung.com/ca/support/mobile-devices/protect-your-samsung-galaxy-with-auto-blocker/),
and restore those protections after testing. Choose the intended device from
`adb devices -l`. Replace `SERIAL` below with its identifier, keeping identifiers
out of public logs:

```text
adb -s SERIAL reverse tcp:4173 tcp:4173
```

Open `http://localhost:4173/` in device Chrome. The reverse mapping makes that
device port reach the ADB host's port; verify secure-context/API access there.
On the computer, use Chrome's `chrome://inspect/#devices`, enable USB discovery,
and inspect the intended tab. [Chrome port forwarding](https://developer.chrome.com/docs/devtools/remote-debugging/local-server)
also provides a UI for reaching the laptop server. Site reverse forwarding and
forwarding a DevTools socket to the computer are different operations.

An authorized ADB connection does not prove Chrome is ready for inspection. Keep
the phone unlocked and Chrome open while connecting. Attach to an owned test tab
and preserve existing tabs and browser data; do not reset a personal browser to
make automation connect.

With Windows ADB and a WSL server, prove Windows can reach that server first;
reverse forwarding reaches Windows. Keep one ADB host in charge. Alternatively,
explicit [USB attachment to WSL](https://learn.microsoft.com/en-us/windows/wsl/connect-usb)
needs `usbipd-win`; a cable does not expose a device to both hosts automatically.
[WSL networking](https://learn.microsoft.com/en-us/windows/wsl/networking) differs
between NAT and mirrored modes. Do not assume Windows localhost or LAN access
works merely because WSL localhost does.

### Android: wireless

On Android 11+ devices offering wireless debugging, enable it on a trusted shared
network. Follow the current ADB guide for the installed Android/Platform Tools
versions. Pair using `adb pair DEVICE_IP:PAIRING_PORT` and enter the code at its
prompt. If discovery does not connect automatically, use the connection address
shown by the device: `adb connect DEVICE_IP:CONNECTION_PORT`. Pairing and connection
ports can differ; newer ADB Wi-Fi versions also change discovery behavior.
Select that connection with `adb -s SERIAL`, establish the required reverse mapping,
unplug USB, and repeat the page and inspection checks to prove the wireless path.

After either path, remove only the owned mapping with
`adb -s SERIAL reverse --remove tcp:4173`. For Wi-Fi, `adb disconnect DEVICE_IP:CONNECTION_PORT`
closes that connection; forget the paired workstation in device settings when
appropriate and turn debugging off when finished. Keep addresses and pairing
material local. Avoid killing a shared ADB server or deleting other mappings.

ADB transport does not connect the existing phone-emulation project to hardware.
[Playwright's experimental Android API](https://playwright.dev/docs/api/class-android)
supports a separate Android Chrome/WebView workflow; its prerequisites and
limitations must be checked before adopting it. It is not integrated here.

### iPhone/iPad: cable and wireless

For Apple's standard inspection path, use a Mac, unlock and trust/pair the device,
and enable Web Inspector under **Settings → Apps → Safari → Advanced** (older
versions put Safari directly under Settings). Keep Safari open and the device
unlocked during the check. Enable Safari's developer
features on the Mac, open the intended page on the device and select it from
Safari's Develop menu. [WebKit's inspection guide](https://webkit.org/web-inspector/enabling-web-inspector/)
covers cable inspection and wireless inspection after Xcode device configuration.
For wireless, complete that pairing/configuration, check same-network reachability,
unplug the cable and inspect the page again. Setting names vary with OS versions.

A cable or inspection pairing does not forward the website as Android ADB reverse
does. Use a reachable trusted HTTPS build for secure APIs. Windows/Linux/WSL can
serve that build and the device can browse it; Apple's standard local Safari
inspection workflow requires macOS. Optional third-party
[WebInspector bridges](https://github.com/doronz88/pymobiledevice3/blob/master/docs/guides/webview-debugging.md)
offer other host paths, but need separate version, trust, transport and browser
proof; they are not installed or supported by this starter. Some automation tools
also require **Remote Automation** in Safari's Advanced settings; follow that
tool's prerequisites. JavaScript, screenshots and graphics readback alone do not
establish native touch or keyboard automation. Use a normal Safari tab for the
manual input journey and record it separately. Signed native automation
and provider-specific iOS automation are separate integrations.

Close owned inspection sessions/tabs, stop the test server, disable wireless
debugging/inspection when finished and unpair where appropriate. Apple's
[trust guidance](https://support.apple.com/en-us/109054) explains revocation;
resetting trust can affect other remembered computers, so choose it deliberately.

## Phone and tablet example without expanding the default projects

Playwright's [device descriptors](https://playwright.dev/docs/emulation) include
phone/tablet portrait/landscape settings. They are emulation presets, not a current
hardware recommendation. To try the starter's input journey, save this optional
example as `.local/emulation-check.mjs` in the checkout:

```js
import assert from "node:assert/strict";
import { devices, webkit } from "@playwright/test";

const browser = await webkit.launch({ headless: true });
try {
  for (const name of [
    "iPhone 15",
    "iPhone 15 landscape",
    "iPad (gen 7)",
    "iPad (gen 7) landscape",
  ]) {
    const device = devices[name];
    assert.ok(device);
    const context = await browser.newContext(device);
    try {
      const page = await context.newPage();
      await page.goto(process.env.BROWSER_TEST_BASE_URL ?? "http://127.0.0.1:4173/");
      const observed = await page.evaluate(() => ({
        width: innerWidth,
        height: innerHeight,
      }));
      assert.equal(observed.width, device.viewport.width);
      assert.equal(observed.height, device.viewport.height);
      const field = page.getByLabel("Name");
      await field.evaluate((element) => {
        element.addEventListener(
          "touchstart",
          (event) => {
            element.setAttribute("data-touch-count", String(event.touches.length));
          },
          { once: true },
        );
      });
      await field.tap();
      assert.equal(await field.getAttribute("data-touch-count"), "1");
      assert.equal(await field.evaluate((element) => element === document.activeElement), true);
      await field.fill("Ada");
      await page.getByRole("heading", { name: "Hello, Ada.", exact: true }).waitFor();
      console.log(`${name}: viewport, emulated touch and input journey passed`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
```

Install WebKit with `pnpm exec playwright install webkit`, then `pnpm build` and
`pnpm preview --host 127.0.0.1 --port 4173 --strictPort`. In another terminal run
`node .local/emulation-check.mjs`. Stop that owned preview afterwards. Follow the
[shared-machine rules](browser-testing.md#what-an-agent-never-does) before this
standalone example; it does not acquire discovery's lock. This is a
functional example, with no GPU assertion. For a derived application, put its
actual layout/touch journey and existing accessibility assertions in its normal
suite; declare any additional projects and release rows deliberately.
The example checks an actual emulated touch event and focus/input behavior;
a descriptor, user-agent string or capability flag alone cannot establish them.

## Record actual evidence

Use the same record for local, physical-device and farm runs:

```text
Build commit + clean/dirty state; tested URL/build identity; date/operator
Driver OS; rendering OS/version; device model or emulation descriptor + orientation/DPR
Requested and observed browser/version/engine; transport and actual input method
Required API; observed adapter/fallback + submitted work/readback; app frame/journey/axe result
Passed / failed / unavailable / unverified rows; retained evidence; owned cleanup result
```

Keep raw device identifiers, addresses, pairing records and authenticated endpoints
private. Capability discovery, connectivity, API work, correct application paint,
native interaction and performance are separate milestones. Use the application's
actual context/adapter, a meaningful expected frame and negative controls for GPU
acceptance, as the [GPU guide](browser-gpu-discovery.md#evidence-and-recovery) requires.
Portable screenshots/axe and provider-native input need their own executed evidence.
[Issue #5](https://github.com/SaschaBrunnerCH/agentic-starter-ts/issues/5) tracks native
workstation acceptance; instructions here do not certify untested machines/devices.

## Testing farms

A farm can supply a missing browser/OS or real device. Choose its connection path
before selecting a label from its catalog:

| Path                                    | What this starter implements                                       | What still needs verification or separate integration                                                     |
| --------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Compatible Playwright WebSocket         | Existing `test:devices --endpoints`, or the optional farm workflow | Supported Playwright version, actual engine, browser host, network reachability and returned capabilities |
| CDP-only endpoint                       | No general CDP adapter                                             | Chromium connection code; a CDP endpoint is not a Playwright protocol endpoint                            |
| WebDriver/Appium or provider SDK/runner | No adapter                                                         | Shipping Safari, real-device input or other provider paths need their own implementation                  |
| Manual real-device session              | Operator follows the same declared journey                         | Actual device, input, API/paint and cleanup evidence; no automatic Playwright-suite claim                 |

### Provider comparison

**Checked 2026-10-18 (UTC).** Dates below refer to documentation/catalog checks;
actual runs have separate dates. C = Chromium (Chrome/Edge where offered),
F = Firefox/Gecko, W = Playwright WebKit; shipping Safari is separate.
Provider support does not establish account access, connector compatibility or
GPU acceptance. WSL needs its own host; the test driver's OS is not the browser OS.

| Browser/device farm                                                                                   | Desktop browser hosts and engines                                                                                                                                                | Physical phones/tablets                                                                                                                                                         | Connection and starter fit                                                                                                                                                                                  | Last checked / basis              |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| [TestingBot](https://testingbot.com/support/web-automate/playwright)                                  | Windows/Linux C/F; macOS C/F/W                                                                                                                                                   | Android and iPhone/iPad; [physical catalog](https://testingbot.com/support/api/devices) excludes simulators                                                                     | Desktop Playwright endpoint, subject to version checks. Separate [Android API](https://testingbot.com/support/web-automate/playwright/mobile) / [Appium](https://testingbot.com/support/app-automate) setup | 2026-10-18 · docs + live catalogs |
| [BrowserStack](https://www.browserstack.com/docs/automate/playwright/browsers-and-os)                 | Windows/macOS C/F/W, with OS/version restrictions; no Linux desktop catalog row                                                                                                  | Android and iPhone/iPad; [iOS Playwright setup](https://www.browserstack.com/docs/automate/playwright/playwright-ios/nodejs)                                                    | Desktop Playwright endpoint after compatibility checks; mobile SDK/device paths separate                                                                                                                    | 2026-10-18 · docs + live catalog  |
| [Sauce Labs](https://docs.saucelabs.com/web-apps/automated-testing/playwright/)                       | Windows/macOS C/F/W with [limits](https://docs.saucelabs.com/web-apps/automated-testing/playwright/limitations/); Linux client support does not establish a Linux browser target | [Android/iOS phones and tablets](https://docs.saucelabs.com/mobile-apps/automated-testing/appium/real-devices/); virtual devices separate                                       | `saucectl` runner; Appium for real mobile. Neither built in here                                                                                                                                            | 2026-10-18 · docs only            |
| [TestMu AI (formerly LambdaTest)](https://www.lambdatest.com/support/docs/playwright-testing/)        | Windows/macOS C/F/W with [bundle compatibility](https://www.lambdatest.com/support/docs/playwright-bundled-browser-support/); Linux target unverified                            | [Android](https://www.lambdatest.com/support/docs/playwright-android/) and [iPhone/iPad Safari](https://www.lambdatest.com/support/docs/playwright-ios-device/); iOS gated beta | Provider endpoints/Android API. Published mobile ranges exclude this starter's Playwright 1.64                                                                                                              | 2026-10-18 · docs only            |
| [Perfecto](https://help.perfecto.io/perfecto-help/content/Perfecto/automation-testing/playwright.htm) | Windows Chrome/Edge; macOS C/F/W                                                                                                                                                 | Android Chrome/WebView; iOS Safari Playwright beta                                                                                                                              | Separate capabilities/endpoints; source client-version statements differ, so confirm compatibility                                                                                                          | 2026-10-18 · docs only            |
| [AWS Device Farm](https://docs.aws.amazon.com/devicefarm/latest/developerguide/welcome.html)          | [Desktop TestGrid](https://docs.aws.amazon.com/devicefarm/latest/testgrid/techref-support.html): Windows Chrome/Edge/Firefox                                                     | Android/iOS device pools                                                                                                                                                        | Mobile test uploads/Appium; desktop WebDriver. No plain Playwright endpoint assumed                                                                                                                         | 2026-10-18 · docs only            |

Managed browser services provide endpoints rather than physical mobile devices:

| Provider / service                                                  | Browser coverage | GPU / host limits                                                                                                                                                                           | Connection and starter fit                                                           | Last checked / basis                        |
| ------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------- |
| [Browserless](https://docs.browserless.io/overview/connection-urls) | Hosted C/F/W     | [GPU infrastructure](https://docs.browserless.io/enterprise/private-deployment/performance) is a private-deployment option; shared endpoints do not establish GPU access or a full checkout | Playwright-protocol endpoint fits the connector; Chrome CDP needs a separate adapter | 2026-10-18 · docs + prior shared Chrome run |
| [Kernel](https://www.kernel.sh/browsers)                            | Managed Chromium | [GPU browsers use virtual GPUs](https://www.kernel.sh/blog/gpu); configuration/access need verification; no full-checkout acceptance                                                        | Playwright over CDP needs session lifecycle code; no general CDP adapter here        | 2026-10-18 · docs; GPU run not performed    |

### GPU hosts and remote Macs

These services supply a host for an ordinary SSH checkout and the existing
package commands. Browser/driver installation is the caller's responsibility.
Only the recorded Runpod configuration has been tested; the other rows are
**documentation-only**. Compute/CUDA support alone does not establish usable
OpenGL/Vulkan/Metal, WebGPU or correct application paint.

| Provider                                                                                    | Technical options                                                                                                                                                                              | Access and graphics limits                                                                                                                               | Last checked / basis                   |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| [Runpod Pods](https://docs.runpod.io/pods/overview)                                         | Linux GPU containers; selectable GPU/image                                                                                                                                                     | SSH checkout; tested NVIDIA WebGL2/core WebGPU. This path supplies no Windows/macOS or physical mobile target                                            | 2026-10-18 · docs + Linux GPU checkout |
| [Infomaniak Public Cloud](https://docs.infomaniak.cloud/compute/instances/flavors/)         | NVIDIA L4, A2, T4, L40S and A100 GPU VM flavors, by cluster                                                                                                                                    | Full VM checkout; project GPU enablement and compatible OS/graphics drivers required                                                                     | 2026-10-18 · docs only                 |
| [Vast.ai](https://docs.vast.ai/guides/instances/connect/ssh)                                | Marketplace GPU instances; configuration varies by offer                                                                                                                                       | SSH checkout; verify container/VM type, device exposure, drivers and networking                                                                          | 2026-10-18 · docs only                 |
| [Lambda Cloud](https://docs.lambda.ai/public-cloud/on-demand/connecting-instance/)          | Linux GPU instances with compute tooling                                                                                                                                                       | SSH checkout; verify the browser graphics stack separately from CUDA                                                                                     | 2026-10-18 · docs only                 |
| [Vultr Cloud GPU](https://docs.vultr.com/products/compute/instances/cloud-gpu/provisioning) | GPU VMs with selectable image/configuration                                                                                                                                                    | Full checkout; distinguish dedicated GPU from [vGPU](https://docs.vultr.com/how-to-manage-vgpu-on-vultr-cloud-gpu-instances) and verify graphics drivers | 2026-10-18 · docs only                 |
| AWS EC2                                                                                     | [G6 NVIDIA L4](https://aws.amazon.com/ec2/instance-types/g6/) GPU instances; [EC2 Mac](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-mac-instances.html) on dedicated Apple hardware | Separate GPU-VM and Mac checkout routes; OS/driver setup required. No attached iPhone/iPad inferred                                                      | 2026-10-18 · docs only                 |
| [Scaleway Apple silicon](https://www.scaleway.com/en/docs/apple-silicon/quickstart/)        | Dedicated Mac mini; model/OS from current catalog                                                                                                                                              | SSH/remote checkout; install tooling and verify Metal/API work                                                                                           | 2026-10-18 · docs only                 |
| [MacStadium](https://macstadium.com/bare-metal-mac)                                         | Dedicated Macs or [Orka virtualized Macs](https://macstadium.com/orka)                                                                                                                         | Full Mac environment; dedicated and virtualized routes need separate GPU/Metal acceptance                                                                | 2026-10-18 · docs only                 |

A remote Mac does not imply attached mobile devices. Keep VM/container,
WSL and native-workstation evidence distinct, including adapter and API readback.

### Dated observations

Session results are not vendor-wide promises. The
[platform verification record](https://github.com/SaschaBrunnerCH/agentic-starter-ts/issues/5)
retains the acceptance scope; desktop results do not establish mobile coverage.

| Provider / target               | Observed graphics result                                     | Observed application result                                                           | Run date (UTC) |
| ------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------- | -------------- |
| TestingBot Linux Chrome         | SwiftShader WebGL2 readback; no WebGPU adapter               | Interaction/axe passed; software rendering                                            | 2026-10-17     |
| TestingBot macOS Chrome         | Apple Paravirtual WebGL2; Apple WebGPU readback              | Interaction/axe passed; virtual GPU, no physical-Mac/full-checkout proof              | 2026-10-17     |
| BrowserStack macOS Chrome       | Apple M2/Metal WebGL2 and core/compatibility WebGPU readback | Interaction/axe passed; Firefox/WebKit app checks also passed. No macOS tooling proof | 2026-10-18     |
| BrowserStack Windows Chrome     | SwiftShader WebGL2; no WebGPU adapter                        | Interaction/axe passed; software rendering                                            | 2026-10-18     |
| Browserless shared Linux Chrome | SwiftShader WebGL2; no core/compatibility WebGPU adapter     | Interaction/axe passed; private GPU deployment untested                               | 2026-10-18     |
| Runpod Linux GPU container      | NVIDIA WebGL2/core WebGPU; full checkout and bounded cleanup | Application/axe passed; no bare-metal/performance claim                               | 2026-10-18     |

#### Real phone and tablet observations

Temporary WebDriver/Appium runs selected physical devices through the providers'
catalogs and real-device capabilities. These are provider-attested results;
Playwright desktop emulation is separate. All rows passed WebGL2 and both
requested core/compatibility WebGPU readbacks with non-fallback adapters.

| Provider     | Returned device / rendering OS        | Browser observed      | WebGL2 / WebGPU identity           | Run date (UTC) |
| ------------ | ------------------------------------- | --------------------- | ---------------------------------- | -------------- |
| TestingBot   | Galaxy S25 (SM-S931B), Android 15     | Chrome 149.0.7827.159 | Adreno 830 / `qualcomm adreno-8xx` | 2026-10-18     |
| TestingBot   | Galaxy Tab S11 (SM-X730), Android 16  | Chrome 150.0.7871.189 | Mali-G925 / `arm gen-5`            | 2026-10-18     |
| TestingBot   | iPhone 17 Pro, iOS 26.5               | Safari 26.5           | Apple GPU / Apple                  | 2026-10-18     |
| TestingBot   | iPad (9th generation), iPadOS 26.6    | Safari 26.6           | Apple GPU / Apple                  | 2026-10-18     |
| BrowserStack | Galaxy S25 (SM-S931B), Android 15     | Chrome 152¹           | Adreno 830 / `qualcomm adreno-8xx` | 2026-10-18     |
| BrowserStack | Galaxy Tab S11 (SM-X736B), Android 16 | Chrome 152¹           | Mali-G925 / `arm gen-5`            | 2026-10-18     |
| BrowserStack | iPhone 17 Pro, iOS 26.6               | Safari 26.6           | Apple GPU / Apple                  | 2026-10-18     |
| BrowserStack | iPad Air 13 2025, iPadOS 26.6         | Safari 26.6.1         | Apple GPU / Apple                  | 2026-10-18     |

¹ Reduced user agent; full Chrome version unavailable. Apple WebGPU identity was
`apple apple apple apple`.

All eight passed greeting/input interaction, changed screenshots, axe with zero
violations, landscape rotation and deliberate wrong-pixel rejection. Owned
sessions were deleted, provider completion confirmed and accounts returned idle.
Input was automated click/clear/send keys; human multitouch and performance were
not tested. API readback is separate from UI paint; this starter has no GPU scene.
Requesting both WebGPU modes does not prove a browser distinguishes feature levels.

The original Tab S11 harness classified `arm gen-5` as unknown;
[PR #53](https://github.com/SaschaBrunnerCH/agentic-starter-ts/pull/53) fixes that
identity check. Original probe records remain unchanged. Initial seven samples
used clean harness `32f00b1`; the later TestingBot iPad used `cc678f2`, each with
byte-matched deployed assets before/after testing.

Device OS came from returned capabilities/device metadata. Generic provider OS
fields can identify a coordinator, and desktop/frozen user agents can misidentify
a mobile device. Record these separately from the WSL Linux test driver.

### Run and maintain farm checks

Use local hardware first, then a farm for missing browsers/devices or a full host
for checkout acceptance. Keep the [focused PR/full declared release policy](browser-testing.md#as-the-suite-grows).
Recheck only the selected provider rows and date their sources; rereading docs
must not renew an old test's date. Plans and pricing are excluded.

Verify live availability, authorized access and returned device/browser identity;
reject substituted emulators/VMs for physical-device tests. Use an identifiable
build or owned tunnel with trusted HTTPS. Remote `localhost` belongs to the
rendering host; [TestingBot iOS has a localhost limitation](https://testingbot.com/support/app-automate/help/tunnel).

Bound duration/concurrency/quota, including other account users. Check recording
retention and keep credentials and session IDs private. Close only owned
sessions/tunnels; reconcile uncertain allocation or cleanup before retrying.
Real-device labels do not prove API work or native gestures: record readback,
application paint and adapter evidence, keeping remote timings scoped to their
hardware, virtualization and load. [Endpoint setup](browser-testing.md#connect-one)
remains optional; this guide adds no SDK, provider adapter or default test matrix.
