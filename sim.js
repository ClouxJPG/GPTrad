// ============================================================
// QUANTUM METEO — 3D CONVECTIVE STORM SIMULATOR
// Browser-only | Three.js | Mobile optimized
//
// FEATURES:
// - Procedural terrain with hills, ridges, mountains and ocean
// - Field-driven cloud condensation and 3D cloud surfaces
// - Supercell, tower, multicell and squall-line modes
// - CAPE, shear and humidity controls
// - Lightning flashes
// - Reduced geometry rebuild frequency for mobile performance
//
// This is a simplified educational model, not CM1.
// index.html is not modified.
// ============================================================

import * as THREE from "https://esm.sh/three@0.180.0";
import { OrbitControls } from "https://esm.sh/three@0.180.0/examples/jsm/controls/OrbitControls.js";

// ============================================================
// DOM
// ============================================================

const canvas = document.querySelector("#scene");
if (!canvas) throw new Error("Не найден canvas #scene в index.html");

const $ = id => document.getElementById(id);

const loading = $("loading");
const loadingTitle = $("loadingTitle");
const loadingText = $("loadingText");
const errorDetails = $("errorDetails");

// ============================================================
// SCENE
// ============================================================

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9bb8cc);
scene.fog = new THREE.FogExp2(0xa7bfcd, 0.0019);

const camera = new THREE.PerspectiveCamera(47, 1, 0.1, 500);
camera.position.set(35, 26, 48);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  alpha: false,
  powerPreference: "high-performance"
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
renderer.shadowMap.enabled = false;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.minDistance = 17;
controls.maxDistance = 115;
controls.maxPolarAngle = Math.PI * 0.48;
controls.target.set(0, 9, 0);

// ============================================================
// LIGHTING
// ============================================================

scene.add(
  new THREE.HemisphereLight(0xd9edff, 0x49473b, 1.7)
);

const sun = new THREE.DirectionalLight(0xfff0d8, 2.35);
sun.position.set(-28, 48, 24);
scene.add(sun);

const fill = new THREE.DirectionalLight(0x9fc9ff, 0.7);
fill.position.set(28, 20, -30);
scene.add(fill);

// ============================================================
// MATH AND PROCEDURAL NOISE
// ============================================================

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);

