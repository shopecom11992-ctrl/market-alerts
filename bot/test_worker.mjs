// Offline tests for the WhatsApp Q&A worker: Gemini (+Google Search), Yahoo, CoinGecko, Google News and Green-API are mocked.
import worker, { parseWebhook, summarize, localSymbols, resolveAsset, rankModels, candidateWords, nice } from "./worker.js";
import assert from "node:assert/strict";

const env = { GEMINI_API_KEY: "g", GREENAPI_TOKEN: "t", GREENAPI_URL: "https://7107.api.greenapi.com",
              GREENAPI_INSTANCE: "710700000000", CHAT_ID: "212600000000" };
const sent = [];
const calls = [];
let yahooOk = true, geminiHang = false, searchOk = true, firstLite503 = false, intentDown = false, all503 = false;
const closes = Array.from({ length: 120 }, (_, i) => 100 + i * 0.5);

const YQ = { // Yahoo search: query -> quotes
  "rivian": [{ symbol: "RIVN", shortname: "Rivian Automotive", quoteType: "EQUITY" }],
  "pltr": [{ symbol: "PLTR", longname: "Palantir Technologies", quoteType: "EQUITY" }],
  "alibaba": [{ symbol: "BABA", longname: "Alibaba Group", quoteType: "EQUITY" }],
  "pepe coin": [], "pepe": [],
};

globalThis.fetch = async (url, opt = {}) => {
  url = String(url); calls.push(url);
  if (url.includes("generativelanguage") && url.includes("/models?")) {
    return Response.json({ models: ["gemini-2.5-flash", "gemini-3.1-flash-lite", "gemini-3.5-flash", "gemini-3.1-pro-preview"].map(n => ({ name: "models/" + n, supportedGenerationMethods: ["generateContent"] })) });
  }
  if (url.includes("generativelanguage")) {
    assert.ok(!url.includes("gemini-2.5"), "retired 2.5 models are never called");
    const b = JSON.parse(opt.body);
    const sys = b.systemInstruction.parts[0].text;
    if (geminiHang) return new Promise((_, rej) => opt.signal.addEventListener("abort", () => rej(Object.assign(new Error("timeout"), { name: "TimeoutError" }))));
    if (all503) return new Response('{"error":{"code":503,"message":"high demand"}}', { status: 503 });
    if (url.includes("2.5") && !b.tools) assert.equal(b.generationConfig.thinkingConfig.thinkingBudget, 0);
    if (sys.startsWith("You route")) {
      if (intentDown) return new Response("busy", { status: 503 });
      if (firstLite503 && url.includes("flash-lite")) { firstLite503 = false; return new Response("busy", { status: 503 }); }
      const q = b.contents[0].parts[0].text;
      const out = /salam/.test(q) ? { type: "chat", reply: "مرحبا! صيفط ليا سمية سهم ولا عملة." }
        : /بيبي|pepe/i.test(q) ? { type: "asset", queries: ["Pepe coin"] }
        : /علي بابا/.test(q) ? { type: "asset", queries: ["Alibaba"] }
        : /rivian/i.test(q) ? { type: "asset", queries: ["Rivian"] }
        : { type: "asset", queries: ["zzzz unknown"] };
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }] });
    }
    if (b.tools) { // grounded analysis
      assert.deepEqual(b.tools, [{ google_search: {} }]);
      if (!searchOk) return new Response("quota", { status: 429 });
      return Response.json({ candidates: [{ content: { parts: [{ text: "🤖 *تحليل مع البحث*\nℹ️ هادا تحليل ماشي نصيحة شراء ولا بيع — القرار ديالك." }] },
        groundingMetadata: { groundingChunks: [{ web: { title: "reuters.com" } }, { web: { title: "coindesk.com" } }, { web: { title: "reuters.com" } }] } }] });
    }
    return Response.json({ candidates: [{ content: { parts: [{ text: "🤖 *تحليل بلا بحث*\nℹ️ هادا تحليل ماشي نصيحة شراء ولا بيع — القرار ديالك." }] } }] });
  }
  if (url.includes("/v1/finance/search")) {
    if (!yahooOk) return new Response("no", { status: 429 });
    const u = new URL(url), q = (u.searchParams.get("q") || "").toLowerCase();
    if (u.searchParams.get("newsCount") === "8") return Response.json({ news: [{ title: `${q} headline from Yahoo`, publisher: "Reuters", providerPublishTime: 1795540000 }] });
    return Response.json({ quotes: YQ[q] ?? [] });
  }
  if (url.includes("/v8/finance/chart/")) {
    if (!yahooOk || url.includes("PEPE")) return new Response("no", { status: 404 });
    return Response.json({ chart: { result: [{ meta: { regularMarketPrice: 160, currency: "USD", regularMarketTime: 1795540000 },
      indicators: { quote: [{ close: closes, high: closes.map(x => x + 1), low: closes.map(x => x - 1) }] } }] } });
  }
  if (url.includes("coingecko.com/api/v3/search")) {
    const q = new URL(url).searchParams.get("query").toLowerCase();
    return Response.json({ coins: /pepe/.test(q) ? [{ id: "pepe", symbol: "PEPE", name: "Pepe" }] : /hyperliquid/.test(q) ? [{ id: "hyperliquid", symbol: "HYPE", name: "Hyperliquid" }] : [] });
  }
  if (/coindesk|cointelegraph|decrypt\.co|cnbc|dowjones/.test(url)) return new Response(`<rss><item><title>Nvidia stock jumps on AI demand</title></item><item><title>Pepe memecoin rallies 20%</title></item><item><title>Unrelated story</title></item></rss>`);
  if (/coingecko.com\/api\/v3\/coins\/[a-z]+\/market_chart/.test(url)) return Response.json({ prices: closes.map((c, i) => [i, c / 1e7]) });
  if (url.includes("coingecko.com/api/v3/coins/")) return Response.json({ name: "Pepe", market_cap_rank: 30,
    market_data: { current_price: { usd: 0.0000160 }, market_cap: { usd: 6e9 }, total_volume: { usd: 8e8 }, ath: { usd: 0.0000284 }, ath_change_percentage: { usd: -43 } } });
  if (url.includes("stooq")) return new Response("Date,Open,High,Low,Close,Volume\n" + closes.map((c, i) => `2026-01-${i},${c},${c + 1},${c - 1},${c},1`).join("\n"));
  if (url.includes("news.google")) return new Response("<rss><item><title>Google headline</title><pubDate>Tue, 24 Nov 2026 10:00:00 GMT</pubDate></item></rss>");
  if (url.includes("state/state.json")) return Response.json({ alerts: [{ title: "Old alert", ts: "2026-11-24T10:00:00Z", link: "https://x/1" }, { title: "Fed cuts rates", ts: "2026-11-25T10:00:00Z", link: "https://x/2", msg: "🔴 *الفيد نقص الفائدة*" }] });
  if (url.includes("greenapi")) { sent.push(JSON.parse(opt.body)); return Response.json({ idMessage: "X" }); }
  throw new Error("unexpected url " + url);
};

