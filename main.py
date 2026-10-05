import httpx
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# Разрешаем запрос с вашего фронтенда (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Заголовки, имитирующие реальный браузер
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://meteorad.ru/",
}

@app.get("/api/tile/{z}/{x}/{y}.png")
async def get_radar_tile(z: int, x: int, y: int, time: str = "1789999600000"):
    # Шаблон URL тайла (замените на прямой URL тайлового сервера, найденный в Network)
    tile_url = f"https://meteorad.ru/tiles/{time}/{z}/{x}/{y}.png"
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(tile_url, headers=HEADERS, timeout=10.0)
            if response.status_code == 200:
                return Response(content=response.content, media_type="image/png")
            return Response(status_code=response.status_code)
        except Exception:
            return Response(status_code=500)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