function hash2(x, z) {
  let n = Math.imul(x, 374761393) + Math.imul(z, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function valueNoise(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;

  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);

  return (
    lerp(
      lerp(a, b, smooth(fx)),
      lerp(c, d, smooth(fx)),
      smooth(fz)
    ) * 2 - 1
  );
}

function fbm(x, z) {
  let sum = 0;
  let amplitude = 0.55;
  let frequency = 0.055;

  for (let i = 0; i < 5; i++) {
    sum += valueNoise(x * frequency, z * frequency) * amplitude;
    frequency *= 2.05;
    amplitude *= 0.49;
  }

  return sum;
}

// ============================================================
// TERRAIN
// One static indexed mesh. No geometry changes per frame.
// ============================================================

const LAND_SIZE = 150;
const LAND_SEG = 164;

const terrainGeo = new THREE.PlaneGeometry(
  LAND_SIZE,
  LAND_SIZE,
  LAND_SEG,
  LAND_SEG
);

terrainGeo.rotateX(-Math.PI / 2);

const terrainPos = terrainGeo.attributes.position;
const terrainColors = new Float32Array(terrainPos.count * 3);

const colorSand = new THREE.Color(0xb6a477);
const colorGrass = new THREE.Color(0x466a3d);
const colorForest = new THREE.Color(0x304f32);
const colorRock = new THREE.Color(0x777568);
const colorSnow = new THREE.Color(0xc6c9c5);

for (let i = 0; i < terrainPos.count; i++) {
  const x = terrainPos.getX(i);
  const z = terrainPos.getZ(i);

  // Broad-scale terrain
  const broad = fbm(x + 120, z - 70);
  const middle = fbm(x - 37, z + 82);
  const fine = fbm(x * 1.7 + 41, z * 1.7 - 17);

  // Ridge systems and mountain regions
  const mountainMask = clamp(
    (fbm(x + 390, z - 240) + 0.08) * 2.2,
    0,
    1
  );

  const ridge = Math.max(
    0,
    1 - Math.abs(fbm(x * 0.58 + 270, z * 0.58 - 170)) * 2.1
  );

  const hills = Math.max(
    0,
    broad * 5.2 + middle * 2.7 + fine * 0.9 - 0.2
  );

  const mountains =
    Math.pow(
      Math.max(
        0,
        fbm(x * 0.8 + 270, z * 0.8 - 170) + ridge * 0.23
      ),
      1.35
    ) *
    12.0 *
    mountainMask;

  const height = 0.65 + hills + mountains;

  terrainPos.setY(i, height);

  // Natural elevation-based surface colors
  const variation = fine * 0.10 + middle * 0.06;
  let c;

  if (height < 1.5) {
    c = colorSand.clone().lerp(colorGrass, clamp((height - 0.6) * 0.65, 0, 1));
  } else if (height < 4.0) {
    c = colorGrass.clone().lerp(colorForest, clamp((height - 1.5) / 5, 0, 0.65));
  } else if (height < 7.5) {
    c = colorForest.clone().lerp(colorRock, clamp((height - 4.0) / 5, 0, 0.7));
  } else if (height < 11.0) {
    c = colorRock.clone().lerp(colorSnow, clamp((height - 7.5) / 5, 0, 0.85));
  } else {
    c = colorSnow.clone();
  }

  c.multiplyScalar(1 + variation);

  terrainColors[i * 3] = clamp(c.r, 0, 1);
  terrainColors[i * 3 + 1] = clamp(c.g, 0, 1);
  terrainColors[i * 3 + 2] = clamp(c.b, 0, 1);
}

terrainGeo.setAttribute(
  "color",
  new THREE.BufferAttribute(terrainColors, 3)
);

terrainGeo.computeVertexNormals();

const terrain = new THREE.Mesh(
  terrainGeo,
  new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0
  })
);

terrain.position.y = -0.35;
scene.add(terrain);

// Ocean plane
const ocean = new THREE.Mesh(
  new THREE.PlaneGeometry(360, 360),
  new THREE.MeshStandardMaterial({
    color: 0x426f89,
    roughness: 0.84,
    metalness: 0.02
  })
);

ocean.rotation.x = -Math.PI / 2;
ocean.position.y = 0.35;
scene.add(ocean);

// Subtle distant ground tint
const groundRing = new THREE.Mesh(
  new THREE.CircleGeometry(74, 96),
  new THREE.MeshBasicMaterial({
    color: 0x718b79,
    transparent: true,
    opacity: 0.12,
    depthWrite: false
  })
);

groundRing.rotation.x = -Math.PI / 2;
groundRing.position.y = 0.68;
scene.add(groundRing);

// ============================================================
// ATMOSPHERIC GRID
// ============================================================

const NX = 30;
const NY = 27;
const NZ = 30;

const DX = LAND_SIZE / (NX - 1);
const DY = 0.78;
const DZ = LAND_SIZE / (NZ - 1);

const COUNT = NX * NY * NZ;

const idx = (x, y, z) => (y * NZ + z) * NX + x;

const temp = new Float32Array(COUNT);
const vapor = new Float32Array(COUNT);
const cloud = new Float32Array(COUNT);
const up = new Float32Array(COUNT);

const nextTemp = new Float32Array(COUNT);
const nextVapor = new Float32Array(COUNT);
const nextCloud = new Float32Array(COUNT);
const nextUp = new Float32Array(COUNT);

const envRH = () =>
  clamp(Number($("humidity")?.value ?? 78) / 100, 0.48, 1.0);

