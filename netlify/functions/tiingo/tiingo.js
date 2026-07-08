// Netlify Function: посредник к Tiingo.
// Ключ берётся из переменной окружения TIINGO_KEY (задаётся в настройках Netlify,
// в коде и в браузере его нет). Снимает CORS, прячет ключ на сервере.
//
// Режимы:
//   1) История (по умолчанию): /.netlify/functions/tiingo?symbol=QQQ&start=1999-01-01
//      → JSON-массив дневных баров (date, close, high, low, open, adjClose, divCash, splitFactor).
//   2) Живая цена (внутридневная, IEX): /.netlify/functions/tiingo?symbol=QQQ&mode=iex
//      → JSON-массив с одним объектом котировки (last, tngoLast, prevClose, high, low, open, timestamp…).

exports.handler = async (event) => {
  const KEY = process.env.TIINGO_KEY;
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  if (!KEY) return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'TIINGO_KEY не задан в переменных окружения Netlify' }) };

  const symbol = (event.queryStringParameters?.symbol || '').trim().toUpperCase();
  const mode = (event.queryStringParameters?.mode || 'daily').trim().toLowerCase();
  if (!/^[A-Z.]{1,10}$/.test(symbol)) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'некорректный symbol' }) };
  }

  // ---- Режим живой (внутридневной) цены через IEX ----
  if (mode === 'iex' || mode === 'live') {
    const url = `https://api.tiingo.com/iex/?tickers=${symbol}&token=${KEY}`;
    try {
      const r = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
      if (!r.ok) {
        const txt = await r.text();
        return { statusCode: r.status, headers: cors, body: JSON.stringify({ error: `Tiingo IEX HTTP ${r.status}`, detail: txt.slice(0, 300) }) };
      }
      const data = await r.json();
      if (!Array.isArray(data) || !data.length) {
        return { statusCode: 502, headers: cors, body: JSON.stringify({ error: 'Tiingo IEX: пустой ответ', detail: JSON.stringify(data).slice(0, 300) }) };
      }
      // короткий кэш: живая цена должна быть свежей
      return { statusCode: 200, headers: { ...cors, 'Cache-Control': 'public, max-age=30' }, body: JSON.stringify(data) };
    } catch (e) {
      return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'сбой запроса к Tiingo IEX', detail: String(e).slice(0, 300) }) };
    }
  }

  // ---- Режим истории (дневные бары) ----
  const start = (event.queryStringParameters?.start || '1999-01-01').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'некорректная дата start' }) };
  }

  const url = `https://api.tiingo.com/tiingo/daily/${symbol}/prices?startDate=${start}&format=json&token=${KEY}`;
  try {
    const r = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
    if (!r.ok) {
      const txt = await r.text();
      return { statusCode: r.status, headers: cors, body: JSON.stringify({ error: `Tiingo HTTP ${r.status}`, detail: txt.slice(0, 300) }) };
    }
    const data = await r.json();
    if (!Array.isArray(data)) {
      return { statusCode: 502, headers: cors, body: JSON.stringify({ error: 'Tiingo вернул не массив', detail: JSON.stringify(data).slice(0, 300) }) };
    }
    // отдаём как есть — фронтенд разберёт нужные поля
    return { statusCode: 200, headers: { ...cors, 'Cache-Control': 'public, max-age=3600' }, body: JSON.stringify(data) };
  } catch (e) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'сбой запроса к Tiingo', detail: String(e).slice(0, 300) }) };
  }
};
