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

// Fastest first. Cloudflare free plan cancels background work ~30 s after the webhook returns,
// so every step has a hard timeout and the whole answer must finish in ~25 s.
const MODELS = ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-3.1-flash-lite"];
const NO_THINK = { "gemini-2.5-flash-lite": true, "gemini-2.5-flash": true };
const BUDGET_MS = 25000;
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
  const deadline = Date.now() + BUDGET_MS;
  const intent = await understand(msg.text, env, deadline);
  if (intent.type === "chat" || !intent.assets || !intent.assets.length) {
    const reply = intent.reply || "صيفط ليا سمية سهم ولا عملة (مثلا: *Nvidia*، *BTC*، *PEPE*، *واش مزيان نشري Tesla دابا؟*) ونعطيك تحليل.";
    return send(env, msg.chat, reply.startsWith("🤖") ? reply : "🤖 " + reply);
  }
  const assets = intent.assets.slice(0, 2);
  const [, data] = await Promise.all([
    send(env, msg.chat, `🤖 كنجمع المعلومات على ${assets.map(a => a.name || a.symbol).join(" و ")} (الثمن، الأخبار، Google)...`),
    Promise.all(assets.map(gather)),
  ]);
  const answer = await analyse(msg.text, data, env, deadline);
  await send(env, msg.chat, answer);
}

// Collect everything we can about one asset, from several sources in parallel.
async function gather(a) {
  const isCrypto = a.type === "CRYPTOCURRENCY" || /-USD$/.test(a.symbol) || !!a.cgId;
  const [px, gnews, ynews, coin] = await Promise.all([
    priceData(a.symbol, !isCrypto),           // crypto falls back to CoinGecko instead of Stooq
    headlines(a.symbol, a.name),
    yahooNews(a.name || a.symbol),
    isCrypto ? coinInfo(a) : Promise.resolve(null),
  ]);
  let price = px;
  if (price.error && isCrypto && coin && coin.cgId) price = await coinPrice(coin.cgId, a.symbol); // tiny coins not on Yahoo
  const seen = new Set();
  const news = [...ynews, ...gnews].filter(n => { const k = n.title.toLowerCase().slice(0, 60); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 8);
  return { symbol: a.symbol, name: a.name, type: a.type || (isCrypto ? "CRYPTOCURRENCY" : "EQUITY"), price, coin, news };
}

// ---------------------------------------------------------------- Gemini
async function gemini(env, system, user, json = true, maxTokens = 2048, deadline = Date.now() + 20000) {
  let last;
  for (const model of MODELS) {
    const left = deadline - Date.now();
    if (left < 2500) break;
    const gc = { maxOutputTokens: maxTokens, temperature: 0.3 };
    if (json) gc.responseMimeType = "application/json";
    if (NO_THINK[model]) gc.thinkingConfig = { thinkingBudget: 0 };
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] },
                               contents: [{ role: "user", parts: [{ text: user }] }], generationConfig: gc }),
        signal: AbortSignal.timeout(Math.min(12000, left - 500)),
      });
      if (r.ok) {
        const j = await r.json();
        const parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
        const t = parts.filter(p => !p.thought).map(p => p.text || "").join("");
        if (t.trim()) return t;
        last = model + " empty";
      } else {
        last = `${model} HTTP ${r.status} ${(await r.text()).slice(0, 120)}`;
      }
    } catch (e) { last = `${model} ${e.name || e}`; }
    console.log("gemini fallback:", last);
  }
  throw new Error("Gemini failed: " + last);
}

