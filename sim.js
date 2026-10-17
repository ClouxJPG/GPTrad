
import * as THREE from "https://esm.sh/three@0.180.0";
import { OrbitControls } from "https://esm.sh/three@0.180.0/examples/jsm/controls/OrbitControls.js";

// ============================================================
// QUANTUM METEO — CONVECTIVE STORM SIMULATOR
// Procedural volumetric clouds, gradual growth and storm evolution
// ============================================================

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const mix = (a, b, t) => a + (b - a) * t;

const canvas = $("scene");
if (!canvas) throw new Error('Не найден canvas #scene');

function showStormError(error) {
  console.error("[Quantum Meteo]", error);
  const loading = $("loading");
  if (loading) loading.style.display = "flex";
  if ($("loadingTitle")) $("loadingTitle").textContent = "Ошибка симуляции";
  if ($("loadingText")) $("loadingText").textContent = error?.message || String(error);
  if ($("errorDetails")) {
    $("errorDetails").textContent = error?.stack || String(error);
    $("errorDetails").style.display = "block";
  }
}
window.showStormError = showStormError;

// ============================================================
// RENDERER
// ============================================================

let renderer;

try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance"
  });
} catch (error) {
  showStormError(new Error("WebGL не удалось запустить: " + error.message));
  throw error;
}

renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9bbbd3);

const camera = new THREE.PerspectiveCamera(
  53,
  window.innerWidth / window.innerHeight,
  0.1,
  5000
);

camera.position.set(0, 76, 155);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 39, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.minDistance = 20;
controls.maxDistance = 650;
controls.maxPolarAngle = Math.PI * 0.495;

// ============================================================
// LIGHT
// ============================================================

scene.add(new THREE.HemisphereLight(0xd9eaff, 0x41413d, 1.25));

const sunlight = new THREE.DirectionalLight(0xffedcf, 3.0);
sunlight.position.set(-180, 240, -240);
scene.add(sunlight);

const fillLight = new THREE.DirectionalLight(0x91b9e2, 0.5);
fillLight.position.set(140, 100, 100);
scene.add(fillLight);

// ============================================================
// SKY
// ============================================================

const skyMaterial = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  uniforms: {
    uSun: { value: new THREE.Vector3(-0.45, 0.65, -0.6).normalize() }
  },
  vertexShader: `
    varying vec3 vDir;
    void main() {
      vDir = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    varying vec3 vDir;
    uniform vec3 uSun;

    void main() {
      vec3 d = normalize(vDir);
      float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);

      vec3 horizon = vec3(0.72, 0.81, 0.86);
      vec3 zenith = vec3(0.14, 0.36, 0.60);
      vec3 col = mix(horizon, zenith, smoothstep(0.06, 0.92, h));

      float sunDot = max(dot(d, normalize(uSun)), 0.0);
      col += vec3(1.0, 0.76, 0.48) * pow(sunDot, 9.0) * 0.10;
      col += vec3(1.0, 0.94, 0.78) * pow(sunDot, 100.0) * 0.6;

      float haze = 1.0 - smoothstep(-0.1, 0.28, d.y);
      col = mix(col, vec3(0.68, 0.75, 0.76), haze * 0.22);

      gl_FragColor = vec4(col, 1.0);
    }
  `
});

const sky = new THREE.Mesh(
  new THREE.SphereGeometry(1800, 32, 20),
  skyMaterial
);
sky.frustumCulled = false;
scene.add(sky);

const sunDisk = new THREE.Mesh(
  new THREE.SphereGeometry(8, 24, 18),
  new THREE.MeshBasicMaterial({ color: 0xfff1cc })
);
sunDisk.position.set(-650, 410, -850);
scene.add(sunDisk);

// ============================================================
// GROUND
// ============================================================

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(2200, 2200),
  new THREE.MeshStandardMaterial({
    color: 0x596d4d,
    roughness: 1
  })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.7;
ground.receiveShadow = true;
scene.add(ground);

const grassGeometry = new THREE.ConeGeometry(0.22, 1.2, 3);
grassGeometry.translate(0, 0.6, 0);

const grass = new THREE.InstancedMesh(
  grassGeometry,
  new THREE.MeshStandardMaterial({ color: 0x405a39, roughness: 1 }),
  2200
);

