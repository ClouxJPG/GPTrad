
 // ============================================================
 // QUANTUM METEO — 3D STORM SIMULATOR
 // Volumetric clouds, continuous 3D density field, ray marching
 // index.html НЕ МЕНЯЕТСЯ
 // ============================================================

import * as THREE from "https://esm.sh/three@0.180.0";
import { OrbitControls } from
  "https://esm.sh/three@0.180.0/examples/jsm/controls/OrbitControls.js";

const $ = id => document.getElementById(id);
const canvas = $("scene");

if (!canvas) throw new Error("Не найден canvas #scene");

if ($("loadingTitle")) $("loadingTitle").textContent = "Quantum Meteo";
if ($("loadingText")) $("loadingText").textContent = "Создание объёмной грозовой системы";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);

// ============================================================
// RENDERER
// ============================================================

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance"
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
renderer.setSize(canvas.clientWidth || innerWidth, canvas.clientHeight || innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

if (!renderer.capabilities.isWebGL2) {
  throw new Error("Для объёмных облаков необходим WebGL2.");
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x91b7db);
scene.fog = new THREE.Fog(0x91b7db, 500, 2200);

const camera = new THREE.PerspectiveCamera(
  50,
  (canvas.clientWidth || innerWidth) / Math.max(1, canvas.clientHeight || innerHeight),
  0.1,
  100000000
);
camera.position.set(70, 43, 90);

// ============================================================
// CAMERA CONTROLS
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

scene.add(new THREE.HemisphereLight(0xdceeff, 0x555344, 1.8));

const sun = new THREE.DirectionalLight(0xfff1d8, 2.6);
sun.position.set(-100, 150, -80);
scene.add(sun);

const fill = new THREE.DirectionalLight(0xc4dfff, 0.8);
fill.position.set(100, 65, 70);
scene.add(fill);

// ============================================================
// TERRAIN
// ============================================================

const WORLD = 1200;
const SEGMENTS = 180;

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

  const m1 = Math.exp(-(((x + 180) / 145) ** 2 + ((z + 120) / 180) ** 2));
  const m2 = Math.exp(-(((x - 180) / 120) ** 2 + ((z - 160) / 150) ** 2));
  const m3 = Math.exp(-(((x - 20) / 90) ** 2 + ((z + 230) / 110) ** 2));

  const mountains = Math.max(m1, m2 * 0.95, m3 * 0.8);
  const rugged = Math.pow(Math.max(0, 0.55 + broad * 0.6 + medium * 0.6), 1.4);

  return Math.max(0.3, 1.2 + broad * 3.3 + medium * 1.2 +
    rugged * mountains * 15 + fine * 0.2);
}

