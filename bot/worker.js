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
// Google retires model names over time (2.5 is already closed to new accounts), so we ask the API
// which Flash / Flash-Lite models this key can use and try them fastest-first.
const FALLBACK_MODELS = ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.6-flash"];
let MODEL_CACHE = null, MODEL_CACHE_AT = 0;
const NO_THINK = {}; // thinking is only disabled where the model is known to accept thinkingBudget:0

export function rankModels(names) {
  const ok = names.map(n => n.replace(/^models\//, ""))
    .filter(n => /^gemini-\d+(\.\d+)?-flash(-lite)?(-latest)?$/.test(n) && parseFloat(n.slice(7)) >= 3);
  const ver = n => parseFloat(n.match(/^gemini-(\d+(?:\.\d+)?)/)[1]);
  // lite first (fastest), newest version first within each group
  return ok.sort((a, b) => (/-lite/.test(b) - /-lite/.test(a)) || ver(b) - ver(a));
}

async function models(env) {
  if (MODEL_CACHE && Date.now() - MODEL_CACHE_AT < 6 * 3600e3) return MODEL_CACHE;
  try {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200",
      { headers: { "x-goog-api-key": env.GEMINI_API_KEY }, signal: AbortSignal.timeout(3000) });
    if (r.ok) {
      const list = ((await r.json()).models || []).filter(m => (m.supportedGenerationMethods || []).includes("generateContent")).map(m => m.name);
      const ranked = rankModels(list);
      if (ranked.length) { MODEL_CACHE = ranked.slice(0, 6); MODEL_CACHE_AT = Date.now(); console.log("models:", MODEL_CACHE.join(", ")); return MODEL_CACHE; }
    }
  } catch (e) { console.log("model list error", e && e.message); }
  return FALLBACK_MODELS;
}
const BUDGET_MS = 25000;
const UA = { "User-Agent": "Mozilla/5.0 (MarketQABot)" };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return api(request, url, env);
    if (request.method === "GET") return new Response("market-qa-bot ok");
    if (request.method !== "POST") return new Response("method not allowed", { status: 405 });
    let body;
    try { body = await request.json(); } catch { return new Response("bad json", { status: 400 }); }
    const msg = parseWebhook(body, env);
    if (msg) ctx.waitUntil(handle(msg, env).catch(e => console.log("handle error", e && e.stack || e)));
    return new Response("ok"); // answer Green-API immediately; work continues in background
  },
};

// ---------------------------------------------------------------- mobile app API (prototype)
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type,X-App" };
const LANGS = ["darija", "ar", "fr", "en"];
const HITS = new Map(); // naive per-IP limiter (per isolate) to protect the free AI quota

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...CORS } });
}

function limited(ip, max = 30, windowMs = 10 * 60e3) {
  const now = Date.now(), arr = (HITS.get(ip) || []).filter(t => now - t < windowMs);
  arr.push(now); HITS.set(ip, arr);
  if (HITS.size > 5000) HITS.clear();
  return arr.length > max;
}

