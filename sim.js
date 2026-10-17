// Quantum Meteo — lightweight 3D convective storm simulator
// Browser-only Three.js module. Designed for mobile performance; not a CM1 replacement.

import * as THREE from "https://esm.sh/three@0.180.0";
import { OrbitControls } from "https://esm.sh/three@0.180.0/examples/jsm/controls/OrbitControls.js";

const canvas = document.querySelector('#scene');
if (!canvas) throw new Error('Не найден canvas #scene в index.html');

const $ = id => document.getElementById(id);
const loading = $('loading');
const loadingTitle = $('loadingTitle');
const loadingText = $('loadingText');
const errorDetails = $('errorDetails');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9db9cc);
scene.fog = new THREE.FogExp2(0xa7bfcd, 0.0027);

const camera = new THREE.PerspectiveCamera(47, 1, 0.1, 1500);
camera.position.set(35, 26, 48);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  alpha: false,
  powerPreference: 'high-performance'
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
controls.maxDistance = 520;
controls.maxPolarAngle = Math.PI * 0.48;
controls.target.set(0, 9, 0);

scene.add(new THREE.HemisphereLight(0xd9edff, 0x4b493b, 1.7));

const sun = new THREE.DirectionalLight(0xfff0d8, 2.35);
sun.position.set(-28, 48, 24);
scene.add(sun);

const fill = new THREE.DirectionalLight(0x9fc9ff, 0.7);
fill.position.set(28, 20, -30);
scene.add(fill);

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

  return lerp(
    lerp(a, b, smooth(fx)),
    lerp(c, d, smooth(fx)),
    smooth(fz)
  ) * 2 - 1;
}

function fbm(x, z) {
  let s = 0;
  let a = 0.55;
  let f = 0.055;

  for (let i = 0; i < 5; i++) {
    s += valueNoise(x * f, z * f) * a;
    f *= 2.05;
    a *= 0.49;
  }

  return s;
}

// ============================================================
// SURFACE OF THE EARTH
// Preserved: same geometry, materials, colours and placement.
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

const pos = terrainGeo.attributes.position;
const colors = new Float32Array(pos.count * 3);
const waterline = 0.65;

for (let i = 0; i < pos.count; i++) {
  const x = pos.getX(i);
  const z = pos.getZ(i);

  const broad = fbm(x + 120, z - 70);
  const ridge = fbm(x - 37, z + 82);

  const hills = Math.max(0, broad * 5.0 + ridge * 2.0 - 0.35);

  const mountainMask = clamp(
    (fbm(x + 390, z - 240) + 0.1) * 1.9,
    0,
    1
  );

  const mountains =
    Math.pow(
      Math.max(0, fbm(x * 0.8 + 270, z * 0.8 - 170)),
      1.5
    ) *
    10.5 *
    mountainMask;

  const height = waterline + hills + mountains;
  pos.setY(i, height);

  const n = fbm(x + 900, z + 500);
  let c;

  if (height < 1.6) {
    c = new THREE.Color().setRGB(0.72, 0.68, 0.48);
  } else if (height < 3.8) {
    c = new THREE.Color().setRGB(0.26, 0.43, 0.23);
  } else if (height < 7.0) {
    c = new THREE.Color().setRGB(0.29, 0.37, 0.22);
  } else if (height < 10.5) {
    c = new THREE.Color().setRGB(0.37, 0.36, 0.31);
  } else {
    c = new THREE.Color().setRGB(0.66, 0.67, 0.65);
  }

  const variation = 1 + n * 0.13;

  colors[i * 3] = clamp(c.r * variation, 0, 1);
  colors[i * 3 + 1] = clamp(c.g * variation, 0, 1);
  colors[i * 3 + 2] = clamp(c.b * variation, 0, 1);
}

