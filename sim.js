
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/controls/OrbitControls.js";

// ============================================================
// QUANTUM STORM — PROCEDURAL 3D THUNDERSTORM SIMULATOR
// Никаких карт, изображений, API или готовых моделей.
// ============================================================

const $ = id => document.getElementById(id);

const canvas = $("scene");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8db5d2);
scene.fog = new THREE.Fog(0x9ab7c9, 170, 360);

let renderer;

try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: window.devicePixelRatio < 2,
    powerPreference: "high-performance",
    alpha: false
  });
} catch (error) {
  throw new Error("WebGL недоступен в этом браузере: " + error.message);
}

renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const camera = new THREE.PerspectiveCamera(
  53,
  window.innerWidth / window.innerHeight,
  0.1,
  900
);

camera.position.set(92, 66, 112);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 29, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 28;
controls.maxDistance = 260;
controls.maxPolarAngle = Math.PI * 0.49;
controls.autoRotate = false;
controls.update();

// ============================================================
// LIGHTING
// ============================================================

const ambient = new THREE.HemisphereLight(0xdceeff, 0x4a5b32, 2.0);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xfff0d3, 3.0);
sun.position.set(-70, 120, 45);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -100;
sun.shadow.camera.right = 100;
sun.shadow.camera.top = 120;
sun.shadow.camera.bottom = -100;
scene.add(sun);

// ============================================================
// PROCEDURAL SKY — GENERATED SHADER, NOT AN IMAGE
// ============================================================

const skyGeometry = new THREE.SphereGeometry(450, 32, 20);

const skyMaterial = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  uniforms: {
    topColor: { value: new THREE.Color(0x245078) },
    middleColor: { value: new THREE.Color(0x8eb8d0) },
    bottomColor: { value: new THREE.Color(0xd0dce0) },
    stormDarkness: { value: 0.0 }
  },
  vertexShader: `
    varying vec3 vPosition;
    void main() {
      vPosition = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    varying vec3 vPosition;
    uniform vec3 topColor;
    uniform vec3 middleColor;
    uniform vec3 bottomColor;
    uniform float stormDarkness;

    void main() {
      float h = clamp(vPosition.y * 0.5 + 0.5, 0.0, 1.0);
      vec3 sky = mix(bottomColor, middleColor, smoothstep(0.0, 0.55, h));
      sky = mix(sky, topColor, smoothstep(0.48, 1.0, h));
      sky = mix(sky, vec3(0.19, 0.22, 0.28), stormDarkness * 0.68);
      gl_FragColor = vec4(sky, 1.0);
    }
  `
});

const sky = new THREE.Mesh(skyGeometry, skyMaterial);
sky.renderOrder = -10;
scene.add(sky);

// ============================================================
// SQUARE GRASS TERRAIN
// ============================================================

const groundGroup = new THREE.Group();
scene.add(groundGroup);

const terrainSize = 180;
const terrainSegments = 100;
const terrainGeometry = new THREE.PlaneGeometry(
  terrainSize,
  terrainSize,
  terrainSegments,
  terrainSegments
);

terrainGeometry.rotateX(-Math.PI / 2);

const positions = terrainGeometry.attributes.position;

function terrainHeight(x, z) {
  return (
    Math.sin(x * 0.075) * 0.22 +
    Math.cos(z * 0.09) * 0.18 +
    Math.sin((x + z) * 0.045) * 0.16
  );
}

for (let i = 0; i < positions.count; i++) {
  const x = positions.getX(i);
  const z = positions.getZ(i);
  positions.setY(i, terrainHeight(x, z));
}

terrainGeometry.computeVertexNormals();

const terrainMaterial = new THREE.MeshStandardMaterial({
  color: 0x557d38,
  roughness: 1,
  metalness: 0
});

const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
terrain.receiveShadow = true;
groundGroup.add(terrain);

// Darker square sides make the terrain visibly 3D.
const base = new THREE.Mesh(
  new THREE.BoxGeometry(terrainSize, 3, terrainSize),
  new THREE.MeshStandardMaterial({ color: 0x344a2c, roughness: 1 })
);
base.position.y = -1.65;
base.receiveShadow = true;
groundGroup.add(base);

// Individual grass blades, generated with InstancedMesh for performance.
const grassGeometry = new THREE.ConeGeometry(0.12, 0.85, 3);
grassGeometry.translate(0, 0.42, 0);

