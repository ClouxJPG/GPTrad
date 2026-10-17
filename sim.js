// ============================================================
// QUANTUM METEO — ATMOSPHERIC LAB
// 3D cloud microphysics + advection + buoyancy + pressure
// Volume rendering | Large geographic domain | Mobile-conscious
//
// Simplified research/educational model.
// Not a validated operational weather-prediction model.
// ============================================================

import * as THREE from "https://esm.sh/three@0.180.0";
import { OrbitControls } from "https://esm.sh/three@0.180.0/examples/jsm/controls/OrbitControls.js";

// ============================================================
// DOM
// ============================================================

const $ = id => document.getElementById(id);
const canvas = $("scene");

if (!canvas) throw new Error("Не найден canvas #scene");

const loading = $("loading");
const loadingTitle = $("loadingTitle");
const loadingText = $("loadingText");
const errorDetails = $("errorDetails");

// ============================================================
// CONFIGURATION — DISTANCES ARE IN KILOMETRES
// ============================================================

const DOMAIN_X = 180;
const DOMAIN_Y = 20;
const DOMAIN_Z = 180;

const NX = 32;
const NY = 26;
const NZ = 32;

const DX = DOMAIN_X / (NX - 1);
const DY = DOMAIN_Y / (NY - 1);
const DZ = DOMAIN_Z / (NZ - 1);

const COUNT = NX * NY * NZ;
const index = (x, y, z) => (y * NZ + z) * NX + x;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

// ============================================================
// THREE.JS
// ============================================================

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9bb8cd);
scene.fog = new THREE.FogExp2(0xa8bdca, 0.00028);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
camera.position.set(245, 155, 290);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  alpha: false,
  powerPreference: "high-performance"
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = false;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.minDistance = 12;
controls.maxDistance = 3000;
controls.maxPolarAngle = Math.PI * 0.49;
controls.target.set(0, 8, 0);

scene.add(new THREE.HemisphereLight(0xddeeff, 0x575345, 1.65));

const sun = new THREE.DirectionalLight(0xfff1d9, 2.1);
sun.position.set(-150, 250, 100);
scene.add(sun);

const skyFill = new THREE.DirectionalLight(0x8ebce5, 0.7);
skyFill.position.set(120, 90, -180);
scene.add(skyFill);

// ============================================================
// LARGE WORLD
// Terrain is static and cheap to render.
// Approximate geographic terrain, not real elevation data.
// ============================================================

function hash(x, z) {
  let n = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function noise2(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;

  const a = hash(ix, iz);
  const b = hash(ix + 1, iz);
  const c = hash(ix, iz + 1);
  const d = hash(ix + 1, iz + 1);

  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);

  return lerp(lerp(a, b, sx), lerp(c, d, sx), sz);
}

function fbm(x, z) {
  let value = 0;
  let amp = 0.55;
  let freq = 1;

  for (let i = 0; i < 5; i++) {
    value += (noise2(x * freq, z * freq) * 2 - 1) * amp;
    freq *= 2.03;
    amp *= 0.48;
  }

  return value;
}

const WORLD_SIZE = 1000;
const TERRAIN_SEGMENTS = 180;

const terrainGeo = new THREE.PlaneGeometry(
  WORLD_SIZE,
  WORLD_SIZE,
  TERRAIN_SEGMENTS,
  TERRAIN_SEGMENTS
);

terrainGeo.rotateX(-Math.PI / 2);

const terrainPos = terrainGeo.attributes.position;
const terrainColors = new Float32Array(terrainPos.count * 3);

const lowland = new THREE.Color(0x8f9561);
const grass = new THREE.Color(0x527447);
const forest = new THREE.Color(0x354f36);
const rock = new THREE.Color(0x77766b);
const snow = new THREE.Color(0xd0d1cb);

