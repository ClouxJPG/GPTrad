const SOURCE = "https://meteoinfo.ru/images/radar/radarmap.png";
let cached = null;
let cachedAt = 0;
const TTL = 5 * 60 * 1000;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
  if (req.method === "OPTIONS") return res.status(204).end();
  try {
    if (cached && Date.now() - cachedAt < TTL) {
      res.setHeader("Content-Type", cached.type);
      return res.status(200).send(cached.body);
    }
    const upstream = await fetch(`${SOURCE}?_=${Math.floor(Date.now() / TTL)}`, {
      headers: { "User-Agent": "COOLrad/1.0", Accept: "image/png,image/*" },
      cache: "no-store"
    });
    const body = Buffer.from(await upstream.arrayBuffer());
    const type = upstream.headers.get("content-type") || "image/png";
    if (!upstream.ok || !type.includes("image")) {
      return res.status(502).json({ ok: false, error: "Meteoinfo radar unavailable", status: upstream.status });
    }
    cached = { body, type };
    cachedAt = Date.now();
    res.setHeader("Content-Type", type);
    return res.status(200).send(body);
  } catch (error) {
    return res.status(502).json({ ok: false, error: error.message });
  }
}
