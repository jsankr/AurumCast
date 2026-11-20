// AurumCast daily job: fetch real market data → compute rates & predictions → validate → publish.
// Publishes ONLY if every validation check passes. Any failure exits non-zero and writes nothing.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const GE = require('../src/engine.cjs');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const P = (...p) => join(ROOT, ...p);
const CFG = JSON.parse(readFileSync(P('config.json'), 'utf8'));
const DRY = process.argv.includes('--dry-run');
const NOW = Date.now();

const SRC = {
  bin: 'https://data-api.binance.vision/api/v3/klines?symbol=PAXGUSDT',
  spot: 'https://api.gold-api.com/price/XAU',
  fx2: 'https://api.frankfurter.dev/v2/rates?base=USD&quotes=INR&from=2019-09-01',
  fx1: 'https://api.frankfurter.dev/v1/2019-09-01..?base=USD&symbols=INR',
  er: 'https://open.er-api.com/v6/latest/USD',
};

// ---------- fetch with retries ----------
async function getJSON(url, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const c = new AbortController(), t = setTimeout(() => c.abort(), 25000);
      const r = await fetch(url, { signal: c.signal, headers: { 'user-agent': 'AurumCast/1.0 (+github actions)' } });
      clearTimeout(t);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) { last = e; await new Promise(r => setTimeout(r, 1500 * (i + 1))); }
  }
  throw new Error(`${url.split('?')[0]} → ${last.message}`);
}
async function klinesBack(interval, total, extra = '') {
  let out = [], end = null;
  while (out.length < total) {
    const lim = Math.min(1000, total - out.length);
    const k = await getJSON(`${SRC.bin}&interval=${interval}&limit=${lim}${extra}${end ? '&endTime=' + end : ''}`);
    if (!k.length) break; out = k.concat(out); end = k[0][0] - 1; if (k.length < lim) break;
  }
  return out;
}

// ---------- formatting ----------
const IST = ms => new Date(ms + GE.IST_MS).toISOString().replace('T', ' ').slice(0, 16);
const inr = (v, d = 2) => '₹' + Number(v).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = v => (v > 0 ? '+' : '') + (v * 100).toFixed(2) + '%';
const r2 = v => Math.round(v * 100) / 100;

const GRADES = [
  ['k24_9999', '24K · 99.99% (999.9)', true],
  ['k24_999', '24K · 99.9% (999)', true],
  ['mcx995', 'MCX Gold · 99.5% (995)', false],
  ['k22_916', '22K · 91.6% (916)', true],
  ['fineIntl', 'International fine (COMEX, no Indian duty)', false],
];
const PUR = { k24_9999: GE.PURITY.k24_9999, k24_999: GE.PURITY.k24_999, mcx995: GE.PURITY.mcx995, k22_916: GE.PURITY.k22_916 };

