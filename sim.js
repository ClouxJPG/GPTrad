
/* ============================================================
   QUANTUM METEO — NUMERICAL CONVECTION MODEL
   Browser-based 2D Boussinesq-style moist-convection solver

   Numerical state:
   u, w   — horizontal and vertical wind [m/s]
   th     — potential-temperature perturbation [K]
   qv     — water-vapor mixing ratio [kg/kg]
   qc     — cloud-water mixing ratio [kg/kg]
   qr     — rainwater mixing ratio [kg/kg]
   p      — pressure correction for velocity projection

   Physics:
   - semi-Lagrangian transport
   - buoyancy and environmental stability
   - latent heating from condensation
   - rain fallout and evaporative cooling
   - surface thermal forcing
   - vertical wind shear
   - approximate pressure projection

   This is a simplified educational model, NOT CM1.
   index.html is not modified.
   ============================================================ */

import * as THREE from "https://esm.sh/three@0.180.0";
import { OrbitControls } from
  "https://esm.sh/three@0.180.0/examples/jsm/controls/OrbitControls.js";

// ============================================================
// DOM
// ============================================================

const canvas = document.getElementById("scene");
if (!canvas) throw new Error("Quantum Meteo: #scene not found");

const $ = id => document.getElementById(id);

const ui = {
  cape: $("cape"),
  shear: $("shear"),
  humidity: $("humidity"),
  capeValue: $("capeValue"),
  shearValue: $("shearValue"),
  humidityValue: $("humidityValue"),
  cloudHeight: $("cloudHeight"),
  cellCount: $("cellCount"),
  status: $("status"),
  newStorm: $("newStorm"),
  pause: $("pause"),
  lightning: $("lightning"),
  reset: $("reset"),
  stormType: $("stormType"),
  loading: $("loading"),
  growthSpeed: $("growthSpeed")
};

// ============================================================
// GRID AND CONSTANTS
// ============================================================

const NX = 72;
const NZ = 40;
const N = NX * NZ;

const DX = 250;
const DZ = 250;

const DOMAIN_X = (NX - 1) * DX;
const DOMAIN_Z = (NZ - 1) * DZ;

const GRAVITY = 9.81;
const CP = 1004;
const LV = 2.5e6;
const THETA0 = 300;

const MODEL_DT = 0.30;
const SUBSTEPS = 2;
const DIFFUSIVITY = 8;
const VELOCITY_DAMPING = 0.003;

const idx = (i, k) => k * NX + i;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;

let simTime = 0;
let frameNumber = 0;
let paused = false;
let lightningEnabled = true;
let stormSeed = 1;
let stormAge = 0;
let lastFrame = performance.now();
let lastMetrics = 0;
let lastRenderUpdate = 0;
let activeCells = 0;
let maxCloudHeight = 0;
let accumulatedRain = 0;

// ============================================================
// ATMOSPHERIC STATE
// ============================================================

function makeField() {
  return new Float32Array(N);
}

const F = {
  u: makeField(),
  w: makeField(),
  th: makeField(),
  qv: makeField(),
  qc: makeField(),
  qr: makeField(),

  u0: makeField(),
  w0: makeField(),
  th0: makeField(),
  qv0: makeField(),
  qc0: makeField(),
  qr0: makeField(),

  buoyancy: makeField(),
  div: makeField(),
  pressure: makeField(),
  pressure2: makeField()
};

let capeJkg = 1800;
let shearMs = 15;
let relativeHumidity = 0.78;

function readSlider(element, fallback, physicalMax) {
  if (!element) return fallback;

  const min = Number(element.min || 0);
  const max = Number(element.max || physicalMax);
  const value = Number(element.value);

  if (!Number.isFinite(value)) return fallback;

  if (max <= 1) {
    return clamp(value, 0, 1) * physicalMax;
  }

  return clamp(value, min, max);
}

function readParameters() {
  capeJkg = readSlider(ui.cape, 1800, 5000);
  shearMs = readSlider(ui.shear, 15, 50);

  const h = readSlider(ui.humidity, 78, 100);
  relativeHumidity = clamp(h / 100, 0.05, 1.0);

  if (ui.capeValue) {
    ui.capeValue.textContent = `${Math.round(capeJkg)} J/kg`;
  }

  if (ui.shearValue) {
    ui.shearValue.textContent = `${shearMs.toFixed(1)} m/s`;
  }

  if (ui.humidityValue) {
    ui.humidityValue.textContent =
      `${Math.round(relativeHumidity * 100)}%`;
  }
}

