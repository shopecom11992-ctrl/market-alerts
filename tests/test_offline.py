"""Offline end-to-end tests: fake feeds, fake AI, fake WhatsApp. Run: python -I tests/test_offline.py"""
import datetime as dt
import json
import os
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
os.environ["STATE_PATH"] = os.path.join(tempfile.mkdtemp(), "state.json")
os.environ["SEND_GAP_SECONDS"] = "0"
import monitor as m  # noqa: E402

CFG = json.load(open(os.path.join(ROOT, "config.json")))
NOW = dt.datetime.now(dt.timezone.utc)


def rfc(minutes_ago):
    import email.utils
    return email.utils.format_datetime(NOW - dt.timedelta(minutes=minutes_ago))


def rss(items):
    body = "".join(
        f"<item><title>{t}</title><link>{l}</link><description>{d}</description><pubDate>{p}</pubDate>"
        + (f"<source url='x'>{src}</source>" if src else "") + "</item>"
        for t, l, d, p, src in items)
    return f"﻿<?xml version='1.0'?><rss version='2.0'><channel><title>x</title>{body}</channel></rss>".encode()


FEEDS = {}


def fake_http(url, data=None, headers=None, method=None, timeout=20):
    for k, v in FEEDS.items():
        if k in url:
            return 200, v
    return 404, b"not found"


def set_feeds(extra_coindesk=None):
    FEEDS.clear()
    FEEDS["coindesk.com"] = rss([
        ("Fed cuts interest rates by 50 basis points in surprise move", "https://www.coindesk.com/a/fed-cut?utm_source=x", "The FOMC cut rates by 50bp.", rfc(5), None),
        ("Bitcoin price prediction: could BTC reach $200K?", "https://www.coindesk.com/a/pred", "", rfc(10), None),
        ("Old story about ether staking", "https://www.coindesk.com/a/old", "", rfc(600), None),
    ] + (extra_coindesk or []))
    FEEDS["theblock.co"] = rss([
        ("Hackers drain $310 million from major exchange hot wallet", "https://www.theblock.co/post/hack", "Exchange paused withdrawals.", rfc(3), None),
        ("Fed cuts rates 50 basis points in surprise move, Powell says", "https://www.theblock.co/post/fed", "", rfc(4), None),
    ])
    FEEDS["dowjones.io"] = rss([
        ("A 66-year-old nurse faces retirement with $500 saved", "https://mw.com/nurse", "", rfc(5), None),
        ("Small bakery chain opens new store", "https://mw.com/bakery", "", rfc(5), None),
    ])
    FEEDS["news.google.com"] = rss([
        ("Nvidia shares plunge 9% after guidance cut - Reuters", "https://news.google.com/rss/articles/abc", "", rfc(8), "Reuters"),
    ])


TRIAGE_CALLS = []
FAIL = {"triage": False, "analysis": False}


def fake_claude(model, system, user, max_tokens=2000):
    if system is m.TRIAGE_SYSTEM:
        TRIAGE_CALLS.append(user)
        if FAIL["triage"]:
            raise m.LLMError("simulated outage")
        out = []
        for line in user.split("NEW HEADLINES:\n")[1].splitlines():
            i = int(line[1:line.index("]")])
            low = line.lower()
            impact = 9 if ("fed cuts" in low or "hack" in low) else 8 if "nvidia" in low else 3
            out.append({"i": i, "impact": impact, "category": "fed" if "fed" in low else "other",
                        "duplicate": False, "reason": "test"})
        return "```json\n" + json.dumps(out) + "\n```"
    if FAIL["analysis"]:
        raise m.LLMError("simulated analysis outage")
    return json.dumps({
        "headline": "الفيد نقص الفائدة ب 50 نقطة بشكل مفاجئ", "what_happened": "الاحتياطي الفيدرالي نقص الفائدة.",
        "sentiment": "bullish", "sentiment_darija": "إيجابي (Bullish)", "affected": ["BTC ⬆️", "Nasdaq ⬆️", "DXY ⬇️"],
        "why_it_matters": "فلوس رخيصة كتعني سيولة كثر فالسوق.", "short_term": "ممكن طلعة سريعة ومن بعد تقلبات.",
        "confidence": "high", "confidence_reason": "بيان رسمي ومتأكد من جوج مصادر", "urgency": "🔴"})


SENT = []
SEND_OK = {"v": True}


def fake_sender(msg):
    if SEND_OK["v"]:
        SENT.append(msg)
        return True, "fake"
    return False, "fake-fail"


m.http = fake_http
m.claude = fake_claude
os.environ["ANTHROPIC_API_KEY"] = "test"
os.environ.pop("X_BEARER_TOKEN", None)


def check(cond, label):
    print(("PASS " if cond else "FAIL ") + label)
    if not cond:
        raise SystemExit(1)


