// ============================================================
// QUANTUM METEO — атмосферная симуляция
// Версия: Land + Cumulonimbus
//
// - Полностью сухопутная поверхность, без океанов и воды
// - Процедурный рельеф с горами, долинами и биомами
// - Объёмно выглядящие кучевые облака и башни Cb
// - Рост облаков зависит от CAPE, сдвига ветра и влажности
// - Изменение скорости развития атмосферы
// ============================================================

import * as THREE from "https://esm.sh/three@0.180.0";
import { OrbitControls } from
  "https://esm.sh/three@0.180.0/examples/jsm/controls/OrbitControls.js";

const canvas = document.querySelector("#scene");

if (!canvas) {
  throw new Error("Не найден canvas #scene");
}

const $ = (id) => document.getElementById(id);

const loading = $("loading");
const loadingTitle = $("loadingTitle");
const loadingText = $("loadingText");

if (loadingTitle) loadingTitle.textContent = "Quantum Meteo";
if (loadingText) loadingText.textContent = "Создание атмосферы и рельефа";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

// ============================================================
// СЦЕНА
// ============================================================

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9bbbd5);
scene.fog = new THREE.FogExp2(0x9bbbd5, 0.00013);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: "high-performance"
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(canvas.clientWidth || innerWidth,
                 canvas.clientHeight || innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const camera = new THREE.PerspectiveCamera(
  48,
  (canvas.clientWidth || innerWidth) /
    (canvas.clientHeight || innerHeight),
  0.1,
  1600
);

camera.position.set(65, 48, 95);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 12, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.045;
controls.minDistance = 12;
controls.maxDistance = 260;
controls.maxPolarAngle = Math.PI * 0.49;
controls.update();

// ============================================================
// ОСВЕЩЕНИЕ
// ============================================================

scene.add(new THREE.HemisphereLight(0xdceeff, 0x424a32, 2.0));

const sunlight = new THREE.DirectionalLight(0xfff0d7, 3.0);
sunlight.position.set(-80, 130, -65);
scene.add(sunlight);

const fillLight = new THREE.DirectionalLight(0xc0dcff, 0.75);
fillLight.position.set(80, 55, 75);
scene.add(fillLight);

// ============================================================
// ПРОЦЕДУРНЫЙ РЕЛЬЕФ
// Единицы: условные километры.
// Поверхность состоит только из суши.
// ============================================================

const WORLD_SIZE = 1000;
const TERRAIN_SEGMENTS = 220;

function hash2(x, z) {
  const n = Math.sin(x * 127.1 + z * 311.7 + 74.7) * 43758.5453;
  return n - Math.floor(n);
}

function smoothNoise(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;

  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);

  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);

  return lerp(lerp(a, b, sx), lerp(c, d, sx), sz);
}

function fbm(x, z) {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;

  for (let i = 0; i < 5; i++) {
    value += (smoothNoise(x * frequency, z * frequency) * 2 - 1)
      * amplitude;

    frequency *= 2.05;
    amplitude *= 0.48;
  }

  return value;
}

function terrainHeight(x, z) {
  const broad = fbm(x * 0.0032, z * 0.0032);
  const medium = fbm(x * 0.012, z * 0.012);
  const fine = fbm(x * 0.052, z * 0.052);

  // Несколько крупных горных областей.
  const mountainA = Math.exp(
    -(((x + 145) / 125) ** 2 + ((z + 100) / 155) ** 2)
  );

  const mountainB = Math.exp(
    -(((x - 175) / 100) ** 2 + ((z - 120) / 130) ** 2)
  );

  const mountainC = Math.exp(
    -(((x - 15) / 75) ** 2 + ((z + 220) / 100) ** 2)
  );

  const mountainMask = Math.max(
    mountainA,
    mountainB * 0.9,
    mountainC * 0.75
  );

  const plains = 0.9 + broad * 3.4 + medium * 1.15;
  const mountains =
    Math.pow(Math.max(0, 0.55 + broad * 0.7 + medium * 0.65), 1.35)
    * 12.5;

  const height =
    plains +
    mountains * mountainMask +
    fine * 0.17;

  return Math.max(0.15, height);
}

// ============================================================
// ТЕКСТУРА СУШИ
// ============================================================

