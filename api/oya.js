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
      } else if (value !== undefined) {
        query.set(key, String(value));
      }
    }

    const targetUrl = `${TARGET}?${query.toString()}`;

    const upstream = await fetch(targetUrl, {
      headers: {
        "User-Agent": "GPTrad/1.0"
      }
    });

    const contentType =
      upstream.headers.get("content-type") ||
      "application/octet-stream";

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", contentType);

    const buffer = Buffer.from(await upstream.arrayBuffer());

    return res.status(upstream.status).send(buffer);

  } catch (error) {
    console.error("OYA proxy error:", error);

    return res.status(502).json({
      ok: false,
      error: "OYA upstream request failed"
    });
  }
}