function hook(type, text, chat = "212600000000@c.us", inst = "710700000000") {
  return { typeWebhook: type, instanceData: { idInstance: Number(inst) }, senderData: { chatId: chat },
           messageData: { typeMessage: "textMessage", textMessageData: { textMessage: text } } };
}
async function call(body) {
  const waits = [];
  const keep = setInterval(() => {}, 1000); // Node unrefs AbortSignal timers; Workers don't
  await worker.fetch(new Request("https://x.workers.dev", { method: "POST", body: JSON.stringify(body) }), env, { waitUntil: p => waits.push(p) });
  await Promise.all(waits);
  clearInterval(keep);
}
const ok = (c, m) => { assert.ok(c, m); console.log("PASS", m); };
const ask = async t => { sent.length = 0; calls.length = 0; await call(hook("outgoingMessageReceived", t)); return sent.map(s => s.message); };

// --- webhook filtering
ok(parseWebhook(hook("outgoingMessageReceived", "nvidia?"), env), "accepts your own message typed on the phone");
ok(!parseWebhook(hook("outgoingAPIMessageReceived", "nvidia?"), env), "ignores the bot's own API messages (no loop)");
ok(!parseWebhook(hook("incomingMessageReceived", "hi", "212699999999@c.us"), env), "ignores other people");
ok(!parseWebhook(hook("incomingMessageReceived", "hi", undefined, "123"), env), "ignores other instances");
ok(!parseWebhook(hook("outgoingMessageReceived", "🔴 *Fed cuts*"), env), "ignores forwarded alerts");

