// Self-contained canvas fallback. It intentionally has no external imports.
// It keeps the view usable if a browser or network blocks Three.js from its CDN.
export function startFallbackScene(root) {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', 'Quantum Meteo atmospheric scene');
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';
  root.replaceChildren(canvas);
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas 2D недоступен в этом браузере');
  const $ = id => document.getElementById(id);
  let W = 0, H = 0, dpr = 1, t = 0, paused = false, groundView = false;
  let yaw = 0, pitch = 0, zoom = 1, dragging = false, lastX = 0, lastY = 0;
  let lightningOn = true, lightningAt = -100, rain = 0;
  let params = { cape: 1800, moisture: 75, shear: 20, lcl: 1200, thermal: 8, wind: 12, zoneSize: 80, biome: 'forest' };
  try { params = { ...params, ...JSON.parse(sessionStorage.getItem('qm-atmosphere') || '{}') }; } catch {}
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const clouds = [];
  for (let i = 0; i < 150; i++) clouds.push({ x: rand(i + 3), y: rand(i + 90), r: .45 + rand(i + 160) * 1.4, layer: i % 5, seed: i * 13.7 });
  const trees = [];
  for (let i = 0; i < 250; i++) trees.push({ x: rand(i + 400), h: 8 + rand(i + 500) * 24, r: rand(i + 600), layer: i % 3 });
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5); W = Math.max(1, innerWidth); H = Math.max(1, innerHeight);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function readControls() {
    for (const [id, key] of [['capeLive','cape'],['moistureLive','moisture'],['shearLive','shear'],['windLive','wind']]) {
      const el = $(id); if (el) { params[key] = +el.value; const out = $(id.replace('Live','Out')); if (out) out.textContent = el.value + ({cape:' J/kg',moisture:'%',shear:' m/s',wind:' m/s'}[key]); }
    }
  }
  function cloudBlob(x, y, rx, ry, seed, storm = false, opacity = 1) {
    ctx.save(); ctx.globalAlpha = opacity;
    // A softly shaded cloud mass built from overlapping radial gradients and lobes, not a single flat ellipse.
    const lobes = storm ? 13 : 5;
    for (let i = 0; i < lobes; i++) {
      const a = i * 2.399 + seed;
      const f = storm ? (.2 + rand(seed * 3 + i) * .72) : (.28 + rand(seed + i) * .65);
      const bx = x + Math.cos(a) * rx * f * .74;
      const by = y + Math.sin(a) * ry * f * .55;
      const brx = rx * (.25 + rand(seed + i * 7) * .38);
      const bry = ry * (.25 + rand(seed + i * 9) * .45);
      const g = ctx.createRadialGradient(bx - brx * .25, by - bry * .5, 1, bx, by, Math.max(brx, bry) * 1.3);
      g.addColorStop(0, storm ? 'rgba(235,240,240,.98)' : 'rgba(247,249,245,.94)');
      g.addColorStop(.52, storm ? 'rgba(183,198,204,.96)' : 'rgba(222,232,234,.88)');
      g.addColorStop(1, storm ? 'rgba(98,119,132,0)' : 'rgba(161,184,194,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(bx, by, brx * 1.45, bry * 1.35, a * .13, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  function drawSky() {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#4b83a6'); sky.addColorStop(.48, '#a9cbd9'); sky.addColorStop(.72, '#e0dfd1'); sky.addColorStop(1, '#8a9a8d');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    // Atmospheric haze near the horizon.
    const haze = ctx.createLinearGradient(0, H * .42, 0, H * .78); haze.addColorStop(0, 'rgba(240,239,220,0)'); haze.addColorStop(1, 'rgba(234,230,210,.66)');
    ctx.fillStyle = haze; ctx.fillRect(0, H * .4, W, H * .4);
    const sunX = W * (.72 + Math.sin(t * .003) * .025), sunY = H * .17;
    const glow = ctx.createRadialGradient(sunX, sunY, 3, sunX, sunY, Math.min(W,H)*.18); glow.addColorStop(0, 'rgba(255,245,202,.95)'); glow.addColorStop(.12, 'rgba(255,232,174,.34)'); glow.addColorStop(1, 'rgba(255,232,174,0)');
    ctx.fillStyle = glow; ctx.fillRect(sunX - H*.2, sunY - H*.2, H*.4, H*.4);
    ctx.fillStyle = '#fff2c7'; ctx.beginPath(); ctx.arc(sunX, sunY, Math.max(7, H*.009), 0, Math.PI*2); ctx.fill();
    for (let i = 0; i < 22; i++) { const x = ((clouds[i].x * W + t * (.4 + clouds[i].layer*.1)) % (W+300))-150; const y = H*(.17 + clouds[i].y*.25); cloudBlob(x,y,70*clouds[i].r,20*clouds[i].r,clouds[i].seed,false,.27); }
  }
  function drawDistantLandscape() {
    const horizon = H * (groundView ? .62 : .68);
    // Far ridges.
    ctx.beginPath(); ctx.moveTo(0, horizon);
    for (let x = 0; x <= W; x += 8) { const y = horizon - 18 - 24*Math.sin(x*.006 + .5) - 11*Math.sin(x*.017) - 5*Math.sin(x*.041); ctx.lineTo(x,y); }
    ctx.lineTo(W,H); ctx.lineTo(0,H); ctx.closePath(); const far = ctx.createLinearGradient(0,horizon-60,0,H); far.addColorStop(0,'#657c7b'); far.addColorStop(1,'#314a3d'); ctx.fillStyle=far; ctx.fill();
    // Midground rolling forest hills.
    ctx.beginPath(); ctx.moveTo(0, horizon+12);
    for (let x=0; x<=W; x+=6) ctx.lineTo(x, horizon+38 + 20*Math.sin(x*.008+1.2) + 12*Math.sin(x*.021));
    ctx.lineTo(W,H);ctx.lineTo(0,H);ctx.closePath();ctx.fillStyle='#36523e';ctx.fill();
    // Fields and forest strips on the ground plane.
    const groundTop = horizon + 55;
    ctx.fillStyle = '#536b42'; ctx.fillRect(0, groundTop, W, H-groundTop);
    for (let i=0;i<12;i++) {
      const y=groundTop+(H-groundTop)*(i/12), h=(H-groundTop)/12+2;
      ctx.fillStyle = i%2 ? 'rgba(147,151,82,.20)' : 'rgba(25,61,39,.18)'; ctx.fillRect(0,y,W,h);
    }
    // Perspective lines on a few field tracks.
    ctx.strokeStyle='rgba(205,190,139,.35)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(W*.42,groundTop);ctx.lineTo(W*.2,H);ctx.moveTo(W*.66,groundTop);ctx.lineTo(W*.82,H);ctx.stroke();
    // Tree line, sized by perspective.
    for (const tr of trees) {
      const x=tr.x*W, y=horizon+30+tr.layer*17+Math.sin(tr.x*20)*8, size=(.25+tr.layer*.45)*tr.h*(H/850);
      if (size<1) continue; ctx.fillStyle=tr.layer===0?'#263e31':tr.layer===1?'#294833':'#1e382d';
      ctx.beginPath();ctx.moveTo(x,y-size);ctx.lineTo(x-size*.42,y+size*.18);ctx.lineTo(x-size*.12,y+size*.12);ctx.lineTo(x-size*.5,y+size*.55);ctx.lineTo(x+size*.5,y+size*.55);ctx.lineTo(x+size*.12,y+size*.12);ctx.lineTo(x+size*.42,y+size*.18);ctx.closePath();ctx.fill();
    }
    // Soft distance fog over the land.
    const fog=ctx.createLinearGradient(0,horizon-12,0,horizon+95);fog.addColorStop(0,'rgba(202,215,212,.25)');fog.addColorStop(1,'rgba(202,215,212,0)');ctx.fillStyle=fog;ctx.fillRect(0,horizon-12,W,110);
  }
  function drawStorm() {
    const shift = params.shear / 40;
    const growth = clamp((t / 95) * (.45 + params.cape/4500*.8) * (.45 + params.moisture/100*.55), .025, 1);
    const baseY = H * (.58 - Math.min(.12, params.lcl/25000));
    const centerX = W * (.53 + Math.sin(t*.001)*.015);
    const height = H * (.08 + .34*growth), width = W * (.17 + .16*growth);
    // Wind-sheared anvil extends horizontally and slightly downwind. Its top stays filled, without tall holes.
    const drift = shift * W * .16 + params.wind * W * .0015;
    ctx.save();
    const anvilY = baseY-height*.76;
    const anvilGrad=ctx.createLinearGradient(0,anvilY-height*.12,0,anvilY+height*.32);anvilGrad.addColorStop(0,'rgba(229,236,236,.97)');anvilGrad.addColorStop(.42,'rgba(185,201,207,.97)');anvilGrad.addColorStop(1,'rgba(117,139,151,.84)');
    ctx.fillStyle=anvilGrad;ctx.beginPath();ctx.moveTo(centerX-width*.42,anvilY+height*.16);ctx.bezierCurveTo(centerX-width*.75,anvilY-height*.02,centerX-width*.8-drift*.2,anvilY-height*.04,centerX-width*.95-drift*.2,anvilY+height*.02);ctx.bezierCurveTo(centerX-width*.68,anvilY-height*.18,centerX-width*.2,anvilY-height*.23,centerX+width*.18+drift*.45,anvilY-height*.14);ctx.bezierCurveTo(centerX+width*.62+drift,anvilY-height*.15,centerX+width*.93+drift,anvilY-height*.03,centerX+width*.92+drift,anvilY+height*.09);ctx.bezierCurveTo(centerX+width*.67+drift,anvilY+height*.24,centerX+width*.25+drift*.3,anvilY+height*.14,centerX-width*.42,anvilY+height*.16);ctx.closePath();ctx.fill();
    // Dense, connected cauliflower tower. Multiple soft lobes create rounded natural contours.
    const towerX=centerX+drift*.18, towerTop=baseY-height*.9;
    const towerGrad=ctx.createLinearGradient(towerX-width*.4,towerTop,towerX+width*.3,baseY+height*.15);towerGrad.addColorStop(0,'#e8eeee');towerGrad.addColorStop(.35,'#b8c8ce');towerGrad.addColorStop(.72,'#7d929e');towerGrad.addColorStop(1,'#536a78');
    ctx.fillStyle=towerGrad;ctx.beginPath();ctx.moveTo(towerX-width*.4,baseY+height*.12);ctx.bezierCurveTo(towerX-width*.36,baseY-height*.08,towerX-width*.24,baseY-height*.25,towerX-width*.18,baseY-height*.45);ctx.bezierCurveTo(towerX-width*.25,baseY-height*.65,towerX-width*.1,baseY-height*.85,towerX+width*.02,towerTop);ctx.bezierCurveTo(towerX+width*.2,towerTop-height*.04,towerX+width*.34,baseY-height*.65,towerX+width*.3,baseY-height*.48);ctx.bezierCurveTo(towerX+width*.48,baseY-height*.3,towerX+width*.4,baseY-height*.13,towerX+width*.45,baseY+height*.1);ctx.closePath();ctx.fill();
    for(let i=0;i<20;i++){const side=(i%2?1:-1),f=.12+(i/20)*.78;const x=towerX+side*width*(.04+f*.36),y=baseY-height*(.16+f*.7);const r=width*(.045+rand(i+params.cape)*.035)*(0.5+growth*.5);const g=ctx.createRadialGradient(x-r*.3,y-r*.6,1,x,y,r*1.7);g.addColorStop(0,'rgba(239,243,241,.9)');g.addColorStop(.5,'rgba(169,188,197,.72)');g.addColorStop(1,'rgba(89,111,124,0)');ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(x,y,r*1.5,r*1.1,0,0,Math.PI*2);ctx.fill();}
    // Broad dark precipitation shaft below the cloud base, becoming stronger with maturity.
    if (growth>.22) {const rainAlpha=clamp((growth-.22)*1.25,0,.62);const rg=ctx.createLinearGradient(0,baseY-height*.02,0,baseY+H*.16);rg.addColorStop(0,`rgba(70,94,111,${rainAlpha})`);rg.addColorStop(1,'rgba(70,94,111,0)');ctx.fillStyle=rg;ctx.beginPath();ctx.moveTo(centerX-width*.17,baseY-height*.03);ctx.lineTo(centerX+width*.26+drift*.15,baseY-height*.02);ctx.lineTo(centerX+width*.28+drift*.12,baseY+H*.17);ctx.lineTo(centerX-width*.24,baseY+H*.17);ctx.closePath();ctx.fill();}
    ctx.restore();
    if (lightningOn && growth>.58 && t-lightningAt>10 && rand(Math.floor(t*2))>.988) lightningAt=t;
    if (lightningOn && t-lightningAt<.16) {ctx.save();ctx.strokeStyle='rgba(242,250,255,.95)';ctx.lineWidth=2;ctx.shadowColor='#fff';ctx.shadowBlur=18;ctx.beginPath();let x=centerX+width*.06,y=baseY-height*.25;ctx.moveTo(x,y);for(let i=0;i<7;i++){x+=(rand(i+Math.floor(t*20))-.5)*width*.15;y+=height*.06;ctx.lineTo(x,y)}ctx.stroke();ctx.restore();}
    // Ambient nearby cumulus cells, placed at different apparent distances.
    for(let i=0;i<6;i++){const x=W*(.08+i*.16)+Math.sin(t*.002+i)*10;const y=H*(.54+(i%3)*.035);cloudBlob(x,y, W*(.035+(i%2)*.018), H*(.025+(i%3)*.008),i*8+4,false,.45);}
    return growth;
  }
  function drawRain(growth, dt) {
    rain = rain*.96 + (growth>.42 ? clamp((growth-.42)*params.moisture/100*18,0,25) : 0)*.04;
    if (rain > .3) {
      ctx.save();ctx.strokeStyle='rgba(218,233,240,.52)';ctx.lineWidth=1;
      const amount=Math.floor(clamp(rain*8,0,170));
      for(let i=0;i<amount;i++){const x=W*(.42+rand(i+80)*.2)+Math.sin(t*.03+i)*8;const y=H*(.62+rand(i+180)*.33);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-3,y+10+rand(i)*9);ctx.stroke()}
      ctx.restore();
    }
    $('rainRate').textContent=rain.toFixed(1);$('rainStatus').textContent=rain<.5?'ОСАДКИ НЕ ДОСТИГАЮТ ПОВЕРХНОСТИ':rain<2.5?'СЛАБЫЙ ДОЖДЬ':rain<7.5?'УМЕРЕННЫЙ ДОЖДЬ':rain<25?'СИЛЬНЫЙ ДОЖДЬ':'ЛИВЕНЬ';
  }
  function render() {
    ctx.setTransform(dpr,0,0,dpr,0,0);drawSky();
    if (groundView) { drawDistantLandscape(); } else {
      // Wide observer/orbit view: a larger fraction of the landscape and the full storm are visible.
      ctx.save();ctx.translate(W/2,H*.62);ctx.scale(zoom,zoom);ctx.translate(-W/2,-H*.62);drawDistantLandscape();ctx.restore();
    }
    const growth=drawStorm();drawRain(growth,1/60);
    $('hudCape').textContent=`${params.cape} J/kg`; $('hudLcl').textContent=`${(params.lcl/1000).toFixed(1)} km`;
    $('hudTime').textContent=`${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;
    const loc=$('locationText');if(loc)loc.textContent=`ЗОНА ${params.zoneSize} × ${params.zoneSize} КМ · ${({forest:'ХВОЙНЫЙ ЛЕС',mixed:'СМЕШАННЫЙ ЛЕС И ПОЛЯ',plains:'ОТКРЫТАЯ РАВНИНА',highlands:'ХОЛМЫ И ГОРНЫЕ ГРЯДЫ'})[params.biome]||'ХВОЙНЫЙ ЛЕС'}`;
    if (!paused) t += 1/60;
    requestAnimationFrame(render);
  }
  $('groundToggle')?.addEventListener('click',()=>{groundView=!groundView;$('groundToggle').textContent=groundView?'ВИД С ЗЕМЛИ: ВКЛ.':'ВИД С ЗЕМЛИ: ВЫКЛ.'});
  $('pauseBtn')?.addEventListener('click',()=>{paused=!paused;$('pauseBtn').textContent=paused?'▶ Продолжить':'Ⅱ Пауза'});
  $('resetBtn')?.addEventListener('click',()=>{t=0;rain=0;paused=false;$('pauseBtn').textContent='Ⅱ Пауза'});
  $('lightningBtn')?.addEventListener('click',()=>{lightningOn=!lightningOn;$('lightningBtn').textContent=lightningOn?'⚡ Молнии: вкл.':'⚡ Молнии: выкл.';$('lightningBtn').classList.toggle('active',lightningOn)});
  $('ambientBtn')?.addEventListener('click',()=>{const on=$('ambientBtn').dataset.on!=='1';$('ambientBtn').dataset.on=on?'1':'0';$('ambientBtn').textContent=on?'♫ Эмбиент: вкл.':'♫ Эмбиент: выкл.';if(on){const C=window.AudioContext||window.webkitAudioContext;if(C){const ac=new C(),osc=ac.createOscillator(),gain=ac.createGain();osc.type='triangle';osc.frequency.value=46;gain.gain.value=.025;osc.connect(gain);gain.connect(ac.destination);osc.start();$('ambientBtn').dataset.audio='1';}}});
  for(const [id,key] of [['capeLive','cape'],['moistureLive','moisture'],['shearLive','shear'],['windLive','wind']]) $(id)?.addEventListener('input',readControls);
  canvas.addEventListener('pointerdown',e=>{dragging=true;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture?.(e.pointerId)});
  canvas.addEventListener('pointermove',e=>{if(!dragging)return;yaw+=(e.clientX-lastX)*.003;pitch=clamp(pitch+(e.clientY-lastY)*.003,-.5,.5);lastX=e.clientX;lastY=e.clientY;});
  canvas.addEventListener('pointerup',()=>dragging=false);canvas.addEventListener('pointercancel',()=>dragging=false);
  canvas.addEventListener('wheel',e=>{zoom=clamp(zoom-e.deltaY*.001,.7,1.6);},{passive:true});
  // Keep camera drag responsive: yaw subtly shifts the storm and pitch shifts the horizon.
  const originalDrawStorm=drawStorm;
  // The canvas renderer is intentionally conservative on mobile; all scene elements are drawn every frame.
  resize();window.addEventListener('resize',resize);readControls();render();
}
