// ============================================================
// QUANTUM METEO — STORM SIMULATOR
// Visible Cumulonimbus + Land + Extreme Zoom
//
// index.html менять не нужно.
// Облака: непрозрачные объёмные меши.
// Поверхность: процедурная суша.
// Масштаб: увеличенный диапазон камеры.
// ============================================================

import * as THREE from "https://esm.sh/three@0.180.0";
import { OrbitControls } from
  "https://esm.sh/three@0.180.0/examples/jsm/controls/OrbitControls.js";

const $ = id => document.getElementById(id);
const canvas = $("scene");

if (!canvas) throw new Error("Не найден canvas #scene");

if ($("loadingTitle")) $("loadingTitle").textContent = "Quantum Meteo";
if ($("loadingText")) $("loadingText").textContent = "Создание грозовой системы";

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const rand = (min, max) => min + Math.random() * (max - min);

// ============================================================
// RENDERER
// ============================================================

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance"
});

renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
renderer.setSize(canvas.clientWidth || innerWidth, canvas.clientHeight || innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x91b7db);
scene.fog = new THREE.Fog(0x91b7db, 500, 2200);

const camera = new THREE.PerspectiveCamera(
  50,
  (canvas.clientWidth || innerWidth) / (canvas.clientHeight || innerHeight),
  0.1,
  100000000
);

camera.position.set(70, 43, 90);

// ============================================================
// CONTROLS — ОЧЕНЬ ДАЛЬНЕЕ ОТДАЛЕНИЕ
// ============================================================

const controls = new OrbitControls(camera, renderer.domElement);

controls.target.set(0, 19, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.minDistance = 0.5;
controls.maxDistance = 10000000;
controls.zoomSpeed = 1.15;
controls.panSpeed = 1;
controls.maxPolarAngle = Math.PI * 0.495;
controls.update();

// ============================================================
// LIGHTING
// ============================================================

scene.add(new THREE.HemisphereLight(0xdceeff, 0x555344, 2.2));

const sun = new THREE.DirectionalLight(0xfff1d8, 3.0);
sun.position.set(-100, 150, -80);
scene.add(sun);

const fill = new THREE.DirectionalLight(0xc4dfff, 1.0);
fill.position.set(100, 65, 70);
scene.add(fill);

// ============================================================
// TERRAIN — NO WATER
// ============================================================

const WORLD = 1200;
const SEGMENTS = 220;

function hash(x, z) {
  const n = Math.sin(x * 127.1 + z * 311.7 + 17.17) * 43758.5453;
  return n - Math.floor(n);
}

function noise(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;

  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);

  const a = hash(ix, iz);
  const b = hash(ix + 1, iz);
  const c = hash(ix, iz + 1);
  const d = hash(ix + 1, iz + 1);

  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(a, b, u),
    THREE.MathUtils.lerp(c, d, u),
    v
  );
}

function fbm(x, z) {
  let value = 0;
  let amp = 0.5;

  for (let i = 0; i < 5; i++) {
    value += (noise(x, z) * 2 - 1) * amp;
    x *= 2.03;
    z *= 2.03;
    amp *= 0.48;
  }

  return value;
}

function heightAt(x, z) {
  const broad = fbm(x * 0.003, z * 0.003);
  const medium = fbm(x * 0.012, z * 0.012);
  const fine = fbm(x * 0.055, z * 0.055);

  const m1 = Math.exp(
    -(((x + 180) / 145) ** 2 + ((z + 120) / 180) ** 2)
  );

  const m2 = Math.exp(
    -(((x - 180) / 120) ** 2 + ((z - 160) / 150) ** 2)
  );

  const m3 = Math.exp(
    -(((x - 20) / 90) ** 2 + ((z + 230) / 110) ** 2)
  );

  const mountains = Math.max(m1, m2 * 0.95, m3 * 0.8);
  const rugged = Math.pow(
    Math.max(0, 0.55 + broad * 0.6 + medium * 0.6),
    1.4
  );

  return Math.max(
    0.3,
    1.2 + broad * 3.3 + medium * 1.2 + rugged * mountains * 15 + fine * 0.2
  );
}

