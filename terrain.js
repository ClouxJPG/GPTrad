import * as THREE from 'https://esm.sh/three@0.180.0';

export function createTerrain(scene, width=18000, depth=10000){
  const group=new THREE.Group(); scene.add(group);
  const nx=150,nz=110, positions=[], colors=[], indices=[];
  function height(x,z){
    const nx=x/width,nz=z/depth;
    const ridges=Math.sin(nx*17+Math.sin(nz*11)*1.6)*Math.cos(nz*15+nx*3);
    const hills=Math.sin(nx*7+1.3)*Math.cos(nz*8-0.5);
    const mountains=Math.pow(Math.max(0,Math.sin(nx*8+nz*3)*Math.cos(nz*5-nx*4)),2.1);
    const foothills=160+90*hills+45*ridges;
    return Math.max(0,foothills+mountains*1250);
  }
  for(let z=0;z<=nz;z++) for(let x=0;x<=nx;x++){
    const px=(x/nx)*width, pz=(z/nz-.5)*depth;
    const h=height(px,pz+depth/2);
    positions.push(px,h-170,pz);
    const elev=THREE.MathUtils.clamp(h/1600,0,1);
    const c=new THREE.Color().setRGB(.12+elev*.15,.20+elev*.12,.16+elev*.08);
    if(h>850)c.lerp(new THREE.Color(0x8c9498),THREE.MathUtils.clamp((h-850)/600,0,.6));
    colors.push(c.r,c.g,c.b);
  }
  for(let z=0;z<nz;z++) for(let x=0;x<nx;x++){
    const a=z*(nx+1)+x,b=a+1,c=a+nx+1,d=c+1;
    indices.push(a,c,b,b,c,d);
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geo.setIndex(indices); geo.computeVertexNormals();
  const mat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,metalness:0,flatShading:false});
  const terrain=new THREE.Mesh(geo,mat); group.add(terrain);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(width*3,depth*3),new THREE.MeshStandardMaterial({color:0x344238,roughness:1}));
  floor.rotation.x=-Math.PI/2; floor.position.set(width/2,-180,0); group.add(floor);
  // Atmospheric distance haze as a large, low-contrast horizon ring.
  const horizonGeo=new THREE.CylinderGeometry(width*.95,width*1.08,950,96,1,true);
  const horizonMat=new THREE.MeshBasicMaterial({color:0x8195a3,transparent:true,opacity:.12,side:THREE.BackSide,depthWrite:false});
  const horizon=new THREE.Mesh(horizonGeo,horizonMat); horizon.position.set(width/2,320,0); group.add(horizon);
  return {group,terrain,dispose(){geo.dispose();mat.dispose();floor.geometry.dispose();floor.material.dispose();horizonGeo.dispose();horizonMat.dispose();}};
}

export function createSky(scene){
  const geo=new THREE.SphereGeometry(50000,32,20);
  const mat=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,vertexShader:`varying vec3 vP; void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,fragmentShader:`varying vec3 vP; void main(){float h=normalize(vP).y;vec3 horizon=vec3(.72,.78,.82);vec3 zenith=vec3(.12,.32,.55);float t=pow(clamp(h*.5+.5,0.0,1.0),.72);vec3 c=mix(horizon,zenith,t);float haze=exp(-abs(h)*7.0);c=mix(c,vec3(.78,.81,.81),haze*.34);gl_FragColor=vec4(c,1.0);}`});
  const sky=new THREE.Mesh(geo,mat);scene.add(sky);
  const sun=new THREE.Mesh(new THREE.SphereGeometry(330,20,14),new THREE.MeshBasicMaterial({color:0xffedc6}));sun.position.set(-15000,12500,-7000);scene.add(sun);
  return {sky,sun,dispose(){geo.dispose();mat.dispose();sun.geometry.dispose();sun.material.dispose();}};
}
