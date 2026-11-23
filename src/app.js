/* AurumCast app — fetches real data in the browser, runs GE engine, renders ECharts. */
(() => {
const $ = id => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem('aurum.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('aurum.' + k, JSON.stringify(v)); } catch {} },
};
const S = { k22Kind: 'close', k22N: 90, gMode: 'mcx', theme: store.get('theme', 'aurum'), duty: store.get('duty', 15), prem: store.get('prem', 0), hours: store.get('hours', 2000), auto: store.get('auto', true), hrN: 168, hrOv: 'bb', dN: 260, coneH: 20, hm: 'abs' };
const D = { ticks: [], err: {} };
const C = {};
const OZ = GE.OZ_G;
// India gold import duty (BCD + AIDC [+SWS]) by effective date. From 13 May 2026 the user-editable setting applies.
const DUTY = GE.DUTY_SCHEDULE;
const dutyAt = d => GE.dutyAt(d, S.duty);
const BIN = 'https://data-api.binance.vision/api/v3/klines?symbol=PAXGUSDT';
const SRC = {
  bin: 'https://data-api.binance.vision', spot: 'https://api.gold-api.com/price/XAU',
  fx2: 'https://api.frankfurter.dev/v2/rates?base=USD&quotes=INR&from=2019-09-01', fx1: 'https://api.frankfurter.dev/v1/2019-09-01..?base=USD&symbols=INR',
  er: 'https://open.er-api.com/v6/latest/USD',
};

// ---------- formatting ----------
const inr = (v, d = 0) => (v == null || !isFinite(v) ? '—' : '₹' + v.toLocaleString('en-IN', { maximumFractionDigits: d, minimumFractionDigits: d }));
const usd = (v, d = 2) => (v == null || !isFinite(v) ? '—' : '$' + v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }));
const pct = (v, d = 2, sign = true) => (v == null || !isFinite(v) ? '—' : (sign && v > 0 ? '+' : '') + (v * 100).toFixed(d) + '%');
const cls = v => (v > 0 ? 'up' : v < 0 ? 'dn' : '');
const istStr = (t, withDate = true) => { const d = new Date(t + GE.IST_MS); const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()]; const hm = String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0'); return withDate ? `${d.getUTCDate()} ${M} ${hm}` : hm; };
const dLabel = s => { const d = new Date(s + 'T00:00:00Z'); return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' }); };
const conf = k => `<span class="conf ${k[0].toLowerCase()}">${k}</span>`;
const Phi = x => { const t = 1 / (1 + 0.2316419 * Math.abs(x)), y = 0.3989423 * Math.exp(-x * x / 2) * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x > 0 ? 1 - y : y; };
function toast(msg) { const t = $('toast'); t.innerHTML = msg; t.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 7000); }
const nextWeekday = d => { const x = new Date(d + 'T00:00:00Z'); do x.setUTCDate(x.getUTCDate() + 1); while ([0, 6].includes(x.getUTCDay())); return x.toISOString().slice(0, 10); };

// ---------- theme ----------
const PAL = {
  dark: { s: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#0ca30c', '#9085e9', '#e66767'], good: '#0ca30c', bad: '#e66767' },
  light: { s: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'], good: '#008300', bad: '#e34948' },
};
let T = {};
function readTheme() {
  const cs = getComputedStyle(document.documentElement), g = n => cs.getPropertyValue(n).trim();
  const mode = g('--mode') || 'dark';
  T = { mode, tx: g('--tx'), tx2: g('--tx2'), tx3: g('--tx3'), line: g('--line'), acc: g('--acc'), acc2: g('--acc2'), glass: mode === 'dark' ? 'rgba(18,22,36,.88)' : 'rgba(255,255,255,.92)', ...PAL[mode] };
  T.grid = mode === 'dark' ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.07)';
  T.mc = { naive: T.tx3, drift: T.s[0], tsmom: T.s[1], holt: T.s[2], ar5: T.s[4], ridge: T.s[3], ens: T.s[6] };
}
function setTheme(t) {
  S.theme = t; store.set('theme', t); document.documentElement.dataset.theme = t;
  document.querySelectorAll('#themes button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  readTheme(); if (D.ready) renderAll();
}
const ax = (extra = {}) => ({ axisLine: { lineStyle: { color: T.line } }, axisTick: { show: false }, axisLabel: { color: T.tx3, fontSize: 11 }, splitLine: { lineStyle: { color: T.grid } }, ...extra });
const tip = (extra = {}) => ({ trigger: 'axis', backgroundColor: T.glass, borderColor: T.line, textStyle: { color: T.tx, fontSize: 12 }, extraCssText: 'backdrop-filter:blur(12px);border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.3)', axisPointer: { type: 'cross', lineStyle: { color: T.tx3 }, crossStyle: { color: T.tx3 }, label: { backgroundColor: T.mode === 'dark' ? '#2a3046' : '#52514e' } }, ...extra });
const leg = (extra = {}) => ({ top: 0, textStyle: { color: T.tx2, fontSize: 12 }, itemWidth: 14, itemHeight: 3, icon: 'roundRect', ...extra });
function chart(id, opt) {
  const el = $(id); if (!el) return;
  if (C[id] && C[id].__theme !== S.theme) { C[id].dispose(); delete C[id]; }
  if (!C[id]) { C[id] = echarts.init(el, null, { renderer: 'canvas' }); C[id].__theme = S.theme; }
  C[id].setOption({ backgroundColor: 'transparent', animationDuration: 600, textStyle: { fontFamily: 'Inter, system-ui' }, ...opt }, true);
  return C[id];
}
window.addEventListener('resize', () => Object.values(C).forEach(c => c.resize()));

// ---------- data loading ----------
async function getJSON(url, ms = 20000) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, { signal: c.signal, cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); } finally { clearTimeout(t); }
}
async function klinesBack(interval, total, extra = '') {
  let out = [], end = null;
  while (out.length < total) {
    const lim = Math.min(1000, total - out.length);
    const k = await getJSON(`${BIN}&interval=${interval}&limit=${lim}${extra}${end ? '&endTime=' + end : ''}`);
    if (!k.length) break; out = k.concat(out); end = k[0][0] - 1; if (k.length < lim) break;
  }
  return out;
}
async function loadAll() {
  setLive('load', 'Fetching…');
  const [h, d, fx, spot, er, m30] = await Promise.allSettled([
    klinesBack('1h', S.hours), klinesBack('1d', 3000, '&timeZone=5:30'),
    getJSON(SRC.fx2).catch(() => getJSON(SRC.fx1)), getJSON(SRC.spot), getJSON(SRC.er), klinesBack('30m', 4000),
  ]);
  D.err = {};
  if (m30.status === 'fulfilled') D.mRaw = m30.value; else { D.mRaw = null; D.err['30-min'] = m30.reason.message; }
  if (h.status === 'fulfilled') D.hRaw = h.value; else D.err.hourly = h.reason.message;
  if (d.status === 'fulfilled') D.dRaw = d.value; else D.err.daily = d.reason.message;
  if (fx.status === 'fulfilled') D.fxRaw = fx.value; else D.err.fx = fx.reason.message;
  if (spot.status === 'fulfilled' && spot.value && spot.value.price) { D.spot = spot.value; D.ticks.push({ t: Date.parse(spot.value.updatedAt) || Date.now(), p: spot.value.price }); } else D.err.spot = spot.reason ? spot.reason.message : 'no price';
  if (er.status === 'fulfilled' && er.value.rates) D.er = er.value; else D.err.er = 'unavailable';
  D.fetchedAt = Date.now();
  if (!D.hRaw || !D.dRaw || !D.fxRaw) {
    setLive('err', 'Data unavailable');
    $('banner').innerHTML = `<b>Could not load the required live data.</b> ${Object.entries(D.err).map(([k, v]) => `${k}: ${v}`).join(' · ')}. Nothing is shown instead of real data. Check your connection and press <b>Refresh now</b>. (If you opened this inside a sandboxed viewer, download the file and open it directly in Chrome/Edge/Firefox.)`;
    return false;
  }
  return true;
}

// ---------- compute ----------
function compute() {
  const now = Date.now();
  const H = GE.parseKlines(D.hRaw), B = GE.parseKlines(D.dRaw), fx = GE.parseFx(D.fxRaw);
  const hDone = H.filter(b => b.closeT < now);
  D.H = H; D.hDone = hDone; D.fx = fx;
  D.paxgLast = H.at(-1).c;
  D.basis = D.spot ? D.spot.price / D.paxgLast : 1;
  D.fxNow = fx.at(-1)[1]; D.fxDate = fx.at(-1)[0];
  const daily = GE.buildDaily(B, fx, now); D.daily = daily;
  const n = daily.length, lastC = daily.findLastIndex(x => !x.partial);
  D.lastC = lastC; D.partial = daily[n - 1].partial;
  const px = daily.map(x => x.inr), fxr = daily.map((x, i) => (i ? Math.log(x.fx / daily[i - 1].fx) : 0));
  D.px = px;
  D.wf = GE.walkForward(px, fxr, { lastCompleted: lastC });
  D.sc = GE.scoreModels(D.wf.rows, D.wf.ids);
  D.wfU = GE.walkForward(daily.map(x => x.usd), null, { lastCompleted: lastC });
  D.scU = GE.scoreModels(D.wfU.rows, D.wfU.ids);
  const last = D.wf.rows.at(-1);
  D.fc = { r: last.pred.ens, sigma: last.sigma, mu: last.pred.drift, preds: last.pred, w: last.w, anchorDate: daily[n - 1].date };
  D.fc.closeMs = GE.nextMcxClose(now); D.fc.target = GE.istDate(D.fc.closeMs); D.fc.h = GE.forecastTo(now, D.fc.closeMs, D.fc);
  const lu = D.wfU.rows.at(-1); D.fcU = { r: lu.pred.ens, sigma: lu.sigma, mu: lu.pred.drift }; D.fcU.h = GE.forecastTo(now, D.fc.closeMs, D.fcU);
  D.skill = 1 - D.sc.res.ens.theilU; // >0 means beat naive
  D.card = GE.scorecard(daily.map(x => ({ ...x, inr: x.inr })), D.fc, D.sc.res.ens.dm < -1.96 ? D.skill * 50 : 0);
  // hourly vol for flags
  const hr = hDone.map((b, i) => (i ? Math.log(b.c / hDone[i - 1].c) : 0)); D.hr = hr; D.hVol = GE.ewmaVol(hr, 0.94, 48);
  D.session = GE.sessionMatrix(hDone);
  updateLedger();
  morningCheck(now);
  D.ready = true;
}
const spotNow = () => (D.ticks.length ? D.ticks.at(-1).p : D.paxgLast * D.basis);
const MCXP = GE.PURITY.mcx995;
const mcxF = (duty = S.duty) => (1 + duty / 100) * (1 + S.prem / 100) * MCXP; // fine ₹ → MCX 995 incl. duty & calibration
const k10 = (exDuty, duty) => exDuty * D.basis * mcxF(duty); // PAXG-based fine ₹/10g (no duty) → MCX 995 parity ₹/10g
const toMcx = (exDuty, date) => { const du = dutyAt(date); return du == null ? null : k10(exDuty, du); };
const parityNow = () => spotNow() * D.fxNow * 10 / OZ * mcxF();

