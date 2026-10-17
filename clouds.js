import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
function lumpyGeometry(seed=1,detail=3){const g=new THREE.IcosahedronGeometry(1,detail),p=g.attributes.position;for(let i=0;i<p.count;i++){let x=p.getX(i),y=p.getY(i),z=p.getZ(i);const n=1+.095*Math.sin(x*8+seed)*Math.cos(y*7-seed*.8)+.065*Math.sin(z*13+seed*2)*Math.cos(x*9+y*3);p.setXYZ(i,x*n,y*n,z*n)}g.computeVertexNormals();return g}
function blob(mat,pos,scale,seed,detail=3){const m=new THREE.Mesh(lumpyGeometry(seed,detail),mat);m.position.set(...pos);m.scale.set(...scale);m.castShadow=true;m.receiveShadow=true;return m}
export function createCloudSystem(scenario='supercell',density=0.9){const root=new THREE.Group();root.name='Dense volumetric storm geometry';const white=new THREE.MeshStandardMaterial({color:'#f0f1ee',roughness:1,metalness:0}),sunlit=new THREE.MeshStandardMaterial({color:'#f8f7f1',roughness:1}),shade=new THREE.MeshStandardMaterial({color:'#aab4bf',roughness:1}),baseMat=new THREE.MeshStandardMaterial({color:'#56616e',roughness:1});let seed=2;
 // Broad, connected anvil: a thick flattened cloud mass plus irregular lobes, not a shader plane.
 root.add(blob(shade,[0,174,-390],[105,20,63],seed++,4));root.add(blob(white,[-52,181,-405],[78,14,50],seed++,4));root.add(blob(sunlit,[42,183,-420],[88,13,53],seed++,4));root.add(blob(shade,[4,169,-348],[74,18,43],seed++,4));
 // The anvil edge is thick and scalloped, avoiding tall holes / thin disconnected rings.
 for(let i=0;i<27;i++){const a=i/27*Math.PI*2,rad=58+Math.sin(i*2.3)*10;root.add(blob(i%4===0?shade:white,[Math.cos(a)*rad,171+Math.sin(i*1.7)*5,-390+Math.sin(a)*rad*.58],[18+Math.sin(i)*4,8+Math.random()*5,15],seed++,3))}
 // Main cumulonimbus towers are stacked irregular lobed meshes; a dark continuous base visually anchors the storm.
 root.add(blob(baseMat,[0,92,-365],[72,17,44],seed++,4));
 for(let t=0;t<4;t++){const tx=[-35,-7,24,45][t],tz=-365+(t%2)*-15;for(let j=0;j<6;j++){const y=105+j*12;const s=(j<2?26:32)*(1-j*.045);root.add(blob(j>3?sunlit:(j%2?white:shade),[tx+Math.sin(j*1.4+t)*7,y,tz+Math.cos(j+t)*5],[s,s*(.78+j*.035),s*.78],seed++,3))}}
 // Massive cauliflower towers under the anvil, with dense interlocking shoulders.
 for(let i=0;i<34;i++){const x=(Math.random()-.5)*105,z=-370+(Math.random()-.5)*52,y=113+Math.random()*47,s=(14+Math.random()*16)*(.8+density*.2);root.add(blob(Math.random()>.35?white:shade,[x,y,z],[s,s*(.85+Math.random()*.4),s*.82],seed++,3))}
 // Nearby cumulus/feeder cells establish distance and environment around the principal storm.
 const cellCount=scenario==='squall'?8:scenario==='cumulus'?10:6;for(let c=0;c<cellCount;c++){const x=(c-(cellCount-1)/2)*(scenario==='squall'?95:155)+(Math.random()-.5)*25,z=-570-Math.random()*350,y=70+Math.random()*25,sz=23+Math.random()*22;for(let j=0;j<7;j++){const yy=y+j*6;const s=sz*(1-j*.07);root.add(blob(j%3===0?shade:white,[x+(Math.random()-.5)*sz,yy,z+(Math.random()-.5)*sz],[s,s*.75,s*.72],seed++,2))}}
 // FFD/RFD rain curtains: transparent, vertically streaked geometry beneath elevated cloud base.
 const rainMat=new THREE.MeshBasicMaterial({color:'#536d83',transparent:true,opacity:.24,depthWrite:false,side:THREE.DoubleSide});for(let i=0;i<7;i++){const x=-48+i*15,z=-367-(i%3)*10;const geo=new THREE.BufferGeometry();const v=[x,89,z,x+9,89,z-5,x+6,7,z-4,x-4,7,z+3];geo.setAttribute('position',new THREE.Float32BufferAttribute(v,3));geo.setIndex([0,1,2,0,2,3]);geo.computeVertexNormals();root.add(new THREE.Mesh(geo,rainMat))}
 // Scenario-specific visual adjustment.
 if(scenario==='cumulus'){root.scale.set(.8,.7,.8);root.position.z=25}if(scenario==='squall'){root.scale.x=1.65;root.position.x=-15}if(scenario==='multicell'){root.scale.set(1.1,.94,1.05)}
 return root;
}
