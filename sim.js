
/* ============================================================
   QUANTUM METEO — CONVECTIVE ATMOSPHERE

   Исправления:
   - уменьшена нагрузка на мобильный GPU;
   - облако больше не заполняет весь объём равномерной дымкой;
   - плотное конвективное ядро и выраженные кучевые края;
   - расширение наковальни у верхней части облака;
   - сохранены рельеф, камера, интерфейс, молнии и управление.

   index.html НЕ ИЗМЕНЯЕТСЯ.
   ============================================================ */

import * as THREE from
  "https://esm.sh/three@0.180.0";

import { OrbitControls } from
  "https://esm.sh/three@0.180.0/examples/jsm/controls/OrbitControls.js";


// ============================================================
// DOM
// ============================================================

const canvas = document.querySelector("#scene");

if (!canvas) {
  throw new Error("Quantum Meteo: canvas #scene не найден.");
}

const $ = (id) => document.getElementById(id);


// ============================================================
// RENDERER
// ============================================================

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  alpha: false,
  powerPreference: "high-performance"
});

renderer.setPixelRatio(
  Math.min(window.devicePixelRatio || 1, 1.15)
);

renderer.setSize(
  canvas.clientWidth || window.innerWidth,
  canvas.clientHeight || window.innerHeight,
  false
);

renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;


// ============================================================
// SCENE
// ============================================================

const scene = new THREE.Scene();

scene.background = new THREE.Color(0x91b6d2);
scene.fog = new THREE.Fog(0x91b6d2, 1100, 2900);


// ============================================================
// CAMERA
// ============================================================

const camera = new THREE.PerspectiveCamera(
  55,
  1,
  0.1,
  4500
);

camera.position.set(460, 270, 620);

const controls = new OrbitControls(
  camera,
  renderer.domElement
);

controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.minDistance = 100;
controls.maxDistance = 1800;
controls.maxPolarAngle = Math.PI * 0.495;
controls.target.set(0, 100, 0);


// ============================================================
// STATE
// ============================================================

const state = {
  cape: 2400,
  shear: 25,
  humidity: 78,
  stormType: "supercell",

  paused: false,
  lightning: true,

  time: 0,
  growth: 1,

  lightningTimer: 2,
  lightningFlash: 0,

  seed: Math.random() * 1000
};


// ============================================================
// TERRAIN
// ============================================================

const WORLD = 1200;
const TERRAIN_SEGMENTS = 140;

function heightAt(x, z) {
  const hills =
    Math.sin(x * 0.0034) * 8 +
    Math.cos(z * 0.0031) * 7 +
    Math.sin((x + z) * 0.0024) * 5;

  const hills2 =
    Math.sin(x * 0.012) *
    Math.cos(z * 0.011) * 2.1;

  const valley =
    Math.exp(
      -(
        (x + 150) ** 2 +
        (z - 80) ** 2
      ) / 110000
    ) * 12;

  return hills + hills2 - valley;
}

function makeTerrainTexture() {
  const size = 512;
  const c = document.createElement("canvas");

  c.width = size;
  c.height = size;

  const ctx = c.getContext("2d");

  ctx.fillStyle = "#687966";
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 12000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;

    ctx.fillStyle = Math.random() > 0.5
      ? "rgba(165,174,128,0.12)"
      : "rgba(30,53,39,0.11)";

    const s = 1 + Math.random() * 2;

    ctx.fillRect(x, y, s, s);
  }

  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = "#9da58c";
  ctx.lineWidth = 1;

  for (let i = 0; i < 14; i++) {
    ctx.beginPath();

    let x = Math.random() * size;
    let y = Math.random() * size;

    ctx.moveTo(x, y);

    for (let j = 0; j < 12; j++) {
      x += Math.random() * 35 - 17.5;
      y += Math.random() * 35 - 17.5;
      ctx.lineTo(x, y);
    }

    ctx.stroke();
  }

  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(c);

  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;

  texture.anisotropy = Math.min(
    renderer.capabilities.getMaxAnisotropy(),
    4
  );

  return texture;
}

function makeTerrain() {
  const geometry = new THREE.PlaneGeometry(
    WORLD,
    WORLD,
    TERRAIN_SEGMENTS,
    TERRAIN_SEGMENTS
  );

  geometry.rotateX(-Math.PI / 2);

  const positions = geometry.attributes.position;

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);

    positions.setY(i, heightAt(x, z));
  }

  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    map: makeTerrainTexture(),
    color: 0xc0c8b6,
    roughness: 1,
    metalness: 0
  });

  const terrain = new THREE.Mesh(geometry, material);

  terrain.receiveShadow = false;
  scene.add(terrain);
}