const grassMaterial = new THREE.MeshStandardMaterial({
  color: 0x6d9945,
  roughness: 1,
  side: THREE.DoubleSide
});

const grassCount = 2600;
const grass = new THREE.InstancedMesh(
  grassGeometry,
  grassMaterial,
  grassCount
);

grass.frustumCulled = false;

const dummy = new THREE.Object3D();
const bladeColor = new THREE.Color();

for (let i = 0; i < grassCount; i++) {
  const x = (Math.random() - 0.5) * (terrainSize - 3);
  const z = (Math.random() - 0.5) * (terrainSize - 3);
  const y = terrainHeight(x, z);

  dummy.position.set(x, y, z);
  dummy.rotation.set(
    (Math.random() - 0.5) * 0.24,
    Math.random() * Math.PI,
    (Math.random() - 0.5) * 0.3
  );

  const scale = 0.5 + Math.random() * 1.3;
  dummy.scale.set(scale, scale, scale);
  dummy.updateMatrix();

  grass.setMatrixAt(i, dummy.matrix);

  const shade = 0.72 + Math.random() * 0.5;
  bladeColor.setRGB(0.30 * shade, 0.49 * shade, 0.17 * shade);
  grass.setColorAt(i, bladeColor);
}

grass.instanceMatrix.needsUpdate = true;
if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
groundGroup.add(grass);

// Square edge markers.
const edgeMaterial = new THREE.LineBasicMaterial({
  color: 0x9bc278,
  transparent: true,
  opacity: 0.65
});

const half = terrainSize / 2;
const edgePoints = [
  new THREE.Vector3(-half, 0.3, -half),
  new THREE.Vector3(half, 0.3, -half),
  new THREE.Vector3(half, 0.3, half),
  new THREE.Vector3(-half, 0.3, half),
  new THREE.Vector3(-half, 0.3, -half)
];

const edge = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints(edgePoints),
  edgeMaterial
);
groundGroup.add(edge);

// ============================================================
// PROCEDURAL CLOUD GEOMETRY
// ============================================================

const cloudRoot = new THREE.Group();
scene.add(cloudRoot);

const cloudGeometry = new THREE.IcosahedronGeometry(1, 2);

const cloudMaterials = [
  new THREE.MeshStandardMaterial({
    color: 0xeeeeea,
    roughness: 1,
    flatShading: false
  }),
  new THREE.MeshStandardMaterial({
    color: 0xc5cbd0,
    roughness: 1,
    flatShading: false
  }),
  new THREE.MeshStandardMaterial({
    color: 0x858e9a,
    roughness: 1,
    flatShading: false
  }),
  new THREE.MeshStandardMaterial({
    color: 0x515b6b,
    roughness: 1,
    flatShading: false
  })
];

const stormCells = [];
const lightningBolts = [];
const clock = new THREE.Clock();

let paused = false;
let lightningEnabled = true;
let lightningTimer = 0;
let worldTime = 0;
let currentPreset = "random";
let cellSerial = 0;

const random = (min, max) => min + Math.random() * (max - min);
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function makePuff(parent, x, y, z, sx, sy, sz, materialIndex) {
  const mesh = new THREE.Mesh(
    cloudGeometry,
    cloudMaterials[materialIndex]
  );

  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);

  mesh.rotation.set(
    random(-0.2, 0.2),
    random(0, Math.PI * 2),
    random(-0.2, 0.2)
  );

  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);

  return {
    mesh,
    baseX: x,
    baseY: y,
    baseZ: z,
    sx,
    sy,
    sz,
    phase: random(0, Math.PI * 2),
    drift: random(0.2, 1.0)
  };
}