export async function api(request, url, env) {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (!["kimmarket", "nabd"].includes(request.headers.get("X-App"))) return json({ error: "unauthorized" }, 401);
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  try {
    if (url.pathname === "/api/chat" && request.method === "POST") {
      if (limited(ip)) return json({ error: "rate_limited" }, 429);
      const b = await request.json().catch(() => ({}));
      const text = String(b.text || "").trim().slice(0, 600);
      const lang = LANGS.includes(b.lang) ? b.lang : "darija";
      if (!text) return json({ error: "empty" }, 400);
      return json({ reply: await answer(text, env, lang) });
    }
    if (url.pathname === "/api/search") {
      return json({ results: await searchAssets(url.searchParams.get("q") || "") });
    }
    if (url.pathname === "/api/chart") {
      const sym = (url.searchParams.get("symbol") || "").toUpperCase().trim();
      const range = ["5d", "1mo", "3mo", "1y"].includes(url.searchParams.get("range")) ? url.searchParams.get("range") : "1mo";
      if (!/^[\^A-Z0-9.=\-]{1,20}$/.test(sym)) return json({ error: "bad_symbol" }, 400);
      return json(await chartData(sym, range, url.searchParams.get("cg") || ""));
    }
    if (url.pathname === "/api/resolve") {
      const r = await resolveAsset(url.searchParams.get("q") || "");
      return json({ asset: r });
    }
    if (url.pathname === "/api/quote") {
      const syms = (url.searchParams.get("symbols") || "").split(",").map(s => s.trim().toUpperCase()).filter(s => /^[\^A-Z0-9.=\-]{1,20}$/.test(s)).slice(0, 15);
      const out = await Promise.all(syms.map(async s => {
        const p = await priceData(s, !s.endsWith("-USD"));
        return { symbol: s, last: p.last ?? null, chg1d: p.chg1d ?? null, chg1m: p.chg1m ?? null, currency: p.currency || "USD", error: p.error || null };
      }));
      return json({ quotes: out });
    }
    if (url.pathname === "/api/alerts") {
      const r = await fetch(env.STATE_URL || "https://raw.githubusercontent.com/shopecom11992-ctrl/market-alerts/main/state/state.json", { headers: UA, signal: AbortSignal.timeout(5000) });
      const st = r.ok ? await r.json() : {};
      const alerts = (st.alerts || []).filter(a => a.title).slice(-40).reverse()
        .map(a => ({ title: a.title, link: a.link, ts: a.ts, msg: a.msg || null, impact: a.impact || null, ideas: Array.isArray(a.ideas) ? a.ideas.slice(0, 4) : [] }));
      return json({ alerts });
    }
    return json({ error: "not_found" }, 404);
  } catch (e) {
    console.log("api error", e && e.stack || e);
    return json({ error: "server_error" }, 500);
  }
}

// Same brain as the WhatsApp bot, returning the text instead of sending it.
export async function answer(text, env, lang = "darija") {
  const deadline = Date.now() + BUDGET_MS;
  const intent = await understand(text, env, deadline);
  if (intent.type === "chat" || !intent.assets || !intent.assets.length) {
    return HELP[lang] && (!intent.reply || lang !== "darija") ? HELP[lang] : (intent.reply || HELP.darija);
  }
  const data = await Promise.all(intent.assets.slice(0, 2).map(gather));
  return analyse(text, data, env, deadline, lang);
}

const HELP = {
  darija: "صيفط ليا سمية سهم ولا عملة (مثلا: Nvidia، BTC، PEPE، واش مزيان نشري Tesla دابا؟) ونعطيك تحليل.",
  ar: "أرسل اسم سهم أو عملة رقمية (مثلاً: Nvidia أو BTC أو هل Tesla مناسبة الآن؟) وسأعطيك تحليلاً.",
  fr: "Envoie le nom d'une action ou d'une crypto (ex. : Nvidia, BTC, « Tesla, c'est le moment ? ») et je te donne une analyse.",
  en: "Send me a stock or crypto name (e.g. Nvidia, BTC, \"is Tesla a buy now?\") and I'll give you an analysis.",
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
    send(env, msg.chat, `🤖 كنجمع المعلومات على ${assets.map(a => (a.name || a.symbol).replace(/ USD$/, "")).join(" و ")} (الثمن، المؤشرات، الأخبار من بزاف ديال المصادر)...`),
    Promise.all(assets.map(gather)),
  ]);
  const answer = await analyse(msg.text, data, env, deadline);
  await send(env, msg.chat, answer);
}