function createTerrainTexture() {
  const size = 1024;

  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;

  const ctx = c.getContext("2d", { alpha: false });
  const image = ctx.createImageData(size, size);

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const x = (px / size - 0.5) * WORLD_SIZE;
      const z = (py / size - 0.5) * WORLD_SIZE;

      const h = terrainHeight(x, z);
      const n = fbm(x * 0.085 + 700, z * 0.085 - 400);
      const detail = smoothNoise(px * 0.38, py * 0.38);

      let r, g, b;

      if (h > 10.5) {
        // Каменные высокогорья.
        const rock = clamp((h - 10.5) / 6, 0, 1);
        r = lerp(105, 176, rock);
        g = lerp(105, 166, rock);
        b = lerp(99, 154, rock);
      } else if (h > 7.0) {
        // Скалы и горные луга.
        r = 106 + n * 26 + detail * 14;
        g = 113 + n * 22 + detail * 10;
        b = 77 + n * 18;
      } else if (n > 0.3) {
        // Лесистые участки.
        r = 38 + detail * 22;
        g = 79 + n * 24 + detail * 19;
        b = 42 + detail * 13;
      } else if (n < -0.36) {
        // Сухие почвы.
        r = 135 + detail * 24;
        g = 119 + detail * 20;
        b = 81 + detail * 15;
      } else {
        // Травянистые равнины.
        r = 75 + detail * 21;
        g = 112 + detail * 24;
        b = 63 + detail * 16;
      }

      // Мелкая естественная неоднородность поверхности.
      const grain = (hash2(px * 2.3, py * 2.3) - 0.5) * 12;

      const i = (py * size + px) * 4;
      image.data[i] = clamp(r + grain, 0, 255);
      image.data[i + 1] = clamp(g + grain, 0, 255);
      image.data[i + 2] = clamp(b + grain, 0, 255);
      image.data[i + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);

  // Дополнительные мелкие вариации тона.
  ctx.globalAlpha = 0.10;

  for (let i = 0; i < 17000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const s = Math.random() * 2.3 + 0.3;

    ctx.fillStyle = Math.random() > 0.5
      ? "#d4c8a0"
      : "#263e28";

    ctx.fillRect(x, y, s, s);
  }

  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;

  return texture;
}

const terrainGeometry = new THREE.PlaneGeometry(
  WORLD_SIZE,
  WORLD_SIZE,
  TERRAIN_SEGMENTS,
  TERRAIN_SEGMENTS
);

terrainGeometry.rotateX(-Math.PI / 2);

const positions = terrainGeometry.attributes.position;

for (let i = 0; i < positions.count; i++) {
  const x = positions.getX(i);
  const z = positions.getZ(i);

  positions.setY(i, terrainHeight(x, z));
}

positions.needsUpdate = true;
terrainGeometry.computeVertexNormals();

const terrainTexture = createTerrainTexture();

const terrainMaterial = new THREE.MeshStandardMaterial({
  map: terrainTexture,
  roughness: 0.98,
  metalness: 0.0
});

const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
terrain.receiveShadow = false;
terrain.frustumCulled = true;
scene.add(terrain);

// ============================================================
// АТМОСФЕРНЫЙ ФОН
// ============================================================

const skyGeometry = new THREE.SphereGeometry(650, 32, 20);

const skyMaterial = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,

  vertexShader: `
    varying vec3 vWorld;
    void main() {
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorld = normalize(worldPos.xyz - cameraPosition);
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `,

  fragmentShader: `
    varying vec3 vWorld;

    void main() {
      float h = clamp(vWorld.y * 0.5 + 0.5, 0.0, 1.0);
      vec3 horizon = vec3(0.70, 0.81, 0.89);
      vec3 zenith = vec3(0.17, 0.38, 0.64);

      float t = smoothstep(0.04, 0.90, h);
      vec3 color = mix(horizon, zenith, t);

      gl_FragColor = vec4(color, 1.0);
    }
  `
});

const sky = new THREE.Mesh(skyGeometry, skyMaterial);
sky.frustumCulled = false;
scene.add(sky);

// ============================================================
// ОБЛАКА
//
// Несколько мягко затенённых объёмных фрагментов формируют
// кучевые башни. Геометрия сразу создаётся при старте,
// поэтому облака не зависят от успешности численного расчёта.
// Рост, движение и развитие формы идут во времени.
// ============================================================

const cloudRoot = new THREE.Group();
scene.add(cloudRoot);

