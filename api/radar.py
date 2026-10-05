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

# ... HTML-строка без изменений ...

def fill_holes(data, mask, radius=9):
    result = data.copy()
    h, w = mask.shape
    for y, x in np.argwhere(~mask):
        y0, y1 = max(0, y - radius), min(h, y + radius + 1)
        x0, x1 = max(0, x - radius), min(w, x + radius + 1)
        nb = data[y0:y1, x0:x1][mask[y0:y1, x0:x1]]
        if len(nb) == 0:
            continue
        result[y, x] = Counter(tuple(c) for c in nb).most_common(1)[0][0]
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
