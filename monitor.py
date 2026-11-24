#!/usr/bin/env python3
"""
Breaking-news monitor for crypto & stock markets -> AI analysis in Moroccan Darija -> WhatsApp.

Pure Python standard library (no pip install needed). One run = one scan; schedule it
(GitHub Actions every 10 min). State (dedupe memory) lives in state/state.json.

Secrets come from environment variables only:
  GEMINI_API_KEY               AI via Google Gemini (free tier)  -- one of these two is required
  ANTHROPIC_API_KEY            AI via Claude (paid, best Darija)
  GREENAPI_URL, GREENAPI_INSTANCE, GREENAPI_TOKEN, GREENAPI_CHAT_ID   WhatsApp via Green-API (free plan)
  CALLMEBOT_PHONE, CALLMEBOT_APIKEY       WhatsApp via CallMeBot (free, personal; signups often full)
  or TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM, TWILIO_TO   WhatsApp via Twilio (paid)
  TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID    optional backup channel
  X_BEARER_TOKEN               optional, enables X (Twitter) monitoring (pay-per-use)
  CONTACT_EMAIL                optional, sent in User-Agent (SEC asks for one)

CLI:
  python monitor.py              normal scan
  python monitor.py --dry-run    scan + AI, print messages instead of sending
  python monitor.py --test-send  send one test WhatsApp message and exit
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import datetime as dt
import email.utils
import hashlib
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

try:
    from zoneinfo import ZoneInfo
except Exception:  # pragma: no cover
    ZoneInfo = None

ROOT = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(ROOT, "config.json")
STATE_PATH = os.environ.get("STATE_PATH", os.path.join(ROOT, "state", "state.json"))
UTC = dt.timezone.utc


def log(*a):
    print(f"[{dt.datetime.now(UTC):%H:%M:%S}]", *a, flush=True)


def now_utc() -> dt.datetime:
    return dt.datetime.now(UTC)


# ----------------------------------------------------------------------------- HTTP
def http(url, data=None, headers=None, method=None, timeout=20):
    """Returns (status, body_bytes). Never raises on HTTP errors."""
    h = {"User-Agent": f"MarketAlertBot/1.0 ({os.environ.get('CONTACT_EMAIL', 'personal use')})"}
    h.update(headers or {})
    if isinstance(data, (dict, list)):
        data = json.dumps(data).encode()
        h.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read() if hasattr(e, "read") else b""
    except Exception as e:
        return 0, str(e).encode()


# ----------------------------------------------------------------------------- state
def load_state():
    try:
        with open(STATE_PATH, encoding="utf-8") as f:
            s = json.load(f)
    except Exception:
        s = {}
    s.setdefault("seen", {})          # item_key -> iso ts
    s.setdefault("alerts", [])        # recent alerts sent (for event-level dedupe)
    s.setdefault("pending", [])       # analysed alerts that failed to send
    s.setdefault("x", {"since_id": None, "reads_day": "", "reads": 0})
    s.setdefault("stats", {"day": "", "scanned": 0, "candidates": 0, "alerts": 0})
    s.setdefault("health", {"llm_fail_streak": 0, "error_notified": False, "last_heartbeat": ""})
    s.setdefault("feed_fail", {})
    return s


def save_state(s):
    os.makedirs(os.path.dirname(STATE_PATH), exist_ok=True)
    tmp = STATE_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(s, f, ensure_ascii=False, indent=1, sort_keys=True)
    os.replace(tmp, STATE_PATH)


def prune_state(s, cfg):
    cutoff = now_utc() - dt.timedelta(hours=cfg["seen_retention_hours"])
    s["seen"] = {k: v for k, v in s["seen"].items() if parse_iso(v) > cutoff}
    acut = now_utc() - dt.timedelta(hours=max(cfg["dedupe_window_hours"], 48))
    s["alerts"] = [a for a in s["alerts"] if parse_iso(a["ts"]) > acut][-200:]
    pcut = now_utc() - dt.timedelta(hours=6)
    s["pending"] = [p for p in s["pending"] if parse_iso(p["queued"]) > pcut]


def parse_iso(v):
    try:
        d = dt.datetime.fromisoformat(v)
        return d if d.tzinfo else d.replace(tzinfo=UTC)
    except Exception:
        return dt.datetime(1970, 1, 1, tzinfo=UTC)


# ----------------------------------------------------------------------------- text utils
TAG_RE = re.compile(r"<[^>]+>")
WS_RE = re.compile(r"\s+")
STOP = set("the a an of to in on for and or with as at by from is are be after over amid its it this that new says said".split())


def clean(t, n=None):
    t = WS_RE.sub(" ", html.unescape(TAG_RE.sub(" ", t or ""))).strip()
    return t[:n] if n else t


def tokens(title):
    words = re.findall(r"[a-z0-9$%.]+", title.lower())
    return {w.strip(".") for w in words if w not in STOP and len(w) > 1}


def similarity(a, b):
    ta, tb = tokens(a), tokens(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / min(len(ta), len(tb))  # overlap coefficient: robust to rewrites


def norm_url(u):
    try:
        p = urllib.parse.urlsplit(u)
        q = [(k, v) for k, v in urllib.parse.parse_qsl(p.query) if not k.lower().startswith(("utm_", "ref", "mod"))]
        return urllib.parse.urlunsplit((p.scheme, p.netloc.lower(), p.path.rstrip("/"), urllib.parse.urlencode(q), ""))
    except Exception:
        return u


def item_key(it):
    base = norm_url(it["link"]) if it.get("link") else it["title"].lower()
    return hashlib.sha1(base.encode()).hexdigest()[:16]


def parse_date(s):
    if not s:
        return None
    s = s.strip()
    try:
        d = email.utils.parsedate_to_datetime(s)
        return d if d.tzinfo else d.replace(tzinfo=UTC)
    except Exception:
        pass
    try:
        d = dt.datetime.fromisoformat(s.replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=UTC)
    except Exception:
        return None


# ----------------------------------------------------------------------------- sources
def feed_url(feed):
    if feed.get("google_news"):
        q = urllib.parse.quote(feed["query"])
        return f"https://news.google.com/rss/search?q={q}&hl=en-US&gl=US&ceid=US:en"
    return feed["url"]


def parse_feed(xml_bytes, feed):
    """Parse RSS 2.0 or Atom into a list of item dicts."""
    xml_bytes = xml_bytes.lstrip(b"\xef\xbb\xbf").strip()
    root = ET.fromstring(xml_bytes)
    out = []

    def strip_ns(tag):
        return tag.split("}", 1)[-1]

    for el in root.iter():
        tag = strip_ns(el.tag)
        if tag not in ("item", "entry"):
            continue
        f = {}
        for ch in el:
            t = strip_ns(ch.tag)
            if t == "link":
                f.setdefault("link", (ch.text or "").strip() or ch.attrib.get("href", ""))
            elif t == "source":
                f["source_name"] = (ch.text or "").strip()
            elif t in ("title", "description", "summary", "pubDate", "published", "updated", "date", "guid", "id"):
                f.setdefault(t, ch.text or "")
        title = clean(f.get("title", ""))
        if not title:
            continue
        source = feed["name"]
        if feed.get("google_news") and f.get("source_name"):
            source = f["source_name"]
            # Google News titles end with " - Publisher"
            title = re.sub(r"\s+-\s+" + re.escape(f["source_name"]) + r"$", "", title)
        pub = parse_date(f.get("pubDate") or f.get("published") or f.get("updated") or f.get("date"))
        out.append({
            "title": title,
            "link": (f.get("link") or "").strip(),
            "summary": clean(f.get("description") or f.get("summary"), 500),
            "source": source,
            "feed": feed["name"],
            "tier": feed.get("tier", 2),
            "domain": feed.get("domain", "general"),
            "require_keywords": feed.get("require_keywords", False),
            "published": (pub or now_utc()).isoformat(),
            "has_date": pub is not None,
            "kind": "news",
        })
    return out


def fetch_feed(feed):
    st, body = http(feed_url(feed), headers={"Accept": "application/rss+xml, application/xml, text/xml, */*"})
    if st != 200:
        raise RuntimeError(f"HTTP {st}: {body[:120]!r}")
    return parse_feed(body, feed)


def fetch_all_feeds(cfg, state):
    items = []
    with cf.ThreadPoolExecutor(max_workers=8) as ex:
        futs = {ex.submit(fetch_feed, f): f for f in cfg["feeds"]}
        for fut in cf.as_completed(futs):
            f = futs[fut]
            try:
                got = fut.result()
                items += got
                state["feed_fail"].pop(f["name"], None)
            except Exception as e:
                n = state["feed_fail"].get(f["name"], 0) + 1
                state["feed_fail"][f["name"]] = n
                log(f"feed FAIL {f['name']} (x{n}): {e}")
    return items


def fetch_x(cfg, state):
    token = os.environ.get("X_BEARER_TOKEN")
    xc = cfg.get("x", {})
    if not token or not xc.get("enabled_if_token_present", True):
        return []
    xs = state["x"]
    today = now_utc().strftime("%Y-%m-%d")
    if xs.get("reads_day") != today:
        xs["reads_day"], xs["reads"] = today, 0
    budget = xc["max_reads_per_day"] - xs["reads"]
    if budget <= 0:
        log("X daily read budget exhausted; skipping X")
        return []
    q = "(" + " OR ".join(f"from:{a}" for a in xc["accounts"]) + ") -is:retweet -is:reply"
    params = {
        "query": q,
        "max_results": str(max(10, min(xc["max_results_per_call"], budget, 100))),
        "tweet.fields": "created_at,author_id",
        "expansions": "author_id",
        "user.fields": "username",
    }
    if xs.get("since_id"):
        params["since_id"] = xs["since_id"]
    else:
        params["start_time"] = (now_utc() - dt.timedelta(minutes=30)).strftime("%Y-%m-%dT%H:%M:%SZ")
    st, body = http("https://api.x.com/2/tweets/search/recent?" + urllib.parse.urlencode(params),
                    headers={"Authorization": f"Bearer {token}"})
    if st != 200:
        log(f"X FAIL HTTP {st}: {body[:200]!r}")
        return []
    data = json.loads(body or b"{}")
    tweets = data.get("data", [])
    users = {u["id"]: u["username"] for u in data.get("includes", {}).get("users", [])}
    xs["reads"] += len(tweets)
    if data.get("meta", {}).get("newest_id"):
        xs["since_id"] = data["meta"]["newest_id"]
    out = []
    for t in tweets:
        user = users.get(t.get("author_id"), "X")
        out.append({
            "title": clean(t["text"], 280),
            "link": f"https://x.com/{user}/status/{t['id']}",
            "summary": "",
            "source": f"X @{user}",
            "feed": "X",
            "tier": 1 if user.lower() in ("federalreserve", "secgov") else 2,
            "domain": "social",
            "require_keywords": True,
            "published": t.get("created_at", now_utc().isoformat()),
            "has_date": True,
            "kind": "x",
        })
    log(f"X: {len(out)} posts (reads today {xs['reads']}/{xc['max_reads_per_day']})")
    return out


# ----------------------------------------------------------------------------- filtering
def prefilter(items, cfg, state):
    """Fresh, unseen, not noise, relevant. Marks everything it looks at as seen."""
    max_age = dt.timedelta(minutes=cfg["max_item_age_minutes"])
    noise = [re.compile(p, re.I) for p in cfg["noise_patterns"]]
    kw = [k.lower() for k in cfg["market_keywords"]]
    out, now = [], now_utc()
    for it in items:
        k = item_key(it)
        if k in state["seen"]:
            continue
        state["seen"][k] = now.isoformat()
        pub = parse_iso(it["published"])
        if it["has_date"] and (now - pub > max_age or pub - now > dt.timedelta(hours=2)):
            continue
        text = f"{it['title']} {it['summary']}".lower()
        if any(p.search(it["title"]) for p in noise):
            continue
        if it.get("require_keywords") and not any(re.search(r"\b" + re.escape(w) + r"\b", text) for w in kw):
            continue
        it["key"] = k
        out.append(it)
    return out


def cluster(items):
    """Merge the same story reported by several outlets in this batch. Corroboration boosts confidence."""
    items = sorted(items, key=lambda x: (x["tier"], x["published"]))
    clusters = []
    for it in items:
        for c in clusters:
            if similarity(it["title"], c["title"]) >= 0.6:
                c["also"].append({"source": it["source"], "link": it["link"]})
                break
        else:
            it = dict(it)
            it["also"] = []
            clusters.append(it)
    return clusters


def recently_alerted(title, state, cfg):
    cutoff = now_utc() - dt.timedelta(hours=cfg["dedupe_window_hours"])
    for a in state["alerts"]:
        if parse_iso(a["ts"]) > cutoff and similarity(title, a["title"]) >= 0.6:
            return a
    return None


# ----------------------------------------------------------------------------- LLM
class LLMError(Exception):
    pass


def claude(model, system, user, max_tokens=2000):
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        raise LLMError("ANTHROPIC_API_KEY missing")
    body = {"model": model, "max_tokens": max_tokens, "system": system,
            "messages": [{"role": "user", "content": user}]}
    for attempt in range(3):
        st, resp = http("https://api.anthropic.com/v1/messages", data=body, timeout=90,
                        headers={"x-api-key": key, "anthropic-version": "2023-06-01"})
        if st == 200:
            j = json.loads(resp)
            return "".join(b.get("text", "") for b in j.get("content", []) if b.get("type") == "text")
        if st in (429, 500, 502, 503, 529) and attempt < 2:
            time.sleep(4 * (attempt + 1))
            continue
        raise LLMError(f"HTTP {st}: {resp[:300]!r}")


def gemini(model, system, user, max_tokens=2000):
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        raise LLMError("GEMINI_API_KEY missing")
    body = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": user}]}],
        # generous budget: newer Gemini models may spend output tokens on internal thinking
        "generationConfig": {"maxOutputTokens": max(4096, max_tokens * 3), "temperature": 0.2,
                             "responseMimeType": "application/json"},
    }
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    for attempt in range(3):
        st, resp = http(url, data=body, timeout=90, headers={"x-goog-api-key": key})
        if st == 200:
            j = json.loads(resp)
            parts = (j.get("candidates") or [{}])[0].get("content", {}).get("parts", [])
            text = "".join(p.get("text", "") for p in parts if not p.get("thought"))
            if text.strip():
                return text
            raise LLMError("empty Gemini response: " + str(j)[:300])
        if st in (500, 502, 503, 504) and attempt < 2:
            time.sleep(6 * (attempt + 1))
            continue
        raise LLMError(f"Gemini HTTP {st}: {resp[:300]!r}")


def provider(cfg):
    p = cfg.get("provider", "auto")
    if p == "auto":
        return "gemini" if os.environ.get("GEMINI_API_KEY") else "anthropic"
    return p


def llm(cfg, role, system, user, max_tokens):
    """role = 'triage' | 'analysis'. Gemini: falls back to the other free model if one hits its quota."""
    if provider(cfg) == "gemini":
        first = cfg["gemini_triage_model"] if role == "triage" else cfg["gemini_analysis_model"]
        second = cfg["gemini_analysis_model"] if role == "triage" else cfg["gemini_triage_model"]
        chain = list(dict.fromkeys([first, second] + cfg.get("gemini_fallback_models", [])))
        last = None
        for model in chain:
            try:
                return gemini(model, system, user, max_tokens)
            except LLMError as e:
                last = e
                log(f"{model} failed ({str(e)[:90]}), trying next model")
        raise last
    model = cfg["triage_model"] if role == "triage" else cfg["analysis_model"]
    return claude(model, system, user, max_tokens)


def extract_json(text):
    text = text.strip()
    text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.M).strip()
    pairs = sorted((("[", "]"), ("{", "}")), key=lambda p: (text.find(p[0]) == -1, text.find(p[0])))
    for opener, closer in pairs:  # whichever bracket comes first is the outer structure
        i, j = text.find(opener), text.rfind(closer)
        if i != -1 and j > i:
            try:
                return json.loads(text[i:j + 1])
            except Exception:
                continue
    raise LLMError("no JSON in model output: " + text[:200])


TRIAGE_SYSTEM = """You are a senior markets news editor on a trading desk. You decide which headlines deserve an URGENT phone alert to a crypto + stock trader.
Score each headline's likely market impact 0-10:
 9-10: market-wide shock or major scheduled event outcome (Fed/FOMC decision or surprise Powell remarks, CPI/NFP surprise, major exchange or protocol hack/insolvency (>$50M), spot crypto ETF approval/denial/major flows record, major regulation/law/ban/lawsuit vs top crypto firms, circuit breakers, index -3%/+3%, BTC/ETH +-7% move, mega-cap earnings shock/guidance cut, war/sanctions/tariffs moving markets, major bank failure).
 7-8: significant for a major asset or sector (top-20 coin specific big news, large company earnings beat/miss with big move, important SEC/CFTC action, large liquidations, big stablecoin depeg risk).
 0-6: routine, opinion, analysis, previews, price commentary, small caps/small coins, marketing, personal finance, old news.