// --- model discovery
ok(rankModels(["models/gemini-2.5-flash", "models/gemini-3.1-flash-lite", "models/gemini-3.6-flash", "models/gemini-3.1-pro-preview"]).join() === "gemini-3.1-flash-lite,gemini-3.6-flash", "model list: only current Flash models, lite first, retired 2.5 excluded");

// --- well-known asset: no AI needed to identify it, multi-source news, sources listed
let m = await ask("wach mzyan nchri nvidia daba?");
ok(m[1].includes("تحليل بلا بحث") && /المصادر: .*Yahoo Finance.*Reuters.*CNBC/.test(m[1]), "analysis lists the sources used (Yahoo price, Reuters/CNBC news...)");
ok(calls.some(u => u.includes("cnbc")) && calls.some(u => u.includes("dowjones")), "stock news also from CNBC + MarketWatch");

// --- optional Google Search grounding (only when enabled)
env.GOOGLE_SEARCH = "1";
m = await ask("wach mzyan nchri nvidia daba?");
ok(m.length === 2 && m[0].includes("Nvidia"), "known name found instantly (no AI intent call)");
ok(calls.some(u => u.includes("/v1/finance/search") && u.includes("newsCount=8")) && calls.some(u => u.includes("news.google")), "news from Yahoo + Google News");
ok(m[1].includes("تحليل مع البحث") && m[1].includes("🔗 المصادر: reuters.com · coindesk.com"), "with GOOGLE_SEARCH=1: grounded analysis + deduped web sources");
delete env.GOOGLE_SEARCH;

// --- stock that is NOT in the built-in list -> AI names it, Yahoo resolves ticker
m = await ask("chno kat9ol 3la rivian?");
ok(m[0].includes("Rivian") && calls.some(u => u.includes("/chart/RIVN")), "unknown stock 'rivian' -> Yahoo search -> RIVN");

// --- Arabic-script company name
m = await ask("علي بابا واش طالع؟");
ok(calls.some(u => u.includes("/chart/BABA")), "Arabic 'علي بابا' -> Alibaba -> BABA");

// --- small crypto not on Yahoo -> CoinGecko for resolution, price history and stats
m = await ask("بيبي كوين شنو الأخبار");
ok(m[0].includes("Pepe") && calls.some(u => u.includes("coins/pepe/market_chart")) && calls.some(u => /coins\/pepe\?/.test(u)), "memecoin -> CoinGecko id, price chart and stats");

ok(calls.some(u => u.includes("coindesk")) && calls.some(u => u.includes("cointelegraph")), "crypto news also from CoinDesk + Cointelegraph");

// --- AI down: still finds the asset from the words in the message
intentDown = true;
m = await ask("chno kat9ol 3la hyperliquid?");
ok(m[0].includes("Hyperliquid"), "AI busy -> word search 'hyperliquid' -> CoinGecko HYPE");
intentDown = false;
ok(candidateWords("salam labas wach mzyan").length === 0, "Darija filler words are not searched as tickers");

// --- explicit ticker gets verified
m = await ask("analyse $PLTR stp");
ok(calls.some(u => u.includes("/chart/PLTR")), "explicit $PLTR ticker");

// --- nothing found -> helpful message, no crash
m = await ask("qwerty zzzz");
ok(m.length === 1 && m[0].includes("ما لقيتش"), "unknown asset -> clear 'not found' reply");

// --- greeting
m = await ask("salam");
ok(m.length === 1 && m[0].startsWith("🤖"), "greeting -> short help reply");

// --- Google Search quota exhausted -> plain analysis still delivered
searchOk = false; env.GOOGLE_SEARCH = "1";
m = await ask("bitcoin");
ok(m[1].includes("تحليل بلا بحث"), "search unavailable -> falls back to analysis without search");
searchOk = true; delete env.GOOGLE_SEARCH;

// --- every Gemini model overloaded (503) -> Cloudflare Workers AI writes the analysis
all503 = true;
env.AI = { run: async (model, inp) => { assert.ok(model.includes("llama") && inp.messages[0].role === "system"); return { response: "🤖 *تحليل Llama*\nℹ️ هادا تحليل ماشي نصيحة شراء ولا بيع — القرار ديالك." }; } };
const t1 = Date.now();
m = await ask("nvidia");
ok(m[1].includes("تحليل Llama") && Date.now() - t1 < 27000, `Gemini 503 everywhere -> Workers AI answer in ${Math.round((Date.now() - t1) / 1000)}s`);
env.AI = { run: async () => { throw new Error("neurons exhausted"); } };
m = await ask("nvidia");
ok(m[1].includes("support"), "Gemini + Workers AI both down -> raw numbers");
delete env.AI; all503 = false;

