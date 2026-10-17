
import * as THREE from "https://esm.sh/three@0.180.0";
import { OrbitControls } from "https://esm.sh/three@0.180.0/examples/jsm/controls/OrbitControls.js";

// ============================================================
// STORM SIMULATOR — PROCEDURAL VOLUMETRIC CLOUDS
// 3D noise • cloud self-shadowing • sunlight • storm growth
// ============================================================

const $ = (id) => document.getElementById(id);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b9e8);
scene.fog = new THREE.FogExp2(0x9abbd7, 0.00065);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  2500
);

camera.position.set(0, 55, 115);

const renderer = new THREE.WebGLRenderer({
  antialias: false,
  powerPreference: "high-performance",
  alpha: false
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = false;

document.body.style.margin = "0";
document.body.style.overflow = "hidden";

const canvas = $("scene");
if (canvas) {
  canvas.replaceWith(renderer.domElement);
}
renderer.domElement.id = "scene";
renderer.domElement.style.cssText =
  "position:fixed;inset:0;width:100%;height:100%;display:block;";

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.045;
controls.target.set(0, 22, 0);
controls.minDistance = 12;
controls.maxDistance = 650;
controls.maxPolarAngle = Math.PI * 0.495;
controls.update();

// ============================================================
// LIGHTING AND SKY
// ============================================================

scene.add(new THREE.HemisphereLight(0xc9e4ff, 0x63704c, 1.15));

const sunDirection = new THREE.Vector3(-0.55, 0.72, -0.42).normalize();

const sunLight = new THREE.DirectionalLight(0xfff0d5, 3.0);
sunLight.position.copy(sunDirection).multiplyScalar(350);
scene.add(sunLight);

const sun = new THREE.Mesh(
  new THREE.SphereGeometry(5.2, 24, 16),
  new THREE.MeshBasicMaterial({
    color: 0xfff3d3,
    toneMapped: false
  })
);

sun.position.copy(sunDirection).multiplyScalar(440);
scene.add(sun);

const sunHalo = new THREE.Mesh(
  new THREE.SphereGeometry(9, 20, 14),
  new THREE.MeshBasicMaterial({
    color: 0xffe5a5,
    transparent: true,
    opacity: 0.13,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  })
);

sunHalo.position.copy(sun.position);
scene.add(sunHalo);

// Subtle atmospheric shafts. Their opacity is intentionally very low.
const rayGroup = new THREE.Group();
scene.add(rayGroup);

for (let i = 0; i < 5; i++) {
  const ray = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 7 + i * 1.1, 170, 8, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xfff1d1,
      transparent: true,
      opacity: 0.012,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    })
  );

  const direction = new THREE.Vector3(
    -0.5 + i * 0.24,
    -1,
    -0.25 + i * 0.12
  ).normalize();

  ray.position.copy(sun.position).addScaledVector(direction, 95);
  ray.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction
  );

  rayGroup.add(ray);
}

// ============================================================
// PROCEDURAL GRASS TERRAIN
// ============================================================

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(520, 520),
  new THREE.MeshStandardMaterial({
    color: 0x587b3d,
    roughness: 1,
    metalness: 0
  })
);

ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.5;
scene.add(ground);

const groundBase = new THREE.Mesh(
  new THREE.BoxGeometry(520, 9, 520),
  new THREE.MeshStandardMaterial({
    color: 0x414b2e,
    roughness: 1
  })
);

groundBase.position.y = -5;
scene.add(groundBase);

const grassCount = 4200;
const grassGeometry = new THREE.ConeGeometry(0.13, 0.75, 3);
grassGeometry.translate(0, 0.35, 0);

const grassMaterial = new THREE.MeshStandardMaterial({
  color: 0x688b42,
  roughness: 1
});

const grass = new THREE.InstancedMesh(
  grassGeometry,
  grassMaterial,
  grassCount
);

const dummy = new THREE.Object3D();

for (let i = 0; i < grassCount; i++) {
  dummy.position.set(
    (Math.random() - 0.5) * 510,
    0,
    (Math.random() - 0.5) * 510
  );

  dummy.rotation.set(
    (Math.random() - 0.5) * 0.2,
    Math.random() * Math.PI,
    (Math.random() - 0.5) * 0.2
  );

  const s = 0.35 + Math.random() * 1.0;
  dummy.scale.set(s, s, s);
  dummy.updateMatrix();
  grass.setMatrixAt(i, dummy.matrix);
}

scene.add(grass);

