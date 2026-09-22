const INDEX = 'https://meteoinfo.ru/radanim';
const FALLBACKS = [
  'https://meteoinfo.ru/images/radar/radarmap.png',
  'https://www.meteoinfo.ru/images/radar/radarmap.png'
];

const TTL = 5 * 60 * 1000;
let cached = null;
let cachedAt = 0;

function buildHeaders(accept) {
  return {
    'User-Agent': 'Mozilla/5.0 (compatible; COOLrad/1.0)',
    Accept: accept,
    Referer: INDEX
  };
}

function extractCandidates(html) {
  const values = new Set(FALLBACKS);
  const text = String(html).replaceAll('\\/', '/');

  const patterns = [
    /https?:[^"'\s<>]+\.(?:png|jpe?g)(?:\?[^"'\s<>]*)?/gi,
    /(?:src|href|url|image|frame|file)\s*[:=]\s*["']([^"']+\.(?:png|jpe?g)(?:\?[^"']*)?)["']/gi,
    /["']([^"']*(?:radar|radanim|composit|reflect)[^"']*)["']/gi
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text))) {
      const candidate = match[1] || match[0];
      try {
        const url = new URL(candidate, INDEX).toString();
        if (/\.(png|jpe?g)(\?|$)/i.test(url) && /radar|radanim|composit|reflect/i.test(url)) {
          values.add(url);
        }
      } catch (_) {
        // ignore bad URLs
      }
    }
  }

  return Array.from(values);
}

async function fetchImage(url) {
  const response = await fetch(url, {
    headers: buildHeaders('image/png,image/jpeg,image/*,*/*'),
    cache: 'no-store'
  });

  const arrayBuffer = await response.arrayBuffer();
  const body = Buffer.from(arrayBuffer);
  const type = (response.headers.get('content-type') || '').toLowerCase();

  if (!response.ok || !type.startsWith('image/') || body.length < 1200) {
    return null;
  }

  return { body, type, url };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    if (cached && Date.now() - cachedAt < TTL) {
      res.setHeader('Content-Type', cached.type);
      res.setHeader('X-COOLrad-Source', cached.url);
      return res.status(200).send(cached.body);
    }

    let candidates = [...FALLBACKS];

    try {
      const page = await fetch(`${INDEX}?t=${Date.now()}`, {
        headers: buildHeaders('text/html,application/xhtml+xml,*/*'),
        cache: 'no-store'
      });

      if (page.ok) {
        const html = await page.text();
        candidates = [...extractCandidates(html), ...candidates];
      }
    } catch (_) {
      // fallback to direct candidates
    }

    let result = null;
    for (const url of [...new Set(candidates)].reverse()) {
      try {
        result = await fetchImage(url);
        if (result) break;
      } catch (_) {
        // continue with next candidate
      }
    }

    if (!result) {
      throw new Error('Meteoinfo не вернул рабочий радарный композит');
    }

    cached = result;
    cachedAt = Date.now();

    res.setHeader('Content-Type', result.type);
    res.setHeader('X-COOLrad-Source', result.url);
    return res.status(200).send(result.body);
  } catch (error) {
    console.error('COOLrad proxy error:', error);
    return res.status(502).json({ ok: false, error: error.message });
  }
}





















































