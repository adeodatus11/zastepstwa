const { test } = require('node:test');
const assert = require('node:assert/strict');
const { allowed, createIdle } = require('./policy.cjs');
test('tylko HTTPS i właściwa domena', () => {
  for (const url of ['https://nauczyciel.szkolamistrzow.info/', 'https://nauczyciel.szkolamistrzow.info/plan.html?teacher=12#plan']) assert.equal(allowed(url), true);
  for (const url of ['http://nauczyciel.szkolamistrzow.info/', 'https://nauczyciel.szkolamistrzow.info.evil.com', 'https://evil.com', 'javascript:alert(1)', 'file:///tmp/test', 'https://user@nauczyciel.szkolamistrzow.info', 'mailto:test@test.pl', 'invalid']) assert.equal(allowed(url), false);
});
test('reset po 15 s od ostatniej aktywności; bez odświeżania nieużywanego pulpitu', () => {
  let now = 0, resets = 0;
  const idle = createIdle(() => resets++, () => now);
  now = 20000; idle.check(); assert.equal(resets, 0);
  idle.activity(); now += 14999; idle.check(); assert.equal(resets, 0);
  idle.activity(); now += 14999; idle.check(); assert.equal(resets, 0);
  now++; idle.check(); assert.equal(resets, 1);
  now += 30000; idle.check(); assert.equal(resets, 1);
  idle.activity(); now += 15000; idle.check(); assert.equal(resets, 2);
  idle.activity(); idle.disarm(); now += 15000; idle.check(); assert.equal(resets, 2);
});
