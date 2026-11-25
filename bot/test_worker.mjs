// Offline tests for the WhatsApp Q&A worker: Gemini (+Google Search), Yahoo, CoinGecko, Google News and Green-API are mocked.
import worker, { parseWebhook, summarize, localSymbols, resolveAsset, rankModels, candidateWords, nice, searchAssets, chartData, validatePlan, validateManage, tradeIntent, cleanAction, validateSmart, validateNow } from "./worker.js";
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
  "sui": [{ symbol: "SUI", longname: "Sun Communities, Inc.", quoteType: "EQUITY", exchDisp: "NYSE" }, { symbol: "SUI20947-USD", shortname: "Sui USD", quoteType: "CRYPTOCURRENCY" }],
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
    if (sys.startsWith('You are "Kim"')) {
      const q = b.contents[0].parts[0].text.split("USER NOW:").pop();
      const R = (o) => Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(o) }] } }] });
      if (/93 usdt/i.test(q)) return R({ reply: "واخا، غادي نخدم بـ 93 USDT. الهدف ديال 20% ف 7 أيام طموح بزاف…", action: { type: "start_mission", capitalUsdt: 93, targetPct: 20, days: 7, maxLossPct: null } });
      if (/no bi3 btc/i.test(q)) return R({ reply: "صافي", action: { type: "open", symbol: "SOL", when: "now", fundFrom: "btc", fundAll: true, keep: ["link"] } });
      if (/chri liya sol/i.test(q)) return R({ reply: "دابا نشوف SOL", action: { type: "open", symbol: "SOL" } });
      if (/9aleb/i.test(q)) return R({ reply: "غادي نقلب", action: { type: "scan" } });
      if (/ra2yk/i.test(q)) return R({ reply: "نشوف", action: { type: "analyze", query: "Rivian" } });
      return R({ reply: "مرحبا! أنا Kim.", action: { type: "none" } });
    }
    if (sys.startsWith("You pick at most ONE")) {
      const cs = JSON.parse(b.contents[0].parts[0].text.split("CANDIDATES:\n")[1].split("\n\nHEADLINES")[0]);
      const c = cs[0];
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ pick: c.instId, stopLoss: c.last * 0.96, takeProfit: c.last * 1.08, timeframe: "days", confidence: "medium", summary: "ترند طالع", reasons: ["a"], risks: ["b"] }) }] } }] });
    }
    if (sys.startsWith("You manage an OPEN")) {
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ action: "tighten", newStopLoss: 155, reason: "حماية الربح" }) }] } }] });
    }
    if (sys.startsWith("You are a disciplined")) {
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ action: "buy", entry: 1, stopLoss: 152, takeProfit: 175, timeframe: "days", confidence: "medium", summary: "خطة", reasons: ["a"], risks: ["b"] }) }] } }] });
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
    if (q === "sui") return Response.json({ coins: [{ id: "sui", symbol: "SUI", name: "Sui", market_cap_rank: 20 }] });
    return Response.json({ coins: /pepe/.test(q) ? [{ id: "pepe", symbol: "PEPE", name: "Pepe" }] : /hyperliquid/.test(q) ? [{ id: "hyperliquid", symbol: "HYPE", name: "Hyperliquid" }] : [] });
  }
  if (/coindesk|cointelegraph|decrypt\.co|cnbc|dowjones/.test(url)) return new Response(`<rss><item><title>Nvidia stock jumps on AI demand</title></item><item><title>Pepe memecoin rallies 20%</title></item><item><title>Unrelated story</title></item></rss>`);
  if (/coingecko.com\/api\/v3\/coins\/[a-z]+\/market_chart/.test(url)) return Response.json({ prices: closes.map((c, i) => [i, c / 1e7]) });
  if (url.includes("coingecko.com/api/v3/coins/")) return Response.json({ name: "Pepe", market_cap_rank: 30,
    market_data: { current_price: { usd: 0.0000160 }, market_cap: { usd: 6e9 }, total_volume: { usd: 8e8 }, ath: { usd: 0.0000284 }, ath_change_percentage: { usd: -43 } } });
  if (url.includes("stooq")) return new Response("Date,Open,High,Low,Close,Volume\n" + closes.map((c, i) => `2026-01-${i},${c},${c + 1},${c - 1},${c},1`).join("\n"));
  if (url.includes("news.google")) return new Response("<rss><item><title>Google headline</title><pubDate>Tue, 24 Nov 2026 10:00:00 GMT</pubDate></item></rss>");
  if (url.includes("state/state.json")) return Response.json({ alerts: [{ title: "Old alert", ts: "2026-11-24T10:00:00Z", link: "https://x/1" }, { title: "Fed cuts rates", ts: "2026-11-25T10:00:00Z", link: "https://x/2", msg: "🔴 *الفيد نقص الفائدة*", impact: 9, ideas: [{ symbol: "BTC-USD", direction: "up" }] }] });
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
ok(r.body.alerts[0].ideas[0].symbol === "BTC-USD" && r.body.alerts[0].impact === 9, "alerts carry structured trade ideas for the paper bot");
const sr = await searchAssets("sui");
ok(sr[0].type === "crypto" && sr[0].cgId === "sui" && sr[0].symbol === "SUI20947-USD" && sr.some(x => x.symbol === "SUI" && x.type === "stock"), "search 'sui': both the coin (first) and the stock are offered, no duplicates");
r = await apiCall("/api/chart?symbol=NVDA&range=3mo");
ok(r.body.points.length === 0 || r.body.points.length > 1, "chart endpoint responds");
const ch = await chartData("PEPE-USD", "1mo", "pepe");
ok(ch.src === "CoinGecko" && ch.points.length > 1, "chart falls back to CoinGecko for coins Yahoo doesn't list");
r = await apiCall("/api/chart?symbol=" + encodeURIComponent("<script>"));
ok(r.status === 400, "chart rejects bad symbols");
// --- trade plan
r = await apiCall("/api/plan", { method: "POST", body: JSON.stringify({ symbol: "NVDA", name: "Nvidia", lang: "darija" }) });
ok(r.body.plan.action === "buy" && r.body.plan.entry === 160 && r.body.plan.rr >= 1.4 && r.body.plan.slPct === 5, "POST /api/plan returns a validated buy plan (entry = live price, SL 5%, R:R checked)");
ok(validatePlan({ action: "buy", stopLoss: 159.9, takeProfit: 200 }, 160).action === "wait", "plan rejected: stop-loss too tight");
ok(validatePlan({ action: "buy", stopLoss: 100, takeProfit: 300 }, 160).action === "wait", "plan rejected: stop-loss too far (>15%)");
ok(validatePlan({ action: "buy", stopLoss: 150, takeProfit: 165 }, 160).action === "wait", "plan rejected: reward/risk below 1.4");
ok(validatePlan({ action: "wait" }, 160).action === "wait", "AI 'wait' stays wait");
r = await apiCall("/api/plan", { method: "POST", body: JSON.stringify({ symbol: "<x>" }) });
ok(r.status === 400, "plan rejects bad symbols");
// --- chat trade intents + position manager
let ti = await tradeIntent("dir trade f solana db");
ok(ti.intent === "open" && ti.asset && ti.asset.symbol === "SOL-USD" && ti.asset.type === "crypto", "intent: 'dir trade f solana' -> open SOL");
ti = await tradeIntent("دير ترايد ف البيتكوين");
ok(ti.intent === "open" && ti.asset && ti.asset.symbol === "BTC-USD", "intent: Darija Arabic script -> open BTC");
ti = await tradeIntent("bi3 BTC daba");
ok(ti.intent === "close" && ti.asset && ti.asset.symbol === "BTC-USD", "intent: 'bi3 BTC' -> close BTC");
ti = await tradeIntent("chno ra2yk f nvidia");
ok(ti.intent === null, "normal question is not a trade command");
ti = await tradeIntent("wach nchri nvidia daba?");
ok(ti.intent === null, "'should I buy?' question is not an order");
ti = await tradeIntent("dir trade");
ok(ti.intent === "open" && ti.asset === null, "trade command without asset -> asset null");
const pos = { entry: 150, stopLoss: 145, takeProfit: 170 };
ok(validateManage({ action: "tighten", newStopLoss: 140 }, pos, 160).action === "hold", "manager can't lower stop-loss");
ok(validateManage({ action: "tighten", newStopLoss: 159.5 }, pos, 160).action === "hold", "manager stop can't hug the price");
ok(validateManage({ action: "tighten", newStopLoss: 155 }, pos, 160).newStopLoss === 155, "manager tightens stop");
ok(validateManage({ action: "close" }, pos, 160).action === "close", "manager can close");
r = await apiCall("/api/manage", { method: "POST", body: JSON.stringify({ symbol: "NVDA", entry: 150, stopLoss: 145, takeProfit: 175, lang: "darija" }) });
ok(r.body.review.action === "tighten" && r.body.review.newStopLoss === 155, "POST /api/manage returns validated review");
r = await apiCall("/api/intent", { method: "POST", body: JSON.stringify({ text: "dir trade f solana" }) });
ok(r.body.intent === "open" && r.body.asset.symbol === "SOL-USD", "POST /api/intent");
// --- conversational agent + coin picker
r = await apiCall("/api/agent", { method: "POST", body: JSON.stringify({ text: "3andi 93 usdt f okx, chri w bi3 bohdk, bghit 20% f 7 iyam", ctx: { connected: true, usdtFree: 93 }, lang: "darija" }) });
ok(r.body.action.type === "start_mission" && r.body.action.capitalUsdt === 93 && r.body.action.targetPct === 20 && r.body.action.days === 7 && r.body.action.maxLossPct === 10 && r.body.reply.length > 5, "agent: Darija mission request -> start_mission (default max loss 10%)");
r = await apiCall("/api/agent", { method: "POST", body: JSON.stringify({ text: "chri liya sol db", history: [{ me: true, text: "salam" }, { me: false, text: "مرحبا" }] }) });
ok(r.body.action.type === "open" && r.body.asset && r.body.asset.symbol === "SOL-USD", "agent: 'chri liya sol' -> open SOL-USD");
r = await apiCall("/api/agent", { method: "POST", body: JSON.stringify({ text: "No bi3 btc kaml wchriha hiya latbi3ch link" }) });
ok(r.body.action.type === "open" && r.body.action.fundFrom === "BTC" && r.body.action.fundAll === true && r.body.action.keep[0] === "LINK" && r.body.action.when === "now", "agent: 'sell BTC (all), not LINK, buy SOL' -> fundFrom BTC, keep LINK");
r = await apiCall("/api/agent", { method: "POST", body: JSON.stringify({ text: "9aleb liya 3la coin mzyana" }) });
ok(r.body.action.type === "scan", "agent: 'search me a good coin' -> scan");
r = await apiCall("/api/agent", { method: "POST", body: JSON.stringify({ text: "salam kim" }) });
ok(r.body.action.type === "none" && r.body.reply.includes("Kim"), "agent: small talk");
ok(cleanAction({ type: "start_mission", targetPct: 500, days: 0, capitalUsdt: 93 }).targetPct === 10 && cleanAction({ type: "hack" }).type === "none" && cleanAction({ type: "open", symbol: "sol-usdt" }).symbol === "SOL", "cleanAction bounds + sanitises");
const cands = [{ instId: "SUI-USDT", last: 2, chg24: 4, vol24: 9e7, sma20: 1.9, sma50: 1.8, rsi14: 61, chg4h: 1.2, atrPct: 0.8 }, { instId: "BAD-USDT", last: 1 }];
r = await apiCall("/api/pick", { method: "POST", body: JSON.stringify({ candidates: cands, goal: { targetPct: 20, days: 7 }, lang: "darija" }) });
ok(r.body.pick.pick === "SUI-USDT" && r.body.pick.entry === 2 && r.body.pick.slPct === 4 && r.body.pick.rr >= 1.5, "pick: validated coin pick from OKX scan");
r = await apiCall("/api/pick", { method: "POST", body: JSON.stringify({ candidates: [{ instId: "<script>", last: 1 }] }) });
ok(r.body.pick.pick === null, "pick: rejects junk candidates");
// --- smart / now plans
let sm = validateSmart({ action: "limit", entry: 95, stopLoss: 91, takeProfit: 105, expiryHours: 12 }, 100);
ok(sm.action === "limit" && sm.entry === 95 && sm.distPct === 5 && sm.expiryHours === 12 && sm.rr >= 1.5, "smart: limit entry below price with SL/TP relative to entry");
ok(validateSmart({ action: "limit", entry: 101, stopLoss: 95, takeProfit: 110 }, 100).action === "wait", "smart: limit above price rejected");
ok(validateSmart({ action: "limit", entry: 80, stopLoss: 75, takeProfit: 95 }, 100).action === "wait", "smart: limit too far (>10%) rejected");
ok(validateSmart({ action: "buy", stopLoss: 96, takeProfit: 110 }, 100).action === "buy", "smart: buy now passes");
let nw = validateNow({ action: "wait", stopLoss: 99.9, takeProfit: 100.5 }, 100);
ok(nw.action === "buy" && nw.stopLoss === 96 && nw.takeProfit === 108 && nw.defaultLevels, "now: bad AI levels -> default -4%/+8% bracket");
ok(validateNow({ action: "wait", stopLoss: 95, takeProfit: 110 }, 100).stopLoss === 95, "now: keeps sensible AI levels even if AI said wait");
ok(cleanAction({ type: "open", symbol: "SOL", when: "now" }).when === "now" && cleanAction({ type: "open", symbol: "SOL" }).when === "best", "agent action carries when=now|best");
r = await apiCall("/api/plan", { method: "POST", body: JSON.stringify({ symbol: "NVDA", mode: "now" }) });
ok(r.body.plan.action === "buy", "POST /api/plan mode=now always returns a buy plan");
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
