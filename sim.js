
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/controls/OrbitControls.js";

// ============================================================
// QUANTUM METEO — STORM LAB 3D
// Процедурная визуальная модель грозовой конвекции
// ============================================================

const $ = id => document.getElementById(id);
const sceneElement = $("scene");
const loadingElement = $("loading");

let scene, camera, renderer, controls, clock;
let stormRoot, cloudRoot, groundGrid, lightningGroup;
let cells = [];
let particles = [];
let lightningBolts = [];
let environment;
let stormType = "random";
let paused = false;
let autoRotate = false;
let simTime = 0;
let elapsed = 0;
let flash = 0;
let currentHeight = 9.8;
let lastLightning = 0;
let disposed = false;

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

const params = {
  cape: 1850,
  shear: 24,
  humidity: 68
};

const presets = {
  supercell: {
    name: "SUPERCELL",
    desc: "Вращающийся восходящий поток",
    cells: 1
  },
  multicell: {
    name: "MULTICELL",
    desc: "Взаимодействующие конвективные ячейки",
    cells: 4
  },
  pulse: {
    name: "PULSE STORM",
    desc: "Импульсное развитие конвекции",
    cells: 1
  },
  squall: {
    name: "SQUALL LINE",
    desc: "Линейная грозовая система",
    cells: 7
  }
};

// ============================================================
// INIT
// ============================================================

function init() {
  try {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x7e9db8);
    scene.fog = new THREE.FogExp2(0x91a9bc, 0.006);

    camera = new THREE.PerspectiveCamera(
      48,
      sceneElement.clientWidth / sceneElement.clientHeight,
      0.1,
      500
    );

    camera.position.set(25, 17, 31);

    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance"
    });

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    renderer.setSize(
      sceneElement.clientWidth,
      sceneElement.clientHeight
    );

    renderer.shadowMap.enabled = false;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;

    sceneElement.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enablePan = true;
    controls.minDistance = 8;
    controls.maxDistance = 100;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.target.set(0, 9, 0);
    controls.autoRotate = false;
    controls.autoRotateSpeed = 0.35;

    clock = new THREE.Clock();

    const hemi = new THREE.HemisphereLight(0xdceeff, 0x394553, 2.1);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff2dc, 3.1);
    sun.position.set(-24, 35, 15);
    scene.add(sun);

    const fill = new THREE.DirectionalLight(0x8bbdff, 1.0);
    fill.position.set(25, 15, -25);
    scene.add(fill);

    createAtmosphere();
    createGrid();

    stormRoot = new THREE.Group();
    scene.add(stormRoot);

    cloudRoot = new THREE.Group();
    stormRoot.add(cloudRoot);

    lightningGroup = new THREE.Group();
    stormRoot.add(lightningGroup);

    bindControls();
    generateStorm("random");

    window.addEventListener("resize", onResize);

    loadingElement.classList.add("hide");
    requestAnimationFrame(animate);
  } catch (error) {
    console.error("Storm Lab initialization error:", error);
    loadingElement.innerHTML =
      '<div class="error">Не удалось запустить 3D-сцену. ' +
      'Проверь поддержку WebGL и доступ к CDN Three.js, ' +
      'а затем перезагрузи страницу.</div>';
  }
}

// ============================================================
// SKY AND REFERENCE GRID
// ============================================================