function makeTerrainTexture() {
  const size = 768;
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
        r = 145 + n * 22; g = 143 + n * 20; b = 132 + n * 20;
      } else if (h > 7) {
        r = 111 + n * 20; g = 111 + n * 18; b = 88 + n * 14;
      } else if (n > 0.32) {
        r = 37 + n * 20; g = 78 + n * 24; b = 41 + n * 13;
      } else if (n < -0.35) {
        r = 145 + n * 15; g = 127 + n * 12; b = 87 + n * 12;
      } else {
        r = 75 + n * 20; g = 116 + n * 22; b = 64 + n * 14;
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

const terrainGeometry = new THREE.PlaneGeometry(WORLD, WORLD, SEGMENTS, SEGMENTS);
terrainGeometry.rotateX(-Math.PI / 2);

const terrainPos = terrainGeometry.attributes.position;

for (let i = 0; i < terrainPos.count; i++) {
  terrainPos.setY(i, heightAt(terrainPos.getX(i), terrainPos.getZ(i)));
}

terrainPos.needsUpdate = true;
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
// VOLUMETRIC CLOUD SHADER
// No predefined tower centers. Continuous 3D density field.
// ============================================================

const cloudUniforms = {
  uTime: { value: 0 },
  uCAPE: { value: 2500 },
  uHumidity: { value: 75 },
  uShear: { value: 25 },
  uTop: { value: 56 },
  uGrowth: { value: 0 },
  uCells: { value: 3 },
  uSeed: { value: Math.random() * 1000 },
  uSunDir: {
    value: new THREE.Vector3(-0.55, 0.75, -0.4).normalize()
  },
  uBoxMin: { value: new THREE.Vector3(-110, 0, -110) },
  uBoxMax: { value: new THREE.Vector3(110, 120, 110) }
};

const cloudVertexShader = `
varying vec3 vWorldPosition;

void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const cloudFragmentShader = `
precision highp float;

varying vec3 vWorldPosition;

uniform vec3 uBoxMin;
uniform vec3 uBoxMax;
uniform vec3 uSunDir;

uniform float uTime;
uniform float uCAPE;
uniform float uHumidity;
uniform float uShear;
uniform float uTop;
uniform float uGrowth;
uniform float uCells;
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
    float b = hash31(i + vec3(1.0,0.0,0.0));
    float c = hash31(i + vec3(0.0,1.0,0.0));
    float d = hash31(i + vec3(1.0,1.0,0.0));
    float e = hash31(i + vec3(0.0,0.0,1.0));
    float f1 = hash31(i + vec3(1.0,0.0,1.0));
    float g = hash31(i + vec3(0.0,1.0,1.0));
    float h = hash31(i + vec3(1.0,1.0,1.0));

    return mix(
        mix(mix(a,b,f.x),mix(c,d,f.x),f.y),
        mix(mix(e,f1,f.x),mix(g,h,f.x),f.y),
        f.z
    );
}

float fbm3(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;

    for (int i = 0; i < 5; i++) {
        value += noise3(p) * amplitude;
        p = p * 2.02 + vec3(13.1,7.7,9.2);
        amplitude *= 0.5;
    }

    return value;
}

vec2 intersectBox(vec3 ro, vec3 rd) {
    vec3 safeRd = sign(rd) * max(abs(rd),vec3(0.00001));
    vec3 a = (uBoxMin-ro)/safeRd;
    vec3 b = (uBoxMax-ro)/safeRd;
    vec3 lo = min(a,b);
    vec3 hi = max(a,b);

    return vec2(
        max(max(lo.x,lo.y),lo.z),
        min(min(hi.x,hi.y),hi.z)
    );
}