async function main() {
  // ---------- 1. load ----------
  const [h, d, m30, fx, spot, er] = await Promise.allSettled([
    klinesBack('1h', 1000), klinesBack('1d', 3000, '&timeZone=5:30'), klinesBack('30m', 4000),
    getJSON(SRC.fx2).catch(() => getJSON(SRC.fx1)), getJSON(SRC.spot), getJSON(SRC.er),
  ]);
  const checks = [];
  const check = (name, pass, detail, severity = 'error') => { checks.push({ name, pass: !!pass, detail, severity }); return !!pass; };
  for (const [nm, x] of [['Binance hourly', h], ['Binance daily', d], ['Frankfurter USD/INR', fx], ['gold-api spot', spot]]) check(`Fetch: ${nm}`, x.status === 'fulfilled', x.status === 'fulfilled' ? 'ok' : x.reason.message);
  check('Fetch: Binance 30-min', m30.status === 'fulfilled', m30.status === 'fulfilled' ? 'ok' : m30.reason.message, 'warn');
  check('Fetch: ExchangeRate-API (FX cross-check)', er.status === 'fulfilled', er.status === 'fulfilled' ? 'ok' : er.reason.message, 'warn');
  if (checks.some(c => !c.pass && c.severity === 'error')) return finish(checks, null);

  // ---------- 2. compute ----------
  const H = GE.parseKlines(h.value), hDone = H.filter(b => b.closeT < NOW);
  const B = GE.parseKlines(d.value), FX = GE.parseFx(fx.value);
  const spotUsd = +spot.value.price, spotT = Date.parse(spot.value.updatedAt);
  const paxg = H.at(-1).c, basis = spotUsd / paxg;
  const [fxDate, usdInr] = FX.at(-1);
  const daily = GE.buildDaily(B, FX, NOW), n = daily.length, lastC = daily.findLastIndex(x => !x.partial);
  const px = daily.map(x => x.inr), fxr = daily.map((x, i) => (i ? Math.log(x.fx / daily[i - 1].fx) : 0));
  const wf = GE.walkForward(px, fxr, { lastCompleted: lastC }), sc = GE.scoreModels(wf.rows, wf.ids);
  const L = wf.rows.at(-1), fc = { r: L.pred.ens, sigma: L.sigma, mu: L.pred.drift };
  const duty = CFG.importDutyPct, prem = CFG.mcxCalibrationPct / 100;
  const R = GE.rates(spotUsd, usdInr, duty, prem);
  const openMs = GE.nextMcxOpen(NOW), closeMs = GE.nextMcxClose(NOW), nextOpenMs = GE.nextMcxOpen(openMs);
  const fOpen = GE.forecastTo(NOW, openMs, fc), fClose = GE.forecastTo(NOW, closeMs, fc), fNext = GE.forecastTo(NOW, nextOpenMs, fc);
  const pred = (f, ms, label) => ({ label, targetIST: IST(ms), targetMs: ms, tradingHours: f.hours, expectedReturn: f.m, sigma: f.s,
    grades: Object.fromEntries(GRADES.map(([k]) => { const q = f.factor(R[k]); return [k, { mid: r2(q.mid), lo68: r2(q.lo68), hi68: r2(q.hi68), lo95: r2(q.lo95), hi95: r2(q.hi95) }]; })) });
  const predictions = { open: pred(fOpen, openMs, 'Next MCX open (09:00 IST)'), close: pred(fClose, closeMs, 'Next MCX session close'), followingOpen: pred(fNext, nextOpenMs, 'Following MCX open') };
  const mc = m30.status === 'fulfilled' ? GE.morningCheck(GE.parseKlines(m30.value), daily, wf.rows, NOW) : null;
  // 22K · 1 gram prediction success (same rows as the dashboard): session closes (walk-forward) and MCX morning opens
  const K22 = GE.PURITY.k22_916, fxAt = GE.fxLookup(FX);
  const k22Close = wf.rows.filter(r => r.actual !== null).map(r => {
    const dd = daily[r.t + 1].date, du = GE.dutyAt(dd, duty); if (du == null) return null;
    const f = basis * (1 + du / 100) * (1 + prem) * K22 / 10, pv = px[r.t] * f;
    return { date: dd, prev: pv, pred: pv * Math.exp(r.pred.ens), act: px[r.t + 1] * f, lo: pv * Math.exp(r.pred.ens - r.sigma), hi: pv * Math.exp(r.pred.ens + r.sigma) };
  }).filter(Boolean);
  const wByDate = new Map(wf.rows.map(r => [daily[r.t].date, r]));
  const k22Open = mc ? mc.rows.map(x => {
    const w = wByDate.get(GE.istDate(x.anchorT)), du = GE.dutyAt(x.date, duty), fxd = fxAt(x.date); if (!w || du == null || !fxd) return null;
    const f = basis * fxd / 31.1034768 * (1 + du / 100) * (1 + prem) * K22, pv = x.anchorUsd * f, m = w.pred.ens * (x.s / w.sigma) ** 2;
    return { date: x.date, prev: pv, pred: pv * Math.exp(m), act: x.openUsd * f, lo: pv * Math.exp(m - x.s), hi: pv * Math.exp(m + x.s) };
  }).filter(Boolean) : [];
  const k22 = { closeAll: GE.successStats(k22Close), close90: GE.successStats(k22Close.slice(-90)), openAll: GE.successStats(k22Open), last: k22Close.slice(-10) };
  const prevRow = daily[lastC], prevFine = (prevRow.inr / 10) * basis * (1 + duty / 100) * (1 + prem);
  const erInr = er.status === 'fulfilled' ? +er.value.rates.INR : null;

  // ---------- 3. validate ----------
  const lim = CFG.limits;
  check('Hourly bars count ≥ 900', hDone.length >= 900, `${hDone.length}`);
  check(`Hourly data fresh (≤ ${lim.hourlyMaxAgeH} h)`, NOW - (hDone.at(-1).closeT + 1) <= lim.hourlyMaxAgeH * 3600e3, `last close ${IST(hDone.at(-1).closeT + 1)} IST`);
  check('Daily sessions ≥ 1000', n >= 1000, `${n} sessions from ${daily[0].date}`);
  check('USD/INR history ≥ 1000 fixes', FX.length >= 1000, `${FX.length}`);
  check(`USD/INR fresh (≤ ${lim.fxMaxAgeDays} days)`, NOW - Date.parse(fxDate + 'T00:00:00Z') <= lim.fxMaxAgeDays * 86400e3, `ECB ${fxDate}`);
  check('USD/INR in sane range 60–150', usdInr > 60 && usdInr < 150, `${usdInr}`);
  check(`Spot fresh (≤ ${lim.spotMaxAgeMin} min)`, NOW - spotT <= lim.spotMaxAgeMin * 60e3, `${spot.value.updatedAt}`);
  check('Spot in sane range $500–$20,000', spotUsd > 500 && spotUsd < 20000, `$${spotUsd}`);
  check(`Spot vs PAXG within ${lim.spotVsPaxgMaxPct}%`, Math.abs(basis - 1) * 100 <= lim.spotVsPaxgMaxPct, `XAU $${spotUsd} vs PAXG $${paxg} (${pct(basis - 1)})`);
  if (erInr) check(`ECB USD/INR vs live within ${lim.ecbVsLiveFxMaxPct}%`, Math.abs(usdInr / erInr - 1) * 100 <= lim.ecbVsLiveFxMaxPct, `ECB ${usdInr} vs live ${erInr}`);
  // independent recomputation of every grade from first principles
  const fineIndep = (spotUsd * usdInr / 31.1034768) * (1 + duty / 100) * (1 + prem);
  for (const [k, p] of Object.entries(PUR)) check(`Rate maths: ${k}`, Math.abs(R[k] - fineIndep * p) < 1e-6, `${r2(R[k])} = ${r2(fineIndep)} × ${p}`);
  check('Rate maths: international fine', Math.abs(R.fineIntl - spotUsd * usdInr / 31.1034768) < 1e-6, `${r2(R.fineIntl)}`);
  check('Rate maths: MCX 10 g = 10 × per gram', Math.abs(R.mcx995_10g - 10 * R.mcx995) < 1e-6, `${r2(R.mcx995_10g)}`);
  check('Grade ordering 24K 99.99 > 99.9 > 995 > 22K', R.k24_9999 > R.k24_999 && R.k24_999 > R.mcx995 && R.mcx995 > R.k22_916, 'ok');
  let bandsOk = true;
  for (const p of Object.values(predictions)) for (const g of Object.values(p.grades)) if (!(g.lo95 <= g.lo68 && g.lo68 <= g.mid && g.mid <= g.hi68 && g.hi68 <= g.hi95) || !Object.values(g).every(Number.isFinite)) bandsOk = false;
  check('Prediction bands ordered & finite', bandsOk, 'lo95 ≤ lo68 ≤ mid ≤ hi68 ≤ hi95');
  check('Daily sigma in 0.1%–8%', fc.sigma > 0.001 && fc.sigma < 0.08, `${(fc.sigma * 100).toFixed(2)}%`);
  check('Expected next-close move within ±3σ', Math.abs(fClose.m) <= 3 * Math.max(fClose.s, 1e-6) || fClose.hours === 0, `${pct(fClose.m)}`);
  check('Backtest sample ≥ 500 sessions', sc.n >= 500, `${sc.n}`);
  check('Backtest 68% band coverage 55–85%', sc.cov68 >= 0.55 && sc.cov68 <= 0.85, `${(sc.cov68 * 100).toFixed(1)}%`);
  check('Backtest 95% band coverage 85–99%', sc.cov95 >= 0.85 && sc.cov95 <= 0.99, `${(sc.cov95 * 100).toFixed(1)}%`);
  check('22K success stats: ≥ 500 scored session closes', k22.closeAll && k22.closeAll.n >= 500, k22.closeAll ? `${k22.closeAll.n}` : 'none');
  check('22K 68% range hit rate 55–85%', k22.closeAll && k22.closeAll.band68 >= 0.55 && k22.closeAll.band68 <= 0.85, k22.closeAll ? `${(k22.closeAll.band68 * 100).toFixed(1)}%` : 'none');
  check('22K rate = 24K 99.99% × 0.916 / 0.9999', Math.abs(R.k22_916 - R.k24_9999 * 0.916 / 0.9999) < 1e-6, `${r2(R.k22_916)}`);
  check('Naive model Theil U = 1 (scoring sanity)', Math.abs(sc.res.naive.theilU - 1) < 1e-12, `${sc.res.naive.theilU}`);
  const prevLatest = existsSync(P('docs/latest.json')) ? JSON.parse(readFileSync(P('docs/latest.json'), 'utf8')) : null;
  if (prevLatest && prevLatest.rates) {
    const ch = R.k24_9999 / prevLatest.rates.k24_9999 - 1, dutyChanged = prevLatest.inputs.importDutyPct !== duty;
    check(`24K change vs last publish ≤ ${lim.maxDayChangePct}%`, dutyChanged || Math.abs(ch) * 100 <= lim.maxDayChangePct, `${pct(ch)} vs ${prevLatest.generatedIST}${dutyChanged ? ' (duty changed)' : ''}`);
  }
  let finite = true; JSON.stringify(R, (k, v) => { if (typeof v === 'number' && !Number.isFinite(v)) finite = false; return v; });
  check('All rates finite and positive', finite && Object.values(R).every(v => v > 0), 'ok');

  const out = { k22, NOW, R, predictions, sc, mc, fc, daily, lastC, prevFine, basis, paxg, spotUsd, spotT, usdInr, fxDate, erInr, duty, prem, hDone, m30: m30.status === 'fulfilled' ? GE.parseKlines(m30.value) : [], FX };
  return finish(checks, out);
}