// ---------- ledger ----------
function updateLedger() {
  const L = store.get('ledger', []); const f = D.fc, P0 = D.px.at(-1);
  if (!L.find(x => x.target === f.target)) {
    const q = f.h.factor(P0); L.push({ target: f.target, made: Date.now(), ex: q.mid, lo: q.lo68, hi: q.hi68, anchor: P0, basis: D.basis });
    while (L.length > 120) L.shift();
  }
  for (const e of L) if (e.actual == null) { const row = D.daily.find((x, i) => x.date === e.target && i <= D.lastC); if (row) e.actual = row.inr; }
  store.set('ledger', L); D.ledger = L;
}


// ---------- COMEX trading clock & next-MCX-open forecast ----------
const { comexOpen, openHours, nextMcxOpen } = GE;
const gramComex = usdOz => GE.rates(usdOz, D.fxNow, S.duty, S.prem / 100).fineIntl;
const gramMcx = usdOz => GE.rates(usdOz, D.fxNow, S.duty, S.prem / 100).mcx995;
function morningCheck(now) { D.mc = D.mRaw ? GE.morningCheck(GE.parseKlines(D.mRaw), D.daily, D.wf.rows, now) : null; }
function renderStrip() {
  if (!D.ready) return;
  const now = Date.now(), sp = spotNow(), gC = gramComex(sp), gM = gramMcx(sp), prevC = D.daily[D.lastC], prevM = toMcx(prevC.inr, prevC.date) / 10, chM = gM / prevM - 1;
  const tgt = nextMcxOpen(now), h = openHours(now, tgt), f = D.fc, mu = f.r * h / 23, s = f.sigma * Math.sqrt(Math.max(h, 0.25) / 23);
  const fM = gM * Math.exp(mu), tD = new Date(tgt + GE.IST_MS), dayName = tD.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const istNow = new Date(now + GE.IST_MS), mcxLive = ![0, 6].includes(istNow.getUTCDay()) && (istNow.getUTCHours() * 60 + istNow.getUTCMinutes()) >= 540 && (istNow.getUTCHours() * 60 + istNow.getUTCMinutes()) < 1435;
  const skipWknd = Math.round((tgt - now) / 3600e3) > 24 + 9;
  $('gComex').innerHTML = inr(gC, 2);
  $('gComexS').innerHTML = `${usd(sp)}/oz × ₹${D.fxNow.toFixed(2)} ÷ 31.1035 g<br>no Indian duty · 10 g ${inr(gC * 10)}`;
  $('gMcx').innerHTML = inr(gM, 2);
  $('gMcxS').innerHTML = `<span class="${cls(chM)}">${pct(chM)}</span> vs ${dLabel(prevC.date)} close · 10 g ${inr(gM * 10)}<br>${mcxLive ? '<span class="tag good">MCX session open</span>' : '<span class="tag">MCX closed now</span>'} ${S.prem ? `calibrated ${S.prem > 0 ? '+' : ''}${S.prem.toFixed(2)}%` : 'import parity incl. ' + S.duty + '% duty'}`;
  $('gNextL').textContent = `MCX open · ${dayName} 09:00 IST · ₹ per gram`;
  $('gNext').innerHTML = `${inr(fM, 2)} <span style="font-size:14px" class="${cls(mu)}">${pct(mu)}</span>`;
  const tgt2 = nextMcxOpen(tgt), h2 = openHours(now, tgt2), mu2 = f.r * h2 / 23, s2 = f.sigma * Math.sqrt(h2 / 23), d2 = new Date(tgt2 + GE.IST_MS).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  D.g2 = { tgt2, fM2: gM * Math.exp(mu2), lo2: gM * Math.exp(mu2 - s2), hi2: gM * Math.exp(mu2 + s2) };
  $('gNextS').innerHTML = `68% range <b>${inr(gM * Math.exp(mu - s), 0)} – ${inr(gM * Math.exp(mu + s), 0)}</b>${skipWknd ? '<br>Weekend: MCX shut Sat/Sun' : ''} · ${h.toFixed(1)} COMEX trading h to go<br>Following open <b>${d2} 09:00</b>: ${inr(D.g2.fM2, 0)} (68% ${inr(D.g2.lo2, 0)}–${inr(D.g2.hi2, 0)})${D.mc ? `<br>Check: band held ${(D.mc.cov * 100).toFixed(0)}% of ${D.mc.n} past mornings` : ''}`;
  // little graph
  const mode = S.gMode, conv = mode === 'mcx' ? gramMcx : gramComex, H = D.H.slice(-72);
  const hist = H.map(b => [b.closeT + 1 > now ? now : b.closeT + 1, conv(b.c * D.basis)]); hist.push([now, conv(sp)]);
  const base = conv(sp), cone = [], step = Math.max(15 * 60e3, (D.g2.tgt2 - now) / 96);
  const cAt = t => { const hh = openHours(now, t), m = f.r * hh / 23, ss = f.sigma * Math.sqrt(hh / 23); return { t, m: base * Math.exp(m), lo: base * Math.exp(m - ss), hi: base * Math.exp(m + ss) }; };
  for (let t = now; t < D.g2.tgt2; t += step) cone.push(cAt(t)); cone.push(cAt(tgt)); cone.push(cAt(D.g2.tgt2)); cone.sort((x, y) => x.t - y.t);
  const p1 = cAt(tgt), p2 = cAt(D.g2.tgt2), lbl = t => new Date(t + GE.IST_MS).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }) + ' 09:00';
  chart('cGram', {
    grid: { left: 56, right: 14, top: 18, bottom: 22 },
    tooltip: tip({ axisPointer: { type: 'line', lineStyle: { color: T.tx3 } }, formatter: ps => { const p = ps.find(q => q.seriesName === 'Price') || ps.find(q => q.seriesName === 'Forecast'); if (!p) return ''; const t = p.value[0], isF = p.seriesName === 'Forecast'; const c = isF ? cone.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a)) : null; return `<b>${istStr(t)} IST</b><br>${isF ? 'Projected' : mode === 'mcx' ? 'MCX parity' : 'COMEX in ₹'} <b>${inr(p.value[1], 2)}/g</b>${c ? `<br>68%: ${inr(c.lo, 0)} – ${inr(c.hi, 0)}` : ''}`; } }),
    xAxis: ax({ type: 'time', axisLabel: { color: T.tx3, fontSize: 10, formatter: v => new Date(v + GE.IST_MS).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', timeZone: 'UTC' }) }, splitLine: { show: false } }),
    yAxis: ax({ scale: true, splitNumber: 3, axisLabel: { color: T.tx3, fontSize: 10, formatter: v => '₹' + v.toLocaleString('en-IN', { maximumFractionDigits: 0 }) } }),
    series: [
      { name: 'lo', type: 'line', stack: 'band', data: cone.map(c => [c.t, c.lo]), symbol: 'none', lineStyle: { opacity: 0 }, tooltip: { show: false } },
      { name: '68% band', type: 'line', stack: 'band', data: cone.map(c => [c.t, c.hi - c.lo]), symbol: 'none', lineStyle: { opacity: 0 }, areaStyle: { color: T.s[0], opacity: 0.22 }, tooltip: { show: false } },
      { name: 'Price', type: 'line', data: hist, symbol: 'none', smooth: 0.2, lineStyle: { width: 2, color: T.acc }, areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: T.acc + '44' }, { offset: 1, color: T.acc + '00' }]) },
        markLine: { symbol: 'none', silent: true, lineStyle: { color: T.tx3, type: 'dotted' }, label: { color: T.tx3, fontSize: 10, formatter: 'now' }, data: [{ xAxis: now }] } },
      { name: 'Forecast', type: 'line', data: cone.map(c => [c.t, c.m]), symbol: 'none', lineStyle: { width: 2, type: 'dashed', color: T.s[0] },
        markPoint: { symbol: 'circle', symbolSize: 10, itemStyle: { color: T.s[0], borderColor: T.tx, borderWidth: 1.5 }, label: { show: true, color: T.tx, fontSize: 10.5, fontWeight: 600 }, data: [{ coord: [p1.t, p1.m], label: { position: 'top', formatter: () => `${lbl(p1.t)}\n${inr(p1.m, 0)}` } }, { coord: [p2.t, p2.m], label: { position: 'left', formatter: () => `${lbl(p2.t)}  ${inr(p2.m, 0)}` } }] } },
    ],
  });
}


const GRADES = [['24K · 99.99% (999.9 bar/coin)', 'k24_9999', true], ['24K · 99.9% (999)', 'k24_999', true], ['MCX Gold · 99.5% (995)', 'mcx995', false], ['22K · 91.6% (916 jewellery)', 'k22_916', true], ['International fine gold (COMEX, no Indian duty)', 'fineIntl', false]];
function renderPurity() {
  if (!D.ready) return;
  const now = Date.now(), R = GE.rates(spotNow(), D.fxNow, S.duty, S.prem / 100), o = GE.forecastTo(now, nextMcxOpen(now), D.fc), c = GE.forecastTo(now, D.fc.closeMs, D.fc);
  const prev = D.daily[D.lastC], prevFine = (prev.inr / 10) * D.basis * (1 + S.duty / 100) * (1 + S.prem / 100), ch = R.fineLanded / prevFine - 1;
  const oL = istStr(nextMcxOpen(now)), cL = istStr(D.fc.closeMs);
  $('purSub').innerHTML = `Live ${istStr(now)} IST · <span class="${cls(ch)}">${pct(ch)}</span> vs ${dLabel(prev.date)} close · USD/INR ${D.fxNow.toFixed(2)}`;
  const cell = (g, x) => { const q = g.factor(x); return `<td class="n">${inr(q.mid, 0)}<div style="color:${T.tx3};font-size:11px">${inr(q.lo68, 0)} – ${inr(q.hi68, 0)}</div></td>`; };
  $('tPurity').innerHTML = `<tr><th>Grade</th><th class="n">Today ₹/g</th><th class="n">₹/10 g</th><th class="n">+3% GST ₹/g</th><th class="n">MCX open ${oL} · ₹/g</th><th class="n">Session close ${cL} · ₹/g</th></tr>` +
    GRADES.map(([n, k, gst]) => `<tr${k === 'k24_9999' ? ` style="background:${T.acc}14"` : ''}><td><b>${n}</b></td><td class="n" style="font-size:14px;font-weight:600">${inr(R[k], 2)}</td><td class="n">${inr(R[k] * 10, 0)}</td><td class="n">${gst ? inr(R[k] * (1 + GE.GST), 2) : '—'}</td>${cell(o, R[k])}${cell(c, R[k])}</tr>`).join('');
}


