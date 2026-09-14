const {test}=require('node:test');
const assert=require('node:assert/strict');
const {defaults,resolve,validate}=require('./displays.cjs');
const laptop={id:1,bounds:{x:0,y:0,width:1366,height:768}},tv={id:2,bounds:{x:1366,y:0,width:1920,height:1080}};
test('domyślnie ekran główny = kiosk, drugi = TV',()=>{assert.deepEqual(defaults([laptop,tv],1),{kioskDisplayId:1,tvDisplayId:2});});
test('odłączenie TV nie przenosi go na kiosk; powrót przywraca przypisanie',()=>{
 const config={kioskDisplayId:1,tvDisplayId:2};
 assert.deepEqual(resolve(config,[laptop],1),{kiosk:laptop,tv:null});
 assert.deepEqual(resolve(config,[tv,laptop],1),{kiosk:laptop,tv});
});
test('po zamianie ekranów brak monitora kiosku nie tworzy dwóch widoków na jednym ekranie',()=>{
 assert.deepEqual(resolve({kioskDisplayId:2,tvDisplayId:1},[laptop],1),{kiosk:laptop,tv:null});
});
test('walidacja wymaga różnych istniejących ekranów; TV można wyłączyć',()=>{
 assert.throws(()=>validate({kioskDisplayId:1,tvDisplayId:1},[laptop,tv]));
 assert.throws(()=>validate({kioskDisplayId:1,tvDisplayId:3},[laptop,tv]));
 assert.throws(()=>validate({kioskDisplayId:'1',tvDisplayId:2},[laptop,tv]));
 assert.deepEqual(validate({kioskDisplayId:1,tvDisplayId:null},[laptop]),{kioskDisplayId:1,tvDisplayId:null});
});
