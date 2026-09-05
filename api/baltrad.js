const UPSTREAMS = {
  "/baltrad_wsgi": "https://www.nowcast.ru/baltrad_wsgi",
  "/vector_wsgi": "https://www.nowcast.ru/vector_wsgi"
};

const TOKEN_URL = "https://www.nowcast.ru/get_token";

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") {
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

  const pathname = incoming.pathname;
  const upstreamBase = UPSTREAMS[pathname];

  if (!upstreamBase) {
    return res.status(404).send("Unknown proxy endpoint");
  }

  try {
    /*
     * =========================================================
     * VECTOR
     * =========================================================
     *
     * /vector_wsgi не требует WMS token.
     */
    if (pathname === "/vector_wsgi") {
      const upstream = new URL(upstreamBase);
      upstream.search = incoming.search;

      const response = await fetch(upstream.toString(), {
        method: "GET",
        headers: {
          "Accept": "application/json,text/plain,*/*",
          "User-Agent": "GPTrad-Vercel-Proxy/1.0"
        }
      });

      const body = Buffer.from(
        await response.arrayBuffer()
      );

      res.status(response.status);

      const contentType = response.headers.get("content-type");
      if (contentType) {
        res.setHeader("Content-Type", contentType);
      }

      res.setHeader(
        "Cache-Control",
        "public, max-age=30, s-maxage=30"
      );

      return res.end(body);
    }


    /*
     * =========================================================
     * WMS
     * =========================================================
     *
     * Nowcast требует свежий token.
     *
     * ВАЖНО:
     * token получается самим Vercel,
     * а затем тем же сервером используется
     * для запроса WMS.
     */
    if (pathname === "/baltrad_wsgi") {

      // -------------------------------------------------------
      // 1. Получаем свежий token
      // -------------------------------------------------------

      const tokenResponse = await fetch(TOKEN_URL, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "User-Agent": "GPTrad-Vercel-Proxy/1.0"
        }
      });

      if (!tokenResponse.ok) {
        const text = await tokenResponse.text();

        console.error(
          "Nowcast token error:",
          tokenResponse.status,
          text
        );

        return res
          .status(502)
          .send(
            "Unable to obtain Nowcast token. " +
            "Upstream returned HTTP " +
            tokenResponse.status
          );
      }

      const tokenData = await tokenResponse.json();

      if (!tokenData || !tokenData.token) {
        console.error(
          "Invalid token response:",
          tokenData
        );

        return res
          .status(502)
          .send("Nowcast returned no token.");
      }

      const token = tokenData.token;


      // -------------------------------------------------------
      // 2. Собираем WMS URL
      // -------------------------------------------------------

      const upstream = new URL(upstreamBase);

      // Копируем все параметры из запроса GPTrad
      for (const [key, value] of incoming.searchParams) {

        // Старый token пользователя удаляем.
        // Мы всегда используем свежий token.
        if (key.toLowerCase() === "token") {
          continue;
        }

        upstream.searchParams.append(key, value);
      }

      // Добавляем свежий token
      upstream.searchParams.set("token", token);


      // -------------------------------------------------------
      // 3. Запрашиваем WMS у Nowcast
      // -------------------------------------------------------

      const response = await fetch(upstream.toString(), {
        method: "GET",
        headers: {
          "Accept": "*/*",
          "User-Agent": "GPTrad-Vercel-Proxy/1.0"
        }
      });

      const body = Buffer.from(
        await response.arrayBuffer()
      );

      // -------------------------------------------------------
      // 4. Возвращаем ответ браузеру
      // -------------------------------------------------------

      res.status(response.status);

      const contentType = response.headers.get("content-type");

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
      } else {
        res.setHeader(
          "Cache-Control",
          "public, max-age=30, s-maxage=30"
        );
      }

      const etag = response.headers.get("etag");

      if (etag) {
        res.setHeader("ETag", etag);
      }

      return res.end(body);
    }

  } catch (error) {

    console.error(
      "GPTrad Nowcast proxy error:",
      error
    );

    return res
      .status(502)
      .send(
        "Bad Gateway: unable to reach Nowcast."
      );
  }
};
