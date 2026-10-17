
import * as THREE from "https://esm.sh/three@0.180.0";
import { OrbitControls } from "https://esm.sh/three@0.180.0/examples/jsm/controls/OrbitControls.js";

// ============================================================
// QUANTUM METEO — PROCEDURAL THUNDERSTORM SIMULATOR
// sim.js — полный файл
// Объёмные процедурные облака, конвекция, наковальни, молнии.
// Модель визуальная, не полноценный атмосферный CFD-расчёт.
// ============================================================

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const mix = (a, b, t) => a + (b - a) * t;

const canvas = $("scene");

if (!canvas) {
  throw new Error('Не найден canvas с id="scene".');
}

const loading = $("loading");
const loadingTitle = $("loadingTitle");
const loadingText = $("loadingText");

function setLoading(title, message) {
  if (loadingTitle) loadingTitle.textContent = title;
  if (loadingText) loadingText.textContent = message;
}

function hideLoading() {
  if (loading) loading.style.display = "none";
}

function showError(error) {
  console.error("[Quantum Meteo]", error);

  if (loading) loading.style.display = "flex";
  setLoading(
    "Ошибка симуляции",
    error?.message || String(error) || "Неизвестная ошибка"
  );

  const details = $("errorDetails");
  if (details) {
    details.textContent = error?.stack || String(error);
    details.style.display = "block";
  }
}

window.showStormError = showError;

setLoading("Загрузка симуляции", "Создание атмосферы и объёмных облаков…");

// ============================================================
// RENDERER
// ============================================================

let renderer;

try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
    logarithmicDepthBuffer: false
  });
} catch (error) {
  showError(
    new Error(
      "Не удалось создать WebGL-контекст. Проверь поддержку WebGL в браузере. " +
      (error?.message || "")
    )
  );
  throw error;
}

renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9dbbd0);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  5000
);

camera.position.set(0, 78, 155);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 38, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.minDistance = 25;
controls.maxDistance = 650;
controls.maxPolarAngle = Math.PI * 0.495;

// ============================================================
// LIGHTING
// ============================================================

const hemisphere = new THREE.HemisphereLight(
  0xd9eaff,
  0x343b36,
  1.45
);
scene.add(hemisphere);

const sunlight = new THREE.DirectionalLight(0xffedcf, 3.1);
sunlight.position.set(-180, 240, -240);
scene.add(sunlight);

const fillLight = new THREE.DirectionalLight(0x91b8df, 0.65);
fillLight.position.set(140, 90, 100);
scene.add(fillLight);

// ============================================================
// ATMOSPHERIC SKY
// ============================================================

const skyGeometry = new THREE.SphereGeometry(1800, 32, 20);

const skyMaterial = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  uniforms: {
    uSunDirection: {
      value: new THREE.Vector3(-0.45, 0.65, -0.6).normalize()
    },
    uTime: { value: 0 }
  },
  vertexShader: `
    varying vec3 vDirection;

    void main() {
      vDirection = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    varying vec3 vDirection;
    uniform vec3 uSunDirection;
    uniform float uTime;

    void main() {
      vec3 dir = normalize(vDirection);
      float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);

      vec3 horizon = vec3(0.70, 0.80, 0.86);
      vec3 zenith = vec3(0.12, 0.34, 0.57);

      vec3 sky = mix(horizon, zenith, smoothstep(0.05, 0.88, h));

      float sunDot = max(dot(dir, normalize(uSunDirection)), 0.0);
      float halo = pow(sunDot, 9.0) * 0.12;
      float sunGlow = pow(sunDot, 90.0) * 0.6;

      sky += vec3(1.0, 0.78, 0.48) * halo;
      sky += vec3(1.0, 0.94, 0.78) * sunGlow;

      float lowerHaze = 1.0 - smoothstep(-0.1, 0.25, dir.y);
      sky = mix(sky, vec3(0.65, 0.72, 0.73), lowerHaze * 0.24);

      gl_FragColor = vec4(sky, 1.0);
    }
  `
});

const sky = new THREE.Mesh(skyGeometry, skyMaterial);
sky.frustumCulled = false;
scene.add(sky);

