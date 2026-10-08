const test = require('node:test');
const assert = require('node:assert/strict');
const {compatibleNode} = require('../server/runtime.cjs');
test('runtime accepts the minimum and newer releases', () => {
  for (const version of ['22.13.0', 'v22.13.1', '22.20.0', '24.0.0', '26.1.0']) assert.equal(compatibleNode(version), true, version);
});
test('runtime rejects older or malformed versions', () => {
  for (const version of ['22.12.9', '20.19.0', '18.0.0', '', 'latest', null, '22.13', '22.13.0-pre']) assert.equal(compatibleNode(version), false, String(version));
});