// ---------- 22K · 1 gram: rates, predictions, and prediction success ----------
function k22Rows(kind) {
  const P = GE.PURITY.k22_916, prem = 1 + S.prem / 100, fxAt = GE.fxLookup(D.fx);
  if (kind === 'close') return D.wf.rows.filter(r => r.actual !== null).map(r => {
    const d = D.daily[r.t + 1].date, du = dutyAt(d); if (du == null) return null;
    const f = D.basis * (1 + du / 100) * prem * P / 10, prev = D.px[r.t] * f;
    return { date: d, prev, pred: prev * Math.exp(r.pred.ens), act: D.px[r.t + 1] * f, lo: prev * Math.exp(r.pred.ens - r.sigma), hi: prev * Math.exp(r.pred.ens + r.sigma) };
  }).filter(Boolean);
  if (kind === 'open') {
    if (!D.mc) return [];
    const byDate = new Map(D.wf.rows.map(r => [D.daily[r.t].date, r]));
    return D.mc.rows.map(x => {
      const ad = GE.istDate(x.anchorT), w = byDate.get(ad), du = dutyAt(x.date), fx = fxAt(x.date); if (!w || du == null || !fx) return null;
      const f = D.basis * fx / OZ * (1 + du / 100) * prem * P, prev = x.anchorUsd * f, k = (x.s / w.sigma) ** 2, m = w.pred.ens * k;
      return { date: x.date, prev, pred: prev * Math.exp(m), act: x.openUsd * f, lo: prev * Math.exp(m - x.s), hi: prev * Math.exp(m + x.s) };
    }).filter(Boolean);
  }
  return (D.ledger || []).filter(e => e.actual != null).map(e => {
    const du = dutyAt(e.target) ?? S.duty, f = (e.basis || D.basis) * (1 + du / 100) * prem * P / 10;
    return { date: e.target, prev: (e.anchor ?? e.ex) * f, pred: e.ex * f, act: e.actual * f, lo: e.lo * f, hi: e.hi * f };
  });
}
function renderK22() {
  if (!D.ready) return;
  const now = Date.now(), sp = spotNow(), R = GE.rates(sp, D.fxNow, S.duty, S.prem / 100), Ri = GE.rates(sp, D.fxNow, 0, 0);
  const comex22 = Ri.fineIntl * GE.PURITY.k22_916, mcx22 = R.k22_916, prev = D.daily[D.lastC];
  const prev22 = (prev.inr / 10) * D.basis * (1 + S.duty / 100) * (1 + S.prem / 100) * GE.PURITY.k22_916, ch = mcx22 / prev22 - 1;
  const tgts = [['Next MCX open', nextMcxOpen(now)], ['Session close', D.fc.closeMs], ['Following MCX open', nextMcxOpen(nextMcxOpen(now))]].sort((p, q) => p[1] - q[1]);
  $('k22Sub').innerHTML = `Live ${istStr(now)} IST · spot ${usd(sp)} · USD/INR ${D.fxNow.toFixed(2)} · purity 91.6%`;
  $('k22Rates').innerHTML =
    `<div class="k22big hero"><div class="l">22K 1 g · MCX-linked (incl. ${S.duty}% duty)</div><div class="v">${inr(mcx22, 2)}</div><div class="s" style="font-size:12.5px;color:${T.tx2}"><span class="${cls(ch)}">${pct(ch)}</span> vs ${dLabel(prev.date)} close · with 3% GST <b>${inr(mcx22 * 1.03, 2)}</b></div></div>` +
    `<div class="k22big"><div class="l">22K 1 g · COMEX (international, no Indian duty)</div><div class="v">${inr(comex22, 2)}</div><div class="s" style="font-size:12.5px;color:${T.tx2}">${usd(sp)}/oz × ₹${D.fxNow.toFixed(2)} ÷ 31.1035 × 0.916 · duty gap ${inr(mcx22 - comex22, 0)}</div></div>` +
    `<table><tr><th>Prediction · 22K 1 g</th><th class="n">₹/g</th><th class="n">68% range</th></tr>` +
    tgts.map(([n, t]) => { const g = GE.forecastTo(now, t, D.fc), q = g.factor(mcx22); return `<tr><td>${n}<div style="color:${T.tx3};font-size:11px">${istStr(t)} IST</div></td><td class="n"><b>${inr(q.mid, 0)}</b><div class="${cls(g.m)}" style="font-size:11px">${pct(g.m)}</div></td><td class="n">${inr(q.lo68, 0)} – ${inr(q.hi68, 0)}</td></tr>`; }).join('') + `</table>`;

  const all = k22Rows(S.k22Kind), rows = S.k22N ? all.slice(-S.k22N) : all, st = GE.successStats(rows), stAll = GE.successStats(all);
  const tile = (lbl, v, sub) => `<div class="st"><span>${lbl}</span><b>${v}</b><span>${sub}</span></div>`, P = v => (v == null ? '—' : (v * 100).toFixed(1) + '%');
  const kindName = { close: 'session closes', open: 'MCX morning opens', live: 'live forecasts' }[S.k22Kind];
  if (!st) {
    $('k22Stats').innerHTML = tile('Predictions scored', '0', S.k22Kind === 'live' ? 'first ones mature after their target time' : 'no data');
    $('k22Note').innerHTML = S.k22Kind === 'live' ? 'The live log scores each forecast this browser saved once its target time has passed. Use <b>Session close</b> or <b>Morning open</b> for the long backtest.' : '';
    chart('cK22', { title: { text: 'No scored predictions yet', left: 'center', top: 'middle', textStyle: { color: T.tx3, fontSize: 13, fontWeight: 400 } } }); chart('cK22Roll', {});
    return;
  }
  $('k22Stats').innerHTML = tile('Inside 68% range', P(st.band68), `target ≈ 68% · all-time ${P(stAll.band68)}`) + tile('Within ±0.5%', P(st.within05), `≈ ±${inr(mcx22 * 0.005, 0)}/g`) + tile('Within ±1%', P(st.within1), `≈ ±${inr(mcx22 * 0.01, 0)}/g`) +
    tile('Direction right', P(st.direction), `always-up baseline ${P(rows.filter(x => x.act > x.prev).length / rows.length)}`) + tile('Avg error', inr(st.mape * mcx22, 0) + '/g', `${(st.mape * 100).toFixed(2)}% · ${st.n} ${kindName}`);
  $('k22Note').innerHTML = `${conf('Certain')}Each prediction was made before its target (evening before for closes, prior MCX close for opens) using only data available then, and is shown at today's purity, duty and calibration settings. "Success" = actual landed inside the predicted 68% range. ${st.band68 >= 0.6 && st.band68 <= 0.8 ? 'The range is well calibrated.' : st.band68 > 0.8 ? 'The range is a little wide (conservative).' : 'The range has been too narrow lately: treat it with extra caution.'}`;
  const x = rows.map(r => r.date), lo = rows.map(r => r.lo), hh = rows.map(r => r.hi - r.lo);
  chart('cK22', {
    legend: leg({ data: ['Actual 22K ₹/g', 'Predicted 22K ₹/g', '68% range'] }), grid: { left: 62, right: 12, top: 32, bottom: 26 },
    tooltip: tip({ formatter: ps => { const i = ps[0].dataIndex, r = rows[i], ok = r.act >= r.lo && r.act <= r.hi; return `<b>${dLabel(r.date)}</b><br>Predicted ${inr(r.pred, 0)} (${inr(r.lo, 0)}–${inr(r.hi, 0)})<br>Actual <b>${inr(r.act, 0)}</b> · error ${pct(r.pred / r.act - 1)}<br>Previous ${inr(r.prev, 0)}<br><span style="color:${ok ? T.good : T.bad}">${ok ? '✓ inside range' : '✗ outside range'}</span>`; } }),
    xAxis: ax({ type: 'category', data: x, axisLabel: { color: T.tx3, formatter: dLabel } }), yAxis: ax({ scale: true, axisLabel: { color: T.tx3, formatter: v => '₹' + v.toLocaleString('en-IN') } }),
    dataZoom: [{ type: 'inside' }],
    series: [{ name: 'lo', type: 'line', stack: 'b', data: lo, symbol: 'none', lineStyle: { opacity: 0 }, tooltip: { show: false } },
      { name: '68% range', type: 'line', stack: 'b', data: hh, symbol: 'none', lineStyle: { opacity: 0 }, areaStyle: { color: T.s[0], opacity: 0.18 }, itemStyle: { color: T.s[0] } },
      { name: 'Predicted 22K ₹/g', type: 'line', data: rows.map(r => r.pred), symbol: 'none', lineStyle: { width: 1.5, color: T.s[0], type: 'dashed' }, itemStyle: { color: T.s[0] } },
      { name: 'Actual 22K ₹/g', type: 'line', data: rows.map(r => ({ value: r.act, itemStyle: { color: r.act >= r.lo && r.act <= r.hi ? T.good : T.bad } })), symbol: 'circle', showAllSymbol: true, symbolSize: rows.length > 120 ? 4 : 7, lineStyle: { width: 2, color: T.acc }, itemStyle: { borderColor: T.glass, borderWidth: 1 } }],
  });
  const W = Math.min(30, Math.max(5, Math.floor(rows.length / 4))), rx = [], rb = [], r1 = [];
  for (let i = W; i <= rows.length; i++) { const s2 = GE.successStats(rows.slice(i - W, i)); rx.push(rows[i - 1].date); rb.push(+(s2.band68 * 100).toFixed(1)); r1.push(+(s2.within1 * 100).toFixed(1)); }
  chart('cK22Roll', {
    title: { text: `Rolling ${W}-prediction success`, left: 0, top: 0, textStyle: { color: T.tx2, fontSize: 12, fontWeight: 500 } },
    legend: leg({ top: 18, data: ['Inside 68% range', 'Within ±1%'] }), grid: { left: 40, right: 10, top: 50, bottom: 26 }, tooltip: tip({ valueFormatter: v => v + '%' }),
    xAxis: ax({ type: 'category', data: rx, axisLabel: { color: T.tx3, formatter: dLabel } }), yAxis: ax({ min: 0, max: 100, axisLabel: { color: T.tx3, formatter: '{value}%' } }),
    series: [{ name: 'Inside 68% range', type: 'line', data: rb, symbol: 'none', lineStyle: { width: 2, color: T.s[2] }, itemStyle: { color: T.s[2] }, markLine: { symbol: 'none', silent: true, data: [{ yAxis: 68 }], lineStyle: { color: T.tx3, type: 'dashed' }, label: { formatter: '68% target', color: T.tx3, position: 'insideStartTop', fontSize: 10 } } },
      { name: 'Within ±1%', type: 'line', data: r1, symbol: 'none', lineStyle: { width: 2, color: T.s[1] }, itemStyle: { color: T.s[1] } }],
  });
}

// ---------- render ----------
function setLive(s, txt) { $('liveDot').className = 'dot ' + (s === 'ok' ? 'live' : s === 'err' ? 'err' : ''); $('liveTxt').textContent = txt; }
function renderAll() {
  renderStrip(); renderPurity(); renderK22(); renderBanner(); renderKpis(); renderHourly(); renderHourTable(); renderTicks(); renderForecast(); renderModels();
  renderProof(); renderDaily(); renderOsc(); renderRisk(); renderHeat(); renderDecomp(); renderInvest(); renderLedger(); renderSources();
  if (window.AurumBridge) {
    window.dispatchEvent(new CustomEvent('aurum:update', { detail: window.AurumBridge.snapshot() }));
  }
}
/* Read-only, explicitly scoped market-data bridge for the React component tree.
   The original GE math, browser ledger, validation, and live polling remain the source of truth. */