const dummy = new THREE.Object3D();

for (let i = 0; i < grass.count; i++) {
  const s = rand(0.4, 1.7);
  dummy.position.set(rand(-530, 530), -0.65, rand(-530, 530));
  dummy.rotation.set(0, rand(0, Math.PI * 2), 0);
  dummy.scale.set(s, s, s);
  dummy.updateMatrix();
  grass.setMatrixAt(i, dummy.matrix);
}

grass.instanceMatrix.needsUpdate = true;
scene.add(grass);

// ============================================================
// ENVIRONMENT
// ============================================================

function environment() {
  const cape = Number($("cape")?.value ?? 1800);
  const shear = Number($("shear")?.value ?? 20);
  const humidity = Number($("humidity")?.value ?? 70);

  return {
    cape,
    shear,
    humidity,
    instability: clamp(cape / 2500, 0.05, 1.8),
    moisture: clamp(humidity / 100, 0.05, 1),
    lcl: 27 + (100 - humidity) * 0.48
  };
}

function updateSliderLabels() {
  if ($("capeValue") && $("cape")) {
    $("capeValue").textContent = $("cape").value;
  }
  if ($("shearValue") && $("shear")) {
    $("shearValue").textContent = $("shear").value;
  }
  if ($("humidityValue") && $("humidity")) {
    $("humidityValue").textContent = $("humidity").value + "%";
  }
}

["cape", "shear", "humidity"].forEach(id => {
  $(id)?.addEventListener("input", updateSliderLabels);
});
updateSliderLabels();