Be strict: most headlines are <=6. Rumors from unverified accounts get at most 6 unless they are very specific and from a reliable wire-style source.
Mark duplicate=true if the event is the same as one of the RECENT ALERTS (same underlying event, even if new wording), unless it is a materially new development (e.g. the actual decision after a preview, a big new number).
Return ONLY a JSON array: [{"i": <index>, "impact": <0-10>, "category": "<fed|macro|regulation|etf|hack|earnings|stocks|crypto|geopolitics|other>", "duplicate": <true|false>, "reason": "<6-12 words English>"}] covering every index."""

ANALYSIS_SYSTEM = """You are a professional markets analyst writing urgent alerts for a Moroccan trader who trades crypto and US stocks.
Write all explanatory text in Moroccan Darija ({script}). Keep tickers, asset names and technical terms (ETF, CPI, FOMC, Bitcoin, Nasdaq, support...) in Latin letters. Be concise, concrete and honest about uncertainty. No financial advice phrasing like "buy now"; describe likely reactions and risks.
Use only the facts in the provided news; do not invent numbers. If the headline is thin, say what is still unknown.
Return ONLY this JSON object:
{{
 "headline": "<one-line Darija title>",
 "what_happened": "<1-2 sentences Darija>",
 "sentiment": "<bullish|bearish|neutral|mixed>",
 "sentiment_darija": "<e.g. إيجابي (Bullish) / سلبي (Bearish) / محايد (Neutral)>",
 "affected": ["<asset/ticker/sector with direction arrow e.g. BTC ⬇️, COIN ⬇️, Tech stocks ⬆️>"],
 "why_it_matters": "<2-3 sentences Darija>",
 "short_term": "<1-3 sentences Darija on possible next hours/days reaction and what to watch>",
 "confidence": "<high|medium|low>",
 "confidence_reason": "<short Darija: why (source reliability, confirmed by N outlets, official statement, rumor...)>",
 "urgency": "<🔴|🟠>"
}}"""


def triage(cands, state, cfg):
    recent = [a["title"] for a in state["alerts"][-25:]]
    lines = []
    for i, c in enumerate(cands):
        extra = f" (also reported by {len(c['also'])} other outlets)" if c["also"] else ""
        lines.append(f"[{i}] ({c['source']}, {c['published'][:16]}Z){extra} {c['title']} | {c['summary'][:220]}")
    user = "RECENT ALERTS ALREADY SENT:\n" + ("\n".join(f"- {t}" for t in recent) or "(none)") + \
           "\n\nNEW HEADLINES:\n" + "\n".join(lines)
    res = extract_json(llm(cfg, "triage", TRIAGE_SYSTEM, user, max_tokens=150 + 70 * len(cands)))
    return {int(r["i"]): r for r in res if isinstance(r, dict) and "i" in r}


def analyse(c, tri, cfg):
    script = "Arabic script" if cfg.get("darija_script", "arabic") == "arabic" else "Latin letters (Arabizi)"
    corrob = ", ".join(a["source"] for a in c["also"]) or "none"
    user = (f"Source: {c['source']}\nPublished (UTC): {c['published']}\nHeadline: {c['title']}\n"
            f"Summary: {c['summary'] or '(none)'}\nAlso reported by: {corrob}\n"
            f"Editor category: {tri.get('category')} | impact {tri.get('impact')}/10 | {tri.get('reason')}")
    return extract_json(llm(cfg, "analysis", ANALYSIS_SYSTEM.format(script=script), user, max_tokens=900))


# ----------------------------------------------------------------------------- formatting
SENT_EMOJI = {"bullish": "🟢", "bearish": "🔴", "neutral": "⚪", "mixed": "🟡"}
CONF_DARIJA = {"high": "عالية", "medium": "متوسطة", "low": "ضعيفة"}


def local_time(iso, cfg):
    d = parse_iso(iso)
    if ZoneInfo:
        try:
            d = d.astimezone(ZoneInfo(cfg.get("timezone", "Africa/Casablanca")))
            return d.strftime("%Y-%m-%d %H:%M") + " (Maroc)"
        except Exception:
            pass
    return d.strftime("%Y-%m-%d %H:%M UTC")


def format_alert(c, tri, a, cfg):
    s = a.get("sentiment", "neutral").lower()
    conf = a.get("confidence", "medium").lower()
    affected = " · ".join(a.get("affected", [])[:8]) or "—"
    also = ""
    if c["also"]:
        also = f"\n✅ متأكدة من {len(c['also']) + 1} مصادر"
    msg = (
        f"{a.get('urgency', '🔴')} *{a.get('headline', c['title'])}*\n"
        f"_{c['title']}_\n\n"
        f"📰 *شنو وقع:* {a.get('what_happened', '')}\n\n"
        f"{SENT_EMOJI.get(s, '⚪')} *الاتجاه:* {a.get('sentiment_darija', s)}\n"
        f"🎯 *شنو غادي يتأثر:* {affected}\n\n"
        f"💡 *علاش مهمة:* {a.get('why_it_matters', '')}\n\n"
        f"⏱️ *على المدى القصير:* {a.get('short_term', '')}\n\n"
        f"📊 *الثقة:* {CONF_DARIJA.get(conf, conf)} ({conf}) — {a.get('confidence_reason', '')}"
        f"{also}\n"
        f"⚡ Impact: {tri.get('impact')}/10 · {tri.get('category', '')}\n"
        f"🏷️ المصدر: {c['source']}\n"
        f"🕒 {local_time(c['published'], cfg)}\n"
        f"🔗 {c['link']}"
    )
    return msg[:3800]


def format_fallback(c, tri, cfg):
    """Used if the analysis model fails but triage said it's big: still alert, in short form."""
    return (f"🔴 *خبر مهم (بلا تحليل كامل دابا)*\n_{c['title']}_\n"
            f"⚡ Impact: {tri.get('impact')}/10 · {tri.get('category', '')}\n"
            f"🏷️ {c['source']} · 🕒 {local_time(c['published'], cfg)}\n🔗 {c['link']}")


