const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { SnapshotStore, keyOf, discover } = require('./snapshot.cjs');
const { HOME } = require('./policy.cjs');
const html = '<!doctype html><html><script src="/app.js"></script><a href="/plan.html">Plan</a></html>';
function fixture() {
  const manifest = { schemaVersion: 1, version: 'abc', validFrom: '2026-09-01', validTo: '2027-08-31', generatedAt: '2026-09-08T08:00:00Z', files: Object.fromEntries(['plan','changes','calendar','contacts'].map(key => [key, `/data/${key}.abc.json`])) };
  const documents = {
    '/': html, '/plan.html': html, '/tv.html': html, '/app.js': 'fetch("/data/manifest.json")',
    '/data/manifest.json': manifest,
    '/data/plan.abc.json': { teachers:{},classes:{},rooms:{},aliases:{},periods:[],duties:[],lessons:[{subject:'Matematyka',teacherIds:[],teacherNames:[],classNames:[],roomNames:[],groupNames:[],start:'08:00',end:'08:45'}] },
    '/data/changes.abc.json': { substitutions:[], transfers:[], dutyChanges:[] },
    '/data/calendar.abc.json': [], '/data/contacts.abc.json': {supervision:[],specialists:{specjalisci:[]}}
  };
  return documents;
}
function fetchFixture(documents) {
  return async url => {
    const pathname = new URL(url).pathname;
    if (!(pathname in documents)) return new Response('', {status:404});
    const data = documents[pathname];
    return new Response(typeof data === 'string' ? data : JSON.stringify(data), {headers:{'content-type': pathname.endsWith('.json')?'application/json':pathname.endsWith('.js')?'text/javascript':'text/html'}});
  };
}
async function directory(t) { const dir = await fs.mkdtemp(path.join(os.tmpdir(),'kiosk-test-')); t.after(()=>fs.rm(dir,{recursive:true,force:true})); return dir; }
test('kopię można wczytać po restarcie; błąd aktualizacji nie nadpisuje danych ani czasu', async t => {
  const dir=await directory(t), docs=fixture();
  const store=new SnapshotStore(dir,fetchFixture(docs));
  assert.equal(await store.sync(),true);
  const saved=store.latest;
  assert.ok(saved.entries[new URL('/plan.html',HOME)]);
  const restarted=new SnapshotStore(dir,async()=>{throw Error('offline')});
  await restarted.init();
  assert.deepEqual(restarted.latest,JSON.parse(JSON.stringify(saved)));
  assert.equal(await restarted.sync(),false);
  assert.equal(restarted.latest.downloadedAt,saved.downloadedAt);
  assert.equal(restarted.latest.revision,saved.revision);
  assert.equal(restarted.online,false);
});
test('niepełna lub błędna nowa publikacja zachowuje całą poprzednią kopię',async t=>{
  const store=new SnapshotStore(await directory(t),fetchFixture(fixture()));
  await store.sync(); const old=store.latest;
  const broken=fixture(); delete broken['/data/changes.abc.json'];
  store.fetcher=fetchFixture(broken); assert.equal(await store.sync(),false); assert.equal(store.latest,old);
  broken['/data/changes.abc.json']={wrong:true};
  assert.equal(await store.sync(),false); assert.equal(store.latest,old);
});
test('zmiana manifestu w trakcie pobierania nie tworzy mieszanej publikacji',async t=>{
  const docs=fixture(), read=fetchFixture(docs); let manifests=0;
  const store=new SnapshotStore(await directory(t),async url=>{
    if(url.endsWith('manifest.json') && ++manifests===2) docs['/data/manifest.json'].version='def';
    return read(url);
  });
  assert.equal(await store.sync(),false); assert.equal(store.latest,null);
});
test('uszkodzona kopia nie jest pokazywana jako poprawne dane',async t=>{
  const dir=await directory(t), store=new SnapshotStore(dir,fetchFixture(fixture())); await store.sync();
  const broken=JSON.parse(await fs.readFile(path.join(dir,'site.json')));
  broken.entries[HOME].body=Buffer.from('uszkodzenie').toString('base64');
  await fs.writeFile(path.join(dir,'site.json'),JSON.stringify(broken));
  const restarted=new SnapshotStore(dir,fetchFixture(fixture())); await restarted.init(); assert.equal(restarted.latest,null);
});
test('nowa poprawna kopia zastępuje poprzednią, także na dysku',async t=>{
  const dir=await directory(t), docs=fixture(), store=new SnapshotStore(dir,fetchFixture(docs));
  await store.sync(); const old=store.latest.revision;
  docs['/data/plan.abc.json'].lessons[0].subject='Fizyka';
  assert.equal(await store.sync(),true); assert.notEqual(store.latest.revision,old);
  const restarted=new SnapshotStore(dir,fetchFixture(docs)); await restarted.init(); assert.equal(restarted.latest.revision,store.latest.revision);
});
test('odkrywanie zależności Astro i ograniczenie adresów kopii',()=>{
  const links=discover('import("./plan.abc.js"); const deps=["_astro/model.def.js"];','text/javascript',HOME+'_astro/app.js');
  assert.ok(links.has(HOME+'_astro/plan.abc.js')); assert.ok(links.has(HOME+'_astro/model.def.js'));
  assert.equal(keyOf('file:///etc/passwd'),null);
  assert.equal(keyOf('https://evil.com/app.js'),null);
  assert.equal(keyOf('https://cdn.jsdelivr.net/page.html'),null);
  assert.equal(keyOf(HOME+'plan.html?teacher=1'),HOME+'plan.html');
});
