# Quantum Meteo — Earth + Ground Observer (revised)

Two separate modes:

- `index.html`: interactive Leaflet Earth map, location selection and scenario selection.
- `ground.html`: independent ground-level observer scene with an actual ground plane, local tree clusters, distant ridges, volumetric ray-marched cloud field, rain, lightning and generated atmospheric ambience.

## What changed in this revision

- Lowered the observer camera to about 2.4 m above the local ground rather than placing it 1.65 km above the surface.
- Flattened the immediate observer clearing so the camera starts above the ground instead of inside a hillside.
- Made the anvil denser and more continuous, reduced high-altitude erosion, and added connected convective turrets.
- Added smaller neighbouring cloud cells to create environmental context around the main storm.
- Added clustered foreground forest, varied rolling terrain, distant ridges and a subtle road for scale.
- Added optional procedural wind/rain/distant-thunder ambience. Audio is activated only after tapping the sound button, as required by mobile browser autoplay policies.
- Kept the map and ground observer in separate HTML pages. The existing repository root `index.html` need not be replaced; upload this project into a subfolder.

## Install on GitHub Pages from iPhone

1. Unzip the archive in Files.
2. In the repository, create a folder such as `storm-sim`.
3. Upload every file in this folder into `storm-sim`, preserving filenames and their relative paths.
4. Enable GitHub Pages if needed.
5. Open `https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/storm-sim/`.

Three.js is loaded from jsDelivr and Leaflet/map tiles from public CDN/OpenStreetMap, so an internet connection is required.

## Important limits

This remains a procedural real-time visualization, not a photogrammetric reconstruction, physically validated cloud microphysics solver, or numerical weather prediction model. The terrain and cloud structures are generated rather than loaded from real local elevation/satellite data. The soundscape is synthesized in-browser. No claim of 100% photorealism is made.

## Validation status

- JavaScript syntax checked with Node.js.
- Archive structure and file list checked after packaging.
- Browser/WebGL rendering must still be visually checked in Safari on the target iPhone; successful syntax checks do not guarantee a realistic final image or identical rendering on every device.