# ----------------------------------------------------------------------------- delivery
def send_whatsapp(text):
    """Returns (ok, channel_detail). Tries CallMeBot, then Twilio, then Telegram backup."""
    results = []
    g_url, g_id, g_tok, g_chat = (os.environ.get(k) for k in
                                  ("GREENAPI_URL", "GREENAPI_INSTANCE", "GREENAPI_TOKEN", "GREENAPI_CHAT_ID"))
    if g_id and g_tok and g_chat:
        base = (g_url or "https://api.green-api.com").rstrip("/")
        chat = g_chat if "@" in g_chat else re.sub(r"\D", "", g_chat) + "@c.us"
        st, body = http(f"{base}/waInstance{g_id}/sendMessage/{g_tok}", data={"chatId": chat, "message": text})
        ok = st == 200 and b"idMessage" in body
        results.append(("green-api", ok, st))
        if ok:
            return True, "green-api"
    phone, key = os.environ.get("CALLMEBOT_PHONE"), os.environ.get("CALLMEBOT_APIKEY")
    if phone and key:
        url = "https://api.callmebot.com/whatsapp.php?" + urllib.parse.urlencode(
            {"phone": phone, "text": text, "apikey": key})
        st, body = http(url, timeout=30)
        b = body.decode("utf-8", "ignore").lower()
        ok = st == 200 and not any(x in b for x in ("apikey is invalid", "invalid apikey", "error:", "not allowed"))
        results.append(("callmebot", ok, st))
        if ok:
            return True, "callmebot"
    sid, tok = os.environ.get("TWILIO_SID"), os.environ.get("TWILIO_TOKEN")
    if sid and tok and os.environ.get("TWILIO_FROM") and os.environ.get("TWILIO_TO"):
        import base64
        auth = base64.b64encode(f"{sid}:{tok}".encode()).decode()
        data = urllib.parse.urlencode({"From": "whatsapp:" + os.environ["TWILIO_FROM"],
                                       "To": "whatsapp:" + os.environ["TWILIO_TO"],
                                       "Body": text[:1590]}).encode()
        st, body = http(f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json", data=data,
                        headers={"Authorization": "Basic " + auth,
                                 "Content-Type": "application/x-www-form-urlencoded"})
        results.append(("twilio", st in (200, 201), st))
        if st in (200, 201):
            return True, "twilio"
    tg, chat = os.environ.get("TELEGRAM_BOT_TOKEN"), os.environ.get("TELEGRAM_CHAT_ID")
    if tg and chat:
        st, body = http(f"https://api.telegram.org/bot{tg}/sendMessage",
                        data={"chat_id": chat, "text": text, "disable_web_page_preview": True})
        results.append(("telegram", st == 200, st))
        if st == 200:
            return True, "telegram"
    log("delivery failed:", results or "no delivery channel configured")
    return False, str(results)


