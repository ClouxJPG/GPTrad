
import * as THREE from "https://esm.sh/three@0.180.0";
import { OrbitControls } from "https://esm.sh/three@0.180.0/examples/jsm/controls/OrbitControls.js";

// ============================================================
// PROCEDURAL CONVECTION LAB
// No predefined storm models or scripted cloud shapes.
// ============================================================

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9bc8ed);
scene.fog = new THREE.FogExp2(0x9bc8ed, 0.00018);

const camera = new THREE.PerspectiveCamera(
  55, innerWidth / innerHeight, 0.1, 3000
);
camera.position.set(0, 70, 145);

const renderer = new THREE.WebGLRenderer({
  antialias: false,
  powerPreference: "high-performance"
});

renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.25));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const oldCanvas = $("scene");
if (oldCanvas) oldCanvas.replaceWith(renderer.domElement);
renderer.domElement.id = "scene";
renderer.domElement.style.cssText =
  "position:fixed;inset:0;width:100%;height:100%;display:block;";

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.045;
controls.target.set(0, 35, 0);
controls.minDistance = 10;
controls.maxDistance = 850;
controls.maxPolarAngle = Math.PI * 0.495;

// ============================================================
// SKY: gradient + sun disk + atmospheric halo
// ============================================================

const sky = new THREE.Mesh(
  new THREE.SphereGeometry(1800, 32, 20),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: `
      varying vec3 vDirection;
      void main() {
        vDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vDirection;
      uniform vec3 uSunDirection;

      void main() {
        float h = clamp(normalize(vDirection).y * 0.5 + 0.5, 0.0, 1.0);

        vec3 horizon = vec3(0.78, 0.85, 0.91);
        vec3 zenith = vec3(0.12, 0.39, 0.70);
        vec3 sky = mix(horizon, zenith, pow(h, 0.72));

        float sunDot = max(dot(normalize(vDirection), uSunDirection), 0.0);
        float halo = pow(sunDot, 18.0) * 0.13;
        float glow = pow(sunDot, 90.0) * 0.16;

        sky += vec3(1.0, 0.79, 0.53) * halo;
        sky += vec3(1.0, 0.91, 0.72) * glow;

        gl_FragColor = vec4(sky, 1.0);
      }
    `,
    uniforms: {
      uSunDirection: { value: new THREE.Vector3(-0.55, 0.72, -0.42).normalize() }
    }
  })
);
scene.add(sky);

const sunDirection = new THREE.Vector3(-0.55, 0.72, -0.42).normalize();
sky.material.uniforms.uSunDirection.value.copy(sunDirection);

const sun = new THREE.Mesh(
  new THREE.SphereGeometry(4.2, 24, 16),
  new THREE.MeshBasicMaterial({ color: 0xfff0ce, toneMapped: false })
);
sun.position.copy(sunDirection).multiplyScalar(800);
scene.add(sun);

const sunLight = new THREE.DirectionalLight(0xffedce, 3.0);
sunLight.position.copy(sunDirection).multiplyScalar(300);
scene.add(sunLight);

scene.add(new THREE.HemisphereLight(0xc8e3ff, 0x525c3c, 1.25));

// ============================================================
// GROUND
// ============================================================

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(1200, 1200),
  new THREE.MeshStandardMaterial({
    color: 0x5d7c40,
    roughness: 1
  })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.8;
scene.add(ground);

const grass = new THREE.InstancedMesh(
  new THREE.ConeGeometry(0.12, 0.7, 3),
  new THREE.MeshStandardMaterial({ color: 0x78934b, roughness: 1 }),
  5500
);

const dummy = new THREE.Object3D();

for (let i = 0; i < grass.count; i++) {
  dummy.position.set(rand(-590, 590), -0.35, rand(-590, 590));
  dummy.rotation.set(rand(-0.12, 0.12), rand(0, Math.PI * 2), 0);
  const s = rand(0.3, 1.2);
  dummy.scale.set(s, s, s);
  dummy.updateMatrix();
  grass.setMatrixAt(i, dummy.matrix);
}
scene.add(grass);

// ============================================================
// VOLUMETRIC CLOUD DENSITY
// A procedural density field, not a cloud-shaped mesh.
// ============================================================

