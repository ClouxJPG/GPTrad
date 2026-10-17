import * as THREE from 'three';
const vertex=`varying vec3 vPos; varying vec3 vNormal; void main(){vPos=position;vNormal=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const fragment=`uniform float uTime; uniform float uDensity; uniform float uLight; uniform vec3 uTint; uniform float uSeed; varying vec3 vPos; varying vec3 vNormal;
float hash(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
void main(){vec3 p=vPos;float n=noise(p*2.4+vec3(uTime*.018,uTime*.009,uSeed));n+=.5*noise(p*5.2-vec3(uTime*.027,0.,uTime*.018));n/=1.5;float edge=1.-smoothstep(.48,1.0,length(p));float density=smoothstep(.17,.69,n*.72+edge*.48)*uDensity;float top=clamp(vNormal.y*.5+.5,0.,1.);vec3 lightDir=normalize(vec3(-.45,.78,.35));float diffuse=max(dot(normalize(vNormal),lightDir),0.);float silver=pow(max(dot(reflect(-lightDir,normalize(vNormal)),vec3(0.,0.,1.)),0.),3.);float shade=.42+diffuse*.62+silver*.22;vec3 color=mix(uTint,vec3(0.79,.84,.88),clamp(top*.6+diffuse*.25,0.,.9));color*=shade;float alpha=density*.72; if(alpha<.035)discard;gl_FragColor=vec4(color,alpha);}`;
function cloudMaterial(seed,tint='#aebdca',density=1){return new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{uTime:{value:0},uDensity:{value:density},uLight:{value:1},uTint:{value:new THREE.Color(tint)},uSeed:{value:seed}},blending:THREE.NormalBlending});}
export class CloudSystem{
 constructor(scene,model){this.scene=scene;this.model=model;this.groups=[];this.clock=0;this.build();}
 build(){const count=3;for(let c=0;c<count;c++){const group=new THREE.Group();const meshes=[];const seed=c*31+7;const tint=c===1?'#9eacbc':'#b8c6d2';
 // broad low cloud base and many overlapping lobes produce a connected cloud volume
 const add=(x,y,z,sx,sy,sz,d=1)=>{const m=new THREE.Mesh(new THREE.SphereGeometry(1,24,18),cloudMaterial(seed+x*3+y,tint,d));m.position.set(x,y,z);m.scale.set(sx,sy,sz);group.add(m);meshes.push(m);};
 add(0,0,0,12,2.6,8,.8);for(let i=0;i<9;i++){const a=i/9*Math.PI*2;add(Math.cos(a)*6,1+Math.sin(i*2)*.45,Math.sin(a)*4.5,4.5+Math.random()*2,3.1+Math.random()*1.7,4.2+Math.random()*1.8,.95);}
 // towering cumulonimbus turrets, plus anvil cap
 for(let t=0;t<3;t++){const x=(t-1)*3.1;for(let k=0;k<4;k++){add(x+(Math.random()-.5)*1.3,3.8+k*3.0,(Math.random()-.5)*1.5,3.5-k*.3,3.3,3.4-k*.25,1.04);} }
 add(0,14.8,-.5,9.8,1.5,5.5,.82);add(-3,15.1,-1,7,1.0,5.1,.7);add(5,14.5,-.4,7.4,1.1,4.6,.76);
 group.position.set((c-1)*24,8+(c===1?1:0),-12-c*13);group.rotation.y=c*.7;this.scene.add(group);this.groups.push({group,meshes,seed,baseX:group.position.x,baseZ:group.position.z,phase:c*2.4});}
 }
 update(dt,time){this.clock=time;this.groups.forEach((g,idx)=>{const cell=this.model.cells[idx];if(cell){g.group.position.x=THREE.MathUtils.lerp(g.group.position.x,g.baseX+cell.x*.28,Math.min(1,dt*.15));g.group.position.z=THREE.MathUtils.lerp(g.group.position.z,g.baseZ+cell.z*.18,Math.min(1,dt*.15));}g.group.position.y=8+Math.sin(time*.18+g.phase)*.22;g.group.rotation.y=Math.sin(time*.06+g.phase)*.04;g.meshes.forEach((m,i)=>{m.material.uniforms.uTime.value=time+i*.17; m.scale.x*=1;});});}
 setDensity(v){this.groups.forEach(g=>g.meshes.forEach(m=>m.material.uniforms.uDensity.value=v));}
}