function makeTerrainTexture() {
  const size = 1024;
  const c = document.createElement("canvas");
  c.width = c.height = size;

  const ctx = c.getContext("2d");
  const image = ctx.createImageData(size, size);

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const x = (px / size - 0.5) * WORLD;
      const z = (py / size - 0.5) * WORLD;

      const h = heightAt(x, z);
      const n = fbm(x * 0.08 + 300, z * 0.08 - 700);
      const grain = (hash(px * 2, py * 2) - 0.5) * 12;

      let r, g, b;

      if (h > 11) {
        r = 145 + n * 22;
        g = 143 + n * 20;
        b = 132 + n * 20;
      } else if (h > 7) {
        r = 111 + n * 20;
        g = 111 + n * 18;
        b = 88 + n * 14;
      } else if (n > 0.32) {
        r = 37 + n * 20;
        g = 78 + n * 24;
        b = 41 + n * 13;
      } else if (n < -0.35) {
        r = 145 + n * 15;
        g = 127 + n * 12;
        b = 87 + n * 12;
      } else {
        r = 75 + n * 20;
        g = 116 + n * 22;
        b = 64 + n * 14;
      }

      const i = (py * size + px) * 4;
      image.data[i] = clamp(r + grain, 0, 255);
      image.data[i + 1] = clamp(g + grain, 0, 255);
      image.data[i + 2] = clamp(b + grain, 0, 255);
      image.data[i + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());

  return texture;
}

const terrainGeometry = new THREE.PlaneGeometry(
  WORLD, WORLD, SEGMENTS, SEGMENTS
);

terrainGeometry.rotateX(-Math.PI / 2);

const pos = terrainGeometry.attributes.position;

for (let i = 0; i < pos.count; i++) {
  pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
}

pos.needsUpdate = true;
terrainGeometry.computeVertexNormals();

const terrain = new THREE.Mesh(
  terrainGeometry,
  new THREE.MeshStandardMaterial({
    map: makeTerrainTexture(),
    roughness: 1,
    metalness: 0
  })
);

scene.add(terrain);

// ============================================================
// SKY
// ============================================================

const sky = new THREE.Mesh(
  new THREE.SphereGeometry(20000000, 24, 16),
  new THREE.MeshBasicMaterial({
    color: 0x91b7db,
    side: THREE.BackSide,
    depthWrite: false
  })
);

sky.frustumCulled = false;
scene.add(sky);

// ============================================================
// CLOUD MATERIALS
//
// Opaque meshes — no alpha shader, no raymarching.
// This makes the clouds reliably visible.
// ============================================================

const cloudRoot = new THREE.Group();
scene.add(cloudRoot);

const cloudMaterials = [
  new THREE.MeshStandardMaterial({
    color: 0xf5f7fa,
    roughness: 1,
    metalness: 0
  }),
  new THREE.MeshStandardMaterial({
    color: 0xe4e9ef,
    roughness: 1,
    metalness: 0
  }),
  new THREE.MeshStandardMaterial({
    color: 0xd0d8e2,
    roughness: 1,
    metalness: 0
  })
];

const puffGeometry = new THREE.SphereGeometry(1, 18, 14);
const cloudPuffs = [];

let stormType = "supercell";
let simulationTime = 0;
let paused = false;
let growthSpeed = 1;
let lightningEnabled = true;

function addPuff(x, y, z, sx, sy, sz, role = "body") {
  const material = role === "shadow"
    ? cloudMaterials[2]
    : role === "mid"
      ? cloudMaterials[1]
      : cloudMaterials[0];

  const mesh = new THREE.Mesh(puffGeometry, material);

  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = true;

  cloudRoot.add(mesh);

  cloudPuffs.push({
    mesh,
    baseX: x,
    baseY: y,
    baseZ: z,
    sx,
    sy,
    sz,
    phase: Math.random() * Math.PI * 2,
    growth: 0,
    role
  });

  return mesh;
}

// ============================================================
// CUMULUS / CUMULONIMBUS
// ============================================================