makeTerrain();


// ============================================================
// LIGHTING
// ============================================================

scene.add(
  new THREE.HemisphereLight(
    0xc7e1ff,
    0x475044,
    1.65
  )
);

const sun = new THREE.DirectionalLight(
  0xfff0d7,
  2.5
);

sun.position.set(-400, 700, 300);
scene.add(sun);


// ============================================================
// HORIZON
// ============================================================

const horizonGeometry =
  new THREE.RingGeometry(850, 2400, 96);

horizonGeometry.rotateX(-Math.PI / 2);

const horizon = new THREE.Mesh(
  horizonGeometry,
  new THREE.MeshBasicMaterial({
    color: 0x91b6d2,
    side: THREE.DoubleSide,
    fog: false
  })
);

horizon.position.y = -2;
scene.add(horizon);


// ============================================================
// LIGHTNING
// ============================================================

let lightningGroup = null;

function clearLightning() {
  if (!lightningGroup) return;

  scene.remove(lightningGroup);

  lightningGroup.traverse((obj) => {
    obj.geometry?.dispose();

    if (Array.isArray(obj.material)) {
      obj.material.forEach((m) => m.dispose());
    } else {
      obj.material?.dispose();
    }
  });

  lightningGroup = null;
}

function createLightning() {
  clearLightning();

  const group = new THREE.Group();
  const points = [];

  let x = 0;
  let y = 285;
  let z = 0;

  points.push(new THREE.Vector3(x, y, z));

  for (let i = 0; i < 16; i++) {
    y -= 10 + Math.random() * 9;
    x += (Math.random() - 0.5) * 18;
    z += (Math.random() - 0.5) * 18;

    points.push(new THREE.Vector3(x, y, z));
  }

  const geometry = new THREE.BufferGeometry()
    .setFromPoints(points);

  const material = new THREE.LineBasicMaterial({
    color: 0xe9f5ff,
    transparent: true,
    opacity: 1
  });

  group.add(new THREE.Line(geometry, material));

  const glow = new THREE.PointLight(
    0x9ecbff,
    45,
    230
  );

  glow.position.set(x, y, z);
  group.add(glow);

  scene.add(group);

  lightningGroup = group;
  state.lightningFlash = 1;
}


// ============================================================
// DEPTH RENDER TARGET
// ============================================================

const renderTarget = new THREE.WebGLRenderTarget(
  1,
  1,
  {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: true,
    stencilBuffer: false
  }
);

renderTarget.depthTexture = new THREE.DepthTexture(
  1,
  1,
  THREE.UnsignedIntType
);

renderTarget.depthTexture.format = THREE.DepthFormat;
renderTarget.texture.colorSpace = THREE.NoColorSpace;


// ============================================================
// FULLSCREEN CLOUD PASS
// ============================================================

const postScene = new THREE.Scene();

const postCamera = new THREE.OrthographicCamera(
  -1, 1, 1, -1, 0, 1
);

const quadGeometry = new THREE.PlaneGeometry(2, 2);


// ============================================================
// UNIFORMS
// ============================================================

const cloudUniforms = {
  uScene: { value: renderTarget.texture },
  uDepth: { value: renderTarget.depthTexture },

  uInverseProjection: { value: new THREE.Matrix4() },
  uInverseView: { value: new THREE.Matrix4() },
  uCameraPosition: { value: new THREE.Vector3() },

  uTime: { value: 0 },
  uCAPE: { value: state.cape },
  uShear: { value: state.shear },
  uHumidity: { value: state.humidity },
  uStormType: { value: 1 },
  uGrowth: { value: 1 },
  uFlash: { value: 0 },
  uSeed: { value: state.seed }
};


// ============================================================
// CLOUD SHADER
// ============================================================

