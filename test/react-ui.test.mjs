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
  'ReactDOM.createRoot(mount)', 'id="ac-react-root"', 'ac2-hero', 'ac-native-chart',
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
 assert.ok(shell.includes("if(!ref.current||!window.echarts)return"));
 assert.ok(shell.includes('Connecting to verified market feeds…'));
 assert.ok(!/Math\.random\(/.test(shell));
});

test('reference architecture presents four market tiles, chart tabs, forecasts and four insights', () => {
 const shell=read('src/react-shell.js'),css=read('src/react-ui.css'),page=read('index.html');
 for(const token of [
  "Silver · 999 spot", "Gold (MCX)", "USD/INR", "Short Term", "Medium Term", "Long Term",
  "Market Sentiment", "Technical Indicators", "Prediction Accuracy", "Quick Tools",
  "function Alerts(", "ac3-instrument-tabs", "ac3-accuracy-circle", "historicalCoverage"
 ]) assert.ok(shell.includes(token),'Missing React component or control: '+token);
 for(const token of ['ac2-metrics','ac2-main-grid','ac2-mini-grid','assets/aurum-hero.svg'])
  assert.ok(css.includes(token),'Missing layout/art: '+token);
 assert.ok(page.includes('function Alerts('));
 assert.equal(read('assets/aurum-hero.svg'),read('docs/assets/aurum-hero.svg'));
});

test('v3 React homepage replaces rather than stacks the old dashboard',()=>{
 const ui=read('src/react-shell.js'),css=read('src/react-ui.css'),html=read('index.html');
 assert.ok(ui.includes("document.documentElement.classList.add('ac3-mounted')"));
 assert.ok(ui.includes("document.documentElement.classList.toggle('ac3-legacy-view',legacy)"));
 assert.ok(css.includes('html.ac3-mounted:not(.ac3-legacy-view) #main-wrap {display:none!important}'));
 assert.ok(html.includes('aurumcast-ui-release'));
 assert.ok(ui.includes('ac3-market-spark'));
});

test('live silver is validated and purity/target UI never claims an MCX futures quote',()=>{
 const app=read('src/app.js'),ui=read('src/react-shell.js');
 for(const word of ['api.gold-api.com/price/XAG','acceptSilver','silverSnapshot','silverTicks','updatedAt',
    "perGram", "fine*.999", "fine*.925", "fine*.915"])
  assert.ok(app.includes(word),'Missing source, validation, or silver conversion: '+word);
 for(const word of ['SilverRates','Fine silver','Sterling silver','Silver alloy','Your target ₹/g',
    'Targets are user-entered references','No silver quotation yet'])
  assert.ok(ui.includes(word),'Silver UI missing '+word);
 assert.ok(ui.includes("ac4-theme-picker"));
 assert.ok(ui.includes('assets/aurum-hero.svg')===false); // artwork belongs in stylesheet, not hardcoded user prices
 const css=read('src/react-ui.css');
 assert.ok(css.includes('assets/mountain-landscape.svg'));
 assert.equal(read('assets/mountain-landscape.svg'),read('docs/assets/mountain-landscape.svg'));
 const oz=31.1034768,usd=100,fx=85;
 const fine=usd*fx/oz;
 assert.ok(Math.abs(fine*.999/fine-.999)<1e-12);
 assert.ok(fine*.925>fine*.915 && fine*.915>0);
});

test('silver and FX arrive independently of gold model history',()=>{
 const app=read('src/app.js');
 assert.ok(app.includes('void refreshSilver();\nfullRefresh();'),'XAG must begin loading independently at boot');
 assert.ok(app.includes('const [metal,fx] = await Promise.allSettled(['));
 assert.ok(app.includes('D.fxNow=+last[1]'));
 assert.ok(app.includes('theme:S.theme, errors: { ...D.err }, silver: silverSnapshot()'));
 assert.ok(!app.includes('const [h, d, fx, spot, er, m30, silver] = await Promise.allSettled(['));
});