function createTower(cx, cz, height, width, seed = 0) {
  // Широкое основание с тенями.
  for (let i = 0; i < 11; i++) {
    const a = i / 11 * Math.PI * 2;
    const r = width * rand(0.18, 0.42);

    addPuff(
      cx + Math.cos(a) * r,
      5.0 + rand(0, 1.2),
      cz + Math.sin(a) * r,
      width * rand(0.31, 0.46),
      width * rand(0.25, 0.36),
      width * rand(0.31, 0.46),
      i % 3 === 0 ? "shadow" : "mid"
    );
  }

  // Башня: несколько перекрывающихся уровней куполов.
  const levels = Math.max(8, Math.floor(height / 1.45));

  for (let level = 0; level < levels; level++) {
    const t = level / (levels - 1);
    const y = 5.5 + t * height;

    // Широкое тело, более узкая верхняя башня.
    const taper = 1 - Math.max(0, t - 0.30) * 0.46;
    const count = t > 0.78 ? 8 : 10;

    for (let j = 0; j < count; j++) {
      const angle =
        j / count * Math.PI * 2 +
        seed * 0.71 +
        t * 0.28;

      const radius = width * (0.22 + t * 0.12);
      const x = cx + Math.cos(angle) * radius;
      const z = cz + Math.sin(angle) * radius;

      const s = rand(0.82, 1.18);

      addPuff(
        x,
        y + rand(-0.35, 0.35),
        z,
        width * 0.31 * taper * s,
        width * rand(0.24, 0.34),
        width * 0.31 * taper * s,
        Math.random() < 0.18 ? "shadow" : "body"
      );
    }

    // Центральные восходящие купола.
    addPuff(
      cx + rand(-width * 0.10, width * 0.10),
      y,
      cz + rand(-width * 0.10, width * 0.10),
      width * 0.37 * taper,
      width * 0.31,
      width * 0.37 * taper,
      level % 4 === 0 ? "mid" : "body"
    );

    // Выступающие cauliflower-кромки.
    if (level > 1 && level < levels - 1) {
      for (let k = 0; k < 3; k++) {
        const angle = seed + level * 1.2 + k * 2.1;
        const r = width * rand(0.30, 0.52);

        addPuff(
          cx + Math.cos(angle) * r,
          y + rand(-0.5, 0.5),
          cz + Math.sin(angle) * r,
          width * rand(0.18, 0.28),
          width * rand(0.18, 0.25),
          width * rand(0.18, 0.28),
          "body"
        );
      }
    }
  }

  // Очень заметная выпуклая вершина.
  const top = 5.5 + height;

  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    const r = width * rand(0.22, 0.48);

    addPuff(
      cx + Math.cos(a) * r,
      top + rand(-0.25, 1.5),
      cz + Math.sin(a) * r,
      width * rand(0.23, 0.34),
      width * rand(0.20, 0.30),
      width * rand(0.23, 0.34),
      "body"
    );
  }

  // Верхний купол — формирует характерный Cb tower.
  addPuff(
    cx,
    top + 0.9,
    cz,
    width * 0.44,
    width * 0.34,
    width * 0.44,
    "body"
  );
}

function createAnvil(cx, cz, width, y) {
  // Расширенная ледяная наковальня.
  // Множество объёмов, а не одна плоская пластина.
  for (let i = 0; i < 25; i++) {
    const t = i / 24;
    const side = t < 0.5 ? -1 : 1;
    const u = t < 0.5 ? t * 2 : (t - 0.5) * 2;

    const x = cx + side * u * width * 2.2;
    const z = cz + Math.sin(i * 1.8) * width * 0.36;

    addPuff(
      x,
      y + Math.sin(i * 1.5) * width * 0.035,
      z,
      width * rand(0.36, 0.55),
      width * rand(0.13, 0.19),
      width * rand(0.34, 0.50),
      i % 4 === 0 ? "mid" : "body"
    );
  }

  // Куполообразная центральная часть перехода башня-наковальня.
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2;

    addPuff(
      cx + Math.cos(a) * width * 0.5,
      y + width * 0.07,
      cz + Math.sin(a) * width * 0.4,
      width * 0.43,
      width * 0.20,
      width * 0.38,
      "body"
    );
  }
}

function clearClouds() {
  for (const p of cloudPuffs) {
    cloudRoot.remove(p.mesh);
  }

  cloudPuffs.length = 0;
}

