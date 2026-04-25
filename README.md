# Flow Map

Turn a Maestro test flow into a visual canvas of an app's screens connected by lines showing what action leads to what screen. Run an agent through the app, get a self-contained HTML file showing the as-built flow, spot gaps between Figma and reality.

## How it works

Three pieces:

1. **Maestro flow YAML** — every `takeScreenshot: name` is a node. The commands between two screenshots become the edge label connecting them.
2. **Node build script** (`src/build.mjs`) — walks the YAML, base64-embeds the screenshots, and templates everything into a single self-contained HTML file.
3. **Viewer** (`src/viewer.html` + `src/styles.css`) — React Flow + dagre + htm loaded from esm.sh via import map. No build step, no bundler. Laid out left-to-right.

## Runtime model

Your app runs in a local iOS or Android simulator on your machine. The Maestro CLI drives the flow YAML against that simulator. `takeScreenshot` commands write PNGs into `screenshots/`. Then `node src/build.mjs` walks the YAML, embeds the PNGs as base64, and writes a single HTML file you open in a browser.

## Quickstart (placeholder verification, no simulator needed)

```bash
npm install
npm run all
open dist/flow-map.html
```

This runs against the bundled placeholder flow + placeholder PNGs so you can verify the canvas renders before wiring up Maestro.

## Quickstart (real flow)

```bash
# 1. Boot your simulator and install the app under test
# 2. Capture screenshots by running your flow through Maestro:
npm run flow
# 3. Build the canvas:
npm run build
open dist/flow-map.html
```

## Authoring a flow

Drop a Maestro YAML in `flows/`. Every `takeScreenshot: name` becomes a node; the commands between two screenshots become the edge label connecting them. Example:

```yaml
appId: com.example.placeholder
---
- launchApp
- takeScreenshot: home
- tapOn: "Sign in"
- inputText: "user@example.com"
- takeScreenshot: login
- tapOn: "Continue"
- takeScreenshot: feed
```

Three nodes (`home`, `login`, `feed`), two edges with the action sequence as the label.

## Aesthetic

Specimen sheet, not dev dashboard. Cream paper background with a dot grid, white screen cards with soft shadows, Fraunces italic title, JetBrains Mono labels, faded vermilion accent. Light theme on purpose — dark phone screenshots pop.

## V1 limitations

- No screen deduplication — Home visited 3x shows as 3 nodes.
- No Figma export.
- No visual diff.
- Single linear flow only — no branching or sub-flows.