for (let i = 0; i < terrainPos.count; i++) {
  const x = terrainPos.getX(i);
  const z = terrainPos.getZ(i);

  const continental = fbm(x * 0.004 + 12, z * 0.004 - 8);
  const hills = fbm(x * 0.014 - 17, z * 0.014 + 21);
  const detail = fbm(x * 0.04, z * 0.04);

  const mountainRegion = clamp(
    (fbm(x * 0.006 + 60, z * 0.006 - 45) + 0.12) * 2.1,
    0,
    1
  );

  const height =
    Math.max(0, continental + 0.1) * 1.8 +
    Math.max(0, hills + 0.1) * 2.6 +
    Math.pow(Math.max(0, hills * 0.75 + 0.2), 1.8) *
      mountainRegion * 4.5 +
    detail * 0.15;

  terrainPos.setY(i, height);

  let c;

  if (height < 0.7) {
    c = lowland.clone().lerp(grass, clamp(height, 0, 1));
  } else if (height < 2.0) {
    c = grass.clone().lerp(forest, 0.25);
  } else if (height < 4.0) {
    c = forest.clone().lerp(rock, (height - 2) / 4);
  } else {
    c = rock.clone().lerp(snow, clamp((height - 4) / 4, 0, 1));
  }

  const shade = 0.94 + detail * 0.12;

  terrainColors[i * 3] = clamp(c.r * shade, 0, 1);
  terrainColors[i * 3 + 1] = clamp(c.g * shade, 0, 1);
  terrainColors[i * 3 + 2] = clamp(c.b * shade, 0, 1);
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

terrain.position.y = -0.2;
scene.add(terrain);

const ocean = new THREE.Mesh(
  new THREE.PlaneGeometry(2400, 2400),
  new THREE.MeshStandardMaterial({
    color: 0x426d87,
    roughness: 0.92,
    metalness: 0
  })
);

ocean.rotation.x = -Math.PI / 2;
ocean.position.y = -0.28;
scene.add(ocean);

// ============================================================
// CONTROLS — GROWTH SPEED BUTTON IS INJECTED INTO THE PAGE
// ============================================================

let growthLevels = [1, 2, 4, 8];
let growthIndex = 1;

const speedButton = document.createElement("button");
speedButton.id = "growthSpeed";
speedButton.type = "button";
speedButton.textContent = "Скорость развития: 2×";

Object.assign(speedButton.style, {
  position: "absolute",
  right: "14px",
  top: "14px",
  zIndex: "30",
  padding: "11px 14px",
  border: "1px solid rgba(255,255,255,.3)",
  borderRadius: "12px",
  background: "rgba(16,28,40,.86)",
  color: "#fff",
  font: "600 13px system-ui,sans-serif",
  cursor: "pointer",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)"
});

const host = canvas.parentElement;
if (host) {
  if (getComputedStyle(host).position === "static") {
    host.style.position = "relative";
  }
  host.appendChild(speedButton);
}

speedButton.addEventListener("click", () => {
  growthIndex = (growthIndex + 1) % growthLevels.length;
  speedButton.textContent =
    `Скорость развития: ${growthLevels[growthIndex]}×`;
});

// ============================================================
// ATMOSPHERIC STATE
//
// Temperature anomaly: K
// Water vapour / cloud water / rain: kg/kg
// Velocity components: km/s
// Pressure: arbitrary perturbation field for projection
// ============================================================

const T = new Float32Array(COUNT);
const QV = new Float32Array(COUNT);
const QC = new Float32Array(COUNT);
const QR = new Float32Array(COUNT);

const U = new Float32Array(COUNT);
const V = new Float32Array(COUNT);
const W = new Float32Array(COUNT);
const P = new Float32Array(COUNT);

const t2 = new Float32Array(COUNT);
const qv2 = new Float32Array(COUNT);
const qc2 = new Float32Array(COUNT);
const qr2 = new Float32Array(COUNT);

const u2 = new Float32Array(COUNT);
const v2 = new Float32Array(COUNT);
const w2 = new Float32Array(COUNT);
const p2 = new Float32Array(COUNT);

let simTime = 0;
let paused = false;
let lightningEnabled = true;
let frameNumber = 0;
let stormMode = "supercell";

const coreX = 0;
const coreZ = 0;

function satMixingRatio(tempK) {
  const tc = tempK - 273.15;
  const es = 6.112 * Math.exp(17.67 * tc / (tc + 243.5));
  return 0.622 * es / Math.max(1, 1000 - es);
}

function environmentalTemperature(heightKm) {
  return 299.5 - 6.1 * heightKm;
}