// Gemini + live Google Search (free tier: 2.5 Flash / Flash-Lite). Returns {text, sources}.
async function geminiSearch(env, system, user, deadline) {
  let last;
  for (const model of ["gemini-2.5-flash", "gemini-2.5-flash-lite"]) {
    const left = deadline - Date.now();
    if (left < 4000) break;
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          tools: [{ google_search: {} }],
          generationConfig: { maxOutputTokens: 1200, temperature: 0.3, thinkingConfig: { thinkingBudget: 0 } },
        }),
        signal: AbortSignal.timeout(Math.min(16000, left - 500)),
      });
      if (r.ok) {
        const j = await r.json();
        const c = (j.candidates || [])[0] || {};
        const text = ((c.content || {}).parts || []).filter(p => !p.thought).map(p => p.text || "").join("").trim();
        const chunks = ((c.groundingMetadata || {}).groundingChunks || []).map(g => g.web && (g.web.title || g.web.domain)).filter(Boolean);
        if (text) return { text, sources: [...new Set(chunks)].slice(0, 5) };
        last = model + " empty";
      } else last = `${model} HTTP ${r.status} ${(await r.text()).slice(0, 120)}`;
    } catch (e) { last = `${model} ${e.name || e}`; }
    console.log("search fallback:", last);
  }
  throw new Error("grounded Gemini failed: " + last);
}

