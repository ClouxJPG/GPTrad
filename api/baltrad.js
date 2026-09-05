const UPSTREAM = "https://www.nowcast.ru/baltrad_wsgi";

module.exports = async function handler(req, res) {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");
    return res.status(204).end();
  }

  // Only GET is needed for WMS
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).send("Method Not Allowed");
  }

  try {
    // Preserve the complete query string
    const incomingUrl = new URL(
      req.url,
      "https://gptrad-proxy.invalid"
    );

    const upstreamUrl = new URL(UPSTREAM);
    upstreamUrl.search = incomingUrl.search;

    const response = await fetch(upstreamUrl.toString(), {
      method: "GET",
      headers: {
        "Accept": req.headers.accept || "*/*",
        "User-Agent": "GPTrad-Vercel-WMS-Proxy/1.0"
      }
    });

    const body = Buffer.from(await response.arrayBuffer());

    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");

    // Preserve useful upstream headers
    const contentType = response.headers.get("content-type");
    if (contentType) {
      res.setHeader("Content-Type", contentType);
    }

    const cacheControl = response.headers.get("cache-control");
    if (cacheControl) {
      res.setHeader("Cache-Control", cacheControl);
    }

    const etag = response.headers.get("etag");
    if (etag) {
      res.setHeader("ETag", etag);
    }

    return res.status(response.status).end(body);

  } catch (error) {
    console.error("Nowcast proxy error:", error);

    return res
      .status(502)
      .send("Bad Gateway: unable to reach Nowcast.");
  }
};
