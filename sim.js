// ============================================================
// QUANTUM METEO — CONVECTIVE ATMOSPHERE
//
// Объёмные Cb-облака:
// • объёмный raymarching в экранном пространстве
// • учёт глубины рельефа
// • непрерывная турбулентность Perlin-подобного типа
// • восходящие потоки и развитие конвекции
// • сдвиг ветра с высотой
// • ледяная наковальня
// • overshooting top
// • mammatus
// • волокнистые края облаков
// • молнии
//
// index.html НЕ ИЗМЕНЯЕТСЯ.
// ============================================================

import * as THREE from
  "https://esm.sh/three@0.180.0";

import { OrbitControls } from
  "https://esm.sh/three@0.180.0/examples/jsm/controls/OrbitControls.js";


// ============================================================
// DOM
// ============================================================

const canvas = document.querySelector("#scene");

if (!canvas) {
  throw new Error(
    "Quantum Meteo: canvas #scene не найден."
  );
}

const $ = (id) => document.getElementById(id);


// ============================================================
// RENDERER
// ============================================================

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: "high-performance"
});

renderer.setPixelRatio(
  Math.min(window.devicePixelRatio || 1, 1.5)
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
scene.fog = new THREE.Fog(
  0x91b6d2,
  900,
  2600
);


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
// ATMOSPHERE STATE
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

  lightningTimer: 0,
  lightningFlash: 0,

  seed: Math.random() * 1000
};


// ============================================================
// WORLD
// ============================================================

const WORLD = 1200;
const TERRAIN_SEGMENTS = 180;

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


// ============================================================
// TERRAIN TEXTURE
// ============================================================

function makeTerrainTexture() {
  const size = 512;

  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;

  const ctx = c.getContext("2d");

  ctx.fillStyle = "#687966";
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 18000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;

    const n = Math.random();

    ctx.fillStyle = n > 0.5
      ? "rgba(165,174,128,0.12)"
      : "rgba(30,53,39,0.11)";

    ctx.fillRect(
      x,
      y,
      1 + Math.random() * 3,
      1 + Math.random() * 3
    );
  }

  // Rivers and terrain markings.
  ctx.globalAlpha = 0.28;
  ctx.strokeStyle = "#9da58c";
  ctx.lineWidth = 1;

  for (let i = 0; i < 16; i++) {
    ctx.beginPath();

    let x = Math.random() * size;
    let y = Math.random() * size;

    ctx.moveTo(x, y);

    for (let j = 0; j < 14; j++) {
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


// ============================================================
// TERRAIN GEOMETRY
// ============================================================

function makeTerrain() {
  const geometry = new THREE.PlaneGeometry(
    WORLD,
    WORLD,
    TERRAIN_SEGMENTS,
    TERRAIN_SEGMENTS
  );

  geometry.rotateX(-Math.PI / 2);

  const positions =
    geometry.attributes.position;

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);

    positions.setY(
      i,
      heightAt(x, z)
    );
  }

  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    map: makeTerrainTexture(),
    color: 0xc0c8b6,
    roughness: 1,
    metalness: 0
  });

  const terrain = new THREE.Mesh(
    geometry,
    material
  );

  terrain.receiveShadow = true;
  terrain.position.y = 0;

  scene.add(terrain);
}

makeTerrain();


// ============================================================
// LIGHTING
// ============================================================

const hemisphere = new THREE.HemisphereLight(
  0xc7e1ff,
  0x475044,
  1.65
);

scene.add(hemisphere);

const sun = new THREE.DirectionalLight(
  0xfff0d7,
  2.5
);

sun.position.set(-400, 700, 300);
scene.add(sun);


// ============================================================
// DISTANT HORIZON
// ============================================================

const horizonGeometry =
  new THREE.RingGeometry(850, 2400, 128);

horizonGeometry.rotateX(-Math.PI / 2);

const horizonMaterial =
  new THREE.MeshBasicMaterial({
    color: 0x93b6ce,
    side: THREE.DoubleSide,
    fog: false
  });

const horizon = new THREE.Mesh(
  horizonGeometry,
  horizonMaterial
);

horizon.position.y = -2;
scene.add(horizon);


// ============================================================
// LIGHTNING BOLT
// ============================================================

let lightningGroup = null;

function clearLightning() {
  if (!lightningGroup) return;

  scene.remove(lightningGroup);

  lightningGroup.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
  });

  lightningGroup = null;
}

