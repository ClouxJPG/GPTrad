
/* ============================================================
   QUANTUM METEO — EVOLVING CONVECTIVE SYSTEM

   Упрощённая time-dependent модель грозовой конвекции.

   ФИЗИЧЕСКИ МОТИВИРОВАННЫЕ ПРОЦЕССЫ:
   - последовательное зарождение конвективных ячеек;
   - развитие и ослабление восходящих потоков;
   - независимый жизненный цикл каждой ячейки;
   - зависимость высоты от CAPE;
   - влияние влажности на плотность облака;
   - перенос верхней части облака сдвигом ветра;
   - расширение и снос наковальни;
   - разные режимы: башня, суперячейка,
     мультиячейковая система, линия шквалов;
   - динамическая реакция на настройки;
   - облака с объёмной структурой и неровными краями.

   Ограничение:
   Это не полноценная численная модель CM1.
   Атмосферная динамика здесь параметризована.

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
  Math.min(window.devicePixelRatio || 1, 1.1)
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

  // Время симуляции, не реальное метеорологическое время.
  time: 0,

  lightningTimer: 3,
  lightningFlash: 0,

  seed: Math.random() * 10000,
  stormGeneration: 0
};


// ============================================================
// TERRAIN
// ============================================================

const WORLD = 1200;
const TERRAIN_SEGMENTS = 100;

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

  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;

    ctx.fillStyle = Math.random() > 0.5
      ? "rgba(165,174,128,0.12)"
      : "rgba(30,53,39,0.11)";

    const s = 1 + Math.random() * 2;

    ctx.fillRect(x, y, s, s);
  }

  ctx.globalAlpha = 0.22;
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

  // Разряд возникает над активной частью системы.
  let x = (Math.random() - 0.5) * 150;
  let y = 300 + Math.random() * 80;
  let z = (Math.random() - 0.5) * 150;

  points.push(new THREE.Vector3(x, y, z));

  for (let i = 0; i < 19; i++) {
    y -= 7 + Math.random() * 11;
    x += (Math.random() - 0.5) * 20;
    z += (Math.random() - 0.5) * 20;

    points.push(new THREE.Vector3(x, y, z));

    // Небольшие боковые ответвления.
    if (i > 3 && Math.random() < 0.22) {
      const branchPoints = [
        new THREE.Vector3(x, y, z),
        new THREE.Vector3(
          x + (Math.random() - 0.5) * 38,
          y - 8 - Math.random() * 16,
          z + (Math.random() - 0.5) * 38
        )
      ];

      const branchGeometry =
        new THREE.BufferGeometry().setFromPoints(branchPoints);

      group.add(
        new THREE.Line(
          branchGeometry,
          new THREE.LineBasicMaterial({
            color: 0xcce8ff,
            transparent: true,
            opacity: 0.8
          })
        )
      );
    }
  }

  const geometry = new THREE.BufferGeometry()
    .setFromPoints(points);

  group.add(
    new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({
        color: 0xf0f8ff,
        transparent: true,
        opacity: 1
      })
    )
  );

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
  uFlash: { value: 0 },
  uSeed: { value: state.seed }
};


// ============================================================
// CLOUD SHADER — TIME-DEPENDENT CONVECTION
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
uniform float uFlash;
uniform float uSeed;

varying vec2 vUv;


// ------------------------------------------------------------
// HASH AND VALUE NOISE
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

float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.56;

    value += noise3(p) * amplitude;
    p *= 2.03;
    amplitude *= 0.48;

    value += noise3(p) * amplitude;

    return value / 0.8288;
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
// ATMOSPHERIC PARAMETERS
// ------------------------------------------------------------

float availableCAPE() {
    return clamp(uCAPE / 3500.0, 0.08, 1.25);
}

float moistureFactor() {
    return clamp(uHumidity / 100.0, 0.0, 1.0);
}

float equilibriumHeight() {
    // Условная высота вершины: не является расчётом LFC/EL.
    return mix(
        185.0,
        450.0,
        clamp(uCAPE / 4000.0, 0.0, 1.0)
    );
}

float shearFactor() {
    return clamp(uShear / 45.0, 0.0, 1.4);
}


// ------------------------------------------------------------
// CELL LIFE CYCLE
//
// Каждая ячейка имеет собственный возраст:
// зарождение → рост → зрелость → распад.
//
// Периодическое обновление позволяет системе
// формировать новые ячейки, пока старые затухают.
// ------------------------------------------------------------

float cellAge(float index) {
    float cycle = 112.0;

    float offset = index * 27.0;
    offset += hash31(vec3(index, uSeed, 4.7)) * 13.0;

    return mod(uTime * 0.72 + offset, cycle);
}

float cellLife(float age) {
    float birth = smoothstep(2.0, 17.0, age);
    float decay = 1.0 - smoothstep(75.0, 108.0, age);

    return birth * decay;
}

float cellGrowth(float age) {
    float growing = smoothstep(4.0, 38.0, age);
    float mature = 1.0 - smoothstep(70.0, 103.0, age);

    return max(0.12, growing) * max(0.0, mature);
}


// ------------------------------------------------------------
// CELL POSITION
//
// Сдвиг ветра возрастает с высотой.
// Верхняя часть переносится сильнее, чем основание.
// ------------------------------------------------------------

vec2 windDisplacement(float height) {
    float h = clamp((height - 65.0) / 390.0, 0.0, 1.0);
    float shear = shearFactor();

    vec2 direction = normalize(vec2(1.0, 0.28));

    vec2 displacement =
        direction * h * h * shear * 210.0;

    displacement.x += uTime * 0.38;
    displacement.y += uTime * 0.10;

    return displacement;
}

vec2 cellCenter(float index, float age) {
    float mode = uStormType;

    float spacing = 165.0;

    if (mode > 1.5 && mode < 2.5) {
        // Мультиячейковая система.
        float side = mod(index, 2.0) * 2.0 - 1.0;

        return vec2(
            (index - 1.5) * spacing,
            side * 32.0 + sin(age * 0.07 + index) * 22.0
        );
    }

    if (mode > 2.5 && mode < 3.5) {
        // Линия шквалов: ячейки вдоль одной оси.
        return vec2(
            (index - 1.5) * 125.0,
            sin(index * 1.7) * 24.0
        );
    }

    if (mode < 0.5) {
        // Одиночная башня.
        return vec2(
            (index - 1.5) * 250.0,
            0.0
        );
    }

    // Суперячейковый режим: главная ячейка и
    // менее интенсивные соседние конвективные башни.
    return vec2(
        (index - 1.5) * 145.0 +
            sin(age * 0.045 + index) * 16.0,
        sin(age * 0.06 + index * 2.0) * 26.0
    );
}


// ------------------------------------------------------------
// SINGLE CONVECTIVE CELL
// ------------------------------------------------------------

float singleCell(
    vec3 p,
    float index
) {
    float age = cellAge(index);
    float life = cellLife(age);

    if (life <= 0.001) {
        return 0.0;
    }

    float growth = cellGrowth(age);
    float cape = availableCAPE();
    float humidity = moistureFactor();

    float base = 66.0;

    float top = equilibriumHeight();

    // Рост башни зависит от стадии развития.
    top = mix(
        base + 35.0,
        top,
        growth
    );

    top *= mix(0.65, 1.0, cape);

    if (p.y < base || p.y > top + 34.0) {
        return 0.0;
    }

    float vertical = clamp(
        (p.y - base) / max(top - base, 1.0),
        0.0,
        1.15
    );

    vec2 center = cellCenter(index, age);
    vec2 wind = windDisplacement(p.y);

    vec2 q = p.xz - center - wind;

    // В суперячейковом режиме система вращается
    // медленно, а не остаётся геометрически неподвижной.
    float rotation = uTime * 0.0045 * shearFactor();

    float cs = cos(rotation);
    float sn = sin(rotation);

    q = mat2(cs, -sn, sn, cs) * q;

    float mode = uStormType;

    float widthMultiplier = 1.0;

    if (mode < 0.5) {
        widthMultiplier = 0.72;
    } else if (mode > 1.5 && mode < 2.5) {
        widthMultiplier = 0.92;
    } else if (mode > 2.5 && mode < 3.5) {
        widthMultiplier = 0.80;
    }

    float radius = length(q);

    // Конвективная башня расширяется вверх.
    float towerWidth = mix(
        38.0,
        92.0,
        smoothstep(0.0, 0.82, vertical)
    );

    towerWidth *= widthMultiplier;
    towerWidth *= mix(0.75, 1.16, growth);

    // Наковальня появляется преимущественно
    // в верхней части зрелой ячейки.
    float anvilLevel = smoothstep(
        0.61,
        0.88,
        vertical
    );

    float anvilWidth = mix(
        towerWidth * 1.15,
        205.0 + shearFactor() * 105.0,
        anvilLevel
    );

    anvilWidth *= widthMultiplier;

    // Трёхмерная турбулентность краёв.
    vec3 np = vec3(
        q.x * 0.021,
        p.y * 0.025,
        q.y * 0.021
    );

    np += vec3(
        uSeed * 0.013 + index * 4.7,
        -uTime * 0.012,
        uSeed * 0.007 + index * 2.3
    );

    float broad = fbm(np);
    float detail = noise3(np * 2.7);

    float turbulence =
        (broad - 0.5) * 0.42 +
        (detail - 0.5) * 0.16;

    float towerRadius =
        exp(
            -(radius * radius) /
            max(towerWidth * towerWidth * 0.72, 1.0)
        );

    float tower = smoothstep(
        0.20,
        0.66,
        towerRadius + turbulence
    );

    float anvilRadius =
        exp(
            -(radius * radius) /
            max(anvilWidth * anvilWidth * 0.72, 1.0)
        );

    float anvilTexture = smoothstep(
        0.20,
        0.61,
        anvilRadius + (broad - 0.5) * 0.23
    );

    float anvil = anvilTexture * anvilLevel;

    // Верхушка башни может немного перерастать
    // среднюю высоту зрелого облака.
    float overshoot =
        tower *
        exp(
            -pow((vertical - 0.94) / 0.075, 2.0)
        );

    float baseShape = smoothstep(
        0.0,
        0.105,
        vertical
    );

    float topNoise = (broad - 0.5) * 0.065;

    float topShape = 1.0 - smoothstep(
        0.95 + topNoise,
        1.075 + topNoise,
        vertical
    );

    // Небольшие вертикальные неоднородности
    // создают вид отдельных кучевых башен.
    float turretPattern = noise3(
        vec3(
            q.x * 0.038,
            p.y * 0.018 + uTime * 0.009,
            q.y * 0.038
        )
    );

    float turrets = smoothstep(
        0.32,
        0.77,
        turretPattern
    );

    tower *= mix(0.82, 1.12, turrets);

    float density =
        tower * 0.94 +
        anvil * 0.40 +
        overshoot * 0.18;

    density *= baseShape * topShape;
    density *= life;

    // Сухая среда снижает оптическую плотность.
    density *= mix(0.35, 1.0, humidity);

    // CAPE влияет на интенсивность конвекции.
    density *= mix(0.42, 1.0, cape);

    // В мультиячейковом режиме соседние ячейки
    // немного слабее, чем ведущая.
    if (mode > 1.5 && mode < 2.5) {
        float cellStrength =
            index < 1.5 ? 1.0 : 0.83;

        density *= cellStrength;
    }

    if (mode > 2.5 && mode < 3.5) {
        density *= 0.90;
    }

    // Прозрачность ниже порога исключает
    // равномерную дымку вокруг облака.
    density = max(density - 0.095, 0.0);

    return min(density, 1.0);
}


// ------------------------------------------------------------
// COMPLETE STORM FIELD
// ------------------------------------------------------------

float convectiveField(vec3 p) {
    float total = 0.0;

    // Фиксированный цикл совместим с мобильными GPU.
    for (int i = 0; i < 4; i++) {
        total += singleCell(p, float(i));
    }

    // Ограничение плотности помогает избежать
    // чрезмерно тёмного результата при слиянии ячеек.
    return min(total, 1.25);
}


// ------------------------------------------------------------
// CLOUD LIGHTING
// ------------------------------------------------------------

float cloudLighting(
    vec3 p,
    vec3 rayDirection,
    float density
) {
    vec3 lightDirection =
        normalize(vec3(-0.55, 0.78, 0.35));

    float heightFactor = clamp(
        (p.y - 60.0) / 400.0,
        0.0,
        1.0
    );

    float towardSun = max(
        dot(-rayDirection, lightDirection),
        0.0
    );

    float forwardScattering =
        pow(towardSun, 3.0) * 0.12;

    float topLight = smoothstep(
        0.35,
        0.95,
        heightFactor
    ) * 0.27;

    float underside = density * 0.24;

    return clamp(
        0.38 + topLight + forwardScattering - underside,
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

    viewPosition /= max(
        abs(viewPosition.w),
        0.00001
    );

    vec4 worldPosition =
        uInverseView * vec4(viewPosition.xyz, 1.0);

    return length(
        worldPosition.xyz - uCameraPosition
    );
}


// ------------------------------------------------------------
// RAYMARCH
// ------------------------------------------------------------

void main() {
    vec4 background = texture2D(uScene, vUv);

    float maxDistance = sceneDistance(vUv);

    vec4 clipPosition = vec4(
        vUv * 2.0 - 1.0,
        1.0,
        1.0
    );

    vec4 viewPosition =
        uInverseProjection * clipPosition;

    viewPosition /= max(
        abs(viewPosition.w),
        0.00001
    );

    vec3 rayDirection = normalize(
        (
            uInverseView *
            vec4(normalize(viewPosition.xyz), 0.0)
        ).xyz
    );

    vec3 rayOrigin = uCameraPosition;

    vec3 boxMin = vec3(-900.0, 25.0, -900.0);
    vec3 boxMax = vec3(900.0, 540.0, 900.0);

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

    // Баланс между качеством и нагрузкой.
    const int STEPS = 36;

    float stepLength =
        distanceThroughVolume / float(STEPS);

    vec3 accumulatedColor = vec3(0.0);
    float transmittance = 1.0;

    for (int i = 0; i < STEPS; i++) {
        float t =
            startT +
            (float(i) + 0.5) * stepLength;

        vec3 p = rayOrigin + rayDirection * t;

        float density = convectiveField(p);

        if (density > 0.012) {
            float heightFactor = clamp(
                (p.y - 60.0) / 420.0,
                0.0,
                1.0
            );

            float lighting = cloudLighting(
                p,
                rayDirection,
                density
            );

            vec3 shadowColor =
                vec3(0.23, 0.27, 0.34);

            vec3 sunlightColor =
                vec3(1.0, 0.975, 0.93);

            vec3 cloudColor = mix(
                shadowColor,
                sunlightColor,
                lighting
            );

            // Верхняя ледяная часть облака светлее.
            float ice = smoothstep(
                0.62,
                0.96,
                heightFactor
            );

            cloudColor = mix(
                cloudColor,
                vec3(0.84, 0.89, 0.96),
                ice * 0.48
            );

            // Более тёмное основание.
            float lowerShade = 1.0 - smoothstep(
                0.0,
                0.56,
                heightFactor
            );

            cloudColor *= 1.0 - lowerShade * 0.19;

            cloudColor +=
                vec3(0.65, 0.76, 1.0) *
                uFlash * 0.9;

            float alpha = 1.0 - exp(
                -density * stepLength * 0.016
            );

            alpha = clamp(alpha, 0.0, 0.64);

            accumulatedColor +=
                transmittance * alpha * cloudColor;

            transmittance *= 1.0 - alpha;

            if (transmittance < 0.035) {
                break;
            }
        }
    }

    vec3 finalColor =
        accumulatedColor +
        transmittance * background.rgb;

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

function getCloudTop() {
  const cape = Math.max(
    0,
    Math.min(state.cape / 4000, 1)
  );

  return Math.round(185 + 265 * cape);
}

function getActiveCellEstimate() {
  // Это оценка по времени жизненного цикла,
  // а не анализ реального поля восходящих потоков.
  let count = 0;

  for (let i = 0; i < 4; i++) {
    const cycle = 112;
    const offset =
      i * 27 +
      ((Math.sin(state.seed + i * 4.7) + 1) * 0.5) * 13;

    const age = (
      (state.time * 0.72 + offset) % cycle + cycle
    ) % cycle;

    if (age >= 3 && age <= 105) {
      count++;
    }
  }

  if (state.stormType === "tower") {
    return Math.min(count, 1);
  }

  return count;
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

  let mode = typeMap[state.stormType] ?? 1;

  if (state.stormType === "random") {
    mode = Math.floor(
      Math.abs(Math.sin(state.seed * 0.017)) * 4
    );

    // random должен выбрать один из поддерживаемых
    // режимов, не изменяя значение в интерфейсе.
  }

  cloudUniforms.uStormType.value = mode;

  updateText(
    "capeValue",
    `${Math.round(state.cape)} J/kg`
  );

  updateText(
    "shearValue",
    `${Math.round(state.shear)} m/s`
  );

  updateText(
    "humidityValue",
    `${Math.round(state.humidity)}%`
  );

  updateText(
    "cloudHeight",
    `${getCloudTop()} m`
  );

  const activeCells = getActiveCellEstimate();

  updateText(
    "cellCount",
    state.stormType === "tower"
      ? "Одна башня"
      : `${activeCells} ячеек`
  );

  updateText(
    "status",
    state.paused
      ? "Пауза"
      : "Конвекция развивается"
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
    state.stormGeneration++;

    cloudUniforms.uSeed.value = state.seed;

    // Новая система начинается с ранней стадии.
    state.time = 0;
    state.lightningTimer = 3 + Math.random() * 4;
    state.lightningFlash = 0;

    clearLightning();

    // Новая гроза продолжает работу, даже если
    // предыдущая была поставлена на паузу.
    state.paused = false;

    if (pauseButton) {
      pauseButton.textContent = "Пауза";
    }

    syncControls();
  });
}

if (resetButton) {
  resetButton.addEventListener("click", () => {
    state.time = 0;
    state.paused = false;
    state.lightningFlash = 0;
    state.lightningTimer = 3;
    state.seed = Math.random() * 10000;

    cloudUniforms.uSeed.value = state.seed;

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
    1.1
  );

  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);

  const w = Math.max(
    1,
    Math.floor(width * pixelRatio)
  );

  const h = Math.max(
    1,
    Math.floor(height * pixelRatio)
  );

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
    // Рост скорости симуляции ускоряет развитие,
    // а не просто анимирует текстуру.
    state.time += delta * growthSpeed;

    state.lightningTimer -= delta;

    const capeFactor = Math.min(
      1,
      Math.max(0.1, state.cape / 3000)
    );

    const humidityFactor = Math.min(
      1,
      Math.max(0.15, state.humidity / 100)
    );

    // При высокой CAPE и влажности разряды
    // возникают чаще. Это визуальная эвристика.
    const lightningChance =
      0.028 * capeFactor * humidityFactor;

    if (
      state.lightning &&
      state.lightningTimer <= 0 &&
      Math.random() < lightningChance
    ) {
      createLightning();

      state.lightningTimer =
        1.8 + Math.random() * 6.5;
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

  cloudUniforms.uTime.value = state.time;
  cloudUniforms.uFlash.value = state.lightningFlash;

  camera.updateMatrixWorld();

  cloudUniforms.uCameraPosition.value.copy(
    camera.position
  );

  cloudUniforms.uInverseProjection.value
    .copy(camera.projectionMatrix)
    .invert();

  cloudUniforms.uInverseView.value.copy(
    camera.matrixWorld
  );

  // 1. Рельеф и буфер глубины.
  renderer.setRenderTarget(renderTarget);
  renderer.clear();
  renderer.render(scene, camera);

  // 2. Объёмное поле облаков.
  renderer.setRenderTarget(null);
  renderer.clear();
  renderer.render(postScene, postCamera);

  updateText(
    "cloudHeight",
    `${getCloudTop()} m`
  );

  updateText(
    "cellCount",
    state.stormType === "tower"
      ? "Одна башня"
      : `${getActiveCellEstimate()} ячеек`
  );
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
  "Quantum Meteo: evolving convective system initialized."
);