function clearFields() {
  for (let y = 0; y < NY; y++) {
    const height = y * DY;
    const tempK = environmentalTemperature(height);
    const qs = satMixingRatio(tempK);

    for (let z = 0; z < NZ; z++) {
      for (let x = 0; x < NX; x++) {
        const i = index(x, y, z);

        T[i] = 0;

        // Moist lower troposphere, drier air aloft.
        QV[i] =
          qs *
          clamp(Number($("humidity")?.value ?? 82) / 100, 0.5, 1) *
          Math.exp(-height / 45);

        QC[i] = 0;
        QR[i] = 0;

        U[i] = 0;
        V[i] = 0;
        W[i] = 0;
        P[i] = 0;
      }
    }
  }

  // Initial thermal bubble: a perturbation, not a prebuilt cloud.
  for (let y = 0; y < NY; y++) {
    for (let z = 0; z < NZ; z++) {
      for (let x = 0; x < NX; x++) {
        const i = index(x, y, z);

        const xx = (x * DX - coreX) / 14;
        const zz = (z * DZ - coreZ) / 14;
        const yy = (y * DY - 1.5) / 2.3;

        const r = xx * xx + zz * zz + yy * yy;

        if (r < 1) {
          const bubble = Math.pow(1 - r, 2);
          T[i] += 2.3 * bubble;
          QV[i] *= 1.015;
        }
      }
    }
  }

  simTime = 0;
}

// ============================================================
// SAMPLING AND ADVECTION
// Semi-Lagrangian back-tracing is stable for relatively large steps.
// ============================================================

function sampleField(field, x, y, z) {
  x = clamp(x, 0, NX - 1.001);
  y = clamp(y, 0, NY - 1.001);
  z = clamp(z, 0, NZ - 1.001);

  const x0 = x | 0;
  const y0 = y | 0;
  const z0 = z | 0;

  const fx = x - x0;
  const fy = y - y0;
  const fz = z - z0;

  const c000 = field[index(x0, y0, z0)];
  const c100 = field[index(x0 + 1, y0, z0)];
  const c010 = field[index(x0, y0 + 1, z0)];
  const c110 = field[index(x0 + 1, y0 + 1, z0)];

  const c001 = field[index(x0, y0, z0 + 1)];
  const c101 = field[index(x0 + 1, y0, z0 + 1)];
  const c011 = field[index(x0, y0 + 1, z0 + 1)];
  const c111 = field[index(x0 + 1, y0 + 1, z0 + 1)];

  const a = lerp(
    lerp(c000, c100, fx),
    lerp(c010, c110, fx),
    fy
  );

  const b = lerp(
    lerp(c001, c101, fx),
    lerp(c011, c111, fx),
    fy
  );

  return lerp(a, b, fz);
}

function advectField(src, dst, dt) {
  for (let y = 1; y < NY - 1; y++) {
    for (let z = 1; z < NZ - 1; z++) {
      for (let x = 1; x < NX - 1; x++) {
        const i = index(x, y, z);

        const bx = x - U[i] * dt / DX;
        const by = y - W[i] * dt / DY;
        const bz = z - V[i] * dt / DZ;

        dst[i] = sampleField(src, bx, by, bz);
      }
    }
  }

  // Boundary conditions.
  for (let y = 0; y < NY; y++) {
    for (let z = 0; z < NZ; z++) {
      dst[index(0, y, z)] = dst[index(1, y, z)];
      dst[index(NX - 1, y, z)] = dst[index(NX - 2, y, z)];
    }
  }

  for (let y = 0; y < NY; y++) {
    for (let x = 0; x < NX; x++) {
      dst[index(x, y, 0)] = dst[index(x, y, 1)];
      dst[index(x, y, NZ - 1)] = dst[index(x, y, NZ - 2)];
    }
  }

  for (let z = 0; z < NZ; z++) {
    for (let x = 0; x < NX; x++) {
      dst[index(x, 0, z)] = dst[index(x, 1, z)];
      dst[index(x, NY - 1, z)] = dst[index(x, NY - 2, z)];
    }
  }
}

// ============================================================
// PRESSURE PROJECTION
// Approximate incompressibility constraint.
// This is a lightweight projection, not a full compressible solver.
// ============================================================

