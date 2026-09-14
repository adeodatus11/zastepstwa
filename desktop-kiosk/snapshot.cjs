const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { HOME, allowed } = require('./policy.cjs');
const MAX_BYTES = 64 * 1024 * 1024;
const MAX_FILES = 250;
const ASSET = /\.(?:html?|js|mjs|css|json|xlsx|xml|png|jpe?g|webp|svg|ico|woff2?|ttf)$/i;
const CDN = new Set(['https://cdn.sheetjs.com', 'https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com']);
function keyOf(value, base = HOME) {
  try {
    const url = new URL(value.replaceAll('&amp;', '&'), base);
    if (url.username || url.password) return null;
    if (!allowed(url.href) && !(CDN.has(url.origin) && /\.(?:js|css|woff2?|ttf)$/.test(url.pathname))) return null;
    url.hash = ''; url.search = '';
    if (url.pathname === '/index.html') url.pathname = '/';
    return url.href;
  } catch { return null; }
}
function discover(body, type, base) {
  const links = new Map();
  const add = (value, required = true) => {
    if (!value || /[${}\s<>]/.test(value) || value.startsWith('#') || value.includes('\\')) return;
    if (value.startsWith('_astro/')) value = '/' + value;
    const key = keyOf(value, base);
    if (!key || (!ASSET.test(new URL(key).pathname) && key !== HOME)) return;
    links.set(key, (links.get(key) || false) || required);
  };
  if (/html/.test(type)) {
    for (const match of body.matchAll(/<(?:script|img|link|a)\b[^>]*\b(?:src|href)\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
      // Nawigacyjne linki mogą prowadzić do usuniętych dokumentów; kod i style są wymagane.
      add(match[1], !/^<a\b/i.test(match[0]));
    }
    for (const match of body.matchAll(/\bsrcset\s*=\s*["']([^"']+)["']/gi))
      for (const entry of match[1].split(',')) add(entry.trim().split(/\s+/)[0]);
    // Starsza wersja serwisu ma nazwy plików danych w skryptach inline.
    for (const match of body.matchAll(/["'`]([^"'`\n]+\.(?:json|xlsx|xml|js|css)(?:\?[^"'`\n]*)?)["'`]/g)) add(match[1], false);
  }
  if (/javascript/.test(type) && allowed(base)) {
    for (const match of body.matchAll(/["'`]([^"'`\n]+\.(?:m?js|css|json|xlsx)(?:\?[^"'`\n]*)?)["'`]/g)) add(match[1]);
  }
  if (/css/.test(type)) {
    for (const match of body.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)) add(match[1]);
  }
  return links;
}
function validateBody(url, type, bytes) {
  const pathname = new URL(url).pathname;
  if (!bytes.length) throw Error('Pusty plik: ' + url);
  if (/\.json$/.test(pathname)) JSON.parse(bytes.toString('utf8'));
  if (/\.xlsx$/.test(pathname) && !(bytes.subarray(0, 2).toString() === 'PK' || bytes.subarray(0, 4).toString('hex') === 'd0cf11e0')) throw Error('Nieprawidłowy arkusz: ' + url);
  if (/\.(?:js|css|json|xlsx|woff2?)$/.test(pathname) && /html/.test(type)) throw Error('Serwer zwrócił HTML zamiast pliku: ' + url);
  if ((pathname === '/' || /\.html?$/.test(pathname)) && !/<(?:!doctype|html)\b/i.test(bytes.toString('utf8'))) throw Error('Nieprawidłowa strona: ' + url);
}
class SnapshotStore {
  constructor(directory, fetcher, onStatus = () => {}) {
    this.directory = directory; this.fetcher = fetcher; this.onStatus = onStatus;
    this.latest = null; this.online = false; this.busy = false;
  }
  async init() {
    try {
      const stat = await fs.stat(path.join(this.directory, 'site.json'));
      if (stat.size > MAX_BYTES * 1.5) throw Error('Za duża kopia');
      const data = JSON.parse(await fs.readFile(path.join(this.directory, 'site.json'), 'utf8'));
      if (data.format !== 1 || !data.entries?.[HOME] || !Number.isFinite(Date.parse(data.downloadedAt))) throw Error('Nieprawidłowa kopia');
      for (const [url, entry] of Object.entries(data.entries)) {
        if (keyOf(url) !== url || typeof entry.body !== 'string' || typeof entry.type !== 'string') throw Error('Nieprawidłowy zasób');
        const bytes = Buffer.from(entry.body, 'base64');
        if (crypto.createHash('sha256').update(bytes).digest('hex') !== entry.hash) throw Error('Uszkodzona kopia');
      }
      this.latest = data;
    } catch (error) {
      if (error.code !== 'ENOENT') console.error('Nie można odczytać kopii offline:', error.message);
    }
  }
  async download(url) {
    const response = await this.fetcher(url, {
      cache: 'no-store', credentials: 'omit', redirect: 'error',
      signal: AbortSignal.timeout(12000), bypassCustomProtocolHandlers: true
    });
    if (!response.ok) { const error = Error('HTTP ' + response.status + ': ' + url); error.status = response.status; throw error; }
    if (Number(response.headers.get('content-length')) > MAX_BYTES) throw Error('Za duży plik');
    const reader = response.body.getReader(); const chunks = []; let size = 0;
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); throw Error('Za duży plik'); }
      chunks.push(Buffer.from(value));
    }
    const bytes = Buffer.concat(chunks);
    const type = response.headers.get('content-type') || 'application/octet-stream';
    validateBody(url, type, bytes);
    return { type, body: bytes.toString('base64'), hash: crypto.createHash('sha256').update(bytes).digest('hex') };
  }
  async sync() {
    if (this.busy) return false;
    this.busy = true;
    try {
      const entries = Object.create(null), queue = new Map([[HOME, true], [new URL('tv.html', HOME).href, true]]), seen = new Set();
      let bytes = 0, manifest = null, firstManifest = null;
      const manifestURL = new URL('/data/manifest.json', HOME).href;
      try {
        firstManifest = await this.download(manifestURL);
        manifest = JSON.parse(Buffer.from(firstManifest.body, 'base64'));
        const { assertManifest } = await import('./schema.mjs'); assertManifest(manifest);
        entries[manifestURL] = firstManifest;
        for (const url of Object.values(manifest.files)) queue.set(keyOf(url), true);
      } catch (error) { if (error.status !== 404) throw error; }
      const started = Date.now();
      while (queue.size) {
        if (Date.now() - started > 120000 || seen.size > MAX_FILES) throw Error('Kopia przekracza limit');
        const batch = [...queue].slice(0, 4);
        for (const [url] of batch) { queue.delete(url); seen.add(url); }
        const downloaded = await Promise.all(batch.map(async ([url, required]) => {
          try {
            // Zasoby Astro mają hash w nazwie i nie zmieniają treści pod tym samym adresem.
            const cached = new URL(url).pathname.startsWith('/_astro/') && this.latest?.entries[url];
            return [url, cached || await this.download(url)];
          } catch (error) { if (!required && error.status === 404) return null; throw error; }
        }));
        for (const result of downloaded) {
          if (!result) continue;
          const [url, entry] = result; entries[url] = entry;
          bytes += Buffer.byteLength(entry.body, 'base64');
          if (bytes > MAX_BYTES) throw Error('Za duża kopia');
          for (const [link, required] of discover(Buffer.from(entry.body, 'base64').toString('utf8'), entry.type, url)) {
            if (!seen.has(link) && !entries[link]) queue.set(link, (queue.get(link) || false) || required);
          }
        }
      }
      if (manifest) {
        const { assertPayload } = await import('./schema.mjs');
        for (const key of ['plan', 'changes', 'calendar', 'contacts']) {
          assertPayload(key, JSON.parse(Buffer.from(entries[keyOf(manifest.files[key])].body, 'base64')));
        }
        const check = await this.download(manifestURL);
        if (check.hash !== firstManifest.hash) throw Error('Publikacja zmieniła się podczas pobierania');
      }
      // Starszy serwis nie ma wersjonowanego manifestu. Sprawdzamy, czy pliki
      // danych nie zmieniły się w trakcie pobierania całej kopii.
      if (!manifest) {
        for (const [url, entry] of Object.entries(entries)) {
          if (allowed(url) && /\.(?:json|xlsx|xml)$/.test(new URL(url).pathname)) {
            if ((await this.download(url)).hash !== entry.hash) throw Error('Dane zmieniły się podczas pobierania');
          }
        }
      }
      const revision = crypto.createHash('sha256').update(JSON.stringify(Object.keys(entries).sort().map(url => [url, entries[url].hash]))).digest('hex');
      const next = { format: 1, downloadedAt: new Date().toISOString(), publishedAt: manifest?.generatedAt || null, revision, entries };
      await fs.mkdir(this.directory, { recursive: true });
      const temporary = path.join(this.directory, 'site.next.json');
      await fs.writeFile(temporary, JSON.stringify(next));
      await fs.rename(temporary, path.join(this.directory, 'site.json'));
      this.latest = next; this.online = true; this.onStatus();
      return true;
    } catch (error) {
      this.online = false; this.onStatus();
      console.error('Zachowano poprzednią kopię offline:', error.message);
      return false;
    } finally { this.busy = false; }
  }
}
module.exports = { SnapshotStore, keyOf, discover };