// ============================================================
// ENVIRONMENT
// ============================================================

function baseWind(z) {
  const h = clamp(z / DOMAIN_Z, 0, 1);
  return shearMs * (h * h * 0.75 + h * 0.25);
}

function environmentalThetaGradient() {
  // Potential-temperature gradient [K/m].
  // A simplified stable background stratification.
  return 0.003;
}

function ambientVapor(z) {
  const decrease = Math.exp(-z / 6500);
  return 0.016 * relativeHumidity * decrease;
}

function saturationMixingRatio(z, thetaPerturbation) {
  const temperatureC =
    26 - 0.006 * z + thetaPerturbation;

  const pressureHpa = 1000 * Math.exp(-z / 8000);

  const exponent =
    17.67 * temperatureC / (temperatureC + 243.5);

  const vaporPressure = 6.112 * Math.exp(
    clamp(exponent, -10, 10)
  );

  return 0.622 * vaporPressure /
    Math.max(pressureHpa - vaporPressure, 1);
}

// ============================================================
// DETERMINISTIC RANDOMNESS
// ============================================================

function random01() {
  stormSeed = (1664525 * stormSeed + 1013904223) >>> 0;
  return stormSeed / 4294967296;
}

function gaussian(x, center, width) {
  const d = (x - center) / Math.max(width, 1);
  return Math.exp(-0.5 * d * d);
}

// ============================================================
// INITIAL CONDITIONS
// ============================================================

function initializeAtmosphere(trigger = true) {
  for (let k = 0; k < NZ; k++) {
    const z = k * DZ;

    for (let i = 0; i < NX; i++) {
      const n = idx(i, k);

      F.u[n] = baseWind(z);
      F.w[n] = 0;

      F.th[n] = 0;
      F.qv[n] = ambientVapor(z);
      F.qc[n] = 0;
      F.qr[n] = 0;

      F.pressure[n] = 0;
      F.pressure2[n] = 0;
    }
  }

  if (trigger) {
    const center = NX * 0.32;
    const width = NX * 0.085;

    // Initial warm, moist thermal perturbation.
    for (let k = 1; k < 15; k++) {
      for (let i = 0; i < NX; i++) {
        const n = idx(i, k);
        const r2 =
          ((i - center) / width) ** 2 +
          ((k - 5) / 4.5) ** 2;

        const bubble = Math.exp(-r2 * 1.25);

        F.th[n] += 2.3 * bubble;
        F.qv[n] += 0.0012 * bubble;
      }
    }

    // A weak initial upward impulse near the surface.
    for (let i = 0; i < NX; i++) {
      const n = idx(i, 1);
      F.w[n] += 0.7 * gaussian(i, center, width);
    }
  }

  simTime = 0;
  stormAge = 0;
  accumulatedRain = 0;
  activeCells = 0;
  maxCloudHeight = 0;
}

// ============================================================
// SEMI-LAGRANGIAN ADVECTION
// ============================================================

function sampleBilinear(field, x, z) {
  const gx = clamp(x / DX, 0, NX - 1.001);
  const gz = clamp(z / DZ, 0, NZ - 1.001);

  const i0 = Math.floor(gx);
  const k0 = Math.floor(gz);
  const i1 = Math.min(i0 + 1, NX - 1);
  const k1 = Math.min(k0 + 1, NZ - 1);

  const fx = gx - i0;
  const fz = gz - k0;

  const a = lerp(
    field[idx(i0, k0)],
    field[idx(i1, k0)],
    fx
  );

  const b = lerp(
    field[idx(i0, k1)],
    field[idx(i1, k1)],
    fx
  );

  return lerp(a, b, fz);
}

function advectField(source, target, dt) {
  for (let k = 0; k < NZ; k++) {
    const z = k * DZ;

    for (let i = 0; i < NX; i++) {
      const n = idx(i, k);
      const x = i * DX;

      const u = F.u[n];
      const w = F.w[n];

      // Midpoint backtrace reduces first-order trajectory error.
      const mx = x - 0.5 * dt * u;
      const mz = z - 0.5 * dt * w;

      const um = sampleBilinear(F.u, mx, mz);
      const wm = sampleBilinear(F.w, mx, mz);

      const bx = x - dt * um;
      const bz = z - dt * wm;

      target[n] = sampleBilinear(source, bx, bz);
    }
  }
}

