/**
 * Market Q&A bot — Cloudflare Worker.
 * Green-API sends a webhook for every WhatsApp message. When YOU write in your own chat
 * (or the configured chat), the bot reads the question, pulls live price data + recent
 * headlines, asks Gemini for an analysis in Moroccan Darija, and replies on WhatsApp.
 *
 * It gives ANALYSIS (trend, levels, events, news, scenarios, risks), never a buy/sell order.
 *
 * Environment (Cloudflare → Worker → Settings → Variables):
 *   GEMINI_API_KEY   (secret)
 *   GREENAPI_TOKEN   (secret)
 *   GREENAPI_URL       e.g. https://7107.api.greenapi.com
 *   GREENAPI_INSTANCE  e.g. 7107xxxxxxxx
 *   CHAT_ID            e.g. 2126XXXXXXXX  (the only chat the bot listens to and answers)
 */

const MODELS = ["gemini-3.5-flash", "gemini-2.5-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash-lite"];
const UA = { "User-Agent": "Mozilla/5.0 (MarketQABot)" };

export default {
  async fetch(request, env, ctx) {
    if (request.method === "GET") return new Response("market-qa-bot ok");
    if (request.method !== "POST") return new Response("method not allowed", { status: 405 });
    let body;
    try { body = await request.json(); } catch { return new Response("bad json", { status: 400 }); }
    const msg = parseWebhook(body, env);
    if (msg) ctx.waitUntil(handle(msg, env).catch(e => console.log("handle error", e && e.stack || e)));
    return new Response("ok"); // answer Green-API immediately; work continues in background
  },
};

// ---------------------------------------------------------------- webhook filtering
export function parseWebhook(b, env) {
  if (!b || !b.typeWebhook) return null;
  // Only from our own instance
  if (String(b.instanceData && b.instanceData.idInstance) !== String(env.GREENAPI_INSTANCE)) return null;
  // incomingMessageReceived = someone wrote to the linked number;
  // outgoingMessageReceived = you typed on your phone (e.g. in "Message yourself").
  // outgoingAPIMessageReceived (the bot's own replies / alerts) is ignored -> no loops.
  if (!["incomingMessageReceived", "outgoingMessageReceived"].includes(b.typeWebhook)) return null;
  const chat = (b.senderData && b.senderData.chatId) || "";
  const want = String(env.CHAT_ID).replace(/\D/g, "") + "@c.us";
  if (chat !== want) return null;
  const md = b.messageData || {};
  const text = (md.textMessageData && md.textMessageData.textMessage) ||
               (md.extendedTextMessageData && md.extendedTextMessageData.text) || "";
  if (!text.trim()) return null;
  // Never react to the bot's own formatted output if it ever comes back through another path
  if (/^(🧪|🔴|🟠|✅ Market Alerts|⚠️ Market Alerts|🤖)/u.test(text.trim())) return null;
  return { chat, text: text.trim().slice(0, 600), id: md.idMessage || b.idMessage };
}

// ---------------------------------------------------------------- main flow
async function handle(msg, env) {
  const intent = await understand(msg.text, env);
  if (intent.type === "chat" || !intent.symbols || !intent.symbols.length) {
    const reply = intent.reply || "🤖 صيفط ليا سمية سهم ولا عملة (مثلا: *Nvidia*، *BTC*، *واش مزيان نشري Tesla دابا؟*) ونعطيك تحليل.";
    return send(env, msg.chat, reply.startsWith("🤖") ? reply : "🤖 " + reply);
  }
  await send(env, msg.chat, `🤖 كنحلل ${intent.symbols.join(", ")}... (شي 20 ثانية)`);
  const data = [];
  for (const s of intent.symbols.slice(0, 2)) {
    const [px, news] = await Promise.all([priceData(s), headlines(s, intent.names && intent.names[s])]);
    data.push({ symbol: s, price: px, news });
  }
  const answer = await analyse(msg.text, data, env);
  await send(env, msg.chat, answer);
}

