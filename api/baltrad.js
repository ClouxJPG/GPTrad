const UPSTREAMS = {
  "/baltrad_wsgi": "https://www.nowcast.ru/baltrad_wsgi",
  "/vector_wsgi": "https://www.nowcast.ru/vector_wsgi"
};

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).send("Method Not Allowed");
  }

  const incoming = new URL(
    req.url,
    "https://gptrad-proxy.invalid"
  );

  // Determine which endpoint was requested.
  const pathname = incoming.pathname;

  const upstreamBase = UPSTREAMS[pathname];

  if (!upstreamBase) {
    return res.status(404).send("Unknown proxy endpoint");
  }

  const upstream = new URL(upstreamBase);

  // Preserve ALL query parameters.
  upstream.search = incoming.search;

  try {
    const response = await fetch(upstream.toString(), {
      method: "GET",
      headers: {
        "Accept": req.headers.accept || "*/*",
        "User-Agent": "GPTrad-Vercel-Proxy/1.0"
      }
    });

    const body = Buffer.from(
      await response.arrayBuffer()
    );

    res.status(response.status);

    res.setHeader(
      "Access-Control-Allow-Origin",
      "*"
    );

    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, OPTIONS"
    );

    res.setHeader(
      "Access-Control-Allow-Headers",
      "*"
    );

    const contentType =
      response.headers.get("content-type");

    if (contentType) {
      res.setHeader(
        "Content-Type",
        contentType
      );
    }

    const cacheControl =
      response.headers.get("cache-control");

    if (cacheControl) {
      res.setHeader(
        "Cache-Control",
        cacheControl
      );
    }

    return res.end(body);

  } catch (error) {
    console.error(
      "Nowcast proxy error:",
      error
    );

    return res
      .status(502)
      .send(
        "Bad Gateway: unable to reach Nowcast."
      );
  }
};
