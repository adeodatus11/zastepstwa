const { ipcRenderer } = require('electron');
for (const name of ['pointerdown', 'pointermove', 'pointerup', 'wheel', 'keydown', 'touchstart', 'touchmove']) {
  window.addEventListener(name, event => {
    if (!event.isTrusted) return;
    if (name === 'pointermove' && event.pointerType !== 'touch' && event.movementX === 0 && event.movementY === 0) return;
    ipcRenderer.send('kiosk:activity');
  }, { capture: true, passive: true });
}
// Drukowanie otwiera systemowe okno poza kioskiem.
window.addEventListener('DOMContentLoaded', () => {
  for (const button of document.querySelectorAll('#print')) button.hidden = true;
});

// Niezależny od strony komunikat pozostaje widoczny także po nawigacji i resecie.
let latestStatus;
let label;
let fitTV;
function prepareTV(state) {
  if (!state?.tv || !label || fitTV || !document.body.classList.contains('tv-mode')) return;
  const host = document.getElementById('kiosk-connection-status');
  const style = getComputedStyle(document.body);
  const width = parseFloat(style.width), height = parseFloat(style.height);
  if (!(width > 0 && height > 0)) return;
  const stage = document.createElement('div'); stage.id = 'kiosk-tv-stage';
  for (const child of [...document.body.childNodes]) if (child !== host) stage.append(child);
  document.body.prepend(stage);
  document.body.style.width = '100vw'; document.body.style.height = '100vh';
  stage.style.cssText = `position:absolute;width:${width}px;height:${height}px;transform-origin:top left;overflow:hidden`;
  fitTV = () => {
    const available = Math.max(1, innerHeight - host.offsetHeight);
    const scale = Math.min(innerWidth / width, available / height);
    stage.style.transform = `scale(${scale})`;
    stage.style.left = `${Math.max(0, (innerWidth - width * scale) / 2)}px`;
    stage.style.top = `${Math.max(0, (available - height * scale) / 2)}px`;
  };
  window.addEventListener('resize', fitTV);
  new ResizeObserver(fitTV).observe(host);
  fitTV();
}
function showStatus(state) {
  if (!state) return;
  latestStatus = state;
  if (!label) return;
  prepareTV(state);
  const date = value => new Date(value).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' });
  label.style.background = state.online ? '#edf5ee' : '#fff1c2';
  label.style.borderColor = state.online ? '#aac4b1' : '#b9810a';
  label.textContent = !state.downloadedAt
    ? 'Brak zapisanych danych. Trwa próba pobrania kopii serwisu.'
    : `${state.online ? 'Kopia serwisu' : 'Tryb offline — wyświetlamy ostatnią zapisaną kopię'}. Pobrano: ${date(state.downloadedAt)}.`
      + (state.publishedAt ? ` Publikacja danych: ${date(state.publishedAt)}.` : '')
      + (!state.online ? ' Dane mogą być nieaktualne.' : '')
      + (state.pending ? ' Nowa kopia jest gotowa i pojawi się po zakończeniu sesji.' : '');
}
ipcRenderer.on('kiosk:status', (_event, state) => showStatus(state));
window.addEventListener('DOMContentLoaded', async () => {
  const host = document.createElement('aside');
  host.id = 'kiosk-connection-status';
  host.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:2147483647;display:block';
  const shadow = host.attachShadow({ mode: 'open' });
  label = document.createElement('div');
  label.setAttribute('role', 'status'); label.setAttribute('aria-live', 'polite');
  label.style.cssText = 'padding:12px 20px;border-top:2px solid;font:600 17px/1.4 "Segoe UI",sans-serif;color:#302714;box-sizing:border-box;text-align:center';
  shadow.append(label); document.body.append(host);
  const padding = parseFloat(getComputedStyle(document.body).paddingBottom) || 0;
  new ResizeObserver(() => { document.body.style.paddingBottom = `${padding + host.offsetHeight}px`; }).observe(host);
  showStatus(latestStatus || await ipcRenderer.invoke('kiosk:get-status'));
});
for (const event of ['online', 'offline']) window.addEventListener(event, () => ipcRenderer.send('kiosk:connection', navigator.onLine));