function generateStorm() {
  clearClouds();

  const type = $("stormType")?.value || "supercell";
  stormType = type;

  const cape = Number($("cape")?.value ?? 2500);
  const shear = Number($("shear")?.value ?? 25);
  const humidity = Number($("humidity")?.value ?? 75);

  const capeFactor = clamp(cape / 2500, 0.4, 1.7);
  const humidityFactor = clamp(humidity / 75, 0.35, 1.3);
  const shearFactor = clamp(shear / 25, 0.2, 1.8);

  const height = 15 + capeFactor * 8;
  const width = 8 + humidityFactor * 2;

  if (type === "tower") {
    createTower(0, 0, height, width, 1);
  }

  if (type === "supercell") {
    createTower(0, 0, height + 5, width * 1.1, 2);
    createAnvil(0, -2, width * 1.8, 5.5 + height + 5);
  }

  if (type === "multicell") {
    const count = 4;

    for (let i = 0; i < count; i++) {
      const x = (i - 1.5) * 19;
      const z = Math.sin(i * 1.7) * 8;

      createTower(
        x,
        z,
        height * rand(0.65, 1.05),
        width * rand(0.70, 0.88),
        i + 4
      );
    }
  }

  if (type === "squall") {
    const count = 7;

    for (let i = 0; i < count; i++) {
      const x = (i - 3) * 12.5;

      createTower(
        x,
        Math.sin(i * 0.65) * 3,
        height * rand(0.75, 1.05),
        width * 0.72,
        i + 8
      );
    }

    createAnvil(0, 0, width * 2.1, 5.5 + height);
  }

  if (type === "random") {
    // Если random выбран вручную, создаём выраженную многоклеточную систему.
    createTower(0, 0, height + 4, width, 12);
    createTower(-17, 7, height * 0.78, width * 0.76, 13);
    createTower(18, -8, height * 0.88, width * 0.8, 14);
    createAnvil(0, -2, width * 1.7, 5.5 + height + 4);
  }

  // Подстраховка: в сцене всегда должны остаться облачные объёмы.
  if (cloudPuffs.length === 0) {
    createTower(0, 0, 24, 10, 99);
  }

  updateMetrics();
}

// ============================================================
// LIGHTNING
// ============================================================

const lightningGroup = new THREE.Group();
scene.add(lightningGroup);

const lightningLight = new THREE.PointLight(0xdceeff, 0, 100, 2);
scene.add(lightningLight);

let lightningUntil = 0;

function createLightning() {
  for (const child of [...lightningGroup.children]) {
    lightningGroup.remove(child);
    child.geometry.dispose();
    child.material.dispose();
  }

  const points = [];
  let x = rand(-3, 3);
  let z = rand(-3, 3);

  points.push(new THREE.Vector3(x, 30, z));

  for (let i = 1; i <= 16; i++) {
    x += rand(-1.1, 1.1);
    z += rand(-1.1, 1.1);

    points.push(new THREE.Vector3(x, 30 - i * 1.45, z));
  }

  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1
    })
  );

  lightningGroup.add(line);
  lightningLight.position.set(x, 12, z);
  lightningLight.intensity = 100;
  lightningUntil = simulationTime + 0.16;
}

function updateLightning() {
  if (!lightningEnabled) {
    lightningLight.intensity = 0;
    return;
  }

  if (simulationTime > lightningUntil) {
    lightningLight.intensity = 0;

    for (const child of [...lightningGroup.children]) {
      lightningGroup.remove(child);
      child.geometry.dispose();
      child.material.dispose();
    }
  }

  if (Math.random() < 0.0025) createLightning();
}

// ============================================================
// GROWTH SPEED BUTTON
// ============================================================

let growthButton = $("growthSpeed");

if (!growthButton) {
  growthButton = document.createElement("button");
  growthButton.id = "growthSpeed";
  growthButton.type = "button";

  Object.assign(growthButton.style, {
    position: "absolute",
    right: "14px",
    bottom: "14px",
    zIndex: "50",
    padding: "11px 14px",
    border: "1px solid rgba(255,255,255,.3)",
    borderRadius: "12px",
    background: "rgba(15,25,40,.92)",
    color: "#fff",
    font: "600 13px system-ui",
    cursor: "pointer"
  });

  const parent = canvas.parentElement || document.body;

  if (getComputedStyle(parent).position === "static") {
    parent.style.position = "relative";
  }

  parent.appendChild(growthButton);
}

function updateGrowthButton() {
  growthButton.textContent = `Рост облаков: ${growthSpeed}×`;
}

growthButton.addEventListener("click", () => {
  const speeds = [1, 2, 4, 8];
  growthSpeed = speeds[(speeds.indexOf(growthSpeed) + 1) % speeds.length];
  updateGrowthButton();
});