function createLightning() {
  clearLightning();

  const group = new THREE.Group();

  const points = [];

  let x = 0;
  let y = 280;
  let z = 0;

  points.push(
    new THREE.Vector3(x, y, z)
  );

  for (let i = 0; i < 16; i++) {
    y -= 10 + Math.random() * 9;

    x += (Math.random() - 0.5) * 18;
    z += (Math.random() - 0.5) * 18;

    points.push(
      new THREE.Vector3(x, y, z)
    );
  }

  const geometry =
    new THREE.BufferGeometry().setFromPoints(points);

  const material = new THREE.LineBasicMaterial({
    color: 0xe9f5ff,
    transparent: true,
    opacity: 1
  });

  group.add(
    new THREE.Line(geometry, material)
  );

  const glow = new THREE.PointLight(
    0x9ecbff,
    65,
    260
  );

  glow.position.set(x, y, z);

  group.add(glow);

  scene.add(group);

  lightningGroup = group;

  state.lightningFlash = 1;
}


// ============================================================
// CLOUD VOLUME — SCREEN SPACE
//
// Облако не рендерится как обычный куб.
//
// Сначала рендерим землю в RenderTarget вместе
// с текстурой глубины, затем интегрируем облако
// отдельным полноэкранным проходом.
//
// Так глубина облака сравнивается с глубиной земли,
// а не с поверхностью ограничивающего куба.
// ============================================================

const depthTexture = new THREE.DepthTexture(
  1,
  1,
  THREE.UnsignedIntType
);

depthTexture.format = THREE.DepthFormat;

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

renderTarget.depthTexture = depthTexture;
renderTarget.texture.colorSpace = THREE.NoColorSpace;


// ============================================================
// FULLSCREEN PASS
// ============================================================

const postScene = new THREE.Scene();

const postCamera = new THREE.OrthographicCamera(
  -1, 1, 1, -1, 0, 1
);

const quadGeometry = new THREE.PlaneGeometry(2, 2);


// ============================================================
// VOLUME SHADER
// ============================================================

const cloudUniforms = {
  uScene: {
    value: renderTarget.texture
  },

  uDepth: {
    value: renderTarget.depthTexture
  },

  uInverseProjection: {
    value: new THREE.Matrix4()
  },

  uInverseView: {
    value: new THREE.Matrix4()
  },

  uCameraPosition: {
    value: new THREE.Vector3()
  },

  uTime: {
    value: 0
  },

  uCAPE: {
    value: state.cape
  },

  uShear: {
    value: state.shear
  },

  uHumidity: {
    value: state.humidity
  },

  uStormType: {
    value: 1
  },

  uGrowth: {
    value: 1
  },

  uFlash: {
    value: 0
  },

  uResolution: {
    value: new THREE.Vector2(1, 1)
  },

  uSeed: {
    value: state.seed
  }
};


// ============================================================
// CLOUD FRAGMENT SHADER
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

uniform vec2 uResolution;

varying vec2 vUv;


// ------------------------------------------------------------
// HASH / CONTINUOUS NOISE
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

    float n000 = hash31(i + vec3(0.0, 0.0, 0.0));
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

    float y0 = mix(x00, x10, f.y);
    float y1 = mix(x01, x11, f.y);

    return mix(y0, y1, f.z);
}

float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;

    for (int i = 0; i < 5; i++) {
        value += noise3(p) * amplitude;
        p *= 2.03;
        amplitude *= 0.5;
    }

    return value;
}


// ------------------------------------------------------------
// VOLUME INTERSECTION
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
// STORM CONFIGURATION
// ------------------------------------------------------------

float stormIntensity() {
    float capeFactor = clamp(
        uCAPE / 3500.0,
        0.15,
        1.35
    );

    float moisture = clamp(
        uHumidity / 100.0,
        0.1,
        1.0
    );

    return capeFactor * moisture;
}

float cloudTop() {
    float cape = clamp(
        uCAPE / 4000.0,
        0.1,
        1.0
    );

    return mix(
        220.0,
        440.0,
        cape
    ) * uGrowth;
}


// ------------------------------------------------------------
// WIND FIELD
//
// Сдвиг облака с высотой:
// нижний уровень медленнее,
// верхний уровень переносится быстрее.
// ------------------------------------------------------------

