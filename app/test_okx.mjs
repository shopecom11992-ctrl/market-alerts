import crypto from "node:crypto";
import { sha256, hmacSha256, utf8, base64, sign, floorTo, roundTo, createOkx, executePlan, closeTrade, replaceStop, isGone, scanMarket, scoreCandles, placeEntry, checkPending, freeUpUsdt } from "./okx.js";
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
for (const s of ["", "abc", "a".repeat(55), "a".repeat(56), "a".repeat(64), "a".repeat(1000), "مرحبا 🚀 é"]) {
  ok(Buffer.from(sha256(utf8(s))).toString("hex") === crypto.createHash("sha256").update(s).digest("hex"), "sha256 len " + s.length);
  ok(base64(utf8(s)) === Buffer.from(s).toString("base64"), "base64 len " + s.length);
}
for (const k of ["k", "x".repeat(64), "y".repeat(100)]) ok(Buffer.from(hmacSha256(utf8(k), utf8("msg"))).toString("hex") === crypto.createHmac("sha256", k).update("msg").digest("hex"), "hmac keylen " + k.length);
const ts = "2026-11-25T10:00:00.123Z", body = JSON.stringify({ instId: "BTC-USDT", sz: "10" });
ok(sign("SECRET", ts, "post", "/api/v5/trade/order", body) === crypto.createHmac("sha256", "SECRET").update(ts + "POST/api/v5/trade/order" + body).digest("base64"), "OKX signature matches Node crypto");
ok(floorTo(0.123456789, "0.00000001") === "0.12345678" && floorTo(1.99, "1") === "1" && roundTo(101.237, "0.01") === "101.24" && floorTo(0.3, "0.1") === "0.3", "lot/tick rounding");