// ============================================================
// VOLUMETRIC CLOUD SHADER
// Main changes:
// - sharper cloud boundaries
// - larger-scale cauliflower lobes
// - fine turbulent detail
// - denser interiors and darker bases
// - anvil forms gradually rather than appearing instantly
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
  uniform vec3 uLitColor;
  uniform vec3 uShadowColor;
  uniform float uTime;
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

    float a = hash31(i);
    float b = hash31(i + vec3(1.0, 0.0, 0.0));
    float c = hash31(i + vec3(0.0, 1.0, 0.0));
    float d = hash31(i + vec3(1.0, 1.0, 0.0));
    float e = hash31(i + vec3(0.0, 0.0, 1.0));
    float f1 = hash31(i + vec3(1.0, 0.0, 1.0));
    float g = hash31(i + vec3(0.0, 1.0, 1.0));
    float h = hash31(i + vec3(1.0, 1.0, 1.0));

    float x0 = mix(a, b, f.x);
    float x1 = mix(c, d, f.x);
    float x2 = mix(e, f1, f.x);
    float x3 = mix(g, h, f.x);

    return mix(mix(x0, x1, f.y), mix(x2, x3, f.y), f.z);
  }

  float fbm(vec3 p) {
    float sum = 0.0;
    float amplitude = 0.53;

    for (int i = 0; i < 5; i++) {
      sum += noise3(p) * amplitude;
      p *= 2.02;
      amplitude *= 0.48;
    }

    return sum;
  }

  float densityAt(vec3 p) {
    float h = (p.y + 1.0) * 0.5;

    if (h <= 0.0 || h >= 1.0) return 0.0;

    // Lower part is broad; the tower narrows and breaks into lobes upward.
    float baseProfile = smoothstep(0.015, 0.10, h);
    float topProfile = 1.0 - smoothstep(0.91, 1.0, h);
    float vertical = baseProfile * topProfile;

    float radius = mix(0.39, 0.68, smoothstep(0.03, 0.8, h));
    radius += 0.07 * sin(h * 17.0 + uSeed);
    radius += 0.045 * sin(h * 29.0 + uSeed * 1.7);

    // Mature anvil expands the upper cloud horizontally.
    float anvilBand = smoothstep(0.56, 0.82, h) * uAnvil;
    radius += anvilBand * 0.34;

    vec2 xz = p.xz;
    xz.x += sin(h * 8.0 + uSeed) * 0.035;
    xz.y += cos(h * 7.0 + uSeed * 0.8) * 0.035;

    float radial = length(xz);
    float edge = radius - radial;

    vec3 q = p * 3.3;
    q.x += uSeed;
    q.y += uSeed * 0.43;
    q.z += uSeed * 0.79;
    q.xz += vec2(uTime * 0.010, -uTime * 0.007);

    // Low-frequency noise forms large cauliflower lobes.
    float large = fbm(q * 0.75);
    // Higher-frequency noise breaks the outline into smaller protrusions.
    float fine = fbm(q * 2.8 + vec3(7.1, 2.4, 5.6));
    float detail = noise3(q * 7.0 + vec3(1.3, 8.2, 4.1));

    float displacement = (large - 0.48) * 0.47 * uTurbulence;
    displacement += (fine - 0.5) * 0.19 * uTurbulence;
    displacement += (detail - 0.5) * 0.055 * uTurbulence;

    // Narrow transition preserves detail instead of producing a soft blob.
    float shape = smoothstep(-0.025, 0.075, edge + displacement);
    shape *= vertical;

    // Internal density variations; keep the core opaque enough to read as cloud.
    float interior = mix(0.78, 1.0, smoothstep(0.18, 0.75, large));
    float d = shape * interior * uDensity;

    // Thin, spreading anvil at the upper levels.
    if (uAnvil > 0.01) {
      float anvilWidth = 0.52 + anvilBand * 0.75;
      float sideEdge = anvilWidth - abs(p.x);
      sideEdge = min(sideEdge, anvilWidth - abs(p.z) * 0.82);

      float anvilShape = smoothstep(-0.035, 0.08, sideEdge);
      anvilShape *= smoothstep(0.57, 0.76, h);
      anvilShape *= 1.0 - smoothstep(0.89, 0.98, h);
      anvilShape *= smoothstep(0.28, 0.58, large);

      d = max(d, anvilShape * uAnvil * 0.62);
    }

    return clamp(d, 0.0, 1.0);
  }

  void main() {
    vec3 ray = normalize(vPosition - uCameraLocal);
    vec3 p = vPosition;

    vec3 colorSum = vec3(0.0);
    float transmittance = 1.0;

    const int STEPS = 72;
    float stepLength = 0.028;

    vec3 sunDir = normalize(uSunDirection);

    for (int i = 0; i < STEPS; i++) {
      float d = densityAt(p);

      if (d > 0.003) {
        float shadow = 0.0;
        shadow += densityAt(p + sunDir * 0.10) * 0.34;
        shadow += densityAt(p + sunDir * 0.23) * 0.28;
        shadow += densityAt(p + sunDir * 0.40) * 0.20;

        float light = clamp(1.0 - shadow * 0.95, 0.14, 1.0);
        float h = clamp((p.y + 1.0) * 0.5, 0.0, 1.0);

        float topLight = smoothstep(0.25, 0.86, h);
        float sunFacing = clamp(sunDir.y * 0.8 + 0.25, 0.0, 1.0);

        vec3 col = mix(uShadowColor, uLitColor, light);
        col = mix(col, vec3(1.0, 0.97, 0.89), topLight * sunFacing * 0.70);

        float alpha = 1.0 - exp(-d * stepLength * 15.0);
        alpha *= transmittance;

        colorSum += col * alpha;
        transmittance *= 1.0 - alpha;

        if (transmittance < 0.018) break;
      }

      p += ray * stepLength;

      if (
        p.x < -1.04 || p.x > 1.04 ||
        p.y < -1.04 || p.y > 1.04 ||
        p.z < -1.04 || p.z > 1.04
      ) break;
    }

    float alpha = 1.0 - transmittance;
    if (alpha < 0.012) discard;

    gl_FragColor = vec4(colorSum / max(alpha, 0.001), alpha);
  }
