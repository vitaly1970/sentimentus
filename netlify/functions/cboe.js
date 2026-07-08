// Netlify Function: срез опционной цепочки CBOE (delayed 15 мин).
// Скачивает полную цепочку на СЕРВЕРЕ и возвращает только то, что нужно GEX:
//   { data: { current_price, options: [ { option, iv, open_interest }, ... ] } }
// Отбрасывает лишние поля и пустые контракты (iv>0.01 и OI>0 — как фильтрует сам GEX),
// поэтому ответ компактный и не упирается в лимит ответа функции (~6 МБ),
// из-за которого полная цепочка через прокси падала с 502.
//
// Вызов с фронтенда:  /.netlify/functions/cboe?symbol=QQQ

const INDEX = new Set(["SPX", "NDX", "RUT", "VIX", "DJX"]);

exports.handler = async (event) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Content-Type": "application/json",
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" };

  const sym = ((event.queryStringParameters || {}).symbol || "").trim().toUpperCase();
  if (!/^[A-Z]{1,6}$/.test(sym)) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "некорректный symbol" }) };
  }
  const cboeSym = INDEX.has(sym) ? "_" + sym : sym;
  const url = "https://cdn.cboe.com/api/global/delayed_quotes/options/" + cboeSym + ".json";

  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", "Accept": "*/*" }, redirect: "follow" });
    if (!r.ok) {
      const txt = await r.text();
      return { statusCode: r.status, headers: cors, body: JSON.stringify({ error: "CBOE HTTP " + r.status, detail: txt.slice(0, 200) }) };
    }
    const j = await r.json();
    const d = j && j.data;
    if (!d || !Array.isArray(d.options)) {
      return { statusCode: 502, headers: cors, body: JSON.stringify({ error: "CBOE вернул неожиданный формат" }) };
    }
    // срез: только нужные поля + только «живые» контракты (как фильтрует GEX)
    const options = [];
    for (const o of d.options) {
      const iv = +o.iv, oi = +o.open_interest;
      if (!o.option || !(iv > 0.01) || !(oi > 0)) continue;
      options.push({ option: o.option, iv: iv, open_interest: oi });
    }
    const body = JSON.stringify({ data: { current_price: +d.current_price, options: options } });
    return { statusCode: 200, headers: { ...cors, "Cache-Control": "public, max-age=300" }, body };
  } catch (e) {
    return { statusCode: 502, headers: cors, body: JSON.stringify({ error: "сбой запроса к CBOE", detail: String(e).slice(0, 200) }) };
  }
};