const cloudMaterial = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  uniforms: {
    uTime: { value: 0 },
    uLight: { value: new THREE.Vector3(-0.5, 0.8, -0.4).normalize() },
    uOpacity: { value: 0.95 },
    uStorm: { value: 0.65 }
  },

  vertexShader: `
    varying vec3 vNormal;
    varying vec3 vPosition;
    varying vec3 vWorldPosition;

    void main() {
      vNormal = normalize(normalMatrix * normal);
      vPosition = position;

      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPos.xyz;

      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `,

  fragmentShader: `
    uniform float uTime;
    uniform vec3 uLight;
    uniform float uOpacity;
    uniform float uStorm;

    varying vec3 vNormal;
    varying vec3 vPosition;
    varying vec3 vWorldPosition;

    float hash(vec3 p) {
      p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
      p *= 17.0;
      return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }

    float noise(vec3 p) {
      vec3 i = floor(p);
      vec3 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);

      float n000 = hash(i);
      float n100 = hash(i + vec3(1,0,0));
      float n010 = hash(i + vec3(0,1,0));
      float n110 = hash(i + vec3(1,1,0));
      float n001 = hash(i + vec3(0,0,1));
      float n101 = hash(i + vec3(1,0,1));
      float n011 = hash(i + vec3(0,1,1));
      float n111 = hash(i + vec3(1,1,1));

      float a = mix(n000, n100, f.x);
      float b = mix(n010, n110, f.x);
      float c = mix(n001, n101, f.x);
      float d = mix(n011, n111, f.x);

      return mix(mix(a,b,f.y), mix(c,d,f.y), f.z);
    }

    void main() {
      vec3 p = vPosition;

      float n1 = noise(p * 1.7 + vec3(0.0, uTime * 0.012, 0.0));
      float n2 = noise(p * 3.7 + vec3(uTime * 0.006, 0.0, 0.0));
      float n3 = noise(p * 7.0);

      float detail = n1 * 0.48 + n2 * 0.34 + n3 * 0.18;

      float edge = 1.0 - smoothstep(0.42, 0.98, length(p));
      float density = smoothstep(0.15, 0.83, detail + edge * 0.40);

      float vertical = clamp(vNormal.y * 0.5 + 0.5, 0.0, 1.0);
      float lighting = 0.64 + max(dot(normalize(vNormal), normalize(uLight)), 0.0) * 0.36;

      vec3 shadow = vec3(0.39, 0.45, 0.53);
      vec3 bright = vec3(1.0, 0.99, 0.96);

      float sunlit = clamp(lighting + vertical * 0.12, 0.0, 1.0);
      vec3 color = mix(shadow, bright, sunlit);

      // Более тёмное основание облака.
      color *= mix(0.73, 1.0, vertical);

      float alpha = density * edge * uOpacity;
      alpha *= smoothstep(0.02, 0.25, edge);

      if (alpha < 0.025) discard;

      gl_FragColor = vec4(color, alpha);
    }
  `
});

const puffs = [];
let cloudMode = "random";
let paused = false;
let lightningEnabled = true;
let growthSpeed = 1;
let simulationTime = 0;
let lastTime = performance.now();

function makePuff(x, y, z, sx, sy, sz, phase = 0) {
  const geometry = new THREE.SphereGeometry(1, 18, 14);

  const material = cloudMaterial.clone();
  material.uniforms = THREE.UniformsUtils.clone(cloudMaterial.uniforms);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  mesh.renderOrder = 4;

  cloudRoot.add(mesh);

  puffs.push({
    mesh,
    x,
    y,
    z,
    sx,
    sy,
    sz,
    phase,
    growth: 0.15 + Math.random() * 0.20,
    baseY: y,
    seed: Math.random() * 100
  });

  return mesh;
}