// ============================================================
// DIFFUSION
// ============================================================

function diffuseField(field, output, dt, coefficient) {
  const alpha = coefficient * dt;

  for (let k = 0; k < NZ; k++) {
    for (let i = 0; i < NX; i++) {
      const n = idx(i, k);

      const left = field[idx(Math.max(i - 1, 0), k)];
      const right = field[idx(Math.min(i + 1, NX - 1), k)];

      const down = field[idx(i, Math.max(k - 1, 0))];
      const up = field[idx(i, Math.min(k + 1, NZ - 1))];

      const lap =
        (left - 2 * field[n] + right) / (DX * DX) +
        (down - 2 * field[n] + up) / (DZ * DZ);

      output[n] = field[n] + alpha * lap;
    }
  }
}

// ============================================================
// PRESSURE PROJECTION
// Approximately removes divergent velocity components.
// ============================================================

function projectVelocity(dt) {
  const p = F.pressure;
  let next = F.pressure2;

  // Compute velocity divergence.
  for (let k = 0; k < NZ; k++) {
    for (let i = 0; i < NX; i++) {
      const il = Math.max(i - 1, 0);
      const ir = Math.min(i + 1, NX - 1);
      const kd = Math.max(k - 1, 0);
      const ku = Math.min(k + 1, NZ - 1);

      const du =
        (F.u[idx(ir, k)] - F.u[idx(il, k)]) /
        ((ir - il) * DX || DX);

      const dw =
        (F.w[idx(i, ku)] - F.w[idx(i, kd)]) /
        ((ku - kd) * DZ || DZ);

      F.div[idx(i, k)] = du + dw;
    }
  }

  p.fill(0);

  const ax = 1 / (DX * DX);
  const az = 1 / (DZ * DZ);
  const denominator = 2 * ax + 2 * az;

  // Jacobi iterations for the pressure Poisson equation.
  for (let iteration = 0; iteration < 12; iteration++) {
    for (let k = 1; k < NZ - 1; k++) {
      for (let i = 1; i < NX - 1; i++) {
        const n = idx(i, k);

        next[n] = (
          (p[idx(i - 1, k)] + p[idx(i + 1, k)]) * ax +
          (p[idx(i, k - 1)] + p[idx(i, k + 1)]) * az -
          F.div[n] / dt
        ) / denominator;
      }
    }

    // Swap buffers.
    const old = F.pressure;
    F.pressure = F.pressure2;
    F.pressure2 = old;

    // Keep the physical boundary values fixed.
    for (let i = 0; i < NX; i++) {
      F.pressure[idx(i, 0)] = 0;
      F.pressure[idx(i, NZ - 1)] = 0;
    }
    for (let k = 0; k < NZ; k++) {
      F.pressure[idx(0, k)] = 0;
      F.pressure[idx(NX - 1, k)] = 0;
    }
  }

  // Correct velocity using the pressure gradient.
  for (let k = 1; k < NZ - 1; k++) {
    for (let i = 1; i < NX - 1; i++) {
      const n = idx(i, k);

      const dpdx =
        (F.pressure[idx(i + 1, k)] -
         F.pressure[idx(i - 1, k)]) / (2 * DX);

      const dpdz =
        (F.pressure[idx(i, k + 1)] -
         F.pressure[idx(i, k - 1)]) / (2 * DZ);

      F.u[n] -= dt * dpdx;
      F.w[n] -= dt * dpdz;
    }
  }

  F.w.fill(0, 0, NX);
  F.w.fill(0, (NZ - 1) * NX, NZ * NX);
}

// ============================================================
// THERMODYNAMICS
// ============================================================

