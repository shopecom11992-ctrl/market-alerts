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

// ===== i18n.js (inlined for Snack)
// UI strings for the 4 supported languages. "darija" is the default.
const LANGS = [
  { code: "darija", label: "الدارجة", rtl: true },
  { code: "ar", label: "العربية", rtl: true },
  { code: "fr", label: "Français", rtl: false },
  { code: "en", label: "English", rtl: false },
];

const S = {
  darija: {
    tabMarkets: "الأسواق", tabPortfolio: "المحفظة",
    searchPlaceholder: "قلب على أي سهم، كريبتو، ذهب...", searchBtn: "قلب", noResults: "ما لقيت والو",
    types: { stock: "سهم", crypto: "كريبتو", etf: "ETF", index: "مؤشر", commodity: "مادة أولية", fx: "عملة", fund: "صندوق", other: "أخرى" },
    ranges: { "5d": "سيمانة", "1mo": "شهر", "3mo": "3 شهور", "1y": "عام" },
    back: "رجوع", addWatch: "زيد للائحة", inWatch: "فاللائحة ✓", openIn: "حل وتداول ف:", openInNote: "كتحل الصفحة ديال العملة فالمنصة ديالك، ونتا اللي كتقرر وكتشري.",
    chartNA: "الشارت ما متاحش دابا", paperBuy: "شري (وهمي)", paperSell: "بيع (وهمي)", amountUsd: "المبلغ بالدولار",
    pfTitle: "المحفظة الافتراضية", pfNote: "فلوس وهمية باش تجرب الاستراتيجية بلا مخاطرة. ماشي فلوس حقيقية.",
    equity: "القيمة الكلية", cash: "الكاش", pnl: "الربح/الخسارة", positions: "المراكز المفتوحة", noPositions: "ما كاين حتى مركز مفتوح",
    history: "السجل", close: "سد", startCap: "الرأسمال الوهمي ديال البداية", reset: "عاود من الصفر",
    botTitle: "🤖 البوت الأوتوماتيكي (وهمي)", botDesc: "كيشري أوتوماتيكيا ملي يطيح خبر إيجابي، وكيبيع ملي يطيح خبر سلبي ولا يوصل للـstop-loss / take-profit.",
    botOn: "شغال", botOff: "طافي", perTrade: "% من الرأسمال فكل صفقة", sl: "Stop-loss %", tp: "Take-profit %",
    reasonNews: "خبر", reasonSL: "Stop-loss", reasonTP: "Take-profit", reasonManual: "يدوي", notEnoughCash: "الكاش ما كافيش",
    appName: "KimMarket.ai",
    tagline: "الأخبار المهمة ديال الكريبتو والبورصة، بالدارجة، فالوقت",
    tabAlerts: "التنبيهات", tabChat: "اسول", tabWatch: "اللائحة", tabSettings: "الإعدادات",
    alertsTitle: "آخر الأخبار المهمة", alertsEmpty: "ما كاين حتى خبر مهم دابا. غادي يوصلك إشعار ملي يطيح شي خبر كبير.",
    pullRefresh: "جر لتحت باش تحدث", impact: "الأهمية", openSource: "حل المصدر", readMore: "قرا التحليل", readLess: "سد",
    chatTitle: "اسول على أي سهم ولا كريبتو", chatPlaceholder: "مثلا: واش مزيان نشري Nvidia دابا؟", send: "صيفط",
    thinking: "كنجمع المعلومات وكنحلل...", chatHello: "مرحبا! 👋 أنا Kim. هضر معايا بالدارجة بحال صاحبك: سولني على أي coin ولا سهم، قول ليا «قلب ليا على coin مزيانة»، «شري ليا SOL»، ولا عطيني مهمة: «عندي 93 USDT، شري وبيع بوحدك».",
    suggestions: ["Bitcoin", "Nvidia", "الذهب", "Solana", "Tesla"],
    watchTitle: "اللائحة ديالي", watchSearch: "زيد سهم ولا عملة (مثلا: Apple، ETH)", add: "زيد", watchEmpty: "اللائحة خاوية. زيد الأصول اللي كتبعها.",
    notFound: "ما لقيتش هاد السمية", analyse: "حلل", remove: "حيد", today: "اليوم",
    settingsTitle: "الإعدادات", language: "اللغة", subscription: "الاشتراك", trialLeft: (d) => `باقي ليك ${d} أيام فالتجربة الفابور`,
    trialOver: "التجربة الفابور سالات", subscribed: "مشترك ✅", manage: "بدل الخطة", restore: "رجع المشتريات",
    disclaimerTitle: "تنبيه مهم", disclaimer: "المحتوى فهاد التطبيق تحليل ومعلومات عامة، ماشي نصيحة استثمار ولا توصية بالشراء ولا البيع. الأسواق فيها مخاطر وتقدر تخسر فلوسك. القرار ديما ديالك.",
    about: "النسخة التجريبية", prototypeNote: "نسخة تجريبية: الخلاص مازال ما مفعلش، والأزرار كتجرب غير الشكل.",
    paywallTitle: "جرب 7 أيام فابور", paywallSub: "من بعد اختار الخطة اللي بغيتي. تقدر تلغي فأي وقت.",
    feat1: "🔔 تنبيهات فورية على الأخبار اللي كتحرك السوق", feat2: "💬 تحليل أي سهم ولا كريبتو بالدارجة", feat3: "⭐ لائحة خاصة بيك مع الأثمنة", feat4: "🌍 4 لغات",
    monthly: "شهري", yearly: "سنوي", perMonth: "/ الشهر", perYear: "/ العام", save: (p) => `وفر ${p}%`, bestValue: "أحسن عرض",
    startTrial: "بدا 7 أيام فابور", trialTerms: (price) => `فابور 7 أيام، ومن بعد ${price}. كيتجدد أوتوماتيكيا حتى تلغي.`,
    subscribeNow: "اشترك دابا", locked: "التجربة الفابور سالات. اشترك باش تكمل.", later: "من بعد",
    error: "وقع مشكل فالاتصال. عاود من بعد شوية.", rateLimited: "بزاف ديال الأسئلة فوقت قصير. تسنى شوية وعاود.",
  },
  ar: {
    tabMarkets: "الأسواق", tabPortfolio: "المحفظة",
    searchPlaceholder: "ابحث عن أي سهم أو عملة رقمية أو ذهب...", searchBtn: "بحث", noResults: "لا توجد نتائج",
    types: { stock: "سهم", crypto: "عملة رقمية", etf: "ETF", index: "مؤشر", commodity: "سلعة", fx: "عملة", fund: "صندوق", other: "أخرى" },
    ranges: { "5d": "أسبوع", "1mo": "شهر", "3mo": "3 أشهر", "1y": "سنة" },
    back: "رجوع", addWatch: "أضف للقائمة", inWatch: "في القائمة ✓", openIn: "افتح وتداول في:", openInNote: "تُفتح صفحة العملة في منصتك، وأنت من يقرر ويشتري.",
    chartNA: "الرسم البياني غير متاح الآن", paperBuy: "شراء (افتراضي)", paperSell: "بيع (افتراضي)", amountUsd: "المبلغ بالدولار",
    pfTitle: "المحفظة الافتراضية", pfNote: "أموال افتراضية لتجربة الاستراتيجية دون مخاطرة. ليست أموالاً حقيقية.",
    equity: "القيمة الإجمالية", cash: "النقد", pnl: "الربح/الخسارة", positions: "المراكز المفتوحة", noPositions: "لا توجد مراكز مفتوحة",
    history: "السجل", close: "إغلاق", startCap: "رأس المال الافتراضي الابتدائي", reset: "البدء من جديد",
    botTitle: "🤖 الروبوت التلقائي (افتراضي)", botDesc: "يشتري تلقائياً عند خبر إيجابي، ويبيع عند خبر سلبي أو عند بلوغ stop-loss / take-profit.",
    botOn: "مفعّل", botOff: "متوقف", perTrade: "% من رأس المال لكل صفقة", sl: "Stop-loss %", tp: "Take-profit %",
    reasonNews: "خبر", reasonSL: "Stop-loss", reasonTP: "Take-profit", reasonManual: "يدوي", notEnoughCash: "النقد غير كافٍ",
    appName: "KimMarket.ai",
    tagline: "أهم أخبار العملات الرقمية والأسهم، بلغتك، في الوقت الفعلي",
    tabAlerts: "التنبيهات", tabChat: "اسأل", tabWatch: "قائمتي", tabSettings: "الإعدادات",
    alertsTitle: "آخر الأخبار المهمة", alertsEmpty: "لا توجد أخبار مهمة حالياً. ستصلك إشعارات عند وقوع حدث كبير.",
    pullRefresh: "اسحب للأسفل للتحديث", impact: "الأهمية", openSource: "فتح المصدر", readMore: "اقرأ التحليل", readLess: "إغلاق",
    chatTitle: "اسأل عن أي سهم أو عملة رقمية", chatPlaceholder: "مثلاً: هل الوقت مناسب لشراء Nvidia؟", send: "إرسال",
    thinking: "أجمع المعلومات وأحلل...", chatHello: "مرحباً! 👋 أنا Kim. اسألني عن أي عملة أو سهم، أو قل «ابحث لي عن عملة جيدة»، «اشترِ SOL»، أو أعطني مهمة: «لدي 93 USDT، تداول بنفسك».",
    suggestions: ["Bitcoin", "Nvidia", "الذهب", "Solana", "Tesla"],
    watchTitle: "قائمتي", watchSearch: "أضف سهماً أو عملة (مثلاً: Apple، ETH)", add: "إضافة", watchEmpty: "القائمة فارغة. أضف الأصول التي تتابعها.",
    notFound: "لم أجد هذا الاسم", analyse: "حلّل", remove: "حذف", today: "اليوم",
    settingsTitle: "الإعدادات", language: "اللغة", subscription: "الاشتراك", trialLeft: (d) => `متبقٍ ${d} أيام من التجربة المجانية`,
    trialOver: "انتهت التجربة المجانية", subscribed: "مشترك ✅", manage: "تغيير الخطة", restore: "استعادة المشتريات",
    disclaimerTitle: "تنبيه مهم", disclaimer: "المحتوى في هذا التطبيق تحليل ومعلومات عامة وليس نصيحة استثمارية أو توصية بالشراء أو البيع. الأسواق تنطوي على مخاطر وقد تخسر أموالك. القرار دائماً لك.",
    about: "النسخة التجريبية", prototypeNote: "نسخة تجريبية: الدفع غير مفعّل بعد، والأزرار تعرض الشكل فقط.",
    paywallTitle: "جرّب 7 أيام مجاناً", paywallSub: "ثم اختر الخطة التي تناسبك. يمكنك الإلغاء في أي وقت.",
    feat1: "🔔 تنبيهات فورية بالأخبار المحرّكة للسوق", feat2: "💬 تحليل أي سهم أو عملة رقمية", feat3: "⭐ قائمة مفضلة مع الأسعار", feat4: "🌍 4 لغات",
    monthly: "شهري", yearly: "سنوي", perMonth: "/ شهر", perYear: "/ سنة", save: (p) => `وفّر ${p}%`, bestValue: "أفضل قيمة",
    startTrial: "ابدأ 7 أيام مجاناً", trialTerms: (price) => `مجاناً لمدة 7 أيام، ثم ${price}. يتجدد تلقائياً حتى تلغي.`,
    subscribeNow: "اشترك الآن", locked: "انتهت التجربة المجانية. اشترك للمتابعة.", later: "لاحقاً",
    error: "حدث خطأ في الاتصال. حاول بعد قليل.", rateLimited: "أسئلة كثيرة في وقت قصير. انتظر قليلاً ثم أعد المحاولة.",
  },
  fr: {
    tabMarkets: "Marchés", tabPortfolio: "Portefeuille",
    searchPlaceholder: "Cherche une action, une crypto, l'or...", searchBtn: "Chercher", noResults: "Aucun résultat",
    types: { stock: "Action", crypto: "Crypto", etf: "ETF", index: "Indice", commodity: "Matière 1ère", fx: "Devise", fund: "Fonds", other: "Autre" },
    ranges: { "5d": "1S", "1mo": "1M", "3mo": "3M", "1y": "1A" },
    back: "Retour", addWatch: "Ajouter à ma liste", inWatch: "Dans ma liste ✓", openIn: "Ouvrir et trader sur :", openInNote: "Ouvre la page de la crypto sur ta plateforme ; c'est toi qui décides et qui achètes.",
    chartNA: "Graphique indisponible", paperBuy: "Acheter (virtuel)", paperSell: "Vendre (virtuel)", amountUsd: "Montant en $",
    pfTitle: "Portefeuille virtuel", pfNote: "Argent fictif pour tester la stratégie sans risque. Ce n'est pas de l'argent réel.",
    equity: "Valeur totale", cash: "Cash", pnl: "P&L", positions: "Positions ouvertes", noPositions: "Aucune position ouverte",
    history: "Historique", close: "Clôturer", startCap: "Capital virtuel de départ", reset: "Recommencer",
    botTitle: "🤖 Bot automatique (virtuel)", botDesc: "Achète automatiquement sur une news positive, vend sur une news négative ou au stop-loss / take-profit.",
    botOn: "Actif", botOff: "Arrêté", perTrade: "% du capital par trade", sl: "Stop-loss %", tp: "Take-profit %",
    reasonNews: "News", reasonSL: "Stop-loss", reasonTP: "Take-profit", reasonManual: "Manuel", notEnoughCash: "Cash insuffisant",
    appName: "KimMarket.ai",
    tagline: "Les news crypto et bourse qui comptent, dans ta langue, en temps réel",
    tabAlerts: "Alertes", tabChat: "Demander", tabWatch: "Ma liste", tabSettings: "Réglages",
    alertsTitle: "Dernières news importantes", alertsEmpty: "Aucune news majeure pour l'instant. Tu recevras une notification dès qu'un événement important tombe.",
    pullRefresh: "Tire vers le bas pour actualiser", impact: "Impact", openSource: "Ouvrir la source", readMore: "Lire l'analyse", readLess: "Fermer",
    chatTitle: "Pose une question sur n'importe quelle action ou crypto", chatPlaceholder: "Ex. : Nvidia, c'est le moment d'acheter ?", send: "Envoyer",
    thinking: "Je collecte les infos et j'analyse...", chatHello: "Salut ! 👋 Moi c'est Kim. Demande-moi n'importe quelle crypto ou action, « trouve-moi une bonne crypto », « achète SOL », ou donne-moi une mission : « j'ai 93 USDT, trade tout seul ».",
    suggestions: ["Bitcoin", "Nvidia", "Or", "Solana", "Tesla"],
    watchTitle: "Ma liste", watchSearch: "Ajoute une action ou une crypto (ex. : Apple, ETH)", add: "Ajouter", watchEmpty: "Ta liste est vide. Ajoute les actifs que tu suis.",
    notFound: "Introuvable", analyse: "Analyser", remove: "Retirer", today: "Auj.",
    settingsTitle: "Réglages", language: "Langue", subscription: "Abonnement", trialLeft: (d) => `Il te reste ${d} jours d'essai gratuit`,
    trialOver: "Essai gratuit terminé", subscribed: "Abonné ✅", manage: "Changer de formule", restore: "Restaurer les achats",
    disclaimerTitle: "Avertissement", disclaimer: "Le contenu de cette application est de l'analyse et de l'information générale, pas un conseil en investissement ni une recommandation d'achat ou de vente. Les marchés comportent des risques de perte. La décision t'appartient toujours.",
    about: "Version prototype", prototypeNote: "Prototype : le paiement n'est pas encore activé, les boutons montrent seulement l'interface.",
    paywallTitle: "Essaie 7 jours gratuits", paywallSub: "Puis choisis ta formule. Annulable à tout moment.",
    feat1: "🔔 Alertes instantanées sur les news qui font bouger le marché", feat2: "💬 Analyse de n'importe quelle action ou crypto", feat3: "⭐ Ta liste avec les prix", feat4: "🌍 4 langues",
    monthly: "Mensuel", yearly: "Annuel", perMonth: "/ mois", perYear: "/ an", save: (p) => `-${p}%`, bestValue: "Meilleure offre",
    startTrial: "Commencer 7 jours gratuits", trialTerms: (price) => `Gratuit 7 jours, puis ${price}. Renouvellement automatique jusqu'à annulation.`,
    subscribeNow: "S'abonner", locked: "Ton essai gratuit est terminé. Abonne-toi pour continuer.", later: "Plus tard",
    error: "Problème de connexion. Réessaie dans un instant.", rateLimited: "Trop de questions en peu de temps. Patiente un peu.",
  },
  en: {
    tabMarkets: "Markets", tabPortfolio: "Portfolio",
    searchPlaceholder: "Search any stock, crypto, gold...", searchBtn: "Search", noResults: "No results",
    types: { stock: "Stock", crypto: "Crypto", etf: "ETF", index: "Index", commodity: "Commodity", fx: "FX", fund: "Fund", other: "Other" },
    ranges: { "5d": "1W", "1mo": "1M", "3mo": "3M", "1y": "1Y" },
    back: "Back", addWatch: "Add to watchlist", inWatch: "In watchlist ✓", openIn: "Open & trade on:", openInNote: "Opens this coin on your exchange; you decide and place the trade yourself.",
    chartNA: "Chart unavailable", paperBuy: "Buy (paper)", paperSell: "Sell (paper)", amountUsd: "Amount in $",
    pfTitle: "Paper portfolio", pfNote: "Virtual money to test the strategy with zero risk. Not real money.",
    equity: "Total value", cash: "Cash", pnl: "P&L", positions: "Open positions", noPositions: "No open positions",
    history: "History", close: "Close", startCap: "Starting virtual capital", reset: "Start over",
    botTitle: "🤖 Auto-bot (paper)", botDesc: "Buys automatically on positive news, sells on negative news or when stop-loss / take-profit is hit.",
    botOn: "On", botOff: "Off", perTrade: "% of capital per trade", sl: "Stop-loss %", tp: "Take-profit %",
    reasonNews: "News", reasonSL: "Stop-loss", reasonTP: "Take-profit", reasonManual: "Manual", notEnoughCash: "Not enough cash",
    appName: "KimMarket.ai",
    tagline: "The crypto & stock news that matters, in your language, in real time",
    tabAlerts: "Alerts", tabChat: "Ask", tabWatch: "Watchlist", tabSettings: "Settings",
    alertsTitle: "Latest important news", alertsEmpty: "No major news right now. You'll get a notification as soon as something big happens.",
    pullRefresh: "Pull down to refresh", impact: "Impact", openSource: "Open source", readMore: "Read analysis", readLess: "Close",
    chatTitle: "Ask about any stock or crypto", chatPlaceholder: "e.g. Is it a good time to buy Nvidia?", send: "Send",
    thinking: "Gathering data and analysing...", chatHello: "Hi! 👋 I'm Kim. Ask me about any coin or stock, say \"find me a good coin\", \"buy SOL\", or give me a mission: \"I have 93 USDT, trade by yourself\".",
    suggestions: ["Bitcoin", "Nvidia", "Gold", "Solana", "Tesla"],
    watchTitle: "My watchlist", watchSearch: "Add a stock or crypto (e.g. Apple, ETH)", add: "Add", watchEmpty: "Your watchlist is empty. Add the assets you follow.",
    notFound: "Not found", analyse: "Analyse", remove: "Remove", today: "Today",
    settingsTitle: "Settings", language: "Language", subscription: "Subscription", trialLeft: (d) => `${d} days left in your free trial`,
    trialOver: "Free trial ended", subscribed: "Subscribed ✅", manage: "Change plan", restore: "Restore purchases",
    disclaimerTitle: "Important", disclaimer: "Content in this app is analysis and general information, not investment advice or a recommendation to buy or sell. Markets carry risk and you can lose money. The decision is always yours.",
    about: "Prototype version", prototypeNote: "Prototype: payments are not active yet; the buttons only demo the flow.",
    paywallTitle: "Try 7 days free", paywallSub: "Then pick the plan that suits you. Cancel anytime.",
    feat1: "🔔 Instant alerts on market-moving news", feat2: "💬 Analysis of any stock or crypto", feat3: "⭐ Your watchlist with prices", feat4: "🌍 4 languages",
    monthly: "Monthly", yearly: "Yearly", perMonth: "/ month", perYear: "/ year", save: (p) => `Save ${p}%`, bestValue: "Best value",
    startTrial: "Start 7-day free trial", trialTerms: (price) => `Free for 7 days, then ${price}. Renews automatically until cancelled.`,
    subscribeNow: "Subscribe now", locked: "Your free trial has ended. Subscribe to continue.", later: "Later",
    error: "Connection problem. Please try again shortly.", rateLimited: "Too many questions in a short time. Please wait a bit.",
  },
};


