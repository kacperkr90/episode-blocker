#!/usr/bin/env node
// Writes the site match patterns from SITES (lib.js) into the three lists in manifest.json:
// host_permissions, content_scripts[0].matches and web_accessible_resources[0].matches.
//   node tools/sync-manifest.js          update manifest.json
//   node tools/sync-manifest.js --check  only report; exit 1 if manifest.json is out of date
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const libPath = path.join(root, 'lib.js');
const manifestPath = path.join(root, 'manifest.json');
const check = process.argv.includes('--check');

// lib.js is a plain browser script: run it in a sandbox and take SITES out of it.
const SITES = vm.runInNewContext(fs.readFileSync(libPath, 'utf8') + '\n;SITES', {}, { filename: libPath });

// Each pattern's host must be recognized by the site's own host regex, or the lock page and
// video detection would ignore pages the manifest lets the content script run on.
const errors = [];
for (const s of SITES) {
  if (!s.matches || !s.matches.length) errors.push(`${s.name}: no match patterns`);
  for (const p of s.matches || []) {
    const m = p.match(/^https:\/\/(\*\.)?([^/*]+)\/\*$/);
    if (!m) errors.push(`${s.name}: unsupported pattern ${p}`);
    else if (!s.host.test(m[2])) errors.push(`${s.name}: ${m[2]} (from ${p}) does not match ${s.host}`);
  }
}
if (errors.length) {
  errors.forEach((e) => console.error(e));
  process.exit(1);
}

const patterns = SITES.flatMap((s) => s.matches);
const text = fs.readFileSync(manifestPath, 'utf8');
const manifest = JSON.parse(text);
manifest.host_permissions = patterns;
manifest.content_scripts[0].matches = patterns;
manifest.web_accessible_resources[0].matches = patterns;
const out = JSON.stringify(manifest, null, 2) + (text.endsWith('\n') ? '\n' : '');

if (out === text) {
  console.log('manifest.json is up to date');
} else if (check) {
  console.error('manifest.json is out of date: run node tools/sync-manifest.js');
  process.exit(1);
} else {
  fs.writeFileSync(manifestPath, out);
  console.log('manifest.json updated');
}