`;

// ============================================================
// CLOUD CELLS
// ============================================================

const cloudGroup = new THREE.Group();
scene.add(cloudGroup);

const cells = [];
let nextCellId = 1;
let simTime = 0;
let spawnTimer = 0;
let paused = false;
let lightningEnabled = true;

function makeCloud(seed) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uCameraLocal: { value: new THREE.Vector3() },
      uSunDirection: { value: new THREE.Vector3(-0.4, 0.8, -0.5).normalize() },
      uLitColor: { value: new THREE.Color(0xf5f5f2) },
      uShadowColor: { value: new THREE.Color(0x485668) },
      uTime: { value: 0 },
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

  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), material);
  mesh.frustumCulled = false;
  return mesh;
}

function createCell(opts = {}) {
  const env = environment();
  const seed = rand(0, 1000);
  const mesh = makeCloud(seed);

  const cell = {
    id: nextCellId++,
    mesh,
    seed,
    age: opts.age ?? 0,
    energy: opts.energy ?? rand(0.65, 1.12),
    width: opts.width ?? rand(19, 28),
    depth: opts.depth ?? rand(18, 27),
    height: opts.height ?? rand(45, 68),
    x: opts.x ?? rand(-45, 45),
    z: opts.z ?? rand(-35, 35),
    driftX: rand(-0.5, 0.5),
    driftZ: rand(-0.35, 0.35),
    lifetime: rand(260, 430),
    base: env.lcl,
    mature: 0,
    anvil: 0,
    phase: "forming",
    lightningCooldown: rand(8, 22)
  };

  // Start almost invisible and small. Growth happens in updateCell().
  mesh.position.set(cell.x, cell.base, cell.z);
  mesh.scale.set(0.05, 0.05, 0.05);

  cloudGroup.add(mesh);
  cells.push(cell);

  return cell;
}

function removeCell(cell) {
  cloudGroup.remove(cell.mesh);
  cell.mesh.geometry.dispose();
  cell.mesh.material.dispose();

  const index = cells.indexOf(cell);
  if (index >= 0) cells.splice(index, 1);
}

function clearCells() {
  [...cells].forEach(removeCell);
}

// ============================================================
// CLOUD GROWTH
// ============================================================

function updateCell(cell, dt) {
  const env = environment();

  cell.age += dt;
  cell.lightningCooldown -= dt;

  const growthDuration = 125 / Math.max(0.45, env.instability);
  const growth = clamp(cell.age / growthDuration, 0, 1);

  const decayStart = cell.lifetime * 0.76;
  const decay = clamp(
    (cell.age - decayStart) / Math.max(1, cell.lifetime - decayStart),
    0,
    1
  );

  // A small cloud first, then a rapidly rising tower.
  const towerProgress = Math.pow(growth, 1.28);
  const widthProgress = Math.pow(growth, 0.75);

  const energy = cell.energy * (1.0 - decay * 0.72);

  const towerHeight =
    cell.height *
    towerProgress *
    (0.55 + env.instability * 0.36) *
    (0.70 + env.moisture * 0.30) *
    energy;

  const width = cell.width * (0.055 + widthProgress * 0.945);
  const depth = cell.depth * (0.055 + widthProgress * 0.945);

  cell.mature = growth;

  // Anvil is a late-stage feature; it doesn't exist at startup.
  cell.anvil = clamp(
    (growth - 0.68) * 3.0 + (env.shear / 100) * growth,
    0,
    1
  );

  if (decay > 0.82) {
    cell.phase = "dissipating";
  } else if (growth > 0.90) {
    cell.phase = "mature";
  } else if (growth > 0.30) {
    cell.phase = "towering";
  } else {
    cell.phase = "forming";
  }

  cell.x += cell.driftX * dt * (0.5 + env.shear / 25);
  cell.z += cell.driftZ * dt;

  const anvilOffset = cell.anvil * env.shear * 0.08;

  cell.mesh.position.set(
    cell.x + anvilOffset,
    cell.base + Math.max(0.5, towerHeight * 0.5),
    cell.z
  );

  cell.mesh.scale.set(
    Math.max(0.7, width),
    Math.max(0.7, towerHeight * 0.5),
    Math.max(0.7, depth)
  );

  const u = cell.mesh.material.uniforms;
  u.uTime.value = simTime + cell.seed;
  u.uTurbulence.value = 0.95 + env.instability * 0.42;
  u.uDensity.value = (0.85 + env.moisture * 0.60) * (1.0 - decay * 0.38);
  u.uAnvil.value = cell.anvil;

  // Dense blue-gray base; sunlit upper parts are shaded in the shader.
  u.uShadowColor.value.setRGB(
    0.20 - env.moisture * 0.035,
    0.24 - env.moisture * 0.045,
    0.31 - env.moisture * 0.035
  );

  u.uLitColor.value.setRGB(
    0.92 - decay * 0.07,
    0.93 - decay * 0.08,
    0.92 - decay * 0.07
  );

  if (cell.age > cell.lifetime) {
    removeCell(cell);
    return;
  }

  const electricalPotential =
    env.instability * env.moisture * growth * (0.4 + env.shear / 60);

  if (
    lightningEnabled &&
    electricalPotential > 0.35 &&
    cell.lightningCooldown <= 0 &&
    Math.random() < dt * 0.12 * electricalPotential
  ) {
    createLightning(cell);
    cell.lightningCooldown = rand(5, 16);
  }
}

// ============================================================
// STORM GENERATION
// ============================================================

function chooseStormType() {
  const selected = $("stormType")?.value || "random";
  if (selected !== "random") return selected;

  const options = ["tower", "supercell", "multicell", "squall"];
  return options[Math.floor(Math.random() * options.length)];
}

let stormType = "random";

function generateStorm() {
  clearCells();
  clearLightning();

  stormType = chooseStormType();

  const env = environment();

  let count = 1;

  if (stormType === "multicell") count = Math.floor(rand(3, 5));
  if (stormType === "squall") count = Math.floor(rand(4, 7));
  if (stormType === "tower") count = 1;
  if (stormType === "supercell") count = 1;
  if (stormType === "random") count = Math.floor(rand(1, 3));

  for (let i = 0; i < count; i++) {
    let x = rand(-42, 42);
    let z = rand(-32, 32);

    if (stormType === "squall") {
      x = (i - (count - 1) / 2) * rand(20, 27);
      z = rand(-12, 12);
    }

    createCell({
      x,
      z,
      age: rand(0, 5),
      energy: rand(0.75, 1.0) * (0.8 + env.instability * 0.18),
      width: stormType === "supercell" ? rand(29, 36) : rand(18, 27),
      depth: stormType === "supercell" ? rand(27, 34) : rand(17, 26),
      height: stormType === "supercell" ? rand(62, 78) : rand(44, 65)
    });
  }

  spawnTimer = rand(12, 22);
  updateMetrics();
}

function updateFormation(dt) {
  const env = environment();
  spawnTimer -= dt;

  if (spawnTimer > 0 || cells.length >= 8) return;

  const probability = clamp(
    0.24 + env.instability * 0.20 + env.moisture * 0.28,
    0.1,
    0.85
  );

  if (Math.random() < probability) {
    createCell({
      x: rand(-90, 90),
      z: rand(-70, 70),
      age: 0,
      energy: rand(0.48, 0.92),
      width: rand(15, 22),
      depth: rand(14, 21),
      height: rand(38, 57)
    });
  }

  spawnTimer = rand(9, 21) / Math.max(0.55, env.instability);
}

function resetSimulation() {
  simTime = 0;
  spawnTimer = 0;
  generateStorm();
}

// ============================================================
// LIGHTNING
// ============================================================

const lightningGroup = new THREE.Group();
scene.add(lightningGroup);

let bolts = [];

function createBoltPoints(start, end, count, spread) {
  const points = [];
  const delta = end.clone().sub(start);

  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const p = start.clone().addScaledVector(delta, t);

    if (i > 0 && i < count) {
      const taper = Math.sin(Math.PI * t);
      p.x += rand(-spread, spread) * taper;
      p.z += rand(-spread, spread) * taper;
    }

    points.push(p);
  }

  return points;
}

function createLightning(cell) {
  clearLightning();

  const start = new THREE.Vector3(
    cell.x + rand(-3, 3),
    cell.base + Math.max(3, cell.height * cell.mature * 0.9),
    cell.z
  );

  const end = new THREE.Vector3(
    start.x + rand(-24, 24),
    0.1,
    start.z + rand(-24, 24)
  );

  const geometry = new THREE.BufferGeometry().setFromPoints(
    createBoltPoints(start, end, 24, 3.3)
  );

  const material = new THREE.LineBasicMaterial({
    color: 0xe6f5ff,
    transparent: true,
    opacity: 1,
    depthWrite: false
  });

  const line = new THREE.Line(geometry, material);
  lightningGroup.add(line);

  bolts.push({ object: line, life: 0.18, maxLife: 0.18, light: false });

  const flash = new THREE.PointLight(0xbadfff, 18, 170, 2);
  flash.position.copy(start);
  scene.add(flash);

  bolts.push({ object: flash, life: 0.12, maxLife: 0.12, light: true });
}

function clearLightning() {
  for (const bolt of bolts) {
    if (bolt.light) {
      scene.remove(bolt.object);
    } else {
      lightningGroup.remove(bolt.object);
    }

    bolt.object.geometry?.dispose?.();
    bolt.object.material?.dispose?.();
  }

  bolts = [];
}

function updateLightning(dt) {
  for (const bolt of [...bolts]) {
    bolt.life -= dt;

    if (bolt.light) {
      bolt.object.intensity = 18 * Math.max(0, bolt.life / bolt.maxLife);
    } else {
      bolt.object.material.opacity = Math.max(0, bolt.life / bolt.maxLife);
    }

    if (bolt.life <= 0) {
      if (bolt.light) scene.remove(bolt.object);
      else lightningGroup.remove(bolt.object);

      bolt.object.geometry?.dispose?.();
      bolt.object.material?.dispose?.();

      bolts.splice(bolts.indexOf(bolt), 1);
    }
  }
}

// ============================================================
// METRICS AND CAMERA
// ============================================================

const cameraWorld = new THREE.Vector3();

function updateCloudCameraUniforms() {
  camera.getWorldPosition(cameraWorld);

  for (const cell of cells) {
    const mesh = cell.mesh;
    const u = mesh.material.uniforms;

    u.uCameraLocal.value.copy(
      mesh.worldToLocal(cameraWorld.clone())
    );

    // Direction expressed in the cloud's local coordinate system.
    const origin = mesh.worldToLocal(mesh.position.clone());
    const sunPoint = mesh.worldToLocal(
      mesh.position.clone().add(sunlight.position.clone().normalize())
    );

    u.uSunDirection.value.copy(sunPoint.sub(origin).normalize());
  }
}

function updateMetrics() {
  if ($("cellCount")) {
    $("cellCount").textContent = String(cells.length);
  }

  const highest = cells.reduce(
    (m, c) => Math.max(m, c.base + c.height * c.mature),
    0
  );

  if ($("cloudHeight")) {
    $("cloudHeight").textContent = highest > 0
      ? Math.round(highest * 100) + " м"
      : "—";
  }

  if ($("status")) {
    if (paused) {
      $("status").textContent = "Пауза";
    } else if (!cells.length) {
      $("status").textContent = "Формирование";
    } else if (cells.some(c => c.phase === "mature")) {
      $("status").textContent = "Зрелая конвекция";
    } else if (cells.some(c => c.phase === "towering")) {
      $("status").textContent = "Рост башен";
    } else {
      $("status").textContent = "Формирование";
    }
  }
}

// ============================================================
// UI CONTROLS
// ============================================================

$("newStorm")?.addEventListener("click", generateStorm);
$("reset")?.addEventListener("click", resetSimulation);

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
    $("lightning").style.opacity = lightningEnabled ? "1" : "0.55";
  }

  if (!lightningEnabled) clearLightning();
});

// ============================================================
// RESIZE
// ============================================================

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ============================================================
// MAIN LOOP
// ============================================================

let previousTime = performance.now();
let metricTimer = 0;

function animate(now) {
  requestAnimationFrame(animate);

  const dt = Math.min((now - previousTime) / 1000, 0.04);
  previousTime = now;

  controls.update();
  sky.position.copy(camera.position);

  if (!paused) {
    simTime += dt;

    updateFormation(dt);

    for (const cell of [...cells]) {
      updateCell(cell, dt);
    }

    updateLightning(dt);

    metricTimer += dt;
    if (metricTimer > 0.3) {
      updateMetrics();
      metricTimer = 0;
    }
  }

  updateCloudCameraUniforms();

  try {
    renderer.render(scene, camera);
  } catch (error) {
    console.error("[Quantum Meteo render]", error);
  }
}

// ============================================================
// START
// ============================================================

try {
  generateStorm();

  if ($("loading")) $("loading").style.display = "none";

  updateMetrics();
  requestAnimationFrame(animate);
} catch (error) {
  showStormError(error);
}