// Sun disk
const sun = new THREE.Mesh(
  new THREE.SphereGeometry(9, 20, 16),
  new THREE.MeshBasicMaterial({ color: 0xfff1c6 })
);

sun.position.set(-650, 410, -850);
scene.add(sun);

// ============================================================
// TERRAIN
// ============================================================

const groundGeometry = new THREE.PlaneGeometry(2200, 2200, 1, 1);

const groundMaterial = new THREE.MeshStandardMaterial({
  color: 0x596d4d,
  roughness: 1,
  metalness: 0
});

const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.7;
ground.receiveShadow = true;
scene.add(ground);

// Distant terrain bands
const terrainMaterial = new THREE.MeshStandardMaterial({
  color: 0x657363,
  roughness: 1
});

for (let i = 0; i < 9; i++) {
  const radius = 280 + i * 65;
  const height = rand(5, 15);
  const ring = new THREE.Mesh(
    new THREE.CylinderGeometry(
      radius * 0.92,
      radius,
      height,
      64,
      1,
      true
    ),
    terrainMaterial
  );

  ring.position.y = -3 - i * 0.35;
  ring.scale.z = rand(0.72, 1.3);
  scene.add(ring);
}

// Small procedural vegetation
const grassGeometry = new THREE.ConeGeometry(0.24, 1.5, 3);
grassGeometry.translate(0, 0.75, 0);

const grassMaterial = new THREE.MeshStandardMaterial({
  color: 0x3f5939,
  roughness: 1
});

const grassCount = 2600;
const grass = new THREE.InstancedMesh(
  grassGeometry,
  grassMaterial,
  grassCount
);

const dummy = new THREE.Object3D();

for (let i = 0; i < grassCount; i++) {
  const x = rand(-540, 540);
  const z = rand(-540, 540);
  const s = rand(0.35, 1.8);

  dummy.position.set(x, -0.65, z);
  dummy.rotation.set(
    rand(-0.08, 0.08),
    rand(0, Math.PI * 2),
    rand(-0.08, 0.08)
  );
  dummy.scale.set(s, s, s);
  dummy.updateMatrix();
  grass.setMatrixAt(i, dummy.matrix);
}

grass.instanceMatrix.needsUpdate = true;
scene.add(grass);

// ============================================================
// ENVIRONMENT PARAMETERS
// ============================================================

function environment() {
  const cape = Number($("cape")?.value ?? 1800);
  const shear = Number($("shear")?.value ?? 20);
  const humidity = Number($("humidity")?.value ?? 70);

  const instability = clamp(cape / 2500, 0.05, 1.8);
  const moisture = clamp(humidity / 100, 0.05, 1);
  const lcl = 27 + (100 - humidity) * 0.48;

  return {
    cape,
    shear,
    humidity,
    instability,
    moisture,
    lcl
  };
}

function updateSliderLabels() {
  const cape = $("cape");
  const shear = $("shear");
  const humidity = $("humidity");

  if ($("capeValue") && cape) {
    $("capeValue").textContent = cape.value;
  }

  if ($("shearValue") && shear) {
    $("shearValue").textContent = shear.value;
  }

  if ($("humidityValue") && humidity) {
    $("humidityValue").textContent = humidity.value + "%";
  }
}

["cape", "shear", "humidity"].forEach((id) => {
  $(id)?.addEventListener("input", updateSliderLabels);
});

updateSliderLabels();

// ============================================================
// CLOUD VOLUME SHADER
// ============================================================

