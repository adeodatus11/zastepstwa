import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const directory = path.dirname(fileURLToPath(import.meta.url));
const executablePath = process.env.KIOSK_ELECTRON_PATH || require('electron');
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'kiosk-smoke-'));
const HOME = 'https://nauczyciel.szkolamistrzow.info/';
let app;
async function launch(offline = false) {
  app = await electron.launch({ executablePath, args: [path.join(directory, 'smoke-fixture.cjs')], env: {
    ...process.env, KIOSK_TEST_PROFILE: profile, KIOSK_TEST_SITE: path.resolve(directory, '../dist'), KIOSK_TEST_OFFLINE: offline ? '1' : '0'
  }});
  for (let i = 0; i < 30; i++) {
    const page = app.windows().filter(p => !p.isClosed()).at(-1) || await app.firstWindow();
    try { await page.locator('#data-status[data-loaded="true"]').waitFor({ timeout:1000 }); return page; } catch {}
  }
  throw Error('Nie wczytano danych strony');
}
async function sync(offline) {
  await app.evaluate(({ ipcMain, BrowserWindow }, offline) => {
    globalThis.kioskTestOffline = offline;
    // Ten sam kanał, którego używa preload po zmianie stanu połączenia.
    ipcMain.emit('kiosk:connection', {sender:BrowserWindow.getAllWindows()[0].webContents}, true);
  }, offline);
}
try {
  let page = await launch();
  await expect(page.locator('#kiosk-connection-status')).toContainText('Pobrano:');
  const saved = JSON.parse(await fs.readFile(path.join(profile,'offline/site.json')));
  await page.goto(HOME+'plan.html');
  await page.locator('#data-status[data-loaded="true"]').waitFor();
  const teacher = await page.locator('#entity option').evaluateAll(options => options.find(o => o.value)?.value);
  assert.ok(teacher, 'dostępna lista nauczycieli');
  await page.locator('.selector-details').evaluate(element => { element.open = true; });
  await page.locator('#entity').selectOption(teacher);
  await page.evaluate(teacher => { localStorage.setItem('my-teacher',teacher); sessionStorage.setItem('plan-context','teacher='+teacher); },teacher);
  await sync(true);
  await expect(page.locator('#kiosk-connection-status')).toContainText('Tryb offline');
  const label = await page.locator('#kiosk-connection-status div').innerText();
  assert.ok(label.includes(new Date(saved.downloadedAt).toLocaleString('pl-PL',{timeZone:'Europe/Warsaw'})));
  await page.screenshot({path:'/tmp/kiosk-offline-preview.png'});
  await page.goto(HOME+'calendar-2026-2027.html');
  await page.locator('#data-status[data-loaded="true"]').waitFor();
  await expect(page.locator('#kiosk-connection-status')).toContainText('Tryb offline');
  await page.goto(HOME+'plan.html');
  await page.locator('#data-status[data-loaded="true"]').waitFor();
  await page.mouse.move(150,150);
  await new Promise(resolve=>setTimeout(resolve,10000));
  await page.mouse.move(250,250);
  await new Promise(resolve=>setTimeout(resolve,6000));
  assert.equal(page.isClosed(),false,'aktywność przedłuża sesję offline');
  page=await app.waitForEvent('window',{timeout:12000});
  await page.waitForURL(HOME);
  await page.locator('#data-status[data-loaded="true"]').waitFor();
  await expect(page.locator('#kiosk-connection-status')).toContainText('Tryb offline');
  assert.deepEqual(await page.evaluate(()=>[localStorage.getItem('my-teacher'),sessionStorage.getItem('plan-context')]),[null,null]);
  assert.equal(JSON.parse(await fs.readFile(path.join(profile,'offline/site.json'))).downloadedAt,saved.downloadedAt);
  console.log('PASS: prawdziwa strona Astro offline, nawigacja, czas kopii, reset 15 s i czyszczenie wyboru bez usuwania danych.');
  await app.close(); app=null;
  page=await launch(true);
  await expect(page.locator('#kiosk-connection-status')).toContainText('Tryb offline');
  await page.goto(HOME+'plan.html');
  await page.locator('#data-status[data-loaded="true"]').waitFor();
  console.log('PASS: ponowne uruchomienie bez Internetu zachowuje plan i zastępstwa.');
  await app.evaluate(()=>{globalThis.kioskTestNewPublication=true;});
  const recoveredWindow = app.waitForEvent('window', {timeout:15000});
  await sync(false);
  await expect.poll(async()=>JSON.parse(await fs.readFile(path.join(profile,'offline/site.json'))).publishedAt).toBe('2026-09-08T09:00:00Z');
  const active=await recoveredWindow;
  await active.locator('#data-status[data-loaded="true"]').waitFor();
  await expect(active.locator('#kiosk-connection-status')).not.toContainText('Tryb offline');
  console.log('PASS: odzyskanie połączenia pobiera nową kompletną publikację.');
  await app.close(); app=null;
  await fs.rm(profile,{recursive:true,force:true}); await fs.mkdir(profile);
  app=await electron.launch({executablePath,args:[path.join(directory,'smoke-fixture.cjs')],env:{...process.env,KIOSK_TEST_PROFILE:profile,KIOSK_TEST_SITE:path.resolve(directory,'../dist'),KIOSK_TEST_OFFLINE:'1'}});
  const empty=await app.firstWindow();
  await expect(empty.locator('h1')).toContainText('Nie ma jeszcze zapisanej kopii');
  await expect(empty.locator('#kiosk-connection-status')).toContainText('Brak zapisanych danych');
  console.log('PASS: pierwsze uruchomienie offline jasno informuje o braku kopii.');
} finally {
  if(app) await app.close();
  await fs.rm(profile,{recursive:true,force:true});
}
