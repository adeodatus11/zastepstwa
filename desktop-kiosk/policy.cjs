const HOME = 'https://nauczyciel.szkolamistrzow.info/';
const IDLE_MS = 15_000;
function allowed(url) {
  try {
    const parsed = new URL(url);
    return parsed.origin === new URL(HOME).origin && !parsed.username && !parsed.password;
  } catch { return false; }
}
function createIdle(onIdle, now = Date.now) {
  let last = now();
  let armed = false;
  return {
    activity() { last = now(); armed = true; },
    disarm() { armed = false; },
    isArmed() { return armed; },
    check() {
      if (armed && now() - last >= IDLE_MS) {
        armed = false;
        onIdle();
      }
    }
  };
}
module.exports = { HOME, IDLE_MS, allowed, createIdle };
