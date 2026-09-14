const { app, BrowserWindow, Menu, ipcMain, session, powerMonitor, net, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { SnapshotStore, keyOf } = require('./snapshot.cjs');
const { HOME, allowed, createIdle } = require('./policy.cjs');
const { defaults, resolve, validate } = require('./displays.cjs');
let store, idle, config, settingsWindow, quitting = false;
let layoutQueue = Promise.resolve();
const views = {
  kiosk: { url: HOME, window: null, displayed: null, session: null, display: null, busy: false, again: false },
  tv: { url: new URL('tv.html', HOME).href, window: null, displayed: null, session: null, display: null, busy: false, again: false }
};
const offline = path.join(__dirname, 'offline.html');
const settingsPath = () => path.join(app.getPath('userData'), 'screens.json');
function owner(sender) { return Object.values(views).find(view => view.window?.webContents === sender); }
function status(view) {
  return { tv: view === views.tv, online: store.online, downloadedAt: view.displayed?.downloadedAt || null,
    publishedAt: view.displayed?.publishedAt || null,
    pending: Boolean(view.displayed && store.latest && view.displayed.revision !== store.latest.revision) };
}
function announce() {
  for (const [role, view] of Object.entries(views)) {
    if (!view.display) continue;
    if (store.latest && (!view.displayed || ((role === 'tv' || !idle.isArmed()) && view.displayed.revision !== store.latest.revision))) {
      void reset(role); continue;
    }
    if (view.displayed?.revision === store.latest?.revision) view.displayed = store.latest;
    if (view.window && !view.window.isDestroyed()) view.window.webContents.send('kiosk:status', status(view));
  }
}
async function respond(view, request) {
  const key = keyOf(request.url);
  if (!key || request.method !== 'GET') return new Response('Niedozwolone', { status: 403 });
  const entry = view.displayed?.entries[key];
  if (entry) return new Response(Buffer.from(entry.body, 'base64'), {
    headers: { 'content-type': entry.type, 'cache-control': 'no-store', 'access-control-allow-origin': new URL(HOME).origin }
  });
  if (allowed(request.url) && (new URL(request.url).pathname === '/' || /\.html?$/.test(new URL(request.url).pathname))) {
    return new Response(await fs.readFile(offline), { headers: { 'content-type': 'text/html; charset=utf-8' } });
  }
  return new Response('Brak pliku w zapisanej kopii', { status: 404 });
}
function createWindow(role) {
  const view = views[role];
  const target = new BrowserWindow({
    ...view.display.bounds, title: role === 'tv' ? 'Pulpit nauczyciela — TV' : 'Pulpit nauczyciela',
    kiosk: true, fullscreen: true, show: false, autoHideMenuBar: true, backgroundColor: '#f5f7f4',
    webPreferences: { session: view.session, preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true,
      devTools: false, navigateOnDragDrop: false, backgroundThrottling: false, disableDialogs: true }
  });
  target.setMenu(null);
  const wc = target.webContents;
  const navigationAllowed = url => allowed(url) && (role !== 'tv' || new URL(url).pathname === '/tv.html');
  wc.on('will-navigate', (event, url) => { if (!navigationAllowed(url)) event.preventDefault(); });
  wc.on('will-redirect', (event, url) => { if (!navigationAllowed(url)) event.preventDefault(); });
  wc.on('will-frame-navigate', event => { if (!navigationAllowed(event.url)) event.preventDefault(); });
  wc.setWindowOpenHandler(({ url }) => {
    if (role === 'kiosk' && allowed(url)) void target.loadURL(url).catch(() => {});
    return { action: 'deny' };
  });
  wc.on('will-attach-webview', event => event.preventDefault());
  wc.on('context-menu', event => event.preventDefault());
  wc.on('will-prevent-unload', event => event.preventDefault());
  wc.on('before-input-event', (event, input) => {
    const key = input.key.toLowerCase();
    if (input.control && input.shift && key === 'q') { quitting = true; app.quit(); return; }
    if (input.control && input.shift && key === 's') { event.preventDefault(); openSettings(); return; }
    if (role === 'kiosk') idle.activity();
    if (input.control || input.alt || input.meta || /^f\d+$/.test(key) || key === 'escape') event.preventDefault();
  });
  wc.on('render-process-gone', () => { if (!quitting) void reset(role); });
  target.on('close', event => { if (!quitting) event.preventDefault(); });
  // Aktualizacja TV nie odbiera nauczycielowi klawiatury ani aktywnego okna.
  target.showInactive();
  return target;
}
async function reset(role) {
  const view = views[role];
  if (quitting) return;
  if (view.busy) { view.again = true; return; }
  view.busy = true;
  if (role === 'kiosk') idle.disarm();
  const previous = view.window; view.window = null;
  if (previous && !previous.isDestroyed()) previous.destroy();
  try {
    await view.session.clearStorageData();
    view.displayed = store.latest;
    if (view.display && !quitting) {
      view.window = createWindow(role);
      void view.window.loadURL(view.url).catch(() => {});
    }
  } catch (error) {
    console.error('Nie udało się odtworzyć widoku:', role, error);
    setTimeout(() => void reset(role), 5000);
  } finally {
    view.busy = false;
    if (view.again) { view.again = false; void reset(role); }
  }
}
function applyLayout() {
  layoutQueue = layoutQueue.then(async () => {
    if (quitting) return;
    const selection = resolve(config, screen.getAllDisplays(), screen.getPrimaryDisplay().id);
    for (const role of ['tv', 'kiosk']) {
      const next = selection[role], view = views[role];
      const changed = view.display?.id !== next?.id || JSON.stringify(view.display?.bounds) !== JSON.stringify(next?.bounds);
      view.display = next;
      if (changed || (!view.window && next)) await reset(role);
    }
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.webContents.send('screens:changed');
      settingsWindow.show(); settingsWindow.focus();
    }
  }).catch(error => console.error('Błąd układu ekranów:', error));
  return layoutQueue;
}
function screenState() { return { displays: screen.getAllDisplays().map(d => ({ id:d.id, label:d.label, internal:d.internal, bounds:d.bounds })), primaryId:screen.getPrimaryDisplay().id, config }; }
function openSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) { settingsWindow.show(); settingsWindow.focus(); return; }
  const area = screen.getPrimaryDisplay().workArea;
  settingsWindow = new BrowserWindow({ title:'Wybór ekranów', width: Math.min(720,area.width), height:Math.min(620,area.height),
    x:area.x+Math.max(0,Math.round((area.width-720)/2)), y:area.y+Math.max(0,Math.round((area.height-620)/2)),
    alwaysOnTop:true, autoHideMenuBar:true, backgroundColor:'#f5f7f4',
    webPreferences:{preload:path.join(__dirname,'settings-preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,devTools:false}
  });
  settingsWindow.setMenu(null);
  settingsWindow.webContents.on('will-navigate',event=>event.preventDefault());
  settingsWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  settingsWindow.on('closed',()=>{settingsWindow=null;});
  void settingsWindow.loadFile(path.join(__dirname,'settings.html'));
}
function identify() {
  screen.getAllDisplays().forEach((display,index)=>{
    const badge = new BrowserWindow({x:display.bounds.x+40,y:display.bounds.y+40,width:320,height:180,frame:false,alwaysOnTop:true,skipTaskbar:true,focusable:false,
      webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true,devTools:false}});
    const html=`<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><body style="margin:0;display:grid;place-content:center;height:100vh;background:#17332b;color:white;font:600 42px 'Segoe UI',sans-serif">Ekran ${index+1}</body>`;
    void badge.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html));
    setTimeout(()=>{if(!badge.isDestroyed())badge.destroy();},4000);
  });
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => openSettings());
  app.on('before-quit', () => { quitting = true; });
  app.on('window-all-closed', () => {});
  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    idle = createIdle(() => void reset('kiosk'));
    store = new SnapshotStore(path.join(app.getPath('userData'), 'offline'), (url, options) => net.fetch(url, options), announce);
    await store.init();
    let configured = false;
    try {
      config = JSON.parse(await fs.readFile(settingsPath(),'utf8'));
      if (!Number.isInteger(config.kioskDisplayId) || !(config.tvDisplayId === null || Number.isInteger(config.tvDisplayId)) || config.kioskDisplayId === config.tvDisplayId) throw Error('Nieprawidłowe przypisanie');
      configured = true;
    } catch { config = defaults(screen.getAllDisplays(),screen.getPrimaryDisplay().id); }
    for (const [role,view] of Object.entries(views)) {
      view.session = session.fromPartition('kiosk-'+role);
      view.session.protocol.handle('https', request => respond(view,request));
      view.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
      view.session.setPermissionCheckHandler(()=>false);
      view.session.on('will-download',event=>event.preventDefault());
    }
    ipcMain.handle('kiosk:get-status',event=>{const view=owner(event.sender);return view?status(view):null;});
    ipcMain.on('kiosk:connection',(event,online)=>{
      if(!owner(event.sender))return;
      if(!online){store.online=false;announce();}else void store.sync();
    });
    ipcMain.on('kiosk:activity',event=>{if(owner(event.sender)===views.kiosk)idle.activity();});
    ipcMain.handle('screens:get',event=>event.sender===settingsWindow?.webContents?screenState():null);
    ipcMain.handle('screens:identify',event=>{if(event.sender===settingsWindow?.webContents)identify();});
    ipcMain.handle('screens:save',async(event,value)=>{
      if(event.sender!==settingsWindow?.webContents)return {error:'Brak dostępu'};
      try {
        const next=validate(value,screen.getAllDisplays());
        await fs.mkdir(app.getPath('userData'),{recursive:true});
        await fs.writeFile(settingsPath()+'.tmp',JSON.stringify(next));
        await fs.rename(settingsPath()+'.tmp',settingsPath());
        config=next; configured=true; await applyLayout();
        const savedWindow=settingsWindow;
        setTimeout(()=>{if(savedWindow && !savedWindow.isDestroyed())savedWindow.close();},150);
        return {ok:true};
      }catch(error){return {error:error.message};}
    });
    setInterval(()=>idle.check(),100);
    powerMonitor.on('resume',()=>{void reset('kiosk');void reset('tv');void store.sync();});
    for(const event of ['display-added','display-removed','display-metrics-changed'])screen.on(event,()=>{if(!configured)config=defaults(screen.getAllDisplays(),screen.getPrimaryDisplay().id);void applyLayout();});
    await applyLayout();
    if(!configured && screen.getAllDisplays().length>1)openSettings();
    void store.sync();
    setInterval(()=>void store.sync(),30000);
  });
}