function makeCell(x, z, strength, options = {}) {
  const group = new THREE.Group();
  cloudRoot.add(group);

  const cell = {
    id: ++cellSerial,
    group,
    x,
    z,
    strength,
    puffs: [],
    anvil: null,
    age: random(0, 20),
    growth: random(0.35, 0.85),
    driftX: random(-1, 1),
    driftZ: random(-1, 1),
    rotationSpeed: random(-0.025, 0.025),
    top: 0,
    base: 0
  };

  const cape = Number($("cape").value);
  const humidity = Number($("humidity").value);
  const shear = Number($("shear").value);

  const height = 27 + (cape / 5000) * 43 + random(-5, 9);
  const width = 8 + (humidity / 100) * 8 + strength * 4;

  cell.base = 7 + random(-1, 2);
  cell.top = height;

  // Main growing tower.
  const layers = Math.round(6 + height / 5);

  for (let i = 0; i < layers; i++) {
    const t = i / Math.max(1, layers - 1);
    const y = cell.base + t * (height - cell.base);
    const radius = width * (0.28 + 0.7 * Math.sin((t * 0.88 + 0.12) * Math.PI / 2));

    const around = Math.round(5 + strength * 2);

    for (let j = 0; j < around; j++) {
      const a = (j / around) * Math.PI * 2 + random(-0.18, 0.18);
      const r = radius * random(0.3, 0.85);

      const materialIndex =
        t > 0.72 ? (Math.random() < 0.52 ? 0 : 1) :
        t > 0.35 ? (Math.random() < 0.35 ? 1 : 2) : 3;

      const puff = makePuff(
        group,
        Math.cos(a) * r,
        y + random(-1.8, 1.8),
        Math.sin(a) * r,
        random(3.3, 6.8) * (1 + t * 0.2),
        random(3.2, 6.8),
        random(3.3, 6.8),
        materialIndex
      );

      cell.puffs.push(puff);
    }
  }

  // Bright cauliflower towers near the top.
  for (let i = 0; i < 18 + Math.round(strength * 7); i++) {
    const a = random(0, Math.PI * 2);
    const r = random(0, width * 0.75);
    const y = height - random(0, 7);

    cell.puffs.push(makePuff(
      group,
      Math.cos(a) * r,
      y,
      Math.sin(a) * r,
      random(3, 7),
      random(3, 6),
      random(3, 7),
      Math.random() < 0.7 ? 0 : 1
    ));
  }

  // Broad anvil spreading downwind when shear is stronger.
  const anvilGroup = new THREE.Group();
  anvilGroup.position.y = height - 2;
  group.add(anvilGroup);
  cell.anvil = anvilGroup;

  const anvilWidth = 12 + shear * 0.72;
  const anvilLength = 9 + shear * 0.55;
  const direction = options.direction ?? random(-1, 1);

  const centerPuff = makePuff(
    anvilGroup,
    direction * anvilLength * 0.18,
    0,
    0,
    anvilWidth * 0.85,
    3.2,
    anvilWidth * 0.7,
    1
  );
  cell.puffs.push(centerPuff);

  for (let i = 0; i < 13; i++) {
    const t = i / 12;
    const side = random(-1, 1);
    const puff = makePuff(
      anvilGroup,
      direction * t * anvilLength + random(-2, 2),
      random(-1.2, 1.2),
      side * anvilWidth * t * 0.6,
      random(4, 8) * (1 - t * 0.25),
      random(1.8, 3.7),
      random(4, 8) * (1 - t * 0.3),
      Math.random() < 0.55 ? 0 : 1
    );
    cell.puffs.push(puff);
  }

  // Dark underside of the storm.
  for (let i = 0; i < 12; i++) {
    const a = random(0, Math.PI * 2);
    const r = random(3, width * 1.05);

    cell.puffs.push(makePuff(
      group,
      Math.cos(a) * r,
      cell.base + random(0, 4),
      Math.sin(a) * r,
      random(4, 8),
      random(2, 4),
      random(4, 8),
      3
    ));
  }

  group.position.set(x, 0, z);
  stormCells.push(cell);
  return cell;
}

// ============================================================
// RANDOM STORM GENERATION
// ============================================================

function clearStorm() {
  for (const cell of stormCells) {
    cloudRoot.remove(cell.group);
  }
  stormCells.length = 0;

  for (const bolt of lightningBolts) {
    scene.remove(bolt.line);
    bolt.line.geometry.dispose();
    bolt.line.material.dispose();
  }
  lightningBolts.length = 0;

  lightningTimer = 1;
}