# ----------------------------------------------------------------------------- main loop
def run(cfg, state, dry=False, sender=send_whatsapp):
    today = now_utc().strftime("%Y-%m-%d")
    if state["stats"].get("day") != today:
        state["stats"] = {"day": today, "scanned": 0, "candidates": 0, "alerts": 0}

    def deliver(msg):
        if dry:
            print("\n" + "=" * 60 + "\n" + msg + "\n" + "=" * 60)
            return True
        ok, _ = sender(msg)
        if ok:
            time.sleep(float(os.environ.get("SEND_GAP_SECONDS", "3")))  # CallMeBot dislikes bursts
        return ok

    # 1) retry undelivered alerts first
    still = []
    for p in state["pending"]:
        if deliver(p["msg"]):
            state["stats"]["alerts"] += 1  # already recorded in state["alerts"] when queued
        else:
            still.append(p)
    state["pending"] = still

    # 2) collect
    items = fetch_all_feeds(cfg, state) + fetch_x(cfg, state)
    state["stats"]["scanned"] += len(items)
    fresh = prefilter(items, cfg, state)
    cands = [c for c in cluster(fresh) if not recently_alerted(c["title"], state, cfg)]
    cap = cfg.get("max_candidates_per_run", 60)
    if len(cands) > cap:  # e.g. first run backlog: keep the newest, skip the old tail
        cands = sorted(cands, key=lambda c: (c["published"], -c["tier"]), reverse=True)[:cap]
    state["stats"]["candidates"] += len(cands)
    log(f"fetched {len(items)}, fresh {len(fresh)}, candidates {len(cands)}")
    if not cands:
        return []

    # 3) AI triage
    try:
        tri = {}
        for i in range(0, len(cands), 40):  # chunk
            part = triage(cands[i:i + 40], state, cfg)
            tri.update({k + i: v for k, v in part.items()})
        state["health"]["llm_fail_streak"] = 0
        state["health"]["error_notified"] = False
    except LLMError as e:
        log("triage failed:", e)
        h = state["health"]
        h["llm_fail_streak"] += 1
        for c in cands:  # let them be reconsidered next run
            state["seen"].pop(c["key"], None)
        if h["llm_fail_streak"] >= 3 and not h["error_notified"] and not dry:
            if sender(f"⚠️ Market Alerts: الذكاء الاصطناعي ما خدامش ({h['llm_fail_streak']} مرات). "
                      f"شوف GEMINI_API_KEY / ANTHROPIC_API_KEY. Error: {str(e)[:150]}")[0]:
                h["error_notified"] = True
        return []

    picks = []
    for i, c in enumerate(cands):
        t = tri.get(i)
        if t and not t.get("duplicate") and float(t.get("impact", 0)) >= cfg["impact_threshold"]:
            picks.append((float(t["impact"]), -c["tier"], i, c, t))
    picks.sort(reverse=True)
    picks = picks[: cfg["max_alerts_per_run"]]

    sent = []
    for _, _, _, c, t in picks:
        if recently_alerted(c["title"], state, cfg):  # two picks of same event
            continue
        try:
            msg = format_alert(c, t, analyse(c, t, cfg), cfg)
        except LLMError as e:
            log("analysis failed, sending short alert:", e)
            msg = format_fallback(c, t, cfg)
        entry = {"title": c["title"], "ts": now_utc().isoformat(), "link": c["link"]}
        if deliver(msg):
            state["alerts"].append(entry)
            state["stats"]["alerts"] += 1
            sent.append(msg)
        else:
            state["pending"].append({**entry, "msg": msg, "queued": now_utc().isoformat()})
            state["alerts"].append(entry)  # block duplicates while pending
    log(f"alerts sent this run: {len(sent)}")
    return sent