// ---------- score previous predictions (24K 99.99% ₹/g; actual = PAXG-derived parity at target time) ----------
function scoreLedger(ledger, o) {
  const fxAt = GE.fxLookup(o.FX), M = o.m30;
  for (const e of ledger) {
    if (e.actual != null || e.targetMs > o.NOW - 30 * 60e3) continue;
    let px = null;
    if (e.kind === 'open') { const b = M.find(x => x.t === e.targetMs); if (b) px = b.o; }
    else { const b = M.find(x => x.t <= e.targetMs && e.targetMs <= x.closeT) || M.filter(x => x.closeT <= e.targetMs).at(-1); if (b) px = b.c; }
    if (px == null) continue;
    const fx = fxAt(GE.istDate(e.targetMs)); if (!fx) continue;
    e.actual = r2(GE.rates(px * e.basis, fx, e.duty, e.prem).k24_9999);
    e.errorPct = r2((e.mid / e.actual - 1) * 100); e.inBand68 = e.actual >= e.lo68 && e.actual <= e.hi68;
  }
  return ledger;
}

function finish(checks, o) {
  const failed = checks.filter(c => !c.pass && c.severity === 'error'), warns = checks.filter(c => !c.pass && c.severity === 'warn');
  const table = ['| | Check | Detail |', '|---|---|---|', ...checks.map(c => `| ${c.pass ? '✅' : c.severity === 'warn' ? '⚠️' : '❌'} | ${c.name} | ${String(c.detail).replace(/\|/g, '/')} |`)].join('\n');
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## AurumCast validation — ${failed.length ? 'FAILED, nothing published' : 'passed'}\n\n${table}\n`);
  console.log(table);
  if (failed.length) { console.error(`\n❌ ${failed.length} validation check(s) failed. Nothing was published.`); process.exit(1); }
  console.log(`\n✅ All ${checks.length - warns.length} required checks passed${warns.length ? ` (${warns.length} warning)` : ''}.`);
  publish(o, checks);
}