const vertexShader = `
  varying vec3 vPosition;
  void main() {
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  precision highp float;

  varying vec3 vPosition;

  uniform vec3 uCameraLocal;
  uniform vec3 uSunDir;
  uniform float uTime;
  uniform float uDensity;
  uniform float uHumidity;
  uniform float uAnvil;
  uniform float uSeed;
  uniform float uDetail;
  uniform float uUpdraft;

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
      mix(mix(a,b,f.x),mix(c,d,f.x),f.y),
      mix(mix(e,f1,f.x),mix(g,h,f.x),f.y),
      f.z
    );
  }

  float fbm(vec3 p) {
    float result = 0.0;
    float amp = 0.53;

    for (int i = 0; i < 4; i++) {
      result += noise3(p) * amp;
      p *= 2.02;
      amp *= 0.48;
    }

    return result / 0.92;
  }

  float densityAt(vec3 p) {
    float h = (p.y + 1.0) * 0.5;

    if (h <= 0.005 || h >= 0.995) return 0.0;

    // Advected turbulent field.
    vec3 q = p;
    q += vec3(uTime * 0.004, uTime * 0.0012, -uTime * 0.003);
    q += vec3(uSeed * 1.71, uSeed * 0.63, uSeed * 2.19);

    float broad = fbm(q * 3.2);
    float medium = fbm(q * 7.5 + 4.7);
    float fine = fbm(q * 15.0 + 8.3);

    float turbulence = broad * 0.58 + medium * 0.29 + fine * 0.13;

    float radial = length(p.xz);
    float shape;

    if (uAnvil > 0.5) {
      // Thin, expanding, irregular cloud shield.
      float edge = max(abs(p.x) * 0.78, abs(p.z) * 0.9);
      edge += (turbulence - 0.5) * 0.35;

      float horizontal = 1.0 - smoothstep(0.43, 1.03, edge);
      float vertical = 1.0 - smoothstep(0.12, 0.9, abs(p.y + 0.02));

      shape = horizontal * vertical;
    } else {
      // Buoyant tower field: narrow lower region, broader upper turrets.
      float widening = mix(0.42, 0.83, smoothstep(0.02, 0.92, h));
      float edge = radial + (turbulence - 0.5) * 0.36;

      float horizontal = 1.0 - smoothstep(
        widening - 0.13,
        widening + 0.10,
        edge
      );

      float base = smoothstep(0.01, 0.16, h);
      float top = 1.0 - smoothstep(0.88, 1.0, h);

      // Turbulent protrusions emerge from local maxima of the density field.
      float protrusions = smoothstep(0.29, 0.72, turbulence);
      shape = horizontal * base * top * mix(0.58, 1.12, protrusions);

      // A weak, changing undulation breaks up the otherwise smooth silhouette.
      shape *= 0.9 + 0.1 * sin(p.x * 9.0 + p.z * 7.0 + broad * 5.0);
    }

    // Erosion makes the boundary billowy and uneven.
    float erosion = smoothstep(0.20, 0.73, turbulence);
    float d = shape * mix(0.24, 1.0, erosion);

    // Moist air supports denser cloud droplets.
    d *= mix(0.45, 1.0, uHumidity);
    d *= uDensity;

    return clamp(d, 0.0, 1.0);
  }

  void main() {
    vec3 ray = normalize(vPosition - uCameraLocal);
    vec3 p = vPosition;

    vec3 lightAccum = vec3(0.0);
    float trans = 1.0;

    // Front-to-back volume integration through the proxy volume.
    const int STEPS = 52;
    float ds = 0.039;

    for (int i = 0; i < STEPS; i++) {
      p += ray * ds;

      if (abs(p.x) > 1.0 || abs(p.y) > 1.0 || abs(p.z) > 1.0) {
        break;
      }

      float d = densityAt(p);

      if (d > 0.012) {
        // Approximate light attenuation through nearby cloud material.
        float shadow = 0.0;

        vec3 s1 = p + uSunDir * 0.08;
        vec3 s2 = p + uSunDir * 0.20;
        vec3 s3 = p + uSunDir * 0.36;

        shadow += densityAt(s1) * 0.50;
        shadow += densityAt(s2) * 0.32;
        shadow += densityAt(s3) * 0.18;

        float direct = exp(-shadow * 2.8);
        float height = (p.y + 1.0) * 0.5;

        vec3 deepShade = vec3(0.24, 0.30, 0.38);
        vec3 shade = vec3(0.49, 0.55, 0.61);
        vec3 sunlit = vec3(1.0, 0.98, 0.92);

        vec3 col = mix(deepShade, shade, clamp(0.28 + direct * 0.72, 0.0, 1.0));
        col = mix(col, sunlit, clamp(direct * 0.72 + height * 0.12, 0.0, 0.86));

        // Weak warm forward-scattering approximation.
        float forward = pow(max(dot(-ray, uSunDir), 0.0), 5.0);
        col += vec3(1.0, 0.82, 0.58) * forward * direct * 0.035;

        float a = 1.0 - exp(-d * ds * 3.0);
        lightAccum += trans * a * col;
        trans *= 1.0 - a;

        if (trans < 0.025) break;
      }
    }

    float alpha = 1.0 - trans;
    if (alpha < 0.012) discard;

    gl_FragColor = vec4(lightAccum / max(alpha, 0.001), alpha);
  }
`;

