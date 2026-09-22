const INDEX = "https://meteoinfo.ru/radanim";
const FALLBACKS = [
  "https://meteoinfo.ru/images/radar/radarmap.png",
  "https://www.meteoinfo.ru/images/radar/radarmap.png"
];
const TTL = 5 * 60 * 1000;
let cached = null;
let cachedAt = 0;

const headers = (accept) => ({
  "User-Agent": "Mozilla/5.0 COOLrad/1.0",
  Accept: accept,
  Referer: INDEX
});

function getCandidates(html) {
  const values = new Set(FALLBACKS);
  const text = String(html).replaceAll("\\/", "/");
  const patterns = [
    /https?:[^"'\\s<>]+\.(?:png|jpe?g)(?:\?[^"'\\s<>]*)?/gi,
    /(?:src|href|url|image|frame|file)\s*[:=]\s*["']([^"']+\.(?:png|jpe?g)(?:\?[^"']*)?)["']/gi,
    /["']([^"']*\/(?:radar|radanim|composit|reflect)[^"']*)["']/gi
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text))) {
      const value = match[1] || match[0];
      try {
        const url = new URL(value, INDEX).toString();
        if (/\.(png|jpe?g)(\?|$)/i.test(url) && /radar|radanim|composit|reflect/i.test(url)) values.add(url);
      } catch (_) {}
    }
  }
  return [...values];
}

async function fetchImage(url) {
  const response = await fetch(url, {
    headers: headers("image/png,image/jpeg,image/*,*/*"),
    cache: "no-store"
  });
  const body = Buffer.from(await response.arrayBuffer());
  const type = (response.headers.get("content-type") || "").toLowerCase();
  if (!response.ok || !type.startsWith("image/") || body.length < 1000) return null;
  return { body, type, url };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    if (cached && Date.now() - cachedAt < TTL) {
      res.setHeader("Content-Type", cached.type);
      res.setHeader("X-COOLrad-Source", cached.url);
      return res.status(200).send(cached.body);
    }

    let candidates = [...FALLBACKS];
    try {
      const page = await fetch(`${INDEX}?v=${Math.floor(Date.now() / TTL)}`, {
        headers: headers("text/html,application/xhtml+xml,*/*"),
        cache: "no-store"
      });
      if (page.ok) candidates = [...getCandidates(await page.text()), ...candidates];
    } catch (_) {}

    let result = null;
    for (const url of [...new Set(candidates)].reverse()) {
      try {
        result = await fetchImage(url);
        if (result) break;
      } catch (_) {}
    }
    if (!result) throw new Error("Meteoinfo не вернул изображение радара");

    cached = result;
    cachedAt = Date.now();
    res.setHeader("Content-Type", result.type);
    res.setHeader("X-COOLrad-Source", result.url);
    return res.status(200).send(result.body);
  } catch (error) {
    console.error("COOLrad radar proxy:", error);
    return res.status(502).json({ ok: false, error: error.message });
  }
}