// mock OKX
const calls = []; let state = { usdt: 1000, sol: 2, ocoFail: false };
const mock = async (url, opt) => {
  const u = new URL(url), p = u.pathname, b = opt.body ? JSON.parse(opt.body) : null; calls.push({ p, b, h: opt.headers, m: opt.method });
  const R = (data, code = "0") => ({ status: 200, json: async () => ({ code, msg: "", data }) });
  if (p === "/api/v5/public/time") return R([{ ts: String(Date.now() + 5000) }]);
  if (p === "/api/v5/public/instruments") return R([{ instId: "SOL-USDT", tickSz: "0.01", lotSz: "0.000001", minSz: "0.01", state: "live" }]);
  if (p === "/api/v5/market/ticker") return R([{ last: "100" }]);
  if (p === "/api/v5/account/balance") return R([{ totalEq: "1200", details: [{ ccy: "USDT", availBal: String(state.usdt), eq: String(state.usdt), eqUsd: String(state.usdt) }, { ccy: "SOL", availBal: String(state.sol), eq: "2", eqUsd: "200" }] }]);
  if (p === "/api/v5/trade/order" && opt.method === "POST" && b.ordType === "limit") return R([{ ordId: "L1", sCode: "0" }]);
  if (p === "/api/v5/trade/cancel-order") { state.cancelled = b.ordId; return R([{ ordId: b.ordId, sCode: "0" }]); }
  if (p === "/api/v5/trade/orders-algo-pending") return R(u.searchParams.get("ordType") === "oco" ? [{ algoId: "att1", sz: "0.999", tag: "kimmarket", cTime: "1" }] : []);
  if (p === "/api/v5/trade/order" && u.searchParams.get("ordId") === "L1") return R([{ state: state.l1 || "live", accFillSz: state.l1 === "filled" ? "1" : "0", avgPx: "95", fee: "-0.001", feeCcy: "SOL" }]);
  if (p === "/api/v5/trade/order" && opt.method === "POST") { if (b.side === "buy") { state.usdt -= +b.sz; state.sol += +b.sz / 100 * 0.999; } else state.sol -= +b.sz; return R([{ ordId: "o1", sCode: "0" }]); }
  if (p === "/api/v5/trade/order") return R([{ state: "filled", accFillSz: "1", avgPx: "100", fee: "-0.001", feeCcy: "SOL" }]);
  if (p === "/api/v5/trade/order-algo") return state.ocoFail ? R([{ sCode: "51000", sMsg: "Parameter error" }], "1") : R([{ algoId: "a1", sCode: "0" }]);
  if (p === "/api/v5/trade/cancel-algos") return R([{ algoId: b[0].algoId, sCode: "0" }]);
  return { status: 404, json: async () => ({ code: "404" }) };
};
const okx = createOkx({ key: "K", secret: "S", passphrase: "P", demo: true }, mock);
const log = await executePlan(okx, { base: "SOL", usdt: 100, takeProfit: 112.345, stopLoss: 95.001 }, async () => {});
const buy = calls.find((c) => c.p === "/api/v5/trade/order" && c.m === "POST");
ok(buy.b.tgtCcy === "quote_ccy" && buy.b.sz === "100" && buy.b.tdMode === "cash" && buy.b.ordType === "market", "market buy uses USDT amount, spot cash mode");
ok(buy.h["x-simulated-trading"] === "1" && buy.h["OK-ACCESS-KEY"] === "K" && buy.h["OK-ACCESS-SIGN"] && buy.h["OK-ACCESS-PASSPHRASE"] === "P", "demo header + auth headers");
ok(Math.abs(new Date(buy.h["OK-ACCESS-TIMESTAMP"]).getTime() - (Date.now() + 5000)) < 2000, "timestamp synced to OKX server time");
const oco = calls.find((c) => c.p === "/api/v5/trade/order-algo");
ok(oco.b.ordType === "oco" && oco.b.side === "sell" && +oco.b.sz === 0.999 && oco.b.tpTriggerPx === "112.35" && oco.b.slTriggerPx === "95.00" && oco.b.tpOrdPx === "-1", "OCO sells only the bought qty (minus fee), prices on tick size");
ok(log.algoId === "a1" && log.steps.includes("oco_placed"), "executePlan log ok");
const pub = calls.find((c) => c.p === "/api/v5/public/instruments"); ok(!pub.h["OK-ACCESS-KEY"], "public calls unsigned");
await closeTrade(okx, log);
ok(calls.some((c) => c.p === "/api/v5/trade/cancel-algos" && c.b[0].algoId === "a1") && calls.filter((c) => c.p === "/api/v5/trade/order" && c.b && c.b.side === "sell").pop().b.sz == 0.999, "close: cancel OCO + market sell qty");
state.ocoFail = true; const l2 = await executePlan(okx, { base: "SOL", usdt: 100, takeProfit: 112, stopLoss: 95 }, async () => {});
ok(l2.error === "oco_failed" && l2.errorMsg === "Parameter error", "OCO failure reported (user warned)");
let e; try { await executePlan(okx, { base: "SOL", usdt: 5000, takeProfit: 112, stopLoss: 95 }, async () => {}); } catch (x) { e = x; } ok(e && e.code === "insufficient_usdt", "insufficient USDT blocked before ordering");
e = null; try { await executePlan(okx, { base: "SOL", usdt: 100, takeProfit: 99, stopLoss: 95 }, async () => {}); } catch (x) { e = x; } ok(e && e.code === "plan_out_of_date", "stale plan (price past TP) blocked");
e = null; try { await executePlan(okx, { base: "SOL", usdt: 0.5, takeProfit: 112, stopLoss: 95 }, async () => {}); } catch (x) { e = x; } ok(e && e.code === "below_min_size", "below min size blocked");
state.ocoFail = false; calls.length = 0;
const moved = await replaceStop(okx, { ...log, algoId: "a1" }, 98.004);
const cx = calls.find((c) => c.p === "/api/v5/trade/cancel-algos"), no = calls.find((c) => c.p === "/api/v5/trade/order-algo");
ok(cx && cx.b[0].algoId === "a1" && no && no.b.slTriggerPx === "98.00" && no.b.tpTriggerPx === log.tp && moved.sl === "98.00", "replaceStop: cancel old OCO, new OCO with higher SL, same TP");
e = null; try { await replaceStop(okx, log, 101); } catch (x) { e = x; } ok(e && e.code === "stop_above_price", "replaceStop refuses stop above price");
ok(isGone({ ccy: { SOL: { eq: 0.1 } } }, { instId: "SOL-USDT", qty: 1 }) && !isGone({ ccy: { SOL: { eq: 1 } } }, { instId: "SOL-USDT", qty: 1 }), "isGone detects closed positions");
// scanner
const up = Array.from({ length: 100 }, (_, i) => 100 * (1 + i * 0.002 + Math.sin(i * 1.3) * 0.008));
const down = Array.from({ length: 100 }, (_, i) => 100 * (1 - i * 0.003));
ok(scoreCandles(up).score >= 3 && scoreCandles(down).score < 3, "scoreCandles likes uptrends, rejects downtrends");
const mk = (arr) => arr.slice().reverse().map((c, i) => [String(i), "0", "0", "0", String(c), "0", "0", "0", "1"]);
const scanFetch = async (u) => ({ json: async () => u.includes("tickers") ? { data: [
  { instId: "UP-USDT", last: String(up[99]), open24h: String(up[75]), volCcy24h: "50000000", vol24h: "400000" },
  { instId: "DN-USDT", last: String(down[99]), open24h: String(down[96]), volCcy24h: "50000000", vol24h: "600000" },
  { instId: "USDC-USDT", last: "1", open24h: "1", volCcy24h: "90000000", vol24h: "90000000" },
  { instId: "TINY-USDT", last: "1", open24h: "1", volCcy24h: "1000", vol24h: "1000" },
  { instId: "BTC-EUR", last: "1", open24h: "1", volCcy24h: "90000000", vol24h: "1" } ] }
  : { data: mk(u.includes("UP-USDT") ? up : down) } });
