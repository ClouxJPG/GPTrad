# Quantum Meteo — immersive storm simulator prototype

This is a multi-file browser prototype for the storm-simulator page that contains a `<canvas id="scene">` and controls such as `#cape`, `#shear`, `#humidity`, `#newStorm`, `#pause`, `#lightning`, and `#reset`.

## Files
- `sim.js` — scene, camera, UI and render loop
- `atmosphere.js` — low-resolution 3D moist-convection approximation
- `clouds.js` — volume raymarch renderer driven by the solver's condensate field
- `terrain.js` — procedural terrain and sky
- `weather.js` — precipitation and approximate lightning effects

## Install
Upload all five `.js` files to the same directory as the existing storm-simulator `index.html`. Do not replace the radar-map `index.html`; this build expects the separate storm-simulator page with `#scene`.

The existing page must load `sim.js` as an ES module, e.g. `<script type="module" src="./sim.js"></script>`. If it already does, leave it unchanged.

## Limits
This is an educational, low-resolution 3D approximation. It does not solve the full compressible Navier–Stokes equations, does not include full microphysics, and is not CM1 or a forecasting model. The cloud volume uses solver-generated condensate as its large-scale density field and procedural noise only for small-scale visual detail.
