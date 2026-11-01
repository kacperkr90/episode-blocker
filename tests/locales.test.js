// Translations: every locale has the same keys, and every key the code uses exists.
//   node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const locales = fs.readdirSync(path.join(root, '_locales'));
const messages = Object.fromEntries(locales.map((l) => [l, JSON.parse(read(`_locales/${l}/messages.json`))]));

test('all locales have the same keys', () => {
  const en = Object.keys(messages.en).sort();
  for (const l of locales) assert.deepEqual(Object.keys(messages[l]).sort(), en, `_locales/${l}`);
});

test('keys used in code, pages and manifest exist', () => {
  const used = new Set();
  for (const f of fs.readdirSync(root)) {
    const text = f.endsWith('.js') || f.endsWith('.html') || f === 'manifest.json' ? read(f) : '';
    for (const m of text.matchAll(/\bt\('(\w+)'/g)) used.add(m[1]);
    for (const m of text.matchAll(/\bt\([\w.]+ \?'(\w+)' : '(\w+)'/g)) used.add(m[1]).add(m[2]);
    if (f.endsWith('.html')) for (const m of text.matchAll(/data-i18n="(\w+)"/g)) used.add(m[1]);
    for (const m of text.matchAll(/__MSG_(\w+)__/g)) used.add(m[1]);
  }
  assert.ok(used.size > 0);
  for (const k of used) assert.ok(k in messages.en, `missing key: ${k}`);
});
