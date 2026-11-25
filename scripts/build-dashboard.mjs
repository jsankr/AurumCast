// Builds docs/index.html (the live browser dashboard) from src/dashboard.html + src/engine.cjs + src/app.js
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const R = join(dirname(fileURLToPath(import.meta.url)), '..'), rd = f => readFileSync(join(R, f), 'utf8');
const html = rd('src/dashboard.html')
  .replace('<script>/*ENGINE*/</script>', () => `<script>\n${rd('src/engine.cjs')}\n</script>`)
  .replace('<script>/*INDIA*/</script>', () => `<script>\n${rd('src/india-market.cjs')}\n</script>`)
  .replace('<script>/*INDIA_UI*/</script>', () => `<script>\n${rd('src/india-ui.js')}\n</script>`)
  .replace('<script>/*APP*/</script>', () => `<script>\n${rd('src/app.js')}\n</script>`)
  .replace('/*REACT_STYLES*/', () => rd('src/react-ui.css'))
  .replace('/*REACT_SHELL*/', () => rd('src/react-shell.js'));
if (html.includes('/*ENGINE*/') || html.includes('/*INDIA*/') || html.includes('/*INDIA_UI*/') || html.includes('/*APP*/') || html.includes('/*REACT_SHELL*/') || html.includes('/*REACT_STYLES*/')) throw new Error('template markers not replaced');
// Prevent a scheduled refresh from silently reverting the UI to the pre-React static layout.
for (const required of ['ReactDOM.createRoot(mount)', 'ac2-hero', 'ac-native-chart', 'id="ac-react-root"', 'AurumBridge', 'id="gComex"', 'id="cGram"', 'id="monitor"', 'id="forecast"', 'id="proof"', 'id="analytics"', 'id="invest"', 'id="data"']) {
  if (!html.includes(required)) throw new Error('Required React UI or legacy module missing from built dashboard: ' + required);
}
// Publish the app at BOTH the repo root and /docs, with Jekyll disabled in both, so GitHub Pages serves the
// application (not README.md) whichever folder is selected in Settings → Pages.
mkdirSync(join(R, 'docs'), { recursive: true });
for (const f of ['index.html', 'docs/index.html']) writeFileSync(join(R, f), html);
for (const f of ['.nojekyll', 'docs/.nojekyll']) writeFileSync(join(R, f), '');
console.log(`index.html + docs/index.html ${html.length} bytes, .nojekyll in both`);
