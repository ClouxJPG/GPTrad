const defaults={cape:1800,moisture:75,shear:20,lcl:1200,thermal:8,wind:12,zoneSize:80,biome:"forest"};
const $=id=>document.getElementById(id);
const bindings=[["cape","capeValue",v=>`${v}`],["moisture","moistureValue",v=>`${v}%`],["shear","shearValue",v=>`${v} m/s`],["lcl","lclValue",v=>`${(v/1000).toFixed(1)} km`],["thermal","thermalValue",v=>`+${v}°C`],["wind","windValue",v=>`${v} m/s`]];
for(const [input,out,fmt] of bindings){const el=$(input);const update=()=>$(out).textContent=fmt(el.value);el.addEventListener("input",update);update()}
const zoneSize=$("zoneSize"),zoneSizeValue=$("zoneSizeValue"),zoneFootprint=$("zoneFootprint");
function updateZone(){zoneSizeValue.textContent=`${zoneSize.value} км`;zoneFootprint.textContent=`${zoneSize.value} × ${zoneSize.value} км`}
zoneSize.addEventListener("input",updateZone);updateZone();
$("startBtn").addEventListener("click",()=>{const params={cape:+$("cape").value,moisture:+$("moisture").value,shear:+$("shear").value,lcl:+$("lcl").value,thermal:+$("thermal").value,wind:+$("wind").value,zoneSize:+$("zoneSize").value,biome:$("biome").value};sessionStorage.setItem("qm-atmosphere",JSON.stringify(params));location.href="./ground.html"});