const cloudFragmentShader = /* glsl */ `
precision highp float;

uniform sampler2D uScene;
uniform sampler2D uDepth;

uniform mat4 uInverseProjection;
uniform mat4 uInverseView;

uniform vec3 uCameraPosition;

uniform float uTime;
uniform float uCAPE;
uniform float uShear;
uniform float uHumidity;
uniform float uStormType;
uniform float uGrowth;
uniform float uFlash;
uniform float uSeed;

varying vec2 vUv;


// ------------------------------------------------------------
// NOISE
// ------------------------------------------------------------

float hash31(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yxz + 33.33);
    return fract((p.x + p.y) * p.z);
}

float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);

    f = f * f * (3.0 - 2.0 * f);

    float n000 = hash31(i);
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

// Три октавы вместо пяти: дешевле для мобильного GPU.
float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;

    for (int i = 0; i < 3; i++) {
        value += noise3(p) * amplitude;
        p *= 2.02;
        amplitude *= 0.5;
    }

    return value / 0.875;
}


// ------------------------------------------------------------
// BOX INTERSECTION
// ------------------------------------------------------------

vec2 intersectBox(
    vec3 ro,
    vec3 rd,
    vec3 bmin,
    vec3 bmax
) {
    vec3 invDir = 1.0 / rd;

    vec3 t0 = (bmin - ro) * invDir;
    vec3 t1 = (bmax - ro) * invDir;

    vec3 tmin = min(t0, t1);
    vec3 tmax = max(t0, t1);

    float nearT = max(
        max(tmin.x, tmin.y),
        tmin.z
    );

    float farT = min(
        min(tmax.x, tmax.y),
        tmax.z
    );

    return vec2(nearT, farT);
}


// ------------------------------------------------------------
// CLOUD HEIGHT AND INTENSITY
// ------------------------------------------------------------

float cloudTop() {
    float cape = clamp(uCAPE / 4000.0, 0.1, 1.0);
    return mix(220.0, 440.0, cape) * uGrowth;
}

float stormIntensity() {
    float capeFactor = clamp(uCAPE / 3500.0, 0.15, 1.2);
    float moisture = clamp(uHumidity / 100.0, 0.1, 1.0);

    return capeFactor * moisture;
}

vec2 windOffset(float height) {
    float h = clamp((height - 70.0) / 380.0, 0.0, 1.0);
    float shear = uShear / 45.0;

    vec2 wind = vec2(1.0, 0.24);
    wind *= h * h * shear * 150.0;

    wind.x += uTime * 2.4;
    wind.y += uTime * 0.65;

    return wind;
}


// ------------------------------------------------------------
// CONVECTIVE CLOUD FIELD
//
// Важное отличие:
// - оболочка больше не заполняет весь объём;
// - края формируются порогом плотности;
// - башня отделена от верхней наковальни;
// - шум влияет на форму, а не создаёт туман повсюду.
// ------------------------------------------------------------

float convectiveField(vec3 p) {
    float height = p.y;
    float top = cloudTop();
    float base = 68.0;

    if (height < base || height > top + 25.0) {
        return 0.0;
    }

    float vertical = clamp(
        (height - base) / max(top - base, 1.0),
        0.0,
        1.0
    );

    vec2 q = p.xz - windOffset(height);

    float rotation = uTime * 0.008;

    mat2 rot = mat2(
        cos(rotation), -sin(rotation),
        sin(rotation),  cos(rotation)
    );

    q = rot * q;

    // Верхняя часть расширяется, но не превращает
    // весь объём в однородный слой.
    float towerWidth = mix(92.0, 120.0, vertical);
    float anvilLevel = smoothstep(0.64, 0.91, vertical);

    float stormMode = uStormType;

    // Режимы различаются шириной и структурой поля.
    float modeWidth = 1.0;

    if (stormMode > 1.5 && stormMode < 2.5) {
        modeWidth = 1.18;
    } else if (stormMode > 2.5 && stormMode < 3.5) {
        modeWidth = 1.35;
    } else if (stormMode < 0.5) {
        modeWidth = 0.78;
    }

    towerWidth *= modeWidth;

    float anvilWidth = mix(
        towerWidth,
        260.0 * modeWidth,
        anvilLevel
    );

    float radius = length(q);

    float core = exp(
        -(radius * radius) /
        (towerWidth * towerWidth * 0.58)
    );

    float envelope = exp(
        -(radius * radius) /
        (anvilWidth * anvilWidth * 0.72)
    );

    vec3 np = vec3(
        q.x * 0.025,
        height * 0.021,
        q.y * 0.025
    );

    np += vec3(
        uTime * 0.012,
        -uTime * 0.006,
        uTime * 0.008
    );

    // Сдвигаем шум для разных генераций шторма.
    np += vec3(uSeed * 0.013, uSeed * 0.007, uSeed * 0.011);

    float broad = fbm(np);
    float detail = noise3(np * 3.1);
    float fine = noise3(np * 5.4);

    float turbulence =
        (broad - 0.5) * 0.48 +
        (detail - 0.5) * 0.24 +
        (fine - 0.5) * 0.12;

    // Жёстче порог — меньше полупрозрачной дымки.
    float towerShape = smoothstep(
        0.22,
        0.64,
        core + turbulence
    );

    // Наковальня имеет собственную структуру
    // и выражена только на верхних уровнях.
    float anvilShape = smoothstep(
        0.24,
        0.62,
        envelope + (broad - 0.5) * 0.24
    );

    float anvil = anvilShape *
        anvilLevel *
        smoothstep(0.38, 0.72, broad);

    // Узкий выступ над вершиной башни.
    float overshoot = core *
        exp(-pow((vertical - 0.955) / 0.045, 2.0));

    // Рельефное основание и резкое завершение сверху.
    float baseShape = smoothstep(0.015, 0.15, vertical);

    float topNoise = (broad - 0.5) * 0.10;

    float topShape = 1.0 - smoothstep(
        0.94 + topNoise,
        1.035 + topNoise,
        vertical
    );

    float density =
        towerShape * 0.92 +
        anvil * 0.34 +
        overshoot * 0.16;

    density *= baseShape * topShape;

    // Влажность влияет на насыщенность облака.
    density *= mix(
        0.66,
        1.0,
        clamp(uHumidity / 100.0, 0.0, 1.0)
    );

    density *= stormIntensity();

    // Ниже порога облако полностью прозрачно.
    density = max(density - 0.12, 0.0);

    return min(density, 1.15);
}


// ------------------------------------------------------------
// LIGHTING
// ------------------------------------------------------------

float cloudLighting(vec3 p, vec3 rayDirection, float density) {
    vec3 lightDirection = normalize(vec3(-0.55, 0.78, 0.35));

    float heightFactor = clamp((p.y - 60.0) / 380.0, 0.0, 1.0);

    float towardSun = max(
        dot(-rayDirection, lightDirection),
        0.0
    );

    float forwardScattering = pow(towardSun, 3.0) * 0.12;

    float topLight = smoothstep(
        0.35,
        0.95,
        heightFactor
    ) * 0.28;

    float underside = density * 0.22;

    return clamp(
        0.36 + topLight + forwardScattering - underside,
        0.12,
        1.0
    );
}


// ------------------------------------------------------------
// SCENE DEPTH
// ------------------------------------------------------------

float sceneDistance(vec2 uv) {
    float depth = texture2D(uDepth, uv).r;

    if (depth >= 0.999999) {
        return 2400.0;
    }

    vec4 clip = vec4(
        uv * 2.0 - 1.0,
        depth * 2.0 - 1.0,
        1.0
    );

    vec4 viewPosition = uInverseProjection * clip;

    viewPosition /= max(abs(viewPosition.w), 0.00001);

    vec4 worldPosition =
        uInverseView * vec4(viewPosition.xyz, 1.0);

    return length(worldPosition.xyz - uCameraPosition);
}


// ------------------------------------------------------------
// MAIN RAYMARCH
// ------------------------------------------------------------

void main() {
    vec4 background = texture2D(uScene, vUv);
    float maxDistance = sceneDistance(vUv);

    vec4 clipPosition = vec4(
        vUv * 2.0 - 1.0,
        1.0,
        1.0
    );

    vec4 viewPosition = uInverseProjection * clipPosition;

    viewPosition /= max(abs(viewPosition.w), 0.00001);

    vec3 rayDirection = normalize(
        (uInverseView * vec4(normalize(viewPosition.xyz), 0.0)).xyz
    );

    vec3 rayOrigin = uCameraPosition;

    vec3 boxMin = vec3(-900.0, 25.0, -900.0);
    vec3 boxMax = vec3(900.0, 530.0, 900.0);

    vec2 hit = intersectBox(
        rayOrigin,
        rayDirection,
        boxMin,
        boxMax
    );

    float startT = max(hit.x, 0.0);
    float endT = min(hit.y, maxDistance);

    if (endT <= startT || hit.y <= 0.0) {
        gl_FragColor = background;
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        return;
    }

    float distanceThroughVolume = endT - startT;

    // 40 шагов вместо 72 — меньше работы на каждый пиксель.
    const int STEPS = 40;

    float stepLength = distanceThroughVolume / float(STEPS);

    vec3 accumulatedColor = vec3(0.0);
    float transmittance = 1.0;

    for (int i = 0; i < STEPS; i++) {
        float t = startT + (float(i) + 0.5) * stepLength;
        vec3 p = rayOrigin + rayDirection * t;

        float density = convectiveField(p);

        if (density > 0.015) {
            float heightFactor = clamp(
                (p.y - 60.0) / 400.0,
                0.0,
                1.0
            );

            float lighting = cloudLighting(
                p,
                rayDirection,
                density
            );

            vec3 shadowColor = vec3(0.24, 0.29, 0.36);
            vec3 sunlightColor = vec3(1.0, 0.97, 0.91);

            vec3 cloudColor = mix(
                shadowColor,
                sunlightColor,
                lighting
            );

            float ice = smoothstep(0.65, 0.96, heightFactor);

            cloudColor = mix(
                cloudColor,
                vec3(0.84, 0.89, 0.96),
                ice * 0.50
            );

            float lowerShade = 1.0 - smoothstep(
                0.0,
                0.55,
                heightFactor
            );

            cloudColor *= 1.0 - lowerShade * 0.18;

            cloudColor +=
                vec3(0.65, 0.76, 1.0) * uFlash * 0.9;

            // Меньше накопления полупрозрачной дымки.
            float alpha = 1.0 - exp(
                -density * stepLength * 0.014
            );

            alpha = clamp(alpha, 0.0, 0.62);

            accumulatedColor +=
                transmittance * alpha * cloudColor;

            transmittance *= 1.0 - alpha;

            if (transmittance < 0.035) {
                break;
            }
        }
    }

    vec3 finalColor =
        accumulatedColor + transmittance * background.rgb;

    gl_FragColor = vec4(finalColor, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;


// ============================================================
// SHADER MATERIAL
// ============================================================

const cloudMaterial = new THREE.ShaderMaterial({
  uniforms: cloudUniforms,

  vertexShader: /* glsl */ `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,

  fragmentShader: cloudFragmentShader,

  depthTest: false,
  depthWrite: false,
  transparent: false,
  toneMapped: true
});

