# Market Alerts: breaking crypto & stock news → Darija analysis → WhatsApp

Runs every 10 minutes, 24/7, on GitHub Actions (free for public repos). No server and no pip installs.

## How it works
1. **Collects** from CoinDesk, The Block, Cointelegraph, Decrypt, the Federal Reserve, the SEC, MarketWatch, CNBC and Yahoo Finance, plus 3 Google News searches that pull in Reuters/Bloomberg/WSJ headlines. It also reads X (Twitter) accounts if you add an X token (optional, paid).
2. **Filters noise** with rules: drops items older than 3h, already-seen links, price predictions, listicles, personal finance and opinion pieces. General-news feeds also need a market keyword.
3. **Merges duplicates**: the same story from several outlets becomes one alert, and the extra outlets count as corroboration. If a story is a reworded version of something already alerted in the last 36h, it is suppressed.
4. **AI triage** (Claude Haiku 5.5) scores each story 0–10 for market impact. Only stories scoring **8 or higher** become alerts, with at most 3 per run.
5. **AI analysis** (Claude Sonnet 5.5) writes the alert in Darija: what happened, bullish/bearish/neutral, affected assets, why it matters, short-term implications and a confidence level. Each alert also carries the source, the time (Morocco) and a link.
6. **WhatsApp delivery** goes through Green-API (free plan). CallMeBot, Twilio and Telegram are fallbacks. Failed sends are retried on the next run.
7. **Self-monitoring**: a daily "system working" message at 09:00, and a WhatsApp warning if the AI fails 3 runs in a row.

## Setup (≈15 minutes, the steps only you can do)
1. **WhatsApp sender (Green-API, free plan):** sign up at green-api.com → create a *Developer* instance → scan its QR code with WhatsApp (Linked devices).
   - Best option: link a **second** WhatsApp number (for example a cheap SIM or WhatsApp Business on another number) so alerts arrive from a separate contact and your phone actually rings.
   - Linking your main number also works, but messages you send to yourself usually arrive silently, with no notification.
   - From the console, copy **apiUrl**, **idInstance** and **apiTokenInstance**.
2. **Anthropic API key:** at console.anthropic.com → API Keys → create a key. Add about $5 of credit and set a monthly spend limit (for example $10).
3. **GitHub:** sign in. Create a **public** repo named `market-alerts`, then upload all the files from this zip, including the `.github` folder.
4. **Secrets:** in the repo, go to Settings → Secrets and variables → Actions → New repository secret:
   - `ANTHROPIC_API_KEY`
   - `GREENAPI_URL`
   - `GREENAPI_INSTANCE`
   - `GREENAPI_TOKEN`
   - `GREENAPI_CHAT_ID`: the number that should receive alerts, for example `2126XXXXXXXX`
   - optional: `X_BEARER_TOKEN`, `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` (free backup channel), `CONTACT_EMAIL`, and CallMeBot or Twilio keys
5. **Test:** go to Actions → market-alerts → Run workflow → mode `test-send`. You should get a WhatsApp message. Then run it again with `dry-run` to check feeds and AI without sending.
6. That's it: the schedule starts automatically.

## Tuning (config.json)
- `impact_threshold`: 8 by default. Raise it to 9 for fewer alerts, lower it to 7 for more.
- `feeds`, `x.accounts`, `noise_patterns`, `market_keywords`: add or remove sources and filters.
- `x.max_reads_per_day`: a hard cap on X spending (each post read costs $0.005).

## Costs
| Item | Cost |
|---|---|
| GitHub Actions (public repo) | $0 |
| Green-API WhatsApp | $0 (Developer plan, 3 chats) · $12/mo Business if ever needed |
| Claude API (Haiku triage + Sonnet analysis) | ≈ $3–6 / month (estimate) |
| X API (optional) | ≈ $1/day at 200 reads/day cap → ≈ $30/month |

## Local test
`python3 -I tests/test_offline.py` runs the offline end-to-end tests, using fake feeds, a fake AI and a fake WhatsApp.