function updateThermodynamics(dt) {
  const latentFactor = LV / (CP * THETA0);
  const stability = environmentalThetaGradient();

  for (let k = 1; k < NZ - 1; k++) {
    const z = k * DZ;

    for (let i = 1; i < NX - 1; i++) {
      const n = idx(i, k);

      const w = F.w[n];

      // Adiabatic cooling/heating relative to the environment.
      F.th[n] -= w * stability * dt;

      // Condensation when vapor exceeds saturation.
      const qsat = saturationMixingRatio(z, F.th[n]);

      if (F.qv[n] > qsat) {
        const condensate = Math.min(
          F.qv[n] - qsat,
          0.003 * dt
        );

        F.qv[n] -= condensate;
        F.qc[n] += condensate;

        // Latent heat released by condensation.
        F.th[n] += latentFactor * condensate;
      }

      // Cloud water converts gradually to precipitation.
      if (F.qc[n] > 0.0015) {
        const converted = Math.min(
          F.qc[n] - 0.0015,
          F.qc[n] * 0.035 * dt
        );

        F.qc[n] -= converted;
        F.qr[n] += converted;
      }

      // Rain evaporates in unsaturated air, cooling the parcel.
      if (F.qr[n] > 0) {
        const deficit = Math.max(0, qsat - F.qv[n]);
        const evaporation = Math.min(
          F.qr[n],
          deficit,
          F.qr[n] * 0.06 * dt
        );

        F.qr[n] -= evaporation;
        F.qv[n] += evaporation;
        F.th[n] -= latentFactor * evaporation;
      }

      // Small background mixing prevents unlimited accumulation.
      F.th[n] *= 1 - 0.00008 * dt;
    }
  }
}

// ============================================================
// SURFACE HEATING
// Creates new thermals instead of assigning fixed cell lifetimes.
// ============================================================

function applySurfaceForcing(dt) {
  const capeFactor = clamp(capeJkg / 3000, 0.1, 1.5);
  const pulsePeriod = 95;

  for (let i = 1; i < NX - 1; i++) {
    const x = i / NX;

    // Several moving heating patches.
    const p1 = 0.27 + 0.10 * Math.sin(simTime / pulsePeriod);
    const p2 = 0.65 + 0.08 * Math.sin(simTime / 73 + 1.6);
    const p3 = 0.48 + 0.06 * Math.sin(simTime / 121 + 2.1);

    const heat =
      0.014 * capeFactor * (
        gaussian(x, p1, 0.055) +
        0.8 * gaussian(x, p2, 0.045) +
        0.55 * gaussian(x, p3, 0.035)
      );

    const n1 = idx(i, 1);
    const n2 = idx(i, 2);

    F.th[n1] += heat * dt;
    F.th[n2] += heat * dt * 0.3;

    // A weak moisture source near the surface.
    F.qv[n1] += 0.0000007 * relativeHumidity * dt;
  }
}

// ============================================================
// MOMENTUM
// ============================================================

function updateMomentum(dt) {
  // Advect velocity using the current velocity field.
  advectField(F.u, F.u0, dt);
  advectField(F.w, F.w0, dt);

  F.u.set(F.u0);
  F.w.set(F.w0);

  diffuseField(F.u, F.u0, dt, DIFFUSIVITY);
  diffuseField(F.w, F.w0, dt, DIFFUSIVITY);

  F.u.set(F.u0);
  F.w.set(F.w0);

  for (let k = 1; k < NZ - 1; k++) {
    const z = k * DZ;

    for (let i = 1; i < NX - 1; i++) {
      const n = idx(i, k);

      const th = F.th[n];
      const qc = F.qc[n];
      const qr = F.qr[n];

      // Thermal buoyancy, with approximate condensate loading.
      const buoyancy =
        GRAVITY * th / THETA0 -
        GRAVITY * (qc + qr) * 0.8;

      F.buoyancy[n] = buoyancy;

      F.w[n] += buoyancy * dt;

      // Relax toward the prescribed environmental shear profile.
      const targetWind = baseWind(z);
      F.u[n] += (targetWind - F.u[n]) *
        clamp(0.012 * dt, 0, 0.04);

      F.u[n] *= 1 - VELOCITY_DAMPING * dt;
      F.w[n] *= 1 - VELOCITY_DAMPING * dt;

      // Numerical safety limits.
      F.u[n] = clamp(F.u[n], -35, 45);
      F.w[n] = clamp(F.w[n], -30, 35);
    }
  }

  // No penetration through the ground.
  for (let i = 0; i < NX; i++) {
    F.w[idx(i, 0)] = 0;
  }
}

// ============================================================
// WATER TRANSPORT AND RAIN FALLOUT
// ============================================================