let cape = Number($("cape")?.value ?? 1800);
let shear = Number($("shear")?.value ?? 22);

let paused = false;
let lightningOn = true;
let simTime = 0;
let frameNo = 0;
let stormMode = "supercell";

const cores = [];

function modeWidth(mode) {
  if (mode === "squall") return 13;
  if (mode === "tower") return 5;
  if (mode === "supercell") return 7;
  return 8;
}

function modeDepth(mode) {
  if (mode === "squall") return 8;
  if (mode === "tower") return 5;
  if (mode === "supercell") return 8;
  return 7;
}

function makeCores(mode) {
  cores.length = 0;

  const count =
    mode === "multicell" ? 4 :
    mode === "squall" ? 5 :
    mode === "tower" ? 1 :
    mode === "supercell" ? 1 : 2;

  for (let i = 0; i < count; i++) {
    cores.push({
      x: (Math.random() - 0.5) * (mode === "squall" ? 44 : 24),
      z: (Math.random() - 0.5) * 24,
      phase: Math.random() * Math.PI * 2,
      strength: 0.85 + Math.random() * 0.35,
      drift: (Math.random() - 0.5) * 0.3
    });
  }
}

function saturation(T) {
  const tc = T - 273.15;
  const e = 6.112 * Math.exp((17.67 * tc) / (tc + 243.5));
  return clamp(0.622 * e / Math.max(1, 1000 - e), 0.0005, 0.035);
}

function envTemp(y) {
  return 300.5 - y * 0.58;
}

function seedFields() {
  const rh = envRH();

  for (let y = 0; y < NY; y++) {
    for (let z = 0; z < NZ; z++) {
      for (let x = 0; x < NX; x++) {
        const i = idx(x, y, z);
        const height = y * DY;
        const T = envTemp(height);

        temp[i] = 0;

        // Moist boundary layer, gradually drier aloft.
        // Active updrafts can push this air above saturation.
        vapor[i] =
          saturation(T) *
          Math.min(0.985, rh + 0.08 * Math.exp(-height / 8)) *
          Math.exp(-height / 90);

        cloud[i] = 0;
        up[i] = 0;
      }
    }
  }
}

seedFields();

// ============================================================
// TRILINEAR FIELD SAMPLER
// ============================================================

function sample(arr, x, y, z) {
  x = clamp(x, 0, NX - 1.001);
  y = clamp(y, 0, NY - 1.001);
  z = clamp(z, 0, NZ - 1.001);

  const x0 = x | 0;
  const y0 = y | 0;
  const z0 = z | 0;

  const fx = x - x0;
  const fy = y - y0;
  const fz = z - z0;

  const a = lerp(
    arr[idx(x0, y0, z0)],
    arr[idx(x0 + 1, y0, z0)],
    fx
  );

  const b = lerp(
    arr[idx(x0, y0, z0 + 1)],
    arr[idx(x0 + 1, y0, z0 + 1)],
    fx
  );

  const c = lerp(
    arr[idx(x0, y0 + 1, z0)],
    arr[idx(x0 + 1, y0 + 1, z0)],
    fx
  );

  const d = lerp(
    arr[idx(x0, y0 + 1, z0 + 1)],
    arr[idx(x0 + 1, y0 + 1, z0 + 1)],
    fx
  );

  return lerp(lerp(a, b, fz), lerp(c, d, fz), fy);
}

// ============================================================
// SIMPLIFIED CONVECTION AND MICROPHYSICS
// ============================================================