def maybe_heartbeat(cfg, state, dry=False, sender=send_whatsapp):
    """Once a day: short 'system alive' message so silence never means 'broken'."""
    if os.environ.get("DISABLE_HEARTBEAT") == "1":
        return
    tz = ZoneInfo(cfg["timezone"]) if ZoneInfo else UTC
    loc = now_utc().astimezone(tz)
    day = loc.strftime("%Y-%m-%d")
    if loc.hour < cfg["heartbeat_hour_local"] or state["health"].get("last_heartbeat") == day:
        return
    st = state["stats"]
    bad = [k for k, v in state["feed_fail"].items() if v >= 6]
    msg = (f"✅ Market Alerts خدام مزيان.\nاليوم: تشافو {st.get('scanned', 0)} خبر، "
           f"{st.get('candidates', 0)} مرشحين، {st.get('alerts', 0)} تنبيهات."
           + (f"\n⚠️ مصادر واقفة: {', '.join(bad)}" if bad else ""))
    if dry:
        print(msg)
        ok = True
    else:
        ok = sender(msg)[0]
    if ok:
        state["health"]["last_heartbeat"] = day


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--test-send", action="store_true")
    args = ap.parse_args()
    with open(CONFIG_PATH, encoding="utf-8") as f:
        cfg = json.load(f)

    if args.test_send:
        ok, ch = send_whatsapp("✅ Market Alerts: تجربة. إلى وصلاتك هاد الرسالة، WhatsApp خدام مزيان. 🚀")
        log("test send:", "OK via " + ch if ok else "FAILED " + ch)
        sys.exit(0 if ok else 1)

    state = load_state()
    try:
        run(cfg, state, dry=args.dry_run)
        maybe_heartbeat(cfg, state, dry=args.dry_run)
    finally:
        prune_state(state, cfg)
        save_state(state)


if __name__ == "__main__":
    main()
