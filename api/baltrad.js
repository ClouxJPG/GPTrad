const UPSTREAM = "https://www.nowcast.ru/baltrad_wsgi";

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).send("GET only");
  }

  const incoming = new URL(
    req.url,
    "https://gptrad-proxy.invalid"
  );

  const url = new URL(UPSTREAM);
  url.search = incoming.search;

  const results = {};

  // TEST A — максимально похож на браузер
  try {
    const r = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": "https://www.nowcast.ru/",
        "Origin": "https://www.nowcast.ru",
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) " +
          "AppleWebKit/605.1.15 (KHTML, like Gecko) " +
          "Version/18.7 Mobile/15E148 Safari/604.1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin"
      }
    });

    results.browserLike = {
      status: r.status,
      contentType: r.headers.get("content-type"),
      body: (await r.text()).slice(0, 500)
    };
  } catch (e) {
    results.browserLike = {
      error: e.message
    };
  }

  // TEST B — простой серверный запрос
  try {
    const r = await fetch(url.toString(), {
      method: "GET"
    });

    results.simple = {
      status: r.status,
      contentType: r.headers.get("content-type"),
      body: (await r.text()).slice(0, 500)
    };
  } catch (e) {
    results.simple = {
      error: e.message
    };
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  return res.status(200).send(
    JSON.stringify(results, null, 2)
  );
};