function updatePhysics(dt) {
  const rh = envRH();
  const capeK = clamp(cape / 3000, 0.25, 1.45);
  const shearK = clamp(shear / 45, 0, 1.25);

  for (let y = 0; y < NY; y++) {
    for (let z = 0; z < NZ; z++) {
      for (let x = 0; x < NX; x++) {
        const i = idx(x, y, z);

        const height = y * DY;
        const wx = x * DX - LAND_SIZE / 2;
        const wz = z * DZ - LAND_SIZE / 2;

        let forcing = 0;

        for (const core of cores) {
          const driftX =
            core.x +
            Math.sin(simTime * 0.13 + core.phase) * 2.6 +
            core.drift * simTime;

          const driftZ =
            core.z +
            Math.cos(simTime * 0.11 + core.phase) * 2.0;

          const width = modeWidth(stormMode);
          const depth = modeDepth(stormMode);

          const radius =
            ((wx - driftX) ** 2) / (width * width) +
            ((wz - driftZ) ** 2) / (depth * depth);

          // Updraft forcing decreases with height.
          const coreForce =
            Math.exp(-radius * 1.5) *
            Math.exp(-Math.max(0, height - 2) / 19);

          const pulse =
            0.72 + 0.28 * Math.sin(simTime * 0.7 + core.phase);

          forcing += coreForce * pulse * core.strength;
        }

        const oldT = temp[i];
        const oldV = vapor[i];
        const oldC = cloud[i];
        const oldU = up[i];

        // Stronger forcing with increasing CAPE.
        const targetUp =
          Math.max(0, forcing * capeK * (1 - height / 29)) -
          oldC * 1.25;

        nextUp[i] = lerp(
          oldU,
          targetUp,
          clamp(dt * 2.0, 0, 1)
        );

        // Parcel cooling from ascent, balanced by buoyancy heating.
        const ascentCooling = nextUp[i] * dt * 2.6;
        const buoyantHeating = forcing * dt * 0.20;

        nextTemp[i] =
          oldT +
          buoyantHeating -
          ascentCooling -
          oldT * dt * 0.06;

        // Moisture transport and weak environmental mixing.
        const moistureSupply =
          forcing *
          dt *
          saturation(envTemp(height)) *
          (0.42 + rh * 0.16);

        nextVapor[i] = Math.max(
          0,
          oldV +
          moistureSupply -
          oldV * dt * 0.002
        );

        // Supersaturation is evaluated against parcel temperature.
        const parcelTemperature =
          envTemp(height) + nextTemp[i];

        const qsat = saturation(parcelTemperature);
        const excess = nextVapor[i] - qsat;

        let condensed = 0;

        if (excess > 0) {
          condensed = Math.min(
            excess,
            excess * clamp(dt * 5.0, 0, 0.92)
          );

          nextVapor[i] -= condensed;
        }

        // Cloud-water mixing ratio. Evaporation is slower than
        // condensation so freshly formed cloud does not vanish instantly.
        const cloudGrowth = condensed * dt * 22;

        const evaporation =
          oldC *
          dt *
          (oldV < qsat * 0.88 ? 0.11 : 0.035);

        nextCloud[i] = Math.max(
          0,
          oldC + cloudGrowth - evaporation
        );

        // Latent heating from condensation.
        nextTemp[i] += condensed * 2200;

        // Small horizontal influence from wind shear.
        // This is a simplified transport term, not a full fluid solver.
        if (shearK > 0.01 && x > 0) {
          const upstream = cloud[idx(x - 1, y, z)];
          nextCloud[i] =
            nextCloud[i] * (1 - 0.012 * shearK) +
            upstream * 0.012 * shearK;
        }
      }
    }
  }

  temp.set(nextTemp);
  vapor.set(nextVapor);
  cloud.set(nextCloud);
  up.set(nextUp);

  // Smooth only the scalar cloud-water field.
  // This removes isolated grid artifacts while preserving cloud structure.
  if (frameNo % 3 === 0) {
    for (let y = 1; y < NY - 1; y++) {
      for (let z = 1; z < NZ - 1; z++) {
        for (let x = 1; x < NX - 1; x++) {
          const i = idx(x, y, z);

          nextCloud[i] =
            cloud[i] * 0.58 +
            (
              cloud[idx(x - 1, y, z)] +
              cloud[idx(x + 1, y, z)] +
              cloud[idx(x, y, z - 1)] +
              cloud[idx(x, y, z + 1)] +
              cloud[idx(x, y - 1, z)] +
              cloud[idx(x, y + 1, z)]
            ) * 0.07;
        }
      }
    }

    cloud.set(nextCloud);
  }

  simTime += dt;
}