// ============================================================
// VOLUMETRIC CLOUD SHADER
// ============================================================

const cloudVertexShader = `
  varying vec3 vLocal;

  void main() {
    vLocal = position;

    gl_Position =
      projectionMatrix *
      modelViewMatrix *
      vec4(position, 1.0);
  }
`;

const cloudFragmentShader = `
  precision highp float;

  varying vec3 vLocal;

  uniform vec3 uCameraLocal;
  uniform vec3 uSunDir;
  uniform float uTime;
  uniform float uDensity;
  uniform float uAge;
  uniform float uAnvil;
  uniform float uHumidity;

  float hash31(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);

    f = f * f * (3.0 - 2.0 * f);

    float n000 = hash31(i + vec3(0,0,0));
    float n100 = hash31(i + vec3(1,0,0));
    float n010 = hash31(i + vec3(0,1,0));
    float n110 = hash31(i + vec3(1,1,0));
    float n001 = hash31(i + vec3(0,0,1));
    float n101 = hash31(i + vec3(1,0,1));
    float n011 = hash31(i + vec3(0,1,1));
    float n111 = hash31(i + vec3(1,1,1));

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
    float n = 0.0;
    float amplitude = 0.55;

    n += amplitude * noise3(p);
    p *= 2.03;
    amplitude *= 0.48;

    n += amplitude * noise3(p);
    p *= 2.01;
    amplitude *= 0.48;

    n += amplitude * noise3(p);

    return n / 0.89;
  }

  float cloudDensity(vec3 p) {
    float h = (p.y + 1.0) * 0.5;

    if (h < 0.015 || h > 0.995) {
      return 0.0;
    }

    vec3 q = p;

    q.xz *= 1.0;
    q += vec3(
      uTime * 0.004,
      uTime * 0.0015,
      -uTime * 0.003
    );

    float n1 = fbm(q * 4.0 + vec3(1.7, 0.0, 2.3));
    float n2 = fbm(q * 9.0 + vec3(4.1, 2.0, 0.8));

    float detail = n1 * 0.78 + n2 * 0.22;

    float density;

    if (uAnvil > 0.5) {
      // Wide, thin, ragged anvil spreading downwind.
      float edge = max(abs(p.x) * 0.84, abs(p.z) * 0.92);
      float raggedEdge = edge + (detail - 0.5) * 0.19;

      float horizontalShape =
        1.0 - smoothstep(0.58, 1.02, raggedEdge);

      float verticalShape =
        1.0 - smoothstep(0.30, 0.92, abs(p.y + 0.02));

      density = horizontalShape * verticalShape;
      density *= smoothstep(-0.15, 0.24, detail);
    } else {
      // Towering cumulonimbus with a broad base and irregular turrets.
      float radius = mix(0.67, 0.87, smoothstep(0.05, 0.65, h));

      float turretNoise = (detail - 0.5) * 0.30;
      float radial = length(p.xz);

      float horizontalShape =
        1.0 - smoothstep(
          radius - 0.14,
          radius + 0.12,
          radial + turretNoise
        );

      float baseShape = smoothstep(0.02, 0.13, h);

      float upperShape =
        1.0 - smoothstep(0.90, 1.02, h);

      density = horizontalShape * baseShape * upperShape;

      // Extra broken contours on the upper cloud towers.
      float towers = smoothstep(
        0.34,
        0.70,
        detail + 0.13 * sin(p.x * 13.0 + p.z * 9.0)
      );

      density *= mix(0.62, 1.0, towers);
    }

    float erosion = smoothstep(0.20, 0.78, detail);

    density *= mix(0.40, 1.0, erosion);
    density *= uDensity;
    density *= mix(0.58, 1.0, uHumidity);

    return clamp(density, 0.0, 1.0);
  }

  void main() {
    vec3 ray = normalize(vLocal - uCameraLocal);

    vec3 p = vLocal;
    float transmittance = 1.0;
    vec3 accumulatedLight = vec3(0.0);

    const int STEPS = 48;
    float stepSize = 0.043;

    for (int i = 0; i < STEPS; i++) {
      p += ray * stepSize;

      if (
        abs(p.x) > 1.0 ||
        abs(p.y) > 1.0 ||
        abs(p.z) > 1.0
      ) {
        break;
      }

      float d = cloudDensity(p);

      if (d > 0.015) {
        // Approximate self-shadowing toward the sun.
        float shadowDensity = 0.0;

        vec3 sp = p;
        sp += uSunDir * 0.09;
        shadowDensity += cloudDensity(sp) * 0.45;

        sp += uSunDir * 0.15;
        shadowDensity += cloudDensity(sp) * 0.30;

        sp += uSunDir * 0.24;
        shadowDensity += cloudDensity(sp) * 0.20;

        float sunLight = exp(-shadowDensity * 2.3);

        float height = (p.y + 1.0) * 0.5;

        vec3 shadowColor = vec3(0.30, 0.36, 0.43);
        vec3 baseColor = vec3(0.54, 0.59, 0.64);
        vec3 brightColor = vec3(1.0, 0.97, 0.90);

        float lighting = clamp(
          0.24 + sunLight * 0.90,
          0.0,
          1.0
        );

        vec3 cloudColor = mix(
          shadowColor,
          baseColor,
          lighting
        );

        cloudColor = mix(
          cloudColor,
          brightColor,
          clamp(sunLight * 0.68 + height * 0.12, 0.0, 0.85)
        );

        // Very subtle cool tint in deep storm shadows.
        cloudColor = mix(
          cloudColor,
          vec3(0.27, 0.34, 0.44),
          clamp(shadowDensity * 0.22, 0.0, 0.4)
        );

        float absorption = d * stepSize * 2.7;
        float a = 1.0 - exp(-absorption);

        accumulatedLight +=
          transmittance * a * cloudColor;

        transmittance *= 1.0 - a;

        if (transmittance < 0.025) {
          break;
        }
      }
    }

    float alpha = 1.0 - transmittance;

    if (alpha < 0.012) {
      discard;
    }

    vec3 color = accumulatedLight / max(alpha, 0.001);

    // A faint warm rim on the sun-facing cloud edges.
    float rim = pow(
      max(dot(normalize(vLocal - uCameraLocal), uSunDir), 0.0),
      5.0
    );

    color += vec3(1.0, 0.79, 0.52) * rim * 0.055;

    gl_FragColor = vec4(color, alpha * 0.98);
  }
`;

