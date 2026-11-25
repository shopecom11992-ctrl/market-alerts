// KimMarket.ai — OKX v5 REST client that runs ON THE PHONE.
// API keys never leave the device: requests are signed locally and sent straight to OKX.
// Pure JS SHA-256 / HMAC / Base64 because Hermes has no WebCrypto.
// Spot only, no leverage. Demo trading (x-simulated-trading: 1) by default.

// ---------------------------------------------------------------- crypto
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);

export function utf8(s) {
  const out = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c >= 0xd800 && c < 0xdc00 && i + 1 < s.length) { const d = s.charCodeAt(i + 1); if (d >= 0xdc00 && d < 0xe000) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++; } }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}

export function sha256(msg) {
  const l = msg.length, bitLen = l * 8, n = ((l + 9 + 63) >> 6) << 6;
  const m = new Uint8Array(n); m.set(msg); m[l] = 0x80;
  const dv = new DataView(m.buffer); dv.setUint32(n - 4, bitLen >>> 0); dv.setUint32(n - 8, Math.floor(bitLen / 0x100000000));
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const W = new Uint32Array(64);
  for (let o = 0; o < n; o += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = W[i - 15], b = W[i - 2];
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[i] + W[i]) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  const out = new Uint8Array(32); const ov = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) ov.setUint32(i * 4, H[i]);
  return out;
}

export function hmacSha256(key, msg) {
  if (key.length > 64) key = sha256(key);
  const k = new Uint8Array(64); k.set(key);
  const ip = new Uint8Array(64 + msg.length), op = new Uint8Array(64 + 32);
  for (let i = 0; i < 64; i++) { ip[i] = k[i] ^ 0x36; op[i] = k[i] ^ 0x5c; }
  ip.set(msg, 64); op.set(sha256(ip), 64);
  return sha256(op);
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
export function base64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    s += B64[a >> 2] + B64[((a & 3) << 4) | ((b || 0) >> 4)] + (b === undefined ? "=" : B64[((b & 15) << 2) | ((c || 0) >> 6)]) + (c === undefined ? "=" : B64[c & 63]);
  }
  return s;
}

export function sign(secret, ts, method, path, body = "") {
  return base64(hmacSha256(utf8(secret), utf8(ts + method.toUpperCase() + path + body)));
}

// ---------------------------------------------------------------- number helpers
const decimals = (step) => { const s = String(step); return s.includes(".") ? s.split(".")[1].replace(/0+$/, "").length || 0 : 0; };
export function floorTo(x, step) { const d = decimals(step), st = parseFloat(step); const v = Math.floor(x / st + 1e-9) * st; return v.toFixed(d); }
export function roundTo(x, step) { const d = decimals(step), st = parseFloat(step); return (Math.round(x / st) * st).toFixed(d); }

// ---------------------------------------------------------------- client
const BASES = ["https://www.okx.com", "https://openapi.okx.com"];

export class OkxError extends Error { constructor(msg, code, data) { super(msg); this.code = code; this.data = data; } }