function createAtmosphere() {
  const skyGeometry = new THREE.SphereGeometry(180, 24, 16);
  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x173957) },
      horizonColor: { value: new THREE.Color(0xc1d1dc) },
      bottomColor: { value: new THREE.Color(0x607a90) }
    },
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = normalize(world.xyz);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform vec3 bottomColor;
      varying vec3 vWorld;
      void main() {
        float h = clamp(vWorld.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 color = mix(bottomColor, horizonColor, smoothstep(0.12, 0.55, h));
        color = mix(color, topColor, smoothstep(0.48, 0.9, h));
        gl_FragColor = vec4(color, 1.0);
      }
    `
  });

  const sky = new THREE.Mesh(skyGeometry, skyMaterial);
  sky.renderOrder = -10;
  scene.add(sky);

  environment = { sky, skyMaterial };
}

function createGrid() {
  groundGrid = new THREE.Group();

  const grid = new THREE.GridHelper(100, 40, 0x7897b1, 0x46617a);
  grid.position.y = 0;
  grid.material.transparent = true;
  grid.material.opacity = 0.2;

  groundGrid.add(grid);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(180, 180),
    new THREE.MeshBasicMaterial({
      color: 0x718b9e,
      transparent: true,
      opacity: 0.16,
      depthWrite: false
    })
  );

  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.08;
  groundGrid.add(ground);
  scene.add(groundGrid);
}

// ============================================================
// CLOUD MATERIAL
// ============================================================

const cloudGeometry = new THREE.SphereGeometry(1, 9, 7);

function makeCloudMaterial(seed) {
  return new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
    flatShading: false
  });
}

function createPuff(parent, x, y, z, sx, sy, sz, seed) {
  const mesh = new THREE.Mesh(
    cloudGeometry,
    makeCloudMaterial(seed)
  );

  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);

  mesh.userData.base = {
    x, y, z, sx, sy, sz,
    phase: rand(0, Math.PI * 2),
    speed: rand(0.3, 1.0)
  };

  parent.add(mesh);
  return mesh;
}

// ============================================================
// CLOUD SHAPE GENERATION
// ============================================================

function clearStorm() {
  for (const cell of cells) {
    for (const puff of cell.puffs) {
      puff.material.dispose();
    }
  }

  cloudRoot.clear();
  lightningGroup.clear();
  cells = [];
  particles = [];
  lightningBolts = [];
}

function makeCell(options = {}) {
  const group = new THREE.Group();
  cloudRoot.add(group);

  const puffs = [];
  const type = options.type || stormType;
  const x = options.x ?? rand(-8, 8);
  const z = options.z ?? rand(-5, 5);
  const scale = options.scale ?? rand(0.8, 1.3);
  const seed = Math.random() * 10000;

  group.position.set(x, 0, z);

  const maxHeight =
    5.0 +
    params.cape / 5000 * 8.5 +
    params.humidity / 100 * 2.5;

  const towerHeight = clamp(maxHeight * scale, 4, 18);
  const width = rand(2.0, 3.3) * scale;

  const cell = {
    group,
    puffs,
    x,
    z,
    scale,
    type,
    seed,
    towerHeight,
    width,
    age: rand(0, 0.7),
    growth: rand(0.25, 0.7),
    drift: rand(-0.7, 0.7),
    spin: rand(-1, 1),
    phase: rand(0, Math.PI * 2),
    strength: rand(0.6, 1.2),
    anvil: null,
    top: null
  };

  // Main convective tower: increasingly broad clusters with height.
  const layers = Math.max(8, Math.floor(towerHeight * 2.4));

  for (let i = 0; i < layers; i++) {
    const t = i / (layers - 1);
    const y = 1.0 + t * towerHeight;

    const baseRadius =
      width *
      (0.55 + 0.42 * Math.sin(t * Math.PI * 0.9)) *
      (0.8 + Math.random() * 0.5);

    const count = Math.floor(4 + baseRadius * 2.2);

    for (let j = 0; j < count; j++) {
      const angle = rand(0, Math.PI * 2);
      const radius = baseRadius * Math.sqrt(Math.random());

      const px = Math.cos(angle) * radius;
      const pz = Math.sin(angle) * radius;

      const lobe = rand(0.65, 1.35) * (1 - t * 0.12);

      const puff = createPuff(
        group,
        px,
        y + rand(-0.45, 0.45),
        pz,
        lobe,
        lobe * rand(0.8, 1.3),
        lobe,
        seed + i * 100 + j
      );

      puffs.push(puff);
    }
  }

  // Broad cauliflower crown.
  const crownY = towerHeight * 0.76;
  const crownCount = type === "squall" ? 15 : 24;

  for (let i = 0; i < crownCount; i++) {
    const angle = rand(0, Math.PI * 2);
    const radius = rand(0, width * 1.6);

    const puff = createPuff(
      group,
      Math.cos(angle) * radius,
      crownY + rand(-0.7, 1.4),
      Math.sin(angle) * radius,
      rand(0.8, 1.7) * scale,
      rand(0.65, 1.4) * scale,
      rand(0.8, 1.7) * scale,
      seed + i * 19
    );

    puffs.push(puff);
  }

  // Anvil: wind-driven horizontal outflow near the tropopause.
  if (type !== "pulse" || Math.random() > 0.35) {
    const anvilGroup = new THREE.Group();
    anvilGroup.position.y = towerHeight * 0.84;
    group.add(anvilGroup);

    const anvilLength =
      (5 + params.shear * 0.28) * scale;

    const anvilWidth = width * 1.65;

    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 24; i++) {
        const t = i / 23;
        const puff = createPuff(
          anvilGroup,
          side * t * anvilLength,
          rand(-0.3, 0.5) - t * 0.2,
          rand(-anvilWidth, anvilWidth) * (1 - t * 0.2),
          rand(0.65, 1.4) * scale,
          rand(0.35, 0.75) * scale,
          rand(0.65, 1.35) * scale,
          seed + 500 + i * side
        );

        puffs.push(puff);
      }
    }

    // Flared outer anvil lobes.
    for (let i = 0; i < 12; i++) {
      const angle = rand(0, Math.PI * 2);
      const radius = rand(width, width * 3.2);

      puffs.push(createPuff(
        anvilGroup,
        Math.cos(angle) * radius,
        rand(-0.45, 0.3),
        Math.sin(angle) * radius,
        rand(0.8, 1.6),
        rand(0.3, 0.7),
        rand(0.7, 1.4),
        seed + 800 + i
      ));
    }

    cell.anvil = anvilGroup;
  }

  // Ragged cloud fragments around the storm base.
  for (let i = 0; i < 13; i++) {
    const angle = rand(0, Math.PI * 2);
    const radius = rand(width * 1.1, width * 2.4);

    puffs.push(createPuff(
      group,
      Math.cos(angle) * radius,
      rand(0.3, 2.2),
      Math.sin(angle) * radius,
      rand(0.45, 1.1),
      rand(0.35, 0.8),
      rand(0.45, 1.1),
      seed + 1100 + i
    ));
  }

  cell.top = towerHeight;
  cells.push(cell);
  return cell;
}

// ============================================================
// STORM GENERATOR
// ============================================================

function generateStorm(requestedType = "random") {
  clearStorm();

  stormType = requestedType;

  if (stormType === "random") {
    const types = ["supercell", "multicell", "pulse", "squall"];
    stormType = types[Math.floor(Math.random() * types.length)];
  }

  const preset = presets[stormType] || presets.supercell;

  $("stormName").textContent = preset.name;
  $("stormDesc").textContent = preset.desc;

  document.querySelectorAll(".preset").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.type === requestedType
    );
  });

  const count = preset.cells;

  if (stormType === "supercell") {
    makeCell({
      x: 0,
      z: 0,
      scale: rand(1.1, 1.5),
      type: stormType
    });
  } else if (stormType === "multicell") {
    for (let i = 0; i < count; i++) {
      makeCell({
        x: (i - (count - 1) / 2) * rand(4.5, 6.2),
        z: rand(-4, 4),
        scale: rand(0.65, 1.15),
        type: stormType
      });
    }
  } else if (stormType === "squall") {
    const spacing = 4.1;

    for (let i = 0; i < count; i++) {
      makeCell({
        x: (i - (count - 1) / 2) * spacing,
        z: rand(-1.5, 1.5),
        scale: rand(0.65, 1.0),
        type: stormType
      });
    }
  } else {
    makeCell({
      x: rand(-3, 3),
      z: rand(-3, 3),
      scale: rand(0.7, 1.15),
      type: stormType
    });
  }

  // Each regeneration gets a different environment and morphology.
  simTime = 0;
  elapsed = 0;
  lastLightning = 0;
  flash = 0;

  updateMetrics();
}

// ============================================================
// ENVIRONMENT CONTROLS
// ============================================================

function bindControls() {
  $("newStorm").addEventListener("click", () => {
    generateStorm($("activeType")?.value || "random");
  });

  document.querySelectorAll(".preset").forEach(button => {
    button.addEventListener("click", () => {
      generateStorm(button.dataset.type);
    });
  });

  $("cape").addEventListener("input", event => {
    params.cape = Number(event.target.value);
    $("capeOut").textContent = params.cape + " J/kg";
    updateMetrics();
    updateCloudResponse();
  });

  $("shear").addEventListener("input", event => {
    params.shear = Number(event.target.value);
    $("shearOut").textContent = params.shear + " m/s";
    updateMetrics();
    updateCloudResponse();
  });

  $("humidity").addEventListener("input", event => {
    params.humidity = Number(event.target.value);
    $("humidityOut").textContent = params.humidity + "%";
    updateMetrics();
    updateCloudResponse();
  });

  $("pause").addEventListener("click", () => {
    paused = !paused;
    $("pause").textContent = paused ? "▶ Продолжить" : "Ⅱ Пауза";
    if (paused) clock.getDelta();
  });

  $("resetCamera").addEventListener("click", () => {
    camera.position.set(25, 17, 31);
    controls.target.set(0, 9, 0);
    controls.update();
  });

  $("rotate").addEventListener("click", () => {
    autoRotate = !autoRotate;
    controls.autoRotate = autoRotate;
    $("rotate").textContent =
      "↻ Автовращение: " + (autoRotate ? "вкл." : "выкл.");
  });
}

function updateMetrics() {
  $("capeValue").textContent = Math.round(params.cape);
  $("shearValue").textContent = Math.round(params.shear);
  $("humidityValue").textContent = Math.round(params.humidity);
  $("heightValue").textContent = currentHeight.toFixed(1);
}

function updateCloudResponse() {
  const energy = params.cape / 5000;
  const moisture = params.humidity / 100;
  const rotation = params.shear / 40;

  for (const cell of cells) {
    cell.strength = 0.4 + energy * 0.9 + moisture * 0.35;
    cell.growth = 0.12 + energy * moisture * 0.65;

    // Strong shear stretches the anvil along the storm-relative flow.
    if (cell.anvil) {
      const stretch = 0.75 + rotation * 0.85;
      cell.anvil.scale.x = stretch;
    }
  }
}

// ============================================================
// LIGHTNING
// ============================================================

function createLightning(cell) {
  const points = [];
  const startX = cell.x + rand(-1.2, 1.2);
  const startY = cell.top * rand(0.5, 0.9);
  const startZ = cell.z + rand(-1.2, 1.2);

  let x = startX;
  let y = startY;
  let z = startZ;

  points.push(new THREE.Vector3(x, y, z));

  const steps = 13;

  for (let i = 1; i <= steps; i++) {
    y = startY - (startY + 0.5) * (i / steps);
    x += rand(-1.0, 1.0);
    z += rand(-0.8, 0.8);
    points.push(new THREE.Vector3(x, y, z));
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points);

  const material = new THREE.LineBasicMaterial({
    color: 0xe9f5ff,
    transparent: true,
    opacity: 1
  });

  const bolt = new THREE.Line(geometry, material);
  lightningGroup.add(bolt);

  lightningBolts.push({
    object: bolt,
    life: 0.12,
    maxLife: 0.12
  });

  flash = Math.max(flash, 0.65);
}

// ============================================================
// SIMULATION UPDATE
// ============================================================

function updateStorm(dt) {
  simTime += dt;
  elapsed += dt;

  const capeFactor = params.cape / 5000;
  const moistureFactor = params.humidity / 100;
  const shearFactor = params.shear / 40;

  let highest = 0;

  for (const cell of cells) {
    cell.age += dt;

    const pulseCycle = (Math.sin(cell.age * 0.13 + cell.phase) + 1) / 2;

    let growthFactor = 1;

    if (cell.type === "pulse") {
      growthFactor = 0.45 + pulseCycle * 0.8;
    } else {
      growthFactor = 0.7 + pulseCycle * 0.3;
    }

    const heightFactor =
      0.68 + capeFactor * 0.5 + moistureFactor * 0.15;

    const targetHeight = cell.top * heightFactor * growthFactor;

    highest = Math.max(highest, targetHeight);

    const driftSpeed = 0.1 + shearFactor * 0.4;

    cell.group.position.x +=
      Math.sin(cell.age * 0.08 + cell.phase) * driftSpeed * dt;

    cell.group.position.z += cell.drift * dt * 0.12;

    // Supercell circulation is represented visually, not as a solved wind field.
    const spinRate =
      cell.type === "supercell"
        ? 0.12 + shearFactor * 0.5
        : 0.025 + shearFactor * 0.08;

    cell.group.rotation.y += spinRate * dt * cell.spin;

    const breathing =
      1 + Math.sin(cell.age * 0.35 + cell.phase) * 0.025;

    cell.group.scale.set(
      breathing,
      0.96 + heightFactor * 0.04,
      breathing
    );

    if (cell.anvil) {
      cell.anvil.scale.x =
        (0.75 + shearFactor * 0.85) *
        (1 + Math.sin(cell.age * 0.2) * 0.035);

      cell.anvil.rotation.y =
        Math.sin(cell.age * 0.06 + cell.phase) * 0.08;
    }

    // Individual cloud elements evolve independently.
    for (const puff of cell.puffs) {
      const base = puff.userData.base;

      const wave =
        Math.sin(cell.age * base.speed + base.phase) * 0.035;

      puff.position.y = base.y + wave;

      const swell =
        1 + Math.sin(cell.age * 0.25 + base.phase) * 0.025;

      puff.scale.set(
        base.sx * swell,
        base.sy * swell,
        base.sz * swell
      );
    }
  }

  currentHeight = highest || 0;
  updateMetrics();

  $("simClock").textContent =
    "SIM " + formatTime(simTime);

  $("cloudStatus").textContent =
    paused ? "СИМУЛЯЦИЯ ПРИОСТАНОВЛЕНА" :
    capeFactor > 0.65 && shearFactor > 0.5
      ? "СИЛЬНАЯ КОНВЕКТИВНАЯ СРЕДА"
      : "КОНВЕКЦИЯ АКТИВНА";

  // Lightning is a stochastic visual effect, not a lightning forecast.
  if (
    elapsed - lastLightning > rand(4, 13) &&
    params.cape > 500 &&
    Math.random() < 0.012
  ) {
    const cell = cells[Math.floor(Math.random() * cells.length)];

    if (cell) {
      createLightning(cell);
      lastLightning = elapsed;
    }
  }

  for (let i = lightningBolts.length - 1; i >= 0; i--) {
    const bolt = lightningBolts[i];

    bolt.life -= dt;
    bolt.object.material.opacity =
      Math.max(0, bolt.life / bolt.maxLife);

    if (bolt.life <= 0) {
      lightningGroup.remove(bolt.object);
      bolt.object.geometry.dispose();
      bolt.object.material.dispose();
      lightningBolts.splice(i, 1);
    }
  }

  flash = Math.max(0, flash - dt * 3);
}

// ============================================================
// HELPERS
// ============================================================

function formatTime(seconds) {
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const secs = total % 60;

  return String(minutes).padStart(2, "0") + ":" +
    String(secs).padStart(2, "0");
}

function onResize() {
  if (!renderer || !camera) return;

  const width = sceneElement.clientWidth;
  const height = sceneElement.clientHeight;

  if (!width || !height) return;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.setSize(width, height);
}

// ============================================================
// RENDER LOOP
// ============================================================

function animate() {
  if (disposed) return;

  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.05);

  if (!paused) {
    updateStorm(dt);
  }

  controls.update();

  if (environment) {
    environment.sky.position.copy(camera.position);
  }

  renderer.render(scene, camera);
}

window.addEventListener("pagehide", () => {
  disposed = true;
}, { once: true });

init();