vec2 windOffset(float height) {
    float h = clamp(
        (height - 70.0) / 380.0,
        0.0,
        1.0
    );

    float shear = uShear / 45.0;

    vec2 wind = vec2(
        1.0,
        0.24
    );

    wind *= h * h * shear * 150.0;

    wind.x += uTime * 2.4;
    wind.y += uTime * 0.65;

    return wind;
}


// ------------------------------------------------------------
// CONTINUOUS CONVECTIVE FIELD
//
// Это непрерывное поле плотности, а не набор готовых
// геометрических башен. Положение ячеек не привязано
// к отдельным заранее нарисованным мешам.
// ------------------------------------------------------------

float convectiveField(vec3 p) {
    float height = p.y;

    float top = cloudTop();

    float base = 68.0;

    if (height < base || height > top + 35.0) {
        return 0.0;
    }

    float vertical = clamp(
        (height - base) / max(top - base, 1.0),
        0.0,
        1.0
    );

    // The anvil expands horizontally near the tropopause.
    float towerWidth = mix(
        125.0,
        180.0,
        vertical
    );

    float anvilWidth = mix(
        1.0,
        2.15,
        smoothstep(0.48, 0.92, vertical)
    );

    vec2 wind = windOffset(height);

    vec2 q = p.xz - wind;

    float stormMode = uStormType;

    // Broad storm envelope.
    float r = length(q);

    float envelopeWidth =
        towerWidth * anvilWidth;

    float envelope = exp(
        -(r * r) /
        (envelopeWidth * envelopeWidth * 1.55)
    );

    // Vertical convective core.
    float coreWidth = mix(
        82.0,
        112.0,
        vertical
    );

    float core = exp(
        -(r * r) /
        (coreWidth * coreWidth)
    );

    // A storm's rising motion varies with height.
    float updraftProfile =
        smoothstep(0.0, 0.12, vertical) *
        (1.0 - smoothstep(0.89, 1.0, vertical));

    // Supercells are more horizontally sheared.
    float supercellFactor = mix(
        0.7,
        1.3,
        step(0.5, stormMode)
    );

    float rotation = uTime * 0.012;

    mat2 rot = mat2(
        cos(rotation), -sin(rotation),
        sin(rotation), cos(rotation)
    );

    q = rot * q;

    vec3 noisePosition = vec3(
        q.x * 0.021,
        height * 0.018,
        q.y * 0.021
    );

    noisePosition += vec3(
        uTime * 0.018,
        -uTime * 0.007,
        uTime * 0.011
    );

    float broadNoise = fbm(
        noisePosition * 0.62
    );

    float detailNoise = fbm(
        noisePosition * 2.3
    );

    float fineNoise = noise3(
        noisePosition * 6.2
    );

    // Break up the edge into rounded cauliflower lobes.
    float erosion =
        broadNoise * 0.48 +
        detailNoise * 0.33 +
        fineNoise * 0.19;

    float edge =
        envelope * 0.78 +
        core * 0.36;

    edge +=
        (erosion - 0.48) *
        (0.8 + vertical * 0.55);

    edge *= supercellFactor;

    // Flatten and spread the upper anvil.
    float anvilLevel = smoothstep(
        0.55,
        0.78,
        vertical
    );

    float anvil = envelope *
        anvilLevel *
        (0.35 + broadNoise * 0.65);

    // Slightly overshooting top above the anvil.
    float overshoot = core *
        exp(
            -pow(
                (vertical - 0.96) / 0.045,
                2.0
            )
        );

    // Lower cloud-base fragments.
    float lowerFragments = core *
        smoothstep(
            0.08,
            0.0,
            abs(vertical - 0.12)
        ) *
        (0.3 + detailNoise);

    // Mammatus-like pockets underneath the anvil.
    float mammatusBand = exp(
        -pow(
            (vertical - 0.62) / 0.075,
            2.0
        )
    );

    float mammatusNoise = noise3(
        vec3(
            q.x * 0.065,
            height * 0.045,
            q.y * 0.065
        )
    );

    float mammatus = mammatusBand *
        envelope *
        smoothstep(
            0.48,
            0.72,
            mammatusNoise
        );

    float density = edge;

    density += anvil * 0.3;
    density += overshoot * 0.55;
    density += lowerFragments * 0.12;
    density += mammatus * 0.28;

    // Cloud tops become ragged, not perfectly flat.
    float topTurbulence = fbm(
        vec3(
            p.x * 0.035,
            p.y * 0.06,
            p.z * 0.035
        )
    );

    float topCut = top +
        (topTurbulence - 0.5) * 32.0;

    density *= 1.0 - smoothstep(
        topCut - 12.0,
        topCut + 30.0,
        height
    );

    density *= smoothstep(
        base - 12.0,
        base + 14.0,
        height
    );

    density *= stormIntensity();

    return clamp(density, 0.0, 1.6);
}


