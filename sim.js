
import * as THREE from "https://esm.sh/three@0.180.0";
import { OrbitControls } from "https://esm.sh/three@0.180.0/examples/jsm/controls/OrbitControls.js";

// ============================================================
// QUANTUM STORM — 3D CONVECTIVE SIMULATOR
// Процедурные облачные объёмы, рост конвекции, наковальни.
// ============================================================

const $ = id => document.getElementById(id);
const canvas = $("scene");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x789ab5);
scene.fog = new THREE.Fog(0x789ab5, 350, 900);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  powerPreference: "high-performance"
});

renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 1800);
camera.position.set(150, 105, 180);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 30, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.minDistance = 25;
controls.maxDistance = 600;
controls.maxPolarAngle = Math.PI * 0.49;

// ============================================================
// LIGHT
// ============================================================

const hemi = new THREE.HemisphereLight(0xc9e5ff, 0x3e4b2b, 1.7);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff0d8, 3.0);
sun.position.set(-180, 240, 100);
scene.add(sun);

// ============================================================
// SKY
// ============================================================

const sky = new THREE.Mesh(
  new THREE.SphereGeometry(1200, 24, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      darkness: { value: 0.15 }
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
      uniform float darkness;
      void main() {
        float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 low = vec3(0.75, 0.81, 0.84);
        vec3 mid = vec3(0.36, 0.55, 0.70);
        vec3 high = vec3(0.07, 0.20, 0.36);
        vec3 c = mix(low, mid, smoothstep(0.0, 0.6, h));
        c = mix(c, high, smoothstep(0.45, 1.0, h));
        c = mix(c, vec3(0.14, 0.17, 0.21), darkness * 0.75);
        gl_FragColor = vec4(c, 1.0);
      }
    `
  })
);
scene.add(sky);

// ============================================================
// LARGE SQUARE TERRAIN
// ============================================================

const groundSize = 520;
const ground = new THREE.Group();
scene.add(ground);

const terrainGeometry = new THREE.PlaneGeometry(groundSize, groundSize, 90, 90);
terrainGeometry.rotateX(-Math.PI / 2);

const terrainPos = terrainGeometry.attributes.position;

function groundHeight(x, z) {
  return Math.sin(x * 0.025) * 0.7 +
         Math.cos(z * 0.03) * 0.55 +
         Math.sin((x + z) * 0.016) * 0.4;
}

for (let i = 0; i < terrainPos.count; i++) {
  const x = terrainPos.getX(i);
  const z = terrainPos.getZ(i);
  terrainPos.setY(i, groundHeight(x, z));
}

terrainGeometry.computeVertexNormals();

const terrain = new THREE.Mesh(
  terrainGeometry,
  new THREE.MeshStandardMaterial({
    color: 0x577b3a,
    roughness: 1
  })
);
terrain.receiveShadow = true;
ground.add(terrain);

const terrainBase = new THREE.Mesh(
  new THREE.BoxGeometry(groundSize, 8, groundSize),
  new THREE.MeshStandardMaterial({ color: 0x394c2c, roughness: 1 })
);
terrainBase.position.y = -4.2;
ground.add(terrainBase);

// Procedural grass blades.
const grassGeometry = new THREE.ConeGeometry(0.14, 0.8, 3);
grassGeometry.translate(0, 0.4, 0);

const grass = new THREE.InstancedMesh(
  grassGeometry,
  new THREE.MeshStandardMaterial({
    color: 0x729747,
    roughness: 1,
    side: THREE.DoubleSide
  }),
  5000
);

const dummy = new THREE.Object3D();
const color = new THREE.Color();

for (let i = 0; i < 5000; i++) {
  const x = (Math.random() - 0.5) * (groundSize - 8);
  const z = (Math.random() - 0.5) * (groundSize - 8);

  dummy.position.set(x, groundHeight(x, z), z);
  dummy.rotation.set(
    (Math.random() - 0.5) * 0.2,
    Math.random() * Math.PI * 2,
    (Math.random() - 0.5) * 0.25
  );

  const s = 0.4 + Math.random() * 1.4;
  dummy.scale.set(s, s, s);
  dummy.updateMatrix();
  grass.setMatrixAt(i, dummy.matrix);

  const k = 0.7 + Math.random() * 0.55;
  color.setRGB(0.28 * k, 0.45 * k, 0.15 * k);
  grass.setColorAt(i, color);
}

grass.instanceMatrix.needsUpdate = true;
ground.add(grass);

// ============================================================
// VOLUMETRIC CLOUD SHADER
// ============================================================

const volumeVertexShader = `
  varying vec3 vLocal;
  void main() {
    vLocal = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const volumeFragmentShader = `
  varying vec3 vLocal;

  uniform vec3 uCameraLocal;
  uniform float uDensity;
  uniform float uTime;
  uniform float uShape;
  uniform float uHumidity;
  uniform float uStorm;
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
    float b = hash31(i + vec3(1,0,0));
    float c = hash31(i + vec3(0,1,0));
    float d = hash31(i + vec3(1,1,0));
    float e = hash31(i + vec3(0,0,1));
    float f1 = hash31(i + vec3(1,0,1));
    float g = hash31(i + vec3(0,1,1));
    float h = hash31(i + vec3(1,1,1));

    return mix(
      mix(mix(a,b,f.x), mix(c,d,f.x), f.y),
      mix(mix(e,f1,f.x), mix(g,h,f.x), f.y),
      f.z
    );
  }

  float fbm(vec3 p) {
    float n = 0.0;
    float amp = 0.55;
    for (int i = 0; i < 4; i++) {
      n += noise3(p) * amp;
      p *= 2.02;
      amp *= 0.5;
    }
    return n;
  }

  float densityAt(vec3 p) {
    float n = fbm(p * 3.5 + vec3(uSeed, uTime * 0.012, uSeed * 0.7));
    float detail = fbm(p * 8.5 - vec3(uTime * 0.02, 0.0, uSeed));

    float shape;

    if (uShape < 0.5) {
      // Growing cumulonimbus tower.
      float h = p.y * 0.5 + 0.5;
      float radius = mix(0.28, 0.76, smoothstep(-0.85, 0.42, p.y));
      radius -= 0.12 * smoothstep(0.55, 0.98, p.y);

      float radial = length(p.xz);
      shape = 1.0 - smoothstep(radius - 0.16, radius + 0.12, radial);

      // Reduce density at the very bottom and top.
      float vertical = smoothstep(-1.0, -0.75, p.y) *
                       (1.0 - smoothstep(0.78, 1.0, p.y));
      shape *= vertical;
      shape *= mix(0.88, 1.08, h);
    } else {
      // Wide, shallow anvil.
      float radial = length(vec2(p.x * 0.72, p.z));
      shape = 1.0 - smoothstep(0.55, 1.02, radial);
      shape *= 1.0 - smoothstep(0.45, 1.0, abs(p.y));
      shape *= smoothstep(-1.0, -0.65, p.y);
    }

    float erosion = n * 0.8 + detail * 0.26;
    return clamp((shape - 0.30 + erosion * 0.75) * uDensity, 0.0, 1.0);
  }

  void main() {
    vec3 ray = normalize(vLocal - uCameraLocal);
    vec3 p = vLocal;
    float trans = 1.0;
    vec3 accumulated = vec3(0.0);

    const int STEPS = 44;
    float stepLength = 0.052;

    for (int i = 0; i < STEPS; i++) {
      if (any(greaterThan(abs(p), vec3(1.0)))) break;

      float d = densityAt(p);
      if (d > 0.012) {
        float light = clamp(
          0.52 + 0.36 * noise3(p * 5.0 + vec3(4.0, 1.0, 2.0)),
          0.25, 1.0
        );

        vec3 sunlit = vec3(0.94, 0.95, 0.94);
        vec3 shadow = vec3(0.22, 0.27, 0.34);
        vec3 cloudColor = mix(shadow, sunlit, light);

        cloudColor = mix(
          cloudColor,
          vec3(0.24, 0.27, 0.32),
          uStorm * 0.42
        );

        float a = d * stepLength * 2.6;
        accumulated += trans * a * cloudColor;
        trans *= 1.0 - a;
      }

      p += ray * stepLength;
      if (trans < 0.025) break;
    }

    float alpha = 1.0 - trans;
    if (alpha < 0.025) discard;

    gl_FragColor = vec4(accumulated / max(alpha, 0.001), alpha);
  }
`;

const volumeGeometry = new THREE.BoxGeometry(2, 2, 2);

const cloudCells = [];
const bolts = [];

let paused = false;
let lightningEnabled = true;
let elapsed = 0;
let lightningCountdown = 1;
let currentPreset = "random";

function createVolume(shape, seed) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uCameraLocal: { value: new THREE.Vector3(0, 0, 5) },
      uDensity: { value: 0.85 },
      uTime: { value: 0 },
      uShape: { value: shape },
      uHumidity: { value: 0.75 },
      uStorm: { value: 0.3 },
      uSeed: { value: seed }
    },
    vertexShader: volumeVertexShader,
    fragmentShader: volumeFragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide
  });

  const mesh = new THREE.Mesh(volumeGeometry, material);
  mesh.frustumCulled = false;
  return mesh;
}