# --- 1. first scan: filtering, clustering, alerting
set_feeds()
st = m.load_state()
sent = m.run(CFG, st, sender=fake_sender)
check(len(sent) == 3, f"run1 sends 3 alerts (fed, hack, nvidia) -> got {len(sent)}")
joined = "\n".join(sent)
check("prediction" not in joined.lower(), "noise 'price prediction' filtered")
check("Old story" not in TRIAGE_CALLS[0], "stale (10h old) item dropped before AI")
check("nurse" not in TRIAGE_CALLS[0] and "bakery" not in TRIAGE_CALLS[0], "irrelevant MarketWatch items dropped")
check(TRIAGE_CALLS[0].count("Fed cuts") == 1 and "also reported by 1" in TRIAGE_CALLS[0], "same Fed story from 2 outlets merged")
check(sum("Fed cuts" in s for s in sent) == 1, "Fed story alerted only once")
check("Reuters" in joined and " - Reuters" not in joined, "Google News publisher extracted as source")
check("utm_source" in joined or "coindesk.com/a/fed-cut" in joined, "original link included")
check("(Maroc)" in joined, "timestamp in Morocco time")

# --- 2. same feeds again: nothing new
SENT.clear(); TRIAGE_CALLS.clear()
sent = m.run(CFG, st, sender=fake_sender)
check(sent == [] and TRIAGE_CALLS == [], "run2: identical feeds -> no AI call, no alert")

# --- 3. rewritten version of the same Fed event from a new URL -> event-level dedupe
set_feeds([("Fed cuts interest rates by 50 basis points, a surprise move", "https://www.coindesk.com/a/fed-cut-v2", "", rfc(1), None)])
sent = m.run(CFG, st, sender=fake_sender)
check(sent == [], "run3: reworded duplicate of earlier Fed alert suppressed")

# --- 4. state survives save/load
m.save_state(st); st = m.load_state()
check(len(st["alerts"]) == 3 and len(st["seen"]) >= 8, "state persisted (alerts + seen)")

# --- 5. delivery failure -> queued -> retried next run
set_feeds([("SEC approves spot Solana ETF, hackers also hit DeFi protocol", "https://www.coindesk.com/a/sol-etf", "", rfc(1), None)])
SEND_OK["v"] = False
sent = m.run(CFG, st, sender=fake_sender)
check(sent == [] and len(st["pending"]) == 1, "WhatsApp down -> alert queued as pending")
SEND_OK["v"] = True; SENT.clear()
m.run(CFG, st, sender=fake_sender)
check(len(SENT) == 1 and st["pending"] == [], "pending alert delivered on next run, exactly once")

# --- 6. AI outage -> items not lost, retried later; error notice after 3 failures
set_feeds([("Hack: $90 million exploit hits lending protocol", "https://www.coindesk.com/a/hack2", "", rfc(1), None)])
FAIL["triage"] = True; SENT.clear()
for _ in range(3):
    m.run(CFG, st, sender=fake_sender)
check(len(SENT) == 1 and "ANTHROPIC_API_KEY" in SENT[0], "3 AI failures -> one warning message to WhatsApp")
FAIL["triage"] = False; SENT.clear()
m.run(CFG, st, sender=fake_sender)
check(len(SENT) == 1 and "90 million" in SENT[0], "after AI recovers, the held-back hack news is alerted")

# --- 7. analysis outage -> short fallback alert still sent
set_feeds([("Fed cuts?? no: Hack drains $500 million from bridge", "https://www.coindesk.com/a/bridge", "", rfc(1), None)])
FAIL["analysis"] = True; SENT.clear()
m.run(CFG, st, sender=fake_sender)
check(len(SENT) == 1 and "بلا تحليل" in SENT[0], "analysis failure -> short fallback alert")
FAIL["analysis"] = False

# --- 8. Atom parsing
atom = b"""<?xml version='1.0'?><feed xmlns='http://www.w3.org/2005/Atom'><entry><title>Atom test</title>
<link href='https://ex.com/a'/><updated>2026-11-24T10:00:00Z</updated><summary>s</summary></entry></feed>"""
it = m.parse_feed(atom, {"name": "A"})[0]
check(it["link"] == "https://ex.com/a" and it["has_date"], "Atom feeds parsed")

# --- 9. heartbeat once per day
SENT.clear()
CFG2 = dict(CFG, heartbeat_hour_local=0)
m.maybe_heartbeat(CFG2, st, sender=fake_sender); m.maybe_heartbeat(CFG2, st, sender=fake_sender)
check(len(SENT) == 1 and "خدام" in SENT[0], "daily heartbeat sent once")

print("\nALL TESTS PASSED\n\nSample alert as it will appear on WhatsApp:\n")
set_feeds(); st2 = {}
m.STATE_PATH = os.path.join(tempfile.mkdtemp(), "s.json")
st2 = m.load_state(); SENT.clear()
m.run(CFG, st2, sender=fake_sender)
print(SENT[0])
