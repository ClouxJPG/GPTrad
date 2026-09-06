export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).send("Method Not Allowed");
  }

  try {
    const requestUrl = new URL(
      req.url,
      "https://gptrad-proxy.invalid"
    );

    const path =
      requestUrl.pathname.includes("vector_wsgi")
        ? "/vector_wsgi"
        : "/baltrad_wsgi";

    const upstream = new URL(
      "https://www.nowcast.ru" + path
    );

    const token = requestUrl.searchParams.get("token");

    for (const [key, value] of requestUrl.searchParams.entries()) {
      if (key !== "token") {
        upstream.searchParams.append(key, value);
      }
    }

    if (token) {
      upstream.searchParams.set("token", token);
    }

    const response = await fetch(
      upstream.toString(),
      {
        method: "GET",
        headers: {
          "Accept":
            path === "/vector_wsgi"
              ? "application/json,text/plain,*/*"
              : "application/xml,text/xml,text/plain,*/*",

          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) " +
            "AppleWebKit/605.1.15 (KHTML, like Gecko) " +
            "Version/18.0 Mobile/15E148 Safari/604.1",

          "Referer":
            "https://www.nowcast.ru/demo/demo.html",

          "Origin":
            "https://www.nowcast.ru"
        },

        cache: "no-store"
      }
    );

    const contentType =
      response.headers.get("content-type") ||
      "text/plain; charset=utf-8";

    const body = await response.text();

    res.setHeader(
      "Content-Type",
      contentType
    );

    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate"
    );

    return res.status(response.status).send(body);

  } catch (error) {
    console.error(
      "[GPTrad Nowcast proxy]",
      error
    );

    return res.status(502).json({
      ok: false,
      error: "NOWCAST_PROXY_ERROR",
      message:
        error?.message ||
        String(error)
    });
  }
}
