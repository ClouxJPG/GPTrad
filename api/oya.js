const NOWCAST = "https://www.nowcast.ru";

let cachedToken = null;
let tokenExpires = 0;

async function getToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpires) return cachedToken;

  const response = await fetch(`${NOWCAST}/get_token`, {
    headers: {
      User-Agent: "Mozilla/5.0 COOLrad/1.0",
      Accept: "application/json, */*",
      Referer: `${NOWCAST}/demo/demo.html`
    },
    cache: "no-store"
  });

  const body = await response.text();
  if (!response.ok) throw new Error(`Nowcast token: ${response.status}`);

  let data;
  try {
    data = JSON.parse(body);
  } catch (e) {
    throw new Error("Nowcast вернул некорректный token response");
  }

  if (!data.token) throw new Error("Nowcast token отсутствует");

  cachedToken = data.token;
  tokenExpires = now + 20_000;
  return cachedToken;
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
}

async function upstreamRequest(url, accept) {
  return fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 COOLrad/1.0",
      Accept: accept,
      Referer: `${NOWCAST}/demo/demo.html`
    },
    cache: "no-store"
  });
}

function extractLayers(xml) {
  const layers = [];
  const regex = /<Layer\b[^>]*>[\s\S]*?<Name[^>]*>([^<]+)<\/Name>[\s\S]*?<Title[^>]*>([^<]*)<\/Title>[\s\S]*?<\/Layer>/gi;
  let match;

  while ((match = regex.exec(xml))) {
    const name = String(match[1] || "").trim();
    const title = String(match[2] || "").trim();
    if (name && !layers.some((entry) => entry.name === name)) {
      layers.push({ name, title });
    }
  }

  return layers;
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    const incoming = new URL(req.url, "https://gptrad.vercel.app");
    const action = incoming.searchParams.get("action") || "capabilities";
    const token = await getToken();

    if (action === "capabilities" || action === "layers") {
      const url = new URL(`${NOWCAST}/baltrad_wsgi`);
      url.searchParams.set("SERVICE", "WMS");
      url.searchParams.set("VERSION", "1.1.1");
      url.searchParams.set("REQUEST", "GetCapabilities");
      url.searchParams.set("token", token);

      const upstream = await upstreamRequest(url, "text/xml, application/xml, */*");
      const text = await upstream.text();
      if (!upstream.ok) {
        return res.status(502).json({
          ok: false,
          error: "Nowcast capabilities error",
          upstreamStatus: upstream.status,
          response: text.slice(0, 2000)
        });
      }

      if (action === "layers") {
        return res.status(200).json({ ok: true, layers: extractLayers(text) });
      }

      res.setHeader("Content-Type", upstream.headers.get("content-type") || "text/xml; charset=utf-8");
      return res.status(200).send(text);
    }

    if (action === "image") {
      const url = new URL(`${NOWCAST}/baltrad_wsgi`);
      const allowed = [
        "SERVICE",
        "VERSION",
        "REQUEST",
        "LAYERS",
        "STYLES",
        "SRS",
        "CRS",
        "BBOX",
        "WIDTH",
        "HEIGHT",
        "FORMAT",
        "TRANSPARENT",
        "TIME",
        "ELEVATION"
      ];

      for (const key of allowed) {
        const value = incoming.searchParams.get(key);
        if (value) url.searchParams.set(key, value);
      }

      url.searchParams.set("SERVICE", "WMS");
      url.searchParams.set("VERSION", incoming.searchParams.get("VERSION") || "1.1.1");
      url.searchParams.set("REQUEST", "GetMap");
      url.searchParams.set("token", token);

      const upstream = await upstreamRequest(url, "image/png,image/*,*/*");
      const buffer = Buffer.from(await upstream.arrayBuffer());
      const contentType = upstream.headers.get("content-type") || "application/octet-stream";

      if (!upstream.ok || !contentType.toLowerCase().includes("image")) {
        return res.status(502).json({
          ok: false,
          error: "Nowcast WMS image error",
          upstreamStatus: upstream.status,
          contentType,
          body: buffer.toString("utf8").slice(0, 2000)
        });
      }

      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).send(buffer);
    }

    return res.status(400).json({ ok: false, error: "Неизвестный action", allowed: ["capabilities", "layers", "image"] });
  } catch (error) {
    console.error("COOLrad Nowcast proxy error:", error);
    return res.status(502).json({ ok: false, error: error?.message || "Unknown error" });
  }
}
