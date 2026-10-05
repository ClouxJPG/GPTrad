"""
ROCKET Radar — гифка meteoinfo.ru с чисткой и архивом на 48 кадров.
Пикселизация: 1×1 (без увеличения пикселя).
"""
import os
import io
import time
import logging
from pathlib import Path
from collections import Counter
from contextlib import asynccontextmanager

import httpx
import numpy as np
from PIL import Image, ImageSequence
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse, Response
from apscheduler.schedulers.asyncio import AsyncIOScheduler

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("rocket")

DATA_DIR = Path("/app/data")
DATA_DIR.mkdir(parents=True, exist_ok=True)
MAX_FRAMES = 48

GIF_URL = "https://meteoinfo.ru/hmc-output/rmap/phenomena.gif"

# Цвета осадков (подбери под реальную гифку)
RAIN_COLORS = [
    (100, 149, 237),   # слабые
    (50, 205, 50),     # умеренные
    (255, 215, 0),     # сильные
    (255, 69, 0),      # ливни
    (139, 0, 0),       # экстремальные
]


def download_gif() -> list[Image.Image] | None:
    """Скачивает GIF и разбивает на кадры."""
    try:
        with httpx.Client(timeout=30, follow_redirects=True) as client:
            resp = client.get(GIF_URL)
            resp.raise_for_status()
            gif_bytes = resp.content

        gif = Image.open(io.BytesIO(gif_bytes))
        frames = []
        for frame in ImageSequence.Iterator(gif):
            rgba = frame.convert("RGBA")
            frames.append(rgba)
        log.info(f"Скачано кадров: {len(frames)}")
        return frames
    except Exception as e:
        log.error(f"Ошибка скачивания гифки: {e}")
        return None


def fill_holes(data: np.ndarray, mask: np.ndarray, radius: int = 9) -> np.ndarray:
    """
    Заливает дыры цветом большинства соседей-осадков.
    Работает на уровне исходных пикселей (1×1).
    """
    result = data.copy()
    h, w = mask.shape
    holes = np.argwhere(~mask)

    for y, x in holes:
        y0, y1 = max(0, y - radius), min(h, y + radius + 1)
        x0, x1 = max(0, x - radius), min(w, x + radius + 1)
        neighborhood = data[y0:y1, x0:x1]
        nb_mask = mask[y0:y1, x0:x1]
        rain = neighborhood[nb_mask]

        if len(rain) == 0:
            continue
        colors = [tuple(c) for c in rain]
        result[y, x] = Counter(colors).most_common(1)[0][0]
    return result


def clean_frame(img: Image.Image) -> Image.Image:
    """
    Пикселизация 1×1 (без изменения разрешения).
    Убираем всё, кроме осадков. Дыры заливаем цветом соседей.
    """
    # ШАГ 1: никакой пикселизации — оставляем как есть
    data = np.array(img)

    # ШАГ 2: маска осадков по цвету
    mask = np.zeros(data.shape[:2], dtype=bool)
    for color in RAIN_COLORS:
        dist = np.abs(data.astype(int) - np.array(color)).sum(axis=2)
        mask |= (dist < 120)

    # ШАГ 3: заливка дыр (города, границы, легенда)
    filled = fill_holes(data, mask, radius=9)

    # ШАГ 4: всё, что не осадки — прозрачное
    out = np.zeros((filled.shape[0], filled.shape[1], 4), dtype=np.uint8)
    out[..., :3] = filled
    out[..., 3] = np.where(mask, 255, 0)

    return Image.fromarray(out, mode="RGBA")


def save_frames(frames: list[Image.Image]):
    """Сохраняет все кадры, чистит старые."""
    ts = int(time.time())
    for i, frame in enumerate(frames):
        cleaned = clean_frame(frame)
        path = DATA_DIR / f"{ts}_{i:02d}.png"
        cleaned.save(path)

    all_frames = sorted(DATA_DIR.glob("*.png"))
    while len(all_frames) > MAX_FRAMES:
        oldest = all_frames.pop(0)
        oldest.unlink()


def collect():
    """Задача: скачать -> почистить -> сохранить."""
    log.info("Сбор кадров...")
    frames = download_gif()
    if frames:
        save_frames(frames)
        log.info(f"Сохранено. Всего: {len(list(DATA_DIR.glob('*.png')))}")


scheduler = AsyncIOScheduler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    collect()
    scheduler.add_job(collect, "interval", minutes=10)
    scheduler.start()
    yield
    scheduler.shutdown()


app = FastAPI(lifespan=lifespan)


@app.get("/api/frames")
async def list_frames():
    files = sorted(DATA_DIR.glob("*.png"))
    return {"frames": [{"name": p.name, "url": f"/api/frame/{p.name}"} for p in files]}


@app.get("/api/frame/{name}")
async def get_frame(name: str):
    path = DATA_DIR / name
    if not path.exists():
        raise HTTPException(404, "Кадр не найден")
    return Response(content=path.read_bytes(), media_type="image/png")


@app.get("/", response_class=HTMLResponse)
async def index():
    return HTMLResponse(Path(__file__).parent.joinpath("index.html").read_text(encoding="utf-8"))
