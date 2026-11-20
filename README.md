# AurumCast — daily India gold rates & predictions

Every morning at about **07:47 IST**, before MCX opens, a GitHub Action fetches live gold and rupee data and works out today's Indian gold rates by purity. It forecasts the next MCX open and close with likely ranges, runs a validation gate of about 30 checks, and **publishes only if every check passes**.

<!-- RATES:START -->
**Latest: 2026-11-20 07:26 IST** · spot $3576.90/oz · USD/INR 93.27 · duty 15% · [full report](reports/2026-11-20.md)

| Grade | Today ₹/g | ₹/10 g | + 3% GST ₹/g | MCX open 11-20 09:00 IST · ₹/g (68%) | Session close 11-20 23:55 IST · ₹/g (68%) |
|---|---:|---:|---:|---:|---:|
| 24K · 99.99% (999.9) | **₹12,333.72** | ₹1,23,337 | ₹12,703.74 | ₹12,333 (₹12,274–₹12,392) | ₹12,328 (₹12,148–₹12,511) |
| 24K · 99.9% (999) | **₹12,322.62** | ₹1,23,226 | ₹12,692.30 | ₹12,322 (₹12,263–₹12,381) | ₹12,317 (₹12,137–₹12,500) |
| MCX Gold · 99.5% (995) | **₹12,273.28** | ₹1,22,733 | — | ₹12,273 (₹12,214–₹12,332) | ₹12,268 (₹12,088–₹12,450) |
| 22K · 91.6% (916) | **₹11,298.82** | ₹1,12,988 | ₹11,637.79 | ₹11,298 (₹11,244–₹11,353) | ₹11,294 (₹11,128–₹11,461) |
| International fine (COMEX, no Indian duty) | **₹10,726.05** | ₹1,07,261 | — | ₹10,726 (₹10,674–₹10,777) | ₹10,721 (₹10,564–₹10,880) |
<!-- RATES:END -->

## What gets published

| File | Contents |
|---|---|
| `reports/YYYY-MM-DD.md` | Daily report: rates, predictions, backtest status, live track record, full validation checklist |
| `docs/latest.json` | Machine-readable latest rates, predictions, model stats and every validation result |
| `docs/history.csv` | One row per day: rates and the predictions made that morning |
| `docs/predictions.json` | Ledger of every prediction, scored automatically once its target time has passed |
| `docs/index.html` | Live interactive dashboard (GitHub Pages), with hour-by-hour monitor, charts, backtest proof |

## Grades

| Grade | Formula (₹ per gram) |
|---|---|
| 24K 99.99% (999.9) | spot × USD/INR ÷ 31.1035 × (1 + duty) × 0.9999 |
| 24K 99.9% (999) | … × 0.999 |
| MCX Gold (995), quoted per 10 g | … × 0.995 |
| 22K (916) | … × 0.916 |
| International fine (COMEX), no Indian duty | spot × USD/INR ÷ 31.1035 |

Import duty is set in `config.json` (15% since 13 May 2026: 10% BCD + 5% AIDC). The "+3% GST" column is GST on the metal only; jewellers add making charges on top. MCX quotes include import duty but not GST.

## How it stays honest

1. **Unit tests** (`node --test`) check every engine function before each run. They cover the indicators, the ridge solver, the purity maths, US daylight-saving, COMEX/MCX trading clocks, horizon scaling, and a **no-look-ahead test** that changes future prices and asserts that no past prediction moves.
2. **Validation gate** (`scripts/daily.mjs`) checks:
   - every source answered and is fresh;
   - XAU spot agrees with PAXG within 2%, and the ECB USD/INR rate agrees with a live rate within 1%;
   - every grade, recomputed from scratch, matches;
   - prediction ranges are ordered and every number is finite;
   - volatility and backtest coverage are within sane limits;
   - today's price hasn't jumped more than 10% from the last published day.
   
   Any failure → the job fails, **nothing is committed**, and GitHub emails you.
3. **Walk-forward backtest** (about 990 sessions) is restated in every report. The point forecast is not significantly better than "no change"; the ranges are what's reliable.
4. **Live track record**: each morning's predictions are scored against the actual price once the target time passes.

## Data sources (all free, no API keys)

- Gold: Binance PAXG/USDT market data (`data-api.binance.vision`). Each PAXG token is backed by one fine troy ounce of LBMA gold. COMEX and MCX have no free public feed, so the price is scaled to live XAU spot from `gold-api.com`.
- USD/INR: ECB reference rates via `frankfurter.dev`, cross-checked against `open.er-api.com`.

## Run locally

```bash
node --test                        # unit tests
node scripts/daily.mjs --dry-run   # fetch + validate + preview report, writes nothing
node scripts/daily.mjs             # fetch + validate + publish
node scripts/build-dashboard.mjs   # rebuild docs/index.html
```

Not investment advice. MCX futures are leveraged. Exchange holidays are not modelled.
