import * as THREE from 'three';
export function createWeather(scene){
 const count=3000,positions=new Float32Array(count*3),vel=new Float32Array(count*3);
 for(let i=0;i<count;i++){const j=i*3;positions[j]=(Math.random()-.5)*30000;positions[j+1]=Math.random()*9000+100;positions[j+2]=-42000+(Math.random()-.5)*24000;vel[j]=(Math.random()-.5)*5;vel[j+1]=-20-Math.random()*42;vel[j+2]=Math.random()*5;}
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));
 const mat=new THREE.PointsMaterial({color:0xc7dbe7,size:18,sizeAttenuation:true,transparent:true,opacity:.4,depthWrite:false});const rain=new THREE.Points(geo,mat);scene.add(rain);
 const boltMat=new THREE.LineBasicMaterial({color:0xd7eeff,transparent:true,opacity:0});const bolt=new THREE.Line(new THREE.BufferGeometry(),boltMat);bolt.frustumCulled=false;scene.add(bolt);
 let flash=0,nextBolt=4+Math.random()*8;
 function update(dt,t,rainEnabled=true,lightningEnabled=true,stormDistance=42000){
  const stormZ=-stormDistance;
  if(rainEnabled){for(let i=0;i<count;i++){const j=i*3;positions[j]+=vel[j]*dt*5;positions[j+1]+=vel[j+1]*dt;positions[j+2]+=vel[j+2]*dt*4;if(positions[j+1]<10||Math.abs(positions[j+2]-stormZ)>23000){positions[j]=(Math.random()-.5)*28000;positions[j+1]=5500+Math.random()*4300;positions[j+2]=stormZ+(Math.random()-.5)*22000;}}geo.attributes.position.needsUpdate=true;}
  rain.visible=rainEnabled;
  if(lightningEnabled&&t>nextBolt){const pts=[];let x=(Math.random()-.5)*10000,z=stormZ+(Math.random()-.5)*14000,y=11200;pts.push(new THREE.Vector3(x,y,z));for(let i=0;i<15;i++){x+=(Math.random()-.5)*900;y-=420+Math.random()*520;z+=(Math.random()-.5)*520;pts.push(new THREE.Vector3(x,y,z));}bolt.geometry.dispose();bolt.geometry=new THREE.BufferGeometry().setFromPoints(pts);flash=.95;nextBolt=t+5+Math.random()*13;}
  if(!lightningEnabled){flash=0;boltMat.opacity=0;}else{flash=Math.max(0,flash-dt*2.6);boltMat.opacity=flash;}
  return flash;
 }
 return {rain,update};
}
