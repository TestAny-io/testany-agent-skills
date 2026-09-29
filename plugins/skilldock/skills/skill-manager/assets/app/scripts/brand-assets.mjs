// SPDX-License-Identifier: AGPL-3.0-only
// Regenerate the tab icon and dark artwork after editing src/native-icon.svg. Requires the
// development Chromium or Chrome runtime; normal installs use the saved PNG.
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const svg = await fs.readFile(new URL('../src/native-icon.svg', import.meta.url));
await fs.writeFile(new URL('../src/native-icon-dark.svg', import.meta.url), svg.toString().replace('color="#0764d9"', 'color="#83b6ff"'));
const systemChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'darwin' && existsSync(systemChrome) ? systemChrome : undefined);
const browser = await chromium.launch({ headless: true, executablePath });
try {
  const page = await browser.newPage({ viewport: { width: 64, height: 64 }, deviceScaleFactor: 1 });
  await page.setContent('<style>html,body{margin:0;background:transparent}img{display:block;width:64px;height:64px}</style><img alt="" src="data:image/svg+xml;base64,' + svg.toString('base64') + '">');
  await page.locator('img').evaluate(image => image.decode());
  await page.screenshot({ path: fileURLToPath(new URL('../src/favicon.png', import.meta.url)), omitBackground: true });
} finally { await browser.close(); }
console.log('Generated src/favicon.png and src/native-icon-dark.svg from the shared SkillDock brand mark.');