function pressureProjection(dt) {
  const divergence = new Float32Array(COUNT);

  for (let y = 1; y < NY - 1; y++) {
    for (let z = 1; z < NZ - 1; z++) {
      for (let x = 1; x < NX - 1; x++) {
        const i = index(x, y, z);

        const du =
          (U[index(x + 1, y, z)] - U[index(x - 1, y, z)]) /
          (2 * DX);

        const dv =
          (V[index(x, y, z + 1)] - V[index(x, y, z - 1)]) /
          (2 * DZ);

        const dw =
          (W[index(x, y + 1, z)] - W[index(x, y - 1, z)]) /
          (2 * DY);

        divergence[i] = (du + dv + dw) / Math.max(dt, 0.001);
      }
    }
  }

  const ax = 1 / (DX * DX);
  const ay = 1 / (DY * DY);
  const az = 1 / (DZ * DZ);
  const denom = 2 * (ax + ay + az);

  // A few Jacobi iterations per model step keep the mobile workload low.
  for (let it = 0; it < 4; it++) {
    for (let y = 1; y < NY - 1; y++) {
      for (let z = 1; z < NZ - 1; z++) {
        for (let x = 1; x < NX - 1; x++) {
          const i = index(x, y, z);

          p2[i] = (
            (P[index(x - 1, y, z)] + P[index(x + 1, y, z)]) * ax +
            (P[index(x, y - 1, z)] + P[index(x, y + 1, z)]) * ay +
            (P[index(x, y, z - 1)] + P[index(x, y, z + 1)]) * az -
            divergence[i]
          ) / denom;
        }
      }
    }

    P.set(p2);
  }

  for (let y = 1; y < NY - 1; y++) {
    for (let z = 1; z < NZ - 1; z++) {
      for (let x = 1; x < NX - 1; x++) {
        const i = index(x, y, z);

        U[i] -= dt * (
          P[index(x + 1, y, z)] - P[index(x - 1, y, z)]
        ) / (2 * DX);

        V[i] -= dt * (
          P[index(x, y, z + 1)] - P[index(x, y, z - 1)]
        ) / (2 * DZ);

        W[i] -= dt * (
          P[index(x, y + 1, z)] - P[index(x, y - 1, z)]
        ) / (2 * DY);
      }
    }
  }
}

// ============================================================
// PHYSICS STEP
// Transport, buoyancy, wind shear, condensation, latent heating,
// evaporation, rain conversion, sedimentation and drag.
// ============================================================

