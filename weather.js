import * as THREE from 'https://esm.sh/three@0.180.0';

export class WeatherEffects {
  constructor(scene, model){
    this.scene=scene; this.model=model; this.enabled=true; this.flashUntil=0; this.nextStrike=5;
    this.max=1700; this.positions=new Float32Array(this.max*3); this.colors=new Float32Array(this.max*3);
    this.geo=new THREE.BufferGeometry(); this.geo.setAttribute('position',new THREE.BufferAttribute(this.positions,3)); this.geo.setAttribute('color',new THREE.BufferAttribute(this.colors,3));
    this.mat=new THREE.PointsMaterial({size:28,vertexColors:true,transparent:true,opacity:.44,depthWrite:false,sizeAttenuation:true});
    this.rain=new THREE.Points(this.geo,this.mat);this.rain.frustumCulled=false;scene.add(this.rain);
    this.lightning=new THREE.Group();scene.add(this.lightning);
    this.boltMat=new THREE.LineBasicMaterial({color:0xeaf4ff,transparent:true,opacity:.95});
  }
  update(dt,now){
    let n=0; const m=this.model;
    // Rain streaks are seeded by the model's precipitation field, not random rain everywhere.
    for(let z=2;z<m.nz-1;z+=2) for(let y=0;y<m.ny;y+=2) for(let x=0;x<m.nx;x+=2){
      const i=m.id(x,y,z), qr=m.qr[i]; if(qr<.00045||n>=this.max)continue;
      const p=n*3; const wx=x/(m.nx-1)*m.width, wy=z/(m.nz-1)*m.height, wz=(y/(m.ny-1)-.5)*m.depth;
      this.positions[p]=wx;this.positions[p+1]=wy;this.positions[p+2]=wz;
      const k=Math.min(1,qr*1100);this.colors[p]=.38*k;this.colors[p+1]=.58*k;this.colors[p+2]=.82*k;n++;
    }
    this.geo.setDrawRange(0,n);this.geo.attributes.position.needsUpdate=true;this.geo.attributes.color.needsUpdate=true;
    if(this.enabled && now>this.nextStrike){this._tryLightning(now);this.nextStrike=now+4+Math.random()*8;}
    for(let i=this.lightning.children.length-1;i>=0;i--){const b=this.lightning.children[i];if(now>b.userData.end){this.lightning.remove(b);b.geometry.dispose();}}
  }
  _tryLightning(now){
    const m=this.model;let best=-1,score=0;
    for(let z=8;z<m.nz-2;z++)for(let y=0;y<m.ny;y++)for(let x=1;x<m.nx-1;x++){
      const i=m.id(x,y,z),s=m.w[i]*m.qc[i];if(m.w[i]>5&&s>score){score=s;best=i;}
    }
    if(best<0||score<.004)return;
    const x0=best%m.nx,yz=Math.floor(best/m.nx),z0=Math.floor(yz/m.ny),y0=yz%m.ny;
    let x=x0/(m.nx-1)*m.width,y=z0/(m.nz-1)*m.height,z=(y0/(m.ny-1)-.5)*m.depth;
    const pts=[new THREE.Vector3(x,y,z)];
    for(let k=0;k<11;k++){x+=(Math.random()-.5)*260;y-=80+Math.random()*160;z+=(Math.random()-.5)*190;pts.push(new THREE.Vector3(x,Math.max(0,y),z));}
    const g=new THREE.BufferGeometry().setFromPoints(pts),line=new THREE.Line(g,this.boltMat);line.userData.end=now+.12+Math.random()*.16;this.lightning.add(line);
  }
  setEnabled(v){this.enabled=v;if(!v){for(const b of [...this.lightning.children]){this.lightning.remove(b);b.geometry.dispose();}}}
  dispose(){this.scene.remove(this.rain,this.lightning);this.geo.dispose();this.mat.dispose();this.boltMat.dispose();for(const b of [...this.lightning.children])b.geometry.dispose();}
}
