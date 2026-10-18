import assert from 'node:assert/strict';
import { createApp } from '../server/app.cjs';
import { chromium } from 'playwright';
import os from 'node:os';
import path from 'node:path';

// Regression test for selection rendering: picking a building must illuminate
// its neighbours and keep every other building solid. Fading the rest used to
// read as a grey point cloud, worst on the instanced (>=500 buildings) path,
// where alphaHash dithers any material below full opacity.
const stateFile = path.join(os.tmpdir(), 'codecity-selection-test', 'recent.json');
const { server, ready } = createApp({ stateFile });
await ready;
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));

try {
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__codecity, null, { timeout: 90000 });

  const result = await page.evaluate(async () => {
    const { City } = await import('/src/city.js');
    const scene = window.__codecity.scene;
    const failures = [];
    const expect = (ok, message) => { if (!ok) failures.push(message); };

    const makeCity = (n) => new City({
      meta: { source: 'scan', root: 'fixture', totals: { buildings: n, districts: 1, roads: 4, loc: n * 10 } },
      districts: [{ id: 'src', name: 'src', depth: 1 }],
      buildings: Array.from({ length: n }, (_, i) => ({
        id: `b${i}`, name: `Module ${i}`, file: `src/mod${i}.ts`, district: 'src', kind: 'class',
        language: 'typescript', loc: 10 + (i % 40), nom: 1 + (i % 7), noa: 1 + (i % 5),
        methods: 1, attributes: 1, start_line: 1, end_line: 10, members: [],
      })),
      roads: [
        { a: 'b0', b: 'b1', weight: 2 }, { a: 'b1', b: 'b0', weight: 1 }, { a: 'b2', b: 'b0', weight: 3 },
      ],
    }, scene, { asyncRouting: false });

    // Small city: neighbours take direction colours, everything stays opaque.
    const small = makeCity(4);
    const [a, b, c, other] = ['b0', 'b1', 'b2', 'b3'].map((id) => small.byBuilding.get(id));
    small.select(a.body);
    expect(b.matFull.emissive.getHexString() === 'c084fc' && c.matFull.emissive.getHexString() === '38bdf8', 'direction colours wrong');
    expect(other.matFull.transparent === false && other.matFull.opacity === 1, 'selection ghosted an unrelated building');
    expect(other.matFull.emissive.getHexString() === 'ffd79a' && other.matFull.emissiveIntensity === 0, 'unrelated building was tinted');
    const rising = b.matFull.emissiveIntensity;
    small.update(0.2);
    expect(b.matFull.emissiveIntensity > rising, 'related building did not pulse');
    for (let i = 0; i < 10; i++) small.update(0.1);
    small.select(c.body);
    expect(b.matFull.opacity === 1 && a.matFull.emissive.getHexString() === 'fbbf24', 'new selection kept the previous dimming');
    small.setStreetMode('off');
    expect(b.matFull.opacity === 1, 'off mode dimmed buildings');
    small.setStreetMode('selected');
    small.select(null);
    expect([...small.byBuilding.values()].every((e) => e.matFull.opacity === 1), 'clearing the selection kept buildings dimmed');
    small.dispose();

    // Large city: the instanced path must not fade instances either.
    const large = makeCity(600);
    const largeOther = large.byBuilding.get('b3');
    large.select(large.byBuilding.get('b0').body);
    const opacities = [...large.instances.geometry.getAttribute('instanceOpacity').array];
    expect(!!large.instances, 'large city is not instanced');
    expect(opacities.every((value) => value === 1), `${opacities.filter((value) => value < 1).length} instances faded while selected`);
    expect([...large.byBuilding.values()].every((e) => !e.matFull.transparent && e.matFull.opacity === 1), 'instanced materials turned translucent');
    expect(largeOther.matFull.opacity === 1, 'instanced building ghosted');
    large.dispose();

    return failures;
  });

  assert.deepEqual(result, [], `selection rendering regressed: ${result.join(' | ')}`);
  assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join(' | ')}`);
  console.log('selection rendering: neighbours highlighted, no ghosted buildings');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
