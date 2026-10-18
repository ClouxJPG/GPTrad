# Quantum Meteo — Landscape Selection (visibility repair)

## What changed
- `ground.html` loads `boot.js` instead of importing the 3D scene directly.
- `boot.js` attempts to start the Three.js 3D scene. If the CDN or a module fails to load, it automatically starts `fallback.js` rather than leaving the user with a blue background and controls only.
- `fallback.js` is self-contained and has no external imports. It draws a visible sky, sun, distant ridges, forested terrain, a growing storm tower, a filled wind-sheared anvil, nearby cumulus, precipitation and a rain-rate display.
- Landscape selection stays in the setup screen. Map/location selection is not included.

## Install from iPhone
Upload all files inside this `storm-sim` folder into the `storm-sim` folder in the repository, keeping the filenames and directory structure. Do not upload the outer ZIP folder as an extra nested folder. The root project `index.html` is not changed.

Then open `https://clouxjpg.github.io/Daradar/storm-sim/` after GitHub Pages updates.

## Verification status
JavaScript syntax and archive structure were checked. A real browser/WebGL visual run was not available in the build environment. The compatibility renderer is a canvas fallback, not a physically accurate 3D atmosphere solver. When Three.js loads, the original 3D renderer is used.