const fullscreenQuad = new THREE.Mesh(
  quadGeometry,
  cloudMaterial
);

fullscreenQuad.frustumCulled = false;
postScene.add(fullscreenQuad);


// ============================================================
// UI
// ============================================================

const capeInput = $("cape");
const shearInput = $("shear");
const humidityInput = $("humidity");
const stormTypeInput = $("stormType");

function updateText(id, value) {
  const element = $(id);

  if (element) {
    element.textContent = value;
  }
}

function readSlider(input, fallback) {
  if (!input) return fallback;

  const value = Number(input.value);

  return Number.isFinite(value) ? value : fallback;
}

function cloudTop() {
  const cape = Math.max(
    0.1,
    Math.min(state.cape / 4000, 1)
  );

  return (220 + 220 * cape) * state.growth;
}

function syncControls() {
  state.cape = readSlider(capeInput, state.cape);
  state.shear = readSlider(shearInput, state.shear);
  state.humidity = readSlider(humidityInput, state.humidity);

  if (stormTypeInput) {
    state.stormType = stormTypeInput.value || "supercell";
  }

  cloudUniforms.uCAPE.value = state.cape;
  cloudUniforms.uShear.value = state.shear;
  cloudUniforms.uHumidity.value = state.humidity;

  const typeMap = {
    tower: 0,
    supercell: 1,
    multicell: 2,
    squall: 3,
    random: 4
  };

  cloudUniforms.uStormType.value =
    typeMap[state.stormType] ?? 1;

  updateText("capeValue", `${Math.round(state.cape)} J/kg`);
  updateText("shearValue", `${Math.round(state.shear)} m/s`);
  updateText("humidityValue", `${Math.round(state.humidity)}%`);
  updateText("cloudHeight", `${Math.round(cloudTop())} m`);

  updateText(
    "cellCount",
    state.stormType === "multicell"
      ? "Несколько ячеек"
      : state.stormType === "squall"
        ? "Линия конвекции"
        : "Главная ячейка"
  );

  updateText(
    "status",
    state.paused ? "Пауза" : "Конвекция активна"
  );
}