// Collect everything we can about one asset, from several sources in parallel.
async function gather(a) {
  const isCrypto = a.type === "CRYPTOCURRENCY" || /-USD$/.test(a.symbol) || !!a.cgId;
  const [px, gnews, ynews, coin, rss] = await Promise.all([
    priceData(a.symbol, !isCrypto),           // crypto falls back to CoinGecko instead of Stooq
    headlines(a.symbol, a.name),
    yahooNews(a.name || a.symbol),
    isCrypto ? coinInfo(a) : Promise.resolve(null),
    outletNews(a, isCrypto),
  ]);
  let price = px;
  if (price.error && isCrypto && coin && coin.cgId) price = await coinPrice(coin.cgId, a.symbol); // tiny coins not on Yahoo
  const seen = new Set();
  const news = [...ynews, ...rss, ...gnews].filter(n => { const k = n.title.toLowerCase().slice(0, 60); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 8);
  return { symbol: a.symbol, name: a.name, type: a.type || (isCrypto ? "CRYPTOCURRENCY" : "EQUITY"), price, coin, news };
}

// ---------------------------------------------------------------- Gemini
async function gemini(env, system, user, json = true, maxTokens = 2048, deadline = Date.now() + 20000) {
  let last;
  const list = await models(env);
  for (let round = 0; round < 4; round++) {           // free tier often answers 503 "high demand" for a few seconds
    for (const model of list) {
      const left = deadline - Date.now();
      if (left < 2500) throw new Error("Gemini failed: " + last);
      const gc = { maxOutputTokens: maxTokens, temperature: 0.3 };
      if (json) gc.responseMimeType = "application/json";
      if (NO_THINK[model]) gc.thinkingConfig = { thinkingBudget: 0 };
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
          body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] },
                                 contents: [{ role: "user", parts: [{ text: user }] }], generationConfig: gc }),
          signal: AbortSignal.timeout(Math.min(json ? 6000 : 12000, left - 500)),
        });
        if (r.ok) {
          const j = await r.json();
          const parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
          const t = parts.filter(p => !p.thought).map(p => p.text || "").join("");
          if (t.trim()) return t;
          last = model + " empty";
        } else {
          last = `${model} HTTP ${r.status} ${(await r.text()).slice(0, 120)}`;
          if (r.status === 404 && MODEL_CACHE) MODEL_CACHE = MODEL_CACHE.filter(m => m !== model);
          if (r.status === 400 || r.status === 403) throw new Error("Gemini failed: " + last); // bad key / request: retrying won't help
        }
      } catch (e) {
        if (String(e.message || "").startsWith("Gemini failed")) throw e;
        last = `${model} ${e.name || e}`;
      }
      console.log("gemini fallback:", last);
    }
    await new Promise(r => setTimeout(r, 1200 * (round + 1)));
  }
  throw new Error("Gemini failed: " + last);
}

// Second brain: Cloudflare Workers AI (free daily allowance), used when Gemini is overloaded.
const CF_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
async function workersAI(env, system, user, deadline) {
  if (!env.AI) throw new Error("Workers AI binding not configured");
  const left = deadline - Date.now();
  if (left < 3000) throw new Error("no time left for Workers AI");
  const run = env.AI.run(CF_MODEL, { messages: [{ role: "system", content: system }, { role: "user", content: user }], max_tokens: 900, temperature: 0.3 });
  const out = await Promise.race([run, new Promise((_, rej) => setTimeout(() => rej(new Error("Workers AI timeout")), left - 500))]);
  const t = (out && (out.response || (out.result && out.result.response))) || "";
  if (!String(t).trim()) throw new Error("Workers AI empty");
  return String(t);
}

