// Real local HTTP + PostgreSQL + frontend. Image provider and ancillary APIs are fixtures.
// No production database, OpenAI generation, VIN lookup or Telegram request is used.
require('reflect-metadata');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {PGlite}=require('@electric-sql/pglite'),{drizzle}=require('drizzle-orm/pglite');
const {Module,ValidationPipe}=require('@nestjs/common'),{NestFactory}=require('@nestjs/core'),{JwtService}=require('@nestjs/jwt');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {VehicleArtworkService}=require('../dist/modules/vehicle-artwork/vehicle-artwork.service');
const {VehicleArtworkController}=require('../dist/modules/vehicle-artwork/vehicle-artwork.controller');
const {GarageService}=require('../dist/modules/garage/services/garage.service'),{GarageDbService}=require('../dist/modules/garage/garage.db.service');
const {GarageController}=require('../dist/modules/garage/controllers/garage.controller');
const {VehicleProfileService}=require('../dist/modules/vehicle-profile/services/vehicle-profile.service'),{VehicleProfileDbService}=require('../dist/modules/vehicle-profile/vehicle-profile.db.service');
const {VehicleProfileController}=require('../dist/modules/vehicle-profile/controllers/vehicle-profile.controller');
const {VinService}=require('../dist/modules/vin/services/vin.service'),{VinDbService}=require('../dist/modules/vin/vin.db.service');
const OWNER='33333333-3333-4333-8333-333333333333',A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',C='44444444-4444-4444-8444-444444444444';
const cars=[{id:A,make:'Volkswagen',model:'Golf',modelYear:'2007',color:'blue'},{id:B,make:'Skoda',model:'Citigo',modelYear:'2016',color:'green'},{id:C,make:'Nissan',model:'Qashqai',modelYear:'2017',color:null}];
const user={id:OWNER,email:'artwork@fixture.test',displayName:'Artwork Fixture',language:'en',telegramLinked:true};
const output={};
(async()=>{
  const pg=new PGlite();let app,vite,browser,releaseA,startedA;const started=new Promise(r=>startedA=r),gate=new Promise(r=>releaseA=r);const calls=[];
  try{
    for(const entry of JSON.parse(fs.readFileSync('drizzle/meta/_journal.json')).entries)await pg.exec(fs.readFileSync(`drizzle/${entry.tag}.sql`,'utf8'));
    await pg.query('INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)',[OWNER,user.email,'fixture']);
    const db={connection:drizzle(pg)},garage=new GarageService(new GarageDbService(db)),profiles=new VehicleProfileService(garage,new VehicleProfileDbService(db));
    for(const car of cars){await pg.query('INSERT INTO vehicles(id,owner_id,make,model,model_year) VALUES($1,$2,$3,$4,$5)',[car.id,OWNER,car.make,car.model,car.modelYear]);await profiles.createProfileVersion(OWNER,car.id,{source:'manual-confirmed',exteriorColor:car.color??undefined,bodyType:'hatchback',doorCount:5});}
    const vin=new VinService(garage,profiles,new VinDbService(db),{decode:()=>{throw new Error('No VIN calls allowed');}},{});
    const provider={configured:true,reference:async()=>Buffer.from('fixture'),generate:async facts=>{
      calls.push({model:facts.model,color:facts.color});
      if(calls.length===1){startedA();await gate;}
      const file=facts.model==='Citigo'?'skoda-citigo-2012':facts.model==='Golf'?'volkswagen-golf-5':'nissan-qashqai-j11';
      return fs.readFileSync(`frontend/public/vehicle-artwork/${file}-v2.webp`).toString('base64');
    }};
    const config={get:key=>({VEHICLE_ARTWORK_ENABLED:'true',VEHICLE_ARTWORK_DAILY_LIMIT:'10',VEHICLE_ARTWORK_OWNER_DAILY_LIMIT:'5'})[key]};
    const service=new VehicleArtworkService(db,garage,profiles,vin,provider,config),jwt=new JwtService({secret:'artwork-browser-fixture'});class App{};
    Module({controllers:[VehicleArtworkController,GarageController,VehicleProfileController],providers:[{provide:VehicleArtworkService,useValue:service},{provide:GarageService,useValue:garage},{provide:VehicleProfileService,useValue:profiles},{provide:JwtService,useValue:jwt}]})(App);
    app=await NestFactory.create(App,{logger:false});app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));await app.listen(0,'127.0.0.1');
    const {createServer}=await import(pathToFileURL(path.resolve('frontend/node_modules/vite/dist/node/index.js')).href);
    process.env.VITE_PROXY_TARGET=await app.getUrl();
    vite=await createServer({root:path.resolve('frontend'),configFile:path.resolve('frontend/vite.config.ts'),logLevel:'silent',server:{host:'127.0.0.1',port:5198,strictPort:false}});await vite.listen();
    const base=`http://127.0.0.1:${vite.httpServer.address().port}`,token=jwt.sign({sub:OWNER});
    browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));await page.emulateMedia({reducedMotion:'reduce'});
    await page.addInitScript(({user,A,token})=>{localStorage.setItem('cara.token',token);localStorage.setItem('cara.user',JSON.stringify(user));localStorage.setItem('cara.language','en');if(!localStorage.getItem('cara.vehicleId'))localStorage.setItem('cara.vehicleId',A);},{user,A,token});
    await page.route('**/*',route=>{
      const url=new URL(route.request().url()),p=url.pathname;
      if(url.origin!==base)return route.abort();
      if(p==='/auth/me')return route.fulfill({json:user});
      if(p.startsWith('/garage/vehicles')||/^\/vehicles\/[^/]+\/(artwork|profile)(\/|$)/.test(p))return route.continue();
      if(p==='/assistant/history')return route.fulfill({json:{messages:[],epoch:0}});
      if(p==='/vin-access')return route.fulfill({json:{state:'used',freeRemaining:0,paidEnabled:false}});
      if(!p.startsWith('/vehicles/'))return route.continue();
      assert.equal(route.request().method(),'GET',`Unexpected external write: ${p}`);
      const json=p.endsWith('/vin/latest')||p.endsWith('/mileage/latest')||p.endsWith('/energy/full-to-full')?null:p.endsWith('/mileage/anomalies')?{anomalies:[]}:p.endsWith('/reminders')?{telegramLinked:true,deliveryEnabled:false,reminders:[]}:p.endsWith('/expenses/monthly-summary')?{currencies:[]}:p.endsWith('/energy/monthly-summary')?{entriesCount:0,money:[],fuelLiters:0,energyKwh:0}:[];
      return route.fulfill({json});
    });
    const nav=async name=>{const mobile=await page.locator('.menu-button').isVisible();if(mobile)await page.locator('.menu-button').click();await page.locator('.sidebar nav').getByRole('button',{name,exact:true}).click();if(mobile)await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().right<=0);};
    const personal=async()=>{await page.locator('.transformer-hero[data-artwork=personal][data-ready=true]').waitFor();const src=await page.locator('.transformer-hero img').getAttribute('src');assert.equal(await page.locator('.bot-avatar img').getAttribute('src'),src);assert.equal(await page.locator('.vehicle-thumb img').getAttribute('src'),src);return src;};
    await page.goto(base,{waitUntil:'domcontentloaded'});await started;await page.getByText('Creating your vehicle artwork…',{exact:true}).waitFor();assert.equal(calls.length,1);
    await nav('Garage');await page.locator('.vehicle-card').nth(1).getByRole('button',{name:'SELECT',exact:true}).click();const citigo=await personal();
    releaseA();await nav('Garage');await page.locator('.vehicle-card').first().getByRole('button',{name:'SELECT',exact:true}).click();const golf=await personal();assert.notEqual(golf,citigo);assert.equal(calls.length,2);output.switchDuringGeneration=true;
    await page.locator('.assistant-tile').click();await page.locator('.dialog-bot[data-artwork=personal]').waitFor();assert.equal(await page.locator('.dialog-bot img').getAttribute('src'),golf);await page.locator('.modal-close').click();output.dialogMatchesHero=true;
    await nav('Garage');await page.locator('.vehicle-card').nth(2).getByRole('button',{name:'SELECT',exact:true}).click();await page.getByRole('button',{name:'Complete vehicle details'}).click();
    await page.locator('.profile-correction-panel').getByLabel('Colour',{exact:true}).fill('white');await page.locator('.profile-correction-panel').getByRole('button',{name:'SAVE CONFIRMED DETAILS'}).click();
    await page.locator('.bot-avatar[data-artwork=personal]').waitFor();await nav('Home');await personal();assert.equal(calls.length,3);output.missingColorLeadsToProfileAndAutomaticArtwork=true;
    await page.reload({waitUntil:'networkidle'});await personal();assert.equal(calls.length,3);output.reloadUsesPostgresCache=true;
    fs.mkdirSync('scratch',{recursive:true});await page.screenshot({path:'scratch/personal-artwork-desktop.png',fullPage:true});
    for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});await personal();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Overflow at ${width}`);}
    await page.setViewportSize({width:390,height:844});await personal();await page.screenshot({path:'scratch/personal-artwork-mobile.png',fullPage:true});
    await nav('Garage');await page.locator('.vehicle-card [data-artwork=personal][data-ready=true]').nth(2).waitFor();await page.screenshot({path:'scratch/personal-artwork-garage-mobile.png',fullPage:true});
    const form=page.locator('form.form-card').filter({has:page.getByRole('heading',{name:'New car'})});
    await form.getByLabel('Make',{exact:true}).fill('Skoda');await form.getByLabel('Model',{exact:true}).fill('Citigo');await form.getByLabel('Year of manufacture',{exact:true}).fill('2016');await form.getByRole('button',{name:'ADD TO GARAGE'}).click();
    await page.locator('.vehicle-card').nth(3).waitFor();await page.locator('.vehicle-card').nth(3).getByRole('button',{name:'SELECT',exact:true}).click();await page.getByRole('button',{name:'Complete vehicle details'}).click();
    await page.locator('.profile-correction-panel').getByLabel('Colour',{exact:true}).fill('green');await page.locator('.profile-correction-panel').getByRole('button',{name:'SAVE CONFIRMED DETAILS'}).click();await page.locator('.bot-avatar[data-artwork=personal]').waitFor();await nav('Home');await personal();
    assert.equal(calls.length,4);assert.equal((await pg.query('SELECT count(*)::int n FROM vehicle_artworks WHERE state=$1',['ready'])).rows[0].n,4);
    assert.deepEqual(errors,[]);output.manualModelWithoutAnotherVinCheck=true;output.fakeGenerations=calls;output.responsiveWidths=[320,390,768,1440];output.browserErrors=errors;output.realPaidGenerations=0;console.log(JSON.stringify(output,null,2));
  }finally{releaseA?.();await browser?.close();await vite?.close();await app?.close();await pg.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