function makeCell(x, z, strength, seed) {
  const group = new THREE.Group();
  scene.add(group);

  const tower = createVolume(0, seed);
  const anvil = createVolume(1, seed + 12.7);

  group.add(tower, anvil);
  group.position.set(x, 0, z);

  const cell = {
    group,
    tower,
    anvil,
    strength,
    seed,
    age: 0,
    baseHeight: 4,
    maxHeight: 45 + Number($("cape").value) * 0.012,
    radius: 14 + strength * 5,
    driftX: (Math.random() - 0.5) * 1.5,
    driftZ: (Math.random() - 0.5) * 1.5,
    spin: (Math.random() - 0.5) * 0.012,
    top: 0
  };

  cloudCells.push(cell);
  return cell;
}

// ============================================================
// STORM GENERATION AND RESET
// ============================================================

function clearBolts() {
  for (const bolt of bolts) {
    scene.remove(bolt.line);
    bolt.line.geometry.dispose();
    bolt.line.material.dispose();
  }
  bolts.length = 0;
}

function resetSimulation() {
  for (const cell of cloudCells) {
    scene.remove(cell.group);
    cell.tower.material.dispose();
    cell.anvil.material.dispose();
  }

  cloudCells.length = 0;
  clearBolts();

  elapsed = 0;
  lightningCountdown = 1;

  camera.position.set(150, 105, 180);
  controls.target.set(0, 30, 0);
  controls.update();

  sky.material.uniforms.darkness.value = 0.05;
  $("status").textContent = "Симуляция сброшена. Конвекция начинается с нуля.";
  $("cloudHeight").textContent = "0.0 км";
  $("cellCount").textContent = "0";

  // Start with a small, developing convective cell.
  makeCell(0, 0, 1, Math.random() * 1000);
  updateEnvironment();
}

