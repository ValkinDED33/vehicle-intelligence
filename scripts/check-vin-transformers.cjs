// Local fixtures and isolated PostgreSQL only. No real provider, payment or Telegram traffic.
require('reflect-metadata');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createHash}=require('node:crypto');
const base=process.env.CARA_TEST_URL||'http://127.0.0.1:5193';
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',C='44444444-4444-4444-8444-444444444444';
const user={id:'33333333-3333-4333-8333-333333333333',email:'fixture@test.local',displayName:'Fixture',language:'en',telegramLinked:true};
const cars=[{id:A,make:'Nissan',model:'Qashqai',modelYear:'2017',vin:'WBA12345678901234',country:'PL',isArchived:false},{id:B,make:'Volkswagen',model:'Golf',modelYear:'2007',vin:'WBA98765432109876',country:'PL',isArchived:false},{id:C,make:'SKODA SITIGO',model:'Citigo',modelYear:'2016',vin:'TMBZZZAAZGD635118',country:'PL',isArchived:false}];
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
      const id=path.split('/')[2];
      const profile={id:'profile-'+id,vehicleId:id,version:1,source:'manual-confirmed',bodyType:path.includes(A)?'wagon':'hatchback',exteriorColor:null,fuelType:'petrol'};
      const json=path.endsWith('/profile/current')?profile:path.endsWith('/profile/history')?[profile]:path.endsWith('/mileage/latest')||path.endsWith('/vin/latest')||path.endsWith('/energy/full-to-full')?null:path.endsWith('/reminders')?{telegramLinked:true,deliveryEnabled:true,reminders:[]}:path.endsWith('/mileage/anomalies')?{anomalies:[]}:path.endsWith('/expenses/monthly-summary')?{currencies:[]}:path.endsWith('/energy/monthly-summary')?{entriesCount:0,money:[],fuelLiters:0,energyKwh:0}:[];
      return route.fulfill({json});
    });
    const nav=async name=>{const mobile=await page.locator('.menu-button').isVisible();if(mobile)await page.locator('.menu-button').click();await page.locator('.sidebar nav').getByRole('button',{name,exact:true}).click();if(mobile)await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().right<=0);};
    const ready=async()=>{await page.locator('.transformer-hero[data-ready=true]').waitFor({timeout:30000});await page.locator('.bot-avatar[data-ready=true]').waitFor();await page.waitForFunction(()=>getComputedStyle(document.querySelector('.top-grid')).opacity==='1');};
    const pixels=()=>page.locator('.transformer-hero img').evaluate(img=>{
      const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
      const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      let opaque=0,bright=0;for(let i=0;i<data.length;i+=4){if(data[i+3]>0)opaque++;if(data[i]+data[i+1]+data[i+2]>180)bright++;}
      return {opaque,bright,total:data.length/4,width:img.clientWidth,height:img.clientHeight};
    });
    const sameArtwork=async()=>{
      const hero=await page.locator('.transformer-hero img').getAttribute('src');
      assert.equal(await page.locator('.bot-avatar img').getAttribute('src'),hero);
      assert.equal(await page.locator('.vehicle-thumb img').getAttribute('src'),hero);
      assert.match(await page.locator('.artwork-status').innerText(),/Concept/);
      assert.equal(await page.locator('canvas').count(),0,'No legacy block robot renderer');
    };
    await page.goto(base,{waitUntil:'networkidle'});await ready();
    const keyA=await page.locator('.transformer-hero').getAttribute('data-appearance');
    const avatarA=await page.locator('.bot-avatar img').getAttribute('src');
    await sameArtwork();
    const stats=await pixels();assert.ok(stats.bright>1000&&stats.opaque>stats.total*.1,JSON.stringify(stats));output.desktopPixels=stats;
    await page.screenshot({path:'scratch/transformer-nissan-desktop.png',fullPage:true});
    await nav('Garage');await page.locator('.vehicle-card .vehicle-artwork[data-ready=true]').nth(2).waitFor();
    const thumbs=await page.locator('.vehicle-card .vehicle-artwork img').evaluateAll(images=>images.map(img=>img.getAttribute('src')));
    assert.equal(new Set(thumbs).size,3);assert.ok(thumbs.every(src=>!src.includes('/car.webp')));output.garageHasThreeCorrectModels=true;
    await page.screenshot({path:'scratch/vehicle-artwork-garage-desktop.png',fullPage:true});
    await page.locator('.vehicle-card').nth(1).getByRole('button',{name:'SELECT',exact:true}).click();await ready();await sameArtwork();
    const keyB=await page.locator('.transformer-hero').getAttribute('data-appearance');assert.notEqual(keyA,keyB);
    const avatarB=await page.locator('.bot-avatar img').getAttribute('src');assert.notEqual(avatarA,avatarB);
    await page.screenshot({path:'scratch/transformer-golf-desktop.png',fullPage:true});
    await page.reload({waitUntil:'networkidle'});await ready();assert.equal(await page.locator('.transformer-hero').getAttribute('data-appearance'),keyB);assert.equal(await page.locator('.bot-avatar img').getAttribute('src'),avatarB);
    output.uniqueStablePerCar=true;
    await nav('Garage');await page.locator('.vehicle-card').nth(2).getByRole('button',{name:'SELECT',exact:true}).click();await ready();await sameArtwork();
    assert.match(await page.locator('.transformer-hero').getAttribute('data-artwork'),/citigo/);
    await page.screenshot({path:'scratch/transformer-citigo-desktop.png',fullPage:true});
    await nav('Garage');await page.locator('.vehicle-card').nth(1).getByRole('button',{name:'SELECT',exact:true}).click();await ready();
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
    for(const width of [320,650,768,1024,1250]){
      await page.setViewportSize({width,height:900});await ready();
      const overflow=await page.evaluate(()=>[...document.querySelectorAll('main *')].filter(el=>!el.closest('.vehicle-transformer')&&el.getBoundingClientRect().right>innerWidth+1).slice(0,8).map(el=>({class:el.className,width:el.getBoundingClientRect().width,right:el.getBoundingClientRect().right})));
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Home overflow at ${width}: ${JSON.stringify(overflow)}`);
      await nav('Garage');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Garage overflow at ${width}`);
      assert.ok(await page.locator('.vehicle-card').evaluateAll(cards=>cards.every(card=>card.scrollWidth<=card.clientWidth)),`Card overflow at ${width}`);
      await nav('Home');
    }
    output.responsiveWidths=[320,390,650,768,1024,1250,1440];
    await page.setViewportSize({width:390,height:844});await ready();
    await nav('Garage');await page.screenshot({path:'scratch/vehicle-artwork-garage-mobile.png',fullPage:true});await nav('Home');await ready();
    await page.emulateMedia({reducedMotion:'reduce'});await page.mouse.move(0,0);await page.waitForTimeout(100);
    const still=await page.locator('.transformer-hero').screenshot();await page.waitForTimeout(200);assert.equal(hash(still),hash(await page.locator('.transformer-hero').screenshot()));output.reducedMotion=true;
    await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return String(type).startsWith('webgl')?null:original.call(this,type,...args);};});
    await page.reload({waitUntil:'networkidle'});await ready();await sameArtwork();output.worksWithoutWebgl=true;
    await page.route('**/vehicle-artwork/volkswagen-golf-5-v2.webp',route=>route.abort());await page.reload({waitUntil:'networkidle'});
    await page.locator('.transformer-hero .transformer-fallback').waitFor();
    assert.equal(await page.locator('.transformer-hero').getAttribute('data-ready'),'false');assert.match(await page.locator('.artwork-status').innerText(),/could not be loaded/);output.failedImageFallback=true;
    cars[1]={...cars[1],make:'Toyota',model:'GT86',modelYear:'2016'};await page.reload({waitUntil:'networkidle'});
    assert.equal(await page.locator('.transformer-hero').getAttribute('data-artwork'),'unavailable');
    assert.equal(await page.locator('.transformer-hero img').count(),0);assert.match(await page.locator('.artwork-status').innerText(),/not yet available/);output.noUnrelatedModelSubstitution=true;
    cars.splice(0);await page.reload({waitUntil:'networkidle'});await nav('Reports');await page.getByRole('heading',{name:'VIN checks from Telegram',exact:true}).waitFor();assert.equal(await page.locator('.standalone-vin-check').count(),1);assert.equal(receipt.calls(),1);output.savedResultWithoutGarage=true;
    assert.deepEqual(errors,[]);output.browserErrors=errors;console.log(JSON.stringify(output,null,2));
  }finally{await browser.close();await receipt?.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