const cloudVertexShader = `
  varying vec3 vPosition;

  void main() {
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const cloudFragmentShader = `
  precision highp float;

  varying vec3 vPosition;

  uniform vec3 uCameraLocal;
  uniform vec3 uSunDirection;
  uniform vec3 uCloudColor;
  uniform vec3 uShadowColor;
  uniform float uTime;
  uniform float uCoverage;
  uniform float uTurbulence;
  uniform float uDensity;
  uniform float uAnvil;
  uniform float uSeed;

  float hash31(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);

    f = f * f * (3.0 - 2.0 * f);

    float n000 = hash31(i + vec3(0.0, 0.0, 0.0));
    float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash31(i + vec3(1.0, 1.0, 1.0));

    float x00 = mix(n000, n100, f.x);
    float x10 = mix(n010, n110, f.x);
    float x01 = mix(n001, n101, f.x);
    float x11 = mix(n011, n111, f.x);

    return mix(
      mix(x00, x10, f.y),
      mix(x01, x11, f.y),
      f.z
    );
  }

  float fbm(vec3 p) {
    float sum = 0.0;
    float amplitude = 0.53;

    for (int i = 0; i < 4; i++) {
      sum += amplitude * noise3(p);
      p *= 2.03;
      amplitude *= 0.49;
    }

    return sum;
  }

  float cloudDensity(vec3 p) {
    float h = (p.y + 1.0) * 0.5;

    if (h <= 0.0 || h >= 1.0) {
      return 0.0;
    }

    float verticalProfile = smoothstep(0.0, 0.12, h);
    verticalProfile *= 1.0 - smoothstep(0.78, 1.0, h);

    // Рост радиуса вверх формирует башню, а не идеальный шар.
    float radius = mix(0.45, 0.83, smoothstep(0.03, 0.72, h));

    // Верхняя часть расширяется при формировании наковальни.
    float anvilProfile = smoothstep(0.57, 0.95, h) * uAnvil;
    radius += anvilProfile * 0.27;

    vec2 horizontal = p.xz;
    horizontal.x += sin(h * 8.0 + uSeed) * 0.045;
    horizontal.y += cos(h * 6.0 + uSeed) * 0.04;

    float r = length(horizontal);
    float edge = radius - r;

    vec3 q = p * 3.6;
    q.xz += vec2(uTime * 0.012, -uTime * 0.009);
    q += vec3(uSeed, uSeed * 0.7, uSeed * 1.3);

    float low = fbm(q);
    float high = fbm(q * 2.4 + vec3(4.2, 1.3, 2.7));

    float displacement = (low - 0.42) * uTurbulence * 0.48;
    displacement += (high - 0.5) * uTurbulence * 0.13;

    float shape = smoothstep(-0.15, 0.20, edge + displacement);
    shape *= verticalProfile;

    // Небольшая неоднородность внутри объёма.
    float interior = mix(0.66, 1.0, smoothstep(0.22, 0.78, low));
    float d = shape * interior * uDensity;

    // Разреженная наковальня в верхней части облака.
    if (uAnvil > 0.01) {
      float anvilWidth = 0.56 + anvilProfile * 0.7;
      float anvilEdge = anvilWidth - abs(p.x);
      anvilEdge = min(anvilEdge, anvilWidth - abs(p.z) * 0.75);

      float anvilShape = smoothstep(-0.12, 0.16, anvilEdge);
      anvilShape *= smoothstep(0.53, 0.76, h);
      anvilShape *= 1.0 - smoothstep(0.91, 1.0, h);

      d = max(d, anvilShape * uAnvil * 0.56 * low);
    }

    return clamp(d, 0.0, 1.0);
  }

  void main() {
    // Камера находится снаружи куба. Луч идёт от передней грани
    // внутрь объёма, а не от камеры через всю сцену.
    vec3 ray = normalize(vPosition - uCameraLocal);
    vec3 p = vPosition;

    vec3 accumulated = vec3(0.0);
    float transmittance = 1.0;

    const int STEPS = 64;
    float stepLength = 0.03125;

    vec3 lightDir = normalize(uSunDirection);

    for (int i = 0; i < STEPS; i++) {
      float d = cloudDensity(p);

      if (d > 0.005) {
        // Приближённое самозатенение в направлении солнца.
        float shadow = 0.0;
        shadow += cloudDensity(p + lightDir * 0.11) * 0.35;
        shadow += cloudDensity(p + lightDir * 0.24) * 0.27;
        shadow += cloudDensity(p + lightDir * 0.42) * 0.18;

        float lighting = clamp(1.0 - shadow * 0.85, 0.18, 1.0);
        float height = clamp((p.y + 1.0) * 0.5, 0.0, 1.0);

        float sunFacing = clamp(dot(normalize(vec3(0.25, 1.0, 0.2)), lightDir), 0.0, 1.0);
        float topLight = smoothstep(0.25, 0.88, height) * sunFacing;

        vec3 cloudColor = mix(uShadowColor, uCloudColor, lighting);
        cloudColor = mix(cloudColor, vec3(1.0, 0.94, 0.82), topLight * 0.72);

        float alpha = 1.0 - exp(-d * stepLength * 9.0);
        alpha *= transmittance;

        accumulated += cloudColor * alpha;
        transmittance *= 1.0 - alpha;

        if (transmittance < 0.025) {
          break;
        }
      }

      p += ray * stepLength;

      // Луч завершил прохождение через локальный куб.
      if (
        p.x < -1.05 || p.x > 1.05 ||
        p.y < -1.05 || p.y > 1.05 ||
        p.z < -1.05 || p.z > 1.05
      ) {
        break;
      }
    }

    float alpha = 1.0 - transmittance;

    if (alpha < 0.012) {
      discard;
    }

    gl_FragColor = vec4(accumulated / max(alpha, 0.001), alpha);
  }
