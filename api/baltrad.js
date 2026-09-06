export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  try {
    const url = new URL(req.url, "https://gptrad-proxy.invalid");

    const token = url.searchParams.get("token");

    if (!token) {
      return res.status(400).json({
        ok: false,
        error: "NO_TOKEN",
        message: "Добавь ?token=БРАУЗЕРНЫЙ_ТОКЕН"
      });
    }

    const upstream = new URL(
      "https://www.nowcast.ru/baltrad_wsgi"
    );

    for (const [key, value] of url.searchParams.entries()) {
      if (key !== "token") {
        upstream.searchParams.append(key, value);
      }
    }

    upstream.searchParams.set("token", token);

    const response = await fetch(upstream.toString(), {
      method: "GET",
      headers: {
        "Accept": "application/xml,text/xml,text/plain,*/*",
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
        "Referer": "https://www.nowcast.ru/demo/demo.html",
        "Origin": "https://www.nowcast.ru"
      },
      cache: "no-store"
    });

    const text = await response.text();

    return res.status(200).json({
      ok: response.ok,

      nowcast_status: response.status,
      nowcast_status_text: response.statusText,

      content_type:
        response.headers.get("content-type"),

      content_length:
        response.headers.get("content-length"),

      upstream_url:
        upstream.toString().replace(
          /token=[^&]+/,
          "token=HIDDEN"
        ),

      response_preview:
        text.substring(0, 1000)
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      ok: false,
      error: "PROXY_EXCEPTION",
      message: error?.message || String(error),
      stack: error?.stack || null
    });
  }
}
