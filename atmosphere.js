// Reduced-order moist-convection model. Not a numerical weather prediction model.
export class AtmosphereModel {
  constructor(){this.reset();}
  reset(){this.t=0;this.humidity=78;this.cape=2400;this.shear=22;this.wind=12;this.scenario='storm';this.cells=[{x:-14,z:-7,age:0,strength:1.0,spin:.45},{x:12,z:-16,age:8,strength:.72,spin:-.3},{x:2,z:12,age:4,strength:.55,spin:.2}];}
  step(dt){this.t+=dt;for(const c of this.cells){c.age+=dt*(.25+this.cape/5000);c.x+=Math.sin(this.t*.12+c.age)*dt*.11+this.wind*dt*.012;c.z+=Math.cos(this.t*.1+c.age*.6)*dt*.08;c.strength=Math.max(.18,Math.min(1.25,c.strength+dt*(this.humidity/100-.65)*.018-dt*.0015));if(c.age>85){c.age=0;c.strength=.3+Math.random()*.45;c.x=(Math.random()-.5)*36;c.z=(Math.random()-.5)*34;}}}
  get updraft(){return Math.max(1,Math.min(55,Math.sqrt(this.cape)*.37*(this.humidity/80)));}
  get water(){return (this.humidity/100)*(0.5+this.cape/1800);}
  get lcl(){return Math.max(.45,2.2-(this.humidity-35)*.025);}
}