// ============================================================
// CLOUD ISOSURFACE
// Marching tetrahedra: cloud mesh rebuilt periodically.
// ============================================================

const cloudGroup = new THREE.Group();
scene.add(cloudGroup);

const cloudMaterial = new THREE.MeshStandardMaterial({
  color: 0xe5edf2,
  roughness: 0.96,
  metalness: 0,
  side: THREE.DoubleSide,
  vertexColors: true
});

let cloudMesh = null;

// Consistent subdivision of a cube into six tetrahedra.
const cubeCorners = [
  [0, 0, 0],
  [1, 0, 0],
  [1, 0, 1],
  [0, 0, 1],
  [0, 1, 0],
  [1, 1, 0],
  [1, 1, 1],
  [0, 1, 1]
];

const tetrahedra = [
  [0, 5, 1, 6],
  [0, 1, 2, 6],
  [0, 2, 3, 6],
  [0, 3, 7, 6],
  [0, 7, 4, 6],
  [0, 4, 5, 6]
];

function rebuildCloudMesh() {
  // Low threshold makes weak but real condensate visible.
  const iso = 0.0000035;
  const verts = [];

  const addTri = (a, b, c) => {
    verts.push(
      a[0], a[1], a[2],
      b[0], b[1], b[2],
      c[0], c[1], c[2]
    );
  };

  const interp = (p1, p2, v1, v2) => {
    const t = clamp((iso - v1) / (v2 - v1 || 1e-9), 0, 1);

    return [
      lerp(p1[0], p2[0], t),
      lerp(p1[1], p2[1], t),
      lerp(p1[2], p2[2], t)
    ];
  };

  for (let y = 0; y < NY - 1; y++) {
    for (let z = 0; z < NZ - 1; z++) {
      for (let x = 0; x < NX - 1; x++) {
        const points = [];
        const values = [];

        for (const corner of cubeCorners) {
          const gx = x + corner[0];
          const gy = y + corner[1];
          const gz = z + corner[2];

          points.push([
            (gx / (NX - 1) - 0.5) * LAND_SIZE,
            gy * DY + 2,
            (gz / (NZ - 1) - 0.5) * LAND_SIZE
          ]);

          values.push(cloud[idx(gx, gy, gz)]);
        }

        for (const tet of tetrahedra) {
          const inside = [];
          const outside = [];

          for (const j of tet) {
            (values[j] >= iso ? inside : outside).push(j);
          }

          if (inside.length === 0 || inside.length === 4) continue;

          if (inside.length === 1) {
            const a = inside[0];

            addTri(
              interp(points[a], points[outside[0]], values[a], values[outside[0]]),
              interp(points[a], points[outside[1]], values[a], values[outside[1]]),
              interp(points[a], points[outside[2]], values[a], values[outside[2]])
            );
          } else if (inside.length === 3) {
            const a = outside[0];

            addTri(
              interp(points[a], points[inside[0]], values[a], values[inside[0]]),
              interp(points[a], points[inside[2]], values[a], values[inside[2]]),
              interp(points[a], points[inside[1]], values[a], values[inside[1]])
            );
          } else {
            const a = inside[0];
            const b = inside[1];
            const c = outside[0];
            const d = outside[1];

            const ac = interp(points[a], points[c], values[a], values[c]);
            const ad = interp(points[a], points[d], values[a], values[d]);
            const bc = interp(points[b], points[c], values[b], values[c]);
            const bd = interp(points[b], points[d], values[b], values[d]);

            addTri(ac, ad, bc);
            addTri(ad, bd, bc);
          }
        }
      }
    }
  }

  if (verts.length < 9) {
    if (cloudMesh) {
      cloudGroup.remove(cloudMesh);
      cloudMesh.geometry.dispose();
      cloudMesh = null;
    }

    return;
  }

  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(verts, 3)
  );

  geometry.computeVertexNormals();

  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);

  for (let i = 0; i < position.count; i++) {
    const h = position.getY(i);
    const x = position.getX(i);
    const z = position.getZ(i);

    // Higher cloud surfaces receive more light.
    const heightShade = clamp((h - 4) / 18, 0, 1);

    // Small deterministic surface variation adds visible texture
    // without replacing the simulated cloud-water field.
    const texture =
      valueNoise(
        x * 1.8 + simTime * 0.12,
        z * 1.8 - simTime * 0.08
      ) * 0.055;

    const shade = clamp(
      lerp(0.38, 0.98, heightShade) + texture,
      0.22,
      1
    );

    colors[i * 3] = shade * 0.97;
    colors[i * 3 + 1] = shade * 0.985;
    colors[i * 3 + 2] = Math.min(1, shade + 0.015);
  }

  geometry.setAttribute(
    "color",
    new THREE.BufferAttribute(colors, 3)
  );

  geometry.computeBoundingSphere();

  const newMesh = new THREE.Mesh(geometry, cloudMaterial);

  if (cloudMesh) {
    cloudGroup.remove(cloudMesh);
    cloudMesh.geometry.dispose();
  }

  cloudMesh = newMesh;
  cloudGroup.add(cloudMesh);
}

