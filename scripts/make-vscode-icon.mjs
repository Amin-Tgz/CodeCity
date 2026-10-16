// Render assets/codecity.svg to the square PNG the VS Code extension requires.
// VS Code rejects SVG icons, so this produces extensions/vscode/icon.png.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZE = 256;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'assets', 'codecity.svg');
const output = path.join(root, 'extensions', 'vscode', 'icon.png');

// Prefer the Playwright-managed browser, then fall back to an installed channel
// or any previously downloaded Chromium build (offline-friendly).
async function launchChromium() {
  const candidates = [
    {},
    { channel: process.platform === 'win32' ? 'msedge' : 'chrome' }
  ];
  const cache = process.platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA || os.homedir(), 'ms-playwright')
    : path.join(os.homedir(), '.cache', 'ms-playwright');
  try {
    const entries = await fs.readdir(cache, { withFileTypes: true });
    for (const entry of entries.filter(e => /^chromium-\d+$/.test(e.name))) {
      for (const rel of ['chrome-win64/chrome.exe', 'chrome-win/chrome.exe', 'chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
        const exe = path.join(cache, entry.name, rel);
        if (await fs.access(exe).then(() => true, () => false)) candidates.push({ executablePath: exe });
      }
    }
  } catch { /* no cache directory */ }
  let lastError;
  for (const options of candidates) {
    try { return await chromium.launch(options); } catch (error) { lastError = error; }
  }
  throw lastError;
}

const svg = (await fs.readFile(source, 'utf8')).replace(/<\?xml[^>]*\?>/, '').trim();
const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0}html,body{width:${SIZE}px;height:${SIZE}px;background:transparent}
svg{display:block;width:${SIZE}px;height:${SIZE}px}</style></head><body>${svg}</body></html>`;

const browser = await launchChromium();
try {
  const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  await fs.mkdir(path.dirname(output), { recursive: true });
  await page.screenshot({ path: output, omitBackground: true });
  console.log(`Wrote ${path.relative(root, output)} (${SIZE}x${SIZE}).`);
} finally {
  await browser.close();
}