// --- number formatting
ok(nice(10.284000396728516) === 10.28 && nice(0.0000160123) === 0.00001601 && nice(57.6) === 57.6, "prices rounded (10.28, tiny coins keep 4 significant digits)");

// --- Yahoo down -> Stooq fallback still answers
yahooOk = false;
m = await ask("tesla");
ok(m.length === 2, "Yahoo down -> Stooq fallback still answers");
yahooOk = true;

// --- Gemini completely hangs -> raw numbers before Cloudflare's 30 s limit
geminiHang = true;
const t0 = Date.now();
m = await ask("nvidia");
const took = Date.now() - t0;
ok(m.length === 2 && m[1].includes("support") && took < 27000, `Gemini hang -> raw-numbers answer in ${Math.round(took / 1000)}s (<27s)`);
geminiHang = false;

// --- mobile app API
const apiCall = async (path, opt = {}, hdr = { "X-App": "nabd" }) => {
  const keep = setInterval(() => {}, 1000);
  const r = await worker.fetch(new Request("https://x.workers.dev" + path, { ...opt, headers: { "Content-Type": "application/json", ...hdr } }), env, { waitUntil() {} });
  clearInterval(keep);
  return { status: r.status, body: await r.json().catch(() => null), cors: r.headers.get("Access-Control-Allow-Origin") };
};
let r = await apiCall("/api/chat", { method: "POST", body: JSON.stringify({ text: "nvidia", lang: "fr" }) }, {});
ok(r.status === 401, "API rejects requests without the app header");
calls.length = 0;
r = await apiCall("/api/chat", { method: "POST", body: JSON.stringify({ text: "nvidia", lang: "fr" }) });
const sysSent = calls.length;
ok(r.status === 200 && r.body.reply.includes("la décision t'appartient") && r.cors === "*", "POST /api/chat answers in French with French disclaimer + CORS");
r = await apiCall("/api/chat", { method: "POST", body: JSON.stringify({ text: "salam", lang: "en" }) });
ok(r.body.reply.startsWith("Send me a stock"), "help reply in the user's language");
r = await apiCall("/api/quote?symbols=NVDA,BTC-USD");
ok(r.body.quotes.length === 2 && r.body.quotes[0].last === 160, "GET /api/quote returns prices for the watchlist");
r = await apiCall("/api/resolve?q=rivian");
ok(r.body.asset.symbol === "RIVN", "GET /api/resolve finds any ticker for the watchlist search");
r = await apiCall("/api/alerts");
ok(r.body.alerts[0].title === "Fed cuts rates" && r.body.alerts[0].msg.includes("الفيد"), "GET /api/alerts returns newest alerts first, with full Darija text");
r = await apiCall("/api/nope");
ok(r.status === 404, "unknown API path -> 404");
const opt = await worker.fetch(new Request("https://x.workers.dev/api/chat", { method: "OPTIONS" }), env, { waitUntil() {} });
ok(opt.headers.get("Access-Control-Allow-Headers").includes("X-App"), "CORS preflight allowed");

// --- local symbol map
ok(localSymbols("شنو كتقول على تسلا").symbols[0] === "TSLA", "Arabic 'تسلا' -> TSLA");
ok(localSymbols("bitcoin or ethereum").symbols.join() === "BTC-USD,ETH-USD", "'or' is not read as gold");
ok(localSymbols("مقابل الدولار") === null, "'مقابل' is not read as Apple");
ok((await resolveAsset("pepe")).cgId === "pepe", "resolveAsset falls back to CoinGecko");

// --- math
const s = summarize("T", closes, closes.map(x => x + 1), closes.map(x => x - 1), { price: 160 });
ok(s.sma20 > s.sma50 && s.rsi14 === 100 && s.chg1d > 0 && s.support20 < s.resistance20, "indicators computed (SMA, RSI, levels, % changes)");
console.log("\nALL BOT TESTS PASSED");
