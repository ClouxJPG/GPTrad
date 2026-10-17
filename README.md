# Quantum Meteo — 3D Storm Simulator

Standalone browser-based 3D atmosphere visualization. This is a self-contained project folder and does not modify an existing radar-map `index.html` when uploaded into a separate directory (recommended: `storm-sim/`).

## Run locally
Open `index.html` through a static web server. ES modules and import maps may be blocked by `file://`; GitHub Pages is suitable. Internet access is required to load Three.js from jsDelivr.

## Deploy from iPhone with GitHub mobile
1. Open `https://github.com/ClouxJPG/Daradar` and enter the repository.
2. Tap **Add file → Create new file**.
3. In the filename field enter `storm-sim/index.html`, paste the contents of this project's `index.html`, and commit.
4. Repeat for `storm-sim/sim.js`, `storm-sim/atmosphere.js`, `storm-sim/terrain.js`, `storm-sim/clouds.js`, and `storm-sim/weather.js` (copy each file's complete contents).
5. Add `storm-sim/README.md` if desired.
6. Open `https://clouxjpg.github.io/Daradar/storm-sim/` after GitHub Pages finishes deploying. If Pages is configured for a different repository or branch, use that repository's Pages URL instead.

Do not overwrite the repository's root `index.html`. The simulator runs in its own folder. All modules use relative local paths; Three.js and OrbitControls load from jsDelivr.

## Controls
Drag to orbit; pinch or scroll to zoom. Use the panel to select a scenario, adjust humidity/CAPE/shear/wind, pause, change time speed, and toggle rain, lightning, flow lines and diagnostics.

## What this model is—and isn't
The scene includes a procedural terrain, layered 3D cloud forms with animated procedural shading, moving convective cells, rain streaks, lightning flashes, and a simplified reduced-order atmospheric state. It is a visual/educational approximation. It is **not** a full CFD solver, not CM1, and not a forecasting product. CAPE, LCL and updraft diagnostics are approximate; tornado and microphysics processes are not quantitatively resolved.

## Verification performed
- JavaScript syntax checks with Node.js.
- ZIP integrity and required-file checks.
- Browser launch/screenshot tests should be performed on the deployment device; a static code check alone cannot guarantee WebGL rendering on every iPhone/Safari version.