updateGrowthButton();

// ============================================================
// DYNAMIC UPDATE
// ============================================================

function updateClouds(dt) {
  const cape = Number($("cape")?.value ?? 2500);
  const humidity = Number($("humidity")?.value ?? 75);
  const shear = Number($("shear")?.value ?? 25);

  const energy = clamp(cape / 2500, 0.4, 1.7);
  const moisture = clamp(humidity / 75, 0.35, 1.3);
  const wind = clamp(shear / 25, 0.2, 1.8);

  for (const p of cloudPuffs) {
    // Движение и медленная эволюция объёмов.
    const t = simulationTime * 0.2 + p.phase;

    p.mesh.position.x =
      p.baseX + Math.sin(t * 0.37) * 0.20 + simulationTime * 0.008 * wind;

    p.mesh.position.z =
      p.baseZ + Math.cos(t * 0.29) * 0.18;

    const verticalFactor = p.role === "body" ? 1 : 0.65;

    p.growth = Math.min(
      0.45,
      p.growth + dt * 0.0015 * energy * moisture * growthSpeed
    );

    const s = 1 + p.growth * verticalFactor;

    p.mesh.scale.set(
      p.sx * s,
      p.sy * (1 + p.growth * 0.8),
      p.sz * s
    );
  }
}

// ============================================================
// UI
// ============================================================

function updateMetrics() {
  const cape = Number($("cape")?.value ?? 2500);
  const shear = Number($("shear")?.value ?? 25);
  const humidity = Number($("humidity")?.value ?? 75);

  if ($("capeValue")) $("capeValue").textContent = String(cape);
  if ($("shearValue")) $("shearValue").textContent = String(shear);
  if ($("humidityValue")) $("humidityValue").textContent = String(humidity);

  if ($("cloudHeight")) {
    $("cloudHeight").textContent =
      `${Math.round(15 + clamp(cape / 2500, 0.4, 1.7) * 8)} км`;
  }

  if ($("cellCount")) {
    $("cellCount").textContent = String(
      stormType === "multicell" ? 4 :
      stormType === "squall" ? 7 :
      stormType === "random" ? 3 : 1
    );
  }

  if ($("status")) {
    $("status").textContent = paused ? "Пауза" : "Симуляция";
  }
}

["cape", "shear", "humidity"].forEach(id => {
  $(id)?.addEventListener("input", updateMetrics);
});

$("newStorm")?.addEventListener("click", generateStorm);

$("pause")?.addEventListener("click", () => {
  paused = !paused;

  if ($("pause")) {
    $("pause").textContent = paused ? "Продолжить" : "Пауза";
  }

  updateMetrics();
});

$("lightning")?.addEventListener("click", () => {
  lightningEnabled = !lightningEnabled;

  if (!lightningEnabled) lightningLight.intensity = 0;

  if ($("lightning")) {
    $("lightning").textContent =
      lightningEnabled ? "Молнии: вкл." : "Молнии: выкл.";
  }
});

$("reset")?.addEventListener("click", () => {
  camera.position.set(70, 43, 90);
  controls.target.set(0, 19, 0);
  controls.update();
  generateStorm();
});

// ============================================================
// RESIZE
// ============================================================

function resize() {
  const w = canvas.clientWidth || innerWidth;
  const h = canvas.clientHeight || innerHeight;

  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();

  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
}

window.addEventListener("resize", resize);

// ============================================================
// RENDER LOOP
// ============================================================

function animate(now) {
  requestAnimationFrame(animate);

  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  if (!paused) {
    simulationTime += dt * growthSpeed;
    updateClouds(dt);
    updateLightning();
  }

  // Большая сфера не теряется при экстремальном отдалении.
  sky.position.copy(camera.position);

  controls.update();
  renderer.render(scene, camera);
}

// ============================================================
// START
// ============================================================

try {
  generateStorm();
  updateMetrics();

  if ($("loading")) $("loading").style.display = "none";

  requestAnimationFrame(animate);
} catch (error) {
  console.error("Quantum Meteo error:", error);

  if ($("loadingTitle")) $("loadingTitle").textContent = "Ошибка";
  if ($("loadingText")) $("loadingText").textContent = error.message;

  if (typeof window.showStormError === "function") {
    window.showStormError(error);
  }
}
