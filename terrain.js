import * as THREE from 'three';
// Synthetic landscape with a flattened observer clearing, rolling terrain, distant ridges and clustered forest.
function hash(x,z){const n=Math.sin(x*127.1+z*311.7)*43758.5453;return n-Math.floor(n)}
function noise(x,z){const ix=Math.floor(x),iz=Math.floor(z),fx=x-ix,fz=z-iz;const u=fx*fx*(3-2*fx),v=fz*fz*(3-2*fz);return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix,iz),hash(ix+1,iz),u),THREE.MathUtils.lerp(hash(ix,iz+1),hash(ix+1,iz+1),u),v)}
function rawHeight(x,z){const n=noise(x/8000,z/8000)*.6+noise(x/2200,z/2200)*.27+noise(x/500,z/500)*.13;let h=(n-.48)*480;const ridge=Math.max(0,noise(x/17000+3,z/12000+4)-.55);h+=ridge*1450;return h;}
function heightAt(x,z){const r=Math.hypot(x,z);const fade=THREE.MathUtils.smoothstep(r,700,5000);return rawHeight(x,z)*fade;}
export function createTerrain(scene){
 const size=150000,segments=260,geo=new THREE.PlaneGeometry(size,size,segments,segments);geo.rotateX(-Math.PI/2);const pos=geo.attributes.position,colors=[];
 for(let i=0;i<pos.count;i++){
  const x=pos.getX(i),z=pos.getZ(i),h=heightAt(x,z);pos.setY(i,h);
  const n=noise(x/8000,z/8000),micro=noise(x/260,z/260),moisture=noise(x/6000+50,z/6000+30);
  let c;
  if(h>850)c=new THREE.Color('#727a77').lerp(new THREE.Color('#c0c4bf'),THREE.MathUtils.clamp((h-850)/1400,0,1));
  else if(moisture>.64)c=new THREE.Color('#203e30').lerp(new THREE.Color('#496b42'),n*.8+micro*.2);
  else if(micro>.56)c=new THREE.Color('#555c36').lerp(new THREE.Color('#7e8150'),n);
  else c=new THREE.Color('#514f37').lerp(new THREE.Color('#8a865b'),n);
  colors.push(c.r,c.g,c.b);
 }
 geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.computeVertexNormals();
 const land=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,metalness:0}));land.receiveShadow=true;land.frustumCulled=false;scene.add(land);
 // Distant rolling ridge silhouettes; these stay low enough to preserve the sky as the main subject.
 const ridgeGeo=new THREE.BufferGeometry(),verts=[],cols=[],idx=[];const nx=180,nz=32;
 for(let z=0;z<=nz;z++)for(let x=0;x<=nx;x++){
  const xx=(x/nx-.5)*190000,zz=-78000-z/nz*65000,ridge=noise(xx/12500+10,zz/9500+30);const yy=90+ridge*1050+Math.max(0,noise(xx/4500,zz/4500)-.55)*950;
  verts.push(xx,yy,zz);const c=new THREE.Color('#52665e').lerp(new THREE.Color('#8d9990'),ridge*.42);cols.push(c.r,c.g,c.b);
  if(x<nx&&z<nz){const a=z*(nx+1)+x,b=a+1,d=a+nx+1,e=d+1;idx.push(a,d,b,b,d,e)}
 }
 ridgeGeo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));ridgeGeo.setAttribute('color',new THREE.Float32BufferAttribute(cols,3));ridgeGeo.setIndex(idx);ridgeGeo.computeVertexNormals();
 const mountain=new THREE.Mesh(ridgeGeo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide}));scene.add(mountain);
 // Tree clusters give the foreground a readable real-world scale. The observer clearing remains open.
 const treeCount=1750, dummy=new THREE.Object3D();
 const trunkGeo=new THREE.CylinderGeometry(.18,.32,1,5),leafGeo=new THREE.ConeGeometry(1,1,6);
 const trunkMat=new THREE.MeshStandardMaterial({color:0x514032,roughness:1});
 const leafMat=new THREE.MeshStandardMaterial({color:0x294b35,roughness:1});
 const trunks=new THREE.InstancedMesh(trunkGeo,trunkMat,treeCount),leaves=new THREE.InstancedMesh(leafGeo,leafMat,treeCount);let placed=0,attempt=0;
 while(placed<treeCount&&attempt<treeCount*8){attempt++;const x=(hash(attempt,17)-.5)*38000,z=(hash(attempt,73)-.5)*46000;const r=Math.hypot(x,z);if(r<650||r>26000)continue;
  const cluster=noise(x/3200+18,z/3200-9);if(cluster<.48)continue;
  const h=heightAt(x,z),scale=7+hash(attempt,99)*13,lean=(hash(attempt,101)-.5)*.14;
  dummy.position.set(x,h+scale*.38,z);dummy.rotation.set(0,hash(attempt,29)*Math.PI*2,lean);dummy.scale.set(scale*.055,scale*.78,scale*.055);dummy.updateMatrix();trunks.setMatrixAt(placed,dummy.matrix);
  dummy.position.set(x,h+scale*.95,z);dummy.rotation.set(0,hash(attempt,31)*Math.PI*2,lean*.5);dummy.scale.set(scale*.55,scale*1.12,scale*.55);dummy.updateMatrix();leaves.setMatrixAt(placed,dummy.matrix);placed++;
 }
 trunks.count=placed;leaves.count=placed;trunks.instanceMatrix.needsUpdate=true;leaves.instanceMatrix.needsUpdate=true;scene.add(trunks,leaves);
 // A subtle road gives a sense of scale without becoming a focal object.
 const roadPoints=[new THREE.Vector3(-14500,0,12500),new THREE.Vector3(-9000,0,7800),new THREE.Vector3(-5200,0,3000),new THREE.Vector3(1000,0,-2500),new THREE.Vector3(7800,0,-7600)];
 const curve=new THREE.CatmullRomCurve3(roadPoints.map(p=>new THREE.Vector3(p.x,heightAt(p.x,p.z)+.7,p.z)));
 const road=new THREE.Mesh(new THREE.TubeGeometry(curve,90,8,5,false),new THREE.MeshStandardMaterial({color:0x3f4039,roughness:1}));scene.add(road);
 return {land,mountain,observerHeight:heightAt(0,0),heightAt};
}