// ============================================================
// CLOUD CONSTRUCTION
// ============================================================

const cloudGeometry = new THREE.BoxGeometry(2, 2, 2);

const cloudCells = [];

let paused = false;
let elapsed = 0;
let lightningTimer = 0;
let lightningFlash = 0;
let stormType = "random";

const ambientStormLight = new THREE.AmbientLight(0xffffff, 0);
scene.add(ambientStormLight);

function createCloudMesh(options = {}) {
  const uniforms = {
    uCameraLocal: { value: new THREE.Vector3() },
    uSunDir: { value: sunDirection.clone() },
    uTime: { value: 0 },
    uDensity: { value: options.density ?? 1.0 },
    uAge: { value: 0 },
    uAnvil: { value: options.anvil ? 1.0 : 0.0 },
    uHumidity: { value: 0.8 }
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: cloudVertexShader,
    fragmentShader: cloudFragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    blending: THREE.NormalBlending
  });

  const mesh = new THREE.Mesh(cloudGeometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = options.anvil ? 3 : 2;

  scene.add(mesh);

  return { mesh, uniforms };
}

function makeCell(x, z, intensity = 1, initialAge = 0) {
  const core = createCloudMesh({
    density: 1.0
  });

  const anvil = createCloudMesh({
    density: 0.95,
    anvil: true
  });

  const cell = {
    x,
    z,
    intensity,
    age: initialAge,
    core,
    anvil,
    drift: (Math.random() - 0.5) * 0.8,
    depth: (Math.random() - 0.5) * 0.6,
    baseWidth: 24 + Math.random() * 12,
    baseHeight: 25 + Math.random() * 10,
    baseDepth: 23 + Math.random() * 12,
    anvilWidth: 50 + Math.random() * 35,
    anvilDepth: 33 + Math.random() * 22,
    anvilHeight: 7 + Math.random() * 4,
    lightning: 0
  };

  cell.core.mesh.position.set(x, 22, z);
  cell.anvil.mesh.position.set(x, 42, z);

  cell.core.mesh.scale.set(0.1, 0.1, 0.1);
  cell.anvil.mesh.scale.set(0.01, 0.01, 0.01);

  cloudCells.push(cell);

  return cell;
}

// ============================================================
// STORM PRESETS
// ============================================================

function clearCloudCells() {
  for (const cell of cloudCells) {
    scene.remove(cell.core.mesh);
    scene.remove(cell.anvil.mesh);

    cell.core.mesh.material.dispose();
    cell.anvil.mesh.material.dispose();
  }

  cloudCells.length = 0;
}

