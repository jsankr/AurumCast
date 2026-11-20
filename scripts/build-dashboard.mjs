// Builds docs/index.html (the live browser dashboard) from src/dashboard.html + src/engine.cjs + src/app.js
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const R = join(dirname(fileURLToPath(import.meta.url)), '..'), rd = f => readFileSync(join(R, f), 'utf8');
const html = rd('src/dashboard.html')
  .replace('<script>/*ENGINE*/</script>', () => `<script>\n${rd('src/engine.cjs')}\n</script>`)
  .replace('<script>/*APP*/</script>', () => `<script>\n${rd('src/app.js')}\n</script>`);
if (html.includes('/*ENGINE*/') || html.includes('/*APP*/')) throw new Error('template markers not replaced');
// Publish the app at BOTH the repo root and /docs, with Jekyll disabled in both, so GitHub Pages serves the
// application (not README.md) whichever folder is selected in Settings → Pages.
mkdirSync(join(R, 'docs'), { recursive: true });
for (const f of ['index.html', 'docs/index.html']) writeFileSync(join(R, f), html);
for (const f of ['.nojekyll', 'docs/.nojekyll']) writeFileSync(join(R, f), '');
console.log(`index.html + docs/index.html ${html.length} bytes, .nojekyll in both`);