function generateStorm(type = "random") {
  resetSimulation();
  cloudCells.length = 0;

  const cape = Number($("cape").value);
  const humidity = Number($("humidity").value);
  const shear = Number($("shear").value);

  if (type === "random") {
    type = ["tower", "supercell", "multicell", "squall"][
      Math.floor(Math.random() * 4)
    ];
  }

  currentPreset = type;

  if (type === "tower") {
    makeCell(0, 0, 1.4, Math.random() * 999);
  } else if (type === "supercell") {
    makeCell(0, 0, 1.8, Math.random() * 999);
    makeCell(-42, 24, 0.7, Math.random() * 999);
  } else if (type === "multicell") {
    const count = 4 + Math.floor(Math.random() * 4);
    for (let i = 0; i < count; i++) {
      makeCell(
        (Math.random() - 0.5) * 180,
        (Math.random() - 0.5) * 180,
        0.65 + Math.random() * 0.9,
        Math.random() * 999
      );
    }
  } else if (type === "squall") {
    const count = 7;
    const angle = (Math.random() - 0.5) * 0.5;
    for (let i = 0; i < count; i++) {
      const t = i - (count - 1) / 2;
      makeCell(
        Math.cos(angle) * t * 22,
        Math.sin(angle) * t * 22,
        0.8 + Math.random() * 0.8,
        Math.random() * 999
      );
    }
  }

  // Environmental values affect cloud growth and anvil spread.
  for (const cell of cloudCells) {
    cell.maxHeight = 35 + cape * 0.016;
    cell.radius = 12 + humidity * 0.08 + cell.strength * 3;
  }

  updateEnvironment();
  $("status").textContent =
    "Новая симуляция: " + type +
    ". Облака начинают развитие с нуля.";
}

