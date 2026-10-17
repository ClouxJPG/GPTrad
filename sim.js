
/* ============================================================
   QUANTUM METEO — CONVECTION MODEL
   Fixed cloud rendering + simplified numerical atmosphere

   Existing index.html is not changed.
   Uses Three.js, OrbitControls and the existing UI IDs.

   Model fields:
   - u, v, w: air velocity
   - theta: temperature perturbation
   - qv: water vapor
   - qc: cloud liquid water

   The cloud is rendered from qc, not from a premade cloud mesh.
   This is an educational model, not the full CM1 solver.
   ============================================================ */

import * as THREE from
  "https://esm.sh/three@0.180.0";

import { OrbitControls } from
  "https://esm.sh/three@0.180.0/examples/jsm/controls/OrbitControls.js";


// ============================================================
// SETTINGS
// ============================================================

const NX = 32;
const NY = 32;
const NZ = 32;

const N = NX * NY * NZ;

const DX = 24 / (NX - 1);
const DY = 13 / (NY - 1);
const DZ = 24 / (NZ - 1);

const WORLD_X = 24;
const WORLD_Y = 13;
const WORLD_Z = 24;

const DT = 0.16;

const clamp = (v, lo, hi) =>
  Math.max(lo, Math.min(hi, v));

const lerp = (a, b, t) =>
  a + (b - a) * t;

const idx = (x, y, z) =>
  x + NX * (y + NY * z);

const $ = id => document.getElementById(id);


// ============================================================
// INTERFACE
// ============================================================

const canvas = $("scene");

const loading = $("loading");
const loadingTitle = $("loadingTitle");
const loadingText = $("loadingText");
const errorDetails = $("errorDetails");

const capeSlider = $("cape");
const shearSlider = $("shear");
const humiditySlider = $("humidity");
const stormType = $("stormType");

const capeValue = $("capeValue");
const shearValue = $("shearValue");
const humidityValue = $("humidityValue");

const cloudHeightElement = $("cloudHeight");
const cellCountElement = $("cellCount");
const statusElement = $("status");


// ============================================================
// ERROR REPORTING
// ============================================================

function showStormError(error) {
  console.error("[Quantum Meteo]", error);

  if (loading) loading.style.display = "flex";

  if (loadingTitle) {
    loadingTitle.textContent = "Ошибка запуска";
  }

  if (loadingText) {
    loadingText.textContent =
      "Не удалось инициализировать симуляцию.";
  }

  if (errorDetails) {
    errorDetails.style.display = "block";
    errorDetails.textContent =
      error?.stack || error?.message || String(error);
  }
}

window.showStormError = showStormError;


// ============================================================
// START
// ============================================================

try {
  await main();
} catch (error) {
  showStormError(error);
}