window.AurumBridge = {
  snapshot() {
    if (!D.ready) return { ready: false, errors: { ...D.err } };
    const now = Date.now(), sp = spotNow(), rates = GE.rates(sp, D.fxNow, S.duty, S.prem / 100);
    const target = nextMcxOpen(now), trh = openHours(now, target);
    const m = D.fc.r * trh / 23, sig = D.fc.sigma * Math.sqrt(Math.max(trh, .25) / 23);
    const fcOpen = { mid: rates.mcx995 * Math.exp(m), lo68: rates.mcx995 * Math.exp(m-sig), hi68: rates.mcx995 * Math.exp(m+sig), target };
    const close = D.fc.h.factor(parityNow());
    const h = D.H.slice(-720);
    const last = D.hDone.at(-24), change = last ? sp / (last.c * D.basis) - 1 : null;
    const old = D.daily[D.lastC], prevMcx = toMcx(old.inr, old.date)/10;
    const validation = D.sc?.res?.ens || {};
    return {
      ready: true, fetchedAt: D.fetchedAt, now, spot: sp, spotChange24h: change,
      fx: D.fxNow, fxDate: D.fxDate, duty: S.duty, calibration: S.prem,
      rates, mcxChange: rates.mcx995 / prevMcx - 1,
      open: fcOpen, close: { mid: close.mid, lo68: close.lo68, hi68: close.hi68, lo95: close.lo95, hi95: close.hi95, target: D.fc.closeMs },
      candle: h.map(b => ({ t: b.t, o: b.o * D.basis, h: b.h * D.basis, l: b.l * D.basis, c: b.c * D.basis, v: b.v })),
      score: D.card.score, factors: D.card.factors.map(f => ({ name: f.k, score: f.v, weight: f.w, reason: f.why })),
      accuracy: { theilU: validation.theilU, dm: validation.dm, coverage: validation.coverage, n: validation.n },
      openValidation: D.mc ? { n: D.mc.n, coverage: D.mc.cov } : null,
      ledger: (D.ledger || []).map(e => ({ target: e.target, predicted: e.ex, actual: e.actual ?? null, lo68: e.lo, hi68: e.hi })),
      auto: S.auto, hours: S.hours, errors: { ...D.err },
      sourceNotice: 'USD spot (gold-api.com), PAXG candles (Binance), ECB FX; MCX is calculated import parity, not an exchange tick.'
    };
  },
  refresh() { fullRefresh(); },
  setTheme(name) { if (['aurum','obsidian','rose','ivory'].includes(name)) setTheme(name); },
  configure({ duty, hours, auto, calibration }) {
    if (duty != null && Number.isFinite(+duty) && +duty >= 0 && +duty < 50) { S.duty = +duty; store.set('duty',S.duty); $('sDuty').value=S.duty; }
    if (calibration === 0) { S.prem=0; store.set('prem',0); calTxt(); }
    if (auto != null) { S.auto=!!auto; store.set('auto',S.auto); $('sAuto').checked=S.auto; if(S.auto) scheduleNext(); }
    if (hours != null && [1000,2000,3000].includes(+hours) && S.hours!==+hours) { S.hours=+hours; store.set('hours',S.hours); $('sHours').value=String(S.hours); fullRefresh(); return; }
    if (D.ready) renderAll();
  },
  clearLedger() { store.set('ledger', []); if(D.ready){ updateLedger(); renderLedger(); renderAll(); } },
  calibrate(mcxTenGrams) {
    const a=+mcxTenGrams;
    if (!D.ready || !Number.isFinite(a) || a<=0) return false;
    const raw=spotNow()*D.fxNow*10/OZ*(1+S.duty/100)*MCXP;
    S.prem=(a/raw-1)*100; store.set('prem',S.prem); calTxt();renderAll();return true;
  }
};
function renderBanner() {
  const bp = (D.basis - 1) * 100, errs = Object.keys(D.err);
  $('banner').innerHTML = `${conf('Certain')}<b>Real data only, with one honest substitution.</b> COMEX gold futures (GC) and MCX have no free feed a browser is allowed to read, so the hourly series is <b>PAXG/USDT on Binance</b> (each token is backed by one fine troy ounce of LBMA gold and trades 24/7). It is scaled to live <b>XAU spot</b> (gold-api.com), currently a ${bp >= 0 ? '+' : ''}${bp.toFixed(2)}% adjustment, and converted with the ECB USD/INR fix. MCX figures are <b>import parity for 995 gold</b> (the MCX Gold contract grade) = spot × USD/INR ÷ 31.1035 g × 0.995 × (1 + ${S.duty}% duty)${S.prem ? ` × (1 ${S.prem >= 0 ? '+' : '−'} ${Math.abs(S.prem).toFixed(2)}% your MCX calibration)` : ''}. ${S.prem ? '' : 'Enter a live MCX price in <b>Settings</b> to calibrate to your exchange quote.'}${errs.length ? ` <span class="tag warn">Partial: ${errs.join(', ')} unavailable</span>` : ''}`;
}
function kpi(l, v, s, hero) { return `<div class="kpi glass${hero ? ' hero' : ''}"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`; }
function verdictOf(score) {
  if (score >= 0.25) return ['Accumulate', 'good']; if (score >= 0.05) return ['Accumulate gradually', 'good'];
  if (score > -0.05) return ['Neutral — stagger buys', 'warn']; if (score > -0.25) return ['Wait / small tranches', 'warn']; return ['Wait for stabilisation', 'bad'];
}
function renderKpis() {
  const sp = spotNow(), h24 = D.hDone.at(-24), ch24 = h24 ? sp / (h24.c * D.basis) - 1 : null;
  const pn = parityNow(), prevClose = toMcx(D.px[D.lastC], D.daily[D.lastC].date), chD = pn / prevClose - 1;
  const f = D.fc, P0 = k10(D.px.at(-1), S.duty), q = f.h.factor(P0), fv = q.mid;
  const e = D.sc.res.ens, [vt, vc] = verdictOf(D.card.score);
  $('kpis').innerHTML =
    kpi('XAU spot · live', usd(sp), `<span class="${cls(ch24)}">${pct(ch24)}</span> vs 24h ago`) +
    kpi('MCX 995 parity now · ₹/10g', inr(pn), `<span class="${cls(chD)}">${pct(chD)}</span> vs ${dLabel(D.daily[D.lastC].date)} close`, true) +
    kpi(`Forecast · ${dLabel(f.target)}`, inr(fv), `<span class="${cls(f.h.m)}">${pct(f.h.m)}</span> · 68% ${inr(q.lo68)}–${inr(q.hi68)}`) +
    kpi('USD / INR', D.fxNow.toFixed(2), `ECB fix ${dLabel(D.fxDate)}${D.er ? ` · live ref ${D.er.rates.INR.toFixed(2)}` : ''}`) +
    kpi('Investor signal', `${(D.card.score * 100).toFixed(0)}`, `<span class="tag ${vc}">${vt}</span>`) +
    kpi('Model edge vs random walk', `${((1 - e.theilU) * 100).toFixed(2)}%`, `DM ${e.dm.toFixed(2)} · ${Math.abs(e.dm) > 1.96 ? 'significant' : 'not significant'}`);
  $('liveTxt').textContent = `Live ${istStr(Date.now(), false)} IST`;
}

function renderHourly() {
  const all = D.H, n = S.hrN ? Math.min(S.hrN, all.length) : all.length, H = all.slice(-n - 60), b = D.basis;
  const c = H.map(x => x.c * b), bb = GE.bollinger(c, 20, 2), m20 = GE.sma(c, 20), m50 = GE.sma(c, 50);
  const off = H.length - n, cut = a => a.slice(off), x = cut(H.map(h => istStr(h.t)));
  const k = cut(H.map(h => [h.o * b, h.c * b, h.l * b, h.h * b])), v = cut(H.map(h => ({ value: h.v, itemStyle: { color: (h.c >= h.o ? T.good : T.bad) + '88' } })));
  const ov = [];
  if (S.hrOv === 'bb') ov.push({ name: 'Bollinger upper', type: 'line', data: cut(bb.up), symbol: 'none', lineStyle: { width: 1, color: T.s[0], type: 'dashed' } }, { name: 'Bollinger mid (20h)', type: 'line', data: cut(bb.mid), symbol: 'none', lineStyle: { width: 1.5, color: T.s[0] } }, { name: 'Bollinger lower', type: 'line', data: cut(bb.lo), symbol: 'none', lineStyle: { width: 1, color: T.s[0], type: 'dashed' } });
  if (S.hrOv === 'ma') ov.push({ name: 'SMA 20h', type: 'line', data: cut(m20), symbol: 'none', lineStyle: { width: 1.5, color: T.s[0] } }, { name: 'SMA 50h', type: 'line', data: cut(m50), symbol: 'none', lineStyle: { width: 1.5, color: T.s[1] } });
  chart('cHourly', {
    legend: leg({ data: ['Gold (hourly)', ...ov.map(o => o.name).filter(n => !/upper|lower/.test(n))] }),
    tooltip: tip({ formatter: ps => { const p = ps.find(q => q.seriesType === 'candlestick'); if (!p) return ''; const [, o, cl, l, h] = p.data; return `<b>${p.axisValue} IST</b><br>Open ${usd(o)}<br>High ${usd(h)}<br>Low ${usd(l)}<br>Close <b>${usd(cl)}</b> <span style="color:${cl >= o ? T.good : T.bad}">${pct(cl / o - 1)}</span><br>₹/10g parity ${inr(cl * D.fxNow * 10 / OZ * mcxF())}`; } }),
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
    grid: [{ left: 64, right: 16, top: 34, height: '66%' }, { left: 64, right: 16, top: '82%', height: '12%' }],
    xAxis: [ax({ type: 'category', data: x, boundaryGap: true, axisLabel: { color: T.tx3, fontSize: 11 } }), ax({ type: 'category', gridIndex: 1, data: x, axisLabel: { show: false } })],
    yAxis: [ax({ scale: true, axisLabel: { color: T.tx3, formatter: v => '$' + v.toFixed(0) } }), ax({ gridIndex: 1, scale: true, splitNumber: 2, axisLabel: { show: false }, splitLine: { show: false } })],
    dataZoom: [{ type: 'inside', xAxisIndex: [0, 1], start: 0, end: 100 }],
    series: [{ name: 'Gold (hourly)', type: 'candlestick', data: k, itemStyle: { color: T.good, color0: T.bad, borderColor: T.good, borderColor0: T.bad } }, ...ov, { name: 'Volume', type: 'bar', xAxisIndex: 1, yAxisIndex: 1, data: v, barMaxWidth: 6 }],
  });
}
function renderHourTable() {
  const H = D.hDone, b = D.basis, rows = [];
  for (let i = H.length - 1; i >= Math.max(1, H.length - 24); i--) {
    const r = D.hr[i], s = D.hVol[i - 1], flag = s && Math.abs(r) > 2 * s;
    rows.push(`<tr><td>${istStr(H[i].closeT + 1)}</td><td class="n">${usd(H[i].c * b)}</td><td class="n ${cls(r)}">${pct(Math.exp(r) - 1)}</td><td class="n">${inr(H[i].c * b * D.fxNow * 10 / OZ * mcxF())}</td><td>${flag ? `<span class="tag ${r > 0 ? 'good' : 'bad'}">${(r / s).toFixed(1)}σ</span>` : ''}</td></tr>`);
  }
  $('tHourly').innerHTML = `<tr><th>Hour ending (IST)</th><th class="n">Close</th><th class="n">Δ 1h</th><th class="n">₹/10g</th><th></th></tr>` + rows.join('');
}
function renderTicks() {
  const t = D.ticks;
  chart('cTicks', {
    grid: { left: 56, right: 10, top: 8, bottom: 22 }, tooltip: tip({ formatter: p => `${istStr(p[0].value[0])} IST<br><b>${usd(p[0].value[1])}</b>` }),
    xAxis: ax({ type: 'time', axisLabel: { color: T.tx3, fontSize: 10, formatter: v => istStr(v, false) }, splitLine: { show: false } }),
    yAxis: ax({ min: v => Math.floor(v.min - 2), max: v => Math.ceil(v.max + 2), splitNumber: 2, axisLabel: { color: T.tx3, fontSize: 10, formatter: v => '$' + v.toFixed(0) } }),
    series: [{ type: 'line', data: t.map(x => [x.t, x.p]), symbol: t.length < 3 ? 'circle' : 'none', symbolSize: 8, lineStyle: { width: 2, color: T.acc }, itemStyle: { color: T.acc }, areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: T.acc + '55' }, { offset: 1, color: T.acc + '00' }]) } }],
  });
}