function physicsStep(dt) {
  const cape = Number($("cape")?.value ?? 1800);
  const shear = Number($("shear")?.value ?? 22);
  const rh = clamp(Number($("humidity")?.value ?? 82) / 100, 0.45, 1);

  const capeFactor = clamp(cape / 1800, 0.2, 2.2);

  // Environmental wind changes with height.
  // The domain uses km; velocity values are in km/s.
  for (let y = 0; y < NY; y++) {
    const height = y * DY;
    const environmentalU = (shear / 1000) * height * 0.006;

    for (let z = 0; z < NZ; z++) {
      for (let x = 0; x < NX; x++) {
        const i = index(x, y, z);

        U[i] += (environmentalU - U[i]) * clamp(dt * 0.012, 0, 0.08);
      }
    }
  }

  // Transport scalar fields by the velocity field.
  advectField(T, t2, dt);
  T.set(t2);

  advectField(QV, qv2, dt);
  QV.set(qv2);

  advectField(QC, qc2, dt);
  QC.set(qc2);

  advectField(QR, qr2, dt);
  QR.set(qr2);

  for (let y = 1; y < NY - 1; y++) {
    const height = y * DY;
    const envT = environmentalTemperature(height);

    for (let z = 1; z < NZ - 1; z++) {
      for (let x = 1; x < NX - 1; x++) {
        const i = index(x, y, z);

        const warm = T[i];
        const qv = QV[i];
        const qc = QC[i];
        const qr = QR[i];

        // Buoyancy from parcel temperature and condensate loading.
        // Virtual-temperature effects are approximated.
        const buoyancy =
          0.0000095 * warm -
          0.000003 * qc * 1000 -
          0.0000018 * qr * 1000;

        W[i] += buoyancy * dt;

        // Weak environmental entrainment reduces plume buoyancy
        // and mixes environmental moisture into the updraft.
        const mix = clamp(dt * 0.018, 0, 0.08);
        T[i] *= 1 - mix;
        QV[i] = lerp(QV[i], satMixingRatio(envT) * rh, mix * 0.3);

        // Moisture condensation at saturation.
        const parcelT = envT + T[i];
        const qs = satMixingRatio(parcelT);
        const supersaturation = QV[i] - qs;

        if (supersaturation > 0) {
          const cond = Math.min(
            supersaturation,
            supersaturation * clamp(dt * 0.7, 0, 0.25)
          );

          QV[i] -= cond;
          QC[i] += cond;

          // Latent heat of condensation: approximate K per mixing ratio.
          T[i] += cond * 2500;
        }

        // Cloud droplets grow into precipitation-sized particles.
        const rainConversion = Math.min(
          QC[i],
          Math.max(0, QC[i] - 0.00045) * dt * 0.12
        );

        QC[i] -= rainConversion;
        QR[i] += rainConversion;

        // Evaporation cools unsaturated air.
        if (QV[i] < qs * 0.94 && QC[i] > 0) {
          const evaporation = Math.min(
            QC[i],
            (qs - QV[i]) * clamp(dt * 0.12, 0, 0.1)
          );

          QC[i] -= evaporation;
          QV[i] += evaporation;
          T[i] -= evaporation * 2300;
        }

        // Precipitation sedimentation: rain falls relative to air.
        if (y > 0) {
          const fall = Math.min(
            QR[i],
            QR[i] * dt * 0.35
          );

          QR[i] -= fall;
          QR[index(x, y - 1, z)] += fall;
        }

        // Turbulent momentum damping.
        U[i] *= 1 - clamp(dt * 0.012, 0, 0.08);
        V[i] *= 1 - clamp(dt * 0.012, 0, 0.08);
        W[i] *= 1 - clamp(dt * 0.009, 0, 0.06);

        // CAPE increases the sensitivity of rising parcels.
        W[i] += Math.max(0, warm) * 0.0000009 * capeFactor * dt;

        // No penetration through the ground or top boundary.
        if (y === 1 && W[i] < 0) W[i] = 0;
        if (y === NY - 2 && W[i] > 0) W[i] = 0;

        // Keep the toy solver numerically bounded.
        U[i] = clamp(U[i], -0.08, 0.08);
        V[i] = clamp(V[i], -0.08, 0.08);
        W[i] = clamp(W[i], -0.04, 0.04);

        QV[i] = clamp(QV[i], 0, 0.04);
        QC[i] = clamp(QC[i], 0, 0.02);
        QR[i] = clamp(QR[i], 0, 0.02);
        T[i] = clamp(T[i], -15, 15);
      }
    }
  }

  pressureProjection(dt);

  simTime += dt;
}

// ============================================================
// GPU VOLUME RENDERING
//
// The cloud is a volume, not an isosurface mesh.
// The shader samples condensate density and integrates opacity
// through the 3D volume, avoiding the single "mountain" silhouette.
// ============================================================

const textureData = new Uint8Array(NX * NY * NZ);

const cloudTexture = new THREE.Data3DTexture(
  textureData,
  NX,
  NY,
  NZ
);

cloudTexture.format = THREE.RedFormat;
cloudTexture.type = THREE.UnsignedByteType;
cloudTexture.minFilter = THREE.LinearFilter;
cloudTexture.magFilter = THREE.LinearFilter;
cloudTexture.unpackAlignment = 1;
cloudTexture.needsUpdate = true;