function updateWater(dt) {
  advectField(F.qv, F.qv0, dt);
  advectField(F.qc, F.qc0, dt);
  advectField(F.qr, F.qr0, dt);

  F.qv.set(F.qv0);
  F.qc.set(F.qc0);
  F.qr.set(F.qr0);

  diffuseField(F.qv, F.qv0, dt, 2);
  diffuseField(F.qc, F.qc0, dt, 1.5);
  diffuseField(F.qr, F.qr0, dt, 1);

  F.qv.set(F.qv0);
  F.qc.set(F.qc0);
  F.qr.set(F.qr0);

  for (let k = 1; k < NZ; k++) {
    for (let i = 1; i < NX - 1; i++) {
      const n = idx(i, k);

      F.qv[n] = clamp(F.qv[n], 0, 0.04);
      F.qc[n] = clamp(F.qc[n], 0, 0.02);
      F.qr[n] = clamp(F.qr[n], 0, 0.025);

      // Approximate gravitational settling of rainwater.
      const fallFraction = clamp(
        (5.0 * dt) / DZ,
        0,
        0.12
      );

      const fall = F.qr[n] * fallFraction;
      F.qr[n] -= fall;

      if (k > 1) {
        F.qr[idx(i, k - 1)] += fall;
      } else {
        accumulatedRain += fall;
      }
    }
  }

  // Simple cold-pool spreading along the surface.
  for (let i = 1; i < NX - 1; i++) {
    const n = idx(i, 1);
    const rain = F.qr[n];

    if (rain > 0.00005) {
      F.th[n] -= 0.0004 * rain * dt;
      F.u[n] += Math.sign(i - NX / 2) * rain * 0.3 * dt;
    }
  }
}

// ============================================================
// NUMERICAL MODEL STEP
// ============================================================

function modelStep(dt) {
  readParameters();

  // Keep thermodynamic scalars and velocities synchronized.
  advectField(F.th, F.th0, dt);
  F.th.set(F.th0);

  applySurfaceForcing(dt);
  updateWater(dt);
  updateThermodynamics(dt);
  updateMomentum(dt);
  projectVelocity(dt);

  // Remove small negative numerical artifacts.
  for (let n = 0; n < N; n++) {
    if (!Number.isFinite(F.u[n])) F.u[n] = 0;
    if (!Number.isFinite(F.w[n])) F.w[n] = 0;
    if (!Number.isFinite(F.th[n])) F.th[n] = 0;

    F.qv[n] = Math.max(0, F.qv[n]);
    F.qc[n] = Math.max(0, F.qc[n]);
    F.qr[n] = Math.max(0, F.qr[n]);
  }

  simTime += dt;
  stormAge += dt;
}

// ============================================================
// THREE.JS SCENE
// ============================================================

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  alpha: false,
  powerPreference: "high-performance"
});

renderer.setPixelRatio(
  Math.min(window.devicePixelRatio || 1, 1.35)
);
renderer.setSize(canvas.clientWidth || window.innerWidth,
                 canvas.clientHeight || window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x111923, 1);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111923);
scene.fog = new THREE.Fog(0x111923, 18000, 46000);

const camera = new THREE.PerspectiveCamera(
  43,
  (canvas.clientWidth || window.innerWidth) /
    (canvas.clientHeight || window.innerHeight),
  10,
  70000
);

camera.position.set(12000, 9500, 14500);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.target.set(DOMAIN_X * 0.5, DOMAIN_Z * 0.35, 0);
controls.minDistance = 4500;
controls.maxDistance = 32000;
controls.maxPolarAngle = Math.PI * 0.49;

// Lighting.
scene.add(new THREE.HemisphereLight(0xc6dcff, 0x29303b, 1.6));

const sun = new THREE.DirectionalLight(0xffffff, 2.1);
sun.position.set(-9000, 15000, 8000);
scene.add(sun);

// Ground plane.
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(DOMAIN_X + 5000, 14000),
  new THREE.MeshStandardMaterial({
    color: 0x202c36,
    roughness: 1,
    metalness: 0
  })
);

ground.rotation.x = -Math.PI / 2;
ground.position.set(DOMAIN_X / 2, -120, 0);
scene.add(ground);

// Domain frame.
const frameGeometry = new THREE.BufferGeometry();
const framePoints = [
  new THREE.Vector3(0, 0, -2500),
  new THREE.Vector3(DOMAIN_X, 0, -2500),
  new THREE.Vector3(DOMAIN_X, DOMAIN_Z, -2500),
  new THREE.Vector3(0, DOMAIN_Z, -2500),
  new THREE.Vector3(0, 0, -2500)
];

frameGeometry.setFromPoints(framePoints);