function generateStorm(preset = "random") {
  clearStorm();

  currentPreset = preset;
  const cape = Number($("cape").value);
  const shear = Number($("shear").value);
  const humidity = Number($("humidity").value);

  if (preset === "random") {
    const presets = ["tower", "supercell", "multicell", "squall"];
    preset = presets[Math.floor(Math.random() * presets.length)];
  }

  const power = clamp(cape / 2500, 0.25, 2.2);
  const moisture = humidity / 100;

  if (preset === "tower") {
    makeCell(random(-7, 7), random(-5, 5), 1.1 + power * 0.45);
  }

  if (preset === "supercell") {
    const cell = makeCell(0, 0, 1.7 + power * 0.45, {
      direction: shear >= 18 ? 1 : random(-1, 1)
    });

    // A flanking tower gives the storm a less symmetrical structure.
    makeCell(-19, 10, 0.65 + moisture * 0.3);
    cell.driftX = shear > 15 ? 0.7 : 0.2;
  }

  if (preset === "multicell") {
    const count = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      makeCell(
        random(-34, 34),
        random(-28, 28),
        0.65 + power * random(0.2, 0.8)
      );
    }
  }

  if (preset === "squall") {
    const count = 5 + Math.floor(Math.random() * 3);
    const angle = random(-0.35, 0.35);

    for (let i = 0; i < count; i++) {
      const t = i - (count - 1) / 2;
      const x = Math.cos(angle) * t * random(9, 13);
      const z = Math.sin(angle) * t * random(9, 13);

      makeCell(
        x,
        z,
        0.7 + power * random(0.15, 0.55),
        { direction: shear > 12 ? 1 : random(-1, 1) }
      );
    }
  }

  // A new random seed of storm structure is created each time.
  cloudRoot.rotation.y = random(-0.18, 0.18);
  $("status").textContent =
    "Сгенерировано: " + presetLabel(preset) +
    ". Структура и движение ячеек случайны.";

  updateMetrics();
}

function presetLabel(preset) {
  return {
    tower: "мощная башня",
    supercell: "суперячейка",
    multicell: "мультиячейковая гроза",
    squall: "шкваловая линия",
    random: "случайная гроза"
  }[preset] || preset;
}

// ============================================================
// LIGHTNING — 3D GEOMETRY
// ============================================================

function createLightning() {
  if (!lightningEnabled || stormCells.length === 0) return;

  const cell = stormCells[Math.floor(Math.random() * stormCells.length)];
  const start = new THREE.Vector3(
    cell.x + random(-5, 5),
    cell.top - random(0, 5),
    cell.z + random(-5, 5)
  );

  const end = new THREE.Vector3(
    start.x + random(-13, 13),
    random(0.5, 2.5),
    start.z + random(-13, 13)
  );

  const points = [start.clone()];
  const segments = 12;
  const dx = (end.x - start.x) / segments;
  const dy = (end.y - start.y) / segments;
  const dz = (end.z - start.z) / segments;

  for (let i = 1; i < segments; i++) {
    points.push(new THREE.Vector3(
      start.x + dx * i + random(-2.5, 2.5),
      start.y + dy * i,
      start.z + dz * i + random(-2.5, 2.5)
    ));
  }
  points.push(end);

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color: 0xc7e8ff,
    transparent: true,
    opacity: 1
  });

  const line = new THREE.Line(geometry, material);
  line.frustumCulled = false;
  scene.add(line);

  lightningBolts.push({
    line,
    life: 0,
    duration: random(0.12, 0.28)
  });

  // Occasional secondary branch.
  if (Math.random() < 0.65 && points.length > 6) {
    const branchStart = points[Math.floor(random(4, points.length - 2))];
    const branchEnd = branchStart.clone().add(
      new THREE.Vector3(random(-9, 9), -random(7, 15), random(-9, 9))
    );

    const branchGeometry = new THREE.BufferGeometry().setFromPoints([
      branchStart.clone(),
      branchStart.clone().lerp(branchEnd, 0.45).add(
        new THREE.Vector3(random(-2, 2), 0, random(-2, 2))
      ),
      branchEnd
    ]);

    const branchMaterial = new THREE.LineBasicMaterial({
      color: 0x8fcaff,
      transparent: true,
      opacity: 0.9
    });

    const branch = new THREE.Line(branchGeometry, branchMaterial);
    scene.add(branch);

    lightningBolts.push({
      line: branch,
      life: 0,
      duration: random(0.08, 0.2)
    });
  }
}

