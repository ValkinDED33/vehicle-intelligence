// Local fixtures and isolated PostgreSQL only. No real provider, payment or Telegram traffic.
require('reflect-metadata');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createHash}=require('node:crypto');
const base=process.env.CARA_TEST_URL||'http://127.0.0.1:5193';
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const user={id:'33333333-3333-4333-8333-333333333333',email:'fixture@test.local',displayName:'Fixture',language:'en',telegramLinked:true};
const cars=[{id:A,make:'Nissan',model:'Qashqai',vin:'WBA12345678901234',country:'PL',isArchived:false},{id:B,make:'Toyota',model:'GT86',vin:'WBA98765432109876',country:'PL',isArchived:false}];
const sources=[{key:'basic-vin-decode',apiName:'Basic VIN',input:'vin',fetchableByVehicleVin:true},{key:'oneauto-recall-check-vin',apiName:'OneAuto recall',input:'vin',fetchableByVehicleVin:true}];
const hash=buffer=>createHash('sha256').update(buffer).digest('hex');
const output={};

async function receiptApi(){
  const {pathToFileURL}=require('node:url'),path=require('node:path');
  const {PGlite}=require('@electric-sql/pglite'),{drizzle}=require('drizzle-orm/pglite');
  const {NestFactory}=require('@nestjs/core'),{Module}=require('@nestjs/common'),{JwtService}=require('@nestjs/jwt');
  const {VinAccessService}=require('../dist/modules/vin-access/vin-access.service');
  const {VinService}=require('../dist/modules/vin/services/vin.service'),{VinDbService}=require('../dist/modules/vin/vin.db.service');
  const {StandaloneVinController}=require('../dist/modules/vin/controllers/standalone-vin.controller');
  const {VinAccessController}=require('../dist/modules/vin-access/vin-access.controller');
  const pg=new PGlite();let app,proxy;
  try{
    for(const entry of JSON.parse(fs.readFileSync('drizzle/meta/_journal.json')).entries)await pg.exec(fs.readFileSync(`drizzle/${entry.tag}.sql`,'utf8'));
    await pg.query('INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)',[user.id,user.email,'fixture']);
    const db={connection:drizzle(pg)},access=new VinAccessService(db);let providerCalls=0;
    const vin=new VinService(undefined,undefined,new VinDbService(db),{decode:async()=>{providerCalls++;return {provider:'fixture',make:'Saved from Telegram',model:'Account report',rawPayload:{fixture:true}};}},access);
    await vin.decodeStandaloneVin(user.id,cars[0].vin);
    assert.equal((await access.status(user.id)).state,'used');assert.equal(providerCalls,1);
    const jwt=new JwtService({secret:'receipt-fixture-only'});class App{};
    Module({controllers:[StandaloneVinController,VinAccessController],providers:[{provide:VinAccessService,useValue:access},{provide:VinService,useValue:vin},{provide:JwtService,useValue:jwt}]})(App);
    app=await NestFactory.create(App,{logger:false});await app.listen(0,'127.0.0.1');
    const {createServer}=await import(pathToFileURL(path.resolve('frontend/node_modules/vite/dist/node/index.js')).href);
    const previous=process.env.VITE_PROXY_TARGET;
    try{
      process.env.VITE_PROXY_TARGET=await app.getUrl();
      proxy=await createServer({root:path.resolve('frontend'),configFile:path.resolve('frontend/vite.config.ts'),logLevel:'silent',server:{host:'127.0.0.1',port:5195,strictPort:false}});
    }finally{if(previous===undefined)delete process.env.VITE_PROXY_TARGET;else process.env.VITE_PROXY_TARGET=previous;}
    await proxy.listen();const proxyBase=`http://127.0.0.1:${proxy.httpServer.address().port}`,token=jwt.sign({sub:user.id});
    assert.equal((await (await fetch(proxyBase+'/vin-access',{headers:{Authorization:`Bearer ${token}`}})).json()).state,'used');
    output.realViteProxy=true;
    return {base:proxyBase,token,calls:()=>providerCalls,close:async()=>{await proxy.close();await app.close();await pg.close();}};
  }catch(error){await proxy?.close();await app?.close();await pg.close();throw error;}
}
(async()=>{
  fs.mkdirSync('scratch',{recursive:true});
  const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  let receipt;
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
    let state='available',writes=0,consent=false;
    page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>consent?dialog.accept():dialog.dismiss());
    await page.addInitScript(({user,A})=>{localStorage.setItem('cara.token','fixture');localStorage.setItem('cara.user',JSON.stringify(user));localStorage.setItem('cara.language','en');if(!localStorage.getItem('cara.vehicleId'))localStorage.setItem('cara.vehicleId',A);},{user,A});
    await page.route('**/*',async route=>{
      const req=route.request(),url=new URL(req.url()),path=url.pathname;
      if(url.origin!==new URL(base).origin)return route.abort();
      if(path==='/auth/me')return route.fulfill({json:user});
      if(path==='/garage/vehicles')return route.fulfill({json:cars});
      if(path==='/vin-access')return route.fulfill({json:{state,freeRemaining:state==='available'?1:0,paidEnabled:false}});
      if(path==='/vin/checks'){
        if(!receipt)return route.fulfill({json:[]});
        const response=await route.fetch({url:receipt.base+path,headers:{Authorization:`Bearer ${receipt.token}`}});return route.fulfill({response});
      }
      if(!path.startsWith('/vehicles/'))return route.continue();
      if(path.endsWith('/external-reports/sources'))return route.fulfill({json:sources});
      if(req.method()==='POST'){
        assert.ok(path.endsWith('/vin/decode')||path.endsWith('/sources/basic-vin-decode')||path.endsWith('/sources/oneauto-recall-check-vin'),`Unexpected write ${path}`);
        writes++;state='used';return route.fulfill({json:path.endsWith('/vin/decode')?{make:'Fixture'}:{report:{id:'saved',status:'success'},normalization:{normalized:false}}});
      }
      const profile={id:'profile-'+(path.includes(A)?'a':'b'),version:1,source:'manual-confirmed',bodyType:path.includes(A)?'suv':'coupe',exteriorColor:path.includes(A)?'white':'red',fuelType:'petrol'};
      const json=path.endsWith('/profile/current')?profile:path.endsWith('/profile/history')?[profile]:path.endsWith('/mileage/latest')||path.endsWith('/vin/latest')||path.endsWith('/energy/full-to-full')?null:path.endsWith('/reminders')?{telegramLinked:true,deliveryEnabled:true,reminders:[]}:path.endsWith('/mileage/anomalies')?{anomalies:[]}:path.endsWith('/expenses/monthly-summary')?{currencies:[]}:path.endsWith('/energy/monthly-summary')?{entriesCount:0,money:[],fuelLiters:0,energyKwh:0}:[];
      return route.fulfill({json});
    });
    const nav=async name=>{if(await page.locator('.menu-button').isVisible())await page.locator('.menu-button').click();await page.locator('.sidebar nav').getByRole('button',{name,exact:true}).click();};
    const ready=async()=>{await page.locator('.transformer-hero[data-ready=true]').waitFor({timeout:30000});await page.locator('.bot-avatar[data-ready=true]').waitFor();};
    const pixels=()=>page.locator('.transformer-hero canvas').evaluate(canvas=>new Promise(resolve=>requestAnimationFrame(()=>{
      const gl=canvas.getContext('webgl2'),data=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,data);
      let opaque=0,bright=0;for(let i=0;i<data.length;i+=4){if(data[i+3]>0)opaque++;if(data[i]+data[i+1]+data[i+2]>180)bright++;}resolve({opaque,bright,total:data.length/4,width:canvas.clientWidth,height:canvas.clientHeight});
    })));
    await page.goto(base,{waitUntil:'networkidle'});await ready();
    const keyA=await page.locator('.transformer-hero').getAttribute('data-appearance');
    const avatarA=await page.locator('.bot-avatar img').getAttribute('src');
    const first=await page.locator('.transformer-hero').screenshot();await page.waitForTimeout(800);
    const second=await page.locator('.transformer-hero').screenshot();assert.notEqual(hash(first),hash(second),'Robot should animate');
    const beforePointer=await page.locator('.transformer-hero').screenshot();await page.locator('.transformer-hero canvas').hover({position:{x:330,y:350}});await page.waitForTimeout(100);
    assert.notEqual(hash(beforePointer),hash(await page.locator('.transformer-hero').screenshot()));
    const stats=await pixels();assert.ok(stats.bright>1000&&stats.opaque>stats.total*.1,JSON.stringify(stats));output.desktopPixels=stats;
    await page.screenshot({path:'scratch/transformer-nissan-desktop.png',fullPage:true});
    await nav('Garage');await page.locator('main').getByRole('button',{name:'SELECT',exact:true}).click();await nav('Home');await ready();
    const keyB=await page.locator('.transformer-hero').getAttribute('data-appearance');assert.notEqual(keyA,keyB);
    const avatarB=await page.locator('.bot-avatar img').getAttribute('src');assert.notEqual(avatarA,avatarB);
    await page.screenshot({path:'scratch/transformer-toyota-desktop.png',fullPage:true});
    await page.reload({waitUntil:'networkidle'});await ready();assert.equal(await page.locator('.transformer-hero').getAttribute('data-appearance'),keyB);assert.equal(await page.locator('.bot-avatar img').getAttribute('src'),avatarB);
    output.uniqueStablePerCar=true;
    await nav('Vehicle profile');await page.getByRole('button',{name:'DECODE VIN',exact:true}).click();assert.equal(writes,0);
    consent=true;await page.getByRole('button',{name:'DECODE VIN',exact:true}).click();await page.getByText('Your free VIN check has been used. Further checks are locked until payments are enabled.',{exact:true}).waitFor();assert.equal(writes,1);assert.equal(await page.getByRole('button',{name:'DECODE VIN',exact:true}).isDisabled(),true);
    await nav('Integrations');assert.equal(await page.getByRole('button',{name:'FETCH VIN REPORTS',exact:true}).count(),0);assert.equal(await page.locator('.source-card button:not([disabled])').count(),0);assert.equal(await page.getByRole('button',{name:/pay|checkout/i}).count(),0);
    output.consentAndAccountLock=true;
    receipt=await receiptApi();
    await nav('Reports');await page.getByRole('heading',{name:'VIN checks from Telegram',exact:true}).waitFor();await page.locator('.standalone-vin-check summary').click();assert.match(await page.locator('.standalone-vin-check pre').innerText(),/fixture/);assert.equal(writes,1);assert.equal(receipt.calls(),1);output.telegramResultVisibleThroughRealApiAndPostgres=true;
    // Simulate a fresh account, then a trial consumed through Telegram while this tab is open.
    state='available';await nav('Vehicle profile');await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForFunction(()=>!document.querySelector('.page-actions button.primary')?.disabled);
    state='used';await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForFunction(()=>document.querySelector('.page-actions button.primary')?.disabled);
    output.channelRefresh=true;
    await page.setViewportSize({width:390,height:844});await nav('Home');await ready();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));const mobileStats=await pixels();assert.ok(mobileStats.bright>400,JSON.stringify(mobileStats));output.mobilePixels=mobileStats;
    await page.screenshot({path:'scratch/transformer-mobile.png',fullPage:true});
    await page.emulateMedia({reducedMotion:'reduce'});await page.mouse.move(0,0);await page.waitForTimeout(100);
    const still=await page.locator('.transformer-hero').screenshot();await page.waitForTimeout(200);assert.equal(hash(still),hash(await page.locator('.transformer-hero').screenshot()));output.reducedMotion=true;
    await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return String(type).startsWith('webgl')?null:original.call(this,type,...args);};});
    await page.reload({waitUntil:'networkidle'});await page.locator('.transformer-hero .transformer-fallback').waitFor();
    assert.equal(await page.locator('.transformer-hero').getAttribute('data-ready'),'false');assert.match(await page.locator('.transformer-hero .transformer-fallback').innerText(),/TO/);output.webglFallback=true;
    cars.splice(0);await page.reload({waitUntil:'networkidle'});await nav('Reports');await page.getByRole('heading',{name:'VIN checks from Telegram',exact:true}).waitFor();assert.equal(await page.locator('.standalone-vin-check').count(),1);assert.equal(receipt.calls(),1);output.savedResultWithoutGarage=true;
    assert.deepEqual(errors,[]);output.browserErrors=errors;console.log(JSON.stringify(output,null,2));
  }finally{await browser.close();await receipt?.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