async function main() {
  if (!canvas) {
    throw new Error("В index.html отсутствует #scene.");
  }

  if (loadingTitle) {
    loadingTitle.textContent = "Запуск модели";
  }

  if (loadingText) {
    loadingText.textContent =
      "Инициализация расчётной сетки атмосферы...";
  }

  await new Promise(resolve => requestAnimationFrame(resolve));


  // ==========================================================
  // THREE.JS SCENE
  // ==========================================================

  const scene = new THREE.Scene();

  scene.background = new THREE.Color(0x172337);

  scene.fog = new THREE.Fog(0x172337, 65, 145);

  const camera = new THREE.PerspectiveCamera(
    48,
    Math.max(1, canvas.clientWidth) /
      Math.max(1, canvas.clientHeight),
    0.1,
    250
  );

  camera.position.set(32, 22, 34);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: "high-performance"
  });

  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio || 1, 1.25)
  );

  renderer.setSize(
    Math.max(1, canvas.clientWidth),
    Math.max(1, canvas.clientHeight),
    false
  );

  renderer.outputColorSpace = THREE.SRGBColorSpace;

  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const controls = new OrbitControls(camera, renderer.domElement);

  controls.target.set(0, 5.5, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 12;
  controls.maxDistance = 95;
  controls.maxPolarAngle = Math.PI * 0.49;

  scene.add(new THREE.HemisphereLight(
    0xd5e5ff,
    0x343b48,
    1.6
  ));

  const sun = new THREE.DirectionalLight(0xffffff, 2.0);
  sun.position.set(-20, 35, 15);
  scene.add(sun);


  // ==========================================================
  // DOMAIN FLOOR
  // ==========================================================

  const floorGeometry = new THREE.PlaneGeometry(
    WORLD_X,
    WORLD_Z,
    24,
    24
  );

  const floorMaterial = new THREE.MeshBasicMaterial({
    color: 0x28364a,
    wireframe: true,
    transparent: true,
    opacity: 0.24
  });

  const floor = new THREE.Mesh(floorGeometry, floorMaterial);

  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  scene.add(floor);

  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_X, WORLD_Z),
    new THREE.MeshBasicMaterial({
      color: 0x18263a,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide
    })
  );

  base.rotation.x = -Math.PI / 2;
  base.position.y = -0.025;
  scene.add(base);


  // ==========================================================
  // MODEL ARRAYS
  // ==========================================================

  const u = new Float32Array(N);
  const v = new Float32Array(N);
  const w = new Float32Array(N);

  const un = new Float32Array(N);
  const vn = new Float32Array(N);
  const wn = new Float32Array(N);

  const theta = new Float32Array(N);
  const thetan = new Float32Array(N);

  const qv = new Float32Array(N);
  const qvn = new Float32Array(N);

  const qc = new Float32Array(N);
  const qcn = new Float32Array(N);


  // ==========================================================
  // MODEL PARAMETERS
  // ==========================================================

  let cape = Number(capeSlider?.value ?? 1500);
  let shear = Number(shearSlider?.value ?? 35);
  let humidity = Number(humiditySlider?.value ?? 80);

  let modelTime = 0;
  let lastThermalTime = -100;
  let thermalX = NX * 0.5;
  let thermalZ = NZ * 0.5;

  let paused = false;
  let frameNumber = 0;
  let cloudCellCount = 0;
  let highestCloudCell = 0;


  // ==========================================================
  // THERMODYNAMICS
  // ==========================================================

  function environmentalTemperature(y) {
    const heightKm = y * DY;
    return 302 - 6.5 * heightKm;
  }

  function saturationMixingRatio(tempK) {
    const tempC = tempK - 273.15;

    const exponent = clamp(
      17.67 * tempC / (tempC + 243.5),
      -20,
      20
    );

    const vaporPressure = 6.112 * Math.exp(exponent);

    const pressureHpa = 950;

    return 0.622 * vaporPressure /
      Math.max(1, pressureHpa - vaporPressure);
  }

  function readControls() {
    cape = Number(capeSlider?.value ?? 1500);
    shear = Number(shearSlider?.value ?? 35);
    humidity = Number(humiditySlider?.value ?? 80);

    if (capeValue) {
      capeValue.textContent = `${cape} J/kg`;
    }

    if (shearValue) {
      shearValue.textContent = `${shear} m/s`;
    }

    if (humidityValue) {
      humidityValue.textContent = `${humidity}%`;
    }
  }

  capeSlider?.addEventListener("input", readControls);
  shearSlider?.addEventListener("input", readControls);
  humiditySlider?.addEventListener("input", readControls);

  readControls();


  // ==========================================================
  // INITIAL ATMOSPHERE
  // ==========================================================

  function initializeAtmosphere() {
    u.fill(0);
    v.fill(0);
    w.fill(0);

    theta.fill(0);
    qc.fill(0);

    const rh = clamp(humidity / 100, 0.05, 1.0);

    for (let z = 0; z < NZ; z++) {
      for (let y = 0; y < NY; y++) {
        const temp = environmentalTemperature(y);
        const qsat = saturationMixingRatio(temp);

        // Moisture decreases with height.
        const moistureProfile =
          Math.exp(-(y * DY) / 3.2);

        const vapor =
          qsat * rh * moistureProfile;

        for (let x = 0; x < NX; x++) {
          const i = idx(x, y, z);

          qv[i] = vapor;

          // Environmental wind profile.
          const heightFraction = y / (NY - 1);

          u[i] =
            (heightFraction - 0.5) *
            (shear / 100) *
            0.15;
        }
      }
    }

    modelTime = 0;
    lastThermalTime = -100;
  }


  // ==========================================================
  // THERMAL INITIATION
  // ==========================================================

  function selectThermalLocation() {
    const type = stormType?.value || "random";

    if (type === "tower") {
      thermalX = NX * 0.5;
      thermalZ = NZ * 0.5;
    } else if (type === "supercell") {
      thermalX = NX * 0.36;
      thermalZ = NZ * 0.5;
    } else {
      thermalX = 5 + Math.random() * (NX - 10);
      thermalZ = 5 + Math.random() * (NZ - 10);
    }
  }

  function addThermal(cx, cz, strength = 1) {
    const capeFactor = clamp(cape / 2000, 0.2, 2.5);

    const radius = 3.0;

    for (let z = 1; z < NZ - 1; z++) {
      for (let y = 1; y < 7; y++) {
        for (let x = 1; x < NX - 1; x++) {
          const dx = (x - cx) / radius;
          const dz = (z - cz) / radius;
          const dy = (y - 2.2) / 2.5;

          const r2 = dx * dx + dz * dz + dy * dy;

          if (r2 > 5.0) continue;

          const bubble = Math.exp(-r2 * 1.15);
          const i = idx(x, y, z);

          theta[i] +=
            bubble * strength * (0.9 + capeFactor * 1.2);

          // Moist thermal.
          const qsat = saturationMixingRatio(
            environmentalTemperature(y)
          );

          qv[i] +=
            bubble * qsat *
            clamp(humidity / 100, 0.05, 1.0) *
            0.08;
        }
      }
    }

    // Initial updraft impulse.
    for (let z = 1; z < NZ - 1; z++) {
      for (let y = 1; y < 6; y++) {
        for (let x = 1; x < NX - 1; x++) {
          const dx = x - cx;
          const dz = z - cz;
          const r2 = dx * dx + dz * dz;

          if (r2 > 24) continue;

          const i = idx(x, y, z);

          w[i] +=
            Math.exp(-r2 / 9) *
            (0.22 + capeFactor * 0.12) *
            strength;
        }
      }
    }
  }


  // ==========================================================
  // TRILINEAR SAMPLING
  // ==========================================================

  function sample(field, x, y, z) {
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

    const a = lerp(
      field[idx(x0, y0, z0)],
      field[idx(x1, y0, z0)],
      fx
    );

    const b = lerp(
      field[idx(x0, y1, z0)],
      field[idx(x1, y1, z0)],
      fx
    );

    const c = lerp(
      field[idx(x0, y0, z1)],
      field[idx(x1, y0, z1)],
      fx
    );

    const d = lerp(
      field[idx(x0, y1, z1)],
      field[idx(x1, y1, z1)],
      fx
    );

    return lerp(
      lerp(a, b, fy),
      lerp(c, d, fy),
      fz
    );
  }


  // ==========================================================
  // SEMI-LAGRANGIAN ADVECTION
  // ==========================================================

  function advect(source, destination) {
    for (let z = 1; z < NZ - 1; z++) {
      for (let y = 1; y < NY - 1; y++) {
        for (let x = 1; x < NX - 1; x++) {
          const i = idx(x, y, z);

          const bx = x - u[i] * DT;
          const by = y - v[i] * DT;
          const bz = z - w[i] * DT;

          destination[i] = sample(source, bx, by, bz);
        }
      }
    }

    // Keep boundary values stable.
    for (let z = 0; z < NZ; z++) {
      for (let x = 0; x < NX; x++) {
        destination[idx(x, 0, z)] = source[idx(x, 0, z)];
        destination[idx(x, NY - 1, z)] =
          source[idx(x, NY - 1, z)];
      }
    }

    for (let y = 0; y < NY; y++) {
      for (let z = 0; z < NZ; z++) {
        destination[idx(0, y, z)] = source[idx(0, y, z)];
        destination[idx(NX - 1, y, z)] =
          source[idx(NX - 1, y, z)];
      }

      for (let x = 0; x < NX; x++) {
        destination[idx(x, y, 0)] = source[idx(x, y, 0)];
        destination[idx(x, y, NZ - 1)] =
          source[idx(x, y, NZ - 1)];
      }
    }
  }


  // ==========================================================
  // MODEL FORCES
  // ==========================================================

  function applyDynamics() {
    const capeFactor = clamp(cape / 2000, 0.2, 2.5);
    const shearFactor = clamp(shear / 100, 0, 1.5);

    for (let z = 1; z < NZ - 1; z++) {
      for (let y = 1; y < NY - 1; y++) {
        for (let x = 1; x < NX - 1; x++) {
          const i = idx(x, y, z);

          // Buoyancy from the thermal perturbation.
          w[i] += theta[i] * 0.025 * capeFactor * DT;

          // Approximate cooling of rising parcels relative
          // to the environmental temperature profile.
          theta[i] -= w[i] * DT * 0.08;

          // Background vertical wind shear.
          const targetU =
            ((y / (NY - 1)) - 0.5) *
            shearFactor * 0.18;

          u[i] += (targetU - u[i]) * 0.025;

          // Weak damping prevents unbounded numerical growth.
          u[i] *= 0.997;
          v[i] *= 0.997;
          w[i] *= 0.996;

          // Condensate contributes a small buoyancy correction.
          w[i] += qc[i] * 0.3 * DT;

          theta[i] = clamp(theta[i], -12, 12);
          u[i] = clamp(u[i], -1.2, 1.2);
          v[i] = clamp(v[i], -1.2, 1.2);
          w[i] = clamp(w[i], -1.2, 1.8);
        }
      }
    }

    for (let z = 0; z < NZ; z++) {
      for (let x = 0; x < NX; x++) {
        w[idx(x, 0, z)] = 0;
        w[idx(x, NY - 1, z)] = 0;
      }
    }
  }


  // ==========================================================
  // CONDENSATION AND EVAPORATION
  // ==========================================================

  function updateMicrophysics() {
    for (let z = 1; z < NZ - 1; z++) {
      for (let y = 1; y < NY - 1; y++) {
        for (let x = 1; x < NX - 1; x++) {
          const i = idx(x, y, z);

          const temperature =
            environmentalTemperature(y) + theta[i];

          const qsat = saturationMixingRatio(temperature);

          if (qv[i] > qsat) {
            // Supersaturated vapor condenses.
            const condensed = (qv[i] - qsat) * 0.35;

            qv[i] -= condensed;
            qc[i] += condensed;

            // Latent heating; deliberately scaled for stability.
            theta[i] += condensed * 100;
          } else if (qc[i] > 0 && qv[i] < qsat * 0.94) {
            // Evaporation in subsaturated air.
            const evaporation = Math.min(
              qc[i],
              (qsat - qv[i]) * 0.025
            );

            qc[i] -= evaporation;
            qv[i] += evaporation;
            theta[i] -= evaporation * 60;
          }

          // Very weak dissipation of cloud water.
          qc[i] = Math.max(0, qc[i] - 0.0000002);

          qv[i] = clamp(qv[i], 0, 0.05);
          qc[i] = clamp(qc[i], 0, 0.015);
          theta[i] = clamp(theta[i], -12, 12);
        }
      }
    }
  }


  // ==========================================================
  // PARTICLE-BASED CLOUD RENDERING
  //
  // No cube surface, no raymarching through a box.
  // Every point corresponds to a grid cell.
  // Its density is driven by calculated cloud water qc.
  // ==========================================================

  const positions = new Float32Array(N * 3);
  const densities = new Float32Array(N);

  let p = 0;

  for (let z = 0; z < NZ; z++) {
    for (let y = 0; y < NY; y++) {
      for (let x = 0; x < NX; x++) {
        positions[p * 3] =
          (x / (NX - 1) - 0.5) * WORLD_X;

        positions[p * 3 + 1] =
          (y / (NY - 1)) * WORLD_Y;

        positions[p * 3 + 2] =
          (z / (NZ - 1) - 0.5) * WORLD_Z;

        p++;
      }
    }
  }

  const cloudGeometry = new THREE.BufferGeometry();

  cloudGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3)
  );

  cloudGeometry.setAttribute(
    "aDensity",
    new THREE.BufferAttribute(densities, 1)
  );

  cloudGeometry.attributes.position.setUsage(
    THREE.StaticDrawUsage
  );

  cloudGeometry.attributes.aDensity.setUsage(
    THREE.DynamicDrawUsage
  );

  const cloudMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,

    uniforms: {
      uPointScale: { value: 1.0 }
    },

    vertexShader: `
      attribute float aDensity;

      varying float vDensity;

      uniform float uPointScale;

      void main() {
        vDensity = aDensity;

        vec4 mvPosition =
          modelViewMatrix * vec4(position, 1.0);

        gl_Position = projectionMatrix * mvPosition;

        float density = clamp(aDensity, 0.0, 1.0);

        // Empty grid cells produce no visible points.
        gl_PointSize = density < 0.012
          ? 0.0
          : (2.0 + 7.0 * sqrt(density)) *
            uPointScale *
            clamp(32.0 / max(8.0, -mvPosition.z), 0.45, 2.0);
      }
    `,

    fragmentShader: `
      varying float vDensity;

      void main() {
        vec2 centered = gl_PointCoord - vec2(0.5);
        float r = length(centered);

        // Soft edges, with a dense central core.
        float edge = 1.0 - smoothstep(0.16, 0.50, r);

        float density = clamp(vDensity, 0.0, 1.0);

        float alpha =
          edge * clamp(density * 1.7, 0.0, 0.82);

        if (alpha < 0.012) discard;

        vec3 shadowColor = vec3(0.40, 0.46, 0.55);
        vec3 brightColor = vec3(0.96, 0.98, 1.00);

        vec3 color = mix(
          shadowColor,
          brightColor,
          clamp(density * 1.25, 0.0, 1.0)
        );

        gl_FragColor = vec4(color, alpha);
      }
    `
  });

  const cloudPoints = new THREE.Points(
    cloudGeometry,
    cloudMaterial
  );

  cloudPoints.frustumCulled = false;
  scene.add(cloudPoints);


  // ==========================================================
  // UPDATE CLOUD DISPLAY FROM MODEL DATA
  // ==========================================================

  function updateCloudDisplay() {
    cloudCellCount = 0;
    highestCloudCell = 0;

    for (let z = 0; z < NZ; z++) {
      for (let y = 0; y < NY; y++) {
        for (let x = 0; x < NX; x++) {
          const i = idx(x, y, z);

          // Scale cloud water into a visible density.
          const density = clamp(
            (qc[i] - 0.000001) * 4200,
            0,
            1
          );

          densities[i] = density;

          if (density > 0.025) {
            cloudCellCount++;
            highestCloudCell = Math.max(highestCloudCell, y);
          }
        }
      }
    }

    cloudGeometry.attributes.aDensity.needsUpdate = true;

    if (cellCountElement) {
      cellCountElement.textContent =
        String(cloudCellCount);
    }

    if (cloudHeightElement) {
      cloudHeightElement.textContent =
        cloudCellCount > 0
          ? `${(highestCloudCell * DY).toFixed(1)} km`
          : "—";
    }

    if (statusElement && !paused) {
      statusElement.textContent =
        cloudCellCount > 20
          ? "Конвекция развивается"
          : "Формирование восходящего потока";
    }
  }


  // ==========================================================
  // MODEL STEP
  // ==========================================================

  function modelStep() {
    // Advect momentum and thermodynamic fields.
    advect(u, un);
    advect(v, vn);
    advect(w, wn);

    advect(theta, thetan);
    advect(qv, qvn);
    advect(qc, qcn);

    u.set(un);
    v.set(vn);
    w.set(wn);

    theta.set(thetan);
    qv.set(qvn);
    qc.set(qcn);

    applyDynamics();
    updateMicrophysics();

    modelTime += DT;

    const type = stormType?.value || "random";

    let thermalInterval = 35;

    if (type === "tower") thermalInterval = 100;
    if (type === "supercell") thermalInterval = 70;
    if (type === "multicell") thermalInterval = 18;
    if (type === "squall") thermalInterval = 14;

    if (modelTime - lastThermalTime > thermalInterval) {
      if (type !== "tower") {
        selectThermalLocation();
      }

      addThermal(
        thermalX,
        thermalZ,
        0.8 + Math.random() * 0.35
      );

      lastThermalTime = modelTime;
    }
  }


  // ==========================================================
  // LIGHTNING
  // ==========================================================

  let lightning = null;
  let lightningEnd = 0;

  function makeLightning() {
    if (lightning) {
      scene.remove(lightning);
      lightning.geometry.dispose();
      lightning.material.dispose();
      lightning = null;
    }

    const cx =
      (thermalX / (NX - 1) - 0.5) * WORLD_X;

    const cz =
      (thermalZ / (NZ - 1) - 0.5) * WORLD_Z;

    const points = [];
    const segments = 18;

    let currentX = cx;
    let currentZ = cz;

    for (let i = 0; i <= segments; i++) {
      const y = WORLD_Y * (1 - i / segments);

      points.push(new THREE.Vector3(
        currentX,
        y,
        currentZ
      ));

      currentX += (Math.random() - 0.5) * 1.0;
      currentZ += (Math.random() - 0.5) * 1.0;
    }

    const geometry = new THREE.BufferGeometry()
      .setFromPoints(points);

    const material = new THREE.LineBasicMaterial({
      color: 0xc5e6ff,
      transparent: true,
      opacity: 1
    });

    lightning = new THREE.Line(geometry, material);
    scene.add(lightning);

    lightningEnd = performance.now() + 180;
  }


  // ==========================================================
  // RESET
  // ==========================================================

  function resetSimulation() {
    readControls();

    initializeAtmosphere();
    selectThermalLocation();

    // The thermal seeds air motion and moisture only.
    // Cloud particles appear when qc is produced by the model.
    addThermal(thermalX, thermalZ, 1.0);

    updateCloudDisplay();

    if (statusElement) {
      statusElement.textContent = "Модель запущена";
    }
  }

  $("newStorm")?.addEventListener("click", resetSimulation);

  $("pause")?.addEventListener("click", event => {
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

  $("lightning")?.addEventListener("click", makeLightning);

  $("reset")?.addEventListener("click", () => {
    camera.position.set(32, 22, 34);
    controls.target.set(0, 5.5, 0);
    controls.update();
  });

  stormType?.addEventListener("change", resetSimulation);


  // ==========================================================
  // INITIALIZE
  // ==========================================================

  initializeAtmosphere();
  selectThermalLocation();
  addThermal(thermalX, thermalZ, 1.0);
  updateCloudDisplay();

  if (loading) {
    loading.style.display = "none";
  }

  if (statusElement) {
    statusElement.textContent = "Модель работает";
  }


  // ==========================================================
  // RESIZE
  // ==========================================================

  function resize() {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height, false);

    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, 1.25)
    );
  }

  window.addEventListener("resize", resize);


  // ==========================================================
  // ANIMATION LOOP
  // ==========================================================

  let lastTime = performance.now();
  let accumulator = 0;

  function animate(now) {
    requestAnimationFrame(animate);

    const elapsed = Math.min(
      (now - lastTime) / 1000,
      0.05
    );

    lastTime = now;

    controls.update();

    if (!paused) {
      accumulator += elapsed;

      // Limit work per frame to avoid locking mobile Safari.
      let steps = 0;

      while (accumulator >= DT && steps < 1) {
        modelStep();
        accumulator -= DT;
        steps++;
      }

      frameNumber++;

      if (frameNumber % 2 === 0) {
        updateCloudDisplay();
      }
    }

    if (lightning && now >= lightningEnd) {
      scene.remove(lightning);
      lightning.geometry.dispose();
      lightning.material.dispose();
      lightning = null;
    }

    renderer.render(scene, camera);
  }

  requestAnimationFrame(animate);
}
