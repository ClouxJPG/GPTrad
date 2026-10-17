import * as THREE from 'three';

// Ray-marched cloud volume. World units are metres; cloud base is intentionally elevated above terrain.
const vertexShader = `
varying vec3 vWorld;
void main(){ vec4 world=modelMatrix*vec4(position,1.0); vWorld=world.xyz; gl_Position=projectionMatrix*viewMatrix*world; }
`;
const fragmentShader = `
precision highp float;
varying vec3 vWorld;
uniform vec3 uCamera;
uniform float uTime, uHumidity, uCAPE, uShear, uMode, uFlash, uStormZ;
float hash31(vec3 p){ p=fract(p*.1031); p+=dot(p,p.yxz+33.33); return fract((p.x+p.y)*p.z); }
float noise3(vec3 x){
 vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
 float a=mix(hash31(i),hash31(i+vec3(1,0,0)),f.x);
 float b=mix(hash31(i+vec3(0,1,0)),hash31(i+vec3(1,1,0)),f.x);
 float c=mix(hash31(i+vec3(0,0,1)),hash31(i+vec3(1,0,1)),f.x);
 float d=mix(hash31(i+vec3(0,1,1)),hash31(i+vec3(1,1,1)),f.x);
 return mix(mix(a,b,f.y),mix(c,d,f.y),f.z);
}
float fbm(vec3 p){ float v=0.0; float a=.58; for(int i=0;i<2;i++){v+=noise3(p)*a;p*=2.02;a*=.45;} return v; }
float ellipsoid(vec2 p, vec2 radius){ return exp(-dot(p/radius,p/radius)); }
float density(vec3 p){
 float h=p.y*.001;
 vec3 q=p*.00024; q.x+=uTime*.0022; q.z-=uTime*.0015;
 float broad=fbm(q*1.6); float fine=noise3(q*8.0); float micro=noise3(q*18.0);
 float shearBend=clamp(uShear/40.0,0.0,1.0)*1.5;
 float stormX=sin((p.z-uStormZ)*.000055)*shearBend*4500.0;
 vec2 rel=vec2(p.x-stormX,p.z-uStormZ);
 float core=ellipsoid(rel,vec2(11200.0,17500.0));
 float base=2.05 + (1.0-uHumidity)*.006;
 float top=8.9 + uCAPE*.00125;
 float bodyVertical=smoothstep(base,base+.95,h)*(1.0-smoothstep(top-.55,top+.25,h));
 // Strong, connected convective towers: rounded updraft turrets without spherical primitives.
 float towerA=ellipsoid(rel-vec2(-2500.0,-1800.0),vec2(5400.0,6900.0));
 float towerB=ellipsoid(rel-vec2(3400.0,1800.0),vec2(4400.0,6200.0));
 float turretHeight=smoothstep(3.1,5.3,h)*(1.0-smoothstep(top-.4,top+.1,h));
 float turrets=max(towerA,towerB)*turretHeight;
 // Thick anvil: wide horizontal shelf with a smooth, closed upper boundary and restrained erosion.
 float anvilBand=smoothstep(top-3.1,top-.65,h)*(1.0-smoothstep(top+.15,top+.95,h));
 float anvilFoot=ellipsoid(rel,vec2(36000.0,29000.0));
 float anvilEdge=pow(clamp(1.0-abs(rel.x)/43000.0,0.0,1.0),.55);
 float anvil=anvilBand*max(anvilFoot,anvilEdge*.55);
 // Adjacent ambient cumulus cells around the main storm, giving the sky depth and context.
 float ambient=0.0;
 ambient+=ellipsoid(vec2(p.x-23500.0,p.z-(uStormZ+12000.0)),vec2(7600.0,9000.0))*smoothstep(1.6,2.25,h)*(1.0-smoothstep(4.8,5.8,h));
 ambient+=ellipsoid(vec2(p.x+27000.0,p.z-(uStormZ-16000.0)),vec2(9000.0,11000.0))*smoothstep(1.8,2.5,h)*(1.0-smoothstep(5.2,6.0,h));
 ambient+=ellipsoid(vec2(p.x-41000.0,p.z-(uStormZ+31000.0)),vec2(7000.0,8500.0))*smoothstep(1.7,2.3,h)*(1.0-smoothstep(4.4,5.3,h));
 if(uMode==3.0){core=max(core,ellipsoid(vec2(p.x,p.z-uStormZ),vec2(49000.0,8000.0)));}
 if(uMode==0.0){core*=.75;ambient*=1.5;}
 float mainShape=max(core*.92,turrets*.98);
 float raw=max(mainShape*bodyVertical,anvil*.92);
 raw=max(raw,ambient*.72);
 // Detail is strong in towers and lower cloud, deliberately reduced on the anvil to avoid holes.
 float erosionStrength=mix(.23,.055,smoothstep(top-3.0,top-.7,h));
 float erosion=(broad-.47)*.56+(fine-.5)*erosionStrength+(micro-.5)*.045;
 float cloud=smoothstep(.19,.48,raw+erosion);
 // Keep the anvil continuous and dense while preserving softer ragged outer edges.
 float solidAnvil=anvil*anvilBand*1.05;
 cloud=max(cloud,smoothstep(.19,.48,solidAnvil+erosion*.12));
 float verticalFade=smoothstep(1.8,2.35,h)*(1.0-smoothstep(top+.65,top+1.35,h));
 return clamp(cloud*verticalFade,0.0,1.0);
}
void main(){
 vec3 ray=normalize(vWorld-uCamera); vec3 p=vWorld;
 vec3 center=vec3(0.0,8500.0,uStormZ); vec3 halfBox=vec3(59000.0,11200.0,46000.0);
 float trans=1.0; vec3 accum=vec3(0.0); float t=0.0;
 for(int i=0;i<36;i++){
  if(any(greaterThan(abs(p-center),halfBox))) break;
  float d=density(p);
  if(d>.012){
   float shade=clamp(.27 + p.y*.000026 + noise3(p*.00019)*.19, .18, .91);
   vec3 dark=vec3(.20,.245,.29); vec3 bright=vec3(.88,.91,.93);
   vec3 col=mix(dark,bright,shade);
   float silver=pow(max(0.0,1.0-abs(p.y-(uCAPE*.9+7000.0))/6500.0),3.0)*.12;
   col+=vec3(.20,.225,.24)*silver;
   col+=uFlash*vec3(.68,.73,.80);
   float a=1.0-exp(-d*.095);
   accum+=trans*col*a; trans*=1.0-a; t+=d;
  }
  p+=ray*1150.0;
  if(trans<.018) break;
 }
 float alpha=1.0-trans;
 if(alpha<.012) discard;
 gl_FragColor=vec4(accum/max(alpha,.001),alpha*.985);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;

export function createCloudVolume(scene){
 const geometry=new THREE.BoxGeometry(118000,22400,92000);
 const material=new THREE.ShaderMaterial({vertexShader,fragmentShader,transparent:true,depthWrite:false,side:THREE.FrontSide,uniforms:{uCamera:{value:new THREE.Vector3()},uTime:{value:0},uHumidity:{value:.84},uCAPE:{value:2800},uShear:{value:24},uMode:{value:1},uFlash:{value:0},uStormZ:{value:-42000}},blending:THREE.NormalBlending});
 const mesh=new THREE.Mesh(geometry,material); mesh.position.set(0,8500,-42000); mesh.frustumCulled=false; mesh.renderOrder=2; scene.add(mesh);
 return {mesh,material};
}