function createCloudTower(cx, cz, height, width, seed = 0) {
  const levels = Math.max(5, Math.floor(height / 1.45));

  for (let i = 0; i < levels; i++) {
    const t = i / Math.max(1, levels - 1);

    const levelY = 4.4 + t * height;
    const taper = 1.0 - t * 0.48;
    const ringCount = i === 0 ? 5 : 6;

    for (let j = 0; j < ringCount; j++) {
      const angle = j / ringCount * Math.PI * 2 + seed * 0.7 + t * 0.4;
      const radius = width * (0.12 + t * 0.12);

      const x = cx + Math.cos(angle) * radius;
      const z = cz + Math.sin(angle) * radius;

      const wobble = 0.82 + Math.random() * 0.38;
      const sx = width * 0.34 * taper * wobble;
      const sy = width * 0.27 * (0.92 + Math.random() * 0.28);
      const sz = width * 0.34 * taper * wobble;

      makePuff(x, levelY + Math.random() * 0.5, z, sx, sy, sz, t);
    }

    // Центральное ядро конвективной башни.
    makePuff(
      cx + (Math.random() - 0.5) * width * 0.15,
      levelY,
      cz + (Math.random() - 0.5) * width * 0.15,
      width * 0.40 * taper,
      width * 0.34,
      width * 0.40 * taper,
      t
    );
  }

  // Кучевые выступы на вершине.
  for (let i = 0; i < 7; i++) {
    const angle = i / 7 * Math.PI * 2;
    const r = width * 0.45;

    makePuff(
      cx + Math.cos(angle) * r,
      4.4 + height + Math.random() * 1.2,
      cz + Math.sin(angle) * r,
      width * (0.30 + Math.random() * 0.12),
      width * 0.30,
      width * (0.30 + Math.random() * 0.12),
      1
    );
  }
}

function createAnvil(cx, cz, width, height) {
  // Горизонтальные слои растущей наковальни.
  for (let i = 0; i < 15; i++) {
    const side = i < 8 ? -1 : 1;
    const k = i < 8 ? i : i - 7;

    const x = cx + side * k * width * 0.25;
    const z = cz + Math.sin(i * 1.7) * width * 0.30;

    makePuff(
      x,
      height,
      z,
      width * (0.52 + Math.random() * 0.20),
      width * 0.20,
      width * (0.44 + Math.random() * 0.18),
      1.0
    );
  }

  // Верхние ледяные выступы.
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2;
    makePuff(
      cx + Math.cos(a) * width * 0.65,
      height + Math.random() * 0.9,
      cz + Math.sin(a) * width * 0.5,
      width * 0.35,
      width * 0.13,
      width * 0.32,
      1.0
    );
  }
}

function clearClouds() {
  for (const p of puffs) {
    cloudRoot.remove(p.mesh);
    p.mesh.geometry.dispose();
    p.mesh.material.dispose();
  }

  puffs.length = 0;
}

function generateStorm() {
  clearClouds();

  cloudMode = $("stormType")?.value || "random";

  const cape = Number($("cape")?.value ?? 2200);
  const shear = Number($("shear")?.value ?? 20);
  const humidity = Number($("humidity")?.value ?? 70);

  const capeFactor = clamp(cape / 3000, 0.25, 1.45);
  const moistureFactor = clamp(humidity / 70, 0.3, 1.25);
  const shearFactor = clamp(shear / 25, 0.2, 1.6);

  const baseHeight = 9 + capeFactor * 4.5;
  const baseWidth = 7 + moistureFactor * 2.5;

  if (cloudMode === "random") {
    const choices = ["tower", "supercell", "multicell", "squall"];
    cloudMode = choices[Math.floor(Math.random() * choices.length)];
  }

  if (cloudMode === "tower") {
    createCloudTower(0, 0, baseHeight, baseWidth, 1);
  } else if (cloudMode === "supercell") {
    createCloudTower(0, 0, baseHeight + 3, baseWidth * 1.15, 2);
    createAnvil(0, -1, baseWidth * 1.7, baseHeight + 4);
  } else if (cloudMode === "multicell") {
    const count = 3 + Math.floor(shearFactor * 2);

    for (let i = 0; i < count; i++) {
      const x = (i - (count - 1) / 2) * 15;
      const z = Math.sin(i * 1.7) * 10;

      createCloudTower(
        x, z,
        baseHeight * (0.65 + Math.random() * 0.5),
        baseWidth * (0.65 + Math.random() * 0.25),
        i + 3
      );
    }
  } else if (cloudMode === "squall") {
    const count = 6;

    for (let i = 0; i < count; i++) {
      const x = (i - (count - 1) / 2) * 12;

      createCloudTower(
        x,
        Math.sin(i * 0.7) * 3,
        baseHeight * (0.7 + Math.random() * 0.35),
        baseWidth * 0.72,
        i + 5
      );
    }

    createAnvil(0, 0, baseWidth * 2.2, baseHeight + 3);
  }

  // Не даём облакам провалиться под поверхность.
  for (const p of puffs) {
    p.mesh.position.y = Math.max(p.mesh.position.y, 3.8);
    p.baseY = p.mesh.position.y;
  }

  updateMetrics();
}