float cloudDensity(vec3 p) {
    float baseY = 8.0;
    float topY = max(uTop,baseY+12.0);
    float h = (p.y-baseY)/(topY-baseY);

    if (h <= 0.0 || h >= 1.4) return 0.0;

    float growth = clamp(uGrowth,0.0,1.0);
    float activeTop = mix(0.38,1.22,growth);
    if (h > activeTop) return 0.0;

    float humidity = clamp(uHumidity/100.0,0.0,1.0);
    float cape = clamp(uCAPE/4000.0,0.0,1.0);
    float shear = clamp(uShear/40.0,0.0,1.0);

    vec3 q = p;
    q.x -= h*uShear*0.8;
    q.z -= uTime*(0.6+shear*1.4);

    // Large-scale turbulent displacement.
    vec3 wp = q*vec3(0.012,0.018,0.012);
    vec3 warp = vec3(
        fbm3(wp+vec3(2.1,0.0,4.7)),
        fbm3(wp+vec3(8.2,3.4,1.1)),
        fbm3(wp+vec3(5.3,7.1,9.2))
    );
    q += (warp-0.5)*vec3(42.0,22.0,42.0);

    float broad = fbm3(q*vec3(0.015,0.022,0.015));
    float medium = fbm3(
        q*vec3(0.045,0.065,0.045)+vec3(0.0,uTime*0.025,0.0)
    );
    float fine = fbm3(
        q*0.13+vec3(uTime*0.025,0.0,-uTime*0.018)
    );

    // Soft irregular footprint, not a rectangular cloud.
    float radial = length(p.xz/vec2(105.0,100.0));
    float footprint = 1.0-smoothstep(0.48,1.12,radial);

    // The field grows upward and widens with height.
    float width = mix(0.64,1.12,smoothstep(0.08,0.78,h));
    float profile = 1.0-smoothstep(width*0.52,width*1.28,radial);

    float base = smoothstep(0.0,0.075,h);
    float top = 1.0-smoothstep(0.84,1.20,h);
    float vertical = base*top;

    float turbulence =
        (broad-0.42)*1.65 +
        (medium-0.48)*1.10 +
        (fine-0.50)*0.58;

    float threshold = 0.22-humidity*0.12-cape*0.045;
    float body = smoothstep(
        threshold-0.12,
        threshold+0.20,
        profile*0.54+turbulence
    );

    // Evolving convective lobes generated from the noise field.
    float billow = fbm3(
        vec3(q.x*0.034,q.y*0.052,q.z*0.034)
        +vec3(0.0,uTime*0.04,0.0)
    );
    body *= smoothstep(0.22,0.64,billow+profile*0.42);
    body *= vertical*footprint;

    // Broad, wind-stretched upper ice canopy.
    float anvilStart = smoothstep(0.68,0.94,h);
    float anvilEnd = 1.0-smoothstep(1.10,1.34,h);
    float anvilWidth = 1.0+shear*1.25;
    vec2 anvilP = vec2(
        (q.x-h*shear*34.0)/100.0,
        q.z/(46.0+shear*45.0)
    );

    float anvilField = fbm3(
        vec3(anvilP.x*7.0,h*12.0,anvilP.y*7.0)
        +vec3(0.0,uTime*0.018,0.0)
    );

    float anvilShape = 1.0-smoothstep(
        0.20*anvilWidth,
        1.05*anvilWidth,
        length(anvilP)
    );

    float anvil = anvilShape*anvilStart*anvilEnd*
        smoothstep(0.24,0.72,anvilField+0.45);

    float density = max(body,anvil*0.72);
    density *= 0.62+humidity*0.55;

    // Smooth cloud edges with detail retained inside the volume.
    density += (fine-0.5)*0.12*body;

    return clamp(density,0.0,1.0);
}