const sc = await scanMarket(scanFetch);
ok(sc.length === 1 && sc[0].instId === "UP-USDT" && sc[0].vol24 >= 1e7 && sc[0].rsi14 != null, "scanMarket: keeps liquid uptrending USDT coins, drops stables/illiquid/downtrends");
// limit entries
calls.length = 0;
const pend = await placeEntry(okx, { base: "SOL", usdt: 50, entry: 95.004, takeProfit: 105.009, stopLoss: 91.001, expiryHours: 12 });
const lb = calls.find((c) => c.p === "/api/v5/trade/order" && c.b && c.b.ordType === "limit");
ok(lb && lb.b.px === "95.00" && +lb.b.sz === 0.526315 && lb.b.attachAlgoOrds[0].tpTriggerPx === "105.01" && lb.b.attachAlgoOrds[0].slTriggerPx === "91.00" && lb.b.attachAlgoOrds[0].slOrdPx === "-1", "placeEntry: limit buy at entry, size from USDT, TP/SL attached");
ok(pend.kind === "pending" && pend.ordId === "L1" && pend.expiresAt > Date.now(), "placeEntry returns pending record");
e = null; try { await placeEntry(okx, { base: "SOL", usdt: 50, entry: 101, takeProfit: 110, stopLoss: 95 }); } catch (x) { e = x; } ok(e && e.code === "entry_above_price", "placeEntry refuses entry above market (buy now instead)");
let ck = await checkPending(okx, pend); ok(ck.state === "waiting" && ck.lastPx === 100, "checkPending: waiting + live price");
state.l1 = "filled"; ck = await checkPending(okx, pend);
ok(ck.state === "filled" && ck.trade.qty === 0.999 && ck.trade.algoId === "att1" && ck.trade.tp === pend.tp, "checkPending: filled -> trade with attached TP/SL algo id");
state.l1 = "live"; ck = await checkPending(okx, { ...pend, expiresAt: Date.now() - 1 }); ok(ck.state === "expired" && state.cancelled === "L1", "checkPending: expired order gets cancelled");
// free up USDT by selling the weakest coin
const flat = Array.from({ length: 100 }, (_, i) => 100 * (1 - i * 0.004));
const fu = await freeUpUsdt(okx, 1200, { exclude: [] }, async () => ({ json: async () => ({ data: mk(flat) }) }));
ok(fu.sold === "SOL" && fu.missing > 0 && fu.sz > 0 && fu.sz <= state.sol + 1e-9, "freeUpUsdt: plans selling the weakest holding to cover missing USDT");
const fu2 = await freeUpUsdt(okx, 10, {}, async () => ({ json: async () => ({ data: [] }) }));
ok(fu2.sold === null, "freeUpUsdt: nothing to sell when USDT is enough");
console.log(fails ? fails + " FAILED" : "ALL OKX TESTS PASSED");