// ============================================================
// МОЛНИЯ
// ============================================================

const lightningGroup = new THREE.Group();
scene.add(lightningGroup);

const lightningLight = new THREE.PointLight(0xcce6ff, 0, 65, 2);
scene.add(lightningLight);

let lightningUntil = 0;

function createLightning() {
  while (lightningGroup.children.length) {
    const obj = lightningGroup.children[0];
    lightningGroup.remove(obj);

    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
  }

  const top = 15 + Math.random() * 5;
  const bottom = 5.5;

  const points = [];
  let x = (Math.random() - 0.5) * 5;
  let z = (Math.random() - 0.5) * 5;

  points.push(new THREE.Vector3(x, top, z));

  const segments = 13;

  for (let i = 1; i <= segments; i++) {
    x += (Math.random() - 0.5) * 1.6;
    z += (Math.random() - 0.5) * 1.6;

    const y = top - (top - bottom) * i / segments;
    points.push(new THREE.Vector3(x, y, z));
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color: 0xe6f5ff,
    transparent: true,
    opacity: 1
  });

  const bolt = new THREE.Line(geometry, material);
  lightningGroup.add(bolt);

  lightningLight.position.set(x, 8, z);
  lightningLight.intensity = 110;
  lightningUntil = simulationTime + 0.22;
}

function updateLightning() {
  if (!lightningEnabled) {
    lightningLight.intensity = 0;
    return;
  }

  if (simulationTime >= lightningUntil) {
    lightningLight.intensity = 0;

    if (lightningGroup.children.length) {
      const bolt = lightningGroup.children[0];
      lightningGroup.remove(bolt);
      bolt.geometry.dispose();
      bolt.material.dispose();
    }
  }

  const chance = cloudMode === "supercell" ? 0.006 : 0.002;

  if (Math.random() < chance) {
    createLightning();
  }
}

// ============================================================
// СКОРОСТЬ РАЗВИТИЯ
// ============================================================

let growthButton = $("growthSpeed");

if (!growthButton) {
  growthButton = document.createElement("button");
  growthButton.id = "growthSpeed";
  growthButton.type = "button";
  growthButton.textContent = "Рост облаков: 1×";

  Object.assign(growthButton.style, {
    position: "absolute",
    right: "14px",
    bottom: "14px",
    zIndex: "20",
    padding: "10px 14px",
    borderRadius: "12px",
    border: "1px solid rgba(255,255,255,.25)",
    background: "rgba(17,28,42,.88)",
    color: "#fff",
    font: "600 13px system-ui",
    cursor: "pointer",
    backdropFilter: "blur(8px)"
  });

  const parent = canvas.parentElement || document.body;

  if (getComputedStyle(parent).position === "static") {
    parent.style.position = "relative";
  }

  parent.appendChild(growthButton);
}

growthButton.addEventListener("click", () => {
  const speeds = [1, 2, 4, 8];
  const index = speeds.indexOf(growthSpeed);

  growthSpeed = speeds[(index + 1) % speeds.length];
  growthButton.textContent = `Рост облаков: ${growthSpeed}×`;
});

// ============================================================
// ОБНОВЛЕНИЕ ОБЛАЧНОСТИ
// ============================================================

