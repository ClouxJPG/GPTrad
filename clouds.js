import * as THREE from 'three';
const vertexShader=`varying vec3 vWorld; void main(){vec4 w=modelMatrix*vec4(position,1.0);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`;
const fragmentShader=`
precision highp float; varying vec3 vWorld; uniform vec3 uCamera; uniform float uTime; uniform float uHumidity; uniform float uCAPE; uniform float uShear; uniform float uMode; uniform float uFlash; uniform float uStormZ;
float hash31(vec3 p){p=fract(p*.1031);p+=dot(p,p.yxz+33.33);return fract((p.x+p.y)*p.z);}
float noise3(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(mix(mix(hash31(i),hash31(i+vec3(1,0,0)),f.x),mix(hash31(i+vec3(0,1,0)),hash31(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash31(i+vec3(0,0,1)),hash31(i+vec3(1,0,1)),f.x),mix(hash31(i+vec3(0,1,1)),hash31(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float a=.5,v=0.;for(int i=0;i<3;i++){v+=noise3(p)*a;p*=2.03;a*=.5;}return v;}
float density(vec3 p){ // p is metres in world coordinates
 float kmY=p.y*.001;vec3 q=p*.00019;q.x+=uTime*.003; q.z-=uTime*.002;
 float n=fbm(q*2.0);float detail=noise3(q*7.5);
 float centerX= uMode==3.0 ? sin(p.z*.00011)*9000. : 0.;
 float dx=(p.x-centerX)/10000.;float dz=(p.z-uStormZ)/16000.;
 float cell=exp(-dx*dx*1.2-dz*dz*.65);
 if(uMode==2.0){cell=max(cell,exp(-pow((p.x-16000.)/10000.,2.)-pow((p.z+38000.)/17000.,2.)*.7));cell=max(cell,exp(-pow((p.x+16000.)/11000.,2.)-pow((p.z+28000.)/16000.,2.)*.7));}
 float base=2.2+(1.-uHumidity)*.018;float top=8.0+uCAPE*.0019;float vertical=smoothstep(base,base+.9,kmY)*(1.-smoothstep(top-.7,top+.8,kmY));
 float tower=exp(-pow(dx*1.25,2.)-pow(dz*.8,2.))*smoothstep(3.0,5.0,kmY)*(1.-smoothstep(10.0,top,kmY));
 float anvilH=smoothstep(top-2.6,top-.5,kmY)*(1.-smoothstep(top+.25,top+1.4,kmY));float anvil=exp(-pow((p.x-centerX)/31000.,2.)-pow((p.z-uStormZ)/25000.,2.))*anvilH;
 float edge=(cell*.86+tower*.8+anvil*.8)*vertical;
 float erosion=(n-.46)*(.8+uHumidity*.006)+(detail-.5)*.32;
 float d=smoothstep(.17,.62,edge+erosion);
 if(uMode==0.0)d*=smoothstep(.25,.48,fbm(q*1.4));
 return clamp(d,0.,1.);
}
void main(){vec3 ray=normalize(vWorld-uCamera);vec3 p=vWorld;vec3 halfBox=vec3(54000.,10500.,26000.);float stepLen=1800.;float trans=1.;vec3 accum=vec3(0.);float total=0.;
 for(int i=0;i<32;i++){if(any(greaterThan(abs(p-vec3(0.,8500.,uStormZ)),halfBox)))break;float d=density(p);if(d>.015){float light=clamp(.34+(.000018*(p.y-2500.))+.12*noise3(p*.00024+vec3(4.)),.22,.88);vec3 lit=mix(vec3(.27,.34,.39),vec3(.91,.94,.96),light);float silver=pow(max(0.,1.-abs(p.y-10500.)/7500.),3.)*.16;lit+=vec3(.19,.22,.24)*silver;lit+=uFlash*vec3(.55,.62,.72);float a=d*.115;accum+=trans*lit*a;trans*=1.-a;total+=d;}p+=ray*stepLen;if(trans<.025)break;}
 float alpha=1.-trans;if(alpha<.012)discard;gl_FragColor=vec4(accum/max(alpha,.01),alpha*.94);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;
export function createCloudVolume(scene){const geo=new THREE.BoxGeometry(108000,21000,52000,1,1,1);const mat=new THREE.ShaderMaterial({vertexShader,fragmentShader,transparent:true,depthWrite:false,side:THREE.FrontSide,uniforms:{uCamera:{value:new THREE.Vector3()},uTime:{value:0},uHumidity:{value:.78},uCAPE:{value:2400},uShear:{value:22},uMode:{value:1},uFlash:{value:0},uStormZ:{value:-62000}},blending:THREE.NormalBlending});const mesh=new THREE.Mesh(geo,mat);mesh.position.set(0,8500,-62000);mesh.frustumCulled=false;scene.add(mesh);return {mesh,material:mat};}