terrainGeo.setAttribute(
  'color',
  new THREE.BufferAttribute(colors, 3)
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

const ocean = new THREE.Mesh(
  new THREE.PlaneGeometry(360, 360),
  new THREE.MeshStandardMaterial({
    color: 0x426f89,
    roughness: 0.83,
    metalness: 0.02
  })
);

ocean.rotation.x = -Math.PI / 2;
ocean.position.y = 0.35;
scene.add(ocean);

const groundRing = new THREE.Mesh(
  new THREE.CircleGeometry(74, 96),
  new THREE.MeshBasicMaterial({
    color: 0x718b79,
    transparent: true,
    opacity: 0.14,
    depthWrite: false
  })
);

groundRing.rotation.x = -Math.PI / 2;
groundRing.position.y = 0.68;
scene.add(groundRing);

// ============================================================
// ATMOSPHERIC GRID
// Taller grid and narrower updraft cores reduce pancake-shaped
// clouds. The terrain above remains unchanged.
// ============================================================

const NX = 34;
const NY = 40;
const NZ = 34;

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
  clamp(Number($('humidity')?.value ?? 78) / 100, 0.48, 1.0);

let cape = Number($('cape')?.value ?? 1800);
let shear = Number($('shear')?.value ?? 22);

let paused = false;
let lightningOn = true;
let simTime = 0;
let frameNo = 0;
let stormMode = 'random';

const cores = [];

function makeCores(mode) {
  cores.length = 0;

  const n =
    mode === 'multicell' ? 4 :
    mode === 'squall' ? 5 :
    mode === 'tower' ? 1 :
    mode === 'supercell' ? 1 : 2;

  for (let i = 0; i < n; i++) {
    cores.push({
      x: (Math.random() - 0.5) * (mode === 'squall' ? 44 : 24),
      z: (Math.random() - 0.5) * 24,
      phase: Math.random() * Math.PI * 2,
      strength: 0.75 + Math.random() * 0.5,
      drift: (Math.random() - 0.5) * 0.3
    });
  }
}

function saturation(T) {
  const tc = T - 273.15;
  const e = 6.112 * Math.exp(17.67 * tc / (tc + 243.5));

  return clamp(
    0.622 * e / Math.max(1, 1000 - e),
    0.0005,
    0.035
  );
}

function envTemp(y) {
  return 300.5 - y * 0.58;
}

function seedFields() {
  for (let y = 0; y < NY; y++) {
    for (let z = 0; z < NZ; z++) {
      for (let x = 0; x < NX; x++) {
        const i = idx(x, y, z);
        const wy = y * DY;
        const T = envTemp(wy);

        temp[i] = 0;

        // Moist boundary layer. Rising air can reach saturation
        // and produce condensate through the simplified physics.
        vapor[i] =
          saturation(T) *
          Math.min(0.985, envRH() + 0.12 * Math.exp(-wy / 8)) *
          Math.exp(-wy / 52);

        cloud[i] = 0;
        up[i] = 0;
      }
    }
  }
}

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
// CONVECTION AND MICROPHYSICS
// ============================================================

function updatePhysics(dt) {
  const rh = envRH();
  const capeK = clamp(cape / 3500, 0.2, 1.35);
  const shearK = clamp(shear / 45, 0, 1.25);

  for (let y = 0; y < NY; y++) {
    for (let z = 0; z < NZ; z++) {
      for (let x = 0; x < NX; x++) {
        const i = idx(x, y, z);

        const wy = y * DY;
        const wx = x * DX - LAND_SIZE / 2;
        const wz = z * DZ - LAND_SIZE / 2;

        let forcing = 0;

        for (const c of cores) {
          const driftX =
            c.x +
            Math.sin(simTime * 0.13 + c.phase) * 2.6 +
            c.drift * simTime;

          const driftZ =
            c.z +
            Math.cos(simTime * 0.11 + c.phase) * 2.0;

          // Upper cloud layers spread and tilt with wind shear,
          // while the lower updraft remains relatively narrow.
          const anvil = Math.max(0, wy - 12);
          const shearShift = anvil * shearK * 0.42;

          const width =
            modeWidth(stormMode) * (1 + anvil * 0.025);

          const depth =
            modeDepth(stormMode) * (1 + anvil * 0.012);

          const r2 =
            ((wx - driftX - shearShift) ** 2) / (width ** 2) +
            ((wz - driftZ) ** 2) / (depth ** 2);

          const turbulence =
            0.88 +
            0.12 * valueNoise(
              x * 0.75 + y * 0.27,
              z * 0.75 - y * 0.19
            );

          const core =
            Math.exp(-r2 * 1.75) *
            Math.exp(-Math.max(0, wy - 2) / 27) *
            turbulence;

          const pulse =
            0.65 + 0.35 * Math.sin(simTime * 0.7 + c.phase);

          forcing += core * pulse * c.strength;
        }

        const oldT = temp[i];
        const oldV = vapor[i];
        const oldC = cloud[i];
        const oldU = up[i];

        // Stronger vertical development, with cloud loading
        // suppressing the updraft as condensate increases.
        const targetUp =
          Math.max(0, forcing * capeK * (1 - wy / 34)) -
          oldC * 1.45;

        nextUp[i] = lerp(
          oldU,
          targetUp,
          clamp(dt * 2.0, 0, 1)
        );

        // Adiabatic cooling helps the rising parcel reach saturation.
        const verticalCooling = nextUp[i] * dt * 2.15;

        nextTemp[i] =
          oldT +
          forcing * dt * 0.20 -
          verticalCooling -
          oldT * dt * 0.055;

        nextVapor[i] = Math.max(
          0,
          oldV +
          forcing * dt * saturation(envTemp(wy)) * 0.34 -
          oldV * dt * 0.0025
        );

        const qsat = saturation(envTemp(wy) + nextTemp[i]);
        const excess = nextVapor[i] - qsat;

        let cond = 0;

        if (excess > 0) {
          cond = Math.min(
            excess,
            excess * clamp(dt * 3.8, 0, 0.85)
          );

          nextVapor[i] -= cond;
        }

        // Condensate persists long enough to form coherent towers.
        nextCloud[i] = Math.max(
          0,
          oldC * (1 - dt * 0.035) +
          cond * dt * 15.0
        );

        // Latent heating from condensation.
        nextTemp[i] += cond * 2200;
      }
    }
  }

  temp.set(nextTemp);
  vapor.set(nextVapor);
  cloud.set(nextCloud);
  up.set(nextUp);

  // Weak smoothing removes isolated numerical artifacts without
  // flattening the cloud field into a wide horizontal layer.
  if (frameNo % 4 === 0) {
    for (let y = 1; y < NY - 1; y++) {
      for (let z = 1; z < NZ - 1; z++) {
        for (let x = 1; x < NX - 1; x++) {
          const i = idx(x, y, z);

          nextCloud[i] =
            cloud[i] * 0.82 +
            (
              cloud[idx(x - 1, y, z)] +
              cloud[idx(x + 1, y, z)] +
              cloud[idx(x, y, z - 1)] +
              cloud[idx(x, y, z + 1)] +
              cloud[idx(x, y - 1, z)] +
              cloud[idx(x, y + 1, z)]
            ) * 0.03;
        }
      }
    }

    cloud.set(nextCloud);
  }

  simTime += dt;
}

function modeWidth(m) {
  return m === 'squall' ? 11 :
    m === 'tower' ? 3.8 :
    m === 'supercell' ? 4.8 : 5.5;
}

function modeDepth(m) {
  return m === 'squall' ? 7 :
    m === 'tower' ? 3.8 :
    m === 'supercell' ? 5.2 : 4.8;
}

// ============================================================
// CLOUD ISOSURFACE
// Marching tetrahedra extracts the cloud surface from condensate.
// Rebuilds are throttled to reduce mobile GPU/CPU load.
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
  const iso = 0.0000045;
  const verts = [];

  const addTri = (a, b, c) => {
    verts.push(
      a[0], a[1], a[2],
      b[0], b[1], b[2],
      c[0], c[1], c[2]
    );
  };

  const interp = (p1, p2, v1, v2) => {
    const t = clamp(
      (iso - v1) / (v2 - v1 || 1e-9),
      0,
      1
    );

    return [
      lerp(p1[0], p2[0], t),
      lerp(p1[1], p2[1], t),
      lerp(p1[2], p2[2], t)
    ];
  };

  for (let y = 0; y < NY - 1; y++) {
    for (let z = 0; z < NZ - 1; z++) {
      for (let x = 0; x < NX - 1; x++) {
        const p = [];
        const v = [];

        for (const c of cubeCorners) {
          const gx = x + c[0];
          const gy = y + c[1];
          const gz = z + c[2];

          p.push([
            (gx / (NX - 1) - 0.5) * LAND_SIZE,
            gy * DY + 2,
            (gz / (NZ - 1) - 0.5) * LAND_SIZE
          ]);

          const raw = cloud[idx(gx, gy, gz)];

          // Only existing condensate is modified. Small 3D
          // variations create uneven cloud lobes and rounded edges.
          const rough =
            0.84 +
            0.32 * (
              (valueNoise(
                gx * 1.7 + gy * 0.61,
                gz * 1.7 - gy * 0.43
              ) + 1) * 0.5
            );

          v.push(raw * rough);
        }

        for (const tet of tetrahedra) {
          const inside = [];
          const outside = [];

          for (const j of tet) {
            (v[j] >= iso ? inside : outside).push(j);
          }

          if (inside.length === 0 || inside.length === 4) {
            continue;
          }

          if (inside.length === 1) {
            const a = inside[0];

            addTri(
              interp(p[a], p[outside[0]], v[a], v[outside[0]]),
              interp(p[a], p[outside[1]], v[a], v[outside[1]]),
              interp(p[a], p[outside[2]], v[a], v[outside[2]])
            );
          } else if (inside.length === 3) {
            const a = outside[0];

            addTri(
              interp(p[a], p[inside[0]], v[a], v[inside[0]]),
              interp(p[a], p[inside[2]], v[a], v[inside[2]]),
              interp(p[a], p[inside[1]], v[a], v[inside[1]])
            );
          } else {
            const a = inside[0];
            const b = inside[1];
            const c = outside[0];
            const d = outside[1];

            const ac = interp(p[a], p[c], v[a], v[c]);
            const ad = interp(p[a], p[d], v[a], v[d]);
            const bc = interp(p[b], p[c], v[b], v[c]);
            const bd = interp(p[b], p[d], v[b], v[d]);

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
    'position',
    new THREE.Float32BufferAttribute(verts, 3)
  );

  geometry.computeVertexNormals();

  const pAttr = geometry.attributes.position;
  const col = new Float32Array(pAttr.count * 3);

  for (let i = 0; i < pAttr.count; i++) {
    const h = pAttr.getY(i);
    const nx = pAttr.getX(i);
    const nz = pAttr.getZ(i);

    // Taller cloud surfaces are brighter; underside shading comes
    // from the actual surface normals and scene lighting.
    const shade = clamp((h - 4) / 18, 0, 1);

    const turbulence = valueNoise(
      nx * 1.8 + simTime * 1.7,
      nz * 1.8 - simTime
    ) * 0.06;

    const base = lerp(0.40, 0.97, shade) + turbulence;

    col[i * 3] = clamp(base * 0.97, 0, 1);
    col[i * 3 + 1] = clamp(base * 0.985, 0, 1);
    col[i * 3 + 2] = clamp(base + 0.015, 0, 1);
  }

  geometry.setAttribute(
    'color',
    new THREE.BufferAttribute(col, 3)
  );

  geometry.computeBoundingSphere();

  const mesh = new THREE.Mesh(geometry, cloudMaterial);

  if (cloudMesh) {
    cloudGroup.remove(cloudMesh);
    cloudMesh.geometry.dispose();
  }

  cloudMesh = mesh;
  cloudGroup.add(mesh);
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
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;

  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
}

window.addEventListener('resize', resize, { passive: true });
resize();

function setLoading(title, text) {
  if (loadingTitle) loadingTitle.textContent = title;
  if (loadingText) loadingText.textContent = text;
  if (loading) loading.style.display = 'flex';
}

function hideLoading() {
  if (loading) loading.style.display = 'none';
}

setLoading(
  'Quantum Meteo',
  'Инициализация рельефа и атмосферной сетки…'
);

// ============================================================
// METRICS
// ============================================================

function updateMetrics() {
  let maxH = 0;
  let cells = 0;

  for (let y = 0; y < NY; y++) {
    let found = false;

    for (let z = 0; z < NZ && !found; z++) {
      for (let x = 0; x < NX; x++) {
        if (cloud[idx(x, y, z)] > 0.0000045) {
          found = true;
          break;
        }
      }
    }

    if (found) maxH = y * DY;
  }

  for (const c of cores) {
    if (c.strength > 0.1) cells++;
  }

  if ($('cloudHeight')) {
    $('cloudHeight').textContent =
      maxH > 0 ? `${Math.round(maxH * 100)} м` : '—';
  }

  if ($('cellCount')) {
    $('cellCount').textContent = String(cells);
  }

  if ($('status')) {
    $('status').textContent = paused
      ? 'Пауза'
      : maxH > 4
        ? 'Конвекция'
        : 'Формирование';
  }
}

// ============================================================
// RESET AND UI EVENTS
// ============================================================

function resetStorm() {
  cape = Number($('cape')?.value ?? 1800);
  shear = Number($('shear')?.value ?? 22);

  stormMode = $('stormType')?.value ?? 'random';

  if (stormMode === 'random') {
    stormMode = ['tower', 'supercell', 'multicell', 'squall'][
      Math.floor(Math.random() * 4)
    ];
  }

  seedFields();
  makeCores(stormMode);

  simTime = 0;
  frameNo = 0;

  // Short spin-up before rendering the first cloud mesh.
  for (let i = 0; i < 18; i++) {
    updatePhysics(0.16);
    frameNo++;
  }

  rebuildCloudMesh();
  updateMetrics();
}

$('newStorm')?.addEventListener('click', resetStorm);

$('pause')?.addEventListener('click', () => {
  paused = !paused;

  const b = $('pause');
  if (b) b.textContent = paused ? 'Продолжить' : 'Пауза';

  updateMetrics();
});

$('lightning')?.addEventListener('click', () => {
  lightningOn = !lightningOn;

  const b = $('lightning');
  if (b) {
    b.textContent = lightningOn ? 'Молнии: вкл.' : 'Молнии: выкл.';
  }

  if (!lightningOn) {
    flashLight.intensity = 0;
    flashTimer = 0;
  }
});

$('reset')?.addEventListener('click', () => {
  camera.position.set(35, 26, 48);
  controls.target.set(0, 9, 0);
  controls.update();
  resetStorm();
});

for (const id of ['cape', 'shear', 'humidity']) {
  $(id)?.addEventListener('input', () => {
    cape = Number($('cape')?.value ?? 1800);
    shear = Number($('shear')?.value ?? 22);

    const pairs = [
      ['cape', 'capeValue'],
      ['shear', 'shearValue'],
      ['humidity', 'humidityValue']
    ];

    for (const [a, b] of pairs) {
      if ($(a) && $(b)) $(b).textContent = $(a).value;
    }
  });
}

$('stormType')?.addEventListener('change', resetStorm);

// ============================================================
// INITIALIZATION
// ============================================================

makeCores('supercell');
seedFields();

for (let i = 0; i < 18; i++) {
  updatePhysics(0.16);
  frameNo++;
}

rebuildCloudMesh();
hideLoading();

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

    // Cloud geometry is rebuilt less often to reduce mobile load.
    if (meshClock > 0.72) {
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
// ERROR HANDLER
// ============================================================

window.showStormError = err => {
  console.error(err);

  if (loading) loading.style.display = 'flex';

  if (loadingTitle) {
    loadingTitle.textContent = 'Ошибка симулятора';
  }

  if (loadingText) {
    loadingText.textContent = 'Не удалось запустить 3D-сцену.';
  }

  if (errorDetails) {
    errorDetails.style.display = 'block';
    errorDetails.textContent = String(err?.stack || err);
  }
};
