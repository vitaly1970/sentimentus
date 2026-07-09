// Классический формат Netlify Functions (v1) — гарантированно работает
// при ручном drag-and-drop деплое. Путь: /.netlify/functions/proxy?url=...
const ALLOWED = new Set([
  "cdn.cboe.com",
  "query1.finance.yahoo.com",
  "query2.finance.yahoo.com",
  "naaim.org",
  "www.naaim.org",
  "fred.stlouisfed.org",
]);

exports.handler = async (event) => {
  const target = (event.queryStringParameters || {}).url;
  let u;
  try { u = new URL(target); } catch { return { statusCode: 400, body: "bad url" }; }
  if (u.protocol !== "https:" || !ALLOWED.has(u.hostname))
    return { statusCode: 403, body: "forbidden host" };
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