const frame = new THREE.Line(
  frameGeometry,
  new THREE.LineBasicMaterial({
    color: 0x425465,
    transparent: true,
    opacity: 0.65
  })
);
scene.add(frame);

// ============================================================
// CLOUD RENDERING
//
// The cloud geometry is rebuilt from the simulated qc field.
// No cloud shape is generated by a fragment shader.
// ============================================================

const CLOUD_DEPTH_LAYERS = 5;
const CLOUD_DEPTH = 2600;
const MAX_CLOUD_INSTANCES = NX * NZ * CLOUD_DEPTH_LAYERS;

const cloudGeometry = new THREE.SphereGeometry(1, 5, 4);

const cloudMaterial = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0.94,
  metalness: 0,
  transparent: true,
  opacity: 0.72,
  depthWrite: false,
  vertexColors: true
});

const clouds = new THREE.InstancedMesh(
  cloudGeometry,
  cloudMaterial,
  MAX_CLOUD_INSTANCES
);

clouds.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
clouds.frustumCulled = false;
clouds.count = 0;
scene.add(clouds);

const dummy = new THREE.Object3D();
const cloudColor = new THREE.Color();

const cloudColorLow = new THREE.Color(0x8d9eae);
const cloudColorMid = new THREE.Color(0xd7e1e9);
const cloudColorHigh = new THREE.Color(0xffffff);
const cloudColorDark = new THREE.Color(0x687787);

function cloudDensity(qc, qr) {
  return qc + qr * 0.25;
}

function rebuildCloudGeometry() {
  let count = 0;
  let top = 0;
  let cellColumns = 0;

  const threshold = 0.000055;

  for (let i = 0; i < NX; i++) {
    let columnActive = false;

    for (let k = 1; k < NZ; k++) {
      const n = idx(i, k);
      const qc = F.qc[n];
      const qr = F.qr[n];
      const density = cloudDensity(qc, qr);

      if (density < threshold) continue;

      columnActive = true;
      top = Math.max(top, k * DZ);

      const intensity = clamp(
        Math.log1p(density * 12000) / 3.6,
        0.12,
        1
      );

      const x = i * DX;
      const z = k * DZ;

      // Each simulated grid cell is extruded through depth.
      // This is a display extrusion, not a 3D atmospheric solve.
      for (let layer = 0; layer < CLOUD_DEPTH_LAYERS; layer++) {
        if (count >= MAX_CLOUD_INSTANCES) break;

        const depthT =
          layer / (CLOUD_DEPTH_LAYERS - 1) - 0.5;

        const y = depthT * CLOUD_DEPTH;

        // Small deterministic offset prevents a rigid slab look.
        const offset =
          Math.sin(i * 0.41 + k * 0.27 + layer * 1.7) * 28;

        const scaleX = DX * (0.60 + 0.20 * intensity);
        const scaleY = CLOUD_DEPTH /
          (CLOUD_DEPTH_LAYERS + 0.5);
        const scaleZ = DZ * (0.62 + 0.25 * intensity);

        dummy.position.set(x, z, y + offset);
        dummy.scale.set(scaleX, scaleZ, scaleY);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();

        clouds.setMatrixAt(count, dummy.matrix);

        const shade = clamp(intensity, 0, 1);

        if (qr > 0.001) {
          cloudColor.copy(cloudColorDark);
        } else if (k * DZ > 7500) {
          cloudColor.copy(cloudColorHigh);
        } else if (shade > 0.65) {
          cloudColor.copy(cloudColorMid);
        } else {
          cloudColor.copy(cloudColorLow);
        }

        cloudColor.multiplyScalar(0.72 + shade * 0.45);
        clouds.setColorAt(count, cloudColor);
        count++;
      }
    }

    if (columnActive) cellColumns++;
  }

  clouds.count = count;
  clouds.instanceMatrix.needsUpdate = true;

  if (clouds.instanceColor) {
    clouds.instanceColor.needsUpdate = true;
  }

  activeCells = cellColumns;
  maxCloudHeight = top;
}

// ============================================================
// PRECIPITATION VISUALIZATION
// ============================================================

const MAX_RAIN_POINTS = 1400;

const rainPositions = new Float32Array(MAX_RAIN_POINTS * 3);
const rainColors = new Float32Array(MAX_RAIN_POINTS * 3);

const rainGeometry = new THREE.BufferGeometry();

rainGeometry.setAttribute(
  "position",
  new THREE.BufferAttribute(rainPositions, 3)
);

