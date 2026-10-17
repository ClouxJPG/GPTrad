
/* ============================================================
   QUANTUM METEO — NUMERICAL CONVECTION SIMULATOR
   Version 1.0

   - 3D grid: 32 x 32 x 32
   - Advection of air velocity and moisture
   - Approximate pressure projection
   - Buoyancy and vertical thermal transport
   - Water vapor, condensation and cloud water
   - 3D volume rendering through a Data3DTexture
   - No server, API, external weather data or cloud assets

   IMPORTANT:
   This is an educational, simplified numerical model.
   It is NOT a port of the full CM1 atmospheric model.
   ============================================================ */

import * as THREE from
  "https://esm.sh/three@0.180.0";

import { OrbitControls } from
  "https://esm.sh/three@0.180.0/examples/jsm/controls/OrbitControls.js";


// ============================================================
// CONFIGURATION
// ============================================================

const NX = 32;
const NY = 32;
const NZ = 32;

const SIZE = NX * NY * NZ;

const DOMAIN_X = 24;
const DOMAIN_Y = 13;
const DOMAIN_Z = 24;

const DT = 0.12;
const PRESSURE_ITERATIONS = 5;
const CLOUD_UPDATE_INTERVAL = 2;

const CELL_HEIGHT_KM = DOMAIN_Y / (NY - 1);

const clamp = (v, a, b) =>
  Math.max(a, Math.min(b, v));

const lerp = (a, b, t) =>
  a + (b - a) * t;

const index = (x, y, z) =>
  x + NX * (y + NY * z);


// ============================================================
// DOM
// ============================================================

const $ = (id) => document.getElementById(id);

const canvas = $("scene");
const loading = $("loading");
const loadingTitle = $("loadingTitle");
const loadingText = $("loadingText");
const errorDetails = $("errorDetails");

const capeSlider = $("cape");
const shearSlider = $("shear");
const humiditySlider = $("humidity");

const capeValue = $("capeValue");
const shearValue = $("shearValue");
const humidityValue = $("humidityValue");

const stormType = $("stormType");

const cloudHeightElement = $("cloudHeight");
const cellCountElement = $("cellCount");
const statusElement = $("status");


// ============================================================
// ERROR HANDLING
// ============================================================

function showError(error) {
  console.error("[Quantum Meteo]", error);

  if (loading) {
    loading.style.display = "flex";
  }

  if (loadingTitle) {
    loadingTitle.textContent = "Ошибка симуляции";
  }

  if (loadingText) {
    loadingText.textContent =
      "Не удалось запустить 3D-модель.";
  }

  if (errorDetails) {
    errorDetails.style.display = "block";
    errorDetails.textContent =
      error?.stack || error?.message || String(error);
  }
}

window.showStormError = showError;


// ============================================================
// MAIN
// ============================================================

try {
  await startSimulation();
} catch (error) {
  showError(error);
}


// ============================================================
// SIMULATION
// ============================================================