// ============================================================
// LIGHTNING
// ============================================================

const flashLight = new THREE.PointLight(0xd9e8ff, 0, 48, 2);
flashLight.position.set(0, 18, 0);
scene.add(flashLight);

let flashTimer = 0;
let lightningCooldown = 2;

function lightningStrike() {
  if (!lightningOn || lightningCooldown > 0 || !cloudMesh) return;
  if (Math.random() < 0.985) return;

  flashTimer = 0.11 + Math.random() * 0.12;
  lightningCooldown = 2.5 + Math.random() * 7;
  flashLight.intensity = 30 + Math.random() * 28;
}

// ============================================================
// RESIZE AND LOADING UI
// ============================================================

function resize() {
  const width = canvas.clientWidth || window.innerWidth;
  const height = canvas.clientHeight || window.innerHeight;

  renderer.setSize(width, height, false);

  camera.aspect = width / Math.max(1, height);
  camera.updateProjectionMatrix();
}

window.addEventListener("resize", resize, { passive: true });
resize();

function setLoading(title, text) {
  if (loadingTitle) loadingTitle.textContent = title;
  if (loadingText) loadingText.textContent = text;
  if (loading) loading.style.display = "flex";
}

function hideLoading() {
  if (loading) loading.style.display = "none";
}

setLoading(
  "Quantum Meteo",
  "Инициализация рельефа и атмосферной сетки…"
);

// ============================================================
// METRICS
// ============================================================

function updateMetrics() {
  let maxH = 0;

  for (let y = 0; y < NY; y++) {
    let found = false;

    for (let z = 0; z < NZ && !found; z++) {
      for (let x = 0; x < NX; x++) {
        if (cloud[idx(x, y, z)] > 0.0000035) {
          found = true;
          break;
        }
      }
    }

    if (found) maxH = y * DY;
  }

  const activeCells = cores.filter(core => core.strength > 0.1).length;

  if ($("cloudHeight")) {
    $("cloudHeight").textContent =
      maxH > 0 ? `${Math.round(maxH * 100)} м` : "Формируется";
  }

  if ($("cellCount")) {
    $("cellCount").textContent = String(activeCells);
  }

  if ($("status")) {
    $("status").textContent = paused
      ? "Пауза"
      : maxH > 4
        ? "Конвекция"
        : "Формирование";
  }
}

// ============================================================
// RESET / UI EVENTS
// ============================================================