const volumeGeometry = new THREE.BoxGeometry(2, 2, 2);

const cells = [];
let paused = false;
let simTime = 0;
let spawnClock = 0;
let lightningClock = 0;
let lightningFlash = 0;
let lightningEnabled = true;
let stormSeed = Math.random() * 10000;

// ============================================================
// CELLS ARE STATEFUL; THEIR SHAPES COME FROM THE DENSITY FIELD
// ============================================================

function makeVolume(seed, isAnvil = false) {
  const uniforms = {
    uCameraLocal: { value: new THREE.Vector3(0, 0, 5) },
    uSunDir: { value: sunDirection.clone() },
    uTime: { value: 0 },
    uDensity: { value: 1 },
    uHumidity: { value: 0.8 },
    uAnvil: { value: isAnvil ? 1 : 0 },
    uSeed: { value: seed },
    uDetail: { value: 1 },
    uUpdraft: { value: 1 }
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide
  });

  const mesh = new THREE.Mesh(volumeGeometry, material);
  mesh.frustumCulled = false;
  scene.add(mesh);

  return { mesh, uniforms };
}

function createCell(x, z) {
  const seed = Math.random() * 1000;

  const cell = {
    x, z, seed,
    age: 0,
    energy: rand(0.55, 1.0),
    updraft: rand(0.55, 1.0),
    radius: rand(16, 25),
    width: rand(23, 38),
    depth: rand(22, 35),
    height: rand(35, 55),
    anvilWidth: rand(50, 90),
    anvilDepth: rand(30, 60),
    driftX: rand(-1, 1),
    driftZ: rand(-0.6, 0.6),
    core: makeVolume(seed, false),
    anvil: makeVolume(seed + 37.2, true),
    alive: true
  };

  cell.core.mesh.position.set(x, 1, z);
  cell.core.mesh.scale.set(0.01, 0.01, 0.01);
  cell.anvil.mesh.position.set(x, 1, z);
  cell.anvil.mesh.scale.set(0.01, 0.01, 0.01);

  cells.push(cell);
  return cell;
}

function removeCell(cell) {
  scene.remove(cell.core.mesh, cell.anvil.mesh);
  cell.core.mesh.material.dispose();
  cell.anvil.mesh.material.dispose();
}

function clearCells() {
  for (const c of cells) removeCell(c);
  cells.length = 0;
}

function resetSimulation() {
  clearCells();

  simTime = 0;
  spawnClock = 0;
  lightningClock = 0;
  lightningFlash = 0;
  stormSeed = Math.random() * 10000;

  // Reset creates only a tiny random updraft seed.
  // Visible cloud material appears at the calculated cloud base.
  createCell(rand(-8, 8), rand(-8, 8));

  controls.target.set(0, 35, 0);
  updateMetrics();
}

function generateStorm() {
  clearCells();

  simTime = 0;
  spawnClock = 0;
  stormSeed = Math.random() * 10000;

  // Random initial perturbations, not predefined storm types.
  const n = Math.floor(rand(1, 4));

  for (let i = 0; i < n; i++) {
    createCell(rand(-55, 55), rand(-45, 45));
  }

  controls.target.set(0, 35, 0);
  updateMetrics();
}

