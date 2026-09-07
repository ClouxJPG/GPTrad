const TARGET = "https://www.nowcast.ru/baltrad_wsgi";

export default async function handler(req, res) {
  try {
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "*");
      return res.status(204).end();
    }

    const incoming = new URL(req.url, "https://gptrad.vercel.app");

    const query = new URLSearchParams();

    for (const [key, value] of incoming.searchParams.entries()) {
      query.append(key, value);
    }

    // Если параметров нет — автоматически запрашиваем WMS GetCapabilities
    if (query.toString() === "") {
      query.set("SERVICE", "WMS");
      query.set("VERSION", "1.1.1");
      query.set("REQUEST", "GetCapabilities");
    }

    const targetUrl = `${TARGET}?${query.toString()}`;

    console.log("OYA target:", targetUrl);

    const upstream = await fetch(targetUrl, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
          "AppleWebKit/537.36 (KHTML, like Gecko) " +
          "Chrome/140.0.0.0 Safari/537.36",

        "Accept":
          "text/xml, application/xml, application/xhtml+xml, */*",

        "Accept-Language":
          "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",

        "Referer":
          "https://www.nowcast.ru/",

        "Origin":
          "https://www.nowcast.ru"
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

    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate"
    );

    if (!upstream.ok) {
      res.setHeader("Content-Type", "application/json");

      return res.status(200).json({
        ok: false,
        proxy: true,
        upstreamStatus: upstream.status,
        upstreamStatusText: upstream.statusText,
        upstreamContentType: contentType,
        target: targetUrl
      });
    }

    res.setHeader("Content-Type", contentType);

    return res.status(200).send(buffer);

  } catch (error) {
    console.error("OYA proxy error:", error);

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/json");

    return res.status(200).json({
      ok: false,
      proxy: true,
      error: error?.message || "Unknown error"
    });
  }
}
