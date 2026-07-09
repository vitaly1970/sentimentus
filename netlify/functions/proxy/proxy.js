// Классический формат Netlify Functions (v1) — гарантированно работает
// при ручном drag-and-drop деплое. Путь: /.netlify/functions/proxy?url=...
//
// Особый случай: fred.stlouisfed.org/graph/fredgraph.csv?id=XXX перехватывается
// и подменяется на вызов официального FRED API (api.stlouisfed.org) с ключом —
// HTML-экспорт fredgraph.csv зависает без ответа с датацентровых IP (Netlify/AWS),
// а официальный API с ключом отвечает быстро и стабильно.
// Ответ API (JSON) конвертируется обратно в CSV "DATE,VALUE" — формат, который
// уже понимает parseFred() в bottom.html, там ничего менять не нужно.

const ALLOWED = new Set([
  "cdn.cboe.com",
  "query1.finance.yahoo.com",
  "query2.finance.yahoo.com",
  "naaim.org",
  "www.naaim.org",
  "fred.stlouisfed.org",
  "www.aaii.com",
  "aaii.com",
]);

const FRED_API_KEY = process.env.FRED_API_KEY; // задаётся в Netlify → Environment variables

async function fetchFredViaApi(seriesId) {
  const apiUrl = "https://api.stlouisfed.org/fred/series/observations" +
    "?series_id=" + encodeURIComponent(seriesId) +
    "&api_key=" + FRED_API_KEY + "&file_type=json";
  const r = await fetch(apiUrl, { headers: { "Accept": "application/json" } });
  if (!r.ok) throw new Error("FRED API HTTP " + r.status);
  const data = await r.json();
  const obs = data.observations || [];
  const lines = ["DATE,VALUE"];
  for (const o of obs) lines.push(o.date + "," + o.value);
  return lines.join("\n");
}

exports.handler = async (event) => {
  const target = (event.queryStringParameters || {}).url;
  let u;
  try { u = new URL(target); } catch { return { statusCode: 400, body: "bad url" }; }
  if (u.protocol !== "https:" || !ALLOWED.has(u.hostname))
    return { statusCode: 403, body: "forbidden host" };

  // ---- перехват FRED: API вместо зависающего HTML-экспорта ----
  if (u.hostname === "fred.stlouisfed.org" && u.pathname === "/graph/fredgraph.csv") {
    const seriesId = u.searchParams.get("id");
    if (seriesId && FRED_API_KEY) {
      try {
        const csv = await fetchFredViaApi(seriesId);
        return {
          statusCode: 200,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Content-Type": "text/csv",
            "Cache-Control": "public, max-age=1800",
          },
          body: csv,
          isBase64Encoded: false,
        };
      } catch (e) {
        return { statusCode: 502, body: "fred api error: " + e.message };
      }
    }
    if (!FRED_API_KEY) {
      return { statusCode: 500, body: "FRED_API_KEY не задан в Netlify env vars" };
    }
  }

  // ---- обычный проброс для всех остальных источников ----
  try {
    const r = await fetch(u.toString(), {
      headers: { "User-Agent": "Mozilla/5.0", "Accept": "*/*" },
      redirect: "follow",
    });
    const buf = Buffer.from(await r.arrayBuffer());
    return {
      statusCode: r.status,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": r.headers.get("content-type") || "application/octet-stream",
        "Cache-Control": "public, max-age=1800",
      },
      body: buf.toString("base64"),
      isBase64Encoded: true,
    };
  } catch (e) {
    return { statusCode: 502, body: "proxy error: " + e.message };
  }
};