// ============================================================
// ENVIRONMENT
// ============================================================

function environment() {
  const cape = Number($("cape")?.value ?? 1800);
  const shear = Number($("shear")?.value ?? 20);
  const humidity = Number($("humidity")?.value ?? 70);

  if ($("capeValue")) $("capeValue").textContent = cape;
  if ($("shearValue")) $("shearValue").textContent = shear;
  if ($("humidityValue")) $("humidityValue").textContent = humidity;

  return {
    cape,
    shear,
    humidity,
    instability: clamp(cape / 2500, 0.05, 1.8),
    moisture: clamp(humidity / 100, 0.15, 1.0),

    // Approximate LCL proxy: more humid air generally has a lower base.
    // These are simulation units, not calibrated metres.
    lcl: 27 + (100 - humidity) * 0.48
  };
}

for (const id of ["cape", "shear", "humidity"]) {
  $(id)?.addEventListener("input", environment);
}

// ============================================================
// CONVECTIVE DEVELOPMENT
// ============================================================

function updateCell(c, dt, env) {
  c.age += dt;

  // Environmental shear advects and tilts the growing cloud.
  const shearFactor = env.shear / 45;
  c.x += c.driftX * shearFactor * dt * 0.8;
  c.z += c.driftZ * dt * 0.55;

  // Buoyancy drives the vertical growth. Random fluctuations perturb it.
  const fluctuation = 0.92 + 0.08 * Math.sin(c.age * 0.65 + c.seed);
  const growthRate = env.instability * c.updraft * fluctuation;

  c.energy += (growthRate - 0.18) * dt * 0.035;
  c.energy = clamp(c.energy, 0.08, 1.45);

  // Cloud base is held above the ground at the approximate LCL.
  const base = env.lcl;
  const mature = clamp(c.age / 110, 0, 1);
  const towerHeight = c.height * mature * c.energy;

  const width = c.width * (0.12 + mature * 0.88);
  const depth = c.depth * (0.12 + mature * 0.88);

  c.core.mesh.position.set(
    c.x,
    base + towerHeight * 0.5,
    c.z
  );

  c.core.mesh.scale.set(
    width,
    Math.max(0.15, towerHeight * 0.5),
    depth
  );

  c.core.uniforms.uTime.value = simTime;
  c.core.uniforms.uDensity.value = 0.88 + env.moisture * 0.4;
  c.core.uniforms.uHumidity.value = env.moisture;
  c.core.uniforms.uSeed.value = c.seed;
  c.core.uniforms.uUpdraft.value = c.updraft;

  // The anvil only develops after the rising tower matures.
  // Its growth depends on the simulated tower reaching its upper level.
  const top = base + towerHeight;
  const tropopause = 95;

  const reachedUpperLevel = clamp((top - tropopause + 25) / 35, 0, 1);
  const anvilGrowth = reachedUpperLevel * clamp((c.age - 32) / 80, 0, 1);

  c.anvil.mesh.position.set(
    c.x + env.shear * 0.48,
    Math.max(base + 3, top - 4),
    c.z - env.shear * 0.08
  );

  c.anvil.mesh.scale.set(
    Math.max(0.12, c.anvilWidth * anvilGrowth),
    Math.max(0.12, 5.5 * anvilGrowth),
    Math.max(0.12, c.anvilDepth * anvilGrowth)
  );

  c.anvil.mesh.rotation.y = -env.shear * 0.004;

  c.anvil.uniforms.uTime.value = simTime;
  c.anvil.uniforms.uDensity.value = 0.78 + env.moisture * 0.3;
  c.anvil.uniforms.uHumidity.value = env.moisture;
  c.anvil.uniforms.uSeed.value = c.seed + 37.2;
}

// ============================================================
// NEW CELLS EMERGE FROM RANDOM UPDRAFT PERTURBATIONS
// ============================================================

