// Builds docs/index.html (the live browser dashboard) from src/dashboard.html + src/engine.cjs + src/app.js
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const R = join(dirname(fileURLToPath(import.meta.url)), '..'), rd = f => readFileSync(join(R, f), 'utf8');
const html = rd('src/dashboard.html')
  .replace('<script>/*ENGINE*/</script>', () => `<script>\n${rd('src/engine.cjs')}\n</script>`)
  .replace('<script>/*APP*/</script>', () => `<script>\n${rd('src/app.js')}\n</script>`);
if (html.includes('/*ENGINE*/') || html.includes('/*APP*/')) throw new Error('template markers not replaced');
mkdirSync(join(R, 'docs'), { recursive: true });
writeFileSync(join(R, 'docs/index.html'), html);
console.log(`docs/index.html ${html.length} bytes`);
