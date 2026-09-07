const TARGET = "https://www.nowcast.ru/baltrad_wsgi";

export default async function handler(req, res) {
  try {
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "*");
      return res.status(204).end();
    }

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

    console.log("OYA request:", targetUrl);

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
      upstream.statusText
    );

    const contentType =
      upstream.headers.get("content-type") ||
      "application/octet-stream";

    const buffer = Buffer.from(
      await upstream.arrayBuffer()
    );

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");

    /*
      ВАЖНО:
      Если Nowcast вернул ошибку, не передаём её статус наружу.
      Вместо этого показываем диагностическую информацию.
    */
    if (!upstream.ok) {
      res.setHeader("Content-Type", "application/json");

      return res.status(200).json({
        ok: false,
        proxy: true,
        upstreamStatus: upstream.status,
        upstreamStatusText: upstream.statusText,
        upstreamContentType: contentType,
        target: targetUrl,
        message:
          "Vercel proxy работает, но upstream Nowcast вернул ошибку."
      });
    }

    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate"
    );

    res.setHeader("Content-Type", contentType);

    return res.status(200).send(buffer);

  } catch (error) {
    console.error("OYA proxy error:", error);

    return res.status(200).json({
      ok: false,
      proxy: true,
      upstreamStatus: null,
      error: error?.message || "Unknown error",
      message: "Ошибка внутри Vercel proxy"
    });
  }
}
