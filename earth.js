import L from 'https://unpkg.com/leaflet@1.9.4/dist/leaflet-src.esm.js';
const map=L.map('map',{zoomControl:true,worldCopyJump:true}).setView([55.75,37.62],4);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© OpenStreetMap contributors'}).addTo(map);
let point=[55.75,37.62], marker=L.marker(point,{draggable:true}).addTo(map);
function update(p){point=p;document.querySelector('#latVal').textContent=p[0].toFixed(2)+'°';document.querySelector('#lonVal').textContent=p[1].toFixed(2)+'°';marker.setLatLng(p)}
map.on('click',e=>update([e.latlng.lat,e.latlng.lng]));marker.on('dragend',e=>update([e.target.getLatLng().lat,e.target.getLatLng().lng]));
document.querySelector('#enterGround').addEventListener('click',()=>{const scenario=document.querySelector('#scenario').value;location.href=`./ground.html?lat=${point[0].toFixed(4)}&lon=${point[1].toFixed(4)}&scenario=${encodeURIComponent(scenario)}`});
