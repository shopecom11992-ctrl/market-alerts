// KimMarket.ai : crypto & stock news alerts + AI analysis in Darija / Arabic / French / English.
// Prototype for Expo (runs in Expo Go via Snack). Payments are simulated; real billing comes with RevenueCat.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, FlatList, KeyboardAvoidingView, Linking, Platform, Pressable, RefreshControl,
  SafeAreaView, ScrollView, StatusBar, StyleSheet, Switch, Text, TextInput, View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Defs, Line, LinearGradient, Path, Stop, Text as SvgText } from "react-native-svg";
import * as SecureStore from "expo-secure-store";
import { LANGS, isRTL, strings } from "./i18n";
import { createOkx, executePlan, closeTrade, floorTo } from "./okx";

const API = "https://market-qa-bot.shopecom11992.workers.dev/api";
const HDR = { "Content-Type": "application/json", "X-App": "kimmarket" };
const TRIAL_DAYS = 7;
// Placeholder prices for the prototype — real prices are set per country in App Store Connect / Play Console.
const PLANS = { monthly: { price: "$4.99", n: 4.99 }, yearly: { price: "$39.99", n: 39.99 } };

const C = { bg: "#0B0F14", card: "#141A22", card2: "#1B2330", line: "#243041", text: "#E8EEF5", sub: "#8FA1B5", green: "#22C55E", red: "#EF4444", amber: "#F59E0B", accent: "#2DD4BF" };