async function startSimulation() {
  if (!canvas) {
    throw new Error(
      "Не найден canvas #scene. Проверь index.html."
    );
  }

  if (!window.WebGL2RenderingContext) {
    throw new Error(
      "Для 3D-текстур требуется поддержка WebGL 2."
    );
  }

  if (loadingTitle) {
    loadingTitle.textContent =
      "Инициализация модели атмосферы";
  }

  if (loadingText) {
    loadingText.textContent =
      "Создание трёхмерной расчётной сетки...";
  }

  await new Promise(resolve =>
    requestAnimationFrame(resolve)
  );

  // ----------------------------------------------------------
  // THREE.JS
  // ----------------------------------------------------------

  const scene = new THREE.Scene();

  scene.background = new THREE.Color(0x111a2a);

  const camera = new THREE.PerspectiveCamera(
    48,
    canvas.clientWidth / Math.max(1, canvas.clientHeight),
    0.1,
    500
  );

  camera.position.set(34, 23, 39);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: "high-performance"
  });

  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio || 1, 1.35)
  );

  renderer.setSize(
    Math.max(1, canvas.clientWidth),
    Math.max(1, canvas.clientHeight),
    false
  );

  renderer.outputColorSpace = THREE.SRGBColorSpace;

  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const controls = new OrbitControls(camera, renderer.domElement);

  controls.target.set(0, DOMAIN_Y * 0.48, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.055;
  controls.minDistance = 12;
  controls.maxDistance = 100;
  controls.maxPolarAngle = Math.PI * 0.49;

  scene.add(new THREE.HemisphereLight(
    0xbfd9ff,
    0x252b38,
    1.2
  ));

  const sunlight = new THREE.DirectionalLight(
    0xffffff,
    2.0
  );

  sunlight.position.set(-20, 30, 12);
  scene.add(sunlight);

  // ----------------------------------------------------------
  // MODEL ARRAYS
  // ----------------------------------------------------------

  const u = new Float32Array(SIZE);
  const v = new Float32Array(SIZE);
  const w = new Float32Array(SIZE);

  const uNext = new Float32Array(SIZE);
  const vNext = new Float32Array(SIZE);
  const wNext = new Float32Array(SIZE);

  // Temperature perturbation relative to environment.
  const theta = new Float32Array(SIZE);
  const thetaNext = new Float32Array(SIZE);

  // Water vapor mixing ratio, kg/kg.
  const qv = new Float32Array(SIZE);
  const qvNext = new Float32Array(SIZE);

  // Cloud liquid water mixing ratio, kg/kg.
  const qc = new Float32Array(SIZE);
  const qcNext = new Float32Array(SIZE);

  const pressure = new Float32Array(SIZE);
  const pressureNext = new Float32Array(SIZE);
  const divergence = new Float32Array(SIZE);

  const cloudBytes = new Uint8Array(SIZE);

  // ----------------------------------------------------------
  // ENVIRONMENT
  // ----------------------------------------------------------

  function environmentalTemperature(y) {
    const heightKm = y * CELL_HEIGHT_KM;

    // Approximate environmental lapse rate.
    return 302.0 - 6.5 * heightKm;
  }

  function saturationMixingRatio(tempK, pressureHpa = 950) {
    const tempC = tempK - 273.15;

    const exponent =
      (17.67 * tempC) / (tempC + 243.5);

    const vaporPressure =
      6.112 * Math.exp(clamp(exponent, -20, 20));

    return 0.622 * vaporPressure /
      Math.max(1, pressureHpa - vaporPressure);
  }

  function relativeHumidityFraction() {
    const value = Number(humiditySlider?.value ?? 80);

    return clamp(value / 100, 0.05, 1.0);
  }

  function initializeEnvironment() {
    u.fill(0);
    v.fill(0);
    w.fill(0);

    theta.fill(0);
    qc.fill(0);

    pressure.fill(0);
    pressureNext.fill(0);

    const rh = relativeHumidityFraction();

    for (let z = 0; z < NZ; z++) {
      for (let y = 0; y < NY; y++) {
        const temp = environmentalTemperature(y);

        const qSat = saturationMixingRatio(temp);

        // Moisture decreases with altitude.
        const moistureFactor =
          Math.exp(-(y * CELL_HEIGHT_KM) / 2.6);

        const vapor =
          qSat * rh * moistureFactor;

        for (let x = 0; x < NX; x++) {
          const i = index(x, y, z);

          qv[i] = Math.max(0.0001, vapor);

          // Environmental background shear.
          u[i] = 0;
        }
      }
    }
  }

  // ----------------------------------------------------------
  // THERMAL INITIATION
  // ----------------------------------------------------------

  let thermalX = NX * 0.5;
  let thermalZ = NZ * 0.5;

  let simulationTime = 0;
  let lastThermalTime = 0;
  let frameNumber = 0;

  let paused = false;
  let stormAge = 0;

  let currentCAPE = Number(capeSlider?.value ?? 1500);
  let currentShear = Number(shearSlider?.value ?? 35);
  let currentHumidity = Number(humiditySlider?.value ?? 80);

  function makeThermal(xCenter, zCenter, strength = 1) {
    const radius = 3.2;
    const capeFactor = clamp(currentCAPE / 2000, 0.1, 2.5);

    for (let z = 1; z < NZ - 1; z++) {
      for (let y = 1; y < 6; y++) {
        for (let x = 1; x < NX - 1; x++) {
          const dx = (x - xCenter) / radius;
          const dz = (z - zCenter) / radius;
          const dy = (y - 2.0) / 2.5;

          const r2 = dx * dx + dz * dz + dy * dy;

          if (r2 > 5.0) continue;

          const bubble = Math.exp(-r2 * 1.25);
          const i = index(x, y, z);

          // Warm, moist air; no cloud is created here.
          theta[i] +=
            bubble * strength * (0.8 + capeFactor * 1.1);

          const temp = environmentalTemperature(y);

          qv[i] +=
            bubble *
            relativeHumidityFraction() *
            saturationMixingRatio(temp) *
            0.045;
        }
      }
    }

    // A small upward impulse initiates convection.
    for (let z = 1; z < NZ - 1; z++) {
      for (let y = 1; y < 5; y++) {
        for (let x = 1; x < NX - 1; x++) {
          const dx = x - xCenter;
          const dz = z - zCenter;
          const radius2 = dx * dx + dz * dz;

          if (radius2 > 20) continue;

          const i = index(x, y, z);

          w[i] +=
            Math.exp(-radius2 / 8) *
            (0.04 + capeFactor * 0.035) *
            strength;
        }
      }
    }
  }

  function chooseThermalLocation() {
    const mode = stormType?.value || "random";

    if (mode === "tower") {
      thermalX = NX * 0.5;
      thermalZ = NZ * 0.5;
      return;
    }

    if (mode === "supercell") {
      thermalX = NX * 0.34;
      thermalZ = NZ * 0.5;
      return;
    }

    thermalX = 5 + Math.random() * (NX - 10);
    thermalZ = 5 + Math.random() * (NZ - 10);
  }

  // ----------------------------------------------------------
  // TRILINEAR SAMPLING
  // ----------------------------------------------------------

  function sampleField(field, x, y, z) {
    x = clamp(x, 0, NX - 1.001);
    y = clamp(y, 0, NY - 1.001);
    z = clamp(z, 0, NZ - 1.001);

    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const z0 = Math.floor(z);

    const x1 = Math.min(NX - 1, x0 + 1);
    const y1 = Math.min(NY - 1, y0 + 1);
    const z1 = Math.min(NZ - 1, z0 + 1);

    const fx = x - x0;
    const fy = y - y0;
    const fz = z - z0;

    const c000 = field[index(x0, y0, z0)];
    const c100 = field[index(x1, y0, z0)];
    const c010 = field[index(x0, y1, z0)];
    const c110 = field[index(x1, y1, z0)];

    const c001 = field[index(x0, y0, z1)];
    const c101 = field[index(x1, y0, z1)];
    const c011 = field[index(x0, y1, z1)];
    const c111 = field[index(x1, y1, z1)];

    const c00 = lerp(c000, c100, fx);
    const c10 = lerp(c010, c110, fx);
    const c01 = lerp(c001, c101, fx);
    const c11 = lerp(c011, c111, fx);

    const c0 = lerp(c00, c10, fy);
    const c1 = lerp(c01, c11, fy);

    return lerp(c0, c1, fz);
  }

  // ----------------------------------------------------------
  // SEMI-LAGRANGIAN ADVECTION
  // ----------------------------------------------------------

  function advectField(source, destination) {
    for (let z = 1; z < NZ - 1; z++) {
      for (let y = 1; y < NY - 1; y++) {
        for (let x = 1; x < NX - 1; x++) {
          const i = index(x, y, z);

          const backX = x - u[i] * DT;
          const backY = y - v[i] * DT;
          const backZ = z - w[i] * DT;

          destination[i] = sampleField(
            source,
            backX,
            backY,
            backZ
          );
        }
      }
    }

    // Copy boundary values.
    for (let z = 0; z < NZ; z++) {
      for (let x = 0; x < NX; x++) {
        destination[index(x, 0, z)] =
          source[index(x, 0, z)];

        destination[index(x, NY - 1, z)] =
          source[index(x, NY - 1, z)];
      }
    }

    for (let y = 0; y < NY; y++) {
      for (let x = 0; x < NX; x++) {
        destination[index(x, y, 0)] =
          source[index(x, y, 0)];

        destination[index(x, y, NZ - 1)] =
          source[index(x, y, NZ - 1)];
      }

      for (let z = 0; z < NZ; z++) {
        destination[index(0, y, z)] =
          source[index(0, y, z)];

        destination[index(NX - 1, y, z)] =
          source[index(NX - 1, y, z)];
      }
    }
  }

  // ----------------------------------------------------------
  // PRESSURE PROJECTION
  // ----------------------------------------------------------

  function solvePressure() {
    divergence.fill(0);
    pressure.fill(0);

    for (let z = 1; z < NZ - 1; z++) {
      for (let y = 1; y < NY - 1; y++) {
        for (let x = 1; x < NX - 1; x++) {
          const i = index(x, y, z);

          const du =
            u[index(x + 1, y, z)] -
            u[index(x - 1, y, z)];

          const dv =
            v[index(x, y + 1, z)] -
            v[index(x, y - 1, z)];

          const dw =
            w[index(x, y, z + 1)] -
            w[index(x, y, z - 1)];

          divergence[i] = 0.5 * (du + dv + dw);
        }
      }
    }

    for (let iteration = 0;
         iteration < PRESSURE_ITERATIONS;
         iteration++) {

      for (let z = 1; z < NZ - 1; z++) {
        for (let y = 1; y < NY - 1; y++) {
          for (let x = 1; x < NX - 1; x++) {
            const i = index(x, y, z);

            const neighbors =
              pressure[index(x - 1, y, z)] +
              pressure[index(x + 1, y, z)] +
              pressure[index(x, y - 1, z)] +
              pressure[index(x, y + 1, z)] +
              pressure[index(x, y, z - 1)] +
              pressure[index(x, y, z + 1)];

            pressureNext[i] =
              (neighbors - divergence[i]) / 6;
          }
        }
      }

      pressure.set(pressureNext);
    }

    // Remove the pressure gradient from velocity.
    for (let z = 1; z < NZ - 1; z++) {
      for (let y = 1; y < NY - 1; y++) {
        for (let x = 1; x < NX - 1; x++) {
          const i = index(x, y, z);

          u[i] -= 0.5 * (
            pressure[index(x + 1, y, z)] -
            pressure[index(x - 1, y, z)]
          );

          v[i] -= 0.5 * (
            pressure[index(x, y + 1, z)] -
            pressure[index(x, y - 1, z)]
          );

          w[i] -= 0.5 * (
            pressure[index(x, y, z + 1)] -
            pressure[index(x, y, z - 1)]
          );
        }
      }
    }
  }

  // ----------------------------------------------------------
  // CLOUD MICROPHYSICS
  // ----------------------------------------------------------

  function applyMicrophysics() {
    let cloudCells = 0;
    let maximumCloudY = 0;

    for (let z = 1; z < NZ - 1; z++) {
      for (let y = 1; y < NY - 1; y++) {
        for (let x = 1; x < NX - 1; x++) {
          const i = index(x, y, z);

          const temp =
            environmentalTemperature(y) + theta[i];

          const qSat = saturationMixingRatio(temp);

          if (qv[i] > qSat) {
            const excess = qv[i] - qSat;

            // Condensation converts vapor into cloud water.
            const condensed = excess * 0.48;

            qv[i] -= condensed;
            qc[i] += condensed;

            // Latent heat release.
            theta[i] += condensed * 2500;
          } else if (qc[i] > 0 && qv[i] < qSat * 0.94) {
            // Partial evaporation in subsaturated air.
            const evaporated = Math.min(
              qc[i],
              (qSat - qv[i]) * 0.035
            );

            qc[i] -= evaporated;
            qv[i] += evaporated;

            theta[i] -= evaporated * 2500;
          }

          // Simple cloud-water settling and dissipation.
          qc[i] = Math.max(0, qc[i] - 0.0000015);

          if (qc[i] > 0.000015) {
            cloudCells++;
            maximumCloudY = Math.max(maximumCloudY, y);
          }

          // Numerical safety.
          theta[i] = clamp(theta[i], -18, 18);
          qv[i] = clamp(qv[i], 0, 0.05);
          qc[i] = clamp(qc[i], 0, 0.015);
        }
      }
    }

    return {
      cloudCells,
      maximumCloudY
    };
  }

  // ----------------------------------------------------------
  // DYNAMICS
  // ----------------------------------------------------------

  function applyForces() {
    const capeFactor = clamp(currentCAPE / 2000, 0, 2.5);

    const shearFraction = clamp(currentShear / 100, 0, 1);

    for (let z = 1; z < NZ - 1; z++) {
      for (let y = 1; y < NY - 1; y++) {
        for (let x = 1; x < NX - 1; x++) {
          const i = index(x, y, z);

          // Buoyancy: positive thermal perturbations accelerate
          // upward motion. CAPE controls the acceleration scale.
          const buoyancy =
            theta[i] * 0.028 * capeFactor;

          w[i] += buoyancy * DT;

          // A rising parcel cools relative to the environment.
          // This approximates the difference between dry-adiabatic
          // and environmental lapse rates.
          theta[i] -=
            w[i] * DT * 1.25;

          // Weak relaxation toward a height-dependent background
          // wind. This represents environmental vertical shear.
          const heightFraction = y / (NY - 1);

          const backgroundWind =
            (heightFraction - 0.5) *
            shearFraction *
            0.20;

          u[i] += (backgroundWind - u[i]) * 0.018;

          // Small-scale numerical damping.
          u[i] *= 0.997;
          v[i] *= 0.997;
          w[i] *= 0.996;

          // Approximate moisture effects on buoyancy.
          w[i] += qc[i] * 0.8 * DT;
        }
      }
    }

    // Impermeable vertical boundaries.
    for (let z = 0; z < NZ; z++) {
      for (let x = 0; x < NX; x++) {
        w[index(x, 0, z)] = 0;
        w[index(x, NY - 1, z)] = 0;
      }
    }

    // Damping near the domain's side boundaries.
    for (let y = 0; y < NY; y++) {
      for (let z = 0; z < NZ; z++) {
        for (let x = 0; x < NX; x++) {
          const edge = Math.min(
            x, NX - 1 - x,
            z, NZ - 1 - z
          );

          if (edge < 2) {
            const damping = edge === 0 ? 0.2 : 0.65;
            const i = index(x, y, z);

            u[i] *= damping;
            v[i] *= damping;
            w[i] *= damping;
          }
        }
      }
    }
  }

  // ----------------------------------------------------------
  // CLOUD VOLUME TEXTURE
  // ----------------------------------------------------------

  const cloudTexture = new THREE.Data3DTexture(
    cloudBytes,
    NX,
    NY,
    NZ
  );

  cloudTexture.format = THREE.RedFormat;
  cloudTexture.type = THREE.UnsignedByteType;

  cloudTexture.minFilter = THREE.LinearFilter;
  cloudTexture.magFilter = THREE.LinearFilter;

  cloudTexture.wrapS = THREE.ClampToEdgeWrapping;
  cloudTexture.wrapT = THREE.ClampToEdgeWrapping;
  cloudTexture.wrapR = THREE.ClampToEdgeWrapping;

  cloudTexture.unpackAlignment = 1;
  cloudTexture.needsUpdate = true;

  // ----------------------------------------------------------
  // VOLUME RENDERER
  // ----------------------------------------------------------

  const volumeMaterial = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,

    uniforms: {
      uCloudTex: { value: cloudTexture },
      uCameraLocal: { value: new THREE.Vector3() },
      uLightDirection: {
        value: new THREE.Vector3(-0.5, 0.8, 0.4).normalize()
      },
      uCloudOpacity: { value: 1.0 }
    },

    vertexShader: `
      out vec3 vPosition;

      void main() {
        vPosition = position;

        gl_Position =
          projectionMatrix *
          modelViewMatrix *
          vec4(position, 1.0);
      }
    `,

    fragmentShader: `
      precision highp float;
      precision highp sampler3D;

      uniform sampler3D uCloudTex;
      uniform vec3 uCameraLocal;
      uniform vec3 uLightDirection;
      uniform float uCloudOpacity;

      in vec3 vPosition;

      out vec4 outColor;

      bool insideBox(vec3 p) {
        return all(greaterThanEqual(p, vec3(-1.0))) &&
               all(lessThanEqual(p, vec3(1.0)));
      }

      float densityAt(vec3 uvw) {
        return texture(uCloudTex, uvw).r;
      }

      void main() {
        vec3 ray = normalize(vPosition - uCameraLocal);
        vec3 p = vPosition;

        vec4 accumulated = vec4(0.0);

        const int MAX_STEPS = 96;
        const float STEP_SIZE = 0.035;

        for (int i = 0; i < MAX_STEPS; i++) {
          if (!insideBox(p)) break;

          vec3 uvw = p * 0.5 + 0.5;

          float density = densityAt(uvw);

          if (density > 0.008) {
            // Estimate local density gradients for shading.
            vec3 texel = vec3(
              1.0 / 32.0,
              1.0 / 32.0,
              1.0 / 32.0
            );

            float gx =
              densityAt(clamp(uvw + vec3(texel.x, 0.0, 0.0),
                              0.0, 1.0)) -
              densityAt(clamp(uvw - vec3(texel.x, 0.0, 0.0),
                              0.0, 1.0));

            float gy =
              densityAt(clamp(uvw + vec3(0.0, texel.y, 0.0),
                              0.0, 1.0)) -
              densityAt(clamp(uvw - vec3(0.0, texel.y, 0.0),
                              0.0, 1.0));

            float gz =
              densityAt(clamp(uvw + vec3(0.0, 0.0, texel.z),
                              0.0, 1.0)) -
              densityAt(clamp(uvw - vec3(0.0, 0.0, texel.z),
                              0.0, 1.0));

            vec3 normal = normalize(
              vec3(-gx, -gy, -gz) + vec3(0.0001)
            );

            float light = clamp(
              0.5 + 0.5 * dot(normal, normalize(uLightDirection)),
              0.0,
              1.0
            );

            float shade = 0.55 + light * 0.55;

            vec3 cloudColor = mix(
              vec3(0.30, 0.36, 0.45),
              vec3(0.96, 0.98, 1.0),
              clamp(density * 1.8 + light * 0.25, 0.0, 1.0)
            );

            cloudColor *= shade;

            float alpha =
              1.0 - exp(-density * 10.0 * STEP_SIZE);

            alpha *= uCloudOpacity;

            accumulated.rgb +=
              (1.0 - accumulated.a) * cloudColor * alpha;

            accumulated.a +=
              (1.0 - accumulated.a) * alpha;

            if (accumulated.a > 0.985) break;
          }

          p += ray * STEP_SIZE;
        }

        if (accumulated.a < 0.008) discard;

        outColor = vec4(
          accumulated.rgb,
          accumulated.a
        );
      }
    `,

    side: THREE.FrontSide,
    transparent: true,
    depthWrite: false
  });

  const volume = new THREE.Mesh(
    new THREE.BoxGeometry(2, 2, 2),
    volumeMaterial
  );

  volume.scale.set(
    DOMAIN_X / 2,
    DOMAIN_Y / 2,
    DOMAIN_Z / 2
  );

  volume.position.y = DOMAIN_Y / 2;

  scene.add(volume);

  // ----------------------------------------------------------
  // CLOUD FIELD TO GPU
  // ----------------------------------------------------------

  function updateCloudTexture() {
    let cloudCells = 0;
    let maxY = 0;

    for (let z = 0; z < NZ; z++) {
      for (let y = 0; y < NY; y++) {
        for (let x = 0; x < NX; x++) {
          const i = index(x, y, z);

          // Cloud water only: no artificial cloud geometry.
          const density = clamp(
            qc[i] * 18000,
            0,
            1
          );

          cloudBytes[i] = Math.round(density * 255);

          if (qc[i] > 0.000015) {
            cloudCells++;
            maxY = Math.max(maxY, y);
          }
        }
      }
    }

    cloudTexture.needsUpdate = true;

    if (cellCountElement) {
      cellCountElement.textContent =
        String(cloudCells);
    }

    if (cloudHeightElement) {
      const heightKm = maxY * CELL_HEIGHT_KM;

      cloudHeightElement.textContent =
        cloudCells > 0
          ? `${heightKm.toFixed(1)} km`
          : "—";
    }

    return cloudCells;
  }

  // ----------------------------------------------------------
  // TIME STEP
  // ----------------------------------------------------------

  function stepModel() {
    // Advect all prognostic fields.
    advectField(u, uNext);
    advectField(v, vNext);
    advectField(w, wNext);

    advectField(theta, thetaNext);
    advectField(qv, qvNext);
    advectField(qc, qcNext);

    u.set(uNext);
    v.set(vNext);
    w.set(wNext);

    theta.set(thetaNext);
    qv.set(qvNext);
    qc.set(qcNext);

    applyForces();

    // Generate another warm thermal after a delay. The model
    // must still produce cloud water through condensation.
    const mode = stormType?.value || "random";

    const interval =
      mode === "tower" ? 100 :
      mode === "supercell" ? 75 :
      mode === "multicell" ? 25 :
      mode === "squall" ? 18 : 35;

    if (simulationTime - lastThermalTime > interval) {
      if (mode !== "tower") {
        chooseThermalLocation();
      }

      makeThermal(
        thermalX,
        thermalZ,
        0.75 + Math.random() * 0.45
      );

      lastThermalTime = simulationTime;
    }

    solvePressure();

    applyMicrophysics();

    simulationTime += DT;
    stormAge += DT;
  }

  // ----------------------------------------------------------
  // LIGHTNING VISUAL
  // ----------------------------------------------------------

  let lightningLine = null;
  let lightningExpiry = 0;

  function triggerLightning() {
    if (lightningLine) {
      scene.remove(lightningLine);

      lightningLine.geometry.dispose();
      lightningLine.material.dispose();

      lightningLine = null;
    }

    const x =
      ((thermalX / (NX - 1)) - 0.5) * DOMAIN_X;

    const z =
      ((thermalZ / (NZ - 1)) - 0.5) * DOMAIN_Z;

    const points = [];

    const segments = 14;

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;

      const px = x + (Math.random() - 0.5) * 1.5;
      const py = DOMAIN_Y * (1 - t);
      const pz = z + (Math.random() - 0.5) * 1.5;

      points.push(new THREE.Vector3(px, py, pz));
    }

    const geometry = new THREE.BufferGeometry()
      .setFromPoints(points);

    const material = new THREE.LineBasicMaterial({
      color: 0xc9e7ff,
      transparent: true,
      opacity: 1
    });

    lightningLine = new THREE.Line(geometry, material);

    scene.add(lightningLine);

    lightningExpiry = performance.now() + 180;
  }

  // ----------------------------------------------------------
  // UI
  // ----------------------------------------------------------

  function updateParameterLabels() {
    currentCAPE = Number(capeSlider?.value ?? 1500);
    currentShear = Number(shearSlider?.value ?? 35);
    currentHumidity = Number(humiditySlider?.value ?? 80);

    if (capeValue) {
      capeValue.textContent = `${currentCAPE} J/kg`;
    }

    if (shearValue) {
      shearValue.textContent = `${currentShear} m/s`;
    }

    if (humidityValue) {
      humidityValue.textContent = `${currentHumidity}%`;
    }
  }

  capeSlider?.addEventListener("input", updateParameterLabels);
  shearSlider?.addEventListener("input", updateParameterLabels);
  humiditySlider?.addEventListener("input", updateParameterLabels);

  updateParameterLabels();

  function resetModel() {
    simulationTime = 0;
    stormAge = 0;
    lastThermalTime = 0;

    initializeEnvironment();
    chooseThermalLocation();

    // Seed warm, moist air. Cloud water starts at zero.
    makeThermal(thermalX, thermalZ, 1.0);

    updateCloudTexture();

    if (statusElement) {
      statusElement.textContent = "Конвекция развивается";
    }
  }

  $("newStorm")?.addEventListener("click", () => {
    resetModel();

    if (statusElement) {
      statusElement.textContent = "Новый эксперимент";
    }
  });

  $("pause")?.addEventListener("click", (event) => {
    paused = !paused;

    if (event.currentTarget) {
      event.currentTarget.textContent =
        paused ? "Продолжить" : "Пауза";
    }

    if (statusElement) {
      statusElement.textContent =
        paused ? "Пауза" : "Модель работает";
    }
  });

  $("lightning")?.addEventListener(
    "click",
    triggerLightning
  );

  $("reset")?.addEventListener("click", () => {
    controls.reset();

    camera.position.set(34, 23, 39);
    controls.target.set(0, DOMAIN_Y * 0.48, 0);
    controls.update();
  });

  stormType?.addEventListener("change", () => {
    resetModel();
  });

  // ----------------------------------------------------------
  // INITIAL CONDITIONS
  // ----------------------------------------------------------

  initializeEnvironment();
  chooseThermalLocation();

  makeThermal(thermalX, thermalZ, 1.0);

  updateCloudTexture();

  if (loading) {
    loading.style.display = "none";
  }

  if (statusElement) {
    statusElement.textContent = "Модель работает";
  }

  // ----------------------------------------------------------
  // RESIZE
  // ----------------------------------------------------------

  function resize() {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height, false);

    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, 1.35)
    );
  }

  window.addEventListener("resize", resize);

  // ----------------------------------------------------------
  // RENDER LOOP
  // ----------------------------------------------------------

  let lastFrameTime = performance.now();
  let accumulatedTime = 0;

  function animate(now) {
    requestAnimationFrame(animate);

    const elapsed = Math.min(
      (now - lastFrameTime) / 1000,
      0.05
    );

    lastFrameTime = now;

    controls.update();

    if (!paused) {
      accumulatedTime += elapsed;

      // Fixed simulation timestep. Limit catch-up work on phones.
      let steps = 0;

      while (accumulatedTime >= DT && steps < 2) {
        stepModel();

        accumulatedTime -= DT;
        steps++;
      }

      if (steps === 2 && accumulatedTime >= DT) {
        accumulatedTime = 0;
      }

      frameNumber++;

      if (frameNumber % CLOUD_UPDATE_INTERVAL === 0) {
        updateCloudTexture();
      }
    }

    // The volume shader expects camera position in local
    // coordinates of the scaled volume mesh.
    const localCameraPosition = volume.worldToLocal(
      camera.position.clone()
    );

    volumeMaterial.uniforms.uCameraLocal.value.copy(
      localCameraPosition
    );

    if (lightningLine && now > lightningExpiry) {
      scene.remove(lightningLine);

      lightningLine.geometry.dispose();
      lightningLine.material.dispose();

      lightningLine = null;
    }

    renderer.render(scene, camera);
  }

  requestAnimationFrame(animate);
}
