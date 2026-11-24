// Offline test of the WhatsApp Q&A worker with mocked Gemini, Yahoo, Google News and Green-API.
import worker, { parseWebhook, summarize, localSymbols } from "./worker.js";
import assert from "node:assert/strict";

const env = { GEMINI_API_KEY: "g", GREENAPI_TOKEN: "t", GREENAPI_URL: "https://7107.api.greenapi.com",
              GREENAPI_INSTANCE: "710700000000", CHAT_ID: "212600000000" };
const sent = [];
let geminiCalls = 0, yahooOk = true, geminiHang = false;

const closes = Array.from({ length: 120 }, (_, i) => 100 + i * 0.5);
globalThis.fetch = async (url, opt = {}) => {
  url = String(url);
  if (url.includes("generativelanguage")) {
    geminiCalls++;
    const b = JSON.parse(opt.body);
    const sys = b.systemInstruction.parts[0].text;
    const text = sys.startsWith("You route")
      ? (b.contents[0].parts[0].text.includes("salam") ? JSON.stringify({ type: "chat", symbols: [], reply: "مرحبا! صيفط ليا سمية سهم." })
                                                       : JSON.stringify({ type: "asset", symbols: ["nvda"], names: { NVDA: "Nvidia" } }))
      : "🤖 *NVDA — تحليل*\n💵 ...\nℹ️ هادا تحليل ماشي نصيحة شراء ولا بيع — القرار ديالك.";
    if (geminiHang) return new Promise((_, rej) => opt.signal.addEventListener("abort", () => rej(Object.assign(new Error("timeout"), { name: "TimeoutError" }))));
    if (url.includes("gemini-2.5-flash-lite") && geminiCalls === 1) return new Response("busy", { status: 503 }); // fallback path
    assert.ok(!url.includes("2.5") || b.generationConfig.thinkingConfig.thinkingBudget === 0, "thinking disabled on 2.5 models");
    return Response.json({ candidates: [{ content: { parts: [{ text }] } }] });
  }
  if (url.includes("finance.yahoo")) {
    if (!yahooOk) return new Response("no", { status: 429 });
    return Response.json({ chart: { result: [{ meta: { regularMarketPrice: 160, currency: "USD", regularMarketTime: 1795540000 },
      indicators: { quote: [{ close: closes, high: closes.map(x => x + 1), low: closes.map(x => x - 1) }] } }] } });
  }
  if (url.includes("stooq")) return new Response("Date,Open,High,Low,Close,Volume\n" + closes.map((c, i) => `2026-01-${i},${c},${c + 1},${c - 1},${c},1`).join("\n"));
  if (url.includes("news.google")) return new Response("<rss><item><title>Nvidia beats estimates</title><pubDate>Tue, 24 Nov 2026 10:00:00 GMT</pubDate></item></rss>");
  if (url.includes("greenapi")) { sent.push(JSON.parse(opt.body)); return Response.json({ idMessage: "X" }); }
  throw new Error("unexpected url " + url);
};

function hook(type, text, chat = "212600000000@c.us", inst = "710700000000") {
  return { typeWebhook: type, instanceData: { idInstance: Number(inst) }, senderData: { chatId: chat },
           messageData: { typeMessage: "textMessage", textMessageData: { textMessage: text } } };
}
async function call(body) {
  const waits = [];
  const res = await worker.fetch(new Request("https://x.workers.dev", { method: "POST", body: JSON.stringify(body) }), env, { waitUntil: p => waits.push(p) });
  await Promise.all(waits);
  return res;
}
const ok = (c, m) => { assert.ok(c, m); console.log("PASS", m); };

// filtering
ok(parseWebhook(hook("outgoingMessageReceived", "nvidia?"), env), "accepts your own message typed on the phone");
ok(parseWebhook(hook("incomingMessageReceived", "nvidia?"), env), "accepts incoming message from the configured chat");
ok(!parseWebhook(hook("outgoingAPIMessageReceived", "nvidia?"), env), "ignores the bot's own API messages (no loop)");
ok(!parseWebhook(hook("incomingMessageReceived", "hi", "212699999999@c.us"), env), "ignores other people");
ok(!parseWebhook(hook("incomingMessageReceived", "hi", undefined, "123"), env), "ignores other instances");
ok(!parseWebhook(hook("outgoingMessageReceived", "🔴 *Fed cuts*"), env), "ignores forwarded alerts");

// full asset flow (with Gemini fallback on first model)
await call(hook("outgoingMessageReceived", "wach mzyan nchri nvidia daba?"));
ok(sent.length === 2 && sent[0].message.includes("NVDA") && sent[1].message.includes("القرار ديالك"), "asset question -> 'analysing' + Darija analysis");
ok(sent.every(s => s.chatId === "212600000000@c.us"), "replies only to the configured chat");
ok(geminiCalls === 2, "symbol found locally (no AI call) + Gemini fell back after a 503");

// chat flow
sent.length = 0;
await call(hook("outgoingMessageReceived", "salam"));
ok(sent.length === 1 && sent[0].message.startsWith("🤖"), "greeting -> short help reply");

// Yahoo down -> Stooq fallback
sent.length = 0; yahooOk = false;
await call(hook("outgoingMessageReceived", "nvidia"));
ok(sent.length === 2, "Yahoo down -> Stooq fallback still answers");

// local symbol detection (Darija / Arabic / French / tickers)
ok(localSymbols("wach mzyan nchri bitcoin daba?").symbols[0] === "BTC-USD", "Latin Darija 'bitcoin' -> BTC-USD");
ok(localSymbols("شنو كتقول على تسلا").symbols[0] === "TSLA", "Arabic script 'تسلا' -> TSLA");
ok(localSymbols("analyse $PLTR stp").symbols[0] === "PLTR", "explicit $ticker");
ok(localSymbols("salam labas") === null, "no asset -> falls through to AI/help");

// Gemini hangs -> must still answer before Cloudflare's 30 s cut-off, with raw numbers
sent.length = 0; yahooOk = true; geminiHang = true;
const keepAlive = setInterval(() => {}, 1000); // Node unrefs AbortSignal.timeout timers
const t0 = Date.now();
await call(hook("outgoingMessageReceived", "nvidia"));
const took = Date.now() - t0;
ok(sent.length === 2 && sent[1].message.includes("support") && took < 27000, `Gemini hang -> raw-numbers answer in ${Math.round(took/1000)}s (<27s)`);
geminiHang = false; clearInterval(keepAlive);

// math
const s = summarize("T", closes, closes.map(x => x + 1), closes.map(x => x - 1), { price: 160 });
ok(s.sma20 > s.sma50 && s.rsi14 === 100 && s.chg1d > 0 && s.support20 < s.resistance20, "indicators computed (SMA, RSI, levels, % changes)");

const get = await worker.fetch(new Request("https://x.workers.dev"), env, { waitUntil() {} });
ok((await get.text()).includes("ok"), "GET health check");
console.log("\nALL BOT TESTS PASSED");
