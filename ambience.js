// Procedural ambient audio: wind, rain hiss and distant thunder. Audio starts only after a user gesture.
export function createAmbience(){
 let context=null,master=null,windGain=null,rainGain=null,thunderGain=null,enabled=false,noiseSource=null,thunderOsc=null,lfo=null;
 function makeNoise(ctx){const length=ctx.sampleRate*3;const buffer=ctx.createBuffer(1,length,ctx.sampleRate);const data=buffer.getChannelData(0);let last=0;for(let i=0;i<length;i++){const white=Math.random()*2-1;last=last*.82+white*.18;data[i]=last;}return buffer;}
 function start(){
  const AudioCtx=window.AudioContext||window.webkitAudioContext;if(!AudioCtx)throw new Error('Этот браузер не поддерживает Web Audio.');
  context=new AudioCtx();master=context.createGain();master.gain.value=.0001;master.connect(context.destination);
  const noise=makeNoise(context);noiseSource=context.createBufferSource();noiseSource.buffer=noise;noiseSource.loop=true;
  const windFilter=context.createBiquadFilter();windFilter.type='lowpass';windFilter.frequency.value=520;windFilter.Q.value=.35;
  windGain=context.createGain();windGain.gain.value=.23;noiseSource.connect(windFilter);windFilter.connect(windGain);windGain.connect(master);
  const rainFilter=context.createBiquadFilter();rainFilter.type='highpass';rainFilter.frequency.value=650;rainFilterGain(context,noise,rainFilter);
  thunderOsc=context.createOscillator();thunderOsc.type='sine';thunderOsc.frequency.value=43;
  const thunderFilter=context.createBiquadFilter();thunderFilter.type='lowpass';thunderFilter.frequency.value=105;
  thunderGain=context.createGain();thunderGain.gain.value=.012;thunderOsc.connect(thunderFilter);thunderFilter.connect(thunderGain);thunderGain.connect(master);
  lfo=context.createOscillator();const lfoGain=context.createGain();lfo.frequency.value=.09;lfoGain.gain.value=18;lfo.connect(lfoGain);lfoGain.connect(thunderOsc.frequency);
  noiseSource.start();thunderOsc.start();lfo.start();context.resume();
  master.gain.setTargetAtTime(.5,context.currentTime,.7);
 }
 function rainFilterGain(ctx,noise,filter){const src=ctx.createBufferSource();src.buffer=noise;src.loop=true;rainGain=ctx.createGain();rainGain.gain.value=.025;src.connect(filter);filter.connect(rainGain);rainGain.connect(master);src.start();}
 function toggle(){if(!enabled){if(!context)start();else{context.resume();master.gain.setTargetAtTime(.5,context.currentTime,.35);}enabled=true;}else{enabled=false;if(context)master.gain.setTargetAtTime(.0001,context.currentTime,.3);}return enabled;}
 function update(distanceKm,flash){if(!context||!enabled)return;const proximity=Math.max(0,Math.min(1,(95-distanceKm)/67));const now=context.currentTime;windGain.gain.setTargetAtTime(.12+proximity*.22,now,.8);rainGain.gain.setTargetAtTime(.008+proximity*.055,now,.8);thunderGain.gain.setTargetAtTime(.004+proximity*.035,now,.6);if(flash>.65&&Math.random()<.06){thunderOsc.frequency.setTargetAtTime(32+Math.random()*18,now,.04);thunderGain.gain.setTargetAtTime(.07*proximity+.015,now,.08);thunderGain.gain.setTargetAtTime(.006+proximity*.025,now,1.4);}}
 return {toggle,update,get enabled(){return enabled;}};
}