// ------------------------------------------------------------
// LIGHTING APPROXIMATION
// ------------------------------------------------------------

float cloudLighting(
    vec3 p,
    vec3 rayDirection,
    float density
) {
    vec3 lightDirection = normalize(
        vec3(-0.55, 0.78, 0.35)
    );

    float heightFactor = clamp(
        (p.y - 60.0) / 380.0,
        0.0,
        1.0
    );

    float towardSun = max(
        dot(-rayDirection, lightDirection),
        0.0
    );

    float forwardScattering = pow(
        towardSun,
        3.0
    ) * 0.16;

    float topLight = smoothstep(
        0.35,
        0.95,
        heightFactor
    ) * 0.28;

    float underside = density * 0.2;

    return clamp(
        0.35 +
        topLight +
        forwardScattering -
        underside,
        0.12,
        1.0
    );
}


// ------------------------------------------------------------
// DEPTH RECONSTRUCTION
// ------------------------------------------------------------

float sceneDistance(vec2 uv) {
    float depth = texture2D(
        uDepth,
        uv
    ).r;

    // Cleared depth: no opaque object at this pixel.
    if (depth >= 0.999999) {
        return 2400.0;
    }

    vec4 clip = vec4(
        uv * 2.0 - 1.0,
        depth * 2.0 - 1.0,
        1.0
    );

    vec4 viewPosition =
        uInverseProjection * clip;

    viewPosition /= max(
        abs(viewPosition.w),
        0.00001
    );

    vec4 worldPosition =
        uInverseView *
        vec4(viewPosition.xyz, 1.0);

    return length(
        worldPosition.xyz -
        uCameraPosition
    );
}


// ------------------------------------------------------------
// MAIN
// ------------------------------------------------------------

void main() {
    vec4 background = texture2D(
        uScene,
        vUv
    );

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
            vec4(
                normalize(viewPosition.xyz),
                0.0
            )
        ).xyz
    );

    vec3 rayOrigin = uCameraPosition;

    // Entire atmospheric volume.
    vec3 boxMin = vec3(
        -900.0,
        25.0,
        -900.0
    );

    vec3 boxMax = vec3(
        900.0,
        530.0,
        900.0
    );

    vec2 hit = intersectBox(
        rayOrigin,
        rayDirection,
        boxMin,
        boxMax
    );

    float startT = max(hit.x, 0.0);
    float endT = min(
        hit.y,
        maxDistance
    );

    // The ray misses the volume or the ground is in front.
    if (
        endT <= startT ||
        hit.y <= 0.0
    ) {
        gl_FragColor = background;
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        return;
    }

    float distanceThroughVolume =
        endT - startT;

    // Fewer samples on mobile, more on large screens.
    const int STEPS = 72;

    float stepLength =
        distanceThroughVolume /
        float(STEPS);

    vec3 accumulatedColor = vec3(0.0);
    float transmittance = 1.0;

    for (int i = 0; i < STEPS; i++) {
        float t =
            startT +
            (float(i) + 0.5) * stepLength;

        vec3 p =
            rayOrigin +
            rayDirection * t;

        float density = convectiveField(p);

        if (density > 0.008) {
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

            vec3 shadowColor = vec3(
                0.31,
                0.36,
                0.43
            );

            vec3 sunlightColor = vec3(
                1.0,
                0.96,
                0.89
            );

            vec3 cloudColor = mix(
                shadowColor,
                sunlightColor,
                lighting
            );

            // Ice near the top of the cloud.
            float ice = smoothstep(
                0.62,
                0.96,
                heightFactor
            );

            cloudColor = mix(
                cloudColor,
                vec3(0.83, 0.88, 0.94),
                ice * 0.55
            );

            // Denser lower cloud becomes darker.
            float lowerShade = 1.0 -
                smoothstep(
                    0.0,
                    0.55,
                    heightFactor
                );

            cloudColor *= 1.0 -
                lowerShade * 0.16;

            // Lightning illuminates the interior.
            cloudColor +=
                vec3(0.65, 0.76, 1.0) *
                uFlash *
                0.9;

            float alpha =
                1.0 -
                exp(
                    -density *
                    stepLength *
                    0.022
                );

            alpha = clamp(
                alpha,
                0.0,
                0.72
            );

            accumulatedColor +=
                transmittance *
                alpha *
                cloudColor;

            transmittance *=
                1.0 - alpha;

            if (transmittance < 0.018) {
                break;
            }
        }
    }

    vec3 finalColor =
        accumulatedColor +
        transmittance *
        background.rgb;

    gl_FragColor = vec4(
        finalColor,
        1.0
    );

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;


