import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url), dir=path.dirname(fileURLToPath(import.meta.url));
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'kiosk-screens-'));
const HOME='https://nauczyciel.szkolamistrzow.info/';
let app;
const launch=()=>electron.launch({executablePath:require('electron'),args:[path.join(dir,'smoke-fixture.cjs')],env:{...process.env,KIOSK_TEST_PROFILE:profile,KIOSK_TEST_SITE:path.resolve(dir,'../dist'),KIOSK_TEST_SCREENS:'2'}});
async function pageAt(url) {
  let page;
  await expect.poll(()=>{page=app.windows().find(p=>!p.isClosed()&&p.url()===url);return !!page;},{timeout:15000}).toBe(true);
  return page;
}
async function ready(url) {const page=await pageAt(url);await page.locator('#data-status[data-loaded="true"]').waitFor();return page;}
async function trigger(channel,...args) {
  await app.evaluate(({ipcMain,BrowserWindow},{channel,args})=>{
    const window=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('https:')&&!w.webContents.getURL().endsWith('tv.html'));
    ipcMain.emit(channel,{sender:window.webContents},...args);
  },{channel,args});
}
try {
  app=await launch();
  let settings;
  await expect.poll(()=>{settings=app.windows().find(p=>p.url().endsWith('/settings.html'));return !!settings;}).toBe(true);
  await expect(settings.locator('#kiosk-screen')).toHaveValue('101');
  await expect(settings.locator('#tv-screen')).toHaveValue('202');
  await settings.screenshot({path:'/tmp/kiosk-screen-settings.png'});
  await settings.locator('button[type=submit]').click();
  let kiosk=await ready(HOME),tv=await ready(HOME+'tv.html');
  await expect(tv.locator('#tv-clock')).not.toBeEmpty();
  await expect(tv.locator('#kiosk-tv-stage')).toBeVisible();
  assert.equal(await tv.evaluate(()=>{
    const stage=document.getElementById('kiosk-tv-stage').getBoundingClientRect();
    const banner=document.getElementById('kiosk-connection-status').getBoundingClientRect();
    return stage.left>=-1 && stage.right<=innerWidth+1 && stage.bottom<=banner.top+1;
  }),true,'cały widok TV mieści się nad paskiem stanu');
  await tv.screenshot({path:'/tmp/kiosk-tv-screen.png'});
  await kiosk.goto(HOME+'plan.html');await kiosk.locator('#data-status[data-loaded="true"]').waitFor();
  await kiosk.evaluate(()=>localStorage.setItem('my-teacher','test'));
  assert.equal(await tv.evaluate(()=>localStorage.getItem('my-teacher')),null);
  await app.evaluate(()=>{globalThis.kioskTestOffline=true;});
  await trigger('kiosk:connection',false);
  await expect(tv.locator('#kiosk-connection-status')).toContainText('Tryb offline');
  await expect(kiosk.locator('#kiosk-connection-status')).toContainText('Tryb offline');
  await trigger('kiosk:activity');
  const resetPage=await app.waitForEvent('window',{timeout:18000});
  await resetPage.waitForURL(HOME);kiosk=resetPage;
  assert.equal(tv.isClosed(),false,'TV nie resetuje się po 15 sekundach');
  assert.equal(tv.url(),HOME+'tv.html');
  console.log('PASS: dwa widoki jednocześnie; oddzielne sesje; reset tylko kiosku; offline na obu ekranach.');
  await trigger('kiosk:activity');
  const oldKiosk=kiosk;
  await app.evaluate(()=>{globalThis.kioskTestOffline=false;globalThis.kioskTestNewPublication=true;});
  const nextTV=app.waitForEvent('window',{timeout:15000});
  await trigger('kiosk:connection',true);
  tv=await nextTV;await tv.waitForURL(HOME+'tv.html');await tv.locator('#data-status[data-loaded="true"]').waitFor();
  assert.equal(oldKiosk.isClosed(),false,'aktualizacja TV nie przerywa obsługi kiosku');
  await expect(oldKiosk.locator('#kiosk-connection-status')).toContainText('Nowa kopia jest gotowa');
  await expect(tv.locator('#kiosk-connection-status')).not.toContainText('Nowa kopia jest gotowa');
  console.log('PASS: TV pobiera nową publikację podczas aktywnej sesji kiosku.');
  await app.evaluate(({screen})=>{globalThis.savedTV=globalThis.kioskTestDisplays.pop();screen.emit('display-removed',{},globalThis.savedTV);});
  await expect.poll(()=>tv.isClosed()).toBe(true);
  assert.equal(oldKiosk.isClosed(),false);
  await app.evaluate(({screen})=>{globalThis.kioskTestDisplays.push(globalThis.savedTV);screen.emit('display-added',{},globalThis.savedTV);});
  tv=await ready(HOME+'tv.html');
  console.log('PASS: odłączenie i ponowne podłączenie HDMI nie nakłada TV na kiosk.');
  await app.close();app=await launch();
  await ready(HOME);await ready(HOME+'tv.html');
  assert.equal(app.windows().some(p=>p.url().endsWith('/settings.html')),false,'zapisane ustawienia nie wymagają ponownego wyboru');
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(profile,'screens.json'))),{kioskDisplayId:101,tvDisplayId:202});
  console.log('PASS: przypisanie ekranów pozostaje po restarcie.');
}finally{if(app)await app.close();await fs.rm(profile,{recursive:true,force:true});}
