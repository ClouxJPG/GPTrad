const defaults={lat:55.75,lon:37.62,cape:1800,moisture:75,shear:20,lcl:1200,thermal:8,wind:12,zoneSize:80,biome:'forest'};
const $=id=>document.getElementById(id);let point={lat:defaults.lat,lon:defaults.lon};
const bindings=[['cape','capeValue',v=>`${v}`],['moisture','moistureValue',v=>`${v}%`],['shear','shearValue',v=>`${v} m/s`],['lcl','lclValue',v=>`${(v/1000).toFixed(1)} km`],['thermal','thermalValue',v=>`+${v}°C`],['wind','windValue',v=>`${v} m/s`]];
for(const [input,out,fmt] of bindings){const el=$(input);const update=()=>$(out).textContent=fmt(el.value);el.addEventListener('input',update);update()}

const zoneSize=$('zoneSize'),zoneSizeValue=$('zoneSizeValue'),zoneFootprint=$('zoneFootprint');
function updateZone(){zoneSizeValue.textContent=`${zoneSize.value} км`;zoneFootprint.textContent=`${zoneSize.value} × ${zoneSize.value} км`}
zoneSize.addEventListener('input',updateZone);updateZone();
let map,marker;
function showPoint(lat,lon){point={lat,lon};$('coords').textContent=`${lat.toFixed(2)}° N · ${lon.toFixed(2)}° E`;if(marker)marker.setLatLng([lat,lon])}
try{if(window.L){map=L.map('map',{zoomControl:true,scrollWheelZoom:false}).setView([point.lat,point.lon],5);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:12,attribution:'© OpenStreetMap'}).addTo(map);marker=L.marker([point.lat,point.lon],{draggable:true}).addTo(map);marker.on('dragend',e=>{const p=e.target.getLatLng();showPoint(p.lat,p.lng)});map.on('click',e=>showPoint(e.latlng.lat,e.latlng.lng));setTimeout(()=>map.invalidateSize(),250)}else throw Error('Библиотека карты не загрузилась. Проверь интернет и перезагрузи страницу.')}catch(e){$('map').innerHTML=`<div style="padding:20px;color:#eaf2fa;font-size:12px;line-height:1.6">Карта недоступна. Координаты можно изменить после запуска в панели наблюдения. Причина: ${e.message}</div>`}
$('startBtn').addEventListener('click',()=>{const params={lat:point.lat,lon:point.lon,cape:+$('cape').value,moisture:+$('moisture').value,shear:+$('shear').value,lcl:+$('lcl').value,thermal:+$('thermal').value,wind:+$('wind').value,zoneSize:+$('zoneSize').value,biome:$('biome').value};sessionStorage.setItem('qm-atmosphere',JSON.stringify(params));location.href='./ground.html'});
