const UPSTREAM = "https://www.nowcast.ru/baltrad_wsgi";

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).send("Method Not Allowed");
  }

  const incoming = new URL(
    req.url,
    "https://gptrad-proxy.invalid"
  );

  const upstream = new URL(UPSTREAM);
  upstream.search = incoming.search;

  try {
    const response = await fetch(upstream.toString(), {
      method: "GET",
      headers: {
        "Accept": req.headers.accept || "*/*",
        "User-Agent": "Mozilla/5.0",
        "Referer": "https://www.nowcast.ru/"
      }
    });

    const text = await response.text();

    console.log("NOWCAST STATUS:", response.status);
    console.log("NOWCAST CONTENT-TYPE:", response.headers.get("content-type"));
    console.log("NOWCAST BODY:", text.slice(0, 2000));

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "text/plain; charset=utf-8");

    return res.status(response.status).send(
      "NOWCAST STATUS: " + response.status +
      "\n\nCONTENT-TYPE: " + response.headers.get("content-type") +
      "\n\nBODY:\n" + text.slice(0, 2000)
    );

  } catch (error) {
    console.error("NOWCAST FETCH ERROR:", error);

    return res.status(502).send(
      "NOWCAST FETCH ERROR:\n" + error.message
    );
  }
};