function sessions(n) { const out = []; let c = D.fc.closeMs; for (let i = 0; i < n; i++) { out.push(c); c = GE.nextMcxClose(c + 60e3); } return out; }
function coneData(H = S.coneH) {
  const f = D.fc, P0 = k10(D.px.at(-1), S.duty), now = Date.now();
  const out = sessions(H).map(c => { const g = GE.forecastTo(now, c, f), z = 0.674; return { d: GE.istDate(c), ms: c, g, mid: P0 * Math.exp(g.m), b50: [P0 * Math.exp(g.m - z * g.s), P0 * Math.exp(g.m + z * g.s)], b68: [P0 * Math.exp(g.m - g.s), P0 * Math.exp(g.m + g.s)], b95: [P0 * Math.exp(g.m - 1.96 * g.s), P0 * Math.exp(g.m + 1.96 * g.s)] }; });
  return { P0, out };
}
function renderForecast() {
  const f = D.fc, { P0, out } = coneData(), fv = out[0];
  $('fcSub').innerHTML = `${conf('Likely')}The forecast is for the <b>close of the next MCX session</b> (${dLabel(f.target)}, ${istStr(f.closeMs, false)} IST), anchored on the live price now (${istStr(Date.now())} IST). The ensemble's one-day return and EWMA volatility are scaled by the <b>${f.h.hours.toFixed(1)} COMEX trading hours</b> left until that close, so weekends and the daily COMEX break add no false uncertainty. The cone beyond uses the 250-day drift and widens with √time; it is a range of plausible outcomes, not a target. MCX holidays are not modelled.`;
  $('fcTarget').innerHTML = `Next session close · ${dLabel(f.target)} · MCX 995 · ₹/10g`;
  $('fcBig').innerHTML = `${inr(fv.mid)} <span style="font-size:18px" class="${cls(fv.g.m)}">${pct(fv.g.m)}</span>`;
  $('fcBands').innerHTML = `68% band <b>${inr(fv.b68[0])} – ${inr(fv.b68[1])}</b><br>95% band <b>${inr(fv.b95[0])} – ${inr(fv.b95[1])}</b><br>Anchor (live) ${inr(P0)}`;
  const up = D.fcU.h, PU = spotNow(), qu = up.factor(PU);
  $('fcUsd').innerHTML = `COMEX-equivalent spot at that close: <b>${usd(qu.mid)}</b> (${pct(up.m)}, 68% ${usd(qu.lo68, 0)}–${usd(qu.hi68, 0)})`;
  if (!$('pTarget').value) $('pTarget').value = Math.round(P0 * 1.05 / 100) * 100;
  calcProb();
  const hist = D.daily.slice(0, D.lastC + 1).slice(-60), hx = [...hist.map(x => x.date), 'now'], hy = [...hist.map(x => k10(x.inr, S.duty)), P0];
  const xs = [...hx, ...out.map(o => o.d)], pad = a => [...new Array(hx.length - 1).fill('-'), P0, ...a];
  const band = (k, i) => pad(out.map(o => o[k][i]));
  const stackBase = (k) => band(k, 0), stackH = k => pad(out.map(o => o[k][1] - o[k][0])).map((v, i) => (i === hx.length - 1 ? 0 : v));
  chart('cForecast', {
    legend: leg({ data: ['MCX 995 parity (today’s duty)', 'Forecast path', '95% band', '68% band', '50% band'] }),
    tooltip: tip({ formatter: ps => { const i = ps[0].dataIndex, d = xs[i]; if (i < hx.length) return `<b>${d === 'now' ? 'Now (live)' : dLabel(d)}</b><br>MCX 995 parity ${inr(hy[i])}`; const o = out[i - hx.length]; return `<b>${dLabel(d)}</b> (projection)<br>Centre ${inr(o.mid)}<br>50%: ${inr(o.b50[0])} – ${inr(o.b50[1])}<br>68%: ${inr(o.b68[0])} – ${inr(o.b68[1])}<br>95%: ${inr(o.b95[0])} – ${inr(o.b95[1])}`; } }),
    grid: { left: 78, right: 18, top: 36, bottom: 30 },
    xAxis: ax({ type: 'category', data: xs, boundaryGap: false, axisLabel: { color: T.tx3, formatter: v => (v === 'now' ? 'Now' : dLabel(v)) } }),
    yAxis: ax({ scale: true, axisLabel: { color: T.tx3, formatter: v => '₹' + (v / 1000).toFixed(0) + 'k' } }),
    series: [
      ...[['95% band', 'b95', 0.12], ['68% band', 'b68', 0.18], ['50% band', 'b50', 0.24]].flatMap(([nm, k, a], j) => [
        { name: nm + '_b', type: 'line', stack: 'c' + j, data: stackBase(k), symbol: 'none', lineStyle: { opacity: 0 }, tooltip: { show: false }, legendHoverLink: false },
        { name: nm, type: 'line', stack: 'c' + j, data: stackH(k), symbol: 'none', lineStyle: { opacity: 0 }, areaStyle: { color: T.s[0], opacity: a }, itemStyle: { color: T.s[0] } },
      ]),
      { name: 'MCX 995 parity (today’s duty)', type: 'line', data: [...hy, ...new Array(out.length).fill('-')], symbol: 'none', lineStyle: { width: 2, color: T.acc }, itemStyle: { color: T.acc } },
      { name: 'Forecast path', type: 'line', data: pad(out.map(o => o.mid)), symbol: (v, p) => (p.dataIndex === hx.length ? 'circle' : 'none'), symbolSize: 9, lineStyle: { width: 2, color: T.s[0], type: 'dashed' }, itemStyle: { color: T.s[0], borderColor: T.glass, borderWidth: 2 } },
    ],
  });
}
function calcProb() {
  if (!D.ready) return;
  const K = +$('pTarget').value, h = Math.max(1, Math.min(250, +$('pDays').value || 20)), f = D.fc, P0 = k10(D.px.at(-1), S.duty);
  if (!K) { $('pOut').textContent = ''; return; }
  const g = GE.forecastTo(Date.now(), sessions(h).at(-1), f), p = 1 - Phi((Math.log(K / P0) - g.m) / g.s);
  $('pOut').innerHTML = `${conf('Likely')}Chance the MCX close is above <b>${inr(K)}</b> after ${h} session${h > 1 ? 's' : ''}: <b>${(p * 100).toFixed(1)}%</b> (below: ${((1 - p) * 100).toFixed(1)}%). Log-normal model, current volatility held constant.`;
}
function renderModels() {
  const f = D.fc, P0 = k10(D.px.at(-1), S.duty), res = D.sc.res, hf = Math.min(f.h.hours / 23, 1);
  const rows = D.wf.ids.map(id => {
    const m = GE.MODELS.find(x => x.id === id) || { name: 'Ensemble (inverse-error weighted)', desc: 'Weights each model by 1/MSE over its last 60 out-of-sample calls.' }, r = res[id], p = f.preds[id] ?? f.r;
    const v = id === 'naive' ? '<span class="tag">Benchmark</span>' : r.dm < -1.96 ? '<span class="tag good">Beats naive (significant)</span>' : r.dm < 0 ? '<span class="tag warn">Marginal, not significant</span>' : '<span class="tag bad">Worse than naive</span>';
    return `<tr><td><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${T.mc[id]};margin-right:8px"></span><b>${m.name}</b><div style="color:${T.tx3};font-size:11.5px">${m.desc}</div></td><td class="n ${cls(p)}">${pct(p, 3)}</td><td class="n">${inr(P0 * Math.exp(p * hf))}</td><td class="n">${id === 'ens' ? '—' : (f.w[id] * 100).toFixed(1) + '%'}</td><td class="n">${r.theilU.toFixed(4)}</td><td class="n">${r.hit == null ? '—' : (r.hit * 100).toFixed(1) + '%'}</td><td class="n">${(r.mae * 100).toFixed(3)}%</td><td class="n">${id === 'naive' ? '—' : r.dm.toFixed(2)}</td><td>${v}</td></tr>`;
  });
  $('tModels').innerHTML = `<tr><th>Model</th><th class="n">Next-day call</th><th class="n">₹/10g</th><th class="n">Weight</th><th class="n">Theil U</th><th class="n">Direction hit</th><th class="n">MAE</th><th class="n">DM vs naive</th><th>Verdict</th></tr>` + rows.join('');
}