function publish(o, checks) {
  const { NOW, R, predictions: PR, sc, mc, k22 } = o, day = GE.istDate(NOW), e = sc.res.ens;
  const latest = {
    generatedAt: new Date(NOW).toISOString(), generatedIST: IST(NOW),
    inputs: { spotUsdOz: o.spotUsd, spotUpdated: new Date(o.spotT).toISOString(), paxgUsd: o.paxg, paxgToSpotBasisPct: r2((o.basis - 1) * 100), usdInr: o.usdInr, usdInrDate: o.fxDate, usdInrLiveCrossCheck: o.erInr, importDutyPct: o.duty, mcxCalibrationPct: o.prem * 100 },
    rates: Object.fromEntries(Object.entries(R).map(([k, v]) => [k, r2(v)])),
    changeVsPrevCloseFine: r2(R.fineLanded / o.prevFine - 1),
    predictions: PR,
    model: { backtestSessions: sc.n, ensembleTheilU: e.theilU, dieboldMariano: e.dm, directionHit: e.hit, alwaysUpBaseline: sc.upShare, band68Coverage: sc.cov68, band95Coverage: sc.cov95, morningOpen68Coverage: mc ? mc.cov : null, morningOpenSamples: mc ? mc.n : 0 },
    k22_1g: {
      mcxLinked: r2(R.k22_916), mcxLinkedWithGst: r2(R.k22_916 * 1.03), comexNoDuty: r2(R.fineIntl * GE.PURITY.k22_916),
      predictions: Object.fromEntries(Object.entries(PR).map(([k, p]) => [k, { targetIST: p.targetIST, ...p.grades.k22_916 }])),
      success: { sessionCloseAll: k22.closeAll, sessionCloseLast90: k22.close90, morningOpenAll: k22.openAll },
    },
    validation: checks,
    sources: { gold: 'Binance PAXG/USDT (data-api.binance.vision)', spot: 'gold-api.com XAU', fx: 'ECB via frankfurter.dev', fxCrossCheck: 'open.er-api.com' },
  };
  // ledger
  const ledgerPath = P('docs/predictions.json');
  let ledger = existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, 'utf8')) : [];
  ledger = scoreLedger(ledger, o);
  for (const [kind, p] of [['open', PR.open], ['close', PR.close]]) {
    if (!ledger.find(x => x.kind === kind && x.targetMs === p.targetMs)) { const g = p.grades.k24_9999; ledger.push({ kind, targetMs: p.targetMs, targetIST: p.targetIST, madeIST: IST(NOW), mid: g.mid, lo68: g.lo68, hi68: g.hi68, basis: o.basis, duty: o.duty, prem: o.prem, actual: null }); }
  }
  ledger = ledger.slice(-400);
  const scored = ledger.filter(x => x.actual != null);
  const ledgerStats = scored.length ? { n: scored.length, inBand68: scored.filter(x => x.inBand68).length / scored.length, meanAbsErrorPct: scored.reduce((s, x) => s + Math.abs(x.errorPct), 0) / scored.length } : null;
  latest.liveTrackRecord = ledgerStats;

  // markdown report
  const rows = GRADES.map(([k, n, gst]) => { const o1 = PR.open.grades[k], c1 = PR.close.grades[k]; return `| ${n} | **${inr(R[k])}** | ${inr(R[k] * 10, 0)} | ${gst ? inr(R[k] * 1.03) : '—'} | ${inr(o1.mid, 0)} (${inr(o1.lo68, 0)}–${inr(o1.hi68, 0)}) | ${inr(c1.mid, 0)} (${inr(c1.lo68, 0)}–${inr(c1.hi68, 0)}) |`; }).join('\n');
  const rateTable = `| Grade | Today ₹/g | ₹/10 g | + 3% GST ₹/g | MCX open ${PR.open.targetIST.slice(5)} IST · ₹/g (68%) | Session close ${PR.close.targetIST.slice(5)} IST · ₹/g (68%) |\n|---|---:|---:|---:|---:|---:|\n${rows}`;
  const track = scored.slice(-10).reverse().map(x => `| ${x.targetIST} | ${x.kind} | ${inr(x.mid, 0)} | ${inr(x.actual, 0)} | ${x.errorPct > 0 ? '+' : ''}${x.errorPct}% | ${x.inBand68 ? '✅' : '❌'} |`).join('\n');
  const md = `# Gold rates — ${day} (generated ${IST(NOW)} IST)

Spot **$${o.spotUsd.toFixed(2)}/oz** · USD/INR **${o.usdInr}** (ECB ${o.fxDate}) · import duty **${o.duty}%** · change vs previous close **${pct(latest.changeVsPrevCloseFine)}**

${rateTable}

Following MCX open ${PR.followingOpen.targetIST} IST — 24K 99.99%: ${inr(PR.followingOpen.grades.k24_9999.mid, 0)} (${inr(PR.followingOpen.grades.k24_9999.lo68, 0)}–${inr(PR.followingOpen.grades.k24_9999.hi68, 0)})

### 22K gold · 1 gram

| | ₹ per gram |
|---|---:|
| **22K 1 g, MCX-linked (incl. ${o.duty}% duty)** | **${inr(R.k22_916)}** |
| 22K 1 g + 3% GST | ${inr(R.k22_916 * 1.03)} |
| 22K 1 g, COMEX (international, no Indian duty) | ${inr(R.fineIntl * GE.PURITY.k22_916)} |
${[['open', 'Next MCX open'], ['close', 'Session close'], ['followingOpen', 'Following MCX open']].sort((a, b) => PR[a[0]].targetMs - PR[b[0]].targetMs).map(([k, n]) => { const g = PR[k].grades.k22_916; return `| Prediction · ${n} ${PR[k].targetIST} IST | ${inr(g.mid, 0)} (68% ${inr(g.lo68, 0)}–${inr(g.hi68, 0)}) |`; }).join('\n')}

**22K 1 g prediction success** (each prediction made before its target with only the data available then):

| Scored on | Predictions | Inside 68% range | Within ±0.5% | Within ±1% | Direction right | Avg error |
|---|---:|---:|---:|---:|---:|---:|
${[['Session closes, all', k22.closeAll], ['Session closes, last 90', k22.close90], ['MCX morning opens', k22.openAll]].filter(x => x[1]).map(([n, x]) => `| ${n} | ${x.n} | ${(x.band68 * 100).toFixed(1)}% | ${(x.within05 * 100).toFixed(1)}% | ${(x.within1 * 100).toFixed(1)}% | ${x.direction == null ? '—' : (x.direction * 100).toFixed(1) + '%'} | ${inr(x.mape * R.k22_916, 0)}/g |`).join('\n')}

Last 10 session closes (22K ₹/g, predicted→actual): ${k22.last.map(x => `${x.date.slice(5)} ${inr(x.pred, 0)}→${inr(x.act, 0)} ${x.act >= x.lo && x.act <= x.hi ? '✅' : '❌'}`).join(' · ')}

**How much to trust the forecast.** Walk-forward backtest over ${sc.n} sessions: ensemble Theil U ${e.theilU.toFixed(4)} (DM ${e.dm.toFixed(2)}, ${Math.abs(e.dm) > 1.96 ? 'significant' : 'not significantly better than "no change"'}); direction right ${(e.hit * 100).toFixed(1)}% vs ${(sc.upShare * 100).toFixed(1)}% for "always up". The 68% band held ${(sc.cov68 * 100).toFixed(1)}% of closes${mc ? ` and ${(mc.cov * 100).toFixed(0)}% of ${mc.n} MCX morning opens` : ''}. Rely on the ranges, not the point.

${scored.length ? `### Live track record (24K 99.99%, last 10 scored)\n\n| Target | Kind | Predicted | Actual | Error | In 68%? |\n|---|---|---:|---:|---:|:-:|\n${track}\n\nAll-time: ${ledgerStats.n} scored, ${(ledgerStats.inBand68 * 100).toFixed(0)}% inside the 68% band, mean abs error ${ledgerStats.meanAbsErrorPct.toFixed(2)}%.\n` : '_Live track record starts once the first predictions mature._\n'}
<details><summary>Validation: ${checks.filter(c => c.pass).length}/${checks.length} checks passed</summary>