const cloudMaterial = new THREE.ShaderMaterial({
  glslVersion: THREE.GLSL3,
  transparent: true,
  depthWrite: false,
  side: THREE.FrontSide,
  uniforms: {
    uCloud: { value: cloudTexture },
    uCameraLocal: { value: new THREE.Vector3() },
    uTime: { value: 0 },
    uDensity: { value: 1.35 },
    uLight: { value: new THREE.Vector3(-0.6, 0.8, 0.4) }
  },

  vertexShader: `
    in vec3 position;

    uniform mat4 modelViewMatrix;
    uniform mat4 projectionMatrix;

    out vec3 vLocalPos;

    void main() {
      vLocalPos = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: `
    precision highp float;
    precision highp sampler3D;

    uniform sampler3D uCloud;
    uniform vec3 uCameraLocal;
    uniform float uTime;
    uniform float uDensity;
    uniform vec3 uLight;

    in vec3 vLocalPos;
    out vec4 fragColor;

    float hash3(vec3 p) {
      p = fract(p * 0.1031);
      p += dot(p, p.yxz + 33.33);
      return fract((p.x + p.y) * p.z);
    }

    float noise3(vec3 p) {
      vec3 i = floor(p);
      vec3 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);

      float n000 = hash3(i + vec3(0,0,0));
      float n100 = hash3(i + vec3(1,0,0));
      float n010 = hash3(i + vec3(0,1,0));
      float n110 = hash3(i + vec3(1,1,0));
      float n001 = hash3(i + vec3(0,0,1));
      float n101 = hash3(i + vec3(1,0,1));
      float n011 = hash3(i + vec3(0,1,1));
      float n111 = hash3(i + vec3(1,1,1));

      float x00 = mix(n000, n100, f.x);
      float x10 = mix(n010, n110, f.x);
      float x01 = mix(n001, n101, f.x);
      float x11 = mix(n011, n111, f.x);

      return mix(mix(x00, x10, f.y), mix(x01, x11, f.y), f.z);
    }

    vec2 hitBox(vec3 ro, vec3 rd) {
      vec3 inv = 1.0 / rd;
      vec3 t0 = (-0.5 - ro) * inv;
      vec3 t1 = ( 0.5 - ro) * inv;

      vec3 lo = min(t0, t1);
      vec3 hi = max(t0, t1);

      float nearT = max(max(lo.x, lo.y), lo.z);
      float farT = min(min(hi.x, hi.y), hi.z);

      return vec2(nearT, farT);
    }

    void main() {
      vec3 rd = normalize(vLocalPos - uCameraLocal);
      vec2 bounds = hitBox(vLocalPos, rd);

      float endT = bounds.y;
      if (endT <= 0.0) discard;

      vec3 p = vLocalPos + rd * 0.001;
      float stepSize = max(0.0035, endT / 72.0);

      vec4 accum = vec4(0.0);

      for (int i = 0; i < 72; i++) {
        float t = float(i) * stepSize;
        if (t > endT) break;

        vec3 q = p + rd * t;
        vec3 uvw = q + 0.5;

        if (any(lessThan(uvw, vec3(0.0))) ||
            any(greaterThan(uvw, vec3(1.0)))) {
          continue;
        }

        float base = texture(uCloud, uvw).r;

        // Fine-scale structure is applied to the simulated field,
        // not used to create a ready-made cloud shape.
        float detail = noise3(uvw * vec3(46.0, 30.0, 46.0) + uTime * 0.015);
        float erosion = mix(0.73, 1.12, detail);

        float density = base * erosion * uDensity;
        density = smoothstep(0.025, 0.20, density);

        if (density < 0.005) continue;

        float heightShade = smoothstep(0.05, 0.9, uvw.y);
        vec3 shadowColor = vec3(0.25, 0.31, 0.38);
        vec3 sunColor = vec3(0.97, 0.98, 1.0);

        vec3 cloudColor = mix(shadowColor, sunColor, heightShade);

        float lighting = 0.68 + 0.32 * max(dot(normalize(uLight), vec3(0.0,1.0,0.0)), 0.0);
        cloudColor *= lighting;

        float alpha = 1.0 - exp(-density * 0.12);

        accum.rgb += (1.0 - accum.a) * cloudColor * alpha;
        accum.a += (1.0 - accum.a) * alpha;

        if (accum.a > 0.965) break;
      }

      if (accum.a < 0.012) discard;

      fragColor = vec4(accum.rgb, accum.a);
    }
  `
});

const cloudVolume = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  cloudMaterial
);

cloudVolume.scale.set(DOMAIN_X, DOMAIN_Y, DOMAIN_Z);
cloudVolume.position.set(0, DOMAIN_Y / 2 + 1, 0);
cloudVolume.frustumCulled = false;
scene.add(cloudVolume);

// ============================================================
// TEXTURE UPDATE
// ============================================================

function updateCloudTexture() {
  let maxQc = 0;

  for (let i = 0; i < COUNT; i++) {
    if (QC[i] > maxQc) maxQc = QC[i];
  }

  // Adaptive scale keeps weak early clouds visible without forcing
  // the entire domain to become opaque.
  const scale = maxQc > 0 ? 255 / Math.max(maxQc * 2.4, 0.00002) : 0;

  for (let i = 0; i < COUNT; i++) {
    const q = QC[i];

    // Tiny amounts of condensate remain transparent.
    const visible = Math.max(0, q - 0.000008);
    textureData[i] = clamp(visible * scale, 0, 255);
  }

  cloudTexture.needsUpdate = true;
}

// ============================================================
// LIGHTNING
// ============================================================

const flash = new THREE.PointLight(0xdcecff, 0, 100, 2);
flash.position.set(0, 12, 0);
scene.add(flash);

let flashTime = 0;
let nextFlash = 4;

function updateLightning(dt) {
  nextFlash -= dt;

  if (!lightningEnabled) {
    flash.intensity = 0;
    return;
  }

  if (nextFlash <= 0) {
    // Lightning is triggered more often when substantial condensate
    // and precipitation coexist in the simulated volume.
    let activity = 0;

    for (let i = 0; i < COUNT; i += 9) {
      if (QC[i] > 0.0002 && QR[i] > 0.00005) activity++;
    }

    if (activity > 10 && Math.random() < 0.65) {
      flash.intensity = 28 + Math.random() * 35;
      flashTime = 0.07 + Math.random() * 0.12;
      flash.position.set(
        (Math.random() - 0.5) * DOMAIN_X,
        6 + Math.random() * 12,
        (Math.random() - 0.5) * DOMAIN_Z
      );
    }

    nextFlash = 1.5 + Math.random() * 6;
  }

  if (flashTime > 0) {
    flashTime -= dt;
    if (flashTime <= 0) flash.intensity = 0;
  }
}

// ============================================================
// UI AND METRICS
// ============================================================

function updateMetrics() {
  let cloudTop = 0;
  let active = 0;

  for (let y = 0; y < NY; y++) {
    let found = false;

    for (let z = 0; z < NZ && !found; z++) {
      for (let x = 0; x < NX; x++) {
        const i = index(x, y, z);

        if (QC[i] > 0.000025) {
          found = true;
          break;
        }
      }
    }

    if (found) cloudTop = y * DY;
  }

  for (let i = 0; i < COUNT; i += 20) {
    if (QC[i] > 0.0001) active++;
  }

  if ($("cloudHeight")) {
    $("cloudHeight").textContent =
      cloudTop > 0 ? `${Math.round(cloudTop * 1000)} м` : "Формирование";
  }

  if ($("cellCount")) {
    $("cellCount").textContent = String(active);
  }

  if ($("status")) {
    $("status").textContent = paused
      ? "Пауза"
      : cloudTop > 5
        ? "Конвекция"
        : "Развитие";
  }
}

function resetStorm() {
  stormMode = $("stormType")?.value ?? "supercell";

  clearFields();

  // Select initial thermal position and size by storm mode.
  // No prebuilt cloud geometry is created.
  if (stormMode === "random") {
    stormMode = ["tower", "supercell", "multicell", "squall"][
      Math.floor(Math.random() * 4)
    ];
  }

  // Multicell mode seeds several separate thermal bubbles.
  if (stormMode === "multicell" || stormMode === "squall") {
    const count = stormMode === "squall" ? 5 : 3;

    for (let n = 0; n < count; n++) {
      const cx = Math.round(5 + n * (NX - 10) / Math.max(1, count - 1));
      const cz = Math.round(NZ / 2 + (Math.random() - 0.5) * 5);

      for (let y = 1; y < 7; y++) {
        for (let z = Math.max(1, cz - 3); z < Math.min(NZ - 1, cz + 4); z++) {
          for (let x = Math.max(1, cx - 3); x < Math.min(NX - 1, cx + 4); x++) {
            const i = index(x, y, z);
            const r =
              ((x - cx) / 3) ** 2 +
              ((z - cz) / 3) ** 2 +
              ((y - 3) / 3) ** 2;

            if (r < 1) T[i] += 1.8 * (1 - r);
          }
        }
      }
    }
  }

  // Tall tower mode gets a narrower and stronger thermal perturbation.
  if (stormMode === "tower") {
    for (let y = 1; y < 7; y++) {
      for (let z = 13; z < 19; z++) {
        for (let x = 13; x < 19; x++) {
          const i = index(x, y, z);
          T[i] += 1.6;
        }
      }
    }
  }

  // Supercell mode relies on the vertical wind shear already present
  // in the environmental wind profile.
  if (stormMode === "supercell") {
    const centreX = NX >> 1;
    const centreZ = NZ >> 1;

    for (let y = 1; y < 7; y++) {
      for (let z = centreZ - 4; z <= centreZ + 4; z++) {
        for (let x = centreX - 4; x <= centreX + 4; x++) {
          const i = index(x, y, z);
          const r =
            ((x - centreX) / 4) ** 2 +
            ((z - centreZ) / 4) ** 2 +
            ((y - 3) / 3) ** 2;

          if (r < 1) T[i] += 2.3 * (1 - r);
        }
      }
    }
  }

  updateCloudTexture();
  updateMetrics();
}

$("newStorm")?.addEventListener("click", resetStorm);

$("pause")?.addEventListener("click", () => {
  paused = !paused;

  if ($("pause")) {
    $("pause").textContent = paused ? "Продолжить" : "Пауза";
  }

  updateMetrics();
});

$("lightning")?.addEventListener("click", () => {
  lightningEnabled = !lightningEnabled;

  if ($("lightning")) {
    $("lightning").textContent = lightningEnabled
      ? "Молнии: вкл."
      : "Молнии: выкл.";
  }

  if (!lightningEnabled) flash.intensity = 0;
});

$("reset")?.addEventListener("click", () => {
  camera.position.set(245, 155, 290);
  controls.target.set(0, 8, 0);
  controls.update();
  resetStorm();
});

for (const id of ["cape", "shear", "humidity"]) {
  $(id)?.addEventListener("input", () => {
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
// RESIZE / INITIALIZATION
// ============================================================

function resize() {
  const width = canvas.clientWidth || window.innerWidth;
  const height = canvas.clientHeight || window.innerHeight;

  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(height, 1);
  camera.updateProjectionMatrix();
}

window.addEventListener("resize", resize, { passive: true });
resize();

if (loadingTitle) loadingTitle.textContent = "Quantum Meteo";
if (loadingText) loadingText.textContent = "Запуск атмосферной модели…";

clearFields();
resetStorm();

if (loading) loading.style.display = "none";

// ============================================================
// MAIN LOOP
// ============================================================

let lastTime = performance.now();
let physicsAccumulator = 0;
let textureAccumulator = 0;
let metricAccumulator = 0;

function animate(now) {
  requestAnimationFrame(animate);

  const realDt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  if (!paused) {
    // Accelerated model time. Button changes the growth speed.
    const speed = growthLevels[growthIndex];
    const modelDt = realDt * 10 * speed;

    physicsAccumulator += modelDt;

    // Substeps prevent one large numerical jump after a slow frame.
    let steps = 0;

    while (physicsAccumulator >= 0.12 && steps < 4) {
      physicsStep(0.12);
      physicsAccumulator -= 0.12;
      steps++;
    }

    textureAccumulator += realDt;
    metricAccumulator += realDt;

    // GPU texture upload is throttled separately from rendering.
    if (textureAccumulator >= 0.18) {
      updateCloudTexture();
      cloudMaterial.uniforms.uTime.value = simTime;
      textureAccumulator = 0;
    }

    if (metricAccumulator >= 1.0) {
      updateMetrics();
      metricAccumulator = 0;
    }

    updateLightning(realDt);
  }

  // Camera-local coordinate is needed by the volume shader.
  cloudVolume.updateMatrixWorld();

  cloudMaterial.uniforms.uCameraLocal.value.copy(
    cloudVolume.worldToLocal(camera.position.clone())
  );

  controls.update();
  renderer.render(scene, camera);
}

requestAnimationFrame(animate);

// ============================================================
// ERROR HANDLER — used by index.html
// ============================================================

window.showStormError = err => {
  console.error(err);

  if (loading) loading.style.display = "flex";
  if (loadingTitle) loadingTitle.textContent = "Ошибка симулятора";
  if (loadingText) loadingText.textContent = "Не удалось запустить атмосферную модель.";

  if (errorDetails) {
    errorDetails.style.display = "block";
    errorDetails.textContent = String(err?.stack || err);
  }
};
