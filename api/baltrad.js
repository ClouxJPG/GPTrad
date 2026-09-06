export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method Not Allowed"
    });
  }

  try {
    const incomingUrl = new URL(
      req.url,
      "https://gptrad-proxy.invalid"
    );

    const token = incomingUrl.searchParams.get("token");

    if (!token) {
      return res.status(400).json({
        error: "Missing Nowcast token",
        message: "Add ?token=YOUR_BROWSER_TOKEN to the request."
      });
    }

    // Создаём запрос к реальному Nowcast WMS
    const upstreamUrl = new URL(
      "https://www.nowcast.ru/baltrad_wsgi"
    );

    // Копируем все параметры кроме token
    for (const [key, value] of incomingUrl.searchParams.entries()) {
      if (key !== "token") {
        upstreamUrl.searchParams.append(key, value);
      }
    }

    // Передаём браузерный токен в Nowcast
    upstreamUrl.searchParams.set("token", token);

    const upstreamResponse = await fetch(upstreamUrl.toString(), {
      method: "GET",
      headers: {
        "Accept": "application/xml,text/xml,text/plain,*/*",
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
        "Referer": "https://www.nowcast.ru/demo/demo.html",
        "Origin": "https://www.nowcast.ru"
      },
      cache: "no-store"
    });

    const body = await upstreamResponse.text();

    // Передаём тип содержимого Nowcast
    const contentType =
      upstreamResponse.headers.get("content-type");

    if (contentType) {
      res.setHeader("Content-Type", contentType);
    } else {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
    }

    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate"
    );

    return res.status(upstreamResponse.status).send(body);

  } catch (error) {
    console.error("NOWCAST PROXY ERROR:", error);

    return res.status(502).send(
      "NOWCAST PROXY ERROR: " +
      (error?.message || String(error))
    );
  }
}
