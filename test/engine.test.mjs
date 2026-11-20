// Unit tests for every engine function. Test inputs here are hand-built fixtures for checking maths only;
// nothing in this file is published.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const GE = createRequire(import.meta.url)('../src/engine.cjs');
const close = (a, b, tol = 1e-9, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b}, got ${a}`);
const U = s => Date.parse(s); // UTC ISO → ms

test('mean / std / quantile', () => {
  close(GE.mean([1, 2, 3, 4]), 2.5);
  close(GE.std([2, 4, 4, 4, 5, 5, 7, 9]), Math.sqrt(32 / 7));
  close(GE.quantile([1, 2, 3, 4, 5], 0.5), 3);
  close(GE.quantile([1, 2, 3, 4], 0.25), 1.75);
});

test('SMA and EMA', () => {
  assert.deepEqual(GE.sma([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]);
  const e = GE.ema([5, 5, 5, 5, 5], 3); assert.deepEqual(e.slice(2), [5, 5, 5]);
  const e2 = GE.ema([1, 2, 3], 2); close(e2[2], (3 * 2 / 3) + ((2 * 2 / 3) + 1 / 3) / 3); // k = 2/3
});

test('RSI: all-up = 100, symmetric oscillation ≈ 50', () => {
  const up = Array.from({ length: 30 }, (_, i) => 100 + i);
  close(GE.rsi(up, 14).at(-1), 100);
  const osc = Array.from({ length: 60 }, (_, i) => 100 + (i % 2));
  assert.ok(Math.abs(GE.rsi(osc, 14).at(-1) - 50) < 4);
});

test('MACD is zero on a flat series; Bollinger bands collapse', () => {
  const flat = new Array(60).fill(10), m = GE.macd(flat);
  close(m.hist.at(-1), 0); const b = GE.bollinger(flat, 20, 2); close(b.up.at(-1), 10); close(b.lo.at(-1), 10);
});

test('ATR of constant-range bars equals the range', () => {
  const n = 30, h = new Array(n).fill(12), l = new Array(n).fill(10), c = new Array(n).fill(11);
  close(GE.atr(h, l, c, 14).at(-1), 2);
});

test('EWMA volatility: zero returns → 0; constant |r| → |r|', () => {
  close(GE.ewmaVol(new Array(60).fill(0)).at(-1), 0);
  close(GE.ewmaVol(Array.from({ length: 200 }, (_, i) => (i % 2 ? 0.01 : -0.01))).at(-1), 0.01, 1e-12);
});

test('drawdown', () => assert.deepEqual(GE.drawdown([100, 120, 90, 120]), [0, 0, -0.25, 0]));

test('linear solve and ridge recover exact coefficients', () => {
  const x = GE.solve([[2, 1], [1, 3]], [5, 10]); close(x[0], 1); close(x[1], 3);
  const X = [], y = []; for (let i = 0; i < 50; i++) { const a = Math.sin(i), b = Math.cos(i * 1.3); X.push([a, b]); y.push(0.5 + 2 * a - 3 * b); }
  const beta = GE.ridgeFit(X, y, 0); close(beta[0], 0.5, 1e-8); close(beta[1], 2, 1e-8); close(beta[2], -3, 1e-8);
});

test('parseKlines / parseFx (v1 & v2) / fxLookup forward-fills', () => {
  const k = GE.parseKlines([[1, '1', '2', '0.5', '1.5', '10', 2, '15']]); assert.deepEqual([k[0].o, k[0].h, k[0].l, k[0].c, k[0].v, k[0].closeT], [1, 2, 0.5, 1.5, 10, 2]);
  const v2 = GE.parseFx([{ date: '2026-01-02', rate: 90 }, { date: '2026-01-01', rate: 89 }]); assert.deepEqual(v2, [['2026-01-01', 89], ['2026-01-02', 90]]);
  const v1 = GE.parseFx({ rates: { '2026-01-05': { INR: 91 } } }); assert.deepEqual(v1, [['2026-01-05', 91]]);
  const at = GE.fxLookup(v2); assert.equal(at('2026-01-04'), 90); assert.equal(at('2025-12-31'), null);
});

test('buildDaily drops IST weekends and converts to ₹/10 g fine', () => {
  const day = d => U(d + 'T00:00:00Z') - GE.IST_MS; // IST midnight
  const raw = ['2026-11-20', '2026-11-21', '2026-11-23'].map(d => [day(d), '4000', '4010', '3990', '4000', '1', day(d) + 86400e3 - 1, '1']);
  const out = GE.buildDaily(GE.parseKlines(raw), [['2026-11-19', 90]], U('2026-12-01T00:00:00Z'));
  assert.deepEqual(out.map(x => x.date), ['2026-11-20', '2026-11-23']); // Saturday dropped
  close(out[0].inr, 4000 * 90 * 10 / 31.1034768, 1e-6); assert.equal(out[0].partial, false);
});

test('rates(): purity maths', () => {
  const R = GE.rates(2000, 80, 15, 0), fine = 2000 * 80 / 31.1034768;
  close(R.fineIntl, fine, 1e-9); close(R.fineLanded, fine * 1.15, 1e-9);
  close(R.k24_9999, fine * 1.15 * 0.9999, 1e-9); close(R.k24_999, fine * 1.15 * 0.999, 1e-9);
  close(R.mcx995, fine * 1.15 * 0.995, 1e-9); close(R.k22_916, fine * 1.15 * 0.916, 1e-9); close(R.mcx995_10g, R.mcx995 * 10, 1e-9);
  close(GE.rates(2000, 80, 15, 0.01).k24_9999 / R.k24_9999, 1.01, 1e-12); // calibration premium
});

test('US daylight-saving boundaries (2026)', () => {
  assert.equal(GE.usDST(U('2026-03-08T06:59:00Z')), false); assert.equal(GE.usDST(U('2026-03-08T07:00:00Z')), true);
  assert.equal(GE.usDST(U('2026-11-01T05:59:00Z')), true); assert.equal(GE.usDST(U('2026-11-01T06:00:00Z')), false);
});

test('COMEX trading clock', () => {
  assert.equal(GE.comexOpen(U('2026-11-18T15:00:00Z')), true);  // Wed 10:00 ET
  assert.equal(GE.comexOpen(U('2026-11-18T22:30:00Z')), false); // Wed 17:30 ET daily break
  assert.equal(GE.comexOpen(U('2026-11-20T22:30:00Z')), false); // Fri after close
  assert.equal(GE.comexOpen(U('2026-11-21T15:00:00Z')), false); // Saturday
  assert.equal(GE.comexOpen(U('2026-11-22T22:30:00Z')), false); // Sun 17:30 ET
  assert.equal(GE.comexOpen(U('2026-11-22T23:15:00Z')), true);  // Sun 18:15 ET reopen
  assert.equal(GE.openHours(U('2026-11-20T22:00:00Z'), U('2026-11-22T23:00:00Z')), 0); // whole weekend shut
  assert.equal(GE.openHours(U('2026-11-18T00:00:00Z'), U('2026-11-19T00:00:00Z')), 23); // one weekday = 23 h
});

test('MCX session clock (IST)', () => {
  // Fri 20 Nov 2026 20:00 IST → next open Mon 23 Nov 09:00 IST, next close Fri 23:55 IST (US winter)
  const fri8pm = U('2026-11-20T14:30:00Z');
  assert.equal(new Date(GE.nextMcxOpen(fri8pm)).toISOString(), '2026-11-23T03:30:00.000Z');
  assert.equal(new Date(GE.nextMcxClose(fri8pm)).toISOString(), '2026-11-20T18:25:00.000Z');
  // after Friday's close → Monday's close
  assert.equal(new Date(GE.nextMcxClose(U('2026-11-20T18:30:00Z'))).toISOString(), '2026-11-23T18:25:00.000Z');
  // US summer: close 23:30 IST
  assert.equal(new Date(GE.nextMcxClose(U('2026-07-01T06:00:00Z'))).toISOString(), '2026-07-01T18:00:00.000Z');
  // before 09:00 IST on a weekday → today's open
  assert.equal(new Date(GE.nextMcxOpen(U('2026-11-19T01:00:00Z'))).toISOString(), '2026-11-19T03:30:00.000Z');
});

test('forecastTo: no trading hours → no move, bands collapse; one session → full sigma', () => {
  const fc = { r: 0.002, sigma: 0.01, mu: 0.0003 };
  const g0 = GE.forecastTo(U('2026-11-21T10:00:00Z'), U('2026-11-22T10:00:00Z'), fc); // inside weekend
  assert.equal(g0.hours, 0); const q = g0.factor(100); close(q.mid, 100); close(q.lo68, 100); close(q.hi68, 100);
  const g1 = GE.forecastTo(U('2026-11-18T00:00:00Z'), U('2026-11-19T00:00:00Z'), fc); close(g1.m, 0.002); close(g1.s, 0.01);
  const q1 = g1.factor(100); assert.ok(q1.lo95 < q1.lo68 && q1.lo68 < q1.mid && q1.mid < q1.hi68 && q1.hi68 < q1.hi95);
});

// Deterministic pseudo-random walk (LCG) for model-mechanics tests only.
function walk(n, seed = 7) { let s = seed, p = 100; const out = []; for (let i = 0; i < n; i++) { s = (s * 1664525 + 1013904223) % 4294967296; p *= Math.exp((s / 4294967296 - 0.5) * 0.02); out.push(p); } return out; }

test('walkForward has no look-ahead: changing the future never changes past predictions', () => {
  const a = walk(900), b = [...a]; for (let i = 800; i < 900; i++) b[i] *= 1.5;
  const A = GE.walkForward(a, null, { lastCompleted: 899 }), B = GE.walkForward(b, null, { lastCompleted: 899 });
  const cut = A.rows.findIndex(r => r.t >= 799); // predictions made with data ≤ t=798 must be identical
  for (let i = 0; i < cut; i++) for (const id of A.ids) close(A.rows[i].pred[id], B.rows[i].pred[id], 1e-12, `row ${i} ${id}`);
});

test('scoreModels: naive U = 1, ensemble weights sum to 1, coverage in [0,1]', () => {
  const W = GE.walkForward(walk(900, 11), null, { lastCompleted: 899 }), S = GE.scoreModels(W.rows, W.ids);
  close(S.res.naive.theilU, 1); assert.ok(S.cov68 >= 0 && S.cov68 <= 1 && S.cov95 >= S.cov68);
  const w = W.rows.at(-1).w; close(Object.values(w).reduce((s, x) => s + x, 0), 1, 1e-12);
  assert.equal(W.rows.at(-1).actual, null); // last row is the live forecast
});

test('morningCheck pairs the 09:00 IST open with the prior weekday 23:30 bar', () => {
  const mk = (iso, o, c) => { const t = U(iso); return { t, o, h: Math.max(o, c), l: Math.min(o, c), c, v: 1, closeT: t + 30 * 60e3 - 1 }; };
  const bars = [mk('2026-11-18T18:00:00Z', 100, 100), mk('2026-11-19T03:30:00Z', 101, 101)]; // Wed 23:30 IST → Thu 09:00 IST
  const daily = [{ date: '2026-11-18' }], rows = [{ t: 0, sigma: 0.01 }];
  const m = GE.morningCheck(bars, daily, rows, U('2026-11-20T00:00:00Z'));
  assert.equal(m.n, 1); close(m.rows[0].r, Math.log(1.01)); assert.equal(m.rows[0].anchorUsd, 100); assert.equal(m.rows[0].openUsd, 101); assert.ok(m.rows[0].s > 0 && m.rows[0].s < 0.01);
});

test('scorecard returns bounded factors and score', () => {
  const p = walk(400, 3), daily = p.map((x, i) => ({ inr: x * 1000, date: String(i) }));
  const c = GE.scorecard(daily, { r: 0.001, sigma: 0.01 }, 0);
  assert.ok(c.score >= -1 && c.score <= 1); for (const f of c.factors) assert.ok(f.v >= -1 && f.v <= 1);
  close(c.factors.reduce((s, f) => s + f.w, 0), 1, 1e-12);
});

test('successStats: band, accuracy and direction shares', () => {
  const rows = [
    { prev: 100, pred: 101, act: 100.8, lo: 99, hi: 102 },  // in band, within 0.5%, direction right
    { prev: 100, pred: 101, act: 98, lo: 99, hi: 102 },     // out of band, error 3.06%, direction wrong
    { prev: 100, pred: 99.5, act: 99, lo: 98, hi: 101 },    // in band, within 0.51% (>0.5%), within 1%, direction right
    { prev: 100, pred: NaN, act: 99, lo: 98, hi: 101 },     // ignored
  ];
  const s = GE.successStats(rows);
  assert.equal(s.n, 3); close(s.band68, 2 / 3); close(s.within05, 1 / 3); close(s.within1, 2 / 3); close(s.direction, 2 / 3);
  close(s.maeAbs, (0.2 + 3 + 0.5) / 3, 1e-12);
  assert.equal(GE.successStats([]), null);
});

test('dutyAt follows the schedule and the current setting', () => {
  assert.equal(GE.dutyAt('2020-12-31', 15), null); assert.equal(GE.dutyAt('2021-02-02', 15), 10.75);
  assert.equal(GE.dutyAt('2023-01-01', 15), 15); assert.equal(GE.dutyAt('2025-01-01', 15), 6);
  assert.equal(GE.dutyAt('2026-05-12', 15), 6); assert.equal(GE.dutyAt('2026-05-13', 12), 12);
});
