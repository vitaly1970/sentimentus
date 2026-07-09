// Классический формат Netlify Functions (v1).
// Путь: /.netlify/functions/proxy?url=...
//
// FRED: перехватывается и идёт через официальный API (api.stlouisfed.org) с ключом.
// AAII: получает полноценные браузерные заголовки (UA/Accept-Language/Referer) —
//   AAII отдаёт 403 на запросы с минимальными заголовками (см. лог: passthrough
//   status = 403 при "User-Agent: Mozilla/5.0" без остального).
//
// console.log оставлены для диагностики через Netlify → Logs & metrics → Functions → proxy.

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

const FRED_API_KEY = process.env.FRED_API_KEY;

const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
                    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

function headersFor(u) {
  const base = {
    "User-Agent": BROWSER_UA,
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
  };
  if (u.hostname.includes("aaii.com")) {
    base["Accept"] = "application/vnd.ms-excel,application/octet-stream,*/*";
    base["Referer"] = "https://www.aaii.com/sentimentsurvey";
  }
  return base;
}

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
  console.log("[proxy] incoming target =", target);

  let u;
  try { u = new URL(target); } catch (e) {
    console.log("[proxy] bad url:", e.message);
    return { statusCode: 400, body: "bad url" };
  }

  if (u.protocol !== "https:" || !ALLOWED.has(u.hostname)) {
    console.log("[proxy] REJECTED host:", u.hostname);
    return { statusCode: 403, body: "forbidden host" };
  }

  if (u.hostname === "fred.stlouisfed.org" && u.pathname === "/graph/fredgraph.csv") {
    const seriesId = u.searchParams.get("id");
    console.log("[proxy] FRED branch, seriesId =", seriesId, "| key set =", !!FRED_API_KEY);
    if (seriesId && FRED_API_KEY) {
      try {
        const csv = await fetchFredViaApi(seriesId);
        console.log("[proxy] FRED ok, len =", csv.length);
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
        console.log("[proxy] FRED error:", e.message);
        return { statusCode: 502, body: "fred api error: " + e.message };
      }
    }
    if (!FRED_API_KEY) return { statusCode: 500, body: "FRED_API_KEY не задан" };
  }

  const reqHeaders = headersFor(u);
  console.log("[proxy] passthrough ->", u.toString(), "| headers:", JSON.stringify(reqHeaders));
  try {
    const r = await fetch(u.toString(), { headers: reqHeaders, redirect: "follow" });
    console.log("[proxy] status =", r.status, "| content-type =", r.headers.get("content-type"));
    const buf = Buffer.from(await r.arrayBuffer());
    console.log("[proxy] bytes =", buf.length);
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
    console.log("[proxy] EXCEPTION:", e.name, e.message);
    return { statusCode: 502, body: "proxy error: " + e.message };
  }
};
