const INDEX = "https://meteoinfo.ru/radanim";
const TTL = 5 * 60 * 1000;
let cache = null;
let cacheAt = 0;

function requestHeaders(accept) {
  return {
    "User-Agent": "Mozilla/5.0 (compatible; COOLrad/1.0)",
    Accept: accept,
    Referer: INDEX
  };
}

function collectCandidates(html) {
  const values = new Set();
  const text = String(html).replace(/\\\//g, "/");
  const patterns = [
    /(?:src|href|url|image|frame|file)\s*[:=]\s*["']([^"']+\.(?:png|jpe?g)(?:\?[^"']*)?)["']/gi,
    /["']([^"']*\/(?:radar|radanim|composit)[^"']*\.(?:png|jpe?g)(?:\?[^"']*)?)["']/gi
  ];
  for (const regex of patterns) {
    let match;
    while ((match = regex.exec(text))) {
      try {
        const url = new URL(match[1], INDEX).toString();
        if (/\.jpe?g|\.png/i.test(url)) values.add(url);
      } catch (_) {}
    }
  }
  return [...values].filter((url) => /radar|radanim|composit|reflect/i.test(url));
}

function imageSize(buffer, type) {
  if (type.includes("png") && buffer.length > 24) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (type.includes("jpeg") || type.includes("jpg")) {
    for (let i = 2; i < buffer.length - 9;) {
      if (buffer[i] !== 0xff) { i++; continue; }
      const marker = buffer[i + 1];
      const length = buffer.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xc3) {
        return { height: buffer.readUInt16BE(i + 5), width: buffer.readUInt16BE(i + 7) };
      }
      i += 2 + length;
    }
  }
  return { width: 0, height: 0 };
}

async function download(url) {
  const response = await fetch(url, { headers: requestHeaders("image/png,image/jpeg,image/*,*/*"), cache: "no-store" });
  const body = Buffer.from(await response.arrayBuffer());
  const type = (response.headers.get("content-type") || "").toLowerCase();
  const size = imageSize(body, type);
  if (!response.ok || !type.startsWith("image/") || size.width < 500 || size.height < 300) return null;
  return { body, type, url, width: size.width, height: size.height };
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
      headers: requestHeaders("text/html,application/xhtml+xml,*/*"),
      cache: "no-store"
    });
    const html = await page.text();
    if (!page.ok) throw new Error(`Meteoinfo page: ${page.status}`);

    const candidates = collectCandidates(html);
    let result = null;
    for (const url of candidates.reverse()) {
      try {
        const item = await download(url);
        if (item) { result = item; break; }
      } catch (_) {}
    }
    if (!result) throw new Error("На Meteoinfo не найден полноценный радарный кадр");

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