function extractJSON(t) {
  t = t.replace(/```(?:json)?/g, "").trim();
  const i = Math.min(...["{", "["].map(c => (t.indexOf(c) + 1 || 1e9) - 1));
  const j = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  return JSON.parse(t.slice(i, j + 1));
}

const INTENT_SYSTEM = `You route WhatsApp messages (Moroccan Darija in Arabic script or Latin letters, French or English) for a markets assistant.
Return ONLY JSON: {"type":"asset"|"chat","queries":["..."],"reply":"..."}
- type "asset" if the user asks about any stock, ETF, index, cryptocurrency/token/memecoin, commodity or FX pair.
  queries = up to 2 search strings in English to find each asset on Yahoo Finance / CoinGecko: the official company or coin name, or its ticker if you are sure (e.g. "Nvidia", "Pepe coin", "Hyperliquid", "Rivian", "S&P 500", "gold").
  Transliterate Arabic-script names (e.g. "سولانا" -> "Solana", "علي بابا" -> "Alibaba").
- type "chat" otherwise (greetings, help, unclear). reply = short helpful Darija answer (Arabic script) saying they can send any stock or crypto name for an analysis.`;

const ALIASES = [
  [/\b(btc|bitcoin|bitcoine)\b|بيتكوين|بتكوين/i, "BTC-USD", "Bitcoin"], [/\b(eth|ethereum|ether)\b|إيثيريوم|ايثريوم|إيثريوم/i, "ETH-USD", "Ethereum"],
  [/\b(sol|solana)\b|سولانا/i, "SOL-USD", "Solana"], [/\b(xrp|ripple)\b|ريبل/i, "XRP-USD", "XRP"], [/\b(bnb|binance coin)\b/i, "BNB-USD", "BNB"],
  [/\b(doge|dogecoin)\b|دوج/i, "DOGE-USD", "Dogecoin"], [/\b(ada|cardano)\b/i, "ADA-USD", "Cardano"],
  [/\bnvidia\b|نفيديا|انفيديا|إنفيديا/i, "NVDA", "Nvidia"], [/\btesla\b|تسلا|تيسلا/i, "TSLA", "Tesla"], [/\bapple\b|آبل/i, "AAPL", "Apple"],
  [/\bmicrosoft\b|مايكروسوفت/i, "MSFT", "Microsoft"], [/\bamazon\b|أمازون|امازون/i, "AMZN", "Amazon"], [/\b(meta|facebook)\b|ميتا|فيسبوك/i, "META", "Meta"],
  [/\b(google|alphabet)\b|جوجل|غوغل/i, "GOOGL", "Alphabet"], [/\bnetflix\b|نتفليكس/i, "NFLX", "Netflix"], [/\bamd\b/i, "AMD", "AMD"],
  [/\b(coinbase)\b|كوينبيس/i, "COIN", "Coinbase"], [/\b(microstrategy|strategy mstr)\b/i, "MSTR", "Strategy"], [/\bpalantir\b/i, "PLTR", "Palantir"],
  [/\b(s&p|sp500|s&p 500|spx)\b/i, "^GSPC", "S&P 500"], [/\bnasdaq\b|ناسداك/i, "^IXIC", "Nasdaq"], [/\b(dow|dow jones)\b/i, "^DJI", "Dow Jones"],
  [/\b(gold|xau)\b|الذهب|الدهب/i, "GC=F", "Gold"], [/\b(oil|petrole|pétrole|wti)\b|البترول|النفط/i, "CL=F", "Crude oil"],
  [/\b(eurusd|eur\/usd)\b/i, "EURUSD=X", "EUR/USD"],
];

export function localSymbols(text) {
  const out = [], names = {}, alias = {}, types = {};
  for (const [re, sym, name] of ALIASES) if (re.test(text) && !out.includes(sym)) {
    out.push(sym); names[sym] = name; alias[sym] = true;
    types[sym] = sym.endsWith("-USD") ? "CRYPTOCURRENCY" : sym.startsWith("^") ? "INDEX" : sym.includes("=") ? "FUTURE" : "EQUITY";
  }
  for (const m of text.matchAll(/\$?\b([A-Z]{2,5})\b/g)) {           // explicit tickers like TSLA, $PLTR
    const t = m[1];
    if (!out.includes(t) && !["USD", "ETF", "CEO", "IPO", "SEC", "FED", "AI", "OK"].includes(t) && !out.some(x => x.startsWith(t))) { out.push(t); names[t] = t; }
  }
  return out.length ? { type: "asset", symbols: out.slice(0, 2), names, alias, types } : null;
}

async function understand(text, env, deadline) {
  const local = localSymbols(text);
  const assets = [];
  if (local) {
    for (const sym of local.symbols) {
      if (local.alias[sym]) assets.push({ symbol: sym, name: local.names[sym], type: local.types[sym] });
      else { const r = await resolveAsset(sym); if (r) assets.push(r); }       // explicit ticker -> verify / map crypto
    }
    if (assets.length) return { type: "asset", assets };
  }
  let j;
  try { j = extractJSON(await gemini(env, INTENT_SYSTEM, text, true, 250, Math.min(deadline - 15000, Date.now() + 6000))); }
  catch (e) { console.log("intent error", e && e.message); j = { type: "asset", queries: [text.replace(/[^\p{L}\p{N}$ .&-]/gu, " ").trim()] }; }
  if (j.type !== "asset") return j;
  const found = await Promise.all((j.queries || []).slice(0, 2).map(q => resolveAsset(q)));
  const uniq = [];
  for (const f of found) if (f && !uniq.some(u => u.symbol === f.symbol)) uniq.push(f);
  return uniq.length ? { type: "asset", assets: uniq }
                     : { type: "chat", reply: "ما لقيتش هاد السهم ولا العملة 🤔 جرب تكتب السمية بالإنجليزية ولا الـticker (مثلا: Solana ولا SOL)." };
}

// Find any stock / ETF / index / crypto by name or ticker. Yahoo Finance search first, CoinGecko for the long tail of coins.
const OK_TYPES = ["EQUITY", "ETF", "CRYPTOCURRENCY", "INDEX", "FUTURE", "CURRENCY", "MUTUALFUND"];
export async function resolveAsset(q) {
  q = String(q || "").trim();
  if (!q) return null;
  try {
    const r = await fetch(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`, { headers: UA, signal: AbortSignal.timeout(4000) });
    if (r.ok) {
      const quotes = ((await r.json()).quotes || []).filter(x => OK_TYPES.includes(x.quoteType));
      const exact = quotes.find(x => x.symbol.toUpperCase() === q.toUpperCase() || x.symbol.toUpperCase() === q.toUpperCase() + "-USD");
      const best = exact || quotes[0];
      if (best) return { symbol: best.symbol, name: best.longname || best.shortname || best.symbol, type: best.quoteType };
    }
  } catch (e) { console.log("yahoo search error", e && e.message); }
  const cg = await coingeckoSearch(q);
  if (cg) return { symbol: cg.symbol.toUpperCase() + "-USD", name: cg.name, type: "CRYPTOCURRENCY", cgId: cg.id };
  return null;
}