// OKX connection + AI trade plan strings
const X = {
  darija: {
    soldButBuyFailed: (sold, b, why) => `⚠️ بعت ${sold} والفلوس ولاو USDT ف الحساب ديالك (ما ضاعو)، ولكن الشرا ديال ${b} ما تداش:\n${why}`,
    progress: ["كنجمع الثمن والأخبار...", "كنحلل الشارت والمؤشرات...", "كنكتب ليك الجواب..."],
    pendingTitle: "⏳ أوامر كتسنى الثمن", noPending: "ما كاين حتى أمر كيتسنى.", cancelOrder: "لغي",
    pendingLine: (p, last) => `${p.instId.replace("-USDT", "")} · نشري ف ${p.entry} · دابا ${last ?? "…"}${last ? ` (باقي ${(((last - p.entry) / last) * 100).toFixed(2)}%)` : ""} · ${p.usdt} USDT · SL ${p.sl} · TP ${p.tp}`,
    pendingPlaced: (b, p) => `⏳ حطيت أمر شرا ف ${b}: غادي نشري ملي يهبط الثمن لـ ${p.entry} (−${p.distPct}% من دابا)، بـ ${p.usdt} USDT.\nSL ${p.stopLoss} · TP ${p.takeProfit} · كيبقى ${p.expiryHours} ساعة.\nالأمر كاين ف OKX 24/24، وتقدر تشوفو ولا تلغيه ف «المحفظة».\n\n${p.summary || ""}`,
    pendingFilled: (b, px) => `✅ ${b}: الثمن وصل لـ ${px} وتشرات. الـStop-loss والـTake-profit خدامين ف OKX.`, pendingExpired: (b) => `⌛ ${b}: الثمن ما وصلش للمستوى ف الوقت، لغيت الأمر.`, pendingCanceled: (b) => `🗑️ ${b}: تلغى الأمر.`,
    ordersCanceled: (n) => `🗑️ لغيت ${n} أمر كيتسناو.`, nowBadNote: "⚠️ شريت حيت طلبتي دابا، ولكن الذكاء الاصطناعي كان كيشوف بلي الوقت ماشي مزيان بزاف:",
    freeUp: (sold, sz, est, b) => `💱 الـUSDT ما كافيش، غادي نبيع ${sz} ${sold} (≈${est} USDT، أضعف عملة عندك دابا) باش نشري ${b}.`,
    newChat: "شات جديد", chatHistory: "الشاتات", noChats: "باقي ما كاين حتى شات محفوظ.", deleteChat: "مسح الشات",
    missionTitle: "🎯 المهمة ديال البوت", missionStop: "وقف المهمة", missionNone: "ما كايناش مهمة. قول للبوت ف الشات مثلا: «عندي 93 USDT، شري وبيع بوحدك، بغيت 10% ف 7 أيام».",
    missionLine: (m, pnl, dl) => `الهدف +${m.targetPct}% ف ${m.days} أيام · دابا ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}% · باقي ${dl} يوم · أقصى خسارة -${m.maxLossPct}% · رأس المال ${m.capital} USDT`,
    missionStarted: (m) => `🎯 بدات المهمة: ${m.capital} USDT، الهدف +${m.targetPct}% ف ${m.days} أيام، وكنوقف إلا وصلت الخسارة -${m.maxLossPct}%. غادي نقلب على أحسن coins ف OKX كل 15 دقيقة وندير الصفقات بوحدي (ملي التطبيق محلول).`,
    missionStartBtn: "✅ بدا المهمة", missionStopped: "⏹️ وقفت المهمة. الصفقات المفتوحة باقين محميين بالـStop-loss والـTake-profit ف OKX.",
    missionTarget: (p) => `🎉 وصلنا للهدف! الربح ${p.toFixed(2)}%. سديت الصفقات ووقفت المهمة.`, missionLoss: (p) => `🛑 الخسارة وصلت ${p.toFixed(2)}%، سديت الصفقات ووقفت المهمة باش نحمي الفلوس.`, missionEnd: (p) => `⌛ سالات المدة ديال المهمة. النتيجة: ${p >= 0 ? "+" : ""}${p.toFixed(2)}%. سديت الصفقات.`,
    missionBought: (b, usdt, p) => `🤖 المهمة: شريت ${b} بـ ${usdt} USDT · SL ${p.stopLoss} · TP ${p.takeProfit}. ${p.summary || ""}`,
    scanning: "🔎 كنقلب ف OKX على أحسن coin دابا...", scanNone: (s) => `قلبت ف OKX وما لقيت حتى coin نقية دابا، فاحسن نتسناو. ${s || ""}`,
    scanFound: (b, p) => `🔎 بانت ليا ${b} مزيانة دابا.\nالدخول ${p.entry} · SL ${p.stopLoss} (-${p.slPct}%) · TP ${p.takeProfit} (+${p.tpPct}%) · الثقة: ${p.confidence || "-"}\n\n${p.summary || ""}${p.risks && p.risks.length ? "\n⚠️ " + p.risks.join(" · ") : ""}`,
    buyIt: (usdt) => `شريها بـ ${usdt} USDT`, closeAllConfirm: "نسد جميع الصفقات؟",
    okxWallet: "💼 الرصيد ديالي ف OKX", totalEquity: "القيمة الكلية", coins: "العملات", refresh: "حدث",
    chatTradeNoAsset: "فاش بغيتي ندير الترايد؟ كتب مثلا: dir trade f SOL", chatNoOpenTrade: (b) => `ما عندك حتى صفقة مفتوحة من KimMarket ف ${b}.`,
    chatPlanWait: (b, s) => `⏸️ ما دخلتش ف ${b}: ما كايناش فرصة واضحة دابا.\n\n${s}`,
    chatPlanBuy: (b, usdt, p) => `✅ لقيت فرصة ف ${b}.\nالدخول ${p.entry} · Stop-loss ${p.stopLoss} (-${p.slPct}%) · Take-profit ${p.takeProfit} (+${p.tpPct}%)\nغادي نخدم بـ ${usdt} USDT.\n\n${p.summary || ""}`,
    chatClosed: (b) => `✅ سديت الصفقة ف ${b} وبعت بثمن السوق.`, chatConfirmLive: "⚠️ LIVE = فلوس حقيقية. ورك باش تأكد:", chatCloseConfirm: (b) => `نسد الصفقة ف ${b}؟`,
    managerTitle: "🤖 مدير الصفقات (AI)", managerDesc: "ملي التطبيق محلول، البوت كيراجع الصفقات المفتوحة كل 5 دقايق: يقدر يطلع الـStop-loss باش يحمي الربح، ولا يسد الصفقة إلا تبدل السوق. عمرو ما كيزيد المخاطرة. ملي التطبيق مسدود، الـStop-loss والـTake-profit كيبقاو خدامين ف OKX.",
    managerTight: (b, sl, r) => `🔒 ${b}: طلعت الـStop-loss لـ ${sl}. ${r}`, managerClose: (b, r) => `🚪 ${b}: سديت الصفقة. ${r}`, managerGone: (b) => `🏁 ${b}: الصفقة تسدات ف OKX (Take-profit ولا Stop-loss).`,
    events: "آش دار البوت", noEvents: "باقي ما دار والو.",
    okxTitle: "🔗 ربط OKX", okxDesc: "المفاتيح كيتخباو غير فالتيليفون ديالك (مشفرين) وكيمشيو نيشان لـOKX، حتى سيرفر ما كيشوفهم. صايب API key فيه غير صلاحية Trade — عمرك ما تعطي صلاحية Withdraw.",
    apiKey: "API key", apiSecret: "Secret key", passphrase: "Passphrase", demoMode: "🧪 Demo (فلوس تجريبية)", liveMode: "💰 Live (فلوس حقيقية)",
    demoNote: "بدا بـDemo: ف OKX دير Demo trading وصايب API key ديال demo.", liveWarn: "⚠️ Live = فلوسك الحقيقية. التداول فيه مخاطرة كبيرة وممكن تخسر.",
    saveTest: "سجل وجرب الاتصال", connected: "متصل ✓", disconnect: "قطع الاتصال", notConnected: "OKX ماشي مربوط. ربطو من الإعدادات.",
    balanceUsdt: "رصيد USDT", defaultPct: "% من USDT فكل صفقة", testing: "كنجرب...",
    planBtn: "🤖 عطيني خطة تداول", planLoading: "كندرس السوق والأخبار...", planBuy: "✅ فرصة شرا", planWait: "⏸️ تسنى — ما كايناش فرصة واضحة دابا",
    entry: "الدخول", slL: "Stop-loss", tpL: "Take-profit", rr: "ربح/مخاطرة", confidence: "الثقة", reasons: "علاش", risks: "المخاطر", timeframe: "المدة",
    conf: { low: "ضعيفة", medium: "متوسطة", high: "عالية" }, tf: { hours: "ساعات", days: "أيام", weeks: "سيمانات" },
    useOfBalance: "شحال من USDT نخدم بيه؟", execute: "🚀 دير الترايد دابا",
    confirmTitle: (mode, usdt, base) => `تأكيد (${mode}): غادي نشري ${base} بـ ${usdt} USDT، ونحط Stop-loss و Take-profit أوتوماتيكيا ف OKX.`,
    confirmBtn: "✅ أكد ونفذ", cancel: "لغي", executing: "كننفذ ف OKX...",
    done: (q, base, px) => `تم ✓ شريت ${q} ${base} بثمن ${px}. الـStop-loss والـTake-profit خدامين ف OKX 24/24 حتى إلا سديتي التطبيق.`,
    ocoFailed: "⚠️ الشرا تدار، ولكن Stop-loss/Take-profit ما تحطوش. حطهم بيدك ف OKX دابا ولا سد الصفقة.",
    manualTitle: "تداول يدوي ف OKX", buyMarket: "شري (Market)", sellAll: "بيع", closeTrade: "سد الصفقة", trades: "الصفقات ديال KimMarket",
    notCryptoOkx: "التنفيذ ف OKX غير للكريبتو (spot). للأسهم استعمل المحفظة الوهمية.", tradeOpen: "مفتوحة", tradeClosed: "مسدودة",
    planDisclaimer: "هادي خطة من الذكاء الاصطناعي، ماشي نصيحة مالية ولا ضمان ديال الربح. نتا اللي كتقرر.",
    okxErr: (c, b) => ({ "50123": `🚫 OKX ما كيخليكش تداول ${b || "هاد العملة"} من الحساب ديالك (قيود ديال البلاد على هاد العملة، ولا المفتاح ما فيهش صلاحية Trade ليها). ختار عملة أخرى.`, "50120": "🔑 المفتاح ديال API ما فيهش صلاحية Trade. ف OKX ← API، فعل Trade (بلا Withdraw) وعاود ربط.", insufficient_usdt: "الـUSDT ما كافيش ف OKX.", below_min_size: "المبلغ صغير بزاف على OKX.", plan_out_of_date: "الثمن تبدل بزاف، طلب خطة جديدة.", instrument_not_found: "هاد العملة ما كايناش ف OKX مقابل USDT.", nothing_to_sell: "ما كاين والو باش يتباع.", network: "مشكل ف الاتصال بـOKX.", "50113": "المفاتيح غالطين (Secret).", "50111": "API key غالط.", "50105": "Passphrase غالط.", "50101": "هاد المفتاح ماشي ديال هاد الوضع (Demo/Live).", "50119": "API key ما كاينش.", "51008": "الرصيد ما كافيش." }[c] || "خطأ من OKX: " + c),
  },
  ar: {
    soldButBuyFailed: (sold, b, why) => `⚠️ بعت ${sold} وأصبح المبلغ USDT في حسابك (لم يضِع)، لكن شراء ${b} لم يتم:\n${why}`,
    progress: ["أجمع السعر والأخبار...", "أحلل الرسم البياني والمؤشرات...", "أكتب لك الجواب..."],
    pendingTitle: "⏳ أوامر تنتظر السعر", noPending: "لا توجد أوامر منتظرة.", cancelOrder: "إلغاء",
    pendingLine: (p, last) => `${p.instId.replace("-USDT", "")} · شراء عند ${p.entry} · الآن ${last ?? "…"}${last ? ` (متبقٍ ${(((last - p.entry) / last) * 100).toFixed(2)}%)` : ""} · ${p.usdt} USDT · SL ${p.sl} · TP ${p.tp}`,
    pendingPlaced: (b, p) => `⏳ وضعت أمر شراء على ${b}: سأشتري عندما ينزل السعر إلى ${p.entry} (−${p.distPct}% من الآن)، بمبلغ ${p.usdt} USDT.\nSL ${p.stopLoss} · TP ${p.takeProfit} · صالح ${p.expiryHours} ساعة.\nالأمر في OKX على مدار الساعة، ويمكنك متابعته أو إلغاؤه من «المحفظة».\n\n${p.summary || ""}`,
    pendingFilled: (b, px) => `✅ ${b}: وصل السعر إلى ${px} وتم الشراء. وقف الخسارة وجني الأرباح فعّالان في OKX.`, pendingExpired: (b) => `⌛ ${b}: لم يصل السعر في الوقت المحدد، ألغيت الأمر.`, pendingCanceled: (b) => `🗑️ ${b}: أُلغي الأمر.`,
    ordersCanceled: (n) => `🗑️ ألغيت ${n} أمرًا منتظرًا.`, nowBadNote: "⚠️ اشتريت لأنك طلبت الآن، لكن الذكاء الاصطناعي يرى أن التوقيت ليس جيدًا:",
    freeUp: (sold, sz, est, b) => `💱 رصيد USDT غير كافٍ، سأبيع ${sz} ${sold} (≈${est} USDT، أضعف عملة لديك الآن) لشراء ${b}.`,
    newChat: "محادثة جديدة", chatHistory: "المحادثات", noChats: "لا توجد محادثات محفوظة بعد.", deleteChat: "حذف المحادثة",
    missionTitle: "🎯 مهمة البوت", missionStop: "إيقاف المهمة", missionNone: "لا توجد مهمة. قل للبوت مثلًا: «لدي 93 USDT، اشترِ وبِع بنفسك، أريد 10% في 7 أيام».",
    missionLine: (m, pnl, dl) => `الهدف +${m.targetPct}% في ${m.days} أيام · الآن ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}% · متبقٍ ${dl} يوم · أقصى خسارة -${m.maxLossPct}% · رأس المال ${m.capital} USDT`,
    missionStarted: (m) => `🎯 بدأت المهمة: ${m.capital} USDT، الهدف +${m.targetPct}% في ${m.days} أيام، وأتوقف إذا بلغت الخسارة -${m.maxLossPct}%. سأبحث عن أفضل العملات في OKX كل 15 دقيقة وأتداول بنفسي (عندما يكون التطبيق مفتوحًا).`,
    missionStartBtn: "✅ ابدأ المهمة", missionStopped: "⏹️ أوقفت المهمة. الصفقات المفتوحة محمية بوقف الخسارة وجني الأرباح في OKX.",
    missionTarget: (p) => `🎉 وصلنا للهدف! الربح ${p.toFixed(2)}%. أغلقت الصفقات وأوقفت المهمة.`, missionLoss: (p) => `🛑 بلغت الخسارة ${p.toFixed(2)}%، أغلقت الصفقات وأوقفت المهمة لحماية المال.`, missionEnd: (p) => `⌛ انتهت مدة المهمة. النتيجة: ${p >= 0 ? "+" : ""}${p.toFixed(2)}%. أغلقت الصفقات.`,
    missionBought: (b, usdt, p) => `🤖 المهمة: اشتريت ${b} بـ ${usdt} USDT · SL ${p.stopLoss} · TP ${p.takeProfit}. ${p.summary || ""}`,
    scanning: "🔎 أبحث في OKX عن أفضل عملة الآن...", scanNone: (s) => `بحثت في OKX ولم أجد عملة مناسبة الآن، الأفضل الانتظار. ${s || ""}`,
    scanFound: (b, p) => `🔎 تبدو ${b} جيدة الآن.\nالدخول ${p.entry} · SL ${p.stopLoss} (-${p.slPct}%) · TP ${p.takeProfit} (+${p.tpPct}%) · الثقة: ${p.confidence || "-"}\n\n${p.summary || ""}${p.risks && p.risks.length ? "\n⚠️ " + p.risks.join(" · ") : ""}`,
    buyIt: (usdt) => `اشترِها بـ ${usdt} USDT`, closeAllConfirm: "إغلاق جميع الصفقات؟",
    okxWallet: "💼 رصيدي في OKX", totalEquity: "القيمة الإجمالية", coins: "العملات", refresh: "تحديث",
    chatTradeNoAsset: "على أي أصل تريد الصفقة؟ اكتب مثلًا: dir trade f SOL", chatNoOpenTrade: (b) => `لا توجد صفقة مفتوحة من KimMarket على ${b}.`,
    chatPlanWait: (b, s) => `⏸️ لم أدخل في ${b}: لا توجد فرصة واضحة الآن.\n\n${s}`,
    chatPlanBuy: (b, usdt, p) => `✅ وجدت فرصة في ${b}.\nالدخول ${p.entry} · وقف الخسارة ${p.stopLoss} (-${p.slPct}%) · جني الأرباح ${p.takeProfit} (+${p.tpPct}%)\nسأستخدم ${usdt} USDT.\n\n${p.summary || ""}`,
    chatClosed: (b) => `✅ أغلقت الصفقة على ${b} وبعت بسعر السوق.`, chatConfirmLive: "⚠️ الوضع الحقيقي = أموال حقيقية. اضغط للتأكيد:", chatCloseConfirm: (b) => `إغلاق الصفقة على ${b}؟`,
    managerTitle: "🤖 مدير الصفقات (AI)", managerDesc: "عندما يكون التطبيق مفتوحًا، يراجع البوت الصفقات كل 5 دقائق: قد يرفع وقف الخسارة لحماية الربح أو يغلق الصفقة إذا تغيّر السوق، ولا يزيد المخاطرة أبدًا. عند إغلاق التطبيق يبقى وقف الخسارة وجني الأرباح فعّالين في OKX.",
    managerTight: (b, sl, r) => `🔒 ${b}: رفعت وقف الخسارة إلى ${sl}. ${r}`, managerClose: (b, r) => `🚪 ${b}: أغلقت الصفقة. ${r}`, managerGone: (b) => `🏁 ${b}: أُغلقت الصفقة في OKX (جني الأرباح أو وقف الخسارة).`,
    events: "ماذا فعل البوت", noEvents: "لا شيء بعد.",
    okxTitle: "🔗 ربط OKX", okxDesc: "تُحفظ المفاتيح مشفرة على هاتفك فقط وتُرسل مباشرة إلى OKX، ولا يراها أي خادم. أنشئ مفتاح API بصلاحية Trade فقط — لا تمنح صلاحية السحب أبدًا.",
    apiKey: "API key", apiSecret: "Secret key", passphrase: "Passphrase", demoMode: "🧪 تجريبي (أموال افتراضية)", liveMode: "💰 حقيقي (أموال حقيقية)",
    demoNote: "ابدأ بالوضع التجريبي: فعّل Demo trading في OKX وأنشئ مفتاح API تجريبيًا.", liveWarn: "⚠️ الوضع الحقيقي يستخدم أموالك. التداول عالي المخاطر وقد تخسر.",
    saveTest: "حفظ واختبار الاتصال", connected: "متصل ✓", disconnect: "قطع الاتصال", notConnected: "OKX غير مربوط. اربطه من الإعدادات.",
    balanceUsdt: "رصيد USDT", defaultPct: "% من USDT لكل صفقة", testing: "جارٍ الاختبار...",
    planBtn: "🤖 أعطني خطة تداول", planLoading: "أدرس السوق والأخبار...", planBuy: "✅ فرصة شراء", planWait: "⏸️ انتظر — لا توجد فرصة واضحة الآن",
    entry: "الدخول", slL: "وقف الخسارة", tpL: "جني الأرباح", rr: "العائد/المخاطرة", confidence: "الثقة", reasons: "الأسباب", risks: "المخاطر", timeframe: "المدة",
    conf: { low: "منخفضة", medium: "متوسطة", high: "عالية" }, tf: { hours: "ساعات", days: "أيام", weeks: "أسابيع" },
    useOfBalance: "كم من USDT أستخدم؟", execute: "🚀 نفّذ الصفقة الآن",
    confirmTitle: (mode, usdt, base) => `تأكيد (${mode}): سأشتري ${base} بمبلغ ${usdt} USDT، وأضع وقف الخسارة وجني الأرباح تلقائيًا في OKX.`,
    confirmBtn: "✅ تأكيد وتنفيذ", cancel: "إلغاء", executing: "جارٍ التنفيذ في OKX...",
    done: (q, base, px) => `تم ✓ اشتريت ${q} ${base} بسعر ${px}. وقف الخسارة وجني الأرباح يعملان في OKX على مدار الساعة حتى لو أغلقت التطبيق.`,
    ocoFailed: "⚠️ تم الشراء لكن لم يُوضع وقف الخسارة/جني الأرباح. ضعهما يدويًا في OKX الآن أو أغلق الصفقة.",
    manualTitle: "تداول يدوي في OKX", buyMarket: "شراء (Market)", sellAll: "بيع", closeTrade: "إغلاق الصفقة", trades: "صفقات KimMarket",
    notCryptoOkx: "التنفيذ في OKX للعملات الرقمية فقط (spot). للأسهم استخدم المحفظة الافتراضية.", tradeOpen: "مفتوحة", tradeClosed: "مغلقة",
    planDisclaimer: "هذه خطة من الذكاء الاصطناعي، وليست نصيحة مالية ولا ضمانًا للربح. القرار لك.",
    okxErr: (c, b) => ({ "50123": `🚫 لا يسمح OKX لحسابك بتداول ${b || "هذه العملة"} (قيود بلدك على هذه العملة أو صلاحيات المفتاح). اختر عملة أخرى.`, "50120": "🔑 مفتاح API بدون صلاحية التداول. في OKX ← API فعّل Trade (بدون سحب) وأعد الربط.", insufficient_usdt: "رصيد USDT غير كافٍ في OKX.", below_min_size: "المبلغ أصغر من الحد الأدنى في OKX.", plan_out_of_date: "تغير السعر كثيرًا، اطلب خطة جديدة.", instrument_not_found: "هذه العملة غير متاحة مقابل USDT في OKX.", nothing_to_sell: "لا يوجد ما يُباع.", network: "مشكلة في الاتصال بـOKX.", "50113": "المفتاح السري غير صحيح.", "50111": "API key غير صحيح.", "50105": "Passphrase غير صحيح.", "50101": "هذا المفتاح لا يطابق الوضع (تجريبي/حقيقي).", "50119": "API key غير موجود.", "51008": "الرصيد غير كافٍ." }[c] || "خطأ من OKX: " + c),
  },
  fr: {
    soldButBuyFailed: (sold, b, why) => `⚠️ ${sold} vendu, l'argent est en USDT sur ton compte (rien de perdu), mais l'achat de ${b} a échoué :\n${why}`,
    progress: ["Je récupère le prix et les news...", "J'analyse le graphique...", "J'écris la réponse..."],
    pendingTitle: "⏳ Ordres en attente", noPending: "Aucun ordre en attente.", cancelOrder: "Annuler",
    pendingLine: (p, last) => `${p.instId.replace("-USDT", "")} · achat à ${p.entry} · actuel ${last ?? "…"}${last ? ` (reste ${(((last - p.entry) / last) * 100).toFixed(2)}%)` : ""} · ${p.usdt} USDT · SL ${p.sl} · TP ${p.tp}`,
    pendingPlaced: (b, p) => `⏳ Ordre d'achat placé sur ${b} : j'achète si le prix descend à ${p.entry} (−${p.distPct}%), pour ${p.usdt} USDT.\nSL ${p.stopLoss} · TP ${p.takeProfit} · valable ${p.expiryHours} h.\nL'ordre est sur OKX 24h/24 ; suis-le ou annule-le dans « Portefeuille ».\n\n${p.summary || ""}`,
    pendingFilled: (b, px) => `✅ ${b} : prix atteint (${px}), achat exécuté. SL/TP actifs sur OKX.`, pendingExpired: (b) => `⌛ ${b} : prix non atteint à temps, ordre annulé.`, pendingCanceled: (b) => `🗑️ ${b} : ordre annulé.`,
    ordersCanceled: (n) => `🗑️ ${n} ordre(s) annulé(s).`, nowBadNote: "⚠️ Acheté car tu as demandé maintenant, mais l'IA trouve le moment peu favorable :",
    freeUp: (sold, sz, est, b) => `💱 USDT insuffisant : je vends ${sz} ${sold} (≈${est} USDT, ta crypto la plus faible) pour acheter ${b}.`,
    newChat: "Nouveau chat", chatHistory: "Historique", noChats: "Aucune conversation enregistrée.", deleteChat: "Supprimer",
    missionTitle: "🎯 Mission du bot", missionStop: "Arrêter la mission", missionNone: "Aucune mission. Dis au bot par ex. : « J'ai 93 USDT, achète et vends tout seul, je veux 10 % en 7 jours ».",
    missionLine: (m, pnl, dl) => `Objectif +${m.targetPct}% en ${m.days} j · actuel ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}% · reste ${dl} j · perte max -${m.maxLossPct}% · capital ${m.capital} USDT`,
    missionStarted: (m) => `🎯 Mission lancée : ${m.capital} USDT, objectif +${m.targetPct}% en ${m.days} jours, arrêt si la perte atteint -${m.maxLossPct}%. Je scanne OKX toutes les 15 min et je trade seul (app ouverte).`,
    missionStartBtn: "✅ Lancer la mission", missionStopped: "⏹️ Mission arrêtée. Les positions restent protégées par stop-loss/take-profit sur OKX.",
    missionTarget: (p) => `🎉 Objectif atteint ! +${p.toFixed(2)}%. Positions fermées, mission terminée.`, missionLoss: (p) => `🛑 Perte de ${p.toFixed(2)}% atteinte : positions fermées, mission arrêtée.`, missionEnd: (p) => `⌛ Fin de la mission. Résultat : ${p >= 0 ? "+" : ""}${p.toFixed(2)}%. Positions fermées.`,
    missionBought: (b, usdt, p) => `🤖 Mission : achat ${b} pour ${usdt} USDT · SL ${p.stopLoss} · TP ${p.takeProfit}. ${p.summary || ""}`,
    scanning: "🔎 Je cherche la meilleure crypto sur OKX...", scanNone: (s) => `Rien de propre sur OKX pour l'instant, mieux vaut attendre. ${s || ""}`,
    scanFound: (b, p) => `🔎 ${b} a l'air intéressante.\nEntrée ${p.entry} · SL ${p.stopLoss} (-${p.slPct}%) · TP ${p.takeProfit} (+${p.tpPct}%) · confiance : ${p.confidence || "-"}\n\n${p.summary || ""}${p.risks && p.risks.length ? "\n⚠️ " + p.risks.join(" · ") : ""}`,
    buyIt: (usdt) => `Acheter pour ${usdt} USDT`, closeAllConfirm: "Fermer toutes les positions ?",
    okxWallet: "💼 Mon solde OKX", totalEquity: "Valeur totale", coins: "Cryptos", refresh: "Actualiser",
    chatTradeNoAsset: "Sur quel actif ? Écris par ex. : dir trade f SOL", chatNoOpenTrade: (b) => `Aucun trade KimMarket ouvert sur ${b}.`,
    chatPlanWait: (b, s) => `⏸️ Pas d'entrée sur ${b} : pas de setup clair.\n\n${s}`,
    chatPlanBuy: (b, usdt, p) => `✅ Setup trouvé sur ${b}.\nEntrée ${p.entry} · Stop-loss ${p.stopLoss} (-${p.slPct}%) · Take-profit ${p.takeProfit} (+${p.tpPct}%)\nMontant : ${usdt} USDT.\n\n${p.summary || ""}`,
    chatClosed: (b) => `✅ Trade ${b} fermé au marché.`, chatConfirmLive: "⚠️ RÉEL = argent réel. Appuie pour confirmer :", chatCloseConfirm: (b) => `Fermer le trade ${b} ?`,
    managerTitle: "🤖 Gestionnaire de trades (IA)", managerDesc: "App ouverte : le bot revoit les trades toutes les 5 min, peut remonter le stop pour protéger le gain ou fermer si le marché change. Il n'augmente jamais le risque. App fermée : stop-loss et take-profit restent actifs sur OKX.",
    managerTight: (b, sl, r) => `🔒 ${b} : stop remonté à ${sl}. ${r}`, managerClose: (b, r) => `🚪 ${b} : trade fermé. ${r}`, managerGone: (b) => `🏁 ${b} : trade clôturé sur OKX (TP ou SL).`,
    events: "Actions du bot", noEvents: "Rien pour l'instant.",
    okxTitle: "🔗 Connecter OKX", okxDesc: "Les clés restent chiffrées sur ton téléphone et partent directement vers OKX ; aucun serveur ne les voit. Crée une clé API avec la permission Trade uniquement — jamais Withdraw.",
    apiKey: "API key", apiSecret: "Secret key", passphrase: "Passphrase", demoMode: "🧪 Démo (argent fictif)", liveMode: "💰 Réel (argent réel)",
    demoNote: "Commence en Démo : active Demo trading sur OKX et crée une clé API démo.", liveWarn: "⚠️ Réel = ton vrai argent. Le trading est très risqué, tu peux perdre.",
    saveTest: "Enregistrer et tester", connected: "Connecté ✓", disconnect: "Déconnecter", notConnected: "OKX n'est pas connecté. Va dans Réglages.",
    balanceUsdt: "Solde USDT", defaultPct: "% de l'USDT par trade", testing: "Test...",
    planBtn: "🤖 Plan de trading", planLoading: "J'analyse le marché et l'actu...", planBuy: "✅ Opportunité d'achat", planWait: "⏸️ Attendre — pas de setup clair",
    entry: "Entrée", slL: "Stop-loss", tpL: "Take-profit", rr: "Gain/risque", confidence: "Confiance", reasons: "Pourquoi", risks: "Risques", timeframe: "Horizon",
    conf: { low: "faible", medium: "moyenne", high: "élevée" }, tf: { hours: "heures", days: "jours", weeks: "semaines" },
    useOfBalance: "Combien d'USDT utiliser ?", execute: "🚀 Lancer le trade",
    confirmTitle: (mode, usdt, base) => `Confirmation (${mode}) : achat de ${base} pour ${usdt} USDT, avec stop-loss et take-profit automatiques sur OKX.`,
    confirmBtn: "✅ Confirmer", cancel: "Annuler", executing: "Exécution sur OKX...",
    done: (q, base, px) => `Fait ✓ ${q} ${base} acheté à ${px}. Stop-loss et take-profit actifs sur OKX 24h/24, même app fermée.`,
    ocoFailed: "⚠️ Achat fait, mais stop-loss/take-profit non placés. Place-les sur OKX ou ferme la position.",
    manualTitle: "Trading manuel OKX", buyMarket: "Acheter (Market)", sellAll: "Vendre", closeTrade: "Fermer", trades: "Trades KimMarket",
    notCryptoOkx: "L'exécution OKX est réservée aux cryptos (spot). Pour les actions, utilise le portefeuille fictif.", tradeOpen: "ouvert", tradeClosed: "fermé",
    planDisclaimer: "Plan généré par IA : pas un conseil financier ni une garantie de gain. Tu décides.",
    okxErr: (c, b) => ({ "50123": `🚫 OKX n'autorise pas ton compte à trader ${b || "cette crypto"} (restriction de pays ou permissions de la clé). Choisis une autre crypto.`, "50120": "🔑 La clé API n'a pas la permission Trade. Active Trade (sans Withdraw) dans OKX → API puis reconnecte.", insufficient_usdt: "USDT insuffisant sur OKX.", below_min_size: "Montant sous le minimum OKX.", plan_out_of_date: "Le prix a trop bougé, demande un nouveau plan.", instrument_not_found: "Paire USDT introuvable sur OKX.", nothing_to_sell: "Rien à vendre.", network: "Problème de connexion à OKX.", "50113": "Secret incorrect.", "50111": "API key incorrecte.", "50105": "Passphrase incorrecte.", "50101": "Clé ne correspond pas au mode (Démo/Réel).", "50119": "API key inexistante.", "51008": "Solde insuffisant." }[c] || "Erreur OKX : " + c),
  },
  en: {
    soldButBuyFailed: (sold, b, why) => `⚠️ Sold ${sold}; the money is now USDT in your account (nothing lost), but buying ${b} failed:\n${why}`,
    progress: ["Fetching price and news...", "Reading the chart and indicators...", "Writing your answer..."],
    pendingTitle: "⏳ Orders waiting for price", noPending: "No waiting orders.", cancelOrder: "Cancel",
    pendingLine: (p, last) => `${p.instId.replace("-USDT", "")} · buy at ${p.entry} · now ${last ?? "…"}${last ? ` (${(((last - p.entry) / last) * 100).toFixed(2)}% away)` : ""} · ${p.usdt} USDT · SL ${p.sl} · TP ${p.tp}`,
    pendingPlaced: (b, p) => `⏳ Placed a buy order on ${b}: I'll buy if price drops to ${p.entry} (−${p.distPct}% from now), for ${p.usdt} USDT.\nSL ${p.stopLoss} · TP ${p.takeProfit} · valid ${p.expiryHours} h.\nThe order sits on OKX 24/7; track or cancel it in Portfolio.\n\n${p.summary || ""}`,
    pendingFilled: (b, px) => `✅ ${b}: price reached ${px} and the buy filled. Stop-loss and take-profit are live on OKX.`, pendingExpired: (b) => `⌛ ${b}: price didn't reach the level in time; order cancelled.`, pendingCanceled: (b) => `🗑️ ${b}: order cancelled.`,
    ordersCanceled: (n) => `🗑️ Cancelled ${n} waiting order(s).`, nowBadNote: "⚠️ Bought because you asked for now, but the AI thinks the timing isn't great:",
    freeUp: (sold, sz, est, b) => `💱 Not enough USDT: I'll sell ${sz} ${sold} (≈${est} USDT, your weakest coin right now) to buy ${b}.`,
    newChat: "New chat", chatHistory: "Chats", noChats: "No saved chats yet.", deleteChat: "Delete chat",
    missionTitle: "🎯 Bot mission", missionStop: "Stop mission", missionNone: "No mission. Tell the bot e.g.: \"I have 93 USDT, buy and sell by yourself, I want 10% in 7 days\".",
    missionLine: (m, pnl, dl) => `Target +${m.targetPct}% in ${m.days} days · now ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}% · ${dl} days left · max loss -${m.maxLossPct}% · capital ${m.capital} USDT`,
    missionStarted: (m) => `🎯 Mission started: ${m.capital} USDT, target +${m.targetPct}% in ${m.days} days, stopping if loss hits -${m.maxLossPct}%. I'll scan OKX every 15 min and trade by myself (while the app is open).`,
    missionStartBtn: "✅ Start mission", missionStopped: "⏹️ Mission stopped. Open trades stay protected by stop-loss/take-profit on OKX.",
    missionTarget: (p) => `🎉 Target reached! +${p.toFixed(2)}%. Closed the trades and ended the mission.`, missionLoss: (p) => `🛑 Loss reached ${p.toFixed(2)}%: closed the trades and stopped the mission to protect your money.`, missionEnd: (p) => `⌛ Mission time is over. Result: ${p >= 0 ? "+" : ""}${p.toFixed(2)}%. Trades closed.`,
    missionBought: (b, usdt, p) => `🤖 Mission: bought ${b} for ${usdt} USDT · SL ${p.stopLoss} · TP ${p.takeProfit}. ${p.summary || ""}`,
    scanning: "🔎 Scanning OKX for the best coin right now...", scanNone: (s) => `Scanned OKX and found nothing clean right now; better to wait. ${s || ""}`,
    scanFound: (b, p) => `🔎 ${b} looks good right now.\nEntry ${p.entry} · SL ${p.stopLoss} (-${p.slPct}%) · TP ${p.takeProfit} (+${p.tpPct}%) · confidence: ${p.confidence || "-"}\n\n${p.summary || ""}${p.risks && p.risks.length ? "\n⚠️ " + p.risks.join(" · ") : ""}`,
    buyIt: (usdt) => `Buy for ${usdt} USDT`, closeAllConfirm: "Close all trades?",
    okxWallet: "💼 My OKX balance", totalEquity: "Total value", coins: "Coins", refresh: "Refresh",
    chatTradeNoAsset: "Which asset? Type e.g.: dir trade f SOL", chatNoOpenTrade: (b) => `No open KimMarket trade on ${b}.`,
    chatPlanWait: (b, s) => `⏸️ No entry on ${b}: no clear setup right now.\n\n${s}`,
    chatPlanBuy: (b, usdt, p) => `✅ Found a setup on ${b}.\nEntry ${p.entry} · Stop-loss ${p.stopLoss} (-${p.slPct}%) · Take-profit ${p.takeProfit} (+${p.tpPct}%)\nUsing ${usdt} USDT.\n\n${p.summary || ""}`,
    chatClosed: (b) => `✅ Closed the ${b} trade at market.`, chatConfirmLive: "⚠️ LIVE = real money. Tap to confirm:", chatCloseConfirm: (b) => `Close the ${b} trade?`,
    managerTitle: "🤖 Trade manager (AI)", managerDesc: "While the app is open the bot reviews open trades every 5 min: it may raise the stop to protect profit or close if the market turns. It never adds risk. When the app is closed, stop-loss and take-profit keep running on OKX.",
    managerTight: (b, sl, r) => `🔒 ${b}: raised stop-loss to ${sl}. ${r}`, managerClose: (b, r) => `🚪 ${b}: closed the trade. ${r}`, managerGone: (b) => `🏁 ${b}: trade closed on OKX (take-profit or stop-loss).`,
    events: "Bot activity", noEvents: "Nothing yet.",
    okxTitle: "🔗 Connect OKX", okxDesc: "Keys stay encrypted on your phone and go straight to OKX; no server ever sees them. Create an API key with Trade permission only — never Withdraw.",
    apiKey: "API key", apiSecret: "Secret key", passphrase: "Passphrase", demoMode: "🧪 Demo (test money)", liveMode: "💰 Live (real money)",
    demoNote: "Start with Demo: switch on Demo trading in OKX and create a demo API key.", liveWarn: "⚠️ Live uses your real money. Trading is high-risk; you can lose.",
    saveTest: "Save & test connection", connected: "Connected ✓", disconnect: "Disconnect", notConnected: "OKX isn't connected. Connect it in Settings.",
    balanceUsdt: "USDT balance", defaultPct: "% of USDT per trade", testing: "Testing...",
    planBtn: "🤖 Give me a trade plan", planLoading: "Studying the market and news...", planBuy: "✅ Buy setup", planWait: "⏸️ Wait — no clear setup right now",
    entry: "Entry", slL: "Stop-loss", tpL: "Take-profit", rr: "Reward/risk", confidence: "Confidence", reasons: "Why", risks: "Risks", timeframe: "Timeframe",
    conf: { low: "low", medium: "medium", high: "high" }, tf: { hours: "hours", days: "days", weeks: "weeks" },
    useOfBalance: "How much USDT to use?", execute: "🚀 Place the trade now",
    confirmTitle: (mode, usdt, base) => `Confirm (${mode}): buy ${base} for ${usdt} USDT and set stop-loss + take-profit automatically on OKX.`,
    confirmBtn: "✅ Confirm & execute", cancel: "Cancel", executing: "Executing on OKX...",
    done: (q, base, px) => `Done ✓ bought ${q} ${base} at ${px}. Stop-loss and take-profit run on OKX 24/7, even with the app closed.`,
    ocoFailed: "⚠️ Bought, but stop-loss/take-profit were NOT placed. Set them in OKX now or close the trade.",
    manualTitle: "Manual OKX trading", buyMarket: "Buy (Market)", sellAll: "Sell", closeTrade: "Close trade", trades: "KimMarket trades",
    notCryptoOkx: "OKX execution is for crypto (spot) only. For stocks use the paper portfolio.", tradeOpen: "open", tradeClosed: "closed",
    planDisclaimer: "AI-generated plan — not financial advice and no guarantee of profit. You decide.",
    okxErr: (c, b) => ({ "50123": `🚫 OKX doesn't allow your account to trade ${b || "this coin"} (country restriction or key permissions). Pick another coin.`, "50120": "🔑 The API key has no Trade permission. Enable Trade (not Withdraw) in OKX → API and reconnect.", insufficient_usdt: "Not enough USDT on OKX.", below_min_size: "Amount is below OKX's minimum.", plan_out_of_date: "Price moved too much, request a new plan.", instrument_not_found: "No USDT pair for this coin on OKX.", nothing_to_sell: "Nothing to sell.", network: "Couldn't reach OKX.", "50113": "Wrong secret key.", "50111": "Wrong API key.", "50105": "Wrong passphrase.", "50101": "Key doesn't match the mode (Demo/Live).", "50119": "API key doesn't exist.", "51008": "Insufficient balance." }[c] || "OKX error: " + c),
  },
};