// ============================================================
// CLOUD MATERIAL
// ============================================================

const cloudMaterial = new THREE.ShaderMaterial({
  uniforms: cloudUniforms,

  vertexShader: /* glsl */ `
    varying vec2 vUv;

    void main() {
      vUv = uv;

      gl_Position = vec4(
        position.xy,
        0.0,
        1.0
      );
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

  return Number.isFinite(value)
    ? value
    : fallback;
}

function syncControls() {
  state.cape = readSlider(
    capeInput,
    state.cape
  );

  state.shear = readSlider(
    shearInput,
    state.shear
  );

  state.humidity = readSlider(
    humidityInput,
    state.humidity
  );

  if (stormTypeInput) {
    state.stormType =
      stormTypeInput.value || "supercell";
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
    `${Math.round(cloudTop())} m`
  );

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
    state.paused
      ? "Пауза"
      : "Конвекция активна"
  );
}

[
  capeInput,
  shearInput,
  humidityInput,
  stormTypeInput
].forEach((element) => {
  if (!element) return;

  element.addEventListener(
    "input",
    syncControls
  );

  element.addEventListener(
    "change",
    syncControls
  );
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

    lightningButton.textContent =
      state.lightning
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
// OPTIONAL GROWTH SPEED CONTROL
// ============================================================

let growthSpeed = 1;

const growthButton = $("growthSpeed");

if (growthButton) {
  growthButton.addEventListener("click", () => {
    growthSpeed =
      growthSpeed >= 3
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

  renderer.setSize(
    width,
    height,
    false
  );

  const pixelRatio = Math.min(
    window.devicePixelRatio || 1,
    1.5
  );

  renderer.setPixelRatio(pixelRatio);

  const w = Math.max(
    1,
    Math.floor(width * pixelRatio)
  );

  const h = Math.max(
    1,
    Math.floor(height * pixelRatio)
  );

  renderTarget.setSize(w, h);

  cloudUniforms.uResolution.value.set(
    w,
    h
  );
}

window.addEventListener(
  "resize",
  resize
);

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

    // Smooth development after starting a new storm.
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

    state.lightningFlash *= Math.exp(
      -delta * 5.5
    );

    if (
      lightningGroup &&
      state.lightningFlash < 0.025
    ) {
      clearLightning();
    }
  }

  controls.update();

  cloudUniforms.uTime.value =
    state.time * growthSpeed;

  cloudUniforms.uGrowth.value =
    state.growth;

  cloudUniforms.uFlash.value =
    state.lightningFlash;

  cloudUniforms.uCameraPosition.value.copy(
    camera.position
  );

  cloudUniforms.uInverseProjection.value
    .copy(camera.projectionMatrix)
    .invert();

  camera.updateMatrixWorld();

  cloudUniforms.uInverseView.value
    .copy(camera.matrixWorld);

  // 1. Render opaque world and terrain depth.
  renderer.setRenderTarget(renderTarget);
  renderer.clear();

  renderer.render(
    scene,
    camera
  );

  // 2. Render volume over the scene using depth-aware raymarching.
  renderer.setRenderTarget(null);

  renderer.clear();

  renderer.render(
    postScene,
    postCamera
  );

  updateText(
    "cloudHeight",
    `${Math.round(cloudTop())} m`
  );
}

syncControls();

requestAnimationFrame(animate);


// ============================================================
// READY
// ============================================================

const loading = document.querySelector(
  "#loading"
);

if (loading) {
  loading.style.display = "none";
}

console.log(
  "Quantum Meteo: depth-aware convective renderer initialized."
);
