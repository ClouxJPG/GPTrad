export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  try {
    const url = new URL(req.url, "https://gptrad.local");

    const target = url.searchParams.get("target");

    if (!target) {
      return res.status(400).json({
        ok:false,
        error:"NO_TARGET"
      });
    }

    const response = await fetch(target, {
      headers:{
        "User-Agent":"GPTrad/1.0",
        "Accept":"*/*"
      },
      cache:"no-store"
    });

    const body = await response.arrayBuffer();

    res.statusCode=response.status;
    res.setHeader(
      "Content-Type",
      response.headers.get("content-type") ||
      "application/octet-stream"
    );

    res.setHeader("Cache-Control","no-store");

    return res.send(Buffer.from(body));

  } catch(error) {
    return res.status(502).json({
      ok:false,
      error:"UPSTREAM_ERROR",
      message:error.message
    });
  }
}
