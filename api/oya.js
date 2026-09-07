const NOWCAST = "https://www.nowcast.ru";

let cachedToken = null;
let tokenExpires = 0;

async function getToken() {
  const now = Date.now();

  if (cachedToken && now < tokenExpires) {
    return cachedToken;
  }

  const response = await fetch(`${NOWCAST}/get_token`, {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept": "application/json, */*",
      "Referer": `${NOWCAST}/demo/demo.html`
    }
  });

  if (!response.ok) {
    throw new Error(`Nowcast token: ${response.status}`);
  }

  const data = await response.json();

  if (!data.token) {
    throw new Error("Nowcast token отсутствует");
  }

  cachedToken = data.token;

  // Токен обновляем раньше его фактического истечения
  tokenExpires = now + 25000;

  return cachedToken;
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate"
  );
}

export default async function handler(req, res) {
  cors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  try {
    const incoming = new URL(
      req.url,
      "https://gptrad.vercel.app"
    );

    const action =
      incoming.searchParams.get("action") || "capabilities";

    const token = await getToken();

    /*
      GETCAPABILITIES
      /api/oya?action=capabilities
    */

    if (action === "capabilities") {
      const url = new URL(`${NOWCAST}/baltrad_wsgi`);

      url.searchParams.set("SERVICE", "WMS");
      url.searchParams.set("VERSION", "1.1.1");
      url.searchParams.set("REQUEST", "GetCapabilities");
      url.searchParams.set("token", token);

      const upstream = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept":
            "text/xml, application/xml, */*",
          "Referer":
            `${NOWCAST}/demo/demo.html`
        }
      });

      const text = await upstream.text();

      if (!upstream.ok) {
        return res.status(502).json({
          ok: false,
          error: "Nowcast GetCapabilities error",
          upstreamStatus: upstream.status,
          response: text
        });
      }

      res.setHeader(
        "Content-Type",
        upstream.headers.get("content-type") ||
          "text/xml; charset=utf-8"
      );

      return res.status(200).send(text);
    }

    /*
      WMS IMAGE

      /api/oya?action=image&...
    */

    if (action === "image") {
      const url = new URL(`${NOWCAST}/baltrad_wsgi`);

      for (const [key, value] of incoming.searchParams.entries()) {
        if (key === "action") continue;

        url.searchParams.set(key, value);
      }

      url.searchParams.set("token", token);

      const upstream = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept":
            "image/png,image/*,*/*",
          "Referer":
            `${NOWCAST}/demo/demo.html`
        }
      });

      const contentType =
        upstream.headers.get("content-type") ||
        "application/octet-stream";

      const buffer = Buffer.from(
        await upstream.arrayBuffer()
      );

      if (!upstream.ok) {
        return res.status(502).json({
          ok: false,
          error: "Nowcast WMS image error",
          upstreamStatus: upstream.status,
          contentType,
          body: buffer.toString("utf8").slice(0, 2000)
        });
      }

      res.setHeader("Content-Type", contentType);

      return res.status(200).send(buffer);
    }

    /*
      VECTOR

      Оставляем как отдельный прокси.
      Сам слой ОЯ от него не зависит.
    */

    if (action === "vector") {
      const url = new URL(`${NOWCAST}/vector_wsgi`);

      for (const [key, value] of incoming.searchParams.entries()) {
        if (key === "action") continue;

        url.searchParams.set(key, value);
      }

      url.searchParams.set("token", token);

      const upstream = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept":
            "application/json,text/plain,*/*",
          "Referer":
            `${NOWCAST}/demo/demo.html`
        }
      });

      const contentType =
        upstream.headers.get("content-type") ||
        "application/octet-stream";

      const buffer = Buffer.from(
        await upstream.arrayBuffer()
      );

      res.setHeader("Content-Type", contentType);

      return res.status(200).send(buffer);
    }

    return res.status(400).json({
      ok: false,
      error: "Неизвестный action",
      allowed: [
        "capabilities",
        "image",
        "vector"
      ]
    });

  } catch (error) {
    console.error("OYA proxy error:", error);

    return res.status(502).json({
      ok: false,
      error: error?.message || "Unknown error"
    });
  }
}