function updateLightning(dt) {
  lightningTimer -= dt;

  if (lightningEnabled && lightningTimer <= 0) {
    const cape = Number($("cape").value);
    const humidity = Number($("humidity").value);

    if (Math.random() < 0.35 + cape / 8000 + humidity / 500) {
      createLightning();
    }

    lightningTimer = random(0.5, 3.2) / (0.6 + cape / 3500);
  }

  for (let i = lightningBolts.length - 1; i >= 0; i--) {
    const bolt = lightningBolts[i];
    bolt.life += dt;

    const remaining = 1 - bolt.life / bolt.duration;
    bolt.line.material.opacity = Math.max(0, remaining);

    if (bolt.life >= bolt.duration) {
      scene.remove(bolt.line);
      bolt.line.geometry.dispose();
      bolt.line.material.dispose();
      lightningBolts.splice(i, 1);
    }
  }
}

// ============================================================
// ATMOSPHERE AND ANIMATION
// ============================================================

function updateAtmosphere() {
  const cape = Number($("cape").value);
  const humidity = Number($("humidity").value);
  const shear = Number($("shear").value);

  const darkness = clamp(
    (cape / 5000) * 0.42 +
    (humidity / 100) * 0.22 +
    (shear / 40) * 0.16,
    0,
    0.72
  );

  skyMaterial.uniforms.stormDarkness.value = darkness;

  sun.intensity = 3.0 - darkness * 1.8;
  ambient.intensity = 2.0 - darkness * 0.65;

  scene.fog.color.setRGB(
    0.60 - darkness * 0.23,
    0.72 - darkness * 0.24,
    0.79 - darkness * 0.20
  );
}

function updateMetrics() {
  let maxHeight = 0;

  for (const cell of stormCells) {
    maxHeight = Math.max(maxHeight, cell.top);
  }

  $("cloudHeight").textContent = (maxHeight / 10).toFixed(1) + " км";
  $("cellCount").textContent = String(stormCells.length);
}

function updateStorm(dt) {
  for (const cell of stormCells) {
    cell.age += dt * cell.growth;

    // Clouds drift and rotate gradually; they do not follow a fixed script.
    cell.group.position.x += cell.driftX * dt * 0.65;
    cell.group.position.z += cell.driftZ * dt * 0.65;
    cell.group.rotation.y += cell.rotationSpeed * dt;

    for (const puff of cell.puffs) {
      const t = worldTime * 0.55 + puff.phase;

      puff.mesh.position.x =
        puff.baseX + Math.sin(t) * 0.12 * puff.drift;
      puff.mesh.position.y =
        puff.baseY + Math.sin(t * 0.8) * 0.22 * puff.drift;
      puff.mesh.position.z =
        puff.baseZ + Math.cos(t * 0.75) * 0.12 * puff.drift;
    }
  }
}

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.05);

  if (!paused) {
    worldTime += dt;
    updateStorm(dt);
    updateLightning(dt);
  }

  controls.update();
  renderer.render(scene, camera);
}

// ============================================================
// UI
// ============================================================

$("newStorm").addEventListener("click", () => {
  generateStorm($("stormType").value);
});

$("pause").addEventListener("click", () => {
  paused = !paused;
  $("pause").textContent = paused ? "Продолжить" : "Пауза";
  $("status").textContent = paused
    ? "Симуляция приостановлена."
    : "Симуляция продолжается.";
});

$("lightning").addEventListener("click", () => {
  lightningEnabled = !lightningEnabled;
  $("lightning").textContent =
    "Молния: " + (lightningEnabled ? "вкл." : "выкл.");
});

function bindSlider(id, outputId, format) {
  const input = $(id);
  const output = $(outputId);

  input.addEventListener("input", () => {
    output.textContent = format(Number(input.value));
    updateAtmosphere();
  });

  input.addEventListener("change", () => {
    // Atmospheric settings affect the next generated storm.
    $("status").textContent =
      "Параметры обновлены. Создай новую грозу, чтобы применить их к структуре облаков.";
  });
}

bindSlider("cape", "capeValue", v => `${v} Дж/кг`);
bindSlider("shear", "shearValue", v => `${v} м/с`);
bindSlider("humidity", "humidityValue", v => `${v}%`);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
});

// ============================================================
// START
// ============================================================

updateAtmosphere();
generateStorm("random");
animate();

$("status").textContent =
  "3D-сцена загружена. Выбери тип грозы или сгенерируй случайную.";

window.hideStormLoading();