function renderProof() {
  const sc = D.sc, rows = D.wf.rows.filter(r => r.actual !== null), e = sc.res.ens, first = D.daily[rows[0].t + 1].date, lastD = D.daily[rows.at(-1).t + 1].date;
  $('proofSub').innerHTML = `${conf('Certain')}Every model was re-run day by day from ${dLabel(first)} to ${dLabel(lastD)} (<b>${sc.n.toLocaleString()} sessions</b>), each time seeing only the data that existed that evening, then scored against the real next close. This is the test that decides how much to trust the forecast above.`;
  const last = rows.slice(-260), fac = k10(1, S.duty), xs = last.map(r => D.daily[r.t + 1].date);
  const act = last.map(r => D.px[r.t + 1] * fac), pr = last.map(r => D.px[r.t] * Math.exp(r.pred.ens) * fac), lo = last.map(r => D.px[r.t] * Math.exp(r.pred.ens - r.sigma) * fac), hi = last.map((r, i) => D.px[r.t] * Math.exp(r.pred.ens + r.sigma) * fac - lo[i]);
  chart('cPvA', {
    legend: leg({ data: ['Actual close', 'Predicted (evening before)', '68% band'] }), tooltip: tip({ formatter: ps => { const i = ps[0].dataIndex; return `<b>${dLabel(xs[i])}</b><br>Actual ${inr(act[i])}<br>Predicted ${inr(pr[i])}<br>Error ${pct(pr[i] / act[i] - 1)}`; } }),
    grid: { left: 72, right: 14, top: 34, bottom: 44 }, dataZoom: [{ type: 'inside', start: 60, end: 100 }, { type: 'slider', height: 14, bottom: 6, start: 60, end: 100, borderColor: T.line, textStyle: { color: T.tx3 }, fillerColor: T.acc + '33' }],
    xAxis: ax({ type: 'category', data: xs, axisLabel: { color: T.tx3, formatter: dLabel } }), yAxis: ax({ scale: true, axisLabel: { color: T.tx3, formatter: v => '₹' + (v / 1000).toFixed(0) + 'k' } }),
    series: [{ name: '68%_b', type: 'line', stack: 'b', data: lo, symbol: 'none', lineStyle: { opacity: 0 }, tooltip: { show: false } }, { name: '68% band', type: 'line', stack: 'b', data: hi, symbol: 'none', lineStyle: { opacity: 0 }, areaStyle: { color: T.s[1], opacity: 0.16 }, itemStyle: { color: T.s[1] } },
      { name: 'Actual close', type: 'line', data: act, symbol: 'none', lineStyle: { width: 2, color: T.acc }, itemStyle: { color: T.acc } }, { name: 'Predicted (evening before)', type: 'line', data: pr, symbol: 'none', lineStyle: { width: 1.5, color: T.s[1] }, itemStyle: { color: T.s[1] } }],
  });
  const ids = D.wf.ids.filter(i => i !== 'naive'), names = ids.map(i => (GE.MODELS.find(m => m.id === i) || { name: 'Ensemble' }).name);
  chart('cTheil', {
    tooltip: tip({ trigger: 'item', formatter: p => `<b>${names[p.dataIndex]}</b><br>Theil U ${sc.res[ids[p.dataIndex]].theilU.toFixed(4)}<br>${p.value < 0 ? 'Lower error than' : 'Higher error than'} random walk by ${Math.abs(p.value).toFixed(2)}%<br>DM statistic ${sc.res[ids[p.dataIndex]].dm.toFixed(2)}` }),
    grid: { left: 190, right: 64, top: 28, bottom: 30 },
    xAxis: ax({ type: 'value', axisLabel: { color: T.tx3, formatter: v => v.toFixed(1) + '%' } }), yAxis: ax({ type: 'category', data: names, axisLabel: { color: T.tx2, fontSize: 12 } }),
    series: [{ type: 'bar', barWidth: 14, data: ids.map(i => ({ value: (sc.res[i].theilU - 1) * 100, itemStyle: { color: T.mc[i], borderRadius: 4 } })), label: { show: true, position: 'right', color: T.tx2, fontSize: 11, formatter: p => `DM ${sc.res[ids[p.dataIndex]].dm.toFixed(1)}` }, markLine: { symbol: 'none', silent: true, data: [{ xAxis: 0 }], lineStyle: { color: T.tx3 }, label: { formatter: 'Random walk', color: T.tx3, position: 'start' } } }],
  });
  const W = 60, hx = [], hit = [], upB = [];
  for (let i = W; i <= rows.length; i++) { const s = rows.slice(i - W, i); hx.push(D.daily[s.at(-1).t + 1].date); const dr = s.filter(r => r.pred.ens !== 0 && r.actual !== 0); hit.push(dr.filter(r => Math.sign(r.pred.ens) === Math.sign(r.actual)).length / dr.length * 100); upB.push(s.filter(r => r.actual > 0).length / W * 100); }
  chart('cHit', {
    legend: leg({ data: ['Ensemble hit rate', 'Always-up baseline'] }), tooltip: tip({ valueFormatter: v => v.toFixed(1) + '%' }), grid: { left: 48, right: 14, top: 34, bottom: 30 },
    xAxis: ax({ type: 'category', data: hx, axisLabel: { color: T.tx3, formatter: dLabel } }), yAxis: ax({ min: 25, max: 80, axisLabel: { color: T.tx3, formatter: '{value}%' } }), dataZoom: [{ type: 'inside' }],
    series: [{ name: 'Ensemble hit rate', type: 'line', data: hit, symbol: 'none', lineStyle: { width: 2, color: T.s[6] }, itemStyle: { color: T.s[6] }, markLine: { symbol: 'none', silent: true, data: [{ yAxis: 50 }], lineStyle: { color: T.tx3, type: 'dashed' }, label: { formatter: 'Coin flip', color: T.tx3, position: 'insideStartTop' } } }, { name: 'Always-up baseline', type: 'line', data: upB, symbol: 'none', lineStyle: { width: 1.5, color: T.tx3 }, itemStyle: { color: T.tx3 } }],
  });
  const errs = rows.map(r => (Math.exp(r.actual - r.pred.ens) - 1) * 100), bw = 0.25, bins = {};
  errs.forEach(x => { const b = Math.max(-5, Math.min(5, Math.round(x / bw) * bw)); bins[b.toFixed(2)] = (bins[b.toFixed(2)] || 0) + 1; });
  const bk = Object.keys(bins).map(Number).sort((a, b) => a - b), ms = GE.mean(rows.map(r => r.sigma)) * 100;
  chart('cErr', {
    tooltip: tip({ trigger: 'item', formatter: p => `Error ≈ ${(+p.name).toFixed(2)}%<br>${p.value} sessions` }), grid: { left: 48, right: 14, top: 34, bottom: 30 },
    title: { text: `Band coverage — 68%: actual ${(sc.cov68 * 100).toFixed(1)}%  ·  95%: actual ${(sc.cov95 * 100).toFixed(1)}%`, left: 'center', top: 0, textStyle: { color: T.tx2, fontSize: 12, fontWeight: 500 } },
    xAxis: ax({ type: 'category', data: bk.map(b => b.toFixed(2)), axisLabel: { color: T.tx3, formatter: v => (+v).toFixed(1) + '%' } }), yAxis: ax({ axisLabel: { color: T.tx3 } }),
    series: [{ type: 'bar', data: bk.map(b => bins[b.toFixed(2)]), barCategoryGap: '8%', itemStyle: { color: T.s[0], borderRadius: [4, 4, 0, 0] }, markLine: { symbol: 'none', silent: true, lineStyle: { color: T.tx3, type: 'dashed' }, label: { color: T.tx3, formatter: p => p.name }, data: [{ name: '−1σ', xAxis: (Math.round(-ms / bw) * bw).toFixed(2) }, { name: '+1σ', xAxis: (Math.round(ms / bw) * bw).toFixed(2) }] } }],
  });
  const best = Object.entries(sc.res).filter(([k]) => k !== 'naive').sort((a, b) => a[1].dm - b[1].dm)[0];
  const sig = best[1].dm < -1.96;
  $('proofVerdict').innerHTML = `<b>What the backtest says.</b> ${conf('Certain')}The ensemble's error is ${(e.theilU * 100).toFixed(2)}% of the random walk's (Theil U ${e.theilU.toFixed(4)}), with a Diebold-Mariano statistic of ${e.dm.toFixed(2)} — ${Math.abs(e.dm) > 1.96 ? 'statistically significant' : '<b>not</b> statistically different from "tomorrow = today"'}. Its direction calls were right ${(e.hit * 100).toFixed(1)}% of the time, against ${(sc.upShare * 100).toFixed(1)}% for simply always predicting "up". The best single model is <b>${(GE.MODELS.find(m => m.id === best[0]) || { name: 'Ensemble' }).name}</b> (DM ${best[1].dm.toFixed(2)}${sig ? ', significant' : ', not significant'}). ${conf('Likely')}The volatility bands are the most reliable output: the 68% band held ${(sc.cov68 * 100).toFixed(1)}% of outcomes and the 95% band ${(sc.cov95 * 100).toFixed(1)}%${sc.cov95 < 0.95 ? ', a little short of 95%, because gold has fat tails (big shock days)' : ''}. ${conf('Likely')}<b>Use this tool for the size of tomorrow's likely move and for entry timing, not for a confident up/down bet.</b> Any tool claiming 70–80% next-day accuracy on gold should be asked for this same walk-forward proof.`;
}

