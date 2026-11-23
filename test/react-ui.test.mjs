import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
test('published HTML files contain the same React application', () => {
 const a = read('index.html'), b = read('docs/index.html');
 assert.equal(a, b, 'GitHub Pages root and docs builds must not diverge');
 for (const marker of [
  'R.createRoot(mount)', 'id="ac-react-root"', 'ac2-hero', 'ac-native-chart',
  'AurumBridge', 'ac2-table', 'ac2-calculator', 'ac2-modal',
  'id="monitor"', 'id="forecast"', 'id="proof"', 'id="analytics"', 'id="invest"', 'id="data"'
 ]) assert.ok(a.includes(marker), 'Missing UI or legacy module: ' + marker);
 for (const marker of ['/*ENGINE*/', '/*APP*/', '/*REACT_STYLES*/', '/*REACT_SHELL*/'])
  assert.ok(!a.includes(marker), 'Unresolved build marker: ' + marker);
});
test('React source and bridge are syntactically valid and keep original engine in place', () => {
 const shell = read('src/react-shell.js'), app = read('src/app.js');
 assert.doesNotThrow(() => new Function(shell));
 assert.doesNotThrow(() => new Function(app));
 assert.ok(app.includes('window.AurumBridge ='));
 assert.ok(app.includes('GE.walkForward('));
 assert.ok(app.includes('GE.scoreModels('));
 assert.ok(app.includes('GE.rates('));
 assert.ok(shell.includes("window.addEventListener('aurum:update'"));
 assert.ok(shell.includes('window.echarts'));
 assert.ok(shell.includes('AurumBridge.calibrate'));
});
test('live quotes never use a mock-data default', () => {
 const shell = read('src/react-shell.js');
 assert.ok(shell.includes("if(!market.ready||!ref.current||!window.echarts||instrument==='silver')return"));
 assert.ok(shell.includes('Fetching and validating live gold and FX data'));
 assert.ok(!/Math\.random\(/.test(shell));
});

test('reference architecture presents four market tiles, chart tabs, forecasts and four insights', () => {
 const shell=read('src/react-shell.js'),css=read('src/react-ui.css'),page=read('index.html');
 for(const token of [
  "Silver · MCX", "Gold (MCX)", "USD/INR", "Short Term", "Medium Term", "Long Term",
  "Market Sentiment", "Technical Indicators", "Prediction Accuracy", "Quick Tools",
  "function Alerts(", "ac3-instrument-tabs", "ac3-accuracy-circle", "historicalCoverage"
 ]) assert.ok(shell.includes(token),'Missing React component or control: '+token);
 for(const token of ['ac2-metrics','ac2-main-grid','ac2-mini-grid','assets/aurum-hero.svg'])
  assert.ok(css.includes(token),'Missing layout/art: '+token);
 assert.ok(page.includes('function Alerts('));
 assert.equal(read('assets/aurum-hero.svg'),read('docs/assets/aurum-hero.svg'));
});
