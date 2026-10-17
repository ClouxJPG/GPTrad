import * as THREE from 'https://esm.sh/three@0.180.0';

// Low-resolution 3D moist-convection model. Educational approximation, not CM1.
export class AtmosphereModel {
  constructor({nx=32, ny=22, nz=24, width=18000, height=10500, depth=10000}={}) {
    this.nx=nx; this.ny=ny; this.nz=nz;
    this.width=width; this.height=height; this.depth=depth;
    this.n=nx*ny*nz; this.time=0; this.elapsed=0;
    this.cape=1800; this.shear=18; this.humidity=0.78;
    this.u=new Float32Array(this.n); this.v=new Float32Array(this.n); this.w=new Float32Array(this.n);
    this.theta=new Float32Array(this.n); this.qv=new Float32Array(this.n);
    this.qc=new Float32Array(this.n); this.qr=new Float32Array(this.n);
    this.density=new Float32Array(this.n); this.rain=new Float32Array(this.n);
    this.tmp=new Float32Array(this.n); this.tmp2=new Float32Array(this.n);
    this.seed=7; this._initialize();
  }
  id(x,y,z){ return (z*this.ny+y)*this.nx+x; }
  rand(){ this.seed=(1664525*this.seed+1013904223)>>>0; return this.seed/4294967296; }
  clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
  _initialize(){
    for(let z=0;z<this.nz;z++) for(let y=0;y<this.ny;y++) for(let x=0;x<this.nx;x++){
      const i=this.id(x,y,z), h=z/(this.nz-1);
      this.u[i]=this.shear*(h*h*.72+h*.28); this.v[i]=0; this.w[i]=0;
      this.theta[i]=0; this.qv[i]=.022*this.humidity*Math.exp(-h*1.5);
      this.qc[i]=0; this.qr[i]=0;
    }
    // A broad, warm/moist initial thermal starts the first convective tower.
    this.addThermal(.32,.24,.35,.10,2.1,.0016);
    this._deriveFields();
  }
  addThermal(cx,cy,cz,radius,heat,moisture){
    for(let z=1;z<this.nz-1;z++) for(let y=1;y<this.ny-1;y++) for(let x=1;x<this.nx-1;x++){
      const dx=(x/(this.nx-1)-cx)/radius, dy=(y/(this.ny-1)-cy)/(radius*.72), dz=(z/(this.nz-1)-cz)/(radius*1.35);
      const g=Math.exp(-2*(dx*dx+dy*dy+dz*dz)); const i=this.id(x,y,z);
      this.theta[i]+=heat*g; this.qv[i]+=moisture*g; this.w[i]+=.25*g;
    }
  }
  setParameters(cape,shear,humidity){ this.cape=this.clamp(cape,0,5000); this.shear=this.clamp(shear,0,50); this.humidity=this.clamp(humidity,0.05,1); }
  _sample(a,x,y,z){
    x=this.clamp(x,0,this.nx-1.001); y=this.clamp(y,0,this.ny-1.001); z=this.clamp(z,0,this.nz-1.001);
    const x0=x|0,y0=y|0,z0=z|0,x1=x0+1,y1=y0+1,z1=z0+1;
    const fx=x-x0,fy=y-y0,fz=z-z0;
    const at=(xx,yy,zz)=>a[this.id(xx,yy,zz)];
    const a0=THREE.MathUtils.lerp(THREE.MathUtils.lerp(at(x0,y0,z0),at(x1,y0,z0),fx),THREE.MathUtils.lerp(at(x0,y1,z0),at(x1,y1,z0),fx),fy);
    const a1=THREE.MathUtils.lerp(THREE.MathUtils.lerp(at(x0,y0,z1),at(x1,y0,z1),fx),THREE.MathUtils.lerp(at(x0,y1,z1),at(x1,y1,z1),fx),fy);
    return THREE.MathUtils.lerp(a0,a1,fz);
  }
  _advect(src,dst,dt){
    for(let z=0;z<this.nz;z++) for(let y=0;y<this.ny;y++) for(let x=0;x<this.nx;x++){
      const i=this.id(x,y,z), sx=x-this.u[i]*dt/(this.width/(this.nx-1)), sy=y-this.v[i]*dt/(this.depth/(this.ny-1)), sz=z-this.w[i]*dt/(this.height/(this.nz-1));
      dst[i]=this._sample(src,sx,sy,sz);
    }
  }
  _diffuse(a,dt,rate){
    const out=this.tmp2, nx=this.nx,ny=this.ny,nz=this.nz;
    for(let z=1;z<nz-1;z++) for(let y=1;y<ny-1;y++) for(let x=1;x<nx-1;x++){
      const i=this.id(x,y,z); const lap=a[this.id(x-1,y,z)]+a[this.id(x+1,y,z)]+a[this.id(x,y-1,z)]+a[this.id(x,y+1,z)]+a[this.id(x,y,z-1)]+a[this.id(x,y,z+1)]-6*a[i];
      out[i]=a[i]+rate*dt*lap;
    }
    for(let z=1;z<nz-1;z++) for(let y=1;y<ny-1;y++) for(let x=1;x<nx-1;x++){const i=this.id(x,y,z);a[i]=out[i];}
  }
  step(dt=.32){
    this.elapsed+=dt; this.time+=dt;
    const nx=this.nx,ny=this.ny,nz=this.nz;
    // Surface heating varies smoothly in space/time: new cells may initiate without timers.
    for(let x=1;x<nx-1;x++){
      const xn=x/(nx-1), h=.0006*(this.cape/1800)*(.55+.45*Math.sin(this.elapsed*.012+xn*8));
      for(let y=1;y<ny-1;y++){const i=this.id(x,y,1);this.theta[i]+=h*dt;this.qv[i]+=.000001*this.humidity*dt;}
    }
    // Advection of all thermodynamic scalars by the evolving wind field.
    for(const key of ['theta','qv','qc','qr']){this._advect(this[key],this.tmp,dt);this[key].set(this.tmp);}
    this._diffuse(this.theta,dt,.08); this._diffuse(this.qv,dt,.04); this._diffuse(this.qc,dt,.035); this._diffuse(this.qr,dt,.025);
    const dz=this.height/(nz-1), dx=this.width/(nx-1), dy=this.depth/(ny-1);
    for(let z=1;z<nz-1;z++) for(let y=1;y<ny-1;y++) for(let x=1;x<nx-1;x++){
      const i=this.id(x,y,z), h=z/(nz-1), theta=this.theta[i];
      // Boussinesq-like buoyancy with stable environmental stratification and condensate loading.
      const buoy=9.81*(theta/300 - .0038*h) - 9.81*(this.qc[i]+this.qr[i])*.65;
      this.w[i]=this.clamp(this.w[i]+buoy*dt,-22,28);
      this.theta[i]-=this.w[i]*.0038*dt;
      this.u[i]+=(this.shear*(h*h*.72+h*.28)-this.u[i])*.012;
      // Weak overturning response to horizontal gradients and continuity-inspired damping.
      const dthdx=(this.theta[this.id(x+1,y,z)]-this.theta[this.id(x-1,y,z)])/(2*dx);
      const dthdy=(this.theta[this.id(x,y+1,z)]-this.theta[this.id(x,y-1,z)])/(2*dy);
      this.u[i]=this.clamp(this.u[i]-dthdx*dt*900,-32,48);
      this.v[i]=this.clamp(this.v[i]-dthdy*dt*900,-12,12);
      this.u[i]*=.999; this.v[i]*=.996; this.w[i]*=.997;
      // Simplified saturation curve; condensation releases latent heat.
      const tempC=27-62*h+theta, es=6.112*Math.exp(this.clamp(17.67*tempC/(tempC+243.5),-10,10));
      const pressure=1000*Math.exp(-h*1.2), qsat=.622*es/Math.max(pressure-es,1);
      if(this.qv[i]>qsat){const c=Math.min(this.qv[i]-qsat,.0025*dt);this.qv[i]-=c;this.qc[i]+=c;this.theta[i]+=(2.5e6/(1004*300))*c;}
      if(this.qc[i]>.0011){const c=Math.min(this.qc[i]-.0011,this.qc[i]*.035*dt);this.qc[i]-=c;this.qr[i]+=c;}
      if(this.qr[i]>0){const evap=Math.min(this.qr[i],Math.max(0,qsat-this.qv[i]),this.qr[i]*.025*dt);this.qr[i]-=evap;this.qv[i]+=evap;this.theta[i]-=(2.5e6/(1004*300))*evap;}
    }
    // Rain fallout: move hydrometeor mass downward through the grid.
    for(let z=1;z<nz-1;z++) for(let y=1;y<ny-1;y++) for(let x=1;x<nx-1;x++){
      const i=this.id(x,y,z), fall=Math.min(this.qr[i],this.qr[i]*.11);
      this.qr[i]-=fall; this.qr[this.id(x,y,z-1)]+=fall;
    }
    // Boundaries and stability guards.
    for(let z=0;z<nz;z++) for(let y=0;y<ny;y++) for(const x of [0,nx-1]){const i=this.id(x,y,z);this.u[i]=this.shear*z/(nz-1);this.v[i]=0;this.w[i]=0;}
    for(let y=0;y<ny;y++) for(let x=0;x<nx;x++){this.w[this.id(x,y,0)]=0;this.w[this.id(x,y,nz-1)]*=.9;}
    for(let i=0;i<this.n;i++){this.qv[i]=this.clamp(this.qv[i],0,.04);this.qc[i]=this.clamp(this.qc[i],0,.025);this.qr[i]=this.clamp(this.qr[i],0,.03);if(!Number.isFinite(this.theta[i]))this.theta[i]=0;}
    this._deriveFields();
  }
  _deriveFields(){
    for(let z=0;z<this.nz;z++) for(let y=0;y<this.ny;y++) for(let x=0;x<this.nx;x++){
      const i=this.id(x,y,z), cloud=this.qc[i], rain=this.qr[i];
      this.density[i]=Math.max(0,cloud*1700 + rain*320);
      this.rain[i]=Math.max(0,rain*950);
    }
  }
  makeTextureData(){
    // Texture axes are x=domain width, y=altitude, z=domain depth.
    const out=new Uint8Array(this.n*4);
    for(let z=0;z<this.nz;z++) for(let y=0;y<this.ny;y++) for(let x=0;x<this.nx;x++){
      const src=this.id(x,y,z), dst=((y*this.nz+z)*this.nx+x)*4;
      out[dst]=Math.round(this.clamp(this.qc[src]*300,0,1)*255);
      out[dst+1]=Math.round(this.clamp(this.qr[src]*500,0,1)*255);
      out[dst+2]=0; out[dst+3]=255;
    }
    return out;
  }
  diagnostics(){
    let top=0,updraft=0,cloudCells=0,rainCells=0,maxW=0;
    for(let z=0;z<this.nz;z++) for(let y=0;y<this.ny;y++) for(let x=0;x<this.nx;x++){
      const i=this.id(x,y,z); if(this.qc[i]>.00008){cloudCells++;top=Math.max(top,z/(this.nz-1)*this.height);} if(this.qr[i]>.0003)rainCells++; if(this.w[i]>4){updraft++;maxW=Math.max(maxW,this.w[i]);}
    }
    return {top,cloudCells,rainCells,updraft,maxW};
  }
  reset(){this.seed=(this.seed+9973)>>>0;this.time=0;this.elapsed=0;this._initialize();}
  newStorm(type='supercell'){
    this.reset();
    const count=type==='multicell'?4:type==='squall'?7:1;
    for(let c=0;c<count;c++) this.addThermal(count===1?.37:.12+c*.12,.25,.28,.065+(type==='squall'?.025:0),1.6,.0013);
    if(type==='squall') this.shear=Math.max(this.shear,15);
    this._deriveFields();
  }
}