// Gemini + live Google Search (free tier: 2.5 Flash / Flash-Lite). Returns {text, sources}.
async function geminiSearch(env, system, user, deadline) {
  let last;
  for (const model of (env.SEARCH_MODELS || "gemini-3.5-flash").split(",")) {
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
  try { j = extractJSON(await gemini(env, INTENT_SYSTEM, text, true, 250, Math.min(deadline - 15000, Date.now() + 7000))); }
  catch (e) { console.log("intent error", e && e.message); j = { type: "asset", queries: candidateWords(text) }; }
  if (j.type !== "asset") return j;
  const found = await Promise.all((j.queries || []).slice(0, 2).map(q => resolveAsset(q)));
  const uniq = [];
  for (const f of found) if (f && !uniq.some(u => u.symbol === f.symbol)) uniq.push(f);
  return uniq.length ? { type: "asset", assets: uniq }
                     : { type: "chat", reply: "ما لقيتش هاد السهم ولا العملة 🤔 جرب تكتب السمية بالإنجليزية ولا الـticker (مثلا: Solana ولا SOL)." };
}

const STOP = new Set(("salam slm labas bikhir mrhba marhba hello hi hey merci chokran choukran 3afak afak kat9ol katgol kat9oul katqol t9ol tgol 9ol gol chno chnou achno wach was mzyan mezyan mzyana nchri nbi3 nbe3 daba db dyal dial dyali f fi fl w wa l lia lik 3la ala ach kifach kifash bghit bgit n3rf chi chy had hadi hada howa hiya ana nta nti khasni wla ola walla ghadi ghaytl3 ytla3 yhbt tal3 hab6 akhbar khbar jdid " +
  "the what is are about how buy sell now should i price stock stocks crypto coin token analyse analyze analysis stp svp please news today tell me give info on of and or for to a an").split(" "));
export function candidateWords(text) {
  return [...new Set((text.toLowerCase().match(/[a-z][a-z0-9.&-]{2,}/g) || []).filter(w => !STOP.has(w)))].slice(0, 3);
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

// Several matches for the app's search box: stocks/ETFs/indices from Yahoo + coins from CoinGecko.
const TYPE_LABEL = { EQUITY: "stock", ETF: "etf", CRYPTOCURRENCY: "crypto", INDEX: "index", FUTURE: "commodity", CURRENCY: "fx", MUTUALFUND: "fund" };
export async function searchAssets(q) {
  q = String(q || "").trim().slice(0, 40);
  if (!q) return [];
  const [y, cg] = await Promise.all([
    fetch(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0`, { headers: UA, signal: AbortSignal.timeout(4000) })
      .then(r => r.ok ? r.json() : {}).then(j => (j.quotes || []).filter(x => OK_TYPES.includes(x.quoteType))).catch(() => []),
    fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`, { headers: UA, signal: AbortSignal.timeout(4000) })
      .then(r => r.ok ? r.json() : {}).then(j => (j.coins || []).slice(0, 6)).catch(() => []),
  ]);
  const out = [];
  const seen = new Set();
  const push = (o) => { const k = o.symbol.toUpperCase(); if (!seen.has(k)) { seen.add(k); out.push(o); } };
  for (const c of cg) {
    const yq = y.find(x => x.quoteType === "CRYPTOCURRENCY" && x.symbol.toUpperCase().replace(/\d+-USD$/, "-USD") === c.symbol.toUpperCase() + "-USD");
    push({ symbol: yq ? yq.symbol : c.symbol.toUpperCase() + "-USD", name: c.name, type: "crypto", rank: c.market_cap_rank || null, cgId: c.id, base: c.symbol.toUpperCase(), thumb: c.thumb || null });
  }
  for (const x of y) {
    if (x.quoteType === "CRYPTOCURRENCY" && out.some(o => o.symbol === x.symbol)) continue;
    push({ symbol: x.symbol, name: x.longname || x.shortname || x.symbol, type: TYPE_LABEL[x.quoteType] || "other", exchange: x.exchDisp || x.exchange || null,
           base: x.quoteType === "CRYPTOCURRENCY" ? x.symbol.replace(/-USD$/, "").replace(/\d+$/, "") : null });
  }
  // exact ticker / name matches first, then crypto by market-cap rank, then the rest
  const ql = q.toLowerCase();
  const score = o => (o.symbol.toLowerCase().replace("-usd", "") === ql || o.name.toLowerCase() === ql ? 0 : 1) * 1000 + (o.rank || 500);
  return out.sort((a, b) => score(a) - score(b)).slice(0, 12);
}

// Price history for the app's chart. Yahoo first; CoinGecko for coins Yahoo doesn't list.
export async function chartData(symbol, range, cgId) {
  const interval = { "5d": "30m", "1mo": "1d", "3mo": "1d", "1y": "1d" }[range];
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`, { headers: UA, signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      const res = ((await r.json()).chart || {}).result;
      if (res && res[0]) {
        const ts = res[0].timestamp || [], cl = res[0].indicators.quote[0].close || [];
        const pts = ts.map((t, i) => [t * 1000, cl[i]]).filter(p => typeof p[1] === "number").map(p => [p[0], nice(p[1])]);
        if (pts.length > 1) return { symbol, range, currency: res[0].meta.currency || "USD", last: nice(res[0].meta.regularMarketPrice ?? pts[pts.length - 1][1]), points: pts, src: "Yahoo Finance" };
      }
    }
  } catch (e) { console.log("chart yahoo error", e && e.message); }
  try {
    let id = cgId;
    if (!id && symbol.endsWith("-USD")) { const c = await coingeckoSearch(symbol.replace(/-USD$/, "").replace(/\d+$/, "")); id = c && c.id; }
    if (id) {
      const days = { "5d": 5, "1mo": 30, "3mo": 90, "1y": 365 }[range];
      const r = await fetch(`https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`, { headers: UA, signal: AbortSignal.timeout(5000) });
      if (r.ok) {
        const pts = ((await r.json()).prices || []).map(p => [p[0], nice(p[1])]);
        if (pts.length > 1) return { symbol, range, currency: "USD", last: pts[pts.length - 1][1], points: pts.length > 400 ? pts.filter((_, i) => i % Math.ceil(pts.length / 400) === 0) : pts, src: "CoinGecko" };
      }
    }
  } catch (e) { console.log("chart cg error", e && e.message); }
  return { symbol, range, points: [], error: "chart_unavailable" };
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

const ANALYSIS_SYSTEM = `You are a careful markets analyst replying to a Moroccan trader, in Moroccan Darija (Arabic script). Keep tickers and technical terms in Latin letters (support, resistance, RSI, earnings, ETF...).
You receive the user's question plus DATA (live prices + indicators from Yahoo/CoinGecko, coin stats, recent headlines from Yahoo Finance and Google News).
If you have a Google Search tool, use it to check the latest news and upcoming catalysts for the asset (earnings date, product events, token unlocks, ETF/regulation news, macro) from reputable sources.
Use ONLY facts from DATA or from your search results; never invent prices, dates, levels or facts. Prices and levels must come from DATA. If something is still unknown, say so.
NEVER tell the user to buy or sell, and never say "now is the time to buy". The user wants to decide himself. Give the information a decision needs.
Format (WhatsApp, <= 1300 characters, short lines, emojis as section markers):
🤖 *<asset> — تحليل*
💵 الثمن دابا + التغير (1 نهار / 1 سيمانة / 1 شهر)
📈 الاتجاه: (فوق/تحت SMA20 و SMA50، شنو كيعني)
🧱 المستويات: support و resistance من الداتا
📰 الأخبار: 2-4 نقط من العناوين (اذكر المصدر بين قوسين) وتأثيرها المحتمل
🪙 للكريبتو فقط: الترتيب، الـmarket cap، وبعدو على الـATH
⚠️ المخاطر: 2 نقط
🔀 السيناريوهات: "إلا طلع فوق X ... / إلا هبط تحت Y ..."
🧭 شنو تراقب قبل ما تقرر: 2-3 نقط (مثلا تأكيد الكسر، earnings، الفيد، حجم التداول)
End with exactly: "ℹ️ هادا تحليل ماشي نصيحة شراء ولا بيع — القرار ديالك."`;

const LANG_RULE = {
  darija: "",
  ar: "\nIMPORTANT: Write the whole answer in Modern Standard Arabic (فصحى), not Darija. Translate the section labels and the final disclaimer to MSA (\"هذا تحليل وليس نصيحة شراء أو بيع — القرار لك.\").",
  fr: "\nIMPORTANT: Write the whole answer in French. Translate the section labels and end with exactly: \"ℹ️ Ceci est une analyse, pas un conseil d'achat ou de vente — la décision t'appartient.\"",
  en: "\nIMPORTANT: Write the whole answer in English. Translate the section labels and end with exactly: \"ℹ️ This is analysis, not a buy or sell recommendation — the decision is yours.\"",
};
const DISCLAIMER = { darija: "القرار ديالك", ar: "القرار لك", fr: "la décision t'appartient", en: "the decision is yours" };
const DISCLAIMER_FULL = {
  darija: "ℹ️ هادا تحليل ماشي نصيحة شراء ولا بيع — القرار ديالك.",
  ar: "ℹ️ هذا تحليل وليس نصيحة شراء أو بيع — القرار لك.",
  fr: "ℹ️ Ceci est une analyse, pas un conseil d'achat ou de vente — la décision t'appartient.",
  en: "ℹ️ This is analysis, not a buy or sell recommendation — the decision is yours.",
};

async function analyse(question, data, env, deadline = Date.now() + 20000, lang = "darija") {
  const user = `QUESTION: ${question}\n\nDATA:\n${JSON.stringify(data, null, 1)}`;
  const SYS = ANALYSIS_SYSTEM + (LANG_RULE[lang] || "");
  try {
    let t, sources = [];
    try {
      if (env.GOOGLE_SEARCH !== "1") throw new Error("google search grounding disabled");
      const g = await geminiSearch(env, SYS, user, deadline - 1500);
      t = g.text; sources = g.sources;
    } catch (e) {
      console.log("no search, plain analysis:", e && e.message);
      try { t = await gemini(env, SYS, user, false, 900, env.AI ? Math.min(deadline - 12000, Date.now() + 9000) : deadline - 1500); }
      catch (e2) {
        console.log("gemini busy -> Workers AI:", e2 && e2.message);
        t = await workersAI(env, SYS, user, deadline - 500);
      }
    }
    t = t.trim();
    if (!sources.length) sources = [...new Set(data.flatMap(d => [d.price && !d.price.error ? d.price.src : null, d.coin ? "CoinGecko" : null, ...(d.news || []).map(n => n.source)]))].filter(Boolean).slice(0, 6);
    if (sources.length) t += "\n\n🔗 المصادر: " + sources.join(" · ");
    if (!t.includes(DISCLAIMER[lang] || DISCLAIMER.darija)) t += "\n\n" + (DISCLAIMER_FULL[lang] || DISCLAIMER_FULL.darija);
    return t.slice(0, 3500);
  } catch (e) {
    console.log("analysis fallback:", e && e.message);
    const L = RAW[lang] || RAW.darija;
    const lines = data.map(d => {
      const p = d.price || {};
      if (p.error) return `• ${d.symbol}: ${L.noPrice}`;
      const trend = p.sma20 && p.sma50 ? (p.last > p.sma20 && p.sma20 > p.sma50 ? L.up : p.last < p.sma20 && p.sma20 < p.sma50 ? L.down : L.flat) : "?";
      return `*${d.symbol}*: ${p.last} ${p.currency || ""}\n${L.day} ${p.chg1d}% · ${L.week} ${p.chg5d}% · ${L.month} ${p.chg1m}%\n${L.trend}: ${trend} (SMA20 ${p.sma20} / SMA50 ${p.sma50})\nRSI14: ${p.rsi14}\nsupport ${p.support20} · resistance ${p.resistance20}` +
             (d.news && d.news.length ? `\n📰 ${d.news.slice(0, 2).map(n => n.title).join("\n📰 ")}` : "");
    });
    return `🤖 ${L.head}\n\n${lines.join("\n\n")}\n\n${DISCLAIMER_FULL[lang] || DISCLAIMER_FULL.darija}`;
  }
}

const RAW = {
  darija: { head: "الأرقام (التحليل الكامل ما وصلش فالوقت، الذكاء الاصطناعي مشغول):", noPrice: "ما لقيتش الثمن دابا", up: "طالع 📈", down: "هابط 📉", flat: "متردد ↔️", day: "اليوم", week: "سيمانة", month: "شهر", trend: "الاتجاه" },
  ar: { head: "الأرقام (لم يكتمل التحليل في الوقت، الذكاء الاصطناعي مشغول):", noPrice: "السعر غير متاح الآن", up: "صاعد 📈", down: "هابط 📉", flat: "متذبذب ↔️", day: "اليوم", week: "أسبوع", month: "شهر", trend: "الاتجاه" },
  fr: { head: "Les chiffres (l'analyse complète n'est pas arrivée à temps, l'IA est surchargée) :", noPrice: "prix indisponible", up: "haussière 📈", down: "baissière 📉", flat: "indécise ↔️", day: "Jour", week: "Semaine", month: "Mois", trend: "Tendance" },
  en: { head: "The numbers (full analysis didn't arrive in time, the AI is busy):", noPrice: "price unavailable", up: "up 📈", down: "down 📉", flat: "sideways ↔️", day: "Day", week: "Week", month: "Month", trend: "Trend" },
};

// ---------------------------------------------------------------- market data
export function summarize(symbol, closes, highs, lows, meta = {}) {
  const c = closes.filter(x => typeof x === "number");
  if (c.length < 5) return { symbol, error: "not enough price data" };
  const last = meta.price ?? c[c.length - 1];
  const pct = n => c.length > n ? +(((last / c[c.length - 1 - n]) - 1) * 100).toFixed(2) : null;
  const sma = n => c.length >= n ? nice(c.slice(-n).reduce((a, b) => a + b, 0) / n) : null;
  const h = highs.filter(x => typeof x === "number"), l = lows.filter(x => typeof x === "number");
  const r14 = rsi(c, 14);
  return {
    symbol, currency: meta.currency || null, last: nice(+last),
    chg1d: pct(1), chg5d: pct(5), chg1m: pct(21), chg3m: pct(63),
    sma20: sma(20), sma50: sma(50), rsi14: r14,
    support20: l.length ? nice(Math.min(...l.slice(-20))) : null, resistance20: h.length ? nice(Math.max(...h.slice(-20))) : null,
    low6m: l.length ? nice(Math.min(...l)) : null, high6m: h.length ? nice(Math.max(...h)) : null,
    asOf: meta.asOf || null,
  };
}

// 2 decimals for normal prices, more significant digits for tiny coins (0.00001234)
export function nice(x) {
  if (typeof x !== "number" || !isFinite(x)) return null;
  const a = Math.abs(x);
  return a >= 1 ? +x.toFixed(2) : a === 0 ? 0 : +x.toPrecision(4);
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
        return Object.assign(summarize(symbol, q.close, q.high, q.low, { price: res.meta.regularMarketPrice, currency: res.meta.currency, asOf }), { src: "Yahoo Finance" });
      }
    }
  } catch (e) { console.log("yahoo error", e); }
  if (allowStooq) try { // fallback: Stooq daily CSV
    const s = symbol.endsWith("-USD") ? symbol.replace("-USD", "usd").toLowerCase() : symbol.toLowerCase() + ".us";
    const r = await fetch(`https://stooq.com/q/d/l/?s=${s}&i=d`, { headers: UA, signal: AbortSignal.timeout(4000) });
    const rows = (await r.text()).trim().split("\n").slice(1).map(l => l.split(",")).filter(x => x.length >= 5).slice(-130);
    if (rows.length) return Object.assign(summarize(symbol, rows.map(x => +x[4]), rows.map(x => +x[2]), rows.map(x => +x[3]), { asOf: rows[rows.length - 1][0] }), { src: "Stooq" });
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
      .slice(0, 6).map(m => { const t = m[1].replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"'); const pub = (t.match(/ - ([^-]+)$/) || [])[1]; return { title: t.replace(/ - [^-]+$/, ""), source: pub || "Google News", date: m[2] }; });
  } catch { return []; }
}

const OUTLETS = {
  crypto: [["CoinDesk", "https://www.coindesk.com/arc/outboundfeeds/rss/"], ["Cointelegraph", "https://cointelegraph.com/rss"], ["Decrypt", "https://decrypt.co/feed"]],
  stocks: [["CNBC", "https://www.cnbc.com/id/100003114/device/rss/rss.html"], ["MarketWatch", "https://feeds.content.dowjones.io/public/rss/mw_topstories"]],
};
// Headlines from specialist outlets that mention this asset (by name or ticker)
async function outletNews(a, isCrypto) {
  const base = (a.name || "").replace(/ (USD|Inc\.?|Corp\.?|Corporation|Holdings|Group|Ltd\.?|plc|Technologies|Automotive)$/gi, "").trim();
  const keys = [base, a.symbol.replace("-USD", "").replace("^", "")].filter(k => k && k.length >= 3).map(k => k.toLowerCase());
  if (!keys.length) return [];
  const lists = await Promise.all(OUTLETS[isCrypto ? "crypto" : "stocks"].map(async ([src, url]) => {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(3500) });
      if (!r.ok) return [];
      const x = await r.text();
      return [...x.matchAll(/<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<\/item>/g)]
        .map(m => m[1].replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').trim())
        .filter(t => keys.some(k => new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(t)))
        .slice(0, 3).map(title => ({ title, source: src }));
    } catch { return []; }
  }));
  return lists.flat();
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
    return Object.assign(summarize(symbol, p, p, p, { currency: "USD", asOf: new Date().toISOString() }), { src: "CoinGecko" });
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