function resetSimulation() {
  clearCloudCells();

  elapsed = 0;
  lightningTimer = 0;
  lightningFlash = 0;

  makeCell(0, 0, 1.0, 0);

  controls.target.set(0, 22, 0);
  updateMetrics();
}

function generateStorm() {
  clearCloudCells();

  elapsed = 0;
  lightningTimer = 0;
  lightningFlash = 0;

  stormType = $("stormType")?.value || "random";

  const type = stormType === "random"
    ? ["tower", "supercell", "multicell", "squall"][
        Math.floor(Math.random() * 4)
      ]
    : stormType;

  if (type === "tower") {
    makeCell(0, 0, 0.8, 0);
  } else if (type === "supercell") {
    makeCell(0, 0, 1.35, 0);
  } else if (type === "multicell") {
    makeCell(-22, 0, 0.9, 0);
    makeCell(15, -8, 0.75, 0);
    makeCell(42, 10, 0.7, 0);
  } else if (type === "squall") {
    for (let i = 0; i < 5; i++) {
      makeCell(-60 + i * 30, (Math.random() - 0.5) * 14, 0.9, 0);
    }
  }

  controls.target.set(0, 25, 0);
  updateMetrics();
}

// ============================================================
// ENVIRONMENT SETTINGS
// ============================================================

function updateEnvironment() {
  const cape = Number($("cape")?.value ?? 1800);
  const shear = Number($("shear")?.value ?? 20);
  const humidity = Number($("humidity")?.value ?? 70);

  if ($("capeValue")) $("capeValue").textContent = cape;
  if ($("shearValue")) $("shearValue").textContent = shear;
  if ($("humidityValue")) $("humidityValue").textContent = humidity;

  for (const cell of cloudCells) {
    cell.intensity = THREE.MathUtils.clamp(cape / 1800, 0.3, 1.7);
    cell.drift = shear / 60;
  }

  scene.fog.density = 0.00065 + (100 - humidity) * 0.000002;
}

// ============================================================
// CLOUD GROWTH AND ANVIL EVOLUTION
// ============================================================

function updateCloudCell(cell, delta) {
  cell.age += delta;

  const age = cell.age;
  const growth = THREE.MathUtils.clamp(age / 75, 0.015, 1.0);

  const cape = Number($("cape")?.value ?? 1800);
  const shear = Number($("shear")?.value ?? 20);
  const humidity = Number($("humidity")?.value ?? 70);

  const buoyancy = THREE.MathUtils.clamp(cape / 1800, 0.35, 1.8);
  const humidityFactor = THREE.MathUtils.clamp(humidity / 75, 0.35, 1.15);

  const heightGrowth = Math.min(
    1.0,
    growth * (0.7 + buoyancy * 0.3)
  );

  const widthGrowth = Math.min(
    1.0,
    0.16 + growth * (0.65 + shear / 110)
  );

  const coreWidth = cell.baseWidth * widthGrowth;
  const coreHeight = cell.baseHeight * heightGrowth;
  const coreDepth = cell.baseDepth * widthGrowth;

  cell.x += cell.drift * delta * 0.7;
  cell.z += cell.depth * delta * 0.7;

  cell.core.mesh.position.set(
    cell.x,
    4 + coreHeight * 0.82,
    cell.z
  );

  cell.core.mesh.scale.set(
    coreWidth,
    coreHeight,
    coreDepth
  );

  cell.core.uniforms.uAge.value = growth;
  cell.core.uniforms.uDensity.value = 0.9 + humidityFactor * 0.25;
  cell.core.uniforms.uHumidity.value = humidityFactor;

  const anvilGrowth = THREE.MathUtils.clamp(
    (age - 22) / 90,
    0.001,
    1.0
  );

  const anvilWidth = cell.anvilWidth * anvilGrowth;
  const anvilDepth = cell.anvilDepth * anvilGrowth;

  cell.anvil.mesh.position.set(
    cell.x + shear * 0.12,
    4 + coreHeight * 1.72,
    cell.z - shear * 0.05
  );

  cell.anvil.mesh.scale.set(
    Math.max(0.1, anvilWidth),
    Math.max(0.1, cell.anvilHeight * anvilGrowth),
    Math.max(0.1, anvilDepth)
  );

  cell.anvil.uniforms.uAge.value = anvilGrowth;
  cell.anvil.uniforms.uDensity.value = 0.75 + humidityFactor * 0.22;
  cell.anvil.uniforms.uHumidity.value = humidityFactor;

  // Anvil stretches downwind as the storm matures.
  cell.anvil.mesh.rotation.y = -0.12 - shear * 0.003;

  if (age > 35 && Math.random() < delta * 0.025) {
    cell.lightning = 1;
  } else {
    cell.lightning = Math.max(0, cell.lightning - delta * 2);
  }
}