void main() {
    vec3 ro = cameraPosition;
    vec3 rd = normalize(vWorldPosition-ro);

    vec2 hit = intersectBox(ro,rd);
    float startT = max(hit.x,0.0);
    float endT = hit.y;

    if (endT <= startT) discard;

    // Fixed maximum iteration count; adapt step to the actual ray length.
    const int STEPS = 96;
    float stepSize = (endT-startT)/float(STEPS);
    stepSize = min(stepSize,4.0);

    float t = startT;
    float transmittance = 1.0;
    vec3 accumulated = vec3(0.0);

    for (int i=0;i<STEPS;i++) {
        if (t>=endT || transmittance<0.015) break;

        vec3 p = ro+rd*(t+stepSize*0.5);
        float density = cloudDensity(p);

        if (density>0.008) {
            float h = clamp((p.y-8.0)/max(12.0,uTop-8.0),0.0,1.0);

            float detail = fbm3(
                p*0.035+vec3(uTime*0.012,0.0,0.0)
            );

            float lightFacing = clamp(
                dot(normalize(uSunDir),normalize(-rd))*0.5+0.5,
                0.0,1.0
            );

            vec3 shadowColor = vec3(0.19,0.22,0.28);
            vec3 litColor = vec3(0.94,0.96,1.0);
            vec3 cloudColor = mix(shadowColor,litColor,smoothstep(0.05,0.9,h));

            cloudColor *= 0.72+lightFacing*0.40;
            cloudColor *= 0.84+detail*0.30;

            float alpha = 1.0-exp(-density*stepSize*0.12);
            accumulated += transmittance*alpha*cloudColor;
            transmittance *= 1.0-alpha;
        }

        t += stepSize;
    }

    float alpha = 1.0-transmittance;
    if (alpha<0.012) discard;

    gl_FragColor = vec4(accumulated,alpha);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;

const cloudMaterial = new THREE.ShaderMaterial({
  uniforms: cloudUniforms,
  vertexShader: cloudVertexShader,
  fragmentShader: cloudFragmentShader,
  side: THREE.BackSide,
  transparent: true,
  depthWrite: false,
  depthTest: true,
  blending: THREE.NormalBlending
});

const cloudVolume = new THREE.Mesh(
  new THREE.BoxGeometry(220, 120, 220),
  cloudMaterial
);
cloudVolume.position.set(0, 60, 0);
cloudVolume.frustumCulled = false;
cloudVolume.renderOrder = 3;
scene.add(cloudVolume);

// ============================================================
// STORM STATE
// ============================================================

let stormType = "supercell";
let simulationTime = 0;
let paused = false;
let growthSpeed = 1;
let lightningEnabled = true;

function configureClouds() {
  stormType = $("stormType")?.value || "supercell";

  const cape = Number($("cape")?.value ?? 2500);
  const shear = Number($("shear")?.value ?? 25);
  const humidity = Number($("humidity")?.value ?? 75);

  const counts = {
    tower: 1,
    supercell: 3,
    multicell: 6,
    squall: 8,
    random: 3+Math.floor(Math.random()*3)
  };

  cloudUniforms.uCAPE.value = cape;
  cloudUniforms.uShear.value = shear;
  cloudUniforms.uHumidity.value = humidity;
  cloudUniforms.uCells.value = counts[stormType] ?? 3;
  cloudUniforms.uSeed.value = Math.random()*1000;
  cloudUniforms.uTop.value = 30+clamp(cape,200,5000)/5000*52;
  simulationTime = 0;
  cloudUniforms.uTime.value = 0;
  cloudUniforms.uGrowth.value = 0.08;
  updateMetrics();
}

function generateStorm() {
  configureClouds();
}

// ============================================================
// LIGHTNING
// ============================================================

const lightningGroup = new THREE.Group();
scene.add(lightningGroup);

const lightningLight = new THREE.PointLight(0xdceeff,0,100,2);
scene.add(lightningLight);

let lightningUntil = 0;

function clearLightning() {
  for (const child of [...lightningGroup.children]) {
    lightningGroup.remove(child);
    child.geometry.dispose();
    child.material.dispose();
  }
}

function createLightning() {
  clearLightning();

  const points = [];
  let x = rand(-3,3);
  let z = rand(-3,3);
  points.push(new THREE.Vector3(x,30,z));

  for (let i=1;i<=16;i++) {
    x += rand(-1.1,1.1);
    z += rand(-1.1,1.1);
    points.push(new THREE.Vector3(x,30-i*1.45,z));
  }

  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({
      color:0xffffff,
      transparent:true,
      opacity:1
    })
  );

  lightningGroup.add(line);
  lightningLight.position.set(x,12,z);
  lightningLight.intensity = 100;
  lightningUntil = simulationTime+0.16;
}

function updateLightning() {
  if (!lightningEnabled) {
    lightningLight.intensity = 0;
    clearLightning();
    return;
  }

  if (simulationTime>lightningUntil) {
    lightningLight.intensity = 0;
    clearLightning();
  }

  if (Math.random()<0.0025) createLightning();
}

// ============================================================
// GROWTH SPEED BUTTON
// ============================================================

let growthButton = $("growthSpeed");

if (!growthButton) {
  growthButton = document.createElement("button");
  growthButton.id = "growthSpeed";
  growthButton.type = "button";

  Object.assign(growthButton.style,{
    position:"absolute",
    right:"14px",
    bottom:"14px",
    zIndex:"50",
    padding:"11px 14px",
    border:"1px solid rgba(255,255,255,.3)",
    borderRadius:"12px",
    background:"rgba(15,25,40,.92)",
    color:"#fff",
    font:"600 13px system-ui",
    cursor:"pointer"
  });

  const parent = canvas.parentElement || document.body;
  if (getComputedStyle(parent).position==="static") {
    parent.style.position="relative";
  }
  parent.appendChild(growthButton);
}

function updateGrowthButton() {
  growthButton.textContent=`Рост облаков: ${growthSpeed}×`;
}