function renderDaily() {
  const d = D.daily, i0 = d.findIndex(x => x.date >= '2021-02-02'), all = d.slice(i0), y = all.map(x => toMcx(x.inr, x.date));
  const s50 = GE.sma(y, 50), s200 = GE.sma(y, 200), n = S.dN ? Math.min(S.dN, all.length) : all.length, st = all.length - n;
  const x = all.map(a => a.date), marks = DUTY.map(([dd, v]) => ({ xAxis: x.find(q => q >= dd), label: { formatter: `Duty → ${v ?? S.duty}%`, color: T.tx3, fontSize: 10 } })).filter(m => m.xAxis);
  chart('cDaily', {
    legend: leg({ data: ['MCX parity', 'SMA 50', 'SMA 200'] }), tooltip: tip({ formatter: ps => { const i = ps[0].dataIndex, a = all[i]; return `<b>${dLabel(a.date)}</b><br>Parity <b>${inr(y[i])}</b> (duty ${dutyAt(a.date)}%)<br>Gold ${usd(a.usd * D.basis)} · USD/INR ${a.fx.toFixed(2)}${s50[i] ? `<br>SMA50 ${inr(s50[i])}` : ''}${s200[i] ? `<br>SMA200 ${inr(s200[i])}` : ''}`; } }),
    grid: { left: 78, right: 18, top: 36, bottom: 46 },
    dataZoom: [{ type: 'inside', startValue: st, endValue: all.length - 1 }, { type: 'slider', height: 14, bottom: 6, startValue: st, endValue: all.length - 1, borderColor: T.line, textStyle: { color: T.tx3 }, fillerColor: T.acc + '33' }],
    xAxis: ax({ type: 'category', data: x, axisLabel: { color: T.tx3, formatter: dLabel } }), yAxis: ax({ scale: true, axisLabel: { color: T.tx3, formatter: v => '₹' + (v / 1000).toFixed(0) + 'k' } }),
    series: [{ name: 'MCX parity', type: 'line', data: y, symbol: 'none', lineStyle: { width: 2, color: T.acc }, itemStyle: { color: T.acc }, areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: T.acc + '40' }, { offset: 1, color: T.acc + '00' }]) }, markLine: { symbol: 'none', silent: true, lineStyle: { color: T.tx3, type: 'dotted' }, data: marks } },
      { name: 'SMA 50', type: 'line', data: s50, symbol: 'none', lineStyle: { width: 1.5, color: T.s[0] }, itemStyle: { color: T.s[0] } }, { name: 'SMA 200', type: 'line', data: s200, symbol: 'none', lineStyle: { width: 1.5, color: T.s[1] }, itemStyle: { color: T.s[1] } }],
  });
}
function renderOsc() {
  const d = D.daily.slice(-400), c = d.map(x => x.inr), r = GE.rsi(c, 14), m = GE.macd(c), off = 140, x = d.slice(off).map(a => a.date);
  chart('cOsc', {
    tooltip: tip({ valueFormatter: v => (v == null ? '—' : v.toFixed(2)) }), axisPointer: { link: [{ xAxisIndex: 'all' }] }, legend: leg({ data: ['RSI 14', 'MACD histogram'] }),
    grid: [{ left: 52, right: 40, top: 34, height: '38%' }, { left: 52, right: 40, top: '62%', height: '28%' }], dataZoom: [{ type: 'inside', xAxisIndex: [0, 1], start: 50, end: 100 }],
    xAxis: [ax({ type: 'category', data: x, axisLabel: { show: false } }), ax({ type: 'category', gridIndex: 1, data: x, axisLabel: { color: T.tx3, formatter: dLabel } })],
    yAxis: [ax({ min: 0, max: 100, splitNumber: 2, axisLabel: { color: T.tx3 } }), ax({ gridIndex: 1, splitNumber: 2, axisLabel: { color: T.tx3, formatter: v => '₹' + v.toFixed(0) } })],
    series: [{ name: 'RSI 14', type: 'line', data: r.slice(off), symbol: 'none', lineStyle: { width: 2, color: T.s[6] }, itemStyle: { color: T.s[6] }, markArea: { silent: true, itemStyle: { color: T.tx3, opacity: 0.08 }, data: [[{ yAxis: 70 }, { yAxis: 100 }], [{ yAxis: 0 }, { yAxis: 30 }]] }, markLine: { symbol: 'none', silent: true, lineStyle: { color: T.tx3, type: 'dashed' }, label: { color: T.tx3, fontSize: 10 }, data: [{ yAxis: 70, name: 'Overbought' }, { yAxis: 30, name: 'Oversold' }] } },
      { name: 'MACD histogram', type: 'bar', xAxisIndex: 1, yAxisIndex: 1, data: m.hist.slice(off).map(v => ({ value: v, itemStyle: { color: v >= 0 ? T.good : T.bad, borderRadius: 2 } })), barMaxWidth: 4 }],
  });
}
function renderRisk() {
  const d = D.daily, c = d.map(x => x.usd), dd = GE.drawdown(c), r = c.map((v, i) => (i ? Math.log(v / c[i - 1]) : 0)), v = GE.ewmaVol(r).map(s => (s == null ? null : s * Math.sqrt(252) * 100)), off = 60, x = d.slice(off).map(a => a.date);
  chart('cRisk', {
    tooltip: tip({ valueFormatter: v => (v == null ? '—' : v.toFixed(1) + '%') }), axisPointer: { link: [{ xAxisIndex: 'all' }] }, legend: leg({ data: ['Drawdown (USD gold)', 'Annualised volatility'] }),
    grid: [{ left: 52, right: 14, top: 34, height: '36%' }, { left: 52, right: 14, top: '62%', height: '28%' }], dataZoom: [{ type: 'inside', xAxisIndex: [0, 1], start: 40, end: 100 }],
    xAxis: [ax({ type: 'category', data: x, axisLabel: { show: false } }), ax({ type: 'category', gridIndex: 1, data: x, axisLabel: { color: T.tx3, formatter: dLabel } })],
    yAxis: [ax({ max: 0, splitNumber: 2, axisLabel: { color: T.tx3, formatter: '{value}%' } }), ax({ gridIndex: 1, splitNumber: 2, axisLabel: { color: T.tx3, formatter: '{value}%' } })],
    series: [{ name: 'Drawdown (USD gold)', type: 'line', data: dd.slice(off).map(x => x * 100), symbol: 'none', lineStyle: { width: 1.5, color: T.bad }, itemStyle: { color: T.bad }, areaStyle: { color: T.bad, opacity: 0.18 } },
      { name: 'Annualised volatility', type: 'line', xAxisIndex: 1, yAxisIndex: 1, data: v.slice(off), symbol: 'none', lineStyle: { width: 1.5, color: T.s[0] }, itemStyle: { color: T.s[0] } }],
  });
}
function renderHeat() {
  const M = D.session, days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], order = [1, 2, 3, 4, 5, 6, 0], key = S.hm === 'abs' ? 'absMean' : 'mean', data = [];
  order.forEach((dw, yi) => M[dw].forEach((c, h) => { if (c[key] != null) data.push([h, yi, +c[key].toFixed(2), c.n]); }));
  const vals = data.map(d => d[2]), mx = Math.max(...vals.map(Math.abs));
  $('hmSub').textContent = `${D.hDone.length.toLocaleString()} real hourly bars (${istStr(D.hDone[0].t)} → ${istStr(D.hDone.at(-1).t)} IST). ${S.hm === 'abs' ? 'Average absolute hourly move in basis points: the NY/COMEX open (18:30–20:30 IST in winter) dominates.' : 'Average hourly return in bp. Treat as noise unless a cell holds a lot of bars.'} Weekend cells reflect PAXG's 24/7 trading while COMEX is shut.`;
  chart('cHeat', {
    tooltip: { backgroundColor: T.glass, borderColor: T.line, textStyle: { color: T.tx, fontSize: 12 }, formatter: p => `<b>${days[order[p.value[1]]]} ${String(p.value[0]).padStart(2, '0')}:00 IST</b><br>${S.hm === 'abs' ? 'Avg |move|' : 'Avg return'} ${p.value[2].toFixed(1)} bp<br>${p.value[3]} bars` },
    grid: { left: 44, right: 16, top: 10, bottom: 64 },
    xAxis: ax({ type: 'category', data: [...Array(24).keys()].map(h => String(h).padStart(2, '0')), splitArea: { show: false } }), yAxis: ax({ type: 'category', data: order.map(i => days[i]), inverse: true }),
    visualMap: S.hm === 'abs' ? { dimension: 2, min: 0, max: GE.quantile(vals, 0.97), calculable: false, orient: 'horizontal', left: 'center', bottom: 4, itemHeight: 160, itemWidth: 10, textStyle: { color: T.tx3 }, inRange: { color: T.mode === 'dark' ? ['#104281', '#256abf', '#5598e7', '#9ec5f4'] : ['#cde2fb', '#86b6ef', '#3987e5', '#104281'] } }
      : { dimension: 2, min: -mx, max: mx, orient: 'horizontal', left: 'center', bottom: 4, itemHeight: 160, itemWidth: 10, textStyle: { color: T.tx3 }, inRange: { color: [T.s[1], T.mode === 'dark' ? '#3a3a3a' : '#e3e2dc', T.s[0]] } },
    series: [{ type: 'heatmap', data, itemStyle: { borderColor: T.mode === 'dark' ? 'rgba(10,12,20,.6)' : 'rgba(255,255,255,.8)', borderWidth: 2, borderRadius: 3 } }],
  });
}
function renderDecomp() {
  const d = D.daily.slice(-261), b = d[0], x = d.map(a => a.date);
  const g = d.map(a => Math.log(a.usd / b.usd) * 100), f = d.map(a => Math.log(a.fx / b.fx) * 100), t = d.map((a, i) => g[i] + f[i]);
  chart('cDecomp', {
    legend: leg({ data: ['Total ₹ gold', 'USD gold price', 'USD/INR'] }), tooltip: tip({ valueFormatter: v => v.toFixed(2) + '%' }), grid: { left: 52, right: 58, top: 34, bottom: 30 },
    xAxis: ax({ type: 'category', data: x, axisLabel: { color: T.tx3, formatter: dLabel } }), yAxis: ax({ axisLabel: { color: T.tx3, formatter: '{value}%' } }),
    series: [{ name: 'Total ₹ gold', type: 'line', data: t, symbol: 'none', lineStyle: { width: 2.5, color: T.acc }, itemStyle: { color: T.acc }, endLabel: { show: true, color: T.tx2, formatter: p => p.value.toFixed(1) + '%' } },
      { name: 'USD gold price', type: 'line', data: g, symbol: 'none', lineStyle: { width: 1.5, color: T.s[0] }, itemStyle: { color: T.s[0] }, endLabel: { show: true, color: T.tx2, formatter: p => p.value.toFixed(1) + '%' } },
      { name: 'USD/INR', type: 'line', data: f, symbol: 'none', lineStyle: { width: 1.5, color: T.s[1] }, itemStyle: { color: T.s[1] }, endLabel: { show: true, color: T.tx2, formatter: p => p.value.toFixed(1) + '%' } }],
  });
}
function renderInvest() {
  const c = D.card, [vt, vc] = verdictOf(c.score), sc = Math.round(c.score * 100);
  chart('cGauge', {
    series: [{ type: 'gauge', min: -100, max: 100, startAngle: 200, endAngle: -20, radius: '95%', center: ['50%', '62%'], progress: { show: false },
      axisLine: { lineStyle: { width: 14, color: [[0.375, T.bad], [0.475, T.s[3]], [0.525, T.tx3], [0.625, T.s[0]], [1, T.good]] } },
      pointer: { width: 5, length: '62%', itemStyle: { color: T.tx } }, anchor: { show: true, size: 12, itemStyle: { color: T.tx } }, axisTick: { show: false }, splitLine: { length: 8, lineStyle: { color: T.line, width: 2 } },
      axisLabel: { color: T.tx3, distance: 18, fontSize: 10 }, detail: { valueAnimation: true, offsetCenter: [0, '32%'], fontSize: 28, fontFamily: 'JetBrains Mono', color: T.tx, formatter: v => (v > 0 ? '+' : '') + v }, data: [{ value: sc }] }],
  });
  const hiVol = c.volPct > 0.66, P = parityNow();
  $('invVerdict').innerHTML = `<span class="tag ${vc}" style="font-size:13px">${vt}</span><br><br>${conf('Likely')}<b>Next 1–5 sessions:</b> ${c.score < -0.05 ? 'trend and momentum are still pointing down, so lump-sum buying now carries a real chance of a lower price within days.' : c.score > 0.05 ? 'conditions lean favourable for adding.' : 'signals are mixed; no edge in timing a single entry.'}<br>${conf('Likely')}<b>Long-term accumulation:</b> price is ${(c.dd * -100).toFixed(1)}% below its peak in this data, ${c.dd < -0.1 ? 'which historically has been a better zone to accumulate in for multi-year holders' : 'so the discount to past highs is limited'}. ${hiVol ? `Volatility is high (${(c.volNow * 100).toFixed(0)}% annualised, ${(c.volPct * 100).toFixed(0)}th percentile), so split purchases over several weeks rather than buying at once.` : 'Volatility is moderate, so fewer, larger tranches carry less timing risk.'}<br>${conf('Certain')}The 15% import duty in force since 13 May 2026 is already inside the MCX parity of ${inr(P)}; a future duty cut would drop Indian prices independently of COMEX, as in July 2024.`;
  $('factors').innerHTML = c.factors.map(f => { const w = Math.abs(f.v) * 50, col = f.v >= 0 ? T.good : T.bad; return `<div class="fact"><div>${f.k}<div style="color:${T.tx3};font-size:11px">weight ${(f.w * 100).toFixed(0)}%</div></div><div class="bar"><i style="left:${f.v >= 0 ? 50 : 50 - w}%;width:${w}%;background:${col}"></i><i style="left:50%;width:1px;background:${T.tx3}"></i></div><div style="text-align:right;font-family:var(--mono)" class="${cls(f.v)}">${f.v > 0 ? '+' : ''}${(f.v * 100).toFixed(0)}</div><div class="why">${f.why}</div></div>`; }).join('');
  const d = D.daily, k = x => k10(x, S.duty), c0 = d.map(x => x.inr), at = GE.atr(d.map(x => x.inrH), d.map(x => x.inrL), c0, 14).at(-1), bb = GE.bollinger(c0, 20, 2), L = d.length - 1, y1 = c0.slice(-260);
  const lv = [['Live MCX parity', P, 'Current'], ['All-time high in data', k(Math.max(...c0)), 'Resistance'], ['52-week high', k(Math.max(...y1)), 'Resistance'], ['Upper Bollinger (20d)', k(bb.up[L]), 'Stretched above'], ['SMA 50', k(c.s50), 'Trend reference'], ['SMA 200', k(c.s200), 'Long-term trend'], ['Lower Bollinger (20d)', k(bb.lo[L]), 'Stretched below'], ['20-session low', k(Math.min(...c0.slice(-20))), 'Near support'], ['1-ATR buy zone (live − ATR14)', P - k(at), 'Staggered entry'], ['52-week low', k(Math.min(...y1)), 'Deep support']].sort((a, b) => b[1] - a[1]);
  $('tLevels').innerHTML = `<tr><th>Level</th><th class="n">₹/10g</th><th class="n">vs live</th><th>Role</th></tr>` + lv.map(([n, v, r]) => `<tr${n.startsWith('Live') ? ` style="background:${T.acc}1f"` : ''}><td>${n}</td><td class="n">${inr(v)}</td><td class="n ${cls(v / P - 1)}">${n.startsWith('Live') ? '—' : pct(v / P - 1, 1)}</td><td><span class="tag">${r}</span></td></tr>`).join('');
}
function renderLedger() {
  const L = [...(D.ledger || [])].reverse();
  $('tLedger').innerHTML = `<tr><th>Target session</th><th>Made</th><th class="n">Predicted</th><th class="n">Actual</th><th class="n">Error</th><th>In 68%?</th></tr>` + (L.length ? L.map(e => { const s = k10(1, dutyAt(e.target) ?? S.duty) * (e.basis ? e.basis / D.basis : 1); const ok = e.actual != null; const inb = ok && e.actual >= e.lo && e.actual <= e.hi; return `<tr><td>${dLabel(e.target)}</td><td>${istStr(e.made)}</td><td class="n">${inr(e.ex * s)}</td><td class="n">${ok ? inr(e.actual * s) : '<span class="tag">pending</span>'}</td><td class="n ${ok ? cls(e.ex / e.actual - 1) : ''}">${ok ? pct(e.ex / e.actual - 1) : ''}</td><td>${ok ? `<span class="tag ${inb ? 'good' : 'bad'}">${inb ? 'Yes' : 'No'}</span>` : ''}</td></tr>`; }).join('') : '<tr><td colspan="6">No forecasts recorded yet.</td></tr>');
}
function renderSources() {
  const H = D.hDone, d = D.daily;
  $('srcList').innerHTML = [
    `<b>Hourly &amp; daily gold</b> — Binance public market data, PAXG/USDT klines (<a href="https://data-api.binance.vision/api/v3/klines?symbol=PAXGUSDT&interval=1h&limit=5" target="_blank" rel="noopener">data-api.binance.vision</a>). ${H.length.toLocaleString()} hourly bars to ${istStr(H.at(-1).closeT + 1)} IST; ${d.length.toLocaleString()} weekday IST sessions from ${dLabel(d[0].date)}.`,
    `<b>Live XAU spot</b> — <a href="https://gold-api.com" target="_blank" rel="noopener">gold-api.com</a> ${D.spot ? `· ${usd(D.spot.price)} at ${istStr(Date.parse(D.spot.updatedAt))} IST` : '· unavailable this load (PAXG used unscaled)'}.`,
    `<b>USD/INR</b> — ECB reference rates via <a href="https://frankfurter.dev" target="_blank" rel="noopener">Frankfurter</a>, ${D.fx.length.toLocaleString()} daily fixes, latest ${D.fxNow} on ${dLabel(D.fxDate)}${D.er ? `; cross-check <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener">ExchangeRate-API</a> ${D.er.rates.INR.toFixed(3)}` : ''}.`,
    `<b>Import duty schedule</b> — 10.75% from 2 Feb 2021; 15% from 30 Jun 2022 (12.5% BCD + 2.5% AIDC); 6% from 24 Jul 2024; 15% from 13 May 2026 (10% BCD + 5% AIDC, Customs Notification 16/2026). Editable in Settings.`,
    `Page loaded data at ${istStr(D.fetchedAt)} IST. Nothing on this page is simulated or hard-coded; every number is computed from the responses above.`,
  ].map(x => `<li>${x}</li>`).join('');
  $('method').innerHTML = `<h3 style="margin-top:0;color:var(--tx)">Method and limits</h3>
  ${conf('Certain')}<b>Purity maths.</b> Spot is per troy ounce of pure gold. Landed ₹/g pure = spot × USD/INR ÷ 31.1035 × (1 + duty). 24K 99.99% = × 0.9999; 24K 99.9% = × 0.999; MCX Gold (995) = × 0.995, quoted per 10 g; 22K = × 0.916. MCX prices include import duty and exclude 3% GST; jewellery adds GST plus making charges.<br><br>
  ${conf('Certain')}<b>Daily sessions</b> are Binance bars cut at IST midnight (timeZone=5:30), close to MCX's 23:55 IST winter close (23:30 in US summer). Weekends are dropped.<br><br>
  ${conf('Likely')}<b>Models</b> forecast tomorrow's log-return of the rupee gold price (so the USD/INR move is included). Six models plus an inverse-error-weighted ensemble; regressions refit on a rolling 500-session window. Bands use RiskMetrics EWMA volatility (λ = 0.94).<br><br>
  ${conf('Likely')}<b>Known gaps.</b> PAXG trades ~0.1–0.5% off spot and is scaled to it using today's ratio; COMEX front-month futures also carry a contango premium over spot, which your MCX calibration absorbs. MCX holidays, contract rollover and the 1-step-ahead framing of an open session are simplifications.<br><br>
  ${conf('Guessing')}<b>What no model here captures:</b> sudden policy shocks (duty changes, RBI action, US Fed surprises, geopolitical events). Those drive the largest gold days and are why the bands, not the point forecast, are the part to rely on.`;
}

