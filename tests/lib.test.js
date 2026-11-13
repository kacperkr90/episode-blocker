// lib.js helpers: which URLs count as an episode, when a pause ends, how long wrong passwords wait.
//   node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// lib.js is a plain browser script: run it in a sandbox and take the helpers out of it.
const libPath = path.join(__dirname, '..', 'lib.js');
const { videoKey, nextPauseEnd, lockoutMs } = vm.runInNewContext(
  fs.readFileSync(libPath, 'utf8') + '\n;({ videoKey, nextPauseEnd, lockoutMs })', {}, { filename: libPath });
const key = (url) => videoKey(new URL(url));

test('video pages get a key', () => {
  const cases = {
    'https://www.netflix.com/watch/81234567?trackId=1': 'netflix.com:81234567',
    'https://www.disneyplus.com/play/abc-123': 'disneyplus.com:abc-123',
    'https://www.disneyplus.com/video/abc-123': 'disneyplus.com:abc-123',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ': 'youtube.com:dQw4w9WgXcQ',
    'https://m.youtube.com/watch?v=dQw4w9WgXcQ': 'youtube.com:dQw4w9WgXcQ',
    'https://www.youtube.com/shorts/abcdef123': 'youtube.com:abcdef123',
    'https://www.youtube.com/live/abcdef123': 'youtube.com:abcdef123',
    'https://www.youtube.com/embed/abcdef123': 'youtube.com:abcdef123',
    'https://www.youtubekids.com/watch?v=dQw4w9WgXcQ': 'youtubekids.com:dQw4w9WgXcQ',
    'https://www.cda.pl/video/12345abc/vfilm': 'cda.pl:12345abc',
    'https://vod.tvp.pl/seriale,18/ranczo-odcinki,316445/odcinek-1,S01E01,381046': 'vod.tvp.pl:381046',
    'https://vod.tvp.pl/filmy-dokumentalne,163/some-title,339667': 'vod.tvp.pl:339667',
  };
  for (const [url, expected] of Object.entries(cases)) assert.equal(key(url), expected, url);
});

test('browsing pages are not counted', () => {
  const urls = [
    'https://www.netflix.com/browse',
    'https://www.disneyplus.com/home',
    'https://www.youtube.com/',
    'https://www.youtube.com/results?search_query=x',
    'https://www.youtube.com/watch',
    'https://www.cda.pl/',
    'https://vod.tvp.pl/dla-dzieci,24',
    'https://vod.tvp.pl/dla-dzieci,24/odo-odcinki,1167432',
    'https://vod.tvp.pl/seriale,18/ranczo-odcinki,316445/sezon-1,316446',
    'https://example.com/watch?v=dQw4w9WgXcQ',
  ];
  for (const url of urls) assert.equal(key(url), null, url);
});

test('a pause ends at the next 3:00 local time', () => {
  const at = (d, h, m = 0) => new Date(2026, 10, d, h, m).getTime();
  assert.equal(nextPauseEnd(at(13, 20)), at(14, 3));      // evening: 3:00 the next night
  assert.equal(nextPauseEnd(at(14, 1, 30)), at(14, 3));   // after midnight: 3:00 the same night
  assert.equal(nextPauseEnd(at(14, 3)), at(15, 3));       // exactly 3:00: the following night
});

test('wrong passwords wait longer and longer', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(lockoutMs), [0, 0, 0, 30000, 60000, 120000]);
  assert.equal(lockoutMs(20), 3600000);
});
