# Diagrams

Each diagram is an Excalidraw source (`.excalidraw`) with an SVG of the same name. The pages embed the SVG; GitHub does not render the source. The SVGs in the starter were drawn from the same description as the sources, in a plain style; an export from the Excalidraw application looks hand-drawn and may differ in size.

| Diagram                 | Shows                                               | Embedded in                         |
| ----------------------- | --------------------------------------------------- | ----------------------------------- |
| `workflow`              | Who does what from issue to merged change           | README, getting started             |
| `guardrails`            | The four layers a change passes before `main`       | Getting started, local verification |
| `issue-statuses`        | The statuses of an issue in the Project             | Issue tracker                       |
| `browser-device-matrix` | Available desktop, local-device and farm test paths | Browser and device coverage         |

To change one, open the `.excalidraw` file at [excalidraw.com](https://excalidraw.com) (Open, then choose the file), edit it, save it back under the same name, and export it as SVG with a white background under the same name. Commit both files in the same pull request as the rule the diagram describes. The pages are the source of truth; a diagram that disagrees with its page is wrong.

## Browser matrix artwork

The coverage matrix is a map of available paths, not a record of passed tests.
Its text counterpart and evidence requirements are in
[browser and device coverage](../agents/browser-device-coverage.md).

Chrome, Edge, Firefox, Windows, Linux, Apple and Android icons come from
[Font Awesome Free / Fonticons, Inc.](https://github.com/FortAwesome/Font-Awesome/tree/14c65a3747d0f3b751f15831fc719236aea8729d/svgs/brands),
under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), as specified in
the [upstream license](https://github.com/FortAwesome/Font-Awesome/blob/14c65a3747d0f3b751f15831fc719236aea8729d/LICENSE.txt).
They are scaled and colored for this diagram; WSL combines the Windows and Linux
symbols. The [WebKit logo](https://github.com/WebKit/WebKit/blob/65e33c5b374283583803361d22c7576c8e2ad83d/Websites/webkit.org/wp-content/themes/webkit/images/webkit.svg)
retains its upstream copyright notice: Copyright © 2025 Apple Inc. All rights
reserved. Its display-P3 colors are converted to sRGB for portable SVG rendering.
The phone/tablet outlines are original diagram shapes. Marks identify test targets.
