// Классический формат Netlify Functions (v1) — гарантированно работает
// при ручном drag-and-drop деплое. Путь: /.netlify/functions/proxy?url=...
//
// Особый случай: fred.stlouisfed.org/graph/fredgraph.csv?id=XXX перехватывается
// и подменяется на вызов официального FRED API (api.stlouisfed.org) с ключом.
//
// В этой версии добавлены console.log на каждом шаге — временно, для отладки
// через Netlify → Logs & metrics → Functions → proxy. Можно убрать позже.

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
    console.log("[proxy] bad url, parse error:", e.message);
    return { statusCode: 400, body: "bad url" };
  }

  console.log("[proxy] hostname =", u.hostname, "| allowed =", ALLOWED.has(u.hostname));
  if (u.protocol !== "https:" || !ALLOWED.has(u.hostname)) {
    console.log("[proxy] REJECTED — protocol or host not allowed");
    return { statusCode: 403, body: "forbidden host" };
  }

  if (u.hostname === "fred.stlouisfed.org" && u.pathname === "/graph/fredgraph.csv") {
    const seriesId = u.searchParams.get("id");
    console.log("[proxy] FRED branch, seriesId =", seriesId, "| key set =", !!FRED_API_KEY);
    if (seriesId && FRED_API_KEY) {
      try {
        const csv = await fetchFredViaApi(seriesId);
        console.log("[proxy] FRED ok, csv length =", csv.length);
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
    if (!FRED_API_KEY) {
      console.log("[proxy] FRED_API_KEY missing in env");
      return { statusCode: 500, body: "FRED_API_KEY не задан в Netlify env vars" };
    }
  }

  console.log("[proxy] passthrough fetch ->", u.toString());
  try {
    const r = await fetch(u.toString(), {
      headers: { "User-Agent": "Mozilla/5.0", "Accept": "*/*" },
      redirect: "follow",
    });
    console.log("[proxy] passthrough status =", r.status, "| content-type =", r.headers.get("content-type"));
    const buf = Buffer.from(await r.arrayBuffer());
    console.log("[proxy] passthrough bytes =", buf.length);
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
    console.log("[proxy] passthrough EXCEPTION:", e.name, e.message);
    return { statusCode: 502, body: "proxy error: " + e.message };
  }
};