function updateClouds(dt) {
  const cape = Number($("cape")?.value ?? 2200);
  const shear = Number($("shear")?.value ?? 20);
  const humidity = Number($("humidity")?.value ?? 70);

  const capeFactor = clamp(cape / 3000, 0.25, 1.5);
  const humidityFactor = clamp(humidity / 70, 0.25, 1.3);
  const shearFactor = clamp(shear / 25, 0.15, 1.6);

  const buoyancy = 0.15 + capeFactor * 0.40;
  const moisture = 0.25 + humidityFactor * 0.50;

  for (const p of puffs) {
    const t = p.phase;

    // Медленное движение воздушных масс.
    p.mesh.position.x += dt * growthSpeed * 0.035 * shearFactor;
    p.mesh.position.z += dt * growthSpeed * 0.012;

    // Турбулентные колебания, без резких рывков.
    p.mesh.position.y =
      p.baseY +
      Math.sin(simulationTime * 0.25 + p.seed) * 0.10;

    // Рост усиливается при большой CAPE и высокой влажности.
    const growthRate =
      0.0008 * growthSpeed * buoyancy * moisture;

    const verticalGrowth = Math.min(1.65, 1 + t * 0.45);

    p.growth = Math.min(
      2.5,
      p.growth + dt * growthRate * verticalGrowth
    );

    const scaleFactor = 1 + p.growth * 0.18;

    p.mesh.scale.set(
      p.sx * scaleFactor,
      p.sy * (1 + p.growth * 0.22),
      p.sz * scaleFactor
    );

    // Облака сохраняют объём, а не превращаются в плоскую плоскость.
    p.mesh.material.uniforms.uTime.value = simulationTime;
    p.mesh.material.uniforms.uOpacity.value =
      clamp(0.72 + humidityFactor * 0.20, 0.65, 0.97);

    p.mesh.material.uniforms.uStorm.value =
      clamp(capeFactor * 0.65 + shearFactor * 0.25, 0, 1);
  }
}

// ============================================================
// ИНТЕРФЕЙС
// ============================================================

function updateMetrics() {
  const cape = Number($("cape")?.value ?? 2200);
  const shear = Number($("shear")?.value ?? 20);
  const humidity = Number($("humidity")?.value ?? 70);

  if ($("capeValue")) $("capeValue").textContent = `${cape}`;
  if ($("shearValue")) $("shearValue").textContent = `${shear}`;
  if ($("humidityValue")) $("humidityValue").textContent = `${humidity}`;

  if ($("cloudHeight")) {
    const height = Math.round(9 + clamp(cape / 3000, 0.25, 1.5) * 4.5);
    $("cloudHeight").textContent = `${height} км`;
  }

  if ($("cellCount")) {
    const cells = cloudMode === "multicell" ? 4
      : cloudMode === "squall" ? 6 : 1;

    $("cellCount").textContent = `${cells}`;
  }

  if ($("status")) {
    $("status").textContent = paused ? "Пауза" : "Симуляция";
  }
}

for (const id of ["cape", "shear", "humidity"]) {
  $(id)?.addEventListener("input", updateMetrics);
}

$("newStorm")?.addEventListener("click", generateStorm);

$("pause")?.addEventListener("click", () => {
  paused = !paused;

  const button = $("pause");
  if (button) button.textContent = paused ? "Продолжить" : "Пауза";

  updateMetrics();
});

$("lightning")?.addEventListener("click", () => {
  lightningEnabled = !lightningEnabled;

  if (!lightningEnabled) {
    lightningLight.intensity = 0;
  }

  const button = $("lightning");
  if (button) {
    button.textContent = lightningEnabled
      ? "Молнии: вкл."
      : "Молнии: выкл.";
  }
});

$("reset")?.addEventListener("click", () => {
  camera.position.set(65, 48, 95);
  controls.target.set(0, 12, 0);
  controls.update();

  generateStorm();
});

// ============================================================
// ИЗМЕНЕНИЕ РАЗМЕРА ОКНА
// ============================================================

function resize() {
  const width = canvas.clientWidth || innerWidth;
  const height = canvas.clientHeight || innerHeight;

  camera.aspect = width / Math.max(1, height);
  camera.updateProjectionMatrix();

  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
}

window.addEventListener("resize", resize);

// ============================================================
// ОСНОВНОЙ ЦИКЛ
// ============================================================

function animate(now) {
  requestAnimationFrame(animate);

  const realDt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  if (!paused) {
    simulationTime += realDt * growthSpeed;
    updateClouds(realDt);
    updateLightning();
  }

  // Небо следует за камерой, не смещая горизонт.
  sky.position.copy(camera.position);

  controls.update();
  renderer.render(scene, camera);
}

// ============================================================
// ЗАПУСК
// ============================================================

try {
  generateStorm();
  updateMetrics();

  if (loading) loading.style.display = "none";

  requestAnimationFrame(animate);
} catch (error) {
  console.error("Quantum Meteo:", error);

  if (loadingTitle) loadingTitle.textContent = "Ошибка симуляции";
  if (loadingText) loadingText.textContent = error.message;

  if (typeof window.showStormError === "function") {
    window.showStormError(error);
  }
}
