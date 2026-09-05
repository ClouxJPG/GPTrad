const UPSTREAMS = {
  "/baltrad_wsgi": "https://www.nowcast.ru/baltrad_wsgi",
  "/vector_wsgi": "https://www.nowcast.ru/vector_wsgi"
};

const TOKEN_URL = "https://www.nowcast.ru/get_token";

module.exports = async function handler(req, res) {
  // =========================================================
  // CORS
  // =========================================================

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

  // =========================================================
  // Parse incoming request
  // =========================================================

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

    // =======================================================
    // VECTOR — ОПАСНЫЕ ЯВЛЕНИЯ
    // =======================================================
    //
    // Пример:
    //
    // /vector_wsgi
    //   ?time=2026-09-05T14:40:00Z
    //   &title=bufr_phenomena,bufr_novosib_phenomena,bufr_vlad_phenomena
    //
    // Token для vector_wsgi НЕ требуется.
    // =======================================================

    if (pathname === "/vector_wsgi") {

      const upstream = new URL(upstreamBase);

      // Передаём ВСЕ параметры без изменения.
      for (const [key, value] of incoming.searchParams) {
        upstream.searchParams.append(key, value);
      }

      console.log(
        "GPTrad VECTOR request:",
        upstream.toString()
      );

      const response = await fetch(
        upstream.toString(),
        {
          method: "GET",

          headers: {
            "Accept":
              "application/json, text/plain, */*",

            "Referer":
              "https://www.nowcast.ru/demo/demo.html",

            "Origin":
              "https://www.nowcast.ru",

            "User-Agent":
              "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) " +
              "AppleWebKit/605.1.15 " +
              "Version/17.0 Mobile/15E148 Safari/604.1"
          }
        }
      );

      const body = Buffer.from(
        await response.arrayBuffer()
      );

      console.log(
        "GPTrad VECTOR response:",
        response.status,
        response.statusText
      );

      res.status(response.status);

      const contentType =
        response.headers.get("content-type");

      if (contentType) {

        res.setHeader(
          "Content-Type",
          contentType
        );

      } else {

        res.setHeader(
          "Content-Type",
          "application/json; charset=utf-8"
        );

      }

      // Не кэшируем ОЯ.
      // Времена меняются, поэтому браузер должен
      // получать актуальный ответ.
      res.setHeader(
        "Cache-Control",
        "no-store"
      );

      return res.end(body);
    }


    // =======================================================
    // WMS — РАДАР
    // =======================================================
    //
    // Здесь оставляем рабочую логику радара.
    //
    // Nowcast требует свежий JWT token.
    // =======================================================

    if (pathname === "/baltrad_wsgi") {

      // -----------------------------------------------------
      // 1. Получаем свежий token
      // -----------------------------------------------------

      const tokenResponse = await fetch(
        TOKEN_URL,
        {
          method: "GET",

          headers: {
            "Accept": "application/json",

            "User-Agent":
              "GPTrad-Vercel-Proxy/1.0"
          }
        }
      );

      if (!tokenResponse.ok) {

        const text =
          await tokenResponse.text();

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

      const tokenData =
        await tokenResponse.json();

      if (
        !tokenData ||
        !tokenData.token
      ) {

        console.error(
          "Invalid token response:",
          tokenData
        );

        return res
          .status(502)
          .send(
            "Nowcast returned no token."
          );
      }

      const token =
        tokenData.token;


      // -----------------------------------------------------
      // 2. Собираем WMS URL
      // -----------------------------------------------------

      const upstream =
        new URL(upstreamBase);

      // Копируем параметры запроса GPTrad.
      //
      // Старый token не передаём —
      // вместо него используем свежий.
      for (
        const [key, value]
        of incoming.searchParams
      ) {

        if (
          key.toLowerCase() === "token"
        ) {
          continue;
        }

        upstream.searchParams.append(
          key,
          value
        );
      }

      // Добавляем свежий token.
      upstream.searchParams.set(
        "token",
        token
      );


      // -----------------------------------------------------
      // 3. Запрашиваем WMS у Nowcast
      // -----------------------------------------------------

      console.log(
        "GPTrad WMS request:",
        upstream.toString()
      );

      const response = await fetch(
        upstream.toString(),
        {
          method: "GET",

          headers: {
            "Accept": "*/*",

            "User-Agent":
              "GPTrad-Vercel-Proxy/1.0"
          }
        }
      );

      const body = Buffer.from(
        await response.arrayBuffer()
      );


      // -----------------------------------------------------
      // 4. Возвращаем WMS браузеру
      // -----------------------------------------------------

      res.status(response.status);

      const contentType =
        response.headers.get(
          "content-type"
        );

      if (contentType) {

        res.setHeader(
          "Content-Type",
          contentType
        );

      }


      const cacheControl =
        response.headers.get(
          "cache-control"
        );

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


      const etag =
        response.headers.get(
          "etag"
        );

      if (etag) {

        res.setHeader(
          "ETag",
          etag
        );

      }

      return res.end(body);
    }

  } catch (error) {

    // =======================================================
    // ERROR
    // =======================================================

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