function resetStorm() {
  cape = Number($("cape")?.value ?? 1800);
  shear = Number($("shear")?.value ?? 22);

  stormMode = $("stormType")?.value ?? "random";

  if (stormMode === "random") {
    const modes = ["tower", "supercell", "multicell", "squall"];
    stormMode = modes[Math.floor(Math.random() * modes.length)];
  }

  seedFields();
  makeCores(stormMode);

  simTime = 0;
  frameNo = 0;

  // Short spin-up makes the first visible frame less empty.
  for (let i = 0; i < 22; i++) {
    updatePhysics(0.18);
    frameNo++;
  }

  rebuildCloudMesh();
  updateMetrics();
}

$("newStorm")?.addEventListener("click", resetStorm);

$("pause")?.addEventListener("click", () => {
  paused = !paused;

  const button = $("pause");
  if (button) {
    button.textContent = paused ? "Продолжить" : "Пауза";
  }

  updateMetrics();
});

$("lightning")?.addEventListener("click", () => {
  lightningOn = !lightningOn;

  const button = $("lightning");
  if (button) {
    button.textContent = lightningOn
      ? "Молнии: вкл."
      : "Молнии: выкл.";
  }

  if (!lightningOn) {
    flashLight.intensity = 0;
    flashTimer = 0;
  }
});

$("reset")?.addEventListener("click", () => {
  camera.position.set(35, 26, 48);
  controls.target.set(0, 9, 0);
  controls.update();
  resetStorm();
});

for (const id of ["cape", "shear", "humidity"]) {
  $(id)?.addEventListener("input", () => {
    cape = Number($("cape")?.value ?? 1800);
    shear = Number($("shear")?.value ?? 22);

    const pairs = [
      ["cape", "capeValue"],
      ["shear", "shearValue"],
      ["humidity", "humidityValue"]
    ];

    for (const [inputId, valueId] of pairs) {
      if ($(inputId) && $(valueId)) {
        $(valueId).textContent = $(inputId).value;
      }
    }
  });
}

$("stormType")?.addEventListener("change", resetStorm);

// ============================================================
// INITIALIZE
// ============================================================

makeCores("supercell");

for (let i = 0; i < 22; i++) {
  updatePhysics(0.18);
  frameNo++;
}

rebuildCloudMesh();
updateMetrics();
hideLoading();

// ============================================================
// ANIMATION LOOP
// ============================================================

let last = performance.now();
let meshClock = 0;
let metricClock = 0;

function animate(now) {
  requestAnimationFrame(animate);

  const dt = Math.min((now - last) / 1000, 0.04);
  last = now;

  if (!paused) {
    updatePhysics(dt * 1.8);
    frameNo++;

    meshClock += dt;
    metricClock += dt;

    // Expensive isosurface extraction is deliberately throttled.
    if (meshClock > 0.65) {
      rebuildCloudMesh();
      meshClock = 0;
    }

    if (metricClock > 1.0) {
      updateMetrics();
      metricClock = 0;
    }

    lightningCooldown = Math.max(0, lightningCooldown - dt);

    if (flashTimer > 0) {
      flashTimer -= dt;

      if (flashTimer <= 0) {
        flashLight.intensity = 0;
      } else if (Math.random() < 0.4) {
        flashLight.intensity *= 0.3;
      }
    }

    lightningStrike();
  }

  controls.update();
  renderer.render(scene, camera);
}

requestAnimationFrame(animate);

// ============================================================
// ERROR HANDLER USED BY index.html
// ============================================================

window.showStormError = err => {
  console.error(err);

  if (loading) loading.style.display = "flex";

  if (loadingTitle) {
    loadingTitle.textContent = "Ошибка симулятора";
  }

  if (loadingText) {
    loadingText.textContent = "Не удалось запустить 3D-сцену.";
  }

  if (errorDetails) {
    errorDetails.style.display = "block";
    errorDetails.textContent = String(err?.stack || err);
  }
};