function updateEnvironment() {
  const cape = Number($("cape").value);
  const humidity = Number($("humidity").value);
  const shear = Number($("shear").value);

  const storm = Math.min(1, cape / 5000 * 0.65 + humidity / 100 * 0.35);

  sky.material.uniforms.darkness.value = storm * 0.65;
  sun.intensity = 3.0 - storm * 1.9;
  hemi.intensity = 1.7 - storm * 0.65;

  for (const cell of cloudCells) {
    cell.maxHeight = 35 + cape * 0.016;
    cell.radius = 12 + humidity * 0.08 + cell.strength * 3;

    for (const mesh of [cell.tower, cell.anvil]) {
      mesh.material.uniforms.uHumidity.value = humidity / 100;
      mesh.material.uniforms.uStorm.value = storm;
      mesh.material.uniforms.uDensity.value =
        0.48 + humidity / 100 * 0.65;
    }
  }
}

function syncCameraUniform(mesh) {
  const cameraLocal = mesh.worldToLocal(camera.position.clone());
  mesh.material.uniforms.uCameraLocal.value.copy(cameraLocal);
}

// ============================================================
// CONVECTION, GROWTH AND ANVIL SPREAD
// ============================================================

function updateClouds(dt) {
  const cape = Number($("cape").value);
  const shear = Number($("shear").value);
  const humidity = Number($("humidity").value);

  for (const cell of cloudCells) {
    cell.age += dt;

    // CAPE controls the potential growth rate.
    const growthRate = 0.06 + cape / 5000 * 0.23;
    const development = THREE.MathUtils.clamp(
      cell.age * growthRate / 10,
      0.005,
      1
    );

    const height = cell.maxHeight * development;
    const radius = cell.radius * Math.sqrt(development);

    cell.top = height;
    cell.group.position.x += cell.driftX * dt;
    cell.group.position.z += cell.driftZ * dt;
    cell.group.rotation.y += cell.spin * dt;

    // Main cloud tower grows from near-ground convection.
    cell.tower.position.set(0, height / 2, 0);
    cell.tower.scale.set(radius, Math.max(0.5, height / 2), radius);

    // The anvil forms only after the tower reaches a high altitude.
    const anvilProgress = THREE.MathUtils.clamp(
      (development - 0.55) / 0.45,
      0,
      1
    );

    const anvilWidth = (radius * 1.15 + shear * 1.35) * anvilProgress;
    const anvilThickness = Math.max(0.25, height * 0.055 * anvilProgress);

    cell.anvil.position.set(
      shear * 0.18 * anvilProgress,
      height * 0.92,
      0
    );

    cell.anvil.scale.set(
      Math.max(0.01, anvilWidth),
      anvilThickness,
      Math.max(0.01, radius * (0.8 + shear * 0.018) * anvilProgress)
    );

    cell.tower.material.uniforms.uTime.value = elapsed;
    cell.anvil.material.uniforms.uTime.value = elapsed;
    cell.tower.material.uniforms.uHumidity.value = humidity / 100;
    cell.anvil.material.uniforms.uHumidity.value = humidity / 100;

    syncCameraUniform(cell.tower);
    syncCameraUniform(cell.anvil);
  }

  let maxHeight = 0;
  for (const cell of cloudCells) {
    maxHeight = Math.max(maxHeight, cell.top);
  }

  $("cloudHeight").textContent = (maxHeight / 10).toFixed(1) + " км";
  $("cellCount").textContent = String(cloudCells.length);
}