function strings(lang) { const k = S[lang] ? lang : "darija"; return { ...S[k], ...X[k] }; }
function isRTL(lang) { return lang === "darija" || lang === "ar"; }

// ===== okx.js (inlined for Snack)
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

function utf8(s) {
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

function sha256(msg) {
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

function hmacSha256(key, msg) {
  if (key.length > 64) key = sha256(key);
  const k = new Uint8Array(64); k.set(key);
  const ip = new Uint8Array(64 + msg.length), op = new Uint8Array(64 + 32);
  for (let i = 0; i < 64; i++) { ip[i] = k[i] ^ 0x36; op[i] = k[i] ^ 0x5c; }
  ip.set(msg, 64); op.set(sha256(ip), 64);
  return sha256(op);
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function base64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    s += B64[a >> 2] + B64[((a & 3) << 4) | ((b || 0) >> 4)] + (b === undefined ? "=" : B64[((b & 15) << 2) | ((c || 0) >> 6)]) + (c === undefined ? "=" : B64[c & 63]);
  }
  return s;
}

function sign(secret, ts, method, path, body = "") {
  return base64(hmacSha256(utf8(secret), utf8(ts + method.toUpperCase() + path + body)));
}

// ---------------------------------------------------------------- number helpers
const decimals = (step) => { const s = String(step); return s.includes(".") ? s.split(".")[1].replace(/0+$/, "").length || 0 : 0; };
function floorTo(x, step) { const d = decimals(step), st = parseFloat(step); const v = Math.floor(x / st + 1e-9) * st; return v.toFixed(d); }
function roundTo(x, step) { const d = decimals(step), st = parseFloat(step); return (Math.round(x / st) * st).toFixed(d); }

// ---------------------------------------------------------------- client
const BASES = ["https://www.okx.com", "https://openapi.okx.com"];

class OkxError extends Error { constructor(msg, code, data) { super(msg); this.code = code; this.data = data; } }

function createOkx({ key, secret, passphrase, demo = true }, fetchImpl = fetch) {
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
    // Limit buy that waits on the OKX order book (24/7) with TP/SL attached: they activate on OKX as soon as it fills.
    async limitBuy(instId, px, sz, tp, sl) {
      const d = await raw("POST", "/api/v5/trade/order", { instId, tdMode: "cash", side: "buy", ordType: "limit", px: String(px), sz: String(sz), tag: "kimmarket",
        attachAlgoOrds: [{ tpTriggerPx: String(tp), tpOrdPx: "-1", slTriggerPx: String(sl), slOrdPx: "-1" }] });
      return d[0].ordId;
    },
    // Can THIS account trade this pair? (some coins are blocked by country rules or key permissions -> OKX error 50123)
    async canTrade(instId) {
      try { const d = await raw("GET", `/api/v5/account/instruments?instType=SPOT&instId=${encodeURIComponent(instId)}`); return Array.isArray(d) ? d.length > 0 : null; }
      catch (e) { if (e.code === "50123" || e.code === "51001" || e.code === "50120") return false; return null; }
    },
    async cancelOrder(instId, ordId) { return raw("POST", "/api/v5/trade/cancel-order", { instId, ordId }); },
    async algosPending(instId) {
      const out = [];
      for (const ordType of ["oco", "conditional"]) {
        try { const d = await raw("GET", `/api/v5/trade/orders-algo-pending?ordType=${ordType}&instType=SPOT&instId=${encodeURIComponent(instId)}`); d.forEach((a) => out.push({ algoId: a.algoId, sz: parseFloat(a.sz) || 0, tag: a.tag || "", cTime: parseInt(a.cTime, 10) || 0, ordType })); } catch {}
      }
      return out.sort((a, b) => b.cTime - a.cTime);
    },
  };
  return api;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Full confirmed trade: market buy with USDT -> wait for fill -> OCO (take-profit + stop-loss) that lives on OKX 24/7.
async function executePlan(okx, { base, usdt, takeProfit, stopLoss }, wait = sleep) {
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

// Close a KimMarket trade: cancel its OCO (or the TP/SL attached to a filled limit order), then market-sell what it bought.
async function closeTrade(okx, trade) {
  if (trade.algoId) { try { await okx.cancelAlgo(trade.instId, trade.algoId); } catch {} }
  else if (okx.algosPending) {
    const mine = (await okx.algosPending(trade.instId)).filter((a) => a.tag === "kimmarket" || Math.abs(a.sz - (trade.qty || 0)) <= (trade.qty || 0) * 0.02);
    for (const a of mine) { try { await okx.cancelAlgo(trade.instId, a.algoId); } catch {} }
  }
  const inst = await okx.instrument(trade.instId);
  const base = trade.instId.split("-")[0];
  const bal = await okx.balances();
  const avail = (bal.ccy[base] && bal.ccy[base].avail) || 0;
  const sz = floorTo(Math.min(trade.qty, avail), inst.lotSz);
  if (parseFloat(sz) < inst.minSz) throw new OkxError("nothing_to_sell", "nothing_to_sell");
  return okx.marketSell(trade.instId, sz);
}

// AI manager raised the stop: cancel the old OCO and place a new one (same qty + take-profit, higher stop).
async function replaceStop(okx, trade, newStop) {
  const inst = await okx.instrument(trade.instId);
  const last = await okx.ticker(trade.instId);
  if (!(newStop < last)) throw new OkxError("stop_above_price", "stop_above_price");
  if (trade.algoId) await okx.cancelAlgo(trade.instId, trade.algoId);
  const sl = roundTo(newStop, inst.tickSz);
  const algoId = await okx.oco(trade.instId, floorTo(trade.qty, inst.lotSz), trade.tp, sl);
  return { ...trade, algoId, sl };
}

// Was the trade already closed on OKX (take-profit / stop-loss hit, or sold manually)? Uses total equity of the coin, incl. frozen.
function isGone(bal, trade) {
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

function scoreCandles(c) { // c: closes oldest -> newest (1h)
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

async function scanMarket(fetchImpl = fetch, { minVol = 1e7, max = 6 } = {}) {
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


// ---------------------------------------------------------------- waiting (limit) entries
// Place a limit buy at the AI's entry price; OKX keeps it 24/7 and activates TP/SL on fill.
async function placeEntry(okx, { base, usdt, entry, takeProfit, stopLoss, expiryHours = 24 }) {
  const instId = `${base}-USDT`;
  const inst = await okx.instrument(instId);
  const last = await okx.ticker(instId);
  if (!(entry < last)) throw new OkxError("entry_above_price", "entry_above_price", { last });
  if (!(stopLoss < entry && entry < takeProfit)) throw new OkxError("plan_out_of_date", "plan_out_of_date");
  const bal = await okx.balances();
  const free = (bal.ccy.USDT && bal.ccy.USDT.avail) || 0;
  if (free < usdt) throw new OkxError("insufficient_usdt", "insufficient_usdt", { free });
  const px = roundTo(entry, inst.tickSz);
  const sz = floorTo(usdt / parseFloat(px), inst.lotSz);
  if (parseFloat(sz) < inst.minSz) throw new OkxError("below_min_size", "below_min_size", { minSz: inst.minSz });
  const tp = roundTo(takeProfit, inst.tickSz), sl = roundTo(stopLoss, inst.tickSz);
  const ordId = await okx.limitBuy(instId, px, sz, tp, sl);
  return { kind: "pending", instId, ordId, entry: parseFloat(px), sz: parseFloat(sz), tp, sl, usdt, demo: okx.demo, ts: Date.now(), expiresAt: Date.now() + expiryHours * 3600000, lastPx: last };
}

// Check a waiting order: still waiting, filled (-> becomes a trade), canceled, or expired (we cancel it).
async function checkPending(okx, p) {
  const o = await okx.order(p.instId, p.ordId);
  if (o.state === "filled" || (o.state === "canceled" && o.filled > 0)) {
    const base = p.instId.split("-")[0];
    let algoId = null;
    try { const al = await okx.algosPending(p.instId); const m = al.find((a) => Math.abs(a.sz - o.filled) <= o.filled * 0.03) || al[0]; algoId = m ? m.algoId : null; } catch {}
    return { state: "filled", trade: { instId: p.instId, demo: p.demo, ts: Date.now(), usdt: p.usdt, fill: o, qty: o.filled + (o.feeCcy === base ? o.fee : 0), tp: p.tp, sl: p.sl, algoId, open: true, source: "limit" } };
  }
  if (o.state === "canceled" || o.state === "mmp_canceled") return { state: "canceled" };
  if (Date.now() > p.expiresAt && o.filled === 0) { try { await okx.cancelOrder(p.instId, p.ordId); } catch {} return { state: "expired" }; }
  let lastPx = p.lastPx; try { lastPx = await okx.ticker(p.instId); } catch {}
  return { state: "waiting", lastPx };
}

// Not enough USDT? Sell (part of) the weakest coin the user holds. Coins locked in open trades are skipped.
async function freeUpUsdt(okx, needUsdt, { exclude = [] } = {}, fetchImpl = fetch) {
  const bal = await okx.balances();
  const have = (bal.ccy.USDT && bal.ccy.USDT.avail) || 0;
  const missing = needUsdt - have;
  if (missing <= 0) return { sold: null, missing: 0 };
  const holds = Object.entries(bal.ccy).filter(([c, v]) => c !== "USDT" && !exclude.includes(c) && v.avail > 0 && v.eq > 0 && (v.usd * v.avail / v.eq) >= 1)
    .map(([c, v]) => ({ ccy: c, avail: v.avail, usdAvail: v.usd * v.avail / v.eq }));
  if (!holds.length) throw new OkxError("nothing_to_sell", "nothing_to_sell");
  for (const h of holds) {
    try {
      const k = await fetchImpl(`https://www.okx.com/api/v5/market/candles?instId=${h.ccy}-USDT&bar=1H&limit=100`).then((r) => r.json());
      const closes = (k.data || []).map((row) => parseFloat(row[4])).reverse();
      h.score = closes.length >= 60 ? scoreCandles(closes).score : 0;
    } catch { h.score = 0; }
  }
  const enough = holds.filter((h) => h.usdAvail >= missing * 1.03);
  const pick = (enough.length ? enough : holds).sort((a, b) => a.score - b.score || b.usdAvail - a.usdAvail)[0];
  const instId = `${pick.ccy}-USDT`;
  const inst = await okx.instrument(instId);
  const last = await okx.ticker(instId);
  const wantBase = Math.min(pick.avail, (missing * 1.03) / last);
  const sz = floorTo(Math.max(wantBase, inst.minSz), inst.lotSz);
  if (parseFloat(sz) > pick.avail || parseFloat(sz) < inst.minSz) throw new OkxError("nothing_to_sell", "nothing_to_sell");
  return { sold: pick.ccy, sz: parseFloat(sz), estUsdt: +(parseFloat(sz) * last).toFixed(2), score: pick.score, instId, missing: +missing.toFixed(2) };
}
async function sellForUsdt(okx, plan) { return okx.marketSell(plan.instId, plan.sz); }

// The user named the coin to sell ("sell BTC and buy SOL"): plan selling all of it, or just enough for `usdt`.
async function salePlanFor(okx, ccy, usdt = null) {
  const bal = await okx.balances();
  const avail = (bal.ccy[ccy] && bal.ccy[ccy].avail) || 0;
  if (!(avail > 0)) throw new OkxError("nothing_to_sell", "nothing_to_sell", { ccy });
  const instId = `${ccy}-USDT`;
  const inst = await okx.instrument(instId);
  const last = await okx.ticker(instId);
  const want = usdt ? Math.min(avail, (usdt * 1.03) / last) : avail;
  const sz = floorTo(want, inst.lotSz);
  if (parseFloat(sz) < inst.minSz) throw new OkxError("nothing_to_sell", "nothing_to_sell", { ccy });
  return { sold: ccy, sz: parseFloat(sz), estUsdt: +(parseFloat(sz) * last).toFixed(2), instId, all: !usdt };
}

// ===== App

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
  const [okxBal, setOkxBal] = useState(null);
  const [okxEvents, setOkxEventsState] = useState([]);
  const addEvent = (text) => setOkxEventsState((prev) => { const n = [{ ts: Date.now(), text }, ...prev].slice(0, 40); store.set("okxEvents", n); return n; });
  const refreshBal = useCallback(async () => { if (!okx) { setOkxBal(null); return null; } try { const b = await okx.balances(); setOkxBal(b); return b; } catch { return null; } }, [okx]);
  const tradesRef = useRef(okxTrades); tradesRef.current = okxTrades;
  const langRef = useRef(lang); langRef.current = lang;
  const [okxPending, setOkxPendingState] = useState([]);
  const pendingRef = useRef(okxPending); pendingRef.current = okxPending;
  const setOkxPending = (fn) => setOkxPendingState((prev) => { const n = typeof fn === "function" ? fn(prev) : fn; pendingRef.current = n; store.set("okxPending", n); return n; });
  const cancelPending = async (filter = () => true) => {
    const list = pendingRef.current.filter((p) => okx && p.demo === okx.demo && filter(p));
    for (const p of list) { try { await okx.cancelOrder(p.instId, p.ordId); } catch {} }
    setOkxPending((prev) => prev.filter((p) => !list.includes(p)));
    refreshBal();
    return list.length;
  };
  // Every minute: is a waiting order filled / expired? Update its live price.
  const pollPending = async () => {
    if (!okx) return;
    const tt = strings(langRef.current);
    for (const p of pendingRef.current.filter((x) => x.demo === okx.demo)) {
      try {
        const r = await checkPending(okx, p);
        const base = p.instId.split("-")[0];
        if (r.state === "filled") { setOkxTrades((prev) => [{ ...r.trade, symbol: p.symbol }, ...prev]); setOkxPending((prev) => prev.filter((x) => x.ordId !== p.ordId)); addEvent(tt.pendingFilled(base, r.trade.fill.avgPx)); }
        else if (r.state === "expired" || r.state === "canceled") { setOkxPending((prev) => prev.filter((x) => x.ordId !== p.ordId)); addEvent(r.state === "expired" ? tt.pendingExpired(base) : tt.pendingCanceled(base)); }
        else setOkxPending((prev) => prev.map((x) => (x.ordId === p.ordId ? { ...x, lastPx: r.lastPx } : x)));
      } catch {}
    }
  };
  const [mission, setMissionState] = useState(null);
  const missionRef = useRef(mission); missionRef.current = mission;
  const setMission = (m) => { missionRef.current = m; setMissionState(m); store.set("mission", m); };

  // Buy with a validated plan, store the trade (OCO protects it on OKX).
  const openPosition = async (base, symbol, plan, usdt, extra = {}) => {
    const log = await executePlan(okx, { base, usdt, takeProfit: plan.takeProfit, stopLoss: plan.stopLoss });
    if (log.fill) setOkxTrades((prev) => [{ ...log, symbol, open: true, ...extra }, ...prev]);
    refreshBal();
    return log;
  };
  const closeOpen = async (filter = () => true) => {
    const list = tradesRef.current.filter((x) => x.open && okx && x.demo === okx.demo && filter(x));
    for (const tr of list) {
      try { await closeTrade(okx, tr); } catch (e) { if (e.code !== "nothing_to_sell") throw e; }
      setOkxTrades((prev) => prev.map((x) => (x.ts === tr.ts ? { ...x, open: false, closedAt: Date.now() } : x)));
    }
    refreshBal();
    return list.length;
  };
  // Scan OKX (public data, on the phone) and let the AI pick at most one coin.
  const scanAndPick = async (goal, exclude = []) => {
    let cands = (await scanMarket()).filter((c) => !exclude.includes(c.instId));
    if (okx) { const ok2 = await Promise.all(cands.map((c) => okx.canTrade(c.instId))); cands = cands.filter((c, i) => ok2[i] !== false); } // skip coins this account can't trade
    if (!cands.length) return { pick: null, summary: "" };
    return (await api("/pick", { method: "POST", body: JSON.stringify({ candidates: cands, goal, lang: langRef.current }) })).pick;
  };
  const startMission = async (a) => {
    const b = (await refreshBal()) || okxBal;
    const free = (b && b.ccy.USDT && b.ccy.USDT.avail) || 0;
    const capital = Math.floor(Math.min(a.capitalUsdt || free, free) * 100) / 100;
    if (!(capital >= 5)) throw Object.assign(new Error("insufficient_usdt"), { code: "insufficient_usdt" });
    const m = { active: true, demo: okx.demo, capital, targetPct: a.targetPct || 10, days: a.days || 7, maxLossPct: a.maxLossPct || 10,
      maxPositions: capital >= 40 ? 2 : 1, startTotal: b.totalUsd, startedAt: Date.now(), endsAt: Date.now() + (a.days || 7) * 86400000, lastScan: 0, pnl: 0 };
    setMission(m);
    setTimeout(() => missionCycleRef.current && missionCycleRef.current(true), 500);
    return m;
  };
  const stopMission = () => { if (missionRef.current) setMission({ ...missionRef.current, active: false, stoppedAt: Date.now() }); };

  const missionCycleRef = useRef(null);
  missionCycleRef.current = async (force = false) => {
    const m = missionRef.current; if (!m || !m.active || !okx || okx.demo !== m.demo) return;
    const tt = strings(langRef.current);
    const bal = await refreshBal(); if (!bal) return;
    const pnl = ((bal.totalUsd - m.startTotal) / m.capital) * 100;
    const end = async (msgFn) => { try { await closeOpen((x) => x.mission); } catch {} setMission({ ...missionRef.current, active: false, pnl, stoppedAt: Date.now() }); addEvent(msgFn(pnl)); };
    if (pnl >= m.targetPct) return end(tt.missionTarget);
    if (pnl <= -m.maxLossPct) return end(tt.missionLoss);
    if (Date.now() > m.endsAt) return end(tt.missionEnd);
    let cur = { ...missionRef.current, pnl };
    const open = tradesRef.current.filter((x) => x.open && x.mission && x.demo === okx.demo);
    if (open.length < m.maxPositions && (force || Date.now() - (m.lastScan || 0) > 15 * 60000)) {
      cur.lastScan = Date.now(); setMission(cur);
      const free = (bal.ccy.USDT && bal.ccy.USDT.avail) || 0;
      const used = open.reduce((s2, x) => s2 + (x.usdt || 0), 0);
      const usdt = Math.floor(Math.min(free, m.capital - used, m.capital / m.maxPositions) * 100) / 100;
      if (usdt >= 5) {
        try {
          const pick = await scanAndPick({ targetPct: m.targetPct, days: m.days, pnlPct: +pnl.toFixed(2), daysLeft: Math.ceil((m.endsAt - Date.now()) / 86400000) }, open.map((x) => x.instId));
          if (pick && pick.pick) {
            const base = pick.pick.split("-")[0];
            const log = await openPosition(base, base + "-USD", pick, usdt, { mission: true, source: "mission" });
            if (log.fill) addEvent(tt.missionBought(base, usdt, pick));
          }
        } catch (e) { /* retry next cycle */ }
      }
      return;
    }
    setMission(cur);
  };

  const okxProps = { okx, okxCreds, setOkxCreds, okxCfg, setOkxCfg, okxTrades, setOkxTrades, okxBal, refreshBal, okxEvents, addEvent,
    mission, startMission, stopMission, scanAndPick, openPosition, closeOpen, okxPending, setOkxPending, cancelPending };

  // Live OKX balance (every 60 s) + AI trade manager (every 5 min) while the app is open.
  useEffect(() => {
    if (!okx) { setOkxBal(null); return; }
    let stop = false;
    const manage = async () => {
      const tt = strings(langRef.current);
      const bal = await refreshBal();
      const open = tradesRef.current.filter((x) => x.open && x.demo === okx.demo);
      for (const tr of open) {
        if (stop) return;
        const base = tr.instId.split("-")[0];
        try {
          if (bal && isGone(bal, tr)) { setOkxTrades((prev) => prev.map((x) => (x.ts === tr.ts ? { ...x, open: false, closedAt: Date.now() } : x))); addEvent(tt.managerGone(base)); continue; }
          if (!tr.sl || !tr.tp || !tr.fill) continue;
          const { review } = await api("/manage", { method: "POST", body: JSON.stringify({ symbol: tr.symbol || base + "-USD", entry: tr.fill.avgPx, stopLoss: parseFloat(tr.sl), takeProfit: parseFloat(tr.tp), openedAt: tr.ts, lang: langRef.current }) });
          if (review.action === "close") {
            await closeTrade(okx, tr);
            setOkxTrades((prev) => prev.map((x) => (x.ts === tr.ts ? { ...x, open: false, closedAt: Date.now() } : x)));
            addEvent(tt.managerClose(base, review.reason));
          } else if (review.action === "tighten") {
            const moved = await replaceStop(okx, tr, review.newStopLoss);
            setOkxTrades((prev) => prev.map((x) => (x.ts === tr.ts ? moved : x)));
            addEvent(tt.managerTight(base, moved.sl, review.reason));
          }
        } catch (e) { /* keep the existing OCO; try again next cycle */ }
      }
      if (!stop && missionCycleRef.current) await missionCycleRef.current();
    };
    manage();
    pollPending();
    const balTimer = setInterval(() => { refreshBal(); pollPending(); }, 60000), mgrTimer = setInterval(manage, 300000);
    return () => { stop = true; clearInterval(balTimer); clearInterval(mgrTimer); };
  }, [okx]); // eslint-disable-line react-hooks/exhaustive-deps
  const t = strings(lang), rtl = isRTL(lang);

  useEffect(() => { (async () => {
    setLang(await store.get("lang", "darija"));
    setOkxCreds(await secure.get());
    setOkxCfgState(await store.get("okxCfg", { pct: 10 }));
    setOkxTradesState(await store.get("okxTrades", []));
    setOkxEventsState(await store.get("okxEvents", []));
    setMissionState(await store.get("mission", null));
    setOkxPendingState(await store.get("okxPending", []));
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
        {okxBal ? <Pressable onPress={() => setTab("portfolio")}><Text style={[st.trialPill, { color: C.green }]}>OKX ${fmtMoney(okxBal.totalUsd)}{okx && okx.demo ? " · demo" : ""}</Text></Pressable>
          : !sub.plan && <Text style={st.trialPill}>{t.trialLeft(daysLeft)}</Text>}
      </View>
      <View style={st.fill}>
        {tab === "alerts" && <Alerts t={t} rtl={rtl} />}
        {tab === "chat" && <Chat t={t} rtl={rtl} lang={lang} seed={chatSeed} okxProps={okxProps} />}
        {tab === "markets" && <Markets t={t} rtl={rtl} lang={lang} onAnalyse={askAbout} paper={paper} setPaper={setPaper} okxProps={okxProps} />}
        {tab === "portfolio" && <Portfolio t={t} rtl={rtl} paper={paper} setPaper={setPaper} okxProps={okxProps} />}
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
// Saved conversations (like ChatGPT): every chat is kept on the phone; "+" starts a new one, the list icon opens old ones.
const MAX_CHATS = 40, MAX_MSGS = 120;
const chatTitle = (msgs) => { const u = msgs.find((m) => m.me); return u ? String(u.text).slice(0, 48) : null; };

function Chat({ t, rtl, lang, seed, okxProps }) {
  const hello = () => [{ id: "hello", me: false, text: t.chatHello }];
  const [msgs, setMsgs] = useState(hello);
  const [chatId, setChatId] = useState(null);
  const [chats, setChats] = useState([]);       // [{id, title, updatedAt, msgs}]
  const [showHistory, setShowHistory] = useState(false);
  const loaded = useRef(false);

  useEffect(() => { (async () => {
    const all = await store.get("chats", []);
    const cur = await store.get("chatCur", null);
    setChats(all);
    const c = all.find((x) => x.id === cur);
    const fromSeed = seed && seed.q && Date.now() - seed.at < 5000; // "analyse" from a coin page opens a fresh chat
    if (c && !fromSeed) { setChatId(c.id); setMsgs(c.msgs.length ? c.msgs : hello()); } else setChatId("c" + Date.now());
    loaded.current = true;
  })(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist after every change (pending bubbles and one-tap buttons are not saved).
  useEffect(() => {
    if (!loaded.current || !chatId) return;
    const clean = msgs.filter((m) => !m.pending && m.id !== "hello").map(({ action, ...m }) => m).slice(-MAX_MSGS);
    if (!clean.length) return;
    setChats((prev) => {
      const next = [{ id: chatId, title: chatTitle(clean) || "…", updatedAt: Date.now(), msgs: clean }, ...prev.filter((x) => x.id !== chatId)].slice(0, MAX_CHATS);
      store.set("chats", next); store.set("chatCur", chatId);
      return next;
    });
  }, [msgs, chatId]);

  const newChat = () => { if (busy) return; actions.current = {}; setChatId("c" + Date.now()); setMsgs(hello()); setShowHistory(false); store.set("chatCur", null); };
  const openChat = (c) => { if (busy) return; actions.current = {}; setChatId(c.id); setMsgs(c.msgs.length ? c.msgs : hello()); setShowHistory(false); store.set("chatCur", c.id); };
  const deleteChat = (id) => {
    setChats((prev) => { const next = prev.filter((x) => x.id !== id); store.set("chats", next); return next; });
    if (id === chatId) newChat();
  };
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef(null);
  const actions = useRef({});
  const { okx, okxCfg, okxTrades, setOkxTrades, refreshBal, okxBal, mission, startMission, stopMission, scanAndPick, openPosition, closeOpen, setOkxPending, addEvent, okxPending, cancelPending } = okxProps;
  const askLive = (text, label, fn) => { const id = "act" + Date.now(); actions.current[id] = fn; say(text + "\n\n" + t.chatConfirmLive, { action: { id, label } }); };

  const say = (text, extra) => setMsgs((m) => [...m.filter((x) => !x.pending), { id: "b" + Date.now() + Math.random(), me: false, text, ...extra }]);
  const okxFail = (e) => say(t.okxErr((e && e.code) || "network", e && e.data && e.data.ccy));

  // "dir trade f SOL" / "bi3 SOL": Demo executes right away, Live asks for one tap first.
  const tradeCommand = async (ti) => {
    if (!okx) return say(t.notConnected);
    if (!ti.asset) return say(t.chatTradeNoAsset);
    const a = ti.asset, isCrypto = a.type === "crypto" || /-USD$/.test(a.symbol);
    if (!isCrypto) return say(t.notCryptoOkx);
    const base = a.symbol.replace(/\d*-USD$/, ""), instId = base + "-USDT";
    const live = !okx.demo;
    if (ti.intent === "close") {
      const mine = okxTrades.filter((x) => x.open && x.instId === instId && x.demo === okx.demo);
      if (!mine.length) return say(t.chatNoOpenTrade(base));
      const doClose = async () => {
        try { for (const tr of mine) { await closeTrade(okx, tr); setOkxTrades((prev) => prev.map((x) => (x.ts === tr.ts ? { ...x, open: false, closedAt: Date.now() } : x))); } say(t.chatClosed(base)); refreshBal(); }
        catch (e) { okxFail(e); }
      };
      if (!live) return doClose();
      const id = "act" + Date.now(); actions.current[id] = doClose;
      return say(t.chatCloseConfirm(base) + "\n" + t.chatConfirmLive, { action: { id, label: t.closeTrade } });
    }
    // when = "now": buy immediately (AI still sets SL/TP). when = "best": AI buys now, or places a limit order at a better price, or skips.
    const mode = ti.when === "now" ? "now" : "smart";
    let plan;
    try { plan = (await api("/plan", { method: "POST", body: JSON.stringify({ symbol: a.symbol, name: a.name, cgId: a.cgId, type: "crypto", lang, mode }) })).plan; }
    catch (e) { return say(t.error); }
    if (plan.action !== "buy" && plan.action !== "limit") return say(t.chatPlanWait(base, plan.summary || ""));
    const allowed = await okx.canTrade(instId);
    if (allowed === false) return say(t.okxErr("50123", base));
    let bal;
    try { bal = await okx.balances(); } catch (e) { return okxFail(e); }
    const free = (bal.ccy.USDT && bal.ccy.USDT.avail) || 0;
    const keep = (ti.keep || []).map((x) => String(x).toUpperCase());
    let usdt = ti.amountUsdt ? Math.floor(ti.amountUsdt * 100) / 100 : Math.floor(free * (okxCfg.pct || 10)) / 100;
    let sale = null, spendAllAfterSale = false;
    try {
      if (ti.fundFrom && !(ti.amountUsdt && !ti.fundAll && free >= usdt)) { // the user said which coin to sell: obey exactly
        if (keep.includes(ti.fundFrom)) return say(t.okxErr("nothing_to_sell"));
        sale = await salePlanFor(okx, ti.fundFrom, ti.fundAll || !ti.amountUsdt ? null : Math.max(0, usdt - free));
        spendAllAfterSale = ti.fundAll || !ti.amountUsdt;
      } else if (usdt < 5 || usdt > free) { // not enough USDT: sell the weakest coin, never the ones the user wants to keep
        if (usdt < 5) usdt = Math.max(5, Math.floor(bal.totalUsd * (okxCfg.pct || 10)) / 100);
        sale = await freeUpUsdt(okx, usdt, { exclude: [base, ...keep] });
        if (sale.sold === null) sale = null;
      }
    } catch (e) { return okxFail(e); }
    const finish = (log) => {
      if (log.fill) setOkxTrades((prev) => [{ ...log, symbol: a.symbol, open: true, source: "chat" }, ...prev]);
      if (log.error === "oco_failed" || log.error === "oco_too_small") say(t.ocoFailed);
      else if (log.error) say(t.okxErr(log.error));
      else say(t.done(log.qty, base, fmtPrice(log.fill.avgPx)));
    };
    const doIt = async () => {
      try {
        if (sale) {
          if ((await okx.canTrade(instId)) === false) return say(t.okxErr("50123", base)); // never sell first if the buy can't happen
          await sellForUsdt(okx, sale); await new Promise((r) => setTimeout(r, 1500)); addEvent(t.freeUp(sale.sold, sale.sz, sale.estUsdt, base));
          if (spendAllAfterSale) { const b2 = await okx.balances(); usdt = Math.floor(((b2.ccy.USDT && b2.ccy.USDT.avail) || 0) * 0.995 * 100) / 100; }
        }
        if (plan.action === "limit") {
          const p2 = await placeEntry(okx, { base, usdt, entry: plan.entry, takeProfit: plan.takeProfit, stopLoss: plan.stopLoss, expiryHours: plan.expiryHours });
          setOkxPending((prev) => [{ ...p2, symbol: a.symbol }, ...prev]);
          say(t.pendingPlaced(base, { ...plan, usdt }));
        } else finish(await executePlan(okx, { base, usdt, takeProfit: plan.takeProfit, stopLoss: plan.stopLoss }));
        refreshBal();
      } catch (e) {
        if (sale && e.code !== "entry_above_price") { refreshBal(); return say(t.soldButBuyFailed(sale.sold, base, t.okxErr(e.code || "network", base))); }
        if (e.code === "entry_above_price") { try { finish(await executePlan(okx, { base, usdt, takeProfit: plan.takeProfit, stopLoss: plan.stopLoss })); } catch (e2) { okxFail(e2); } }
        else okxFail(e);
      }
    };
    const shownUsdt = spendAllAfterSale ? Math.floor((free + sale.estUsdt) * 0.995 * 100) / 100 : usdt;
    let text = plan.action === "limit" ? "" : t.chatPlanBuy(base, fmtMoney(shownUsdt), plan);
    if (mode === "now" && plan.action === "buy" && (plan.defaultLevels || plan.confidence === "low")) text = t.nowBadNote + "\n\n" + text; // summary is already inside chatPlanBuy
    if (sale) text = t.freeUp(sale.sold, sale.sz, sale.estUsdt, base) + (text ? "\n\n" + text : "");
    if (text) text += "\n\n" + t.planDisclaimer;
    if (!live) { if (text) say(text); return doIt(); }
    const id = "act" + Date.now(); actions.current[id] = doIt;
    say((text || t.pendingPlaced(base, { ...plan, usdt: shownUsdt })) + "\n\n" + t.chatConfirmLive, { action: { id, label: t.confirmBtn } });
  };

  const runAction = async (m) => {
    const fn = actions.current[m.action.id]; if (!fn || busy) return;
    delete actions.current[m.action.id];
    setMsgs((all) => [...all.map((x) => (x.id === m.id ? { ...x, action: null } : x)), { id: "p" + Date.now(), me: false, pending: true, text: t.executing }]);
    setBusy(true); await fn(); setBusy(false);
  };

  const send = useCallback(async (text) => {
    const q = (text || "").trim();
    if (!q || busy) return;
    setInput(""); setBusy(true);
    actions.current = {}; // a new message cancels older confirm buttons (e.g. a plan the user just corrected)
    setMsgs((m) => [...m.map((x) => (x.action ? { ...x, action: null } : x)), { id: "u" + Date.now(), me: true, text: q }, { id: "p" + Date.now(), me: false, pending: true, text: t.thinking }]);
    // Everything goes through Kim (the conversational agent): it understands Darija and decides the action.
    const usdtFree = okxBal && okxBal.ccy.USDT ? okxBal.ccy.USDT.avail : null;
    const ctx = { connected: !!okx, demo: okx ? okx.demo : null, balanceUsd: okxBal ? +okxBal.totalUsd.toFixed(2) : null, usdtFree: usdtFree != null ? +usdtFree.toFixed(2) : null,
      openTrades: okxTrades.filter((x) => x.open && okx && x.demo === okx.demo).map((x) => ({ coin: x.instId, qty: x.qty, entry: x.fill && x.fill.avgPx, sl: x.sl, tp: x.tp, byMission: !!x.mission })),
      holdings: okxBal ? Object.entries(okxBal.ccy).filter(([, v]) => v.usd >= 1).map(([c, v]) => ({ coin: c, usd: +v.usd.toFixed(2) })) : null,
      waitingOrders: (okxPending || []).filter((p) => okx && p.demo === okx.demo).map((p) => ({ coin: p.instId, buyAt: p.entry, now: p.lastPx, usdt: p.usdt })),
      mission: mission && mission.active ? { capital: mission.capital, targetPct: mission.targetPct, days: mission.days, pnlPct: +(mission.pnl || 0).toFixed(2), daysLeft: Math.max(0, Math.ceil((mission.endsAt - Date.now()) / 86400000)) } : null };
    const history = msgs.filter((x) => !x.pending && x.id !== "hello").slice(-8).map((x) => ({ me: x.me, text: String(x.text).slice(0, 300) }));
    // Progress text while Kim works, so the wait is never a silent spinner.
    const steps = t.progress || [];
    const timers = steps.map((txt, i) => setTimeout(() => setMsgs((m) => m.map((x) => (x.pending ? { ...x, text: txt } : x))), 3500 * (i + 1)));
    let res;
    try { res = await api("/agent", { method: "POST", body: JSON.stringify({ text: q, history, ctx, lang }) }); }
    catch (e) { timers.forEach(clearTimeout); say(e.code === "rate_limited" ? t.rateLimited : t.error); setBusy(false); return; }
    timers.forEach(clearTimeout);
    const a = res.action || { type: "none" };
    const reply = stripMd(res.reply || "");
    try {
      if (a.type === "open" || a.type === "close") {
        if (reply) say(reply);
        await tradeCommand({ intent: a.type, asset: res.asset, when: a.when, fundFrom: a.fundFrom, fundAll: a.fundAll, amountUsdt: a.amountUsdt, keep: a.keep || [] });
      } else if (a.type === "cancel_orders") {
        if (reply) say(reply);
        const n = await cancelPending(a.symbol ? (p) => p.instId.startsWith(a.symbol + "-") : () => true);
        say(n ? t.ordersCanceled(n) : t.noPending);
      } else if (a.type === "close_all") {
        if (reply) say(reply);
        if (!okx) say(t.notConnected);
        else if (!okxTrades.some((x) => x.open && x.demo === okx.demo)) say(t.chatNoOpenTrade("—"));
        else if (okx.demo) { const n = await closeOpen(); say(t.chatClosed(n + " ✓")); }
        else askLive(t.closeAllConfirm, t.closeTrade, async () => { try { const n = await closeOpen(); say(t.chatClosed(n + " ✓")); } catch (e) { okxFail(e); } });
      } else if (a.type === "scan") {
        if (reply) say(reply);
        if (!okx) { say(t.notConnected); }
        else {
          setMsgs((m) => [...m, { id: "p" + Date.now(), me: false, pending: true, text: t.scanning }]);
          const pick = await scanAndPick(null, []);
          if (!pick || !pick.pick) say(t.scanNone(pick && pick.summary));
          else {
            const base = pick.pick.split("-")[0];
            const b = await okx.balances().catch(() => null);
            const usdt = b ? Math.floor(((b.ccy.USDT && b.ccy.USDT.avail) || 0) * (okxCfg.pct || 10)) / 100 : 0;
            const id = "act" + Date.now();
            actions.current[id] = async () => { try { const log = await openPosition(base, base + "-USD", pick, usdt, { source: "scan" }); say(log.error ? (log.error.startsWith("oco") ? t.ocoFailed : t.okxErr(log.error)) : t.done(log.qty, base, fmtPrice(log.fill.avgPx))); } catch (e) { okxFail(e); } };
            say(t.scanFound(base, pick) + "\n\n" + t.planDisclaimer + (okx.demo ? "" : "\n\n" + t.liveWarn), usdt >= 5 ? { action: { id, label: t.buyIt(fmtMoney(usdt)) } } : undefined);
          }
        }
      } else if (a.type === "start_mission") {
        if (reply) say(reply);
        if (!okx) say(t.notConnected);
        else {
          const go = async () => { try { const m = await startMission(a); say(t.missionStarted(m)); } catch (e) { okxFail(e); } };
          if (okx.demo) await go(); else askLive(t.missionStarted({ ...a, capital: a.capitalUsdt || usdtFree || 0 }), t.missionStartBtn, go);
        }
      } else if (a.type === "stop_mission") {
        stopMission(); say((reply ? reply + "\n\n" : "") + t.missionStopped);
      } else {
        say(reply || t.error);
      }
    } catch (e) { okxFail(e); }
    setBusy(false);
  }, [busy, lang, t, okx, okxCfg, okxTrades, okxBal, mission, msgs]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (seed && seed.q) send(seed.q); }, [seed]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setTimeout(() => listRef.current && listRef.current.scrollToEnd({ animated: true }), 50); }, [msgs]);

  return (
    <KeyboardAvoidingView style={st.fill} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <View style={[st.row, rtl && st.rowRev, { justifyContent: "space-between", alignItems: "center", paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line }]}>
        <Pressable onPress={() => setShowHistory(!showHistory)} style={[st.row, rtl && st.rowRev, { gap: 6, alignItems: "center" }]} accessibilityLabel={t.chatHistory}>
          <Ionicons name={showHistory ? "close" : "time-outline"} size={22} color={C.accent} />
          <Text style={st.link}>{t.chatHistory}</Text>
        </Pressable>
        <Pressable onPress={newChat} style={[st.row, rtl && st.rowRev, { gap: 6, alignItems: "center", backgroundColor: C.card2, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 }]} accessibilityLabel={t.newChat}>
          <Ionicons name="create-outline" size={18} color={C.accent} />
          <Text style={st.link}>{t.newChat}</Text>
        </Pressable>
      </View>
      {showHistory ? (
        <ScrollView style={st.fill} contentContainerStyle={{ padding: 14 }}>
          {chats.length ? chats.map((c) => (
            <Pressable key={c.id} onPress={() => openChat(c)} style={[st.card, st.row, rtl && st.rowRev, { alignItems: "center", gap: 10, marginBottom: 8, borderColor: c.id === chatId ? C.accent : C.line }]}>
              <Ionicons name="chatbubble-ellipses-outline" size={20} color={C.sub} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={[st.body, { marginTop: 0, fontWeight: "700" }, rtl && st.rtl]}>{c.title}</Text>
                <Text style={[st.sub, { fontSize: 12 }, rtl && st.rtl]}>{fmtTime(new Date(c.updatedAt).toISOString())} · {c.msgs.length}</Text>
              </View>
              <Pressable onPress={() => deleteChat(c.id)} hitSlop={10} accessibilityLabel={t.deleteChat}><Ionicons name="trash-outline" size={18} color={C.red} /></Pressable>
            </Pressable>
          )) : <Text style={st.empty}>{t.noChats}</Text>}
        </ScrollView>
      ) : (<>
      <FlatList
        ref={listRef}
        data={msgs}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 14 }}
        renderItem={({ item }) => (
          <View style={[st.bubble, item.me ? st.me : st.bot, item.me ? (rtl ? st.left : st.right) : (rtl ? st.right : st.left)]}>
            {item.pending ? <View style={[st.row, { gap: 8 }]}><ActivityIndicator size="small" color={C.accent} /><Text style={st.sub}>{item.text}</Text></View>
              : <Text selectable style={[st.bubbleText, rtl && st.rtl]}>{item.text}</Text>}
            {item.action ? <Pressable style={[st.btnSmall, { backgroundColor: C.green, marginTop: 8, alignSelf: rtl ? "flex-end" : "flex-start" }]} onPress={() => runAction(item)}><Text style={st.btnSmallText}>{item.action.label}</Text></Pressable> : null}
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
      </>)}
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


// ------------------------------------------------------------------ Real OKX wallet (live balance) + AI manager activity
function OkxWallet({ t, rtl, okx, okxBal, refreshBal, okxTrades, okxEvents, mission, stopMission, okxPending, cancelPending }) {
  const [busy, setBusy] = useState(false);
  const coins = okxBal ? Object.entries(okxBal.ccy).filter(([, v]) => v.eq > 0 && (v.usd >= 0.5 || v.eq >= 1)).sort((a, b) => b[1].usd - a[1].usd) : [];
  const open = okxTrades.filter((x) => x.open && x.demo === okx.demo);
  return (
    <View style={{ marginBottom: 18 }}>
      <View style={[st.row, rtl && st.rowRev, { justifyContent: "space-between", alignItems: "center", marginBottom: 6 }]}>
        <Text style={[st.h1, { marginBottom: 0 }]}>{t.okxWallet}</Text>
        <Pressable style={st.chip} onPress={async () => { setBusy(true); await refreshBal(); setBusy(false); }}><Text style={st.chipText}>{busy ? "…" : "↻ " + t.refresh}</Text></Pressable>
      </View>
      <View style={st.card}>
        <Text style={[st.sub, rtl && st.rtl]}>{t.totalEquity} · {okx.demo ? t.demoMode : t.liveMode}</Text>
        <Text style={{ color: C.text, fontSize: 30, fontWeight: "900", textAlign: rtl ? "right" : "left" }}>{okxBal ? "$" + fmtMoney(okxBal.totalUsd) : "…"}</Text>
        {coins.length ? <Text style={[st.label, { marginTop: 10 }, rtl && st.rtl]}>{t.coins}</Text> : null}
        {coins.map(([ccy, v]) => (
          <View key={ccy} style={[st.row, rtl && st.rowRev, { justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.line }]}>
            <Text style={[st.body, { marginTop: 0, fontWeight: "800" }]}>{ccy}</Text>
            <Text style={[st.body, { marginTop: 0 }]}>{fmtQty(v.eq)} · ${fmtMoney(v.usd)}</Text>
          </View>
        ))}
        {open.length ? <Text style={[st.label, { marginTop: 12 }, rtl && st.rtl]}>{t.trades} ({open.length})</Text> : null}
        {open.map((tr) => (
          <Text key={tr.ts} style={[st.sub, { marginTop: 4 }, rtl && st.rtl]}>{tr.instId} · {fmtQty(tr.qty || 0)} @ {tr.fill ? fmtPrice(tr.fill.avgPx) : "—"}{tr.sl ? ` · SL ${tr.sl} · TP ${tr.tp}` : ""}</Text>
        ))}
      </View>
      <Text style={[st.label, { marginTop: 12 }, rtl && st.rtl]}>{t.pendingTitle}</Text>
      <View style={st.card}>
        {(okxPending || []).filter((p) => p.demo === okx.demo).length ? (okxPending || []).filter((p) => p.demo === okx.demo).map((p) => (
          <View key={p.ordId} style={[st.row, rtl && st.rowRev, { alignItems: "center", gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.line }]}>
            <Text style={[st.body, { marginTop: 0, flex: 1, fontSize: 13 }, rtl && st.rtl]}>{t.pendingLine(p, p.lastPx)}</Text>
            <Pressable style={[st.chip, { paddingVertical: 4 }]} onPress={() => cancelPending((x) => x.ordId === p.ordId)}><Text style={[st.chipText, { color: C.red }]}>{t.cancelOrder}</Text></Pressable>
          </View>
        )) : <Text style={[st.sub, rtl && st.rtl]}>{t.noPending}</Text>}
      </View>
      <Text style={[st.label, { marginTop: 12 }, rtl && st.rtl]}>{t.missionTitle}</Text>
      <View style={st.card}>
        {mission && mission.active ? (
          <View>
            <Text style={[st.body, { marginTop: 0, fontWeight: "700" }, rtl && st.rtl]}>{t.missionLine(mission, mission.pnl || 0, Math.max(0, Math.ceil((mission.endsAt - Date.now()) / 86400000)))}</Text>
            <View style={{ height: 8, backgroundColor: C.line, borderRadius: 4, marginTop: 10, overflow: "hidden" }}>
              <View style={{ height: 8, width: `${Math.max(0, Math.min(100, ((mission.pnl || 0) / mission.targetPct) * 100))}%`, backgroundColor: (mission.pnl || 0) >= 0 ? C.green : C.red }} />
            </View>
            <Pressable style={[st.chip, { marginTop: 12, alignSelf: rtl ? "flex-end" : "flex-start" }]} onPress={stopMission}><Text style={[st.chipText, { color: C.red }]}>⏹️ {t.missionStop}</Text></Pressable>
          </View>
        ) : <Text style={[st.sub, rtl && st.rtl]}>{t.missionNone}</Text>}
      </View>
      <Text style={[st.label, { marginTop: 12 }, rtl && st.rtl]}>{t.managerTitle}</Text>
      <View style={st.card}>
        <Text style={[st.sub, { fontSize: 12 }, rtl && st.rtl]}>{t.managerDesc}</Text>
        <Text style={[st.label, { marginTop: 10 }, rtl && st.rtl]}>{t.events}</Text>
        {okxEvents.length ? okxEvents.slice(0, 8).map((e) => (
          <Text key={e.ts} style={[st.body, { marginTop: 4, fontSize: 13 }, rtl && st.rtl]}>{fmtTime(new Date(e.ts).toISOString())} · {e.text}</Text>
        )) : <Text style={[st.sub, rtl && st.rtl]}>{t.noEvents}</Text>}
      </View>
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

function Portfolio({ t, rtl, paper, setPaper, okxProps }) {
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
      {okxProps.okx ? <OkxWallet t={t} rtl={rtl} {...okxProps} /> : null}
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