rainGeometry.setAttribute(
  "color",
  new THREE.BufferAttribute(rainColors, 3)
);

const rainMaterial = new THREE.PointsMaterial({
  size: 75,
  vertexColors: true,
  transparent: true,
  opacity: 0.65,
  depthWrite: false,
  sizeAttenuation: true
});

const rainPoints = new THREE.Points(rainGeometry, rainMaterial);
rainPoints.frustumCulled = false;
scene.add(rainPoints);

function rebuildRain() {
  let count = 0;
  const stride = 3;

  for (let k = 2; k < NZ - 1; k += stride) {
    for (let i = 1; i < NX - 1; i += stride) {
      const n = idx(i, k);
      const rain = F.qr[n];

      if (rain < 0.00025 || count >= MAX_RAIN_POINTS) continue;

      const p = count * 3;

      rainPositions[p] = i * DX;
      rainPositions[p + 1] = k * DZ;
      rainPositions[p + 2] =
        (Math.sin(i * 2.7 + k * 1.4) * 0.5) * CLOUD_DEPTH;

      const intensity = clamp(rain * 500, 0.15, 1);

      rainColors[p] = 0.35 * intensity;
      rainColors[p + 1] = 0.63 * intensity;
      rainColors[p + 2] = 1.0 * intensity;

      count++;
    }
  }

  rainGeometry.setDrawRange(0, count);
  rainGeometry.attributes.position.needsUpdate = true;
  rainGeometry.attributes.color.needsUpdate = true;
}

// ============================================================
// LIGHTNING
// Triggered by strong simulated updrafts and condensate.
// ============================================================

const lightningGroup = new THREE.Group();
scene.add(lightningGroup);

const lightningMaterial = new THREE.LineBasicMaterial({
  color: 0xe4f2ff,
  transparent: true,
  opacity: 0.95
});

let lightningTimer = 0;

function clearLightning() {
  while (lightningGroup.children.length) {
    const child = lightningGroup.children.pop();
    if (child.geometry) child.geometry.dispose();
  }
}

