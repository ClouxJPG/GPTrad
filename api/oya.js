const TARGET = "https://www.nowcast.ru/baltrad_wsgi";

export default async function handler(req, res) {
  try {
    // CORS preflight
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "*");
      return res.status(204).end();
    }

    // Собираем параметры запроса
    const query = new URLSearchParams();

    for (const [key, value] of Object.entries(req.query || {})) {
      if (Array.isArray(value)) {
        for (const item of value) {
          query.append(key, String(item));
        }
      } else if (value !== undefined && value !== null) {
        query.set(key, String(value));
      }
    }

    const targetUrl = `${TARGET}?${query.toString()}`;

    // Запрос к Nowcast
    const upstream = await fetch(targetUrl, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) " +
          "AppleWebKit/605.1.15 (KHTML, like Gecko) " +
          "Version/17.0 Mobile/15E148 Safari/604.1",

        "Accept":
          "text/xml, application/xml, image/png, image/jpeg, */*"
      }
    });

    console.log(
      "OYA upstream:",
      upstream.status,
      upstream.statusText,
      targetUrl
    );

    // Получаем ответ целиком
    const buffer = Buffer.from(await upstream.arrayBuffer());

    // Передаём необходимые заголовки
    const contentType =
      upstream.headers.get("content-type") ||
      "application/octet-stream";

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");

    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate"
    );

    res.setHeader("Content-Type", contentType);

    // Возвращаем тот же HTTP-статус Nowcast
    return res.status(upstream.status).send(buffer);

  } catch (error) {
    console.error("OYA proxy error:", error);

    return res.status(502).json({
      ok: false,
      error: "OYA upstream request failed",
      message: error?.message || "Unknown error"
    });
  }
}
