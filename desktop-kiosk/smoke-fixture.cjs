// Wyłącznie testy. Ten plik nie jest dołączany do aplikacji Windows.
const { app, net, screen } = require('electron');
app.whenReady().then(() => {
  const primary = screen.getPrimaryDisplay();
  globalThis.kioskTestDisplays = [{ ...primary, id:101, label:'Laptop testowy', internal:true }];
  if (process.env.KIOSK_TEST_SCREENS === '2') globalThis.kioskTestDisplays.push({ ...primary, id:202, label:'TV HDMI testowy', internal:false, bounds:{ ...primary.bounds, x:primary.bounds.x+primary.bounds.width } });
  screen.getAllDisplays = () => globalThis.kioskTestDisplays;
  screen.getPrimaryDisplay = () => globalThis.kioskTestDisplays[0];
});
const fs = require('node:fs/promises');
const path = require('node:path');
if (!process.env.KIOSK_TEST_PROFILE || !process.env.KIOSK_TEST_SITE) throw Error('Brak konfiguracji testu');
app.setPath('userData', process.env.KIOSK_TEST_PROFILE);
globalThis.kioskTestOffline = process.env.KIOSK_TEST_OFFLINE === '1';
globalThis.kioskTestNewPublication = false;
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.woff':'font/woff', '.woff2':'font/woff2', '.png':'image/png', '.webp':'image/webp' };
net.fetch = async url => {
  if (globalThis.kioskTestOffline) throw Error('Test: brak Internetu');
  const pathname = new URL(url).pathname;
  const file = path.join(process.env.KIOSK_TEST_SITE, pathname === '/' ? 'index.html' : decodeURIComponent(pathname));
  try {
    let bytes = await fs.readFile(file);
    if (globalThis.kioskTestNewPublication && pathname === '/data/manifest.json') {
      const manifest = JSON.parse(bytes); manifest.generatedAt = '2026-09-08T09:00:00Z'; bytes = Buffer.from(JSON.stringify(manifest));
    }
    return new Response(bytes, { headers: { 'content-type':types[path.extname(file)] || 'application/octet-stream' } });
  } catch { return new Response('', { status:404 }); }
};
require('./main.cjs');
