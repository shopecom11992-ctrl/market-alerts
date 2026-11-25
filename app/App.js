// KimMarket.ai : crypto & stock news alerts + AI analysis in Darija / Arabic / French / English.
// Prototype for Expo (runs in Expo Go via Snack). Payments are simulated; real billing comes with RevenueCat.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, FlatList, KeyboardAvoidingView, Linking, Platform, Pressable, RefreshControl,
  SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { LANGS, isRTL, strings } from "./i18n";

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
  const t = strings(lang), rtl = isRTL(lang);

  useEffect(() => { (async () => {
    setLang(await store.get("lang", "darija"));
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
        {tab === "watch" && <Watchlist t={t} rtl={rtl} onAnalyse={askAbout} />}
        {tab === "settings" && <Settings t={t} rtl={rtl} lang={lang} onLang={changeLang} sub={sub} daysLeft={daysLeft} onPlans={() => setShowPaywall(true)} />}
      </View>
      <View style={[st.tabs, rtl && st.rowRev]}>
        {[["alerts", "notifications", t.tabAlerts], ["chat", "chatbubbles", t.tabChat], ["watch", "star", t.tabWatch], ["settings", "settings", t.tabSettings]].map(([k, icon, label]) => (
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

// ------------------------------------------------------------------ Watchlist
function Watchlist({ t, rtl, onAnalyse }) {
  const [list, setList] = useState([]);
  const [quotes, setQuotes] = useState({});
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadQuotes = useCallback(async (l) => {
    if (!l.length) return;
    try { const r = await api("/quote?symbols=" + encodeURIComponent(l.map((a) => a.symbol).join(","))); const m = {}; (r.quotes || []).forEach((x) => { m[x.symbol] = x; }); setQuotes(m); } catch {}
  }, []);
  useEffect(() => { (async () => {
    const l = await store.get("watch", [{ symbol: "BTC-USD", name: "Bitcoin" }, { symbol: "NVDA", name: "NVIDIA" }, { symbol: "GC=F", name: "Gold" }]);
    setList(l); loadQuotes(l);
  })(); }, [loadQuotes]);

  const save = (l) => { setList(l); store.set("watch", l); };
  const add = async () => {
    const query = q.trim(); if (!query) return;
    setAdding(true); setMsg(null);
    try {
      const r = await api("/resolve?q=" + encodeURIComponent(query));
      if (!r.asset) setMsg(t.notFound);
      else if (!list.some((a) => a.symbol === r.asset.symbol)) { const l = [...list, { symbol: r.asset.symbol, name: r.asset.name }]; save(l); setQ(""); loadQuotes(l); }
      else setQ("");
    } catch { setMsg(t.error); }
    setAdding(false);
  };
  const remove = (s) => save(list.filter((a) => a.symbol !== s));
  const refresh = async () => { setRefreshing(true); await loadQuotes(list); setRefreshing(false); };

  return (
    <FlatList
      data={list}
      keyExtractor={(a) => a.symbol}
      contentContainerStyle={{ padding: 14, paddingBottom: 30 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.accent} />}
      ListHeaderComponent={<>
        <Text style={[st.h1, rtl && st.rtl]}>{t.watchTitle}</Text>
        <View style={[st.row, rtl && st.rowRev, { gap: 8, marginBottom: 6 }]}>
          <TextInput style={[st.input, { flex: 1 }, rtl && st.rtl]} placeholder={t.watchSearch} placeholderTextColor={C.sub} value={q} onChangeText={setQ} onSubmitEditing={add} autoCapitalize="none" />
          <Pressable style={st.btnSmall} onPress={add} disabled={adding}>{adding ? <ActivityIndicator color="#04110F" /> : <Text style={st.btnSmallText}>{t.add}</Text>}</Pressable>
        </View>
        {msg ? <Text style={[st.sub, { marginBottom: 8 }, rtl && st.rtl]}>{msg}</Text> : null}
      </>}
      ListEmptyComponent={<Text style={[st.empty, rtl && st.rtl]}>{t.watchEmpty}</Text>}
      renderItem={({ item }) => {
        const p = quotes[item.symbol] || {};
        const up = (p.chg1d || 0) >= 0;
        return (
          <View style={[st.card, st.row, rtl && st.rowRev, { justifyContent: "space-between" }]}>
            <View style={{ flex: 1 }}>
              <Text style={[st.sym, rtl && st.rtl]}>{item.symbol.replace("-USD", "")}</Text>
              <Text style={[st.sub, rtl && st.rtl]} numberOfLines={1}>{item.name}</Text>
            </View>
            <View style={{ alignItems: "flex-end", marginHorizontal: 12 }}>
              <Text style={st.price}>{p.last != null ? fmtPrice(p.last) : "—"}</Text>
              {p.chg1d != null ? <Text style={{ color: up ? C.green : C.red, fontWeight: "600" }}>{up ? "▲" : "▼"} {Math.abs(p.chg1d).toFixed(2)}% <Text style={st.sub}>{t.today}</Text></Text> : null}
            </View>
            <View style={{ gap: 6 }}>
              <Pressable style={st.chip} onPress={() => onAnalyse(item.name && item.name !== item.symbol ? item.name : item.symbol)}><Text style={st.chipText}>{t.analyse}</Text></Pressable>
              <Pressable onPress={() => remove(item.symbol)} accessibilityLabel={t.remove}><Text style={[st.sub, { textAlign: "center" }]}>✕</Text></Pressable>
            </View>
          </View>
        );
      }}
    />
  );
}

// ------------------------------------------------------------------ Settings
function Settings({ t, rtl, lang, onLang, sub, daysLeft, onPlans }) {
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
