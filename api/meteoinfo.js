const INDEX = "https://meteoinfo.ru/radanim";
const TTL = 5 * 60 * 1000;
let cache = null;
let cacheAt = 0;

function headers(accept) {
  return {
    "User-Agent": "Mozilla/5.0 (compatible; COOLrad/1.0)",
    Accept: accept,
    Referer: INDEX
  };
}

function imageCandidates(html) {
  const found = new Set();
  const re = /(?:src|href)=["']([^"']+\.(?:png|jpg|jpeg)(?:\?[^"']*)?)["']/gi;
  let match;
  while ((match = re.exec(html))) {
    const value = match[1];
    if (/radar|radarmap|radanim|composit|images/i.test(value)) {
      found.add(new URL(value, INDEX).toString());
    }
  }
  // Keep the historical URL as a fallback, but do not assume it is current.
  found.add("https://meteoinfo.ru/images/radar/radarmap.png");
  return [...found].reverse();
}

async function download(url) {
  const response = await fetch(url, {
    headers: headers("image/avif,image/webp,image/png,image/*,*/*"),
    cache: "no-store"
  });
  const body = Buffer.from(await response.arrayBuffer());
  const type = response.headers.get("content-type") || "";
  if (!response.ok || !type.toLowerCase().startsWith("image/")) return null;
  return { body, type, url };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    if (cache && Date.now() - cacheAt < TTL) {
      res.setHeader("Content-Type", cache.type);
      res.setHeader("X-COOLrad-Source", cache.url);
      return res.status(200).send(cache.body);
    }

    const page = await fetch(`${INDEX}?_=${Math.floor(Date.now() / TTL)}`, {
      headers: headers("text/html,application/xhtml+xml,*/*"),
      cache: "no-store"
    });
    const html = await page.text();
    if (!page.ok) throw new Error(`Meteoinfo page: ${page.status}`);

    let result = null;
    for (const url of imageCandidates(html)) {
      try {
        result = await download(url);
        if (result) break;
      } catch (_) {}
    }
    if (!result) throw new Error("На странице Meteoinfo не найден рабочий радарный кадр");

    cache = result;
    cacheAt = Date.now();
    res.setHeader("Content-Type", result.type);
    res.setHeader("X-COOLrad-Source", result.url);
    return res.status(200).send(result.body);
  } catch (error) {
    console.error("Meteoinfo radar proxy error:", error);
    return res.status(502).json({ ok: false, error: error.message });
  }
}