export function createOkx({ key, secret, passphrase, demo = true }, fetchImpl = fetch) {
  let offset = null, base = BASES[0];

  async function raw(method, path, body, auth = true) {
    const b = body ? JSON.stringify(body) : "";
    const headers = { "Content-Type": "application/json" };
    if (demo) headers["x-simulated-trading"] = "1";
    if (auth) {
      if (offset === null) await syncTime();
      const ts = new Date(Date.now() + offset).toISOString();
      headers["OK-ACCESS-KEY"] = key; headers["OK-ACCESS-PASSPHRASE"] = passphrase; headers["OK-ACCESS-TIMESTAMP"] = ts;
      headers["OK-ACCESS-SIGN"] = sign(secret, ts, method, path, b);
    }
    let r, lastErr;
    for (const candidate of [base, ...BASES.filter((x) => x !== base)]) {
      try { r = await fetchImpl(candidate + path, { method, headers, body: b || undefined }); base = candidate; break; }
      catch (e) { lastErr = e; }
    }
    if (!r) throw new OkxError("network", "network", String(lastErr));
    const j = await r.json().catch(() => ({}));
    if (j.code !== "0") {
      const d0 = Array.isArray(j.data) && j.data[0];
      throw new OkxError((d0 && d0.sMsg) || j.msg || "okx_error_" + r.status, (d0 && d0.sCode) || j.code || String(r.status), j.data);
    }
    return j.data;
  }

  async function syncTime() {
    offset = 0;
    try { const d = await raw("GET", "/api/v5/public/time", null, false); offset = parseInt(d[0].ts, 10) - Date.now(); } catch { offset = 0; }
  }

  const api = {
    demo,
    raw,
    async balances() {
      const d = await raw("GET", "/api/v5/account/balance");
      const out = {}; ((d[0] && d[0].details) || []).forEach((x) => { out[x.ccy] = { avail: parseFloat(x.availBal) || 0, eq: parseFloat(x.eq) || 0, usd: parseFloat(x.eqUsd) || 0 }; });
      return { totalUsd: parseFloat(d[0] && d[0].totalEq) || 0, ccy: out };
    },
    async instrument(instId) {
      const d = await raw("GET", `/api/v5/public/instruments?instType=SPOT&instId=${encodeURIComponent(instId)}`, null, false);
      if (!d.length) throw new OkxError("instrument_not_found", "instrument_not_found");
      const i = d[0]; return { instId: i.instId, tickSz: i.tickSz, lotSz: i.lotSz, minSz: parseFloat(i.minSz) || 0, state: i.state };
    },
    async ticker(instId) {
      const d = await raw("GET", `/api/v5/market/ticker?instId=${encodeURIComponent(instId)}`, null, false);
      return parseFloat(d[0].last);
    },
    async marketBuyUsdt(instId, usdt) {
      const d = await raw("POST", "/api/v5/trade/order", { instId, tdMode: "cash", side: "buy", ordType: "market", tgtCcy: "quote_ccy", sz: String(usdt), tag: "kimmarket" });
      return d[0].ordId;
    },
    async marketSell(instId, sz) {
      const d = await raw("POST", "/api/v5/trade/order", { instId, tdMode: "cash", side: "sell", ordType: "market", tgtCcy: "base_ccy", sz: String(sz), tag: "kimmarket" });
      return d[0].ordId;
    },
    async order(instId, ordId) {
      const d = await raw("GET", `/api/v5/trade/order?instId=${encodeURIComponent(instId)}&ordId=${encodeURIComponent(ordId)}`);
      const o = d[0]; return { state: o.state, filled: parseFloat(o.accFillSz) || 0, avgPx: parseFloat(o.avgPx) || 0, fee: parseFloat(o.fee) || 0, feeCcy: o.feeCcy };
    },
    async oco(instId, sz, tp, sl) {
      const d = await raw("POST", "/api/v5/trade/order-algo", { instId, tdMode: "cash", side: "sell", ordType: "oco", sz: String(sz), tpTriggerPx: String(tp), tpOrdPx: "-1", slTriggerPx: String(sl), slOrdPx: "-1", tag: "kimmarket" });
      return d[0].algoId;
    },
    async cancelAlgo(instId, algoId) { return raw("POST", "/api/v5/trade/cancel-algos", [{ instId, algoId }]); },
  };
  return api;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Full confirmed trade: market buy with USDT -> wait for fill -> OCO (take-profit + stop-loss) that lives on OKX 24/7.
export async function executePlan(okx, { base, usdt, takeProfit, stopLoss }, wait = sleep) {
  const instId = `${base}-USDT`;
  const log = { instId, demo: okx.demo, usdt, ts: Date.now(), steps: [] };
  const inst = await okx.instrument(instId);
  if (inst.state && inst.state !== "live") throw new OkxError("instrument_not_live", "instrument_not_live");
  const last = await okx.ticker(instId);
  if (!(stopLoss < last && last < takeProfit)) throw new OkxError("plan_out_of_date", "plan_out_of_date", { last, stopLoss, takeProfit });
  if (usdt / last < inst.minSz) throw new OkxError("below_min_size", "below_min_size", { minSz: inst.minSz, minUsdt: inst.minSz * last });
  const bal = await okx.balances();
  const free = (bal.ccy.USDT && bal.ccy.USDT.avail) || 0;
  if (free < usdt) throw new OkxError("insufficient_usdt", "insufficient_usdt", { free });
  const baseBefore = (bal.ccy[base] && bal.ccy[base].avail) || 0;

  log.buyOrdId = await okx.marketBuyUsdt(instId, usdt);
  log.steps.push("buy_sent");
  let fill = null;
  for (let i = 0; i < 8; i++) {
    await wait(i ? 700 : 400);
    fill = await okx.order(instId, log.buyOrdId);
    if (fill.state === "filled" || (fill.state === "canceled" && fill.filled > 0)) break;
  }
  if (!fill || fill.filled <= 0) { log.steps.push("buy_not_filled"); log.error = "buy_not_filled"; return log; }
  log.fill = fill; log.steps.push("buy_filled");

  // Sell only what this trade bought (fee is negative and charged in base on spot buys), never the user's older coins.
  let qty = fill.filled + (fill.feeCcy === base ? fill.fee : 0);
  try { const b2 = await okx.balances(); const nowAvail = (b2.ccy[base] && b2.ccy[base].avail) || 0; qty = Math.min(qty, Math.max(0, nowAvail - baseBefore) || qty, nowAvail); } catch {}
  const sz = floorTo(qty, inst.lotSz);
  log.qty = parseFloat(sz);
  log.tp = roundTo(takeProfit, inst.tickSz); log.sl = roundTo(stopLoss, inst.tickSz);
  if (log.qty < inst.minSz) { log.steps.push("oco_skipped_small"); log.error = "oco_too_small"; return log; }
  try { log.algoId = await okx.oco(instId, sz, log.tp, log.sl); log.steps.push("oco_placed"); }
  catch (e) { log.steps.push("oco_failed"); log.error = "oco_failed"; log.errorMsg = e.message; }
  return log;
}

// Close a KimMarket trade: cancel its OCO, then market-sell the quantity it bought.
export async function closeTrade(okx, trade) {
  if (trade.algoId) { try { await okx.cancelAlgo(trade.instId, trade.algoId); } catch {} }
  const inst = await okx.instrument(trade.instId);
  const base = trade.instId.split("-")[0];
  const bal = await okx.balances();
  const avail = (bal.ccy[base] && bal.ccy[base].avail) || 0;
  const sz = floorTo(Math.min(trade.qty, avail), inst.lotSz);
  if (parseFloat(sz) < inst.minSz) throw new OkxError("nothing_to_sell", "nothing_to_sell");
  return okx.marketSell(trade.instId, sz);
}

// AI manager raised the stop: cancel the old OCO and place a new one (same qty + take-profit, higher stop).
export async function replaceStop(okx, trade, newStop) {
  const inst = await okx.instrument(trade.instId);
  const last = await okx.ticker(trade.instId);
  if (!(newStop < last)) throw new OkxError("stop_above_price", "stop_above_price");
  if (trade.algoId) await okx.cancelAlgo(trade.instId, trade.algoId);
  const sl = roundTo(newStop, inst.tickSz);
  const algoId = await okx.oco(trade.instId, floorTo(trade.qty, inst.lotSz), trade.tp, sl);
  return { ...trade, algoId, sl };
}

// Was the trade already closed on OKX (take-profit / stop-loss hit, or sold manually)? Uses total equity of the coin, incl. frozen.
export function isGone(bal, trade) {
  const base = trade.instId.split("-")[0];
  const eq = (bal.ccy[base] && bal.ccy[base].eq) || 0;
  return eq < (trade.qty || 0) * 0.5;
}

// ---------------------------------------------------------------- market scanner (public OKX data, runs on the phone)
const STABLE = new Set(["USDC", "DAI", "FDUSD", "TUSD", "USDE", "PYUSD", "USDD", "EUR", "EURT", "USDP", "BUSD", "USTC", "UST", "XAUT", "PAXG", "WBTC", "STETH", "WETH", "USDG", "RLUSD"]);
const sma = (a, n) => (a.length >= n ? a.slice(-n).reduce((s, x) => s + x, 0) / n : null);
function rsi(closes, n = 14) {
  if (closes.length <= n) return null;
  let g = 0, l = 0;
  for (let i = closes.length - n; i < closes.length; i++) { const d = closes[i] - closes[i - 1]; if (d > 0) g += d; else l -= d; }
  return l === 0 ? 100 : 100 - 100 / (1 + g / l);
}
const r2 = (x, d = 2) => (x == null || !isFinite(x) ? null : +x.toFixed(d));

export function scoreCandles(c) { // c: closes oldest -> newest (1h)
  const last = c[c.length - 1], s20 = sma(c, 20), s50 = sma(c, 50), R = rsi(c);
  let atr = 0; for (let i = c.length - 24; i < c.length; i++) atr += Math.abs(c[i] / c[i - 1] - 1); atr = (atr / 24) * 100;
  const chg4h = (last / c[c.length - 5] - 1) * 100, hi = Math.max(...c.slice(-48)), lo = Math.min(...c.slice(-48));
  let score = 0;
  if (s20 && s50 && last > s20 && s20 > s50) score += 3; else if (s20 && last > s20) score += 1; else score -= 2;
  if (R != null) { if (R >= 50 && R <= 68) score += 2; else if (R > 75) score -= 3; else if (R < 40) score -= 1; }
  if (chg4h > 0 && chg4h < 6) score += 1; if (chg4h >= 8) score -= 1;
  const fromHi = (hi / last - 1) * 100; if (fromHi > 1 && fromHi < 12) score += 1;
  return { last, sma20: r2(s20, 8), sma50: r2(s50, 8), rsi14: r2(R, 1), chg4h: r2(chg4h), atrPct: r2(atr), high48h: hi, low48h: lo, score, closes12h: c.slice(-12).map((x) => +x.toPrecision(6)) };
}

export async function scanMarket(fetchImpl = fetch, { minVol = 1e7, max = 6 } = {}) {
  const base = "https://www.okx.com";
  const t = await fetchImpl(base + "/api/v5/market/tickers?instType=SPOT").then((r) => r.json());
  const tick = (t.data || []).filter((x) => x.instId.endsWith("-USDT") && !STABLE.has(x.instId.split("-")[0]))
    .map((x) => { const last = parseFloat(x.last), open = parseFloat(x.open24h); return { instId: x.instId, last, chg24: r2((last / open - 1) * 100), vol24: Math.round(parseFloat(x.volCcy24h) || 0) }; })
    .filter((x) => x.last > 0 && x.vol24 >= minVol && x.chg24 > -4 && x.chg24 < 18)
    .sort((a, b) => (b.chg24 + Math.log10(b.vol24) * 2) - (a.chg24 + Math.log10(a.vol24) * 2))
    .slice(0, 14);
  const out = [];
  for (const x of tick) {
    try {
      const k = await fetchImpl(`${base}/api/v5/market/candles?instId=${x.instId}&bar=1H&limit=100`).then((r) => r.json());
      const closes = (k.data || []).map((row) => parseFloat(row[4])).reverse();
      if (closes.length < 60) continue;
      out.push({ ...x, ...scoreCandles(closes), last: x.last });
    } catch {}
  }
  return out.filter((x) => x.score >= 3).sort((a, b) => b.score - a.score || b.vol24 - a.vol24).slice(0, max);
}