async function coingeckoSearch(q) {
  try {
    const r = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`, { headers: UA, signal: AbortSignal.timeout(4000) });
    if (!r.ok) return null;
    const coins = (await r.json()).coins || [];
    const exact = coins.find(c => c.symbol.toLowerCase() === q.toLowerCase() || c.name.toLowerCase() === q.toLowerCase());
    return exact || coins[0] || null;   // CoinGecko sorts by market cap rank
  } catch { return null; }
}

const ANALYSIS_SYSTEM = `You are a careful markets analyst replying on WhatsApp to a Moroccan trader, in Moroccan Darija (Arabic script). Keep tickers and technical terms in Latin letters (support, resistance, RSI, earnings, ETF...).
You receive the user's question plus DATA (live prices + indicators from Yahoo/CoinGecko, coin stats, recent headlines from Yahoo Finance and Google News).
If you have a Google Search tool, use it to check the latest news and upcoming catalysts for the asset (earnings date, product events, token unlocks, ETF/regulation news, macro) from reputable sources.
Use ONLY facts from DATA or from your search results; never invent prices, dates, levels or facts. Prices and levels must come from DATA. If something is still unknown, say so.
NEVER tell the user to buy or sell, and never say "now is the time to buy". The user wants to decide himself. Give the information a decision needs.
Format (WhatsApp, <= 1300 characters, short lines, emojis as section markers):
🤖 *<asset> — تحليل*
💵 الثمن دابا + التغير (1 نهار / 1 سيمانة / 1 شهر)
📈 الاتجاه: (فوق/تحت SMA20 و SMA50، شنو كيعني)
🧱 المستويات: support و resistance من الداتا
📰 الأخبار والأحداث الجاية: 2-4 نقط (من الداتا والبحث) وتأثيرها المحتمل
🪙 للكريبتو فقط: الترتيب، الـmarket cap، وبعدو على الـATH
⚠️ المخاطر: 2 نقط
🔀 السيناريوهات: "إلا طلع فوق X ... / إلا هبط تحت Y ..."
🧭 شنو تراقب قبل ما تقرر: 2-3 نقط (مثلا تأكيد الكسر، earnings، الفيد، حجم التداول)
End with exactly: "ℹ️ هادا تحليل ماشي نصيحة شراء ولا بيع — القرار ديالك."`;

async function analyse(question, data, env, deadline = Date.now() + 20000) {
  const user = `QUESTION: ${question}\n\nDATA:\n${JSON.stringify(data, null, 1)}`;
  try {
    let t, sources = [];
    try {
      const g = await geminiSearch(env, ANALYSIS_SYSTEM, user, deadline - 1500);
      t = g.text; sources = g.sources;
    } catch (e) {
      console.log("no search, plain analysis:", e && e.message);
      t = await gemini(env, ANALYSIS_SYSTEM, user, false, 900, deadline - 1500);
    }
    t = t.trim();
    if (sources.length) t += "\n\n🔗 المصادر: " + sources.join(" · ");
    if (!t.includes("القرار ديالك")) t += "\n\nℹ️ هادا تحليل ماشي نصيحة شراء ولا بيع — القرار ديالك.";
    return t.slice(0, 3500);
  } catch (e) {
    console.log("analysis fallback:", e && e.message);
    const lines = data.map(d => {
      const p = d.price || {};
      if (p.error) return `• ${d.symbol}: ما لقيتش الثمن دابا`;
      const trend = p.sma20 && p.sma50 ? (p.last > p.sma20 && p.sma20 > p.sma50 ? "طالع 📈" : p.last < p.sma20 && p.sma20 < p.sma50 ? "هابط 📉" : "متردد ↔️") : "؟";
      return `*${d.symbol}*: ${p.last} ${p.currency || ""}\nاليوم ${p.chg1d}% · سيمانة ${p.chg5d}% · شهر ${p.chg1m}%\nالاتجاه: ${trend} (SMA20 ${p.sma20} / SMA50 ${p.sma50})\nRSI14: ${p.rsi14}\nsupport ${p.support20} · resistance ${p.resistance20}` +
             (d.news && d.news.length ? `\n📰 ${d.news.slice(0, 2).map(n => n.title).join("\n📰 ")}` : "");
    });
    return `🤖 الأرقام (التحليل الكامل ما وصلش فالوقت، Gemini مشغول):\n\n${lines.join("\n\n")}\n\nℹ️ هادا ماشي نصيحة شراء ولا بيع — القرار ديالك.`;
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

async function priceData(symbol, allowStooq = true) {
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=6mo&interval=1d`, { headers: UA, signal: AbortSignal.timeout(5000) });
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
  if (allowStooq) try { // fallback: Stooq daily CSV
    const s = symbol.endsWith("-USD") ? symbol.replace("-USD", "usd").toLowerCase() : symbol.toLowerCase() + ".us";
    const r = await fetch(`https://stooq.com/q/d/l/?s=${s}&i=d`, { headers: UA, signal: AbortSignal.timeout(4000) });
    const rows = (await r.text()).trim().split("\n").slice(1).map(l => l.split(",")).filter(x => x.length >= 5).slice(-130);
    if (rows.length) return summarize(symbol, rows.map(x => +x[4]), rows.map(x => +x[2]), rows.map(x => +x[3]), { asOf: rows[rows.length - 1][0] });
  } catch (e) { console.log("stooq error", e); }
  return { symbol, error: "price data unavailable" };
}