`;

// ============================================================
// CLOUD CELLS
// ============================================================

const cells = [];
const cloudGroup = new THREE.Group();
scene.add(cloudGroup);

let nextCellId = 1;
let simulationTime = 0;
let spawnTimer = 0;
let paused = false;
let lightningEnabled = true;
let lightningTimer = 0;
let lightningLife = 0;
let activeStormType = "random";

function makeCloudVolume(seed) {
  const geometry = new THREE.BoxGeometry(2, 2, 2);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uCameraLocal: { value: new THREE.Vector3() },
      uSunDirection: {
        value: sunlight.position.clone().normalize()
      },
      uCloudColor: { value: new THREE.Color(0xf4f5f4) },
      uShadowColor: { value: new THREE.Color(0x4a5869) },
      uTime: { value: 0 },
      uCoverage: { value: 1 },
      uTurbulence: { value: 1 },
      uDensity: { value: 1 },
      uAnvil: { value: 0 },
      uSeed: { value: seed }
    },
    vertexShader: cloudVertexShader,
    fragmentShader: cloudFragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.FrontSide,
    blending: THREE.NormalBlending
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;

  return mesh;
}

function createCell(options = {}) {
  const env = environment();

  const seed = rand(0, 1000);
  const mesh = makeCloudVolume(seed);

  const cell = {
    id: nextCellId++,
    mesh,
    age: options.age ?? 32,
    seed,
    energy: options.energy ?? rand(0.65, 1.15),
    width: options.width ?? rand(18, 27),
    depth: options.depth ?? rand(17, 26),
    height: options.height ?? rand(46, 66),
    x: options.x ?? rand(-38, 38),
    z: options.z ?? rand(-30, 30),
    driftX: rand(-0.5, 0.5),
    driftZ: rand(-0.35, 0.35),
    lifetime: rand(240, 420),
    mature: 0,
    anvil: 0,
    phase: "growing",
    lightningCooldown: rand(5, 18),
    base: env.lcl,
    alive: true
  };

  mesh.position.set(cell.x, cell.base + 0.5, cell.z);
  mesh.scale.set(0.1, 0.1, 0.1);
  cloudGroup.add(mesh);
  cells.push(cell);

  return cell;
}

function removeCell(cell) {
  cell.alive = false;

  cloudGroup.remove(cell.mesh);
  cell.mesh.geometry.dispose();
  cell.mesh.material.dispose();

  const index = cells.indexOf(cell);
  if (index !== -1) cells.splice(index, 1);
}

function updateCell(cell, dt) {
  const env = environment();

  cell.age += dt;
  cell.lightningCooldown -= dt;

  const growthTime = 75 / Math.max(0.35, env.instability);
  const mature = clamp(cell.age / growthTime, 0, 1);

  cell.mature = mature;

  const decayStart = cell.lifetime * 0.72;
  const decay = clamp(
    (cell.age - decayStart) / Math.max(1, cell.lifetime - decayStart),
    0,
    1
  );

  const growth = Math.sin(mature * Math.PI * 0.5);
  const energy = cell.energy * (1.0 - decay * 0.72);

  const towerHeight =
    cell.height *
    growth *
    (0.58 + env.instability * 0.32) *
    (0.65 + env.moisture * 0.35) *
    energy;

  const width = cell.width * (0.55 + growth * 0.55);
  const depth = cell.depth * (0.55 + growth * 0.55);

  cell.anvil = clamp(
    (mature - 0.62) * 3.4 + env.shear / 100,
    0,
    1
  );

  if (decay > 0.82) {
    cell.phase = "dissipating";
  } else if (mature > 0.9) {
    cell.phase = "mature";
  } else {
    cell.phase = "growing";
  }

  cell.x += cell.driftX * dt * (0.5 + env.shear / 25);
  cell.z += cell.driftZ * dt;

  // Постепенный снос верхней части ветром.
  const anvilOffset = cell.anvil * env.shear * 0.08;

  cell.mesh.position.set(
    cell.x + anvilOffset,
    cell.base + Math.max(3, towerHeight * 0.5),
    cell.z
  );

  // Масштаб не нулевой, чтобы не получить вырожденную геометрию.
  cell.mesh.scale.set(
    Math.max(1.5, width),
    Math.max(4, towerHeight * 0.5),
    Math.max(1.5, depth)
  );

  const uniforms = cell.mesh.material.uniforms;

  uniforms.uTime.value = simulationTime + cell.seed;
  uniforms.uTurbulence.value = 0.8 + env.instability * 0.48;
  uniforms.uDensity.value = 0.85 + env.moisture * 0.55;
  uniforms.uAnvil.value = cell.anvil;
  uniforms.uCoverage.value = env.moisture;

  const stormDarkness = clamp(
    0.28 + env.moisture * 0.25 + env.instability * 0.14,
    0.15,
    0.75
  );

  uniforms.uShadowColor.value.setRGB(
    0.19 - stormDarkness * 0.05,
    0.23 - stormDarkness * 0.06,
    0.29 - stormDarkness * 0.04
  );

  uniforms.uCloudColor.value.setRGB(
    0.91 - decay * 0.08,
    0.92 - decay * 0.08,
    0.91 - decay * 0.06
  );

  if (cell.phase === "dissipating") {
    uniforms.uDensity.value *= 1.0 - decay * 0.4;
  }

  if (cell.age > cell.lifetime) {
    removeCell(cell);
    return;
  }

  // Электрическая активность возрастает в зрелой ячейке.
  const electricalPotential =
    env.instability *
    env.moisture *
    mature *
    (0.45 + env.shear / 60);

  if (
    lightningEnabled &&
    electricalPotential > 0.35 &&
    cell.lightningCooldown <= 0 &&
    Math.random() < dt * 0.13 * electricalPotential
  ) {
    createLightning(cell);
    cell.lightningCooldown = rand(4, 16);
  }
}

// ============================================================
// STORM GENERATION
// ============================================================

function chooseStormType() {
  const selected = $("stormType")?.value || "random";

  if (selected !== "random") {
    return selected;
  }

  const choices = ["tower", "supercell", "multicell", "squall"];
  return choices[Math.floor(Math.random() * choices.length)];
}

function generateStorm() {
  clearCells();

  activeStormType = chooseStormType();

  const env = environment();
  const count = activeStormType === "multicell"
    ? Math.floor(rand(3, 6))
    : activeStormType === "squall"
      ? Math.floor(rand(4, 8))
      : activeStormType === "supercell"
        ? 1
        : Math.floor(rand(1, 3));

  for (let i = 0; i < count; i++) {
    let x = rand(-45, 45);
    let z = rand(-30, 30);

    if (activeStormType === "squall") {
      x = (i - (count - 1) / 2) * rand(18, 28);
      z = rand(-12, 12);
    }

    createCell({
      x,
      z,
      age: rand(25, 70),
      energy: rand(0.7, 1.15) * (0.75 + env.instability * 0.2),
      width: activeStormType === "supercell" ? rand(28, 36) : rand(17, 27),
      depth: activeStormType === "supercell" ? rand(26, 34) : rand(17, 27),
      height: activeStormType === "supercell" ? rand(62, 78) : rand(45, 65)
    });
  }

  spawnTimer = rand(8, 20);
  updateMetrics();
}

function clearCells() {
  for (const cell of [...cells]) {
    removeCell(cell);
  }
}

function resetSimulation() {
  simulationTime = 0;
  spawnTimer = 0;
  lightningTimer = 0;
  lightningLife = 0;

  clearLightning();

  // Каждый сброс создаёт новые случайные ячейки.
  generateStorm();
}

function updateFormation(dt) {
  const env = environment();

  spawnTimer -= dt;

  if (spawnTimer > 0) return;
  if (cells.length >= 8) {
    spawnTimer = 6;
    return;
  }

  const chance =
    0.25 +
    env.instability * 0.25 +
    env.moisture * 0.35;

  if (Math.random() < chance) {
    const newCell = createCell({
      x: rand(-85, 85),
      z: rand(-70, 70),
      age: rand(0, 10),
      energy: rand(0.45, 1.0),
      width: rand(14, 23),
      depth: rand(14, 22),
      height: rand(40, 60)
    });

    newCell.base = env.lcl;
  }

  spawnTimer = rand(7, 20) / Math.max(0.5, env.instability);
}

// ============================================================
// LIGHTNING
// ============================================================

const lightningGroup = new THREE.Group();
scene.add(lightningGroup);

const lightningMaterial = new THREE.LineBasicMaterial({
  color: 0xe8f5ff,
  transparent: true,
  opacity: 1,
  depthWrite: false
});

let lightningBolts = [];

function makeBoltPoints(start, end, segments = 18, spread = 2.8) {
  const points = [];
  const delta = end.clone().sub(start);

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const point = start.clone().addScaledVector(delta, t);

    if (i !== 0 && i !== segments) {
      const taper = Math.sin(Math.PI * t);
      point.x += rand(-spread, spread) * taper;
      point.z += rand(-spread, spread) * taper;
    }

    points.push(point);
  }

  return points;
}

function createLightning(cell) {
  clearLightning();

  const start = new THREE.Vector3(
    cell.x + rand(-3, 3),
    cell.base + cell.height * cell.mature * 0.9,
    cell.z
  );

  const end = new THREE.Vector3(
    start.x + rand(-25, 25),
    0.1,
    start.z + rand(-25, 25)
  );

  const points = makeBoltPoints(start, end, 22, 3.5);
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const line = new THREE.Line(geometry, lightningMaterial.clone());

  lightningGroup.add(line);
  lightningBolts.push({
    line,
    life: rand(0.08, 0.22),
    maxLife: 0.22
  });

  lightningLife = 0.12;

  // Короткая вспышка освещает сцену.
  const flash = new THREE.PointLight(0xb9dfff, 0, 180, 2);
  flash.position.copy(start);
  scene.add(flash);

  lightningBolts.push({
    line: flash,
    life: 0.13,
    maxLife: 0.13,
    isLight: true
  });
}

function clearLightning() {
  for (const item of lightningBolts) {
    lightningGroup.remove(item.line);

    if (item.isLight) {
      scene.remove(item.line);
    }

    item.line.geometry?.dispose?.();
    item.line.material?.dispose?.();
  }

  lightningBolts = [];
}

function updateLightning(dt) {
  for (const bolt of [...lightningBolts]) {
    bolt.life -= dt;

    if (bolt.isLight) {
      bolt.line.intensity = Math.max(0, bolt.life / bolt.maxLife) * 18;
    } else {
      bolt.line.material.opacity = Math.max(0, bolt.life / bolt.maxLife);
    }

    if (bolt.life <= 0) {
      if (bolt.isLight) {
        scene.remove(bolt.line);
      } else {
        lightningGroup.remove(bolt.line);
      }

      bolt.line.geometry?.dispose?.();
      bolt.line.material?.dispose?.();

      lightningBolts.splice(lightningBolts.indexOf(bolt), 1);
    }
  }

  lightningTimer -= dt;
}

// ============================================================
// UI METRICS
// ============================================================

function updateMetrics() {
  const env = environment();

  if ($("cellCount")) {
    $("cellCount").textContent = String(cells.length);
  }

  const highest = cells.reduce((max, cell) => {
    return Math.max(max, cell.base + cell.height * cell.mature);
  }, 0);

  if ($("cloudHeight")) {
    // Значение — условная высота в единицах симуляции,
    // а не точное измерение в метрах.
    $("cloudHeight").textContent = highest > 0
      ? Math.round(highest * 100) + " м"
      : "—";
  }

  if ($("status")) {
    if (paused) {
      $("status").textContent = "Пауза";
    } else if (!cells.length) {
      $("status").textContent = "Формирование";
    } else if (cells.some((c) => c.phase === "mature")) {
      $("status").textContent = "Зрелая конвекция";
    } else {
      $("status").textContent = "Развитие";
    }
  }

  // Параметры окружения читаются на каждом кадре,
  // чтобы изменение ползунков влияло на облака.
  void env;
}

// ============================================================
// CAMERA-LOCAL UNIFORMS
// ============================================================

const cameraWorldPosition = new THREE.Vector3();

function updateCloudCameraUniforms() {
  camera.getWorldPosition(cameraWorldPosition);

  for (const cell of cells) {
    const material = cell.mesh.material;
    const localCamera = cell.mesh.worldToLocal(
      cameraWorldPosition.clone()
    );

    material.uniforms.uCameraLocal.value.copy(localCamera);

    const sunDirection = sunlight.position.clone().normalize();
    material.uniforms.uSunDirection.value.copy(
      cell.mesh.worldToLocal(
        cell.mesh.position.clone().add(sunDirection)
      ).sub(cell.mesh.worldToLocal(cell.mesh.position.clone())).normalize()
    );
  }
}

// ============================================================
// CONTROLS
// ============================================================

$("newStorm")?.addEventListener("click", () => {
  generateStorm();
});

$("reset")?.addEventListener("click", () => {
  resetSimulation();
});

$("pause")?.addEventListener("click", () => {
  paused = !paused;

  const button = $("pause");
  if (button) {
    button.textContent = paused ? "Продолжить" : "Пауза";
  }

  updateMetrics();
});

$("lightning")?.addEventListener("click", () => {
  lightningEnabled = !lightningEnabled;

  const button = $("lightning");
  if (button) {
    button.style.opacity = lightningEnabled ? "1" : "0.55";
  }

  if (!lightningEnabled) {
    clearLightning();
  }
});

$("stormType")?.addEventListener("change", () => {
  // Тип применяется при генерации новой грозы.
});

// ============================================================
// RESIZE
// ============================================================

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener("resize", onResize);

// ============================================================
// MAIN LOOP
// ============================================================

let previousTime = performance.now();
let metricTimer = 0;
let animationStarted = false;

function animate(now) {
  requestAnimationFrame(animate);

  const dt = Math.min((now - previousTime) / 1000, 0.05);
  previousTime = now;

  controls.update();

  // Небо следует за камерой, чтобы сфера не заканчивалась у горизонта.
  sky.position.copy(camera.position);

  if (!paused) {
    simulationTime += dt;

    skyMaterial.uniforms.uTime.value = simulationTime;

    updateFormation(dt);

    for (const cell of [...cells]) {
      updateCell(cell, dt);
    }

    updateLightning(dt);

    metricTimer += dt;
    if (metricTimer >= 0.35) {
      updateMetrics();
      metricTimer = 0;
    }
  }

  updateCloudCameraUniforms();

  try {
    renderer.render(scene, camera);
  } catch (error) {
    if (!animationStarted) {
      showError(error);
    }
    console.error("[Quantum Meteo render]", error);
  }
}

// ============================================================
// STARTUP
// ============================================================

function startSimulation() {
  try {
    // Начальная ячейка появляется сразу — не нужно ждать роста с нуля.
    generateStorm();

    updateMetrics();
    hideLoading();

    animationStarted = true;
    requestAnimationFrame(animate);
  } catch (error) {
    showError(error);
  }
}

startSimulation();