function updateMetrics() {
  const maxHeight = cloudCells.length
    ? Math.max(...cloudCells.map(c => 4 + c.baseHeight * Math.min(1, c.age / 75) * 1.4))
    : 0;

  if ($("cloudHeight")) {
    $("cloudHeight").textContent = `${Math.round(maxHeight)} м`;
  }

  if ($("cellCount")) {
    $("cellCount").textContent = String(cloudCells.length);
  }

  if ($("status")) {
    $("status").textContent = paused ? "Пауза" : "Симуляция активна";
  }
}

// ============================================================
// LIGHTNING
// ============================================================

const lightningMaterial = new THREE.LineBasicMaterial({
  color: 0xe7f3ff,
  transparent: true,
  opacity: 0.0
});

const lightningPoints = [];
const lightningGeometry = new THREE.BufferGeometry();

const lightningLine = new THREE.Line(
  lightningGeometry,
  lightningMaterial
);

scene.add(lightningLine);

function makeLightning() {
  if (!cloudCells.length) return;

  const cell = cloudCells[Math.floor(Math.random() * cloudCells.length)];

  const points = [];
  const startY = 12 + Math.random() * 20;
  let x = cell.x + (Math.random() - 0.5) * 12;
  let z = cell.z + (Math.random() - 0.5) * 12;

  points.push(new THREE.Vector3(x, startY, z));

  for (let i = 0; i < 9; i++) {
    x += (Math.random() - 0.5) * 5;
    z += (Math.random() - 0.5) * 5;

    points.push(
      new THREE.Vector3(
        x,
        startY - (i + 1) * (startY / 9),
        z
      )
    );
  }

  lightningGeometry.setFromPoints(points);
  lightningMaterial.opacity = 1.0;
  lightningFlash = 0.18;
}

function updateLightning(delta) {
  lightningTimer -= delta;

  if (lightningTimer <= 0) {
    const cape = Number($("cape")?.value ?? 1800);
    const probability = THREE.MathUtils.clamp(cape / 3000, 0.15, 0.9);

    if (cloudCells.length && Math.random() < probability * 0.5) {
      makeLightning();
    }

    lightningTimer = 1.5 + Math.random() * 5;
  }

  if (lightningFlash > 0) {
    lightningFlash -= delta;
    lightningMaterial.opacity = Math.max(0, lightningFlash * 6);
  } else {
    lightningMaterial.opacity = 0;
  }
}

// ============================================================
// BUTTONS AND SLIDERS
// ============================================================

$("newStorm")?.addEventListener("click", generateStorm);

$("pause")?.addEventListener("click", () => {
  paused = !paused;

  if ($("pause")) {
    $("pause").textContent = paused ? "Продолжить" : "Пауза";
  }

  updateMetrics();
});

$("reset")?.addEventListener("click", resetSimulation);

$("lightning")?.addEventListener("click", makeLightning);

for (const id of ["cape", "shear", "humidity"]) {
  $(id)?.addEventListener("input", updateEnvironment);
}

// ============================================================
// ANIMATION
// ============================================================

const clock = new THREE.Clock();

let metricTimer = 0;

function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(clock.getDelta(), 0.05);

  if (!paused) {
    elapsed += delta;

    for (const cell of cloudCells) {
      updateCloudCell(cell, delta);

      for (const cloud of [cell.core, cell.anvil]) {
        cloud.uniforms.uTime.value = elapsed;

        // Transform the camera position into this cloud's local space.
        cloud.uniforms.uCameraLocal.value.copy(
          cloud.mesh.worldToLocal(camera.position.clone())
        );

        cloud.uniforms.uSunDir.value.copy(sunDirection);
      }
    }

    updateLightning(delta);

    metricTimer += delta;

    if (metricTimer > 0.5) {
      updateMetrics();
      metricTimer = 0;
    }
  }

  controls.update();
  renderer.render(scene, camera);
}

// ============================================================
// RESIZE
// ============================================================

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
});

// ============================================================
// START
// ============================================================

updateEnvironment();
resetSimulation();
animate();

if (typeof window.hideStormLoading === "function") {
  window.hideStormLoading();
}