// ---------------------------------------------------------------- Gemini
async function gemini(env, system, user, json = true, maxTokens = 2048) {
  let last;
  for (const model of MODELS) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: Object.assign({ maxOutputTokens: Math.max(4096, maxTokens * 3), temperature: 0.3 },
          json ? { responseMimeType: "application/json" } : {}),
      }),
    });
    if (r.ok) {
      const j = await r.json();
      const parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
      const t = parts.filter(p => !p.thought).map(p => p.text || "").join("");
      if (t.trim()) return t;
      last = "empty response";
    } else {
      last = `${model} HTTP ${r.status}`;
    }
    console.log("gemini fallback:", last);
  }
  throw new Error("all Gemini models failed: " + last);
}

function extractJSON(t) {
  t = t.replace(/```(?:json)?/g, "").trim();
  const i = Math.min(...["{", "["].map(c => (t.indexOf(c) + 1 || 1e9) - 1));
  const j = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  return JSON.parse(t.slice(i, j + 1));
}

const INTENT_SYSTEM = `You route WhatsApp messages (Moroccan Darija, Arabic script or Latin, French or English) for a markets assistant.
Return ONLY JSON: {"type":"asset"|"chat","symbols":[...],"names":{"SYM":"Company or coin name"},"reply":"..."}
- type "asset" if the user asks about a stock, ETF, index, crypto, commodity or FX. symbols = Yahoo Finance tickers (max 2):
  stocks like NVDA, AAPL, TSLA; crypto as BTC-USD, ETH-USD, SOL-USD, XRP-USD; indices ^GSPC (S&P 500), ^IXIC (Nasdaq), ^DJI; gold GC=F; oil CL=F; EURUSD=X; Moroccan stocks are not supported (say so in reply with type chat).
- type "chat" otherwise (greetings, help, unclear). reply = short helpful Darija answer (Arabic script) explaining they can send a stock/crypto name for an analysis.`;

async function understand(text, env) {
  try {
    const j = extractJSON(await gemini(env, INTENT_SYSTEM, text, true, 300));
    j.symbols = (j.symbols || []).map(s => String(s).toUpperCase().trim()).filter(s => /^[\^A-Z0-9.=\-]{1,12}$/.test(s));
    return j;
  } catch (e) {
    console.log("intent error", e);
    const m = text.toUpperCase().match(/\b[A-Z]{2,5}\b/);
    return m ? { type: "asset", symbols: [m[0]] } : { type: "chat" };
  }
}

const ANALYSIS_SYSTEM = `You are a careful markets analyst replying on WhatsApp to a Moroccan trader, in Moroccan Darija (Arabic script). Keep tickers and technical terms in Latin letters (support, resistance, RSI, earnings, ETF...).
You receive the user's question plus DATA computed from real prices and recent headlines. Use ONLY that data; never invent prices, dates, levels or facts. If something is missing (e.g. earnings date), say it is not available and suggest checking it.
NEVER tell the user to buy or sell, and never say "now is the time to buy". The user wants to decide himself. Give the information a decision needs.
Format (WhatsApp, <= 1300 characters, short lines, emojis as section markers):
🤖 *<asset> — تحليل*
💵 الثمن دابا + التغير (1 نهار / 1 سيمانة / 1 شهر)
📈 الاتجاه: (فوق/تحت SMA20 و SMA50، شنو كيعني)
🧱 المستويات: support و resistance من الداتا
📰 الأخبار: 1-3 نقط من العناوين وتأثيرها المحتمل
⚠️ المخاطر: 2 نقط
🔀 السيناريوهات: "إلا طلع فوق X ... / إلا هبط تحت Y ..."
🧭 شنو تراقب قبل ما تقرر: 2-3 نقط (مثلا تأكيد الكسر، earnings، الفيد، حجم التداول)
End with exactly: "ℹ️ هادا تحليل ماشي نصيحة شراء ولا بيع — القرار ديالك."`;

async function analyse(question, data, env) {
  const user = `QUESTION: ${question}\n\nDATA:\n${JSON.stringify(data, null, 1)}`;
  try {
    let t = await gemini(env, ANALYSIS_SYSTEM, user, false, 900);
    t = t.trim();
    if (!t.includes("القرار ديالك")) t += "\n\nℹ️ هادا تحليل ماشي نصيحة شراء ولا بيع — القرار ديالك.";
    return t.slice(0, 3500);
  } catch (e) {
    const d = data[0] || {};
    const p = d.price || {};
    return `🤖 الذكاء الاصطناعي مشغول دابا. هادي الأرقام الخام:\n${d.symbol}: ${p.last ?? "?"} (${p.chg1d ?? "?"}% اليوم)\nSMA20 ${p.sma20 ?? "?"} · SMA50 ${p.sma50 ?? "?"}\nsupport ${p.support20 ?? "?"} · resistance ${p.resistance20 ?? "?"}\nعاود سول من بعد شوية.`;
  }
}

// ---------------------------------------------------------------- market data
export function summarize(symbol, closes, highs, lows, meta = {}) {
  const c = closes.filter(x => typeof x === "number");
  if (c.length < 5) return { symbol, error: "not enough price data" };
  const last = meta.price ?? c[c.length - 1];
  const pct = n => c.length > n ? +(((last / c[c.length - 1 - n]) - 1) * 100).toFixed(2) : null;
  const sma = n => c.length >= n ? +(c.slice(-n).reduce((a, b) => a + b, 0) / n).toFixed(4) : null;
  const h = highs.filter(x => typeof x === "number"), l = lows.filter(x => typeof x === "number");
  const r14 = rsi(c, 14);
  return {
    symbol, currency: meta.currency || null, last: +(+last).toFixed(4),
    chg1d: pct(1), chg5d: pct(5), chg1m: pct(21), chg3m: pct(63),
    sma20: sma(20), sma50: sma(50), rsi14: r14,
    support20: l.length ? Math.min(...l.slice(-20)) : null, resistance20: h.length ? Math.max(...h.slice(-20)) : null,
    low6m: l.length ? Math.min(...l) : null, high6m: h.length ? Math.max(...h) : null,
    asOf: meta.asOf || null,
  };
}

function rsi(c, n) {
  if (c.length <= n) return null;
  let g = 0, lo = 0;
  for (let i = c.length - n; i < c.length; i++) { const d = c[i] - c[i - 1]; if (d > 0) g += d; else lo -= d; }
  if (lo === 0) return 100;
  return +(100 - 100 / (1 + g / lo)).toFixed(1);
}

async function priceData(symbol) {
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=6mo&interval=1d`, { headers: UA });
    if (r.ok) {
      const j = await r.json();
      const res = j.chart && j.chart.result && j.chart.result[0];
      if (res) {
        const q = res.indicators.quote[0];
        const asOf = res.meta.regularMarketTime ? new Date(res.meta.regularMarketTime * 1000).toISOString() : null;
        return summarize(symbol, q.close, q.high, q.low, { price: res.meta.regularMarketPrice, currency: res.meta.currency, asOf });
      }
    }
  } catch (e) { console.log("yahoo error", e); }
  try { // fallback: Stooq daily CSV
    const s = symbol.endsWith("-USD") ? symbol.replace("-USD", "usd").toLowerCase() : symbol.toLowerCase() + ".us";
    const r = await fetch(`https://stooq.com/q/d/l/?s=${s}&i=d`, { headers: UA });
    const rows = (await r.text()).trim().split("\n").slice(1).map(l => l.split(",")).filter(x => x.length >= 5).slice(-130);
    if (rows.length) return summarize(symbol, rows.map(x => +x[4]), rows.map(x => +x[2]), rows.map(x => +x[3]), { asOf: rows[rows.length - 1][0] });
  } catch (e) { console.log("stooq error", e); }
  return { symbol, error: "price data unavailable" };
}

async function headlines(symbol, name) {
  const q = encodeURIComponent(`${name || symbol.replace("-USD", "").replace("^", "")} ${symbol.includes("-USD") ? "crypto" : "stock"} when:3d`);
  try {
    const r = await fetch(`https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`, { headers: UA });
    if (!r.ok) return [];
    const x = await r.text();
    return [...x.matchAll(/<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<pubDate>([\s\S]*?)<\/pubDate>/g)]
      .slice(0, 6).map(m => ({ title: m[1].replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"'), date: m[2] }));
  } catch { return []; }
}

// ---------------------------------------------------------------- WhatsApp
async function send(env, chatId, message) {
  const base = String(env.GREENAPI_URL || "https://api.green-api.com").replace(/\/$/, "");
  const r = await fetch(`${base}/waInstance${env.GREENAPI_INSTANCE}/sendMessage/${env.GREENAPI_TOKEN}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chatId, message }),
  });
  if (!r.ok) console.log("send failed", r.status, await r.text());
}