async function headlines(symbol, name) {
  const q = encodeURIComponent(`${name || symbol.replace("-USD", "").replace("^", "")} ${symbol.includes("-USD") ? "crypto" : "stock"} when:3d`);
  try {
    const r = await fetch(`https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`, { headers: UA, signal: AbortSignal.timeout(4000) });
    if (!r.ok) return [];
    const x = await r.text();
    return [...x.matchAll(/<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<pubDate>([\s\S]*?)<\/pubDate>/g)]
      .slice(0, 6).map(m => ({ title: m[1].replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"'), date: m[2] }));
  } catch { return []; }
}

async function yahooNews(q) {
  try {
    const r = await fetch(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=0&newsCount=8`, { headers: UA, signal: AbortSignal.timeout(4000) });
    if (!r.ok) return [];
    return ((await r.json()).news || []).map(n => ({ title: n.title, source: n.publisher,
      date: n.providerPublishTime ? new Date(n.providerPublishTime * 1000).toISOString() : null }));
  } catch { return []; }
}

async function coinInfo(a) {
  try {
    let id = a.cgId;
    if (!id) { const s = await coingeckoSearch(a.name && !/^[A-Z0-9]+-USD$/.test(a.name) ? a.name.replace(/ USD$/i, "") : a.symbol.replace("-USD", "")); id = s && s.id; }
    if (!id) return null;
    const r = await fetch(`https://api.coingecko.com/api/v3/coins/${id}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false`, { headers: UA, signal: AbortSignal.timeout(4500) });
    if (!r.ok) return { cgId: id };
    const c = await r.json(), m = c.market_data || {};
    return { cgId: id, name: c.name, rank: c.market_cap_rank, priceUsd: m.current_price && m.current_price.usd,
      marketCapUsd: m.market_cap && m.market_cap.usd, volume24hUsd: m.total_volume && m.total_volume.usd,
      chg24h: m.price_change_percentage_24h, chg7d: m.price_change_percentage_7d, chg30d: m.price_change_percentage_30d,
      athUsd: m.ath && m.ath.usd, fromAthPct: m.ath_change_percentage && m.ath_change_percentage.usd,
      circulating: m.circulating_supply, maxSupply: m.max_supply, categories: (c.categories || []).slice(0, 3) };
  } catch { return null; }
}

async function coinPrice(id, symbol) {
  try {
    const r = await fetch(`https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=180&interval=daily`, { headers: UA, signal: AbortSignal.timeout(4500) });
    if (!r.ok) return { symbol, error: "price data unavailable" };
    const p = ((await r.json()).prices || []).map(x => x[1]);
    return summarize(symbol, p, p, p, { currency: "USD", asOf: new Date().toISOString() });
  } catch { return { symbol, error: "price data unavailable" }; }
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