// ---------- live loop ----------
let nextFull = 0;
function scheduleNext() { const now = Date.now(), h = 3600e3; nextFull = Math.ceil(now / h) * h + 90e3; if (nextFull - now < 120e3) nextFull += h; }
async function pollSpot() {
  try { const s = await getJSON(SRC.spot, 10000); if (s && s.price) { D.spot = s; const t = Date.parse(s.updatedAt) || Date.now(); if (!D.ticks.length || D.ticks.at(-1).t !== t) D.ticks.push({ t, p: s.price }); if (D.ticks.length > 1440) D.ticks.shift(); if (D.ready) { renderStrip(); renderPurity(); renderK22(); renderKpis(); renderTicks(); if (window.AurumBridge) window.dispatchEvent(new CustomEvent('aurum:update', { detail: window.AurumBridge.snapshot() })); } setLive('ok', 'Live'); } }
  catch { setLive('err', 'Spot feed retrying'); }
}
async function fullRefresh() {
  const ok = await loadAll(); if (!ok) return;
  try { compute(); renderAll(); setLive('ok', 'Live'); }
  catch (e) { console.error(e); $('banner').innerHTML = `<b>Computation error:</b> ${e.message}`; setLive('err', 'Error'); return; }
  const H = D.hDone, i = H.length - 1, r = D.hr[i], s = D.hVol[i - 1];
  if (s && Math.abs(r) > 2 * s) { toast(`<b>Unusual hour:</b> gold moved ${pct(Math.exp(r) - 1)} in the hour to ${istStr(H[i].closeT + 1)} IST (${(r / s).toFixed(1)}σ).`); document.title = `⚠ ${pct(Math.exp(r) - 1)} · AurumCast`; }
  else document.title = `${inr(parityNow())} · AurumCast`;
  scheduleNext();
}
setInterval(() => {
  if (!S.auto) { $('refreshPill').textContent = 'Auto-refresh off'; return; }
  const left = nextFull - Date.now();
  if (nextFull && left <= 0) { nextFull = 0; fullRefresh(); }
  else if (nextFull) { const m = Math.floor(left / 60e3), s = Math.floor(left / 1e3) % 60; $('refreshPill').textContent = `Refresh in ${m}:${String(s).padStart(2, '0')}`; }
}, 1000);
setInterval(() => { if (S.auto && D.ready) pollSpot(); }, 60e3);

// ---------- controls ----------
const segBind = (id, key, attr, fn) => $(id).addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; $(id).querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); S[key] = isNaN(+b.dataset[attr]) ? b.dataset[attr] : +b.dataset[attr]; if (D.ready) fn(); });
segBind('hrRange', 'hrN', 'n', renderHourly); segBind('hrOv', 'hrOv', 'o', renderHourly); segBind('dRange', 'dN', 'n', renderDaily); segBind('coneH', 'coneH', 'h', renderForecast); segBind('hmMode', 'hm', 'm', renderHeat); segBind('gMode', 'gMode', 'g', renderStrip); segBind('k22Kind', 'k22Kind', 'k', renderK22); segBind('k22N', 'k22N', 'n', renderK22);
$('themes').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setTheme(b.dataset.t); });
$('refreshBtn').onclick = () => fullRefresh();
$('pTarget').oninput = calcProb; $('pDays').oninput = calcProb;
$('setBtn').onclick = () => $('drawer').classList.add('open'); $('setClose').onclick = () => $('drawer').classList.remove('open');
$('sDuty').value = S.duty; $('sHours').value = String(S.hours); $('sAuto').checked = S.auto;
const calTxt = () => ($('sCalTxt').innerHTML = S.prem ? `Calibrated: MCX trades at <b>${S.prem > 0 ? '+' : ''}${S.prem.toFixed(2)}%</b> vs parity.` : 'Not calibrated — showing pure import parity.');
calTxt();
$('sDuty').onchange = () => { const v = +$('sDuty').value; if (isFinite(v) && v >= 0 && v < 50) { S.duty = v; store.set('duty', v); if (D.ready) renderAll(); } };
$('sCal').onclick = () => { const a = +$('sMcx').value; if (!a || !D.ready) return; const raw = spotNow() * D.fxNow * 10 / OZ * (1 + S.duty / 100) * MCXP; S.prem = (a / raw - 1) * 100; store.set('prem', S.prem); calTxt(); renderAll(); toast(`Calibrated to MCX ${inr(a)}: ${S.prem > 0 ? '+' : ''}${S.prem.toFixed(2)}% vs parity.`); };
$('sReset').onclick = () => { S.prem = 0; store.set('prem', 0); calTxt(); if (D.ready) renderAll(); };
$('sHours').onchange = () => { S.hours = +$('sHours').value; store.set('hours', S.hours); fullRefresh(); };
$('sAuto').onchange = () => { S.auto = $('sAuto').checked; store.set('auto', S.auto); if (S.auto) scheduleNext(); };
$('sClearLedger').onclick = () => { store.set('ledger', []); if (D.ready) { updateLedger(); renderLedger(); } };
const navObs = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) document.querySelectorAll('nav.links a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + e.target.id)); }), { rootMargin: '-40% 0px -55% 0px' });
document.querySelectorAll('section').forEach(s => navObs.observe(s));

// ---------- boot ----------
if (typeof echarts === 'undefined') { $('banner').innerHTML = '<b>Chart library could not load</b> (cdn.jsdelivr.net). Check your connection and reload.'; return; }
setTheme(S.theme);
fullRefresh();
})();
