
export function createCloudVolume(THREE, scene) {
  const uniforms = {
    uTime: { value: 0 },
    uCAPE: { value: 2200 },
    uHumidity: { value: 75 },
    uShear: { value: 20 },
    uTop: { value: 52 },
    uGrowth: { value: 0 },
    uCells: { value: 3 },
    uSeed: { value: Math.random() * 1000 },
    uBoxMin: { value: new THREE.Vector3(-110, 0, -110) },
    uBoxMax: { value: new THREE.Vector3(110, 120, 110) }
  };

  const vertexShader = `
    varying vec3 vWorld;
    void main() {
      vec4 p = modelMatrix * vec4(position, 1.0);
      vWorld = p.xyz;
      gl_Position = projectionMatrix * viewMatrix * p;
    }
  `;

  const fragmentShader = `
    precision highp float;

    varying vec3 vWorld;
    uniform vec3 cameraPosition;
    uniform vec3 uBoxMin;
    uniform vec3 uBoxMax;
    uniform float uTime;
    uniform float uCAPE;
    uniform float uHumidity;
    uniform float uShear;
    uniform float uTop;
    uniform float uGrowth;
    uniform float uCells;
    uniform float uSeed;

    float hash(vec3 p) {
      p = fract(p * 0.1031);
      p += dot(p, p.yzx + 33.33);
      return fract((p.x + p.y) * p.z);
    }

    float noise3(vec3 p) {
      vec3 i = floor(p);
      vec3 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);

      float a = hash(i);
      float b = hash(i + vec3(1,0,0));
      float c = hash(i + vec3(0,1,0));
      float d = hash(i + vec3(1,1,0));
      float e = hash(i + vec3(0,0,1));
      float f1 = hash(i + vec3(1,0,1));
      float g = hash(i + vec3(0,1,1));
      float h = hash(i + vec3(1,1,1));

      return mix(
        mix(mix(a,b,f.x), mix(c,d,f.x), f.y),
        mix(mix(e,f1,f.x), mix(g,h,f.x), f.y),
        f.z
      );
    }

    float fbm(vec3 p) {
      float value = 0.0;
      float amplitude = 0.5;

      for (int i = 0; i < 4; i++) {
        value += noise3(p) * amplitude;
        p = p * 2.02 + vec3(4.1, 7.3, 2.8);
        amplitude *= 0.48;
      }

      return value;
    }

    vec2 intersectBox(vec3 ro, vec3 rd) {
      vec3 inv = 1.0 / rd;
      vec3 a = (uBoxMin - ro) * inv;
      vec3 b = (uBoxMax - ro) * inv;
      vec3 lo = min(a,b);
      vec3 hi = max(a,b);

      return vec2(
        max(max(lo.x,lo.y),lo.z),
        min(min(hi.x,hi.y),hi.z)
      );
    }

    vec2 cellPosition(float id) {
      float a = hash(vec3(id + uSeed, 2.7, 8.1)) * 6.28318;
      float r = hash(vec3(id + 4.2, 8.4, 1.3)) * 0.40;

      return vec2(cos(a),sin(a)) * r;
    }

    float densityAt(vec3 p) {
      float base = 8.0;
      float height = (p.y - base) / max(10.0, uTop - base);

      if (height < 0.0 || height > 1.35) return 0.0;

      float activeHeight = mix(0.25,1.0,clamp(uGrowth,0.0,1.0));
      if (height > activeHeight * 1.1) return 0.0;

      float humidity = clamp(uHumidity / 100.0,0.2,1.0);
      float shear = uShear / 40.0;

      vec3 q = p;
      q.x -= height * uShear * 0.55;
      q.z -= uTime * (0.2 + shear);

      float result = 0.0;

      for (int i = 0; i < 8; i++) {
        if (float(i) >= uCells) break;

        vec2 center = cellPosition(float(i));
        float x = q.x / 70.0 - center.x;
        float z = q.z / 70.0 - center.y;

        float taper = mix(1.15,0.63,smoothstep(0.1,0.95,height));

        float turbulence = fbm(
          vec3(x * 5.0,height * 15.0,z * 5.0)
          + vec3(uTime * 0.025,0.0,uTime * 0.02)
        );

        float fine = fbm(
          vec3(x * 18.0,height * 26.0,z * 18.0)
          + vec3(0.0,uTime * 0.05,0.0)
        );

        float radius = 0.22 * taper + (turbulence - 0.5) * 0.13;
        float r = length(vec2(x,z));

        float body = 1.0 - smoothstep(
          radius - 0.07,
          radius + 0.07,
          r
        );

        body += (fine - 0.5) * 0.32;

        float vertical = smoothstep(0.0,0.06,height)
          * (1.0 - smoothstep(0.92,1.15,height));

        result = max(result,clamp(body * vertical,0.0,1.0));
      }

      // Вытянутая ветром верхняя часть облака.
      float topPart = smoothstep(0.76,0.90,height);
      float ax = q.x / (65.0 + shear * 65.0);
      float az = q.z / (35.0 + shear * 35.0);

      float anvilShape = 1.0 - smoothstep(
        0.18,0.65,length(vec2(ax,az))
      );

      float anvil = anvilShape * topPart
        * (1.0 - smoothstep(1.10,1.35,height));

      result = max(result,anvil * 0.50);

      return clamp(
        result * (0.55 + humidity * 0.65),
        0.0,1.0
      );
    }

    void main() {
      vec3 ro = cameraPosition;
      vec3 rd = normalize(vWorld - ro);

      vec2 hit = intersectBox(ro,rd);
      float t = max(hit.x,0.0);
      float endT = hit.y;

      if (endT <= t) discard;

      float stepSize = (endT - t) / 56.0;
      float transmittance = 1.0;
      vec3 color = vec3(0.0);

      for (int i = 0; i < 56; i++) {
        vec3 p = ro + rd * (t + stepSize * 0.5);
        float density = densityAt(p);

        if (density > 0.015) {
          float h = clamp((p.y - 8.0) / max(10.0,uTop - 8.0),0.0,1.0);

          float detail = fbm(
            p * 0.035 + vec3(uTime * 0.01,0.0,0.0)
          );

          vec3 cloudColor = mix(
            vec3(0.25,0.29,0.36),
            vec3(0.92,0.95,0.99),
            smoothstep(0.05,0.85,h)
          );

          cloudColor *= 0.82 + detail * 0.28;

          float alpha = 1.0 - exp(-density * stepSize * 0.10);

          color += transmittance * alpha * cloudColor;
          transmittance *= 1.0 - alpha;

          if (transmittance < 0.025) break;
        }

        t += stepSize;
        if (t >= endT) break;
      }

      float alpha = 1.0 - transmittance;
      if (alpha < 0.015) discard;

      gl_FragColor = vec4(color,alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `;

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false
  });

  const geometry = new THREE.BoxGeometry(220,120,220);
  const mesh = new THREE.Mesh(geometry,material);

  mesh.position.set(0,60,0);
  mesh.frustumCulled = false;
  scene.add(mesh);

  let elapsed = 0;

  function configure({cape,humidity,shear,type}) {
    elapsed = 0;

    uniforms.uCAPE.value = cape;
    uniforms.uHumidity.value = humidity;
    uniforms.uShear.value = shear;
    uniforms.uSeed.value = Math.random() * 1000;

    const cells = {
      tower: 1,
      supercell: 3,
      multicell: 6,
      squall: 8,
      random: 2 + Math.floor(Math.random() * 4)
    };

    uniforms.uCells.value = cells[type] || cells.random;
    uniforms.uTop.value = 30 + cape / 5000 * 52;
    uniforms.uGrowth.value = 0;
  }

  function update(dt,params) {
    elapsed += Math.min(dt,0.05) * params.growthSpeed;

    uniforms.uTime.value = elapsed;
    uniforms.uCAPE.value = params.cape;
    uniforms.uHumidity.value = params.humidity;
    uniforms.uShear.value = params.shear;
    uniforms.uTop.value = 30 + params.cape / 5000 * 52;
    uniforms.uGrowth.value = Math.min(1,elapsed / 42);
  }

  return {configure,update};
}
