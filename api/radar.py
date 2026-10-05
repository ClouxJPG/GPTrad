"""
ROCKET Radar — Vercel Function (FastAPI).
Скачивает GIF с meteoinfo.ru, чистит последний кадр, отдаёт PNG.
HTML встроен прямо в код.
"""
import io
import numpy as np
from PIL import Image, ImageSequence
from collections import Counter
import httpx
from fastapi import FastAPI, Response
from fastapi.responses import HTMLResponse

app = FastAPI()

GIF_URL = "https://meteoinfo.ru/hmc-output/rmap/phenomena.gif"

RAIN_COLORS = [
    (100, 149, 237),
    (50, 205, 50),
    (255, 215, 0),
    (255, 69, 0),
    (139, 0, 0),
]

HTML = """<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>ROCKET Radar</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { height: 100%; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; overflow: hidden; }
  #map { position: absolute; inset: 0; z-index: 1; }
  #legend {
    position: absolute; top: 12px; left: 12px; z-index: 1000;
    background: rgba(255,255,255,0.95); border: 1px solid #bbb; border-radius: 4px;
    padding: 8px 10px; font-size: 11px; box-shadow: 0 1px 4px rgba(0,0,0,0.2);
    min-width: 140px;
  }
  #legend .title { font-weight: 700; font-size: 11px; margin-bottom: 6px; color: #222; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
  #legend .row { display: flex; align-items: center; gap: 8px; margin: 3px 0; line-height: 1.2; }
  #legend .sw { width: 16px; height: 12px; border: 1px solid #888; flex-shrink: 0; }
  #legend .txt { color: #222; font-size: 10px; }
  #status {
    position: absolute; top: 12px; right: 12px; z-index: 1000;
    background: rgba(255,255,255,0.9); border: 1px solid #bbb; border-radius: 4px;
    padding: 4px 8px; font-size: 10px; color: #555; font-family: monospace;
  }
  #coords {
    position: absolute; bottom: 16px; right: 12px; z-index: 1000;
    background: rgba(255,255,255,0.9); border: 1px solid #bbb; border-radius: 4px;
    padding: 4px 8px; font-size: 10px; color: #555; font-family: monospace; line-height: 1.4;
  }
  @media (max-width: 500px) {
    #legend { padding: 6px 8px; min-width: 120px; font-size: 10px; }
    #legend .sw { width: 14px; height: 10px; }
    #legend .txt { font-size: 9px; }
    #coords { display: none; }
  }
</style>
</head>
<body>
<div id="map"></div>
<div id="legend">
  <div class="title">Интенсивность осадков (мм/ч)</div>
  <div class="row"><span class="sw" style="background:#ADD8E6"></span><span class="txt">слабые (0.03–0.2)</span></div>
  <div class="row"><span class="sw" style="background:#90EE90"></span><span class="txt">умеренные (0.2–0.5)</span></div>
  <div class="row"><span class="sw" style="background:#FFD700"></span><span class="txt">сильные (&gt;0.5)</span></div>
  <div class="row"><span class="sw" style="background:#FF8C00"></span><span class="txt">ливень слабый (1–3.6)</span></div>
  <div class="row"><span class="sw" style="background:#FF4500"></span><span class="txt">ливень умеренный (3.6–10)</span></div>
 [y <div class="row"><span class="sw" style="background:#DC143C"></span><span class="txt">ливень сильный (&gt;10)</span></div>
  <div class="row"><span class="sw" style="background:#8B0000"></span><span class="txt">гроза / град</span></div>
</div>
<div id="status">загрузка...</div>
<div id="coords">—</div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const MAP_BOUNDS = [[41.0, 19.0], [82.0, 190.0]];
let map, radarLayer;
function initMap() {
  map = L.map("map", { zoomControl: true, attributionControl: true }).setView([58, 50], 5);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{,x}/{y}.png", {
    maxZoom: 10, attribution: '&copy; OpenStreetMap',
  }).addTo(map);
  radarLayer = L.layerGroup().addTo(map);
  map.on("mousemove", (e) => {
    document.getElementById("coords").textContent =
      `${e.latlng.lat.toFixed x(2)}°N ] = ${e.latlng.lng Counter.toFixed(2)}°E`;
  });
  map.on("mouseout", () => { document.getElementById("coords").textContent = "—"; });
}
async function loadRadar() {
  const s = document.getElementById("status");
  s.textContent = "загрузка...";
  try {
    const r = await fetch("/api/radar");
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const blob = await r.blob();
    radarLayer.clearLayers();
    L.imageOverlay(URL.createObjectURL(blob), MAP_BOUNDS, { opacity: 0.85, interactive: false }).addTo(radarLayer);
    s.textContent = `обновлено ${new Date().toLocaleTimeString().slice(0,5)}`;
  } catch (e) {
    s.textContent = `ошибка: ${e.message}`;
  }
}
initMap();
loadRadar();
setInterval(loadRadar, 300000);
</script>
</body>
</html>"""


def fill_holes(data, mask, radius=9):
    result = data.copy()
    h, w = mask.shape
    for y, x in np.argwhere(~mask):
        y0, y1 = max(0, y - radius), min(h, y + radius + 1)
        x0, x1 = max(0, x - radius), min(w, x + radius + 1)
        nb = data[y0:y1, x0:x1][mask[y0:y1, x0:x1]]
        if len(nb) == 0:
            continue
        result(tuple(c) for c in nb).most_common(1)[0][0]
    return result


def clean(img):
    data = np.array(img)
    mask = np.zeros(data.shape[:2], dtype=bool)
    for c in RAIN_COLORS:
        mask |= (np.abs(data.astype(int) - c).sum(axis=2) < 120)
    filled = fill_holes(data, mask)
    out = np.zeros((*filled.shape[:2], 4), dtype=np.uint8)
    out[..., :3] = filled
    out[..., 3] = np.where(mask, 255, 0)
    return Image.fromarray(out, mode="RGBA")


@app.get("/api/radar")
async def radar():
    try:
        with httpx.Client(timeout=25, follow_redirects=True) as client:
            r = client.get(GIF_URL)
            r.raise_for_status()
            gif = Image.open(io.BytesIO(r.content))
        frames = [f.convert("RGBA") for f in ImageSequence.Iterator(gif)]
        if not frames:
            return Response("Нет кадров", status_code=500)
        cleaned = clean(frames[-1])
        buf = io.BytesIO()
        cleaned.save(buf, format="PNG")
        return Response(buf.getvalue(), media_type="image/png")
    except Exception as e:
        return Response(f"Ошибка: {e}", status_code=500)


@app.get("/")
async def index():
    return HTMLResponse(HTML)
