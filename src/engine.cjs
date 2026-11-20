/* AurumCast engine — pure functions, no DOM. All inputs are real market data fetched at runtime. */
const GE = (() => {
  const OZ_G = 31.1034768; // grams per troy ounce
  const IST_MS = 5.5 * 3600e3;

  // ---------- basic stats ----------
  const sum = a => a.reduce((s, x) => s + x, 0);
  const mean = a => (a.length ? sum(a) / a.length : NaN);
  const std = a => { if (a.length < 2) return NaN; const m = mean(a); return Math.sqrt(sum(a.map(x => (x - m) ** 2)) / (a.length - 1)); };
  const quantile = (a, q) => { const s = [...a].sort((x, y) => x - y); const i = (s.length - 1) * q; const lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  function sma(a, n) { const o = new Array(a.length).fill(null); let s = 0; for (let i = 0; i < a.length; i++) { s += a[i]; if (i >= n) s -= a[i - n]; if (i >= n - 1) o[i] = s / n; } return o; }
  function ema(a, n) { const o = new Array(a.length).fill(null); const k = 2 / (n + 1); let e = null; for (let i = 0; i < a.length; i++) { e = e === null ? a[i] : a[i] * k + e * (1 - k); if (i >= n - 1) o[i] = e; } return o; }
  function rollStd(a, n) { const o = new Array(a.length).fill(null); for (let i = n - 1; i < a.length; i++) o[i] = std(a.slice(i - n + 1, i + 1)); return o; }
  function rsi(c, n = 14) {
    const o = new Array(c.length).fill(null); let g = 0, l = 0;
    for (let i = 1; i < c.length; i++) {
      const d = c[i] - c[i - 1], up = Math.max(d, 0), dn = Math.max(-d, 0);
      if (i <= n) { g += up / n; l += dn / n; if (i === n) o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); }
      else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); }
    }
    return o;
  }
  function macd(c, f = 12, s = 26, sig = 9) {
    const ef = ema(c, f), es = ema(c, s);
    const m = c.map((_, i) => (ef[i] !== null && es[i] !== null ? ef[i] - es[i] : null));
    const start = m.findIndex(x => x !== null);
    const sg = new Array(c.length).fill(null);
    if (start >= 0) { const e = ema(m.slice(start), sig); e.forEach((v, j) => (sg[start + j] = v)); }
    return { macd: m, signal: sg, hist: m.map((v, i) => (v !== null && sg[i] !== null ? v - sg[i] : null)) };
  }
  function bollinger(c, n = 20, k = 2) { const m = sma(c, n), s = rollStd(c, n); return { mid: m, up: m.map((v, i) => (v === null ? null : v + k * s[i])), lo: m.map((v, i) => (v === null ? null : v - k * s[i])), sd: s }; }
  function atr(h, l, c, n = 14) {
    const tr = c.map((_, i) => (i === 0 ? h[i] - l[i] : Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]))));
    const o = new Array(c.length).fill(null); let a = null;
    for (let i = 0; i < c.length; i++) { if (i === n - 1) a = mean(tr.slice(0, n)); else if (i >= n) a = (a * (n - 1) + tr[i]) / n; if (i >= n - 1) o[i] = a; }
    return o;
  }
  // EWMA (RiskMetrics) volatility: sig[t] is the 1-step-ahead sigma using returns up to and including t
  function ewmaVol(r, lam = 0.94, seedN = 30) {
    const o = new Array(r.length).fill(null); if (r.length < seedN) return o;
    let v = mean(r.slice(0, seedN).map(x => x * x));
    for (let i = 0; i < r.length; i++) { v = lam * v + (1 - lam) * r[i] * r[i]; if (i >= seedN - 1) o[i] = Math.sqrt(v); }
    return o;
  }
  function drawdown(c) { let pk = -Infinity; return c.map(x => { pk = Math.max(pk, x); return x / pk - 1; }); }

  // ---------- linear algebra (ridge) ----------
  function solve(A, b) { // Gaussian elimination with partial pivoting
    const n = b.length, M = A.map((r, i) => [...r, b[i]]);
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      [M[c], M[p]] = [M[p], M[c]]; const d = M[c][c] || 1e-12;
      for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / d; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
    }
    return M.map((r, i) => r[n] / (r[i] || 1e-12));
  }
  function ridgeFit(X, y, lam) { // X rows already standardized; intercept unpenalized
    const p = X[0].length, A = Array.from({ length: p + 1 }, () => new Array(p + 1).fill(0)), b = new Array(p + 1).fill(0);
    for (let i = 0; i < X.length; i++) { const row = [1, ...X[i]]; for (let a = 0; a <= p; a++) { b[a] += row[a] * y[i]; for (let c = 0; c <= p; c++) A[a][c] += row[a] * row[c]; } }
    for (let a = 1; a <= p; a++) A[a][a] += lam * X.length;
    return solve(A, b);
  }

  // ---------- data shaping ----------
  const parseKlines = raw => raw.map(k => ({ t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5], qv: +k[7], closeT: k[6] }));
  const istDate = t => new Date(t + IST_MS).toISOString().slice(0, 10);
  const istDow = t => new Date(t + IST_MS).getUTCDay();
  const istHour = t => new Date(t + IST_MS).getUTCHours();

  // Frankfurter v2 [{date, rate}] or v1 {rates:{date:{INR}}} -> sorted [[date, rate]]
  function parseFx(j) {
    if (Array.isArray(j)) return j.map(x => [x.date, +x.rate]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    return Object.entries(j.rates).map(([d, r]) => [d, +r.INR]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }
  function fxLookup(fx) { // forward-filled lookup by ISO date (uses last published ECB fix on or before date)
    return d => { let lo = 0, hi = fx.length - 1, ans = null; while (lo <= hi) { const m = (lo + hi) >> 1; if (fx[m][0] <= d) { ans = fx[m][1]; lo = m + 1; } else hi = m - 1; } return ans; };
  }

  // Daily series aligned to IST trading days (Mon–Fri), close ≈ MCX evening close window.
  function buildDaily(bars, fx, nowMs) {
    const fxAt = fxLookup(fx), out = [];
    for (const b of bars) {
      const dow = istDow(b.t); if (dow === 0 || dow === 6) continue;
      const d = istDate(b.t), r = fxAt(d); if (!r) continue;
      out.push({ t: b.t, date: d, o: b.o, h: b.h, l: b.l, usd: b.c, fx: r, inr: (b.c * r * 10) / OZ_G, inrH: (b.h * r * 10) / OZ_G, inrL: (b.l * r * 10) / OZ_G, partial: b.closeT > nowMs });
    }
    return out;
  }

  // ---------- feature matrix ----------
  function features(px, fxr) {
    const n = px.length, lp = px.map(Math.log), r = lp.map((v, i) => (i ? v - lp[i - 1] : 0));
    const rs = rsi(px, 14), s20 = sma(px, 20), sd20 = rollStd(px, 20), mc = macd(px), vol = ewmaVol(r), lv = rollStd(r, 120);
    const F = [];
    for (let i = 0; i < n; i++) {
      if (i < 130) { F.push(null); continue; }
      F.push([r[i], r[i - 1], r[i - 2], r[i - 3], r[i - 4], (rs[i] - 50) / 50, (px[i] - s20[i]) / (sd20[i] || 1), (mc.hist[i] || 0) / px[i] * 100, fxr ? fxr[i] : 0, vol[i] / (lv[i] || vol[i]) - 1, mean(r.slice(i - 19, i + 1))]);
    }
    return { r, lp, F, vol };
  }

  const MODELS = [
    { id: 'naive', name: 'Random walk (naive)', desc: 'Tomorrow = today. The benchmark every model must beat.' },
    { id: 'drift', name: 'Drift (250-day mean)', desc: 'Adds the average daily return of the past year.' },
    { id: 'tsmom', name: 'Time-series momentum', desc: 'Direction of the 60-day trend × size of yearly drift.' },
    { id: 'holt', name: 'Holt trend smoothing', desc: 'Trend slope from double exponential smoothing of log price (α 0.2, β 0.05).' },
    { id: 'ar5', name: 'AR(5) regression', desc: 'Rolling 500-day autoregression on the last 5 daily returns.' },
    { id: 'ridge', name: 'Ridge multi-factor', desc: 'Returns, RSI, Bollinger z, MACD, USD/INR move, vol regime, 20-day mean.' },
  ];

  // Walk-forward: at each t (using data ≤ t) predict r[t+1]. testEnd = index of last completed bar.
  function walkForward(px, fxr, opts = {}) {
    const W = opts.window || 500, lam = opts.lambda ?? 0.02, start = Math.max(W + 135, opts.start || 0);
    const { r, lp, F, vol } = features(px, fxr), n = px.length;
    // Holt states (causal)
    const holt = new Array(n).fill(0); { let L = lp[0], T = 0; const a = 0.2, b = 0.05; for (let i = 1; i < n; i++) { const Lp = L; L = a * lp[i] + (1 - a) * (L + T); T = b * (L - Lp) + (1 - b) * T; holt[i] = T; } }
    const fitCache = {};
    function fitAt(t, kind) {
      const key = kind + ':' + Math.floor(t / 5); if (fitCache[key]) return fitCache[key];
      const X = [], y = [];
      for (let i = t - W; i < t; i++) { if (!F[i]) continue; X.push(kind === 'ar5' ? F[i].slice(0, 5) : F[i]); y.push(r[i + 1]); }
      const p = X[0].length, mu = [], sd = [];
      for (let j = 0; j < p; j++) { const col = X.map(x => x[j]); mu.push(mean(col)); sd.push(std(col) || 1); }
      const Xs = X.map(x => x.map((v, j) => (v - mu[j]) / sd[j]));
      const beta = ridgeFit(Xs, y, kind === 'ar5' ? 1e-4 : lam);
      return (fitCache[key] = { beta, mu, sd });
    }
    const predAt = t => {
      const d250 = mean(r.slice(t - 249, t + 1)), m60 = sum(r.slice(t - 59, t + 1));
      const out = { naive: 0, drift: d250, tsmom: Math.sign(m60) * Math.abs(d250), holt: holt[t] };
      for (const k of ['ar5', 'ridge']) { const f = fitAt(t, k), x = k === 'ar5' ? F[t].slice(0, 5) : F[t]; out[k] = f.beta[0] + x.reduce((s, v, j) => s + f.beta[j + 1] * (v - f.mu[j]) / f.sd[j], 0); }
      return out;
    };
    const ids = MODELS.map(m => m.id), rows = [], errs = Object.fromEntries(ids.map(i => [i, []]));
    const testEnd = opts.lastCompleted ?? n - 1;
    for (let t = start; t < n; t++) {
      const p = predAt(t);
      // ensemble weights from trailing 60 squared errors (strictly past)
      const w = {}; let ws = 0;
      for (const id of ids) { const e = errs[id].slice(-60); const mse = e.length >= 20 ? mean(e) : null; w[id] = mse ? 1 / mse : 1; ws += w[id]; }
      for (const id of ids) w[id] /= ws;
      p.ens = ids.reduce((s, id) => s + w[id] * p[id], 0);
      const row = { t, pred: p, w, sigma: vol[t], actual: t + 1 <= testEnd ? r[t + 1] : null };
      if (row.actual !== null) for (const id of ids) errs[id].push((p[id] - row.actual) ** 2);
      rows.push(row);
    }
    return { rows, r, vol, ids: [...ids, 'ens'] };
  }

  function scoreModels(rows, ids) {
    const done = rows.filter(x => x.actual !== null), act = done.map(x => x.actual);
    const eN = done.map(x => x.pred.naive - x.actual), rmseN = Math.sqrt(mean(eN.map(e => e * e)));
    const res = {};
    for (const id of ids) {
      const e = done.map(x => x.pred[id] - x.actual), se = e.map(v => v * v);
      const dirRows = done.filter(x => x.pred[id] !== 0 && x.actual !== 0);
      const hit = dirRows.length ? dirRows.filter(x => Math.sign(x.pred[id]) === Math.sign(x.actual)).length / dirRows.length : null;
      const d = se.map((v, i) => v - eN[i] * eN[i]), dm = id === 'naive' ? 0 : mean(d) / Math.sqrt((std(d) ** 2) / d.length);
      res[id] = { mae: mean(e.map(Math.abs)), rmse: Math.sqrt(mean(se)), theilU: Math.sqrt(mean(se)) / rmseN, hit, dm, n: done.length };
    }
    const upShare = act.filter(x => x > 0).length / act.length;
    const ensE = done.map(x => x.actual - x.pred.ens);
    const cov68 = mean(done.map((x, i) => (Math.abs(ensE[i]) <= x.sigma ? 1 : 0)));
    const cov95 = mean(done.map((x, i) => (Math.abs(ensE[i]) <= 1.96 * x.sigma ? 1 : 0)));
    return { res, upShare, cov68, cov95, n: done.length };
  }

  // Hour-of-day × weekday matrix (IST)
  function sessionMatrix(hbars) {
    const acc = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ s: 0, a: 0, n: 0 })));
    for (let i = 1; i < hbars.length; i++) { const r = Math.log(hbars[i].c / hbars[i - 1].c), dw = istDow(hbars[i].t), h = istHour(hbars[i].t); const c = acc[dw][h]; c.s += r; c.a += Math.abs(r); c.n++; }
    return acc.map(row => row.map(c => ({ mean: c.n ? (c.s / c.n) * 1e4 : null, absMean: c.n ? (c.a / c.n) * 1e4 : null, n: c.n })));
  }

  // Investor scorecard: each factor in [-1, 1]; positive favours buying now.
  function scorecard(d, fc, skill) {
    const c = d.map(x => x.inr), last = c.length - 1, P = c[last];
    const s50 = sma(c, 50)[last], s200 = sma(c, 200)[last], rs = rsi(c, 14)[last], bb = bollinger(c, 20, 2);
    const z = (P - bb.mid[last]) / (bb.sd[last] || 1);
    const r = c.map((v, i) => (i ? Math.log(v / c[i - 1]) : 0)), vol = ewmaVol(r);
    const volNow = vol[last] * Math.sqrt(252), volHist = r.slice(-756).length > 60 ? rollStd(r, 60).filter(x => x !== null).slice(-756).map(x => x * Math.sqrt(252)) : [volNow];
    const volPct = volHist.filter(x => x <= volNow).length / volHist.length;
    const dd = P / Math.max(...c) - 1, ret20 = P / c[last - 20] - 1;
    const m = macd(c), mh = m.hist[last];
    const F = [
      { k: 'Long-term trend', v: clamp(((P / s200 - 1) * 10), -1, 1) * 0.6 + (s50 > s200 ? 0.4 : -0.4), why: `Price ${P > s200 ? 'above' : 'below'} 200-day average; 50-day ${s50 > s200 ? 'above' : 'below'} 200-day.` },
      { k: 'Momentum (MACD)', v: clamp(mh / (P * 0.004), -1, 1), why: `MACD histogram ${mh >= 0 ? 'positive' : 'negative'}; 20-day change ${(ret20 * 100).toFixed(1)}%.` },
      { k: 'Overbought / oversold (RSI)', v: clamp((50 - rs) / 25, -1, 1), why: `RSI(14) = ${rs.toFixed(0)}. Below 30 has been a cheaper entry; above 70 is stretched.` },
      { k: 'Bollinger position', v: clamp(-z / 2, -1, 1), why: `Price is ${z.toFixed(2)} standard deviations from its 20-day mean.` },
      { k: 'Discount from peak', v: clamp(-dd * 8, 0, 1), why: `${(dd * 100).toFixed(1)}% below the all-time high in this data.` },
      { k: 'Next-day model view', v: skill > 0 ? clamp(fc.r / (fc.sigma || 1), -1, 1) * clamp(skill, 0, 1) : 0, why: skill > 0 ? `Ensemble beat naive in backtest; forecast ${(fc.r * 100).toFixed(2)}%.` : 'Ensemble did not beat the random walk in backtest, so its direction gets zero weight.' },
      { k: 'Volatility regime', v: clamp(0.5 - volPct, -0.5, 0.5), why: `Annualised volatility ${(volNow * 100).toFixed(1)}% sits at the ${(volPct * 100).toFixed(0)}th percentile of the last 3 years.` },
    ];
    const W = [0.22, 0.14, 0.14, 0.12, 0.14, 0.10, 0.14];
    const score = F.reduce((s, f, i) => s + f.v * W[i], 0);
    return { factors: F.map((f, i) => ({ ...f, w: W[i] })), score, volNow, volPct, rsi: rs, z, dd, s50, s200 };
  }


  // ---------- India purity & pricing ----------
  // Spot is quoted per troy oz of FINE gold. Indian landed price = fine price × (1 + duty).
  const PURITY = { k24_9999: 0.9999, k24_999: 0.999, mcx995: 0.995, k22_916: 0.916 };
  const GST = 0.03;
  // Returns ₹/gram for each grade. prem = MCX calibration (fraction), applied to all Indian grades.
  function rates(spotUsdOz, usdInr, dutyPct, prem = 0) {
    const fineIntl = (spotUsdOz * usdInr) / OZ_G;               // ₹/g pure gold, international (no Indian duty)
    const fineLanded = fineIntl * (1 + dutyPct / 100) * (1 + prem); // ₹/g pure gold landed in India
    const g = p => fineLanded * p;
    return { fineIntl, fineLanded, k24_9999: g(PURITY.k24_9999), k24_999: g(PURITY.k24_999), mcx995: g(PURITY.mcx995), k22_916: g(PURITY.k22_916), mcx995_10g: g(PURITY.mcx995) * 10 };
  }

  // ---------- market clock ----------
  function usDST(ms) { const d = new Date(ms), y = d.getUTCFullYear(); const nthSun = (m, n) => { const x = new Date(Date.UTC(y, m, 1)); const off = (7 - x.getUTCDay()) % 7; return Date.UTC(y, m, 1 + off + 7 * (n - 1)); }; return ms >= nthSun(2, 2) + 7 * 3600e3 && ms < nthSun(10, 1) + 6 * 3600e3; }
  // CME Globex gold: Sun 18:00 – Fri 17:00 New York time, daily break 17:00–18:00
  function comexOpen(ms) { const et = new Date(ms + (usDST(ms) ? -4 : -5) * 3600e3), dw = et.getUTCDay(), h = et.getUTCHours(); if (dw === 6) return false; if (dw === 5 && h >= 17) return false; if (dw === 0 && h < 18) return false; return h !== 17; }
  function openHours(t0, t1) { let n = 0; for (let t = t0; t < t1; t += 15 * 60e3) if (comexOpen(t)) n += 0.25; return n; }
  const istMidnight = ms => { const i = new Date(ms + IST_MS); return Date.UTC(i.getUTCFullYear(), i.getUTCMonth(), i.getUTCDate()) - IST_MS; };
  const isWeekdayIST = ms => ![0, 6].includes(new Date(ms + IST_MS).getUTCDay());
  // MCX session: 09:00 → 23:30 (US summer) / 23:55 (US winter) IST. Exchange holidays not modelled.
  const mcxCloseOf = dayMs => dayMs + (usDST(dayMs + 12 * 3600e3) ? 23.5 : 23 + 55 / 60) * 3600e3;
  function nextMcxOpen(now) { let d = istMidnight(now) + 9 * 3600e3; while (d <= now || !isWeekdayIST(d)) d += 86400e3; return d; }
  function nextMcxClose(now) { let m = istMidnight(now); for (;;) { const c = mcxCloseOf(m); if (isWeekdayIST(m) && c > now) return c; m += 86400e3; } }
  // Forecast to any future instant: mean and sigma scale with COMEX trading hours actually elapsed (23 h ≈ 1 session).
  function forecastTo(now, targetMs, fc) { const h = openHours(now, targetMs), f = h / 23; const m = fc.r * Math.min(f, 1) + (fc.mu || 0) * Math.max(f - 1, 0), s = fc.sigma * Math.sqrt(f); return { hours: h, m, s, factor: x => ({ mid: x * Math.exp(m), lo68: x * Math.exp(m - s), hi68: x * Math.exp(m + s), lo95: x * Math.exp(m - 1.96 * s), hi95: x * Math.exp(m + 1.96 * s) }) }; }

  // Walk-forward check of the "next MCX open" band on real 30-min bars: anchor = last bar before the prior weekday's IST midnight.
  function morningCheck(m30, daily, wfRows, now) {
    const M = m30.filter(b => b.closeT < now), byT = new Map(M.map(b => [b.t, b]));
    const sigByDate = new Map(wfRows.map(r => [daily[r.t].date, r.sigma])), out = [];
    for (const b of M) {
      const ist = new Date(b.t + IST_MS); if (ist.getUTCHours() !== 9 || ist.getUTCMinutes() !== 0 || !isWeekdayIST(b.t)) continue;
      let a = b.t - 9.5 * 3600e3; while (!isWeekdayIST(a)) a -= 86400e3;
      const A = byT.get(a); if (!A) continue; const sig = sigByDate.get(istDate(a)); if (!sig) continue;
      const h = openHours(A.closeT + 1, b.t), s = sig * Math.sqrt(h / 23), r = Math.log(b.o / A.c);
      out.push({ date: istDate(b.t), t: b.t, anchorT: a, anchorUsd: A.c, openUsd: b.o, r, s, err: Math.abs(Math.exp(r) - 1) });
    }
    if (!out.length) return null;
    return { n: out.length, cov: out.filter(x => Math.abs(x.r) <= x.s).length / out.length, cov95: out.filter(x => Math.abs(x.r) <= 1.96 * x.s).length / out.length, mae: mean(out.map(x => x.err)), from: out[0].date, rows: out };
  }

  // Prediction success on any price series. rows: [{ prev, pred, act, lo, hi }] (same units, e.g. 22K ₹/g)
  function successStats(rows) {
    const R = rows.filter(x => [x.prev, x.pred, x.act, x.lo, x.hi].every(Number.isFinite));
    if (!R.length) return null;
    const share = f => R.filter(f).length / R.length, dirRows = R.filter(x => x.pred !== x.prev && x.act !== x.prev);
    return {
      n: R.length,
      band68: share(x => x.act >= x.lo && x.act <= x.hi),
      within05: share(x => Math.abs(x.pred / x.act - 1) <= 0.005),
      within1: share(x => Math.abs(x.pred / x.act - 1) <= 0.01),
      direction: dirRows.length ? dirRows.filter(x => Math.sign(x.pred - x.prev) === Math.sign(x.act - x.prev)).length / dirRows.length : null,
      mape: mean(R.map(x => Math.abs(x.pred / x.act - 1))),
      maeAbs: mean(R.map(x => Math.abs(x.pred - x.act))),
    };
  }

  // India gold import duty (BCD + AIDC [+SWS]) by effective date; from the last entry on, `current` (config/setting) applies.
  const DUTY_SCHEDULE = [['2021-02-02', 10.75], ['2022-06-30', 15], ['2024-07-24', 6], ['2026-05-13', null]];
  const dutyAt = (d, current = 15) => { let v = null; for (const [k, x] of DUTY_SCHEDULE) if (d >= k) v = x === null ? current : x; return v; };

  return { DUTY_SCHEDULE, dutyAt, successStats, morningCheck, PURITY, GST, rates, usDST, comexOpen, openHours, istMidnight, isWeekdayIST, mcxCloseOf, nextMcxOpen, nextMcxClose, forecastTo, solve, ridgeFit, OZ_G, IST_MS, mean, std, quantile, sma, ema, rsi, macd, bollinger, atr, ewmaVol, drawdown, rollStd, parseKlines, parseFx, fxLookup, buildDaily, walkForward, scoreModels, sessionMatrix, scorecard, MODELS, istDate, istDow, istHour, clamp };
})();
if (typeof module !== 'undefined') module.exports = GE;
