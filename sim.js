import * as THREE from 'https://esm.sh/three@0.180.0';
import { OrbitControls } from 'https://esm.sh/three@0.180.0/examples/jsm/controls/OrbitControls.js';
import { AtmosphereModel } from './atmosphere.js';
import { VolumetricClouds } from './clouds.js';
import { createTerrain, createSky } from './terrain.js';
import { WeatherEffects } from './weather.js';

// Quantum Meteo immersive storm laboratory. No changes to index.html required.
const $=id=>document.getElementById(id);
const canvas=$('scene');
if(!canvas) throw new Error('Quantum Meteo simulator: #scene was not found. This sim.js needs the storm-simulator index.html, not the radar-map index.html.');

const renderer=new THREE.WebGLRenderer({canvas,antialias:false,alpha:false,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.15));
renderer.setSize(canvas.clientWidth||innerWidth,canvas.clientHeight||innerHeight,false);
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.12;

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x9aaeba);
scene.fog=new THREE.FogExp2(0xa9bac2,.000018);
const camera=new THREE.PerspectiveCamera(49,(canvas.clientWidth||innerWidth)/(canvas.clientHeight||innerHeight),5,100000);
camera.position.set(15000,7300,17200);
const controls=new OrbitControls(camera,renderer.domElement);
controls.target.set(9000,4200,0);controls.enableDamping=true;controls.dampingFactor=.045;controls.minDistance=1700;controls.maxDistance=42000;controls.maxPolarAngle=Math.PI*.495;
controls.screenSpacePanning=true;

scene.add(new THREE.HemisphereLight(0xcce4ff,0x38434a,1.25));
const sunLight=new THREE.DirectionalLight(0xffe6c4,2.3);sunLight.position.set(-12000,18000,9000);scene.add(sunLight);
const sky=createSky(scene);
const model=new AtmosphereModel();
const terrain=createTerrain(scene,model.width,model.depth);
const clouds=new VolumetricClouds(scene,model);
const weather=new WeatherEffects(scene,model);

let paused=false,simSpeed=1,last=performance.now(),simClock=0,textureClock=0,metricClock=0;
const maxSubsteps=2;
function sliderValue(el,fallback,max){
 if(!el)return fallback;const v=Number(el.value);if(!Number.isFinite(v))return fallback;
 const mn=Number(el.min||0),mx=Number(el.max||max);
 return mx<=1?THREE.MathUtils.clamp(v,0,1)*max:THREE.MathUtils.clamp(v,mn,mx);
}
function readControls(){
 const cape=sliderValue($('cape'),1800,5000);
 const shear=sliderValue($('shear'),18,50);
 const hum=sliderValue($('humidity'),78,100)/100;
 model.setParameters(cape,shear,hum);
 if($('capeValue'))$('capeValue').textContent=`${Math.round(cape)} J/kg`;
 if($('shearValue'))$('shearValue').textContent=`${shear.toFixed(1)} m/s`;
 if($('humidityValue'))$('humidityValue').textContent=`${Math.round(hum*100)}%`;
}
function metrics(){
 const d=model.diagnostics();
 if($('cloudHeight'))$('cloudHeight').textContent=`${(d.top/1000).toFixed(1)} km`;
 if($('cellCount'))$('cellCount').textContent=String(Math.max(0,Math.round(d.updraft/18)));
 if($('status'))$('status').textContent=paused?'Пауза':d.top>7500?'Глубокая конвекция':d.top>2200?'Рост грозовых башен':'Инициация конвекции';
}
function updatePause(){const b=$('pause');if(b)b.textContent=paused?'Продолжить':'Пауза';}
function newStorm(){const type=$('stormType')?.value||'supercell';model.newStorm(type);clouds.update(model.time);metrics();}
$('newStorm')?.addEventListener('click',newStorm);
$('reset')?.addEventListener('click',()=>{model.reset();clouds.update(model.time);metrics();});
$('pause')?.addEventListener('click',()=>{paused=!paused;updatePause();metrics();});
$('lightning')?.addEventListener('click',()=>{weather.setEnabled(!weather.enabled);const b=$('lightning');if(b)b.textContent=weather.enabled?'Молнии: вкл.':'Молнии: выкл.';});
for(const id of ['cape','shear','humidity'])$(id)?.addEventListener('input',readControls);
$('growthSpeed')?.addEventListener('input',e=>{simSpeed=THREE.MathUtils.clamp(Number(e.target.value)||1,.2,5);});
$('loading')?.style&&( $('loading').style.display='none' );

function resize(){const w=Math.max(1,canvas.clientWidth||innerWidth),h=Math.max(1,canvas.clientHeight||innerHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
window.addEventListener('resize',resize);

function animate(now){requestAnimationFrame(animate);const elapsed=Math.min(.08,Math.max(0,(now-last)/1000));last=now;
 if(!paused){const count=Math.max(1,Math.min(maxSubsteps,Math.ceil(simSpeed)));for(let i=0;i<count;i++)model.step(.28*simSpeed/count);simClock+=elapsed*simSpeed;}
 textureClock+=elapsed;metricClock+=elapsed;
 if(textureClock>.22){clouds.update(model.time);weather.update(elapsed,now/1000);textureClock=0;}
 if(metricClock>.5){readControls();metrics();metricClock=0;}
 controls.update();renderer.render(scene,camera);
}
readControls();metrics();requestAnimationFrame(animate);

// Expose a tiny console interface for testing without changing the UI.
window.QuantumMeteoSimulation={model,renderer,scene,camera,controls,newStorm,reset:()=>model.reset(),setPaused:v=>{paused=!!v;updatePause();}};