growthButton.addEventListener("click",()=>{
  const speeds=[1,2,4,8];
  const index=speeds.indexOf(growthSpeed);
  growthSpeed=speeds[(index+1)%speeds.length];
  updateGrowthButton();
});
updateGrowthButton();

// ============================================================
// CLOUD UPDATE
// ============================================================

function updateClouds() {
  const cape=Number($("cape")?.value ?? 2500);
  const humidity=Number($("humidity")?.value ?? 75);
  const shear=Number($("shear")?.value ?? 25);

  cloudUniforms.uCAPE.value=cape;
  cloudUniforms.uHumidity.value=humidity;
  cloudUniforms.uShear.value=shear;
  cloudUniforms.uTop.value=30+clamp(cape,200,5000)/5000*52;
  cloudUniforms.uTime.value=simulationTime;
  cloudUniforms.uGrowth.value=Math.min(1,0.08+simulationTime/42);
}

// ============================================================
// UI METRICS
// ============================================================

function updateMetrics() {
  const cape=Number($("cape")?.value ?? 2500);
  const shear=Number($("shear")?.value ?? 25);
  const humidity=Number($("humidity")?.value ?? 75);

  if ($("capeValue")) $("capeValue").textContent=String(cape);
  if ($("shearValue")) $("shearValue").textContent=String(shear);
  if ($("humidityValue")) $("humidityValue").textContent=String(humidity);

  if ($("cloudHeight")) {
    $("cloudHeight").textContent=
      `${Math.round(30+clamp(cape,200,5000)/5000*52)} км`;
  }

  if ($("cellCount")) {
    const counts={tower:1,supercell:3,multicell:6,squall:8};
    $("cellCount").textContent=String(counts[stormType]??cloudUniforms.uCells.value);
  }

  if ($("status")) $("status").textContent=paused?"Пауза":"Симуляция";
}

["cape","shear","humidity"].forEach(id=>{
  $(id)?.addEventListener("input",updateMetrics);
});

$("newStorm")?.addEventListener("click",generateStorm);

$("pause")?.addEventListener("click",()=>{
  paused=!paused;
  if ($("pause")) $("pause").textContent=paused?"Продолжить":"Пауза";
  updateMetrics();
});

$("lightning")?.addEventListener("click",()=>{
  lightningEnabled=!lightningEnabled;

  if (!lightningEnabled) {
    lightningLight.intensity=0;
    clearLightning();
  }

  if ($("lightning")) {
    $("lightning").textContent=
      lightningEnabled?"Молнии: вкл.":"Молнии: выкл.";
  }
});

$("reset")?.addEventListener("click",()=>{
  camera.position.set(70,43,90);
  controls.target.set(0,19,0);
  controls.update();
  generateStorm();
});

// ============================================================
// RESIZE
// ============================================================

function resize() {
  const w=canvas.clientWidth||innerWidth;
  const h=canvas.clientHeight||innerHeight;
  camera.aspect=w/Math.max(1,h);
  camera.updateProjectionMatrix();
  renderer.setSize(w,h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.25));
}

window.addEventListener("resize",resize);

// ============================================================
// RENDER LOOP
// ============================================================

let lastTime=0;

function animate(now) {
  requestAnimationFrame(animate);

  if (lastTime===0) lastTime=now;
  const dt=Math.min((now-lastTime)/1000,0.05);
  lastTime=now;

  if (!paused) {
    simulationTime+=dt*growthSpeed;
    updateClouds();
    updateLightning();
  }

  sky.position.copy(camera.position);
  controls.update();
  renderer.render(scene,camera);
}

// ============================================================
// START
// ============================================================

try {
  generateStorm();
  updateMetrics();

  if ($("loading")) $("loading").style.display="none";
  requestAnimationFrame(animate);
} catch (error) {
  console.error("Quantum Meteo error:",error);

  if ($("loadingTitle")) $("loadingTitle").textContent="Ошибка";
  if ($("loadingText")) $("loadingText").textContent=error.message;

  if (typeof window.showStormError==="function") {
    window.showStormError(error);
  }
}