| | Check | Detail |
|---|---|---|
${checks.map(c => `| ${c.pass ? '✅' : c.severity === 'warn' ? '⚠️' : '❌'} | ${c.name} | ${String(c.detail).replace(/\|/g, '/')} |`).join('\n')}
</details>

Method: Indian grades = spot × USD/INR ÷ 31.1035 g × (1 + duty) × purity (0.9999 / 0.999 / 0.995 / 0.916). MCX quotes include duty, exclude GST. Gold history: Binance PAXG (1 token = 1 fine oz LBMA gold) scaled to XAU spot. Actuals in the track record are PAXG-derived parity at the target time, not the exchange print. Not investment advice.
`;
  if (DRY) { console.log('\n--- DRY RUN: report preview ---\n' + md); return; }
  mkdirSync(P('docs'), { recursive: true }); mkdirSync(P('reports'), { recursive: true });
  writeFileSync(P('docs/latest.json'), JSON.stringify(latest, null, 2));
  writeFileSync(ledgerPath, JSON.stringify(ledger, null, 1));
  writeFileSync(P(`reports/${day}.md`), md);
  // history.csv (one row per IST date; re-runs replace the row)
  const hp = P('docs/history.csv'), head = 'date_ist,generated_ist,spot_usd_oz,usd_inr,duty_pct,k24_9999,k24_999,mcx995_10g,k22_916,fine_intl,pred_open_k24_9999,pred_open_lo68,pred_open_hi68,pred_close_k24_9999,pred_close_lo68,pred_close_hi68';
  const prev = existsSync(hp) ? readFileSync(hp, 'utf8').trim().split('\n').slice(1).filter(l => !l.startsWith(day + ',')) : [];
  const po = PR.open.grades.k24_9999, pc = PR.close.grades.k24_9999;
  prev.push([day, IST(NOW), o.spotUsd, o.usdInr, o.duty, r2(R.k24_9999), r2(R.k24_999), r2(R.mcx995_10g), r2(R.k22_916), r2(R.fineIntl), po.mid, po.lo68, po.hi68, pc.mid, pc.lo68, pc.hi68].join(','));
  writeFileSync(hp, head + '\n' + prev.sort().join('\n') + '\n');
  // README block
  const rp = P('README.md');
  if (existsSync(rp)) {
    const readme = readFileSync(rp, 'utf8'), block = `<!-- RATES:START -->\n**Latest: ${IST(NOW)} IST** · spot $${o.spotUsd.toFixed(2)}/oz · USD/INR ${o.usdInr} · duty ${o.duty}% · [full report](reports/${day}.md)\n\n${rateTable}\n\n**22K 1 gram:** ${inr(R.k22_916)} MCX-linked · ${inr(R.k22_916 * 1.03)} with GST · ${inr(R.fineIntl * GE.PURITY.k22_916)} COMEX (no duty). Prediction success over ${k22.closeAll.n} session closes: **${(k22.closeAll.band68 * 100).toFixed(1)}% inside the 68% range**, ${(k22.closeAll.within1 * 100).toFixed(1)}% within ±1%${k22.openAll ? `; ${k22.openAll.n} MCX morning opens: ${(k22.openAll.band68 * 100).toFixed(1)}% inside range` : ''}.\n<!-- RATES:END -->`;
    writeFileSync(rp, readme.replace(/<!-- RATES:START -->[\s\S]*<!-- RATES:END -->/, block));
  }
  console.log(`Published reports/${day}.md, docs/latest.json, docs/history.csv, docs/predictions.json, README.md`);
}

main().catch(e => { console.error('Fatal:', e); if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## AurumCast — fatal error, nothing published\n\n\`${e.message}\`\n`); process.exit(1); });