function updateCellFormation(dt, env) {
  spawnClock += dt;

  const capeFactor = clamp(env.cape / 3000, 0, 1.5);
  const moistureFactor = env.moisture;

  // Stronger instability and moisture allow more frequent new updrafts.
  const interval = clamp(
    28 / Math.max(0.18, capeFactor * moistureFactor),
    8,
    100
  );

  if (spawnClock >= interval && cells.length < 8) {
    spawnClock = 0;

    if (Math.random() < clamp(capeFactor * moistureFactor, 0.12, 0.95)) {
      createCell(rand(-110, 110), rand(-100, 100));
    }
  }

  // Weak, short-lived cells dissipate instead of being kept forever.
  for (let i = cells.length - 1; i >= 0; i--) {
    const c = cells[i];

    if (c.age > 240 && c.energy < 0.23) {
      removeCell(c);
      cells.splice(i, 1);
    }
  }
}

// ============================================================
// LIGHTNING
// ============================================================

const lightningMaterial = new THREE.LineBasicMaterial({
  color: 0xe8f4ff,
  transparent: true,
  opacity: 0
});

const lightningGeometry = new THREE.BufferGeometry();
const lightningLine = new THREE.Line(lightningGeometry, lightningMaterial);
scene.add(lightningLine);

function makeLightning() {
  if (!cells.length) return;

  const c = cells[Math.floor(Math.random() * cells.length)];
  const top = Math.max(8, environment().lcl + c.height * clamp(c.age / 110, 0, 1));
  const pts = [];

  let x = c.x + rand(-7, 7);
  let z = c.z + rand(-7, 7);

  pts.push(new THREE.Vector3(x, top, z));

  for (let i = 1; i <= 11; i++) {
    x += rand(-3, 3);
    z += rand(-3, 3);

    pts.push(new THREE.Vector3(
      x,
      top * (1 - i / 11),
      z
    ));
  }

  lightningGeometry.setFromPoints(pts);
  lightningMaterial.opacity = 1;
  lightningFlash = 0.15;
}

function updateLightning(dt, env) {
  lightningClock -= dt;

  if (lightningEnabled && lightningClock <= 0) {
    if (cells.some(c => c.age > 45) && Math.random() < env.instability * 0.4) {
      makeLightning();
    }

    lightningClock = rand(2, 7);
  }

  if (lightningFlash > 0) {
    lightningFlash -= dt;
    lightningMaterial.opacity = Math.max(0, lightningFlash * 7);
  } else {
    lightningMaterial.opacity = 0;
  }
}

// ============================================================
// UI
// ============================================================

$("newStorm")?.addEventListener("click", generateStorm);

$("reset")?.addEventListener("click", resetSimulation);

$("pause")?.addEventListener("click", () => {
  paused = !paused;
  if ($("pause")) $("pause").textContent = paused ? "Продолжить" : "Пауза";
  updateMetrics();
});

$("lightning")?.addEventListener("click", () => {
  lightningEnabled = !lightningEnabled;
  if (lightningEnabled) makeLightning();
  else lightningMaterial.opacity = 0;
});

function updateMetrics() {
  const env = environment();

  if ($("cellCount")) $("cellCount").textContent = String(cells.length);

  if ($("cloudHeight")) {
    const maxTop = cells.reduce((m, c) => {
      return Math.max(m, env.lcl + c.height * clamp(c.age / 110, 0, 1) * c.energy);
    }, env.lcl);

    $("cloudHeight").textContent = `${Math.round(maxTop)} м`;
  }

  if ($("status")) {
    $("status").textContent = paused ? "Пауза" : "Симуляция активна";
  }
}

// ============================================================
// RENDER LOOP
// ============================================================

const clock = new THREE.Clock();
let metricsTimer = 0;

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.04);

  if (!paused) {
    simTime += dt;

    const env = environment();

    updateCellFormation(dt, env);

    for (const c of cells) {
      updateCell(c, dt, env);

      for (const v of [c.core, c.anvil]) {
        v.uniforms.uCameraLocal.value.copy(
          v.mesh.worldToLocal(camera.position.clone())
        );

        v.uniforms.uSunDir.value.copy(sunDirection).normalize();
      }
    }

    updateLightning(dt, env);

    metricsTimer += dt;
    if (metricsTimer > 0.5) {
      updateMetrics();
      metricsTimer = 0;
    }
  }

  // Keep the sky centered on the camera.
  sky.position.copy(camera.position);

  controls.update();
  renderer.render(scene, camera);
}

// ============================================================
// RESIZE / START
// ============================================================

window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.25));
});

environment();
resetSimulation();
animate();

if (typeof window.hideStormLoading === "function") {
  window.hideStormLoading();
}