[
  capeInput,
  shearInput,
  humidityInput,
  stormTypeInput
].forEach((element) => {
  if (!element) return;

  element.addEventListener("input", syncControls);
  element.addEventListener("change", syncControls);
});


// ============================================================
// BUTTONS
// ============================================================

const pauseButton = $("pause");
const lightningButton = $("lightning");
const resetButton = $("reset");
const newStormButton = $("newStorm");

if (pauseButton) {
  pauseButton.addEventListener("click", () => {
    state.paused = !state.paused;

    pauseButton.textContent = state.paused
      ? "Продолжить"
      : "Пауза";

    syncControls();
  });
}

if (lightningButton) {
  lightningButton.addEventListener("click", () => {
    state.lightning = !state.lightning;

    lightningButton.textContent = state.lightning
      ? "Молнии: вкл."
      : "Молнии: выкл.";

    if (!state.lightning) {
      clearLightning();
      state.lightningFlash = 0;
    }
  });
}

if (newStormButton) {
  newStormButton.addEventListener("click", () => {
    state.seed = Math.random() * 10000;
    cloudUniforms.uSeed.value = state.seed;

    state.time = 0;
    state.growth = 0.65;
    state.lightningTimer = 2;

    clearLightning();
    syncControls();
  });
}

if (resetButton) {
  resetButton.addEventListener("click", () => {
    state.time = 0;
    state.growth = 1;
    state.paused = false;

    camera.position.set(460, 270, 620);
    controls.target.set(0, 100, 0);
    controls.update();

    clearLightning();

    if (pauseButton) {
      pauseButton.textContent = "Пауза";
    }

    syncControls();
  });
}