// ============================================================
// LIGHTNING
// ============================================================

function makeLightning() {
  if (!lightningEnabled || cloudCells.length === 0) return;

  const cell = cloudCells[Math.floor(Math.random() * cloudCells.length)];
  if (cell.top < 10) return;

  const start = new THREE.Vector3(
    cell.group.position.x + (Math.random() - 0.5) * cell.radius,
    cell.top * 0.9,
    cell.group.position.z + (Math.random() - 0.5) * cell.radius
  );

  const end = new THREE.Vector3(
    start.x + (Math.random() - 0.5) * 25,
    1,
    start.z + (Math.random() - 0.5) * 25
  );

  const points = [start];
  const segments = 14;

  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    points.push(new THREE.Vector3(
      THREE.MathUtils.lerp(start.x, end.x, t) + (Math.random() - 0.5) * 5,
      THREE.MathUtils.lerp(start.y, end.y, t),
      THREE.MathUtils.lerp(start.z, end.z, t) + (Math.random() - 0.5) * 5
    ));
  }
  points.push(end);

  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({
      color: 0xc9eaff,
      transparent: true,
      opacity: 1
    })
  );

  scene.add(line);
  bolts.push({ line, age: 0, life: 0.22 });
}

function updateLightning(dt) {
  lightningCountdown -= dt;

  if (lightningEnabled && lightningCountdown <= 0) {
    const cape = Number($("cape").value);
    const chance = 0.2 + cape / 6500;

    if (Math.random() < chance) makeLightning();
    lightningCountdown = 0.5 + Math.random() * 2.5;
  }

  for (let i = bolts.length - 1; i >= 0; i--) {
    const bolt = bolts[i];
    bolt.age += dt;
    bolt.line.material.opacity = Math.max(0, 1 - bolt.age / bolt.life);

    if (bolt.age >= bolt.life) {
      scene.remove(bolt.line);
      bolt.line.geometry.dispose();
      bolt.line.material.dispose();
      bolts.splice(i, 1);
    }
  }
}

// ============================================================
// BUTTONS AND SLIDERS
// ============================================================

$("newStorm").addEventListener("click", () => {
  generateStorm($("stormType").value);
});

$("reset").addEventListener("click", resetSimulation);

$("pause").addEventListener("click", () => {
  paused = !paused;
  $("pause").textContent = paused ? "Продолжить" : "Пауза";
  $("status").textContent = paused
    ? "Симуляция остановлена."
    : "Симуляция продолжается.";
});

$("lightning").addEventListener("click", () => {
  lightningEnabled = !lightningEnabled;
  $("lightning").textContent =
    "Молния: " + (lightningEnabled ? "вкл." : "выкл.");
});

function bindSlider(id, outputId, format) {
  $(id).addEventListener("input", event => {
    $(outputId).textContent = format(Number(event.target.value));
    updateEnvironment();
  });
}

bindSlider("cape", "capeValue", v => `${v} Дж/кг`);
bindSlider("shear", "shearValue", v => `${v} м/с`);
bindSlider("humidity", "humidityValue", v => `${v}%`);

window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
});

// ============================================================
// START
// ============================================================

updateEnvironment();
resetSimulation();

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(0.04, clock.getDelta());

  if (!paused) {
    elapsed += dt;
    updateClouds(dt);
    updateLightning(dt);
  }

  controls.update();
  renderer.render(scene, camera);
}

const clock = new THREE.Clock();
animate();

window.hideStormLoading();
