import * as THREE from 'three';
export function createTerrain(scene){
 const size=240, seg=180, geo=new THREE.PlaneGeometry(size,size,seg,seg);geo.rotateX(-Math.PI/2);
 const p=geo.attributes.position, colors=[];const colA=new THREE.Color('#253d31'),colB=new THREE.Color('#596b48'),colC=new THREE.Color('#827b68');
 for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i);const h=1.7*Math.sin(x*.055)*Math.cos(z*.06)+.7*Math.sin(x*.16+z*.09)+.25*Math.cos(z*.34);p.setY(i,h);const c=colA.clone().lerp(colB,THREE.MathUtils.clamp((h+1.3)/4,0,1));if(h>1.1)c.lerp(colC,THREE.MathUtils.clamp((h-1.1)/2,0,.6));const patch=(Math.sin(x*.21)*Math.cos(z*.17)+1)*.035;c.offsetHSL(patch,0,patch*.5);colors.push(c.r,c.g,c.b);}
 geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.computeVertexNormals();const mat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,metalness:0});const ground=new THREE.Mesh(geo,mat);ground.receiveShadow=true;scene.add(ground);
 // Distant rolling hills create a real horizon instead of an empty plane.
 const hillMat=new THREE.MeshStandardMaterial({color:'#263a37',roughness:1});for(let i=0;i<18;i++){const r=8+Math.random()*13;const hill=new THREE.Mesh(new THREE.SphereGeometry(1,18,10),hillMat);hill.scale.set(r*.9,2+Math.random()*4,r*.7);const a=i/18*Math.PI*2;hill.position.set(Math.cos(a)*(76+Math.random()*18),-1.5,Math.sin(a)*(76+Math.random()*18));scene.add(hill);}
 return ground;
}