// ============================================================
// GROWTH SPEED
// ============================================================

let growthSpeed = 1;

const growthButton = $("growthSpeed");

if (growthButton) {
  growthButton.addEventListener("click", () => {
    growthSpeed = growthSpeed >= 3
      ? 0.5
      : growthSpeed + 0.5;

    growthButton.textContent =
      `Рост ×${growthSpeed.toFixed(1)}`;
  });
}


// ============================================================
// RESIZE
// ============================================================

function resize() {
  const width = Math.max(
    1,
    canvas.clientWidth || window.innerWidth
  );

  const height = Math.max(
    1,
    canvas.clientHeight || window.innerHeight
  );

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  const pixelRatio = Math.min(
    window.devicePixelRatio || 1,
    1.15
  );

  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);

  const w = Math.max(1, Math.floor(width * pixelRatio));
  const h = Math.max(1, Math.floor(height * pixelRatio));

  renderTarget.setSize(w, h);
}

window.addEventListener("resize", resize);
resize();


// ============================================================
// RENDER LOOP
// ============================================================

let previousTime = performance.now();

function animate(now) {
  requestAnimationFrame(animate);

  const delta = Math.min(
    (now - previousTime) / 1000,
    0.05
  );

  previousTime = now;

  if (!state.paused) {
    state.time += delta;

    state.growth +=
      (1.0 - state.growth) *
      Math.min(delta * 0.035, 0.01);

    state.lightningTimer -= delta;

    if (
      state.lightning &&
      state.lightningTimer <= 0 &&
      Math.random() < 0.035
    ) {
      createLightning();

      state.lightningTimer =
        2.0 + Math.random() * 7.0;
    }

    state.lightningFlash *= Math.exp(-delta * 5.5);

    if (
      lightningGroup &&
      state.lightningFlash < 0.025
    ) {
      clearLightning();
    }
  }

  controls.update();

  cloudUniforms.uTime.value = state.time * growthSpeed;
  cloudUniforms.uGrowth.value = state.growth;
  cloudUniforms.uFlash.value = state.lightningFlash;

  camera.updateMatrixWorld();

  cloudUniforms.uCameraPosition.value.copy(camera.position);

  cloudUniforms.uInverseProjection.value
    .copy(camera.projectionMatrix)
    .invert();

  cloudUniforms.uInverseView.value.copy(camera.matrixWorld);

  // 1. Рельеф и глубина сцены.
  renderer.setRenderTarget(renderTarget);
  renderer.clear();
  renderer.render(scene, camera);

  // 2. Объёмное облако с учётом глубины.
  renderer.setRenderTarget(null);
  renderer.clear();
  renderer.render(postScene, postCamera);

  updateText("cloudHeight", `${Math.round(cloudTop())} m`);
}

syncControls();
requestAnimationFrame(animate);


// ============================================================
// READY
// ============================================================

const loading = document.querySelector("#loading");

if (loading) {
  loading.style.display = "none";
}

console.log(
  "Quantum Meteo: optimized convective renderer initialized."
);
