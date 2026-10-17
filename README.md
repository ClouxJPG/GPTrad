# Quantum Meteo — Earth & Ground Observer

A separate GitHub Pages-ready prototype with two distinct modes:

1. `index.html` — interactive Earth map. Select a location and storm scenario, then open the ground observer.
2. `ground.html` — ground-level 3D view with procedural terrain, distant ridges, a ray-marched cloud-volume shader, precipitation particles, lightning flashes, time controls, and diagnostic readouts.

## Deploy from iPhone

1. Unzip this archive in Files.
2. In your GitHub repository, create a folder such as `storm-sim`.
3. Upload **all files** from this archive into that folder, preserving the names and same-folder relationships.
4. Enable GitHub Pages for the repository if it is not already enabled.
5. Open `https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/storm-sim/`.

No API keys or server are required. Internet is required for Leaflet, OpenStreetMap tiles, and Three.js CDN imports.

## Honest limitations

This is a procedural real-time visual model, not a numerical weather prediction model. The cloud volume is ray-marched and designed to create a more convincing sense of scale than primitive cloud spheres, but it is not photogrammetry or physically validated cloud microphysics. The terrain is procedurally generated rather than real local elevation data. The selected latitude/longitude is shown on the Earth map and passed to the scene URL, but does not yet load real satellite weather or geospatial terrain for that location.

## Checks performed

Run JavaScript syntax checks with Node.js in module mode. Validate the ZIP contents. A real Safari/iPhone visual test is still required before claiming reliable operation on all devices. External CDN and map-tile availability depends on connectivity.
