import * as THREE from 'https://esm.sh/three@0.180.0';

export class VolumetricClouds {
  constructor(scene, model) {
    this.model=model;
    this.texture=new THREE.Data3DTexture(model.makeTextureData(),model.nx,model.nz,model.ny);
    this.texture.format=THREE.RGBAFormat;
    this.texture.type=THREE.UnsignedByteType;
    this.texture.minFilter=THREE.LinearFilter;
    this.texture.magFilter=THREE.LinearFilter;
    this.texture.unpackAlignment=1;
    this.texture.needsUpdate=true;
    this.material=new THREE.ShaderMaterial({
      glslVersion:THREE.GLSL3, transparent:true, depthWrite:false, side:THREE.FrontSide,
      uniforms:{uField:{value:this.texture},uTime:{value:0},uSun:{value:new THREE.Vector3(-.55,.68,.42).normalize()},uStorm:{value:1.0},uCloudScale:{value:1.0}},
      vertexShader:`
        out vec3 vLocal;
        void main(){ vLocal=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }
      `,
      fragmentShader:`
        precision highp float;
        precision highp sampler3D;
        uniform sampler3D uField;
        uniform float uTime;
        uniform vec3 uSun;
        uniform float uStorm;
        uniform float uCloudScale;
        in vec3 vLocal;
        out vec4 outColor;

        float hash3(vec3 p){ p=fract(p*.1031); p+=dot(p,p.yxz+33.33); return fract((p.x+p.y)*p.z); }
        float noise3(vec3 p){
          vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          float a=hash3(i), b=hash3(i+vec3(1,0,0)), c=hash3(i+vec3(0,1,0)), d=hash3(i+vec3(1,1,0));
          float e=hash3(i+vec3(0,0,1)), f1=hash3(i+vec3(1,0,1)), g=hash3(i+vec3(0,1,1)), h=hash3(i+vec3(1,1,1));
          return mix(mix(mix(a,b,f.x),mix(c,d,f.x),f.y),mix(mix(e,f1,f.x),mix(g,h,f.x),f.y),f.z);
        }
        float fbm(vec3 p){ float v=0.0,a=.5; for(int i=0;i<4;i++){v+=a*noise3(p);p=p*2.03+vec3(7.1,3.7,5.9);a*=.5;}return v; }
        vec2 hitBox(vec3 ro,vec3 rd){
          vec3 inv=1.0/rd; vec3 t0=(-.5-ro)*inv; vec3 t1=(.5-ro)*inv;
          vec3 lo=min(t0,t1),hi=max(t0,t1);
          return vec2(max(max(lo.x,lo.y),lo.z),min(min(hi.x,hi.y),hi.z));
        }
        void main(){
          vec3 ro=(inverse(modelMatrix)*vec4(cameraPosition,1.0)).xyz;
          vec3 rd=normalize(vLocal-ro);
          vec2 hit=hitBox(ro,rd); float start=max(hit.x,0.0), finish=hit.y;
          if(finish<=start) discard;
          float span=finish-start; float stepLen=span/68.0;
          vec3 p=ro+rd*start; float trans=1.0; vec3 sum=vec3(0.0); float alpha=0.0;
          vec3 sunDir=normalize(uSun);
          for(int i=0;i<68;i++){
            if(float(i)*stepLen>span || trans<.025) break;
            vec3 uv=p+vec3(.5);
            vec4 field=texture(uField,clamp(uv,vec3(.002),vec3(.998)));
            float base=field.r;
            float height=uv.z;
            // Eroded cloud edges and cauliflower detail are applied to solved condensate,
            // not used to invent a fixed storm silhouette.
            float n=fbm(uv*vec3(25.0,20.0,24.0)+vec3(uTime*.012,uTime*.004,-uTime*.006));
            float detail=fbm(uv*vec3(61.0,52.0,57.0)+vec3(2.4,-uTime*.018,3.1));
            float edge=base-(.18+(1.0-n)*.19);
            float d=smoothstep(.08,.42,edge+detail*.09);
            d*=smoothstep(.025,.18,base);
            // Flatter, spreading upper cloud shield; less erosion in the anvil.
            float anvil=smoothstep(.54,.79,height);
            d=mix(d,d*.86,anvil);
            if(d>.012){
              float shadow=0.0;
              for(int j=1;j<=4;j++){
                vec3 sp=uv+sunDir*float(j)*.018;
                shadow+=texture(uField,clamp(sp,vec3(.002),vec3(.998))).r;
              }
              float light=exp(-shadow*1.45);
              float powder=clamp((height-.62)*1.4,0.0,1.0);
              vec3 dark=vec3(.22,.28,.36), mid=vec3(.56,.64,.72), bright=vec3(.94,.96,1.0);
              vec3 col=mix(dark,mid,clamp(light*.92,0.0,1.0));
              col=mix(col,bright,pow(light,2.4)*(.25+.62*pow(powder,.65)));
              float rain=field.g;
              col=mix(col,vec3(.22,.28,.34),clamp(rain*1.2,0.0,.72));
              float a=d*.105;
              sum+=trans*col*a;
              trans*=1.0-a;
              alpha+=a*trans;
            }
            p+=rd*stepLen;
          }
          float a=1.0-trans;
          if(a<.015) discard;
          outColor=vec4(sum/max(a,.001),clamp(a*.95,0.0,.94));
        }
      `
    });
    this.mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),this.material);
    this.mesh.scale.set(model.width,model.height,model.depth);
    this.mesh.position.set(model.width*.5,model.height*.5,0);
    this.mesh.frustumCulled=false;
    scene.add(this.mesh);
  }
  update(time){
    this.material.uniforms.uTime.value=time;
    const raw=this.model.makeTextureData();
    this.texture.image.data.set(raw);
    this.texture.needsUpdate=true;
  }
  dispose(){this.mesh.parent?.remove(this.mesh);this.mesh.geometry.dispose();this.material.dispose();this.texture.dispose();}
}