function createLightning() {
  if (!lightningEnabled || maxCloudHeight < 3500) return;

  let best = -1;
  let bestScore = 0;

  for (let k = 10; k < NZ - 2; k++) {
    for (let i = 2; i < NX - 2; i++) {
      const n = idx(i, k);
      const score = F.w[n] * F.qc[n];

      if (F.w[n] > 5 && score > bestScore) {
        bestScore = score;
        best = n;
      }
    }
  }

  if (best < 0) return;

  const bi = best % NX;
  const bk = Math.floor(best / NX);

  const points = [];
  let x = bi * DX;
  let z = bk * DZ;
  const y = 0;

  points.push(new THREE.Vector3(x, z, y));

  for (let s = 0; s < 9; s++) {
    x += (random01() - 0.5) * 380;
    z -= 130 + random01() * 240;
    points.push(new THREE.Vector3(x, Math.max(z, 0), y));
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const line = new THREE.Line(geometry, lightningMaterial);

  lightningGroup.add(line);

  // Brief flash, removed by the render loop.
  line.userData.createdAt = performance.now();
  line.userData.duration = 180 + random01() * 180;
}

// ============================================================
// METRICS
// ============================================================

function updateMetrics() {
  if (ui.cloudHeight) {
    ui.cloudHeight.textContent =
      `${(maxCloudHeight / 1000).toFixed(1)} km`;
  }

  if (ui.cellCount) {
    ui.cellCount.textContent = String(activeCells);
  }

  if (ui.status) {
    if (paused) {
      ui.status.textContent = "Пауза";
    } else if (maxCloudHeight > 7000) {
      ui.status.textContent = "Глубокая конвекция";
    } else if (maxCloudHeight > 2500) {
      ui.status.textContent = "Развитие облаков";
    } else {
      ui.status.textContent = "Инициация конвекции";
    }
  }
}

// ============================================================
// UI ACTIONS
// ============================================================

function resetModel() {
  stormSeed = (stormSeed + 7919) >>> 0;
  initializeAtmosphere(true);
  clearLightning();
  rebuildCloudGeometry();
  rebuildRain();
  updateMetrics();
}

function createNewStorm() {
  stormSeed = (stormSeed + 104729) >>> 0;
  initializeAtmosphere(false);

  const type = ui.stormType?.value || "supercell";
  const center = type === "squall" ? NX * 0.5 : NX * 0.36;
  const width = type === "squall" ? NX * 0.22 : NX * 0.075;

  for (let k = 1; k < 13; k++) {
    for (let i = 0; i < NX; i++) {
      const n = idx(i, k);
      const thermal = gaussian(i, center, width) *
        gaussian(k, 4.5, 3.5);

      F.th[n] += 1.6 * thermal;
      F.qv[n] += 0.001 * thermal;
      F.w[n] += 0.4 * thermal;
    }
  }

  if (type === "multicell" || type === "squall") {
    const count = type === "squall" ? 5 : 3;

    for (let c = 0; c < count; c++) {
      const cx = NX * (0.15 + c * 0.16);

      for (let k = 1; k < 11; k++) {
        for (let i = 0; i < NX; i++) {
          const n = idx(i, k);
          const thermal = gaussian(i, cx, 3.4) *
            gaussian(k, 4.2, 3.0);

          F.th[n] += 1.0 * thermal;
          F.qv[n] += 0.0007 * thermal;
        }
      }
    }
  }

  simTime = 0;
  stormAge = 0;
  accumulatedRain = 0;
  clearLightning();
  rebuildCloudGeometry();
  rebuildRain();
  updateMetrics();
}

ui.newStorm?.addEventListener("click", createNewStorm);

ui.pause?.addEventListener("click", () => {
  paused = !paused;

  if (ui.pause) {
    ui.pause.textContent = paused ? "Продолжить" : "Пауза";
  }

  updateMetrics();
});

ui.lightning?.addEventListener("click", () => {
  lightningEnabled = !lightningEnabled;

  if (!lightningEnabled) clearLightning();

  if (ui.lightning) {
    ui.lightning.textContent =
      lightningEnabled ? "Молнии: вкл." : "Молнии: выкл.";
  }
});

ui.reset?.addEventListener("click", resetModel);

for (const element of [ui.cape, ui.shear, ui.humidity]) {
  element?.addEventListener("input", readParameters);
}

ui.stormType?.addEventListener("change", () => {
  // Changing the selected type affects the next generated storm.
  if (ui.status) {
    ui.status.textContent = "Тип изменён — создай новую грозу";
  }
});

// ============================================================
// RESIZE
// ============================================================

function resize() {
  const width = Math.max(
    1,
    canvas.clientWidth || window.innerWidth
  );

  const height = Math.max(
    1,
    canvas.clientHeight || window.innerHeight
  );

  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

window.addEventListener("resize", resize);

// ============================================================
// MAIN LOOP
// ============================================================

function animate(now) {
  requestAnimationFrame(animate);

  const elapsed = clamp((now - lastFrame) / 1000, 0, 0.08);
  lastFrame = now;
  frameNumber++;

  if (!paused) {
    // Adjustable simulation speed.
    const speed = ui.growthSpeed
      ? clamp(Number(ui.growthSpeed.value) || 1, 0.25, 4)
      : 1;

    // Fixed numerical steps avoid using arbitrary frame time
    // directly in the atmospheric solver.
    const steps = Math.max(1, Math.round(SUBSTEPS * speed));

    for (let s = 0; s < steps; s++) {
      modelStep(MODEL_DT);
    }
  }

  // Geometry updates are throttled for mobile GPUs.
  if (now - lastRenderUpdate > 140) {
    rebuildCloudGeometry();
    rebuildRain();
    lastRenderUpdate = now;
  }

  if (!paused && lightningEnabled) {
    lightningTimer += elapsed;

    if (lightningTimer > 1.8 + random01() * 2.2) {
      createLightning();
      lightningTimer = 0;
    }
  }

  // Remove expired lightning flashes.
  for (let i = lightningGroup.children.length - 1; i >= 0; i--) {
    const line = lightningGroup.children[i];

    if (now - line.userData.createdAt > line.userData.duration) {
      lightningGroup.remove(line);
      line.geometry.dispose();
    }
  }

  if (now - lastMetrics > 500) {
    updateMetrics();
    lastMetrics = now;
  }

  controls.update();
  renderer.render(scene, camera);
}

// ============================================================
// START
// ============================================================

readParameters();
initializeAtmosphere(true);
resize();
rebuildCloudGeometry();
rebuildRain();
updateMetrics();

if (ui.loading) {
  ui.loading.style.display = "none";
}

requestAnimationFrame(animate);
