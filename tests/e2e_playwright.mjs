import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.cjs';
import { chromium } from 'playwright';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';

test('Playwright E2E: complete verification of new features and fixes', async (t) => {
  // 1. Setup isolated server with local project fixture
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codecity-playwright-'));
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));

  const projectDir = path.join(tempDir, 'demo');
  await fs.mkdir(path.join(projectDir, 'src', 'utils'), { recursive: true });
  await fs.writeFile(
    path.join(projectDir, 'src', 'app.ts'),
    'import { helper } from "./utils/helper";\nexport class App {\n  name: string = "App";\n  run() { helper(); }\n  stop() {}\n}\n'
  );
  await fs.writeFile(
    path.join(projectDir, 'src', 'utils', 'helper.ts'),
    'export function helper() { return 42; }\n'
  );

  const revealed = [];
  const stateFile = path.join(tempDir, 'recent.json');
  const { server, ready } = createApp({
    stateFile,
    reveal: async (...args) => {
      revealed.push(args);
    }
  });
  await ready;

  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => server.close(r)));

  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/`;

  // 2. Launch browser using Edge on Windows or Chrome
  const browser = await chromium.launch({
    channel: process.platform === 'win32' ? 'msedge' : 'chrome',
    headless: true
  });
  t.after(() => browser.close());

  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('PAGE CONSOLE ERROR:', msg.text());
  });

  // 3. Navigate to CodeCity
  await page.goto(baseUrl);
  await page.waitForFunction(() => window.__codecity && document.getElementById('loading').style.display === 'none');

  // Verify removed sections are absent from DOM
  assert.equal(await page.locator('#investigations').count(), 0, 'Investigate section must be removed from DOM');
  assert.equal(await page.locator('#shared-connections').count(), 0, 'Shared connections section must be removed from DOM');

  // 4. Open project via API
  const session = await (await page.request.get(baseUrl + 'api/session')).json();
  const openRes = await page.request.post(baseUrl + 'api/project/open', {
    headers: { 'X-CodeCity-Token': session.token, 'Content-Type': 'application/json' },
    data: JSON.stringify({ path: projectDir })
  });
  assert.equal(openRes.status(), 200, 'Project opened successfully');

  // Reload page to display the opened project
  await page.reload();
  await page.waitForFunction(() => document.body.classList.contains('has-project') && document.getElementById('loading').style.display === 'none');

  // Verify Navigation Hint (#hint) is horizontally centered
  const hintBox = await page.locator('#hint').boundingBox();
  assert.ok(hintBox, 'Hint box must be visible when project is loaded');
  const hintCenter = hintBox.x + hintBox.width / 2;
  const viewportCenter = 1280 / 2;
  assert.ok(
    Math.abs(hintCenter - viewportCenter) < 20,
    `Hint center (${hintCenter}) should match viewport center (${viewportCenter}) within margin`
  );

  // 5. Verify "Open Project Folder" button in topbar
  const openFolderBtn = page.locator('#open-project-folder');
  assert.ok(await openFolderBtn.isVisible(), 'Open project folder button must be visible when project is loaded');

  // Click Open Project Folder
  await openFolderBtn.click();
  await page.waitForTimeout(100);
  assert.ok(revealed.length >= 1, 'Project folder reveal action must be triggered on server');

  // 6. Inspect building details
  await page.locator('#list-btn').click();
  await page.locator('.list-row').first().click();
  await page.locator('#list-close').click();

  const details = page.locator('#details');
  assert.ok(await details.isVisible(), 'Building details panel must be open');

  // 7. Verify Open in File Manager on building
  const revealFileBtn = page.locator('#details-reveal');
  assert.ok(await revealFileBtn.isVisible(), 'Open in file manager button must be visible');
  const preRevealCount = revealed.length;
  await revealFileBtn.click();
  await page.waitForTimeout(100);
  assert.ok(revealed.length > preRevealCount, 'File reveal action must be triggered on server');

  // 8. Verify Open in Editor & Absence of text preview
  assert.equal(await page.locator('.source-preview').count(), 0, 'Source code preview <pre> must be removed');
  const openEditorBtn = page.locator('#details-open-editor');
  assert.ok(await openEditorBtn.isVisible(), 'Open in editor button must be visible');
  const editorSelect = page.locator('#details-editor-select');
  assert.ok(await editorSelect.isVisible(), 'Editor selection dropdown must be visible');

  // Click Open in Editor
  await openEditorBtn.click();
  await page.waitForTimeout(150);
  const editorStatus = await page.locator('#details-editor-status').textContent();
  assert.ok(editorStatus.length > 0, 'Editor status message must be displayed');

  // 9. Verify Folder / District Filter breadcrumbs
  const crumbSection = page.locator('.package-crumbs-section');
  assert.ok(await crumbSection.isVisible(), 'District filter breadcrumb section must be visible');
  const crumbTitle = page.locator('.package-crumbs-title');
  assert.ok(await crumbTitle.isVisible(), 'District filter title must be visible');
  const crumbButtons = page.locator('.package-crumbs button');
  assert.ok(await crumbButtons.count() >= 1, 'At least one crumb button must be present');

  // Click the first crumb button and verify active state toggling
  const firstCrumb = crumbButtons.first();
  await firstCrumb.click();
  assert.ok(await firstCrumb.getAttribute('aria-pressed'), 'Crumb button must have aria-pressed state');

  // 10. Verify Dependency Map
  const depMapSvg = page.locator('.relationship-diagram svg');
  assert.ok(await depMapSvg.isVisible(), 'Dependency map SVG must be visible');

  // 11. Verify Help dialog with Emojis, Diagram and Navigation grid
  await page.locator('#details-close').click();
  await page.locator('#help-btn').click();
  await page.waitForFunction(() => document.getElementById('help').classList.contains('open'));
  const helpModal = page.locator('#help');
  assert.ok(await helpModal.isVisible(), 'Help modal must be open');

  // Check emojis in headings
  const headings = await page.locator('#help h3').allTextContents();
  assert.ok(headings.some((h) => h.includes('🚀')), 'Help must contain 🚀 emoji heading');
  assert.ok(headings.some((h) => h.includes('📐')), 'Help must contain 📐 emoji heading');
  assert.ok(headings.some((h) => h.includes('🧭')), 'Help must contain 🧭 emoji heading');

  // Check 3D building dimension diagram
  assert.ok(await page.locator('.help-visual-card svg').isVisible(), '3D Building dimension diagram must be rendered');

  // Check Navigation control grid
  assert.ok(await page.locator('.help-nav-grid').isVisible(), 'Navigation control grid must be rendered');
  assert.equal(await page.locator('.help-nav-item').count(), 4, 'Must have 4 navigation control items');

  // Close help
  await page.locator('#help-close').click();
  assert.ok(!await helpModal.isVisible(), 'Help modal must close cleanly');
});