// ------------------------------------------------------------------ storage helpers
const store = {
  async get(k, d) { try { const v = await AsyncStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  async set(k, v) { try { await AsyncStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// OKX keys: encrypted device keychain only (never AsyncStorage, never our server)
const secure = {
  async get() { try { const v = await SecureStore.getItemAsync("okx_creds"); return v ? JSON.parse(v) : null; } catch { return null; } },
  async set(c) { try { await SecureStore.setItemAsync("okx_creds", JSON.stringify(c)); } catch {} },
  async del() { try { await SecureStore.deleteItemAsync("okx_creds"); } catch {} },
};

async function api(path, opt = {}) {
  const r = await fetch(API + path, { ...opt, headers: HDR });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(body.error || "http_" + r.status); e.code = body.error; throw e; }
  return body;
}

// ------------------------------------------------------------------ app
export default function App() {
  const [ready, setReady] = useState(false);
  const [lang, setLang] = useState("darija");
  const [tab, setTab] = useState("alerts");
  const [sub, setSub] = useState({ trialStart: null, plan: null }); // plan set = subscribed (simulated)
  const [showPaywall, setShowPaywall] = useState(false);
  const [chatSeed, setChatSeed] = useState(null);
  const [paper, setPaperState] = useState(PAPER0());
  const setPaper = (p) => { if (p) { setPaperState(p); store.set("paper", p); } };
  const [okxCreds, setOkxCreds] = useState(null);
  const [okxCfg, setOkxCfgState] = useState({ pct: 10 });
  const [okxTrades, setOkxTradesState] = useState([]);
  const setOkxCfg = (c) => { setOkxCfgState(c); store.set("okxCfg", c); };
  const setOkxTrades = (fn) => setOkxTradesState((prev) => { const n = typeof fn === "function" ? fn(prev) : fn; store.set("okxTrades", n.slice(0, 50)); return n; });
  const okx = useMemo(() => (okxCreds ? createOkx(okxCreds) : null), [okxCreds]);
  const okxProps = { okx, okxCreds, setOkxCreds, okxCfg, setOkxCfg, okxTrades, setOkxTrades };
  const t = strings(lang), rtl = isRTL(lang);

  useEffect(() => { (async () => {
    setLang(await store.get("lang", "darija"));
    setOkxCreds(await secure.get());
    setOkxCfgState(await store.get("okxCfg", { pct: 10 }));
    setOkxTradesState(await store.get("okxTrades", []));
    const pp = await store.get("paper", null);
    if (pp) setPaperState(await runPaperBot(pp, strings(await store.get("lang", "darija")))); // bot catches up on news since last open
    const s = await store.get("sub", { trialStart: null, plan: null });
    setSub(s);
    if (!s.trialStart && !s.plan) setShowPaywall(true);
    setReady(true);
  })(); }, []);

  const daysLeft = sub.trialStart ? Math.max(0, TRIAL_DAYS - Math.floor((Date.now() - sub.trialStart) / 86400000)) : 0;
  const hasAccess = !!sub.plan || (sub.trialStart && daysLeft > 0);

  const changeLang = (l) => { setLang(l); store.set("lang", l); };
  const startTrial = (plan) => { const s = { trialStart: Date.now(), plan: null, chosen: plan }; setSub(s); store.set("sub", s); setShowPaywall(false); };
  const subscribe = (plan) => { const s = { ...sub, plan }; setSub(s); store.set("sub", s); setShowPaywall(false); };
  const askAbout = (q) => { setChatSeed({ q, at: Date.now() }); setTab("chat"); };

  if (!ready) return <View style={[st.fill, st.center]}><ActivityIndicator color={C.accent} /></View>;

  if (showPaywall || !hasAccess) {
    return <Paywall t={t} rtl={rtl} lang={lang} onLang={changeLang} trialUsed={!!sub.trialStart} onTrial={startTrial} onSubscribe={subscribe}
      onClose={hasAccess ? () => setShowPaywall(false) : null} />;
  }

  return (
    <SafeAreaView style={st.fill}>
      <StatusBar barStyle="light-content" />
      <View style={[st.header, rtl && st.rowRev]}>
        <Text style={st.logo}>📈 {t.appName}</Text>
        {!sub.plan && <Text style={st.trialPill}>{t.trialLeft(daysLeft)}</Text>}
      </View>
      <View style={st.fill}>
        {tab === "alerts" && <Alerts t={t} rtl={rtl} />}
        {tab === "chat" && <Chat t={t} rtl={rtl} lang={lang} seed={chatSeed} />}
        {tab === "markets" && <Markets t={t} rtl={rtl} lang={lang} onAnalyse={askAbout} paper={paper} setPaper={setPaper} okxProps={okxProps} />}
        {tab === "portfolio" && <Portfolio t={t} rtl={rtl} paper={paper} setPaper={setPaper} />}
        {tab === "settings" && <Settings t={t} rtl={rtl} lang={lang} onLang={changeLang} sub={sub} daysLeft={daysLeft} onPlans={() => setShowPaywall(true)} okxProps={okxProps} />}
      </View>
      <View style={[st.tabs, rtl && st.rowRev]}>
        {[["alerts", "notifications", t.tabAlerts], ["chat", "chatbubbles", t.tabChat], ["markets", "stats-chart", t.tabMarkets], ["portfolio", "wallet", t.tabPortfolio], ["settings", "settings", t.tabSettings]].map(([k, icon, label]) => (
          <Pressable key={k} style={st.tab} onPress={() => setTab(k)} accessibilityRole="tab" accessibilityState={{ selected: tab === k }}>
            <Ionicons name={tab === k ? icon : icon + "-outline"} size={22} color={tab === k ? C.accent : C.sub} />
            <Text style={[st.tabText, tab === k && { color: C.accent }]}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

// ------------------------------------------------------------------ Alerts
function Alerts({ t, rtl }) {
  const [items, setItems] = useState(null);
  const [err, setErr] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState(null);

  const load = useCallback(async () => {
    try { setErr(null); const r = await api("/alerts"); setItems(r.alerts || []); }
    catch { setErr(t.error); setItems((x) => x || []); }
  }, [t]);
  useEffect(() => { load(); }, [load]);
  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  if (items === null) return <View style={[st.fill, st.center]}><ActivityIndicator color={C.accent} /></View>;
  return (
    <FlatList
      data={items}
      keyExtractor={(a, i) => a.link || String(i)}
      contentContainerStyle={{ padding: 14, paddingBottom: 30 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.accent} />}
      ListHeaderComponent={<Text style={[st.h1, rtl && st.rtl]}>{t.alertsTitle}</Text>}
      ListEmptyComponent={<Text style={[st.empty, rtl && st.rtl]}>{err || t.alertsEmpty}</Text>}
      renderItem={({ item, index }) => {
        const isOpen = open === index;
        const urgent = !item.msg || item.msg.startsWith("🔴");
        return (
          <Pressable style={st.card} onPress={() => setOpen(isOpen ? null : index)}>
            <View style={[st.row, rtl && st.rowRev, { justifyContent: "space-between" }]}>
              <Text style={[st.badge, { backgroundColor: urgent ? "#3A1414" : "#3A2A10", color: urgent ? C.red : C.amber }]}>{urgent ? "🔴" : "🟠"} {item.impact ? `${t.impact} ${item.impact}/10` : ""}</Text>
              <Text style={st.time}>{fmtTime(item.ts)}</Text>
            </View>
            <Text style={st.alertTitle}>{headline(item)}</Text>
            {isOpen && item.msg ? <Text style={[st.body, rtl && st.rtl]}>{stripMd(item.msg)}</Text> : null}
            <View style={[st.row, rtl && st.rowRev, { marginTop: 8, gap: 16 }]}>
              {item.msg ? <Text style={st.link}>{isOpen ? t.readLess : t.readMore}</Text> : null}
              {item.link ? <Text style={st.link} onPress={() => Linking.openURL(item.link)}>{t.openSource} ↗</Text> : null}
            </View>
          </Pressable>
        );
      }}
    />
  );
}

// ------------------------------------------------------------------ Chat
function Chat({ t, rtl, lang, seed }) {
  const [msgs, setMsgs] = useState([{ id: "hello", me: false, text: t.chatHello }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef(null);

  const send = useCallback(async (text) => {
    const q = (text || "").trim();
    if (!q || busy) return;
    setInput(""); setBusy(true);
    setMsgs((m) => [...m, { id: "u" + Date.now(), me: true, text: q }, { id: "p" + Date.now(), me: false, pending: true, text: t.thinking }]);
    let reply;
    try { reply = (await api("/chat", { method: "POST", body: JSON.stringify({ text: q, lang }) })).reply; }
    catch (e) { reply = e.code === "rate_limited" ? t.rateLimited : t.error; }
    setMsgs((m) => [...m.filter((x) => !x.pending), { id: "b" + Date.now(), me: false, text: stripMd(reply) }]);
    setBusy(false);
  }, [busy, lang, t]);

  useEffect(() => { if (seed && seed.q) send(seed.q); }, [seed]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setTimeout(() => listRef.current && listRef.current.scrollToEnd({ animated: true }), 50); }, [msgs]);

  return (
    <KeyboardAvoidingView style={st.fill} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <FlatList
        ref={listRef}
        data={msgs}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 14 }}
        renderItem={({ item }) => (
          <View style={[st.bubble, item.me ? st.me : st.bot, item.me ? (rtl ? st.left : st.right) : (rtl ? st.right : st.left)]}>
            {item.pending ? <View style={[st.row, { gap: 8 }]}><ActivityIndicator size="small" color={C.accent} /><Text style={st.sub}>{item.text}</Text></View>
              : <Text selectable style={[st.bubbleText, rtl && st.rtl]}>{item.text}</Text>}
          </View>
        )}
        ListFooterComponent={msgs.length <= 1 ? (
          <View style={[st.row, rtl && st.rowRev, { flexWrap: "wrap", gap: 8, marginTop: 6 }]}>
            {t.suggestions.map((s) => <Pressable key={s} style={st.chip} onPress={() => send(s)}><Text style={st.chipText}>{s}</Text></Pressable>)}
          </View>
        ) : null}
      />
      <View style={[st.inputBar, rtl && st.rowRev]}>
        <TextInput style={[st.input, rtl && st.rtl]} placeholder={t.chatPlaceholder} placeholderTextColor={C.sub} value={input}
          onChangeText={setInput} onSubmitEditing={() => send(input)} returnKeyType="send" editable={!busy} />
        <Pressable style={[st.sendBtn, (busy || !input.trim()) && { opacity: 0.4 }]} onPress={() => send(input)} disabled={busy || !input.trim()} accessibilityLabel={t.send}>
          <Ionicons name="send" size={18} color="#04110F" style={rtl ? { transform: [{ scaleX: -1 }] } : null} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

// ------------------------------------------------------------------ Markets: search anything + watchlist
const DEFAULT_WATCH = [{ symbol: "BTC-USD", name: "Bitcoin", type: "crypto", cgId: "bitcoin", base: "BTC" }, { symbol: "NVDA", name: "NVIDIA", type: "stock" }, { symbol: "GC=F", name: "Gold", type: "commodity" }];

function Markets({ t, rtl, lang, onAnalyse, paper, setPaper, okxProps }) {
  const [list, setList] = useState([]);
  const [quotes, setQuotes] = useState({});
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [asset, setAsset] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadQuotes = useCallback(async (l) => {
    if (!l.length) return;
    try { const r = await api("/quote?symbols=" + encodeURIComponent(l.map((a) => a.symbol).join(","))); const m = {}; (r.quotes || []).forEach((x) => { m[x.symbol] = x; }); setQuotes(m); } catch {}
  }, []);
  useEffect(() => { (async () => { const l = await store.get("watch", DEFAULT_WATCH); setList(l); loadQuotes(l); })(); }, [loadQuotes]);

  const save = (l) => { setList(l); store.set("watch", l); loadQuotes(l); };
  const toggleWatch = (a) => save(list.some((x) => x.symbol === a.symbol) ? list.filter((x) => x.symbol !== a.symbol) : [...list, a]);
  const search = async () => {
    const query = q.trim(); if (!query) { setResults(null); return; }
    setSearching(true);
    try { setResults((await api("/search?q=" + encodeURIComponent(query))).results || []); } catch { setResults([]); }
    setSearching(false);
  };
  const refresh = async () => { setRefreshing(true); await loadQuotes(list); setRefreshing(false); };

  if (asset) return <AssetView t={t} rtl={rtl} lang={lang} okxProps={okxProps} asset={asset} onBack={() => setAsset(null)} onAnalyse={onAnalyse}
    inWatch={list.some((x) => x.symbol === asset.symbol)} onToggleWatch={() => toggleWatch(asset)} paper={paper} setPaper={setPaper} />;

  return (
    <FlatList
      data={list}
      keyExtractor={(a) => a.symbol}
      contentContainerStyle={{ padding: 14, paddingBottom: 30 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.accent} />}
      ListHeaderComponent={<>
        <View style={[st.row, rtl && st.rowRev, { gap: 8, marginBottom: 10 }]}>
          <TextInput style={[st.input, { flex: 1 }, rtl && st.rtl]} placeholder={t.searchPlaceholder} placeholderTextColor={C.sub} value={q}
            onChangeText={(v) => { setQ(v); if (!v.trim()) setResults(null); }} onSubmitEditing={search} autoCapitalize="none" returnKeyType="search" />
          <Pressable style={st.btnSmall} onPress={search} disabled={searching}>{searching ? <ActivityIndicator color="#04110F" /> : <Ionicons name="search" size={18} color="#04110F" />}</Pressable>
        </View>
        {results && (
          <View style={[st.card, { paddingVertical: 4 }]}>
            {results.length === 0 ? <Text style={[st.sub, { padding: 10 }, rtl && st.rtl]}>{t.noResults}</Text> : results.map((r) => (
              <Pressable key={r.symbol + (r.cgId || "")} style={[st.row, rtl && st.rowRev, st.resultRow]} onPress={() => setAsset(r)}>
                <Text style={[st.typeTag, r.type === "crypto" && { color: C.amber }]}>{(t.types && t.types[r.type]) || r.type}</Text>
                <View style={{ flex: 1, marginHorizontal: 10 }}>
                  <Text style={[st.sym, { fontSize: 15 }, rtl && st.rtl]}>{r.symbol.replace(/\d*-USD$/, "")}{r.rank ? `  #${r.rank}` : ""}</Text>
                  <Text style={[st.sub, rtl && st.rtl]} numberOfLines={1}>{r.name}{r.exchange ? ` · ${r.exchange}` : ""}</Text>
                </View>
                <Ionicons name={rtl ? "chevron-back" : "chevron-forward"} size={18} color={C.sub} />
              </Pressable>
            ))}
          </View>
        )}
        <Text style={[st.h1, { fontSize: 18, marginTop: 6 }, rtl && st.rtl]}>{t.watchTitle}</Text>
      </>}
      ListEmptyComponent={<Text style={[st.empty, rtl && st.rtl]}>{t.watchEmpty}</Text>}
      renderItem={({ item }) => {
        const p = quotes[item.symbol] || {};
        const up = (p.chg1d || 0) >= 0;
        return (
          <Pressable style={[st.card, st.row, rtl && st.rowRev, { justifyContent: "space-between" }]} onPress={() => setAsset(item)}>
            <View style={{ flex: 1 }}>
              <Text style={[st.sym, rtl && st.rtl]}>{item.symbol.replace(/\d*-USD$/, "")}</Text>
              <Text style={[st.sub, rtl && st.rtl]} numberOfLines={1}>{item.name}</Text>
            </View>
            <View style={{ alignItems: "flex-end", marginHorizontal: 12 }}>
              <Text style={st.price}>{p.last != null ? fmtPrice(p.last) : "—"}</Text>
              {p.chg1d != null ? <Text style={{ color: up ? C.green : C.red, fontWeight: "600" }}>{up ? "▲" : "▼"} {Math.abs(p.chg1d).toFixed(2)}% <Text style={st.sub}>{t.today}</Text></Text> : null}
            </View>
            <Ionicons name={rtl ? "chevron-back" : "chevron-forward"} size={18} color={C.sub} />
          </Pressable>
        );
      }}
    />
  );
}

// ------------------------------------------------------------------ Asset detail: chart, analyse, exchanges, paper trade
const EXCHANGES = [
  ["Binance", (b) => `https://www.binance.com/en/trade/${b}_USDT?type=spot`],
  ["OKX", (b) => `https://www.okx.com/trade-spot/${b.toLowerCase()}-usdt`],
  ["Coinbase", (b) => `https://www.coinbase.com/advanced-trade/spot/${b}-USD`],
];

function AssetView({ t, rtl, lang, asset, onBack, onAnalyse, inWatch, onToggleWatch, paper, setPaper, okxProps }) {
  const [range, setRange] = useState("1mo");
  const [chart, setChart] = useState(null);
  const [amount, setAmount] = useState("500");
  const [note, setNote] = useState(null);
  const isCrypto = asset.type === "crypto" || /-USD$/.test(asset.symbol);
  const base = asset.base || asset.symbol.replace(/\d*-USD$/, "");

  useEffect(() => { let live = true; setChart(null);
    api(`/chart?symbol=${encodeURIComponent(asset.symbol)}&range=${range}${asset.cgId ? "&cg=" + encodeURIComponent(asset.cgId) : ""}`)
      .then((c) => live && setChart(c)).catch(() => live && setChart({ points: [] }));
    return () => { live = false; };
  }, [asset.symbol, asset.cgId, range]);

  const pts = (chart && chart.points) || [];
  const first = pts.length ? pts[0][1] : null, last = chart && chart.last != null ? chart.last : pts.length ? pts[pts.length - 1][1] : null;
  const chg = first && last ? ((last / first) - 1) * 100 : null;
  const pos = paper.positions[asset.symbol];

  const trade = (side) => {
    if (!last) return;
    const r = side === "buy" ? paperBuy(paper, asset, last, parseFloat(amount) || 0, t.reasonManual) : paperSell(paper, asset.symbol, last, t.reasonManual);
    if (r.error) { setNote(t.notEnoughCash); return; }
    setPaper(r.paper); setNote(null);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Pressable onPress={onBack} style={[st.row, rtl && st.rowRev, { gap: 4, marginBottom: 8 }]}>
        <Ionicons name={rtl ? "chevron-forward" : "chevron-back"} size={20} color={C.accent} /><Text style={st.link}>{t.back}</Text>
      </Pressable>
      <Text style={[st.h1, { marginBottom: 2 }, rtl && st.rtl]}>{asset.name}</Text>
      <Text style={[st.sub, rtl && st.rtl]}>{asset.symbol} · {(t.types && t.types[asset.type]) || asset.type || ""}</Text>
      <View style={[st.row, rtl && st.rowRev, { gap: 10, marginTop: 10, alignItems: "baseline" }]}>
        <Text style={{ color: C.text, fontSize: 30, fontWeight: "900" }}>{last != null ? fmtPrice(last) : "—"}</Text>
        {chg != null ? <Text style={{ color: chg >= 0 ? C.green : C.red, fontWeight: "800", fontSize: 16 }}>{chg >= 0 ? "▲" : "▼"} {Math.abs(chg).toFixed(2)}% · {t.ranges[range]}</Text> : null}
      </View>
      <View style={[st.card, { marginTop: 12, paddingHorizontal: 6 }]}>
        {chart === null ? <View style={{ height: 200, justifyContent: "center" }}><ActivityIndicator color={C.accent} /></View>
          : pts.length > 1 ? <LineChart points={pts} up={chg == null || chg >= 0} range={range} /> : <Text style={[st.empty, { marginTop: 70, height: 130 }]}>{t.chartNA}</Text>}
        <View style={[st.row, { justifyContent: "center", gap: 8, marginTop: 6 }]}>
          {["5d", "1mo", "3mo", "1y"].map((r) => (
            <Pressable key={r} style={[st.chip, { paddingVertical: 5 }, range === r && st.chipOn]} onPress={() => setRange(r)}>
              <Text style={[st.chipText, range === r && { color: "#04110F" }]}>{t.ranges[r]}</Text>
            </Pressable>
          ))}
        </View>
        {chart && chart.src ? <Text style={[st.sub, { textAlign: "center", marginTop: 6, fontSize: 11 }]}>{chart.src}</Text> : null}
      </View>
      <View style={[st.row, rtl && st.rowRev, { gap: 8, marginTop: 4 }]}>
        <Pressable style={[st.cta, { flex: 1, marginTop: 0, paddingVertical: 12 }]} onPress={() => onAnalyse(asset.name && !/^[A-Z0-9.^=-]+$/.test(asset.name) ? asset.name : asset.symbol)}>
          <Text style={[st.ctaText, { fontSize: 15 }]}>🤖 {t.analyse}</Text>
        </Pressable>
        <Pressable style={[st.chip, { paddingVertical: 12 }, inWatch && st.chipOn]} onPress={onToggleWatch}>
          <Text style={[st.chipText, inWatch && { color: "#04110F" }]}>{inWatch ? t.inWatch : "⭐ " + t.addWatch}</Text>
        </Pressable>
      </View>
      {isCrypto ? (
        <View style={[st.card, { marginTop: 12 }]}>
          <Text style={[st.label, rtl && st.rtl]}>{t.openIn}</Text>
          <View style={[st.row, rtl && st.rowRev, { gap: 8, flexWrap: "wrap" }]}>
            {EXCHANGES.map(([name, url]) => (
              <Pressable key={name} style={st.exBtn} onPress={() => Linking.openURL(url(base))}><Text style={st.exText}>{name} ↗</Text></Pressable>
            ))}
          </View>
          <Text style={[st.sub, { marginTop: 8, fontSize: 12 }, rtl && st.rtl]}>{t.openInNote}</Text>
        </View>
      ) : null}
      <TradePlan t={t} rtl={rtl} lang={lang} asset={asset} base={base} isCrypto={isCrypto} {...okxProps} />
      <View style={[st.card, { marginTop: 12 }]}>
        <Text style={[st.label, rtl && st.rtl]}>{t.pfTitle} · {t.cash}: ${fmtMoney(paper.cash)}</Text>
        {pos ? <Text style={[st.body, { marginTop: 0, marginBottom: 8 }, rtl && st.rtl]}>{fmtQty(pos.qty)} @ {fmtPrice(pos.entry)} → {last ? pnlText(pos, last) : ""}</Text> : null}
        <View style={[st.row, rtl && st.rowRev, { gap: 8 }]}>
          <TextInput style={[st.input, { flex: 1 }]} keyboardType="numeric" value={amount} onChangeText={setAmount} placeholder={t.amountUsd} placeholderTextColor={C.sub} />
          <Pressable style={[st.btnSmall, { backgroundColor: C.green }]} onPress={() => trade("buy")}><Text style={st.btnSmallText}>{t.paperBuy}</Text></Pressable>
          {pos ? <Pressable style={[st.btnSmall, { backgroundColor: C.red }]} onPress={() => trade("sell")}><Text style={[st.btnSmallText, { color: "#fff" }]}>{t.paperSell}</Text></Pressable> : null}
        </View>
        {note ? <Text style={{ color: C.red, marginTop: 6 }}>{note}</Text> : null}
      </View>
    </ScrollView>
  );
}

// ------------------------------------------------------------------ OKX connection (Settings)
function OkxSettings({ t, rtl, okx, okxCreds, setOkxCreds, okxCfg, setOkxCfg }) {
  const [f, setF] = useState({ key: "", secret: "", passphrase: "", demo: true });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [bal, setBal] = useState(null);

  useEffect(() => { if (!okx) return; okx.balances().then((b) => setBal(b)).catch(() => {}); }, [okx]);

  const save = async () => {
    const c = { key: f.key.trim(), secret: f.secret.trim(), passphrase: f.passphrase.trim(), demo: f.demo };
    if (!c.key || !c.secret || !c.passphrase) return;
    setBusy(true); setMsg(null);
    try {
      const b = await createOkx(c).balances();
      await secure.set(c); setOkxCreds(c); setBal(b); setF({ key: "", secret: "", passphrase: "", demo: true });
    } catch (e) { setMsg(t.okxErr(e.code || "network")); }
    setBusy(false);
  };
  const disconnect = async () => { await secure.del(); setOkxCreds(null); setBal(null); };

  return (
    <View>
      <Text style={[st.label, rtl && st.rtl, { marginTop: 18 }]}>{t.okxTitle}</Text>
      <View style={st.card}>
        <Text style={[st.sub, { fontSize: 12, marginBottom: 10 }, rtl && st.rtl]}>{t.okxDesc}</Text>
        {okxCreds ? (
          <View>
            <Text style={[st.body, { marginTop: 0, color: C.green, fontWeight: "800" }, rtl && st.rtl]}>{t.connected} · {okxCreds.demo ? t.demoMode : t.liveMode}</Text>
            {bal ? <Text style={[st.body, rtl && st.rtl]}>{t.balanceUsdt}: {fmtMoney((bal.ccy.USDT && bal.ccy.USDT.avail) || 0)}</Text> : null}
            <Text style={[st.sub, { marginTop: 10 }, rtl && st.rtl]}>{t.defaultPct}</Text>
            <View style={[st.row, rtl && st.rowRev, { gap: 8, flexWrap: "wrap", marginTop: 6 }]}>
              {[5, 10, 25, 50].map((p) => (
                <Pressable key={p} style={[st.chip, okxCfg.pct === p && st.chipOn]} onPress={() => setOkxCfg({ ...okxCfg, pct: p })}>
                  <Text style={[st.chipText, okxCfg.pct === p && { color: "#04110F" }]}>{p}%</Text>
                </Pressable>
              ))}
            </View>
            <Pressable style={[st.chip, { marginTop: 12, alignSelf: rtl ? "flex-end" : "flex-start" }]} onPress={disconnect}><Text style={[st.chipText, { color: C.red }]}>{t.disconnect}</Text></Pressable>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            <TextInput style={st.input} placeholder={t.apiKey} placeholderTextColor={C.sub} value={f.key} onChangeText={(v) => setF({ ...f, key: v })} autoCapitalize="none" autoCorrect={false} />
            <TextInput style={st.input} placeholder={t.apiSecret} placeholderTextColor={C.sub} value={f.secret} onChangeText={(v) => setF({ ...f, secret: v })} secureTextEntry autoCapitalize="none" autoCorrect={false} />
            <TextInput style={st.input} placeholder={t.passphrase} placeholderTextColor={C.sub} value={f.passphrase} onChangeText={(v) => setF({ ...f, passphrase: v })} secureTextEntry autoCapitalize="none" autoCorrect={false} />
            <View style={[st.row, rtl && st.rowRev, { justifyContent: "space-between", alignItems: "center" }]}>
              <Text style={[st.body, { marginTop: 0 }]}>{f.demo ? t.demoMode : t.liveMode}</Text>
              <Switch value={!f.demo} onValueChange={(v) => setF({ ...f, demo: !v })} trackColor={{ true: C.red }} />
            </View>
            <Text style={[st.sub, { fontSize: 12, color: f.demo ? C.sub : C.amber }, rtl && st.rtl]}>{f.demo ? t.demoNote : t.liveWarn}</Text>
            <Pressable style={[st.cta, { marginTop: 4, paddingVertical: 12, opacity: busy ? 0.6 : 1 }]} onPress={save} disabled={busy}>
              <Text style={[st.ctaText, { fontSize: 15 }]}>{busy ? t.testing : t.saveTest}</Text>
            </Pressable>
            {msg ? <Text style={{ color: C.red }}>{msg}</Text> : null}
          </View>
        )}
      </View>
    </View>
  );
}

// ------------------------------------------------------------------ AI trade plan + confirmed execution on OKX
function TradePlan({ t, rtl, lang, asset, base, isCrypto, okx, okxCreds, okxCfg, okxTrades, setOkxTrades }) {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [usdtFree, setUsdtFree] = useState(null);
  const [pct, setPct] = useState(okxCfg.pct);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [manual, setManual] = useState("20");
  const instId = `${base}-USDT`;
  const mine = okxTrades.filter((x) => x.instId === instId && x.demo === (okxCreds && okxCreds.demo));
  const mode = okxCreds && okxCreds.demo ? "DEMO" : "LIVE";

  const refreshBal = () => okx && okx.balances().then((b) => setUsdtFree((b.ccy.USDT && b.ccy.USDT.avail) || 0)).catch(() => {});
  useEffect(() => { if (isCrypto) refreshBal(); }, [okx, isCrypto]);

  const getPlan = async () => {
    setLoading(true); setPlan(null); setConfirm(false); setMsg(null);
    try { const r = await api("/plan", { method: "POST", body: JSON.stringify({ symbol: asset.symbol, name: asset.name, cgId: asset.cgId, type: asset.type, lang }) }); setPlan(r.plan); }
    catch (e) { setMsg({ err: true, text: t.error }); }
    setLoading(false);
  };

  const usdt = usdtFree != null ? Math.floor(usdtFree * pct) / 100 : 0;

  const run = async (fn) => { setBusy(true); setMsg(null); try { await fn(); } catch (e) { setMsg({ err: true, text: t.okxErr(e.code || "network") }); } setBusy(false); refreshBal(); };

  const execute = () => run(async () => {
    const log = await executePlan(okx, { base, usdt, takeProfit: plan.takeProfit, stopLoss: plan.stopLoss });
    setConfirm(false);
    if (log.fill) setOkxTrades((prev) => [{ ...log, symbol: asset.symbol, open: true, source: "plan" }, ...prev]);
    if (log.error === "oco_failed" || log.error === "oco_too_small") setMsg({ err: true, text: t.ocoFailed });
    else if (log.error) setMsg({ err: true, text: t.okxErr(log.error) });
    else setMsg({ err: false, text: t.done(log.qty, base, fmtPrice(log.fill.avgPx)) });
  });
  const manualBuy = () => run(async () => {
    const v = Math.floor((parseFloat(manual) || 0) * 100) / 100; if (!v) return;
    const ordId = await okx.marketBuyUsdt(instId, v);
    await new Promise((r) => setTimeout(r, 800));
    const o = await okx.order(instId, ordId);
    if (o.filled > 0) setOkxTrades((prev) => [{ instId, symbol: asset.symbol, demo: okx.demo, ts: Date.now(), usdt: v, fill: o, qty: o.filled + (o.feeCcy === base ? o.fee : 0), open: true, source: "manual" }, ...prev]);
    setMsg({ err: false, text: t.done(fmtQty(o.filled), base, fmtPrice(o.avgPx)) });
  });
  const close = (tr) => run(async () => {
    await closeTrade(okx, tr);
    setOkxTrades((prev) => prev.map((x) => (x.ts === tr.ts && x.instId === tr.instId ? { ...x, open: false, closedAt: Date.now() } : x)));
  });

  const p = plan;
  return (
    <View style={[st.card, { marginTop: 12 }]}>
      <Pressable style={[st.cta, { marginTop: 0, paddingVertical: 12, opacity: loading ? 0.6 : 1 }]} onPress={getPlan} disabled={loading}>
        <Text style={[st.ctaText, { fontSize: 15 }]}>{loading ? t.planLoading : t.planBtn}</Text>
      </Pressable>
      {loading ? <ActivityIndicator color={C.accent} style={{ marginTop: 10 }} /> : null}
      {p ? (
        <View style={{ marginTop: 12 }}>
          <Text style={{ color: p.action === "buy" ? C.green : C.amber, fontWeight: "900", fontSize: 16, textAlign: rtl ? "right" : "left" }}>{p.action === "buy" ? t.planBuy : t.planWait}</Text>
          {p.action === "buy" ? (
            <View style={[st.row, rtl && st.rowRev, { flexWrap: "wrap", gap: 8, marginTop: 8 }]}>
              <Stat label={t.entry} value={fmtPrice(p.entry)} />
              <Stat label={t.slL} value={fmtPrice(p.stopLoss)} color={C.red} sub={`-${p.slPct}%`} />
              <Stat label={t.tpL} value={fmtPrice(p.takeProfit)} color={C.green} sub={`+${p.tpPct}%`} />
              <Stat label={t.rr} value={`1:${p.rr}`} sub={`${t.confidence}: ${(t.conf && t.conf[p.confidence]) || p.confidence || ""}`} />
            </View>
          ) : null}
          {p.summary ? <Text style={[st.body, rtl && st.rtl]}>{p.summary}</Text> : null}
          {p.reasons && p.reasons.length ? <Text style={[st.sub, { marginTop: 8 }, rtl && st.rtl]}>{t.reasons}: {p.reasons.map((r) => "• " + r).join("\n")}</Text> : null}
          {p.risks && p.risks.length ? <Text style={[st.sub, { marginTop: 6, color: C.amber }, rtl && st.rtl]}>{t.risks}: {p.risks.map((r) => "• " + r).join("\n")}</Text> : null}
          {p.timeframe ? <Text style={[st.sub, { marginTop: 6 }, rtl && st.rtl]}>{t.timeframe}: {(t.tf && t.tf[p.timeframe]) || p.timeframe}</Text> : null}
          <Text style={[st.sub, { marginTop: 8, fontSize: 11 }, rtl && st.rtl]}>{t.planDisclaimer}</Text>

          {p.action === "buy" && isCrypto ? (okx ? (
            <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10 }}>
              <Text style={[st.label, rtl && st.rtl]}>{t.useOfBalance} ({t.balanceUsdt}: {usdtFree != null ? fmtMoney(usdtFree) : "…"} · {mode})</Text>
              <View style={[st.row, rtl && st.rowRev, { gap: 8, flexWrap: "wrap" }]}>
                {[5, 10, 25, 50, 100].map((v) => (
                  <Pressable key={v} style={[st.chip, pct === v && st.chipOn]} onPress={() => { setPct(v); setConfirm(false); }}>
                    <Text style={[st.chipText, pct === v && { color: "#04110F" }]}>{v}%</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={[st.body, { fontWeight: "800" }, rtl && st.rtl]}>= {fmtMoney(usdt)} USDT</Text>
              {!confirm ? (
                <Pressable style={[st.cta, { backgroundColor: C.green, paddingVertical: 12, opacity: usdt > 0 ? 1 : 0.5 }]} disabled={!(usdt > 0) || busy} onPress={() => setConfirm(true)}>
                  <Text style={[st.ctaText, { fontSize: 15 }]}>{t.execute}</Text>
                </Pressable>
              ) : (
                <View style={{ marginTop: 10, padding: 10, borderRadius: 12, borderWidth: 2, borderColor: mode === "LIVE" ? C.red : C.amber }}>
                  <Text style={[st.body, { marginTop: 0 }, rtl && st.rtl]}>{t.confirmTitle(mode, fmtMoney(usdt), base)}</Text>
                  <Text style={[st.sub, { marginTop: 4 }, rtl && st.rtl]}>{t.slL} {fmtPrice(p.stopLoss)} · {t.tpL} {fmtPrice(p.takeProfit)}</Text>
                  {mode === "LIVE" ? <Text style={{ color: C.red, marginTop: 6 }}>{t.liveWarn}</Text> : null}
                  <View style={[st.row, rtl && st.rowRev, { gap: 8, marginTop: 10 }]}>
                    <Pressable style={[st.btnSmall, { backgroundColor: C.green, flex: 1, opacity: busy ? 0.6 : 1 }]} disabled={busy} onPress={execute}><Text style={st.btnSmallText}>{busy ? t.executing : t.confirmBtn}</Text></Pressable>
                    <Pressable style={[st.chip]} disabled={busy} onPress={() => setConfirm(false)}><Text style={st.chipText}>{t.cancel}</Text></Pressable>
                  </View>
                </View>
              )}
            </View>
          ) : <Text style={[st.sub, { marginTop: 10 }, rtl && st.rtl]}>{t.notConnected}</Text>) : null}
          {p.action === "buy" && !isCrypto ? <Text style={[st.sub, { marginTop: 10 }, rtl && st.rtl]}>{t.notCryptoOkx}</Text> : null}
        </View>
      ) : null}
      {msg ? <Text style={{ color: msg.err ? C.red : C.green, marginTop: 10, fontWeight: "700", textAlign: rtl ? "right" : "left" }}>{msg.text}</Text> : null}

      {isCrypto && okx ? (
        <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10 }}>
          <Text style={[st.label, rtl && st.rtl]}>{t.manualTitle} · {mode}</Text>
          <View style={[st.row, rtl && st.rowRev, { gap: 8 }]}>
            <TextInput style={[st.input, { flex: 1 }]} keyboardType="numeric" value={manual} onChangeText={setManual} placeholder="USDT" placeholderTextColor={C.sub} />
            <Pressable style={[st.btnSmall, { backgroundColor: C.green, opacity: busy ? 0.6 : 1 }]} disabled={busy} onPress={manualBuy}><Text style={st.btnSmallText}>{t.buyMarket}</Text></Pressable>
          </View>
          {mine.length ? <Text style={[st.label, { marginTop: 12 }, rtl && st.rtl]}>{t.trades}</Text> : null}
          {mine.slice(0, 10).map((tr) => (
            <View key={tr.ts} style={[st.row, rtl && st.rowRev, { justifyContent: "space-between", alignItems: "center", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.line }]}>
              <View style={{ flex: 1 }}>
                <Text style={[st.body, { marginTop: 0 }, rtl && st.rtl]}>{fmtQty(tr.qty || 0)} {base} @ {tr.fill ? fmtPrice(tr.fill.avgPx) : "—"} · {tr.open ? t.tradeOpen : t.tradeClosed}</Text>
                <Text style={[st.sub, { fontSize: 11 }, rtl && st.rtl]}>{fmtTime(new Date(tr.ts).toISOString())}{tr.sl ? ` · SL ${tr.sl} · TP ${tr.tp}` : ""}</Text>
              </View>
              {tr.open ? <Pressable style={[st.btnSmall, { backgroundColor: C.red, opacity: busy ? 0.6 : 1 }]} disabled={busy} onPress={() => close(tr)}><Text style={[st.btnSmallText, { color: "#fff" }]}>{t.closeTrade}</Text></Pressable> : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// Simple dependency-light line chart (react-native-svg)
function LineChart({ points, up, range }) {
  const [w, setW] = useState(0);
  const H = 190, P = 8;
  const ys = points.map((p) => p[1]);
  const min = Math.min(...ys), max = Math.max(...ys), span = max - min || 1;
  const t0 = points[0][0], t1 = points[points.length - 1][0], tspan = t1 - t0 || 1;
  const X = (tt) => P + ((tt - t0) / tspan) * (w - 2 * P), Y = (v) => P + (1 - (v - min) / span) * (H - 2 * P - 14);
  const d = w ? points.map((p, i) => `${i ? "L" : "M"}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(" ") : "";
  const area = d ? `${d} L${X(t1).toFixed(1)},${H - 14} L${X(t0).toFixed(1)},${H - 14} Z` : "";
  const col = up ? C.green : C.red;
  const fmtD = (ms) => { const dt = new Date(ms); return range === "5d" ? `${dt.getDate()}/${dt.getMonth() + 1} ${dt.getHours()}h` : `${dt.getDate()}/${dt.getMonth() + 1}${range === "1y" ? "/" + String(dt.getFullYear()).slice(2) : ""}`; };
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: H }}>
      {w ? (
        <Svg width={w} height={H}>
          <Defs><LinearGradient id="g" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={col} stopOpacity="0.28" /><Stop offset="1" stopColor={col} stopOpacity="0" /></LinearGradient></Defs>
          <Line x1={P} x2={w - P} y1={Y(max)} y2={Y(max)} stroke={C.line} strokeDasharray="3,4" />
          <Line x1={P} x2={w - P} y1={Y(min)} y2={Y(min)} stroke={C.line} strokeDasharray="3,4" />
          <Path d={area} fill="url(#g)" />
          <Path d={d} stroke={col} strokeWidth={2} fill="none" />
          <SvgText x={w - P} y={Y(max) - 3} fill={C.sub} fontSize="10" textAnchor="end">{fmtPrice(max)}</SvgText>
          <SvgText x={w - P} y={Y(min) + 11} fill={C.sub} fontSize="10" textAnchor="end">{fmtPrice(min)}</SvgText>
          <SvgText x={P} y={H - 2} fill={C.sub} fontSize="10">{fmtD(t0)}</SvgText>
          <SvgText x={w - P} y={H - 2} fill={C.sub} fontSize="10" textAnchor="end">{fmtD(t1)}</SvgText>
        </Svg>
      ) : null}
    </View>
  );
}

// ------------------------------------------------------------------ Paper trading (virtual money only)
const PAPER0 = (cap = 10000) => ({ startCap: cap, cash: cap, positions: {}, history: [], bot: { on: false, pct: 5, sl: 5, tp: 10, since: null, lastTs: null } });

function paperBuy(p, asset, price, usd, reason) {
  usd = Math.min(usd, p.cash);
  if (!(usd > 0) || !(price > 0)) return { error: "cash" };
  const qty = usd / price, old = p.positions[asset.symbol];
  const pos = old ? { ...old, qty: old.qty + qty, entry: (old.entry * old.qty + price * qty) / (old.qty + qty) }
                  : { symbol: asset.symbol, name: asset.name || asset.symbol, qty, entry: price, ts: Date.now() };
  return { paper: { ...p, cash: p.cash - usd, positions: { ...p.positions, [asset.symbol]: pos },
    history: [{ side: "buy", symbol: asset.symbol, qty, price, usd, reason, ts: Date.now() }, ...p.history].slice(0, 200) } };
}
function paperSell(p, symbol, price, reason) {
  const pos = p.positions[symbol];
  if (!pos || !(price > 0)) return { error: "nopos" };
  const usd = pos.qty * price, pnl = usd - pos.qty * pos.entry;
  const positions = { ...p.positions }; delete positions[symbol];
  return { paper: { ...p, cash: p.cash + usd, positions,
    history: [{ side: "sell", symbol, qty: pos.qty, price, usd, pnl, reason, ts: Date.now() }, ...p.history].slice(0, 200) } };
}

// The auto-bot: follows the news ideas (up -> buy, down -> sell) and enforces stop-loss / take-profit.
async function runPaperBot(p, t) {
  if (!p.bot.on) return p;
  let paper = p;
  try {
    const { alerts } = await api("/alerts");
    const fresh = (alerts || []).filter((a) => a.ideas && a.ideas.length && new Date(a.ts).getTime() > Math.max(paper.bot.since || 0, paper.bot.lastTs || 0))
      .sort((a, b) => new Date(a.ts) - new Date(b.ts));
    const syms = new Set(Object.keys(paper.positions));
    fresh.forEach((a) => a.ideas.forEach((i) => syms.add(i.symbol)));
    const quotes = {};
    if (syms.size) { const r = await api("/quote?symbols=" + encodeURIComponent([...syms].join(","))); (r.quotes || []).forEach((x) => { quotes[x.symbol] = x.last; }); }
    for (const a of fresh) {
      for (const i of a.ideas) {
        const px = quotes[i.symbol]; if (!px) continue;
        const why = `${t.reasonNews}: ${a.title.slice(0, 70)}`;
        if (i.direction === "up" && !paper.positions[i.symbol]) {
          const r = paperBuy(paper, { symbol: i.symbol, name: i.symbol }, px, paper.startCap * (paper.bot.pct / 100), why); if (r.paper) paper = r.paper;
        } else if (i.direction === "down" && paper.positions[i.symbol]) {
          const r = paperSell(paper, i.symbol, px, why); if (r.paper) paper = r.paper;
        }
      }
      paper = { ...paper, bot: { ...paper.bot, lastTs: new Date(a.ts).getTime() } };
    }
    for (const sym of Object.keys(paper.positions)) {
      const pos = paper.positions[sym], px = quotes[sym]; if (!px) continue;
      const ch = (px / pos.entry - 1) * 100;
      if (ch <= -paper.bot.sl) paper = paperSell(paper, sym, px, t.reasonSL).paper;
      else if (ch >= paper.bot.tp) paper = paperSell(paper, sym, px, t.reasonTP).paper;
    }
  } catch {}
  return paper;
}

function Portfolio({ t, rtl, paper, setPaper }) {
  const [quotes, setQuotes] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [capInput, setCapInput] = useState(String(paper.startCap));

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const p2 = await runPaperBot(paper, t);
    if (p2 !== paper) setPaper(p2);
    const syms = Object.keys(p2.positions);
    if (syms.length) { try { const r = await api("/quote?symbols=" + encodeURIComponent(syms.join(","))); const m = {}; (r.quotes || []).forEach((x) => { m[x.symbol] = x.last; }); setQuotes(m); } catch {} }
    setRefreshing(false);
  }, [paper, setPaper, t]);
  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const posVal = Object.values(paper.positions).reduce((s, p) => s + p.qty * (quotes[p.symbol] || p.entry), 0);
  const equity = paper.cash + posVal, pnl = equity - paper.startCap;
  const setBot = (k, v) => setPaper({ ...paper, bot: { ...paper.bot, [k]: v, ...(k === "on" && v ? { since: Date.now(), lastTs: null } : {}) } });
  const num = (v, d) => { const n = parseFloat(String(v).replace(",", ".")); return isFinite(n) && n > 0 ? n : d; };

  return (
    <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.accent} />}>
      <Text style={[st.h1, { marginBottom: 4 }, rtl && st.rtl]}>{t.pfTitle}</Text>
      <Text style={[st.sub, { marginBottom: 12 }, rtl && st.rtl]}>{t.pfNote}</Text>
      <View style={[st.card, st.row, rtl && st.rowRev, { justifyContent: "space-around" }]}>
        <Stat label={t.equity} value={"$" + fmtMoney(equity)} />
        <Stat label={t.pnl} value={(pnl >= 0 ? "+" : "") + "$" + fmtMoney(pnl)} color={pnl >= 0 ? C.green : C.red} sub={((pnl / paper.startCap) * 100).toFixed(2) + "%"} />
        <Stat label={t.cash} value={"$" + fmtMoney(paper.cash)} />
      </View>

      <View style={st.card}>
        <View style={[st.row, rtl && st.rowRev, { justifyContent: "space-between" }]}>
          <Text style={[st.planName, { fontSize: 16 }]}>{t.botTitle}</Text>
          <Pressable style={[st.chip, paper.bot.on && st.chipOn]} onPress={() => setBot("on", !paper.bot.on)}>
            <Text style={[st.chipText, paper.bot.on && { color: "#04110F" }]}>{paper.bot.on ? t.botOn : t.botOff}</Text>
          </Pressable>
        </View>
        <Text style={[st.sub, { marginTop: 6 }, rtl && st.rtl]}>{t.botDesc}</Text>
        {[["pct", t.perTrade], ["sl", t.sl], ["tp", t.tp]].map(([k, label]) => (
          <View key={k} style={[st.row, rtl && st.rowRev, { justifyContent: "space-between", marginTop: 8 }]}>
            <Text style={st.body}>{label}</Text>
            <TextInput style={[st.input, { flex: 0, width: 80, textAlign: "center" }]} keyboardType="numeric" defaultValue={String(paper.bot[k])}
              onEndEditing={(e) => setBot(k, Math.min(100, num(e.nativeEvent.text, paper.bot[k])))} />
          </View>
        ))}
      </View>

      <Text style={[st.label, { marginTop: 8 }, rtl && st.rtl]}>{t.positions}</Text>
      {Object.values(paper.positions).length === 0 ? <Text style={[st.sub, { marginBottom: 10 }, rtl && st.rtl]}>{t.noPositions}</Text> :
        Object.values(paper.positions).map((p) => {
          const px = quotes[p.symbol] || p.entry, v = p.qty * px, g = v - p.qty * p.entry;
          return (
            <View key={p.symbol} style={[st.card, st.row, rtl && st.rowRev, { justifyContent: "space-between" }]}>
              <View style={{ flex: 1 }}>
                <Text style={[st.sym, rtl && st.rtl]}>{p.symbol.replace(/\d*-USD$/, "")}</Text>
                <Text style={[st.sub, rtl && st.rtl]}>{fmtQty(p.qty)} @ {fmtPrice(p.entry)}</Text>
              </View>
              <View style={{ alignItems: "flex-end", marginHorizontal: 10 }}>
                <Text style={st.price}>${fmtMoney(v)}</Text>
                <Text style={{ color: g >= 0 ? C.green : C.red, fontWeight: "700" }}>{g >= 0 ? "+" : ""}{fmtMoney(g)} ({((px / p.entry - 1) * 100).toFixed(2)}%)</Text>
              </View>
              <Pressable style={st.chip} onPress={() => setPaper(paperSell(paper, p.symbol, px, t.reasonManual).paper)}><Text style={st.chipText}>{t.close}</Text></Pressable>
            </View>
          );
        })}

      <Text style={[st.label, { marginTop: 8 }, rtl && st.rtl]}>{t.history}</Text>
      {paper.history.slice(0, 30).map((h, i) => (
        <View key={i} style={[st.histRow, rtl && st.rowRev]}>
          <Text style={{ color: h.side === "buy" ? C.green : C.red, fontWeight: "800", width: 44 }}>{h.side === "buy" ? "BUY" : "SELL"}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[st.body, { marginTop: 0, fontSize: 14 }, rtl && st.rtl]}>{h.symbol.replace(/\d*-USD$/, "")} · ${fmtMoney(h.usd)} @ {fmtPrice(h.price)}{h.pnl != null ? `  (${h.pnl >= 0 ? "+" : ""}${fmtMoney(h.pnl)})` : ""}</Text>
            <Text style={[st.sub, { fontSize: 11 }, rtl && st.rtl]} numberOfLines={1}>{h.reason} · {new Date(h.ts).toLocaleString()}</Text>
          </View>
        </View>
      ))}

      <View style={[st.card, { marginTop: 14 }]}>
        <Text style={[st.label, rtl && st.rtl]}>{t.startCap}</Text>
        <View style={[st.row, rtl && st.rowRev, { gap: 8 }]}>
          <TextInput style={[st.input, { flex: 1 }]} keyboardType="numeric" value={capInput} onChangeText={setCapInput} />
          <Pressable style={[st.btnSmall, { backgroundColor: C.amber }]} onPress={() => setPaper({ ...PAPER0(num(capInput, 10000)), bot: { ...paper.bot, since: paper.bot.on ? Date.now() : null, lastTs: null } })}>
            <Text style={st.btnSmallText}>{t.reset}</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

function Stat({ label, value, color, sub }) {
  return (
    <View style={{ alignItems: "center" }}>
      <Text style={st.sub}>{label}</Text>
      <Text style={{ color: color || C.text, fontSize: 17, fontWeight: "900", marginTop: 2 }}>{value}</Text>
      {sub ? <Text style={{ color: color || C.sub, fontSize: 12 }}>{sub}</Text> : null}
    </View>
  );
}

// ------------------------------------------------------------------ Settings
function Settings({ t, rtl, lang, onLang, sub, daysLeft, onPlans, okxProps }) {
  return (
    <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
      <Text style={[st.h1, rtl && st.rtl]}>{t.settingsTitle}</Text>
      <Text style={[st.label, rtl && st.rtl]}>{t.language}</Text>
      <View style={[st.row, rtl && st.rowRev, { flexWrap: "wrap", gap: 8, marginBottom: 18 }]}>
        {LANGS.map((l) => (
          <Pressable key={l.code} style={[st.chip, lang === l.code && st.chipOn]} onPress={() => onLang(l.code)}>
            <Text style={[st.chipText, lang === l.code && { color: "#04110F" }]}>{l.label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={[st.label, rtl && st.rtl]}>{t.subscription}</Text>
      <View style={st.card}>
        <Text style={[st.body, rtl && st.rtl]}>{sub.plan ? `${t.subscribed} — ${sub.plan === "yearly" ? t.yearly : t.monthly}` : daysLeft > 0 ? t.trialLeft(daysLeft) : t.trialOver}</Text>
        <View style={[st.row, rtl && st.rowRev, { gap: 10, marginTop: 10 }]}>
          <Pressable style={st.btnSmall} onPress={onPlans}><Text style={st.btnSmallText}>{t.manage}</Text></Pressable>
          <Pressable style={[st.chip]} onPress={() => {}}><Text style={st.chipText}>{t.restore}</Text></Pressable>
        </View>
      </View>
      <OkxSettings t={t} rtl={rtl} {...okxProps} />
      <Text style={[st.label, rtl && st.rtl, { marginTop: 18 }]}>{t.disclaimerTitle}</Text>
      <View style={st.card}><Text style={[st.body, rtl && st.rtl]}>{t.disclaimer}</Text></View>
      <Text style={[st.sub, { marginTop: 18, textAlign: "center" }]}>{t.about} 0.1 · {t.prototypeNote}</Text>
    </ScrollView>
  );
}

// ------------------------------------------------------------------ Paywall (trial + plans) — simulated in the prototype
function Paywall({ t, rtl, lang, onLang, trialUsed, onTrial, onSubscribe, onClose }) {
  const [plan, setPlan] = useState("yearly");
  const savePct = Math.round((1 - PLANS.yearly.n / (PLANS.monthly.n * 12)) * 100);
  const priceLabel = plan === "yearly" ? `${PLANS.yearly.price} ${t.perYear}` : `${PLANS.monthly.price} ${t.perMonth}`;
  return (
    <SafeAreaView style={st.fill}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={{ padding: 22, paddingBottom: 40 }}>
        <View style={[st.row, rtl && st.rowRev, { justifyContent: "space-between", marginBottom: 6 }]}>
          <View style={[st.row, { gap: 6 }]}>
            {LANGS.map((l) => <Text key={l.code} onPress={() => onLang(l.code)} style={[st.langMini, lang === l.code && { color: C.accent }]}>{l.label}</Text>)}
          </View>
          {onClose ? <Pressable onPress={onClose} accessibilityLabel={t.later}><Ionicons name="close" size={24} color={C.sub} /></Pressable> : null}
        </View>
        <Text style={st.bigLogo}>📈</Text>
        <Text style={st.brand}>KimMarket<Text style={{ color: C.accent }}>.ai</Text></Text>
        <Text style={[st.paywallTitle]}>{trialUsed ? t.subscribeNow : t.paywallTitle}</Text>
        <Text style={[st.paywallSub]}>{trialUsed && !onClose ? t.locked : t.paywallSub}</Text>
        <View style={{ marginVertical: 18, gap: 10 }}>
          {[t.feat1, t.feat2, t.feat3, t.feat4].map((f) => <Text key={f} style={[st.feat, rtl && st.rtl]}>{f}</Text>)}
        </View>
        {["yearly", "monthly"].map((k) => (
          <Pressable key={k} onPress={() => setPlan(k)} style={[st.plan, plan === k && st.planOn]}>
            <View style={[st.row, rtl && st.rowRev, { justifyContent: "space-between" }]}>
              <View style={[st.row, rtl && st.rowRev, { gap: 8 }]}>
                <Ionicons name={plan === k ? "radio-button-on" : "radio-button-off"} size={20} color={plan === k ? C.accent : C.sub} />
                <Text style={st.planName}>{k === "yearly" ? t.yearly : t.monthly}</Text>
                {k === "yearly" ? <Text style={st.save}>{t.save(savePct)}</Text> : null}
              </View>
              <Text style={st.planPrice}>{PLANS[k].price} <Text style={st.sub}>{k === "yearly" ? t.perYear : t.perMonth}</Text></Text>
            </View>
            {k === "yearly" ? <Text style={[st.sub, { marginTop: 4 }, rtl && st.rtl]}>{t.bestValue} · ≈ ${(PLANS.yearly.n / 12).toFixed(2)} {t.perMonth}</Text> : null}
          </Pressable>
        ))}
        <Pressable style={st.cta} onPress={() => (trialUsed ? onSubscribe(plan) : onTrial(plan))}>
          <Text style={st.ctaText}>{trialUsed ? t.subscribeNow : t.startTrial}</Text>
        </Pressable>
        {!trialUsed ? <Text style={[st.terms]}>{t.trialTerms(priceLabel)}</Text> : null}
        <Text style={[st.terms, { marginTop: 14 }]}>{t.prototypeNote}</Text>
        <Text style={[st.terms, { marginTop: 8 }]}>{t.disclaimer}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ------------------------------------------------------------------ helpers
function stripMd(s) { return String(s || "").replace(/\*([^*\n]+)\*/g, "$1").replace(/_([^_\n]+)_/g, "$1"); }
function headline(a) {
  if (a.msg) { const first = stripMd(a.msg).split("\n")[0].replace(/^[🔴🟠🧪]\s*/u, "").trim(); if (first.length > 8) return first; }
  return a.title;
}
function fmtTime(ts) {
  try { const d = new Date(ts); const diff = (Date.now() - d) / 60000;
    if (diff < 60) return `${Math.max(1, Math.round(diff))} min`;
    if (diff < 1440) return `${Math.round(diff / 60)} h`;
    return d.toLocaleDateString();
  } catch { return ""; }
}
function fmtMoney(x) { return (Math.round((x || 0) * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtQty(q) { return q >= 1 ? q.toFixed(4).replace(/\.?0+$/, "") : q.toPrecision(4); }
function pnlText(pos, px) { const g = pos.qty * (px - pos.entry); return `${g >= 0 ? "+" : ""}$${fmtMoney(g)} (${((px / pos.entry - 1) * 100).toFixed(2)}%)`; }
function fmtPrice(x) { return x >= 1000 ? x.toLocaleString(undefined, { maximumFractionDigits: 0 }) : x >= 1 ? x.toFixed(2) : String(x); }

const st = StyleSheet.create({
  fill: { flex: 1, backgroundColor: C.bg },
  center: { alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center" },
  rowRev: { flexDirection: "row-reverse" },
  rtl: { textAlign: "right", writingDirection: "rtl" },
  left: { alignSelf: "flex-start" }, right: { alignSelf: "flex-end" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: Platform.OS === "android" ? 36 : 8, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.line },
  logo: { color: C.text, fontSize: 20, fontWeight: "800" },
  trialPill: { color: C.accent, fontSize: 11, backgroundColor: "#0F2A27", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, overflow: "hidden" },
  h1: { color: C.text, fontSize: 22, fontWeight: "800", marginBottom: 12 },
  label: { color: C.sub, fontSize: 13, marginBottom: 8, fontWeight: "600" },
  card: { backgroundColor: C.card, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.line },
  badge: { fontSize: 12, fontWeight: "700", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: "hidden" },
  time: { color: C.sub, fontSize: 12 },
  alertTitle: { color: C.text, fontSize: 16, fontWeight: "700", marginTop: 8, lineHeight: 23 },
  body: { color: C.text, fontSize: 15, lineHeight: 24, marginTop: 8 },
  link: { color: C.accent, fontWeight: "600" },
  empty: { color: C.sub, textAlign: "center", marginTop: 40, lineHeight: 22 },
  sub: { color: C.sub, fontSize: 13 },
  bubble: { maxWidth: "88%", borderRadius: 16, padding: 12, marginBottom: 10 },
  me: { backgroundColor: "#0F3D37" }, bot: { backgroundColor: C.card2 },
  bubbleText: { color: C.text, fontSize: 15, lineHeight: 23 },
  chip: { borderWidth: 1, borderColor: C.line, backgroundColor: C.card, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7 },
  chipOn: { backgroundColor: C.accent, borderColor: C.accent },
  chipText: { color: C.text, fontWeight: "600" },
  inputBar: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.bg },
  input: { flex: 1, backgroundColor: C.card, color: C.text, borderRadius: 22, paddingHorizontal: 14, paddingVertical: Platform.OS === "ios" ? 12 : 8, borderWidth: 1, borderColor: C.line, fontSize: 15 },
  sendBtn: { backgroundColor: C.accent, width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  btnSmall: { backgroundColor: C.accent, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9, minWidth: 64, alignItems: "center" },
  btnSmallText: { color: "#04110F", fontWeight: "800" },
  sym: { color: C.text, fontSize: 17, fontWeight: "800" },
  price: { color: C.text, fontSize: 16, fontWeight: "700" },
  tabs: { flexDirection: "row", borderTopWidth: 1, borderTopColor: C.line, backgroundColor: "#0D131A", paddingBottom: Platform.OS === "ios" ? 4 : 8, paddingTop: 6 },
  tab: { flex: 1, alignItems: "center", gap: 2 },
  tabText: { color: C.sub, fontSize: 11, fontWeight: "600" },
  resultRow: { paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: C.line },
  typeTag: { color: C.accent, fontSize: 11, fontWeight: "800", borderWidth: 1, borderColor: C.line, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, minWidth: 54, textAlign: "center" },
  exBtn: { backgroundColor: "#1E2633", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: C.amber },
  exText: { color: C.amber, fontWeight: "800" },
  histRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line },
  langMini: { color: C.sub, fontSize: 12, marginRight: 8 },
  bigLogo: { fontSize: 54, textAlign: "center", marginTop: 10 },
  brand: { color: C.text, fontSize: 22, fontWeight: "900", textAlign: "center", marginTop: 4, letterSpacing: 0.5 },
  paywallTitle: { color: C.text, fontSize: 28, fontWeight: "900", textAlign: "center", marginTop: 8 },
  paywallSub: { color: C.sub, fontSize: 15, textAlign: "center", marginTop: 6, lineHeight: 22 },
  feat: { color: C.text, fontSize: 15, lineHeight: 22 },
  plan: { borderWidth: 1.5, borderColor: C.line, borderRadius: 16, padding: 14, marginBottom: 10, backgroundColor: C.card },
  planOn: { borderColor: C.accent, backgroundColor: "#0E1F1E" },
  planName: { color: C.text, fontSize: 17, fontWeight: "800" },
  planPrice: { color: C.text, fontSize: 17, fontWeight: "800" },
  save: { color: "#04110F", backgroundColor: C.green, fontSize: 11, fontWeight: "800", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: "hidden" },
  cta: { backgroundColor: C.accent, borderRadius: 16, paddingVertical: 16, alignItems: "center", marginTop: 8 },
  ctaText: { color: "#04110F", fontSize: 17, fontWeight: "900" },
  terms: { color: C.sub, fontSize: 12, textAlign: "center", marginTop: 10, lineHeight: 18 },
});
