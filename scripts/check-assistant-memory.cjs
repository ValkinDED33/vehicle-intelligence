// Real local HTTP, JWT, PostgreSQL and conversation services; AI and Telegram transport are fixtures.
require('reflect-metadata');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {PGlite}=require('@electric-sql/pglite');
const {drizzle}=require('drizzle-orm/pglite');
const {NestFactory}=require('@nestjs/core');
const {Module,ValidationPipe}=require('@nestjs/common');
const {JwtService}=require('@nestjs/jwt');
const fs=require('node:fs'),assert=require('node:assert/strict');
const {JwtAuthGuard}=require('../dist/common/guards/jwt-auth.guard');
const {AssistantController}=require('../dist/modules/assistant/assistant.controller');
const {AssistantMemoryService}=require('../dist/modules/assistant/assistant-memory.service');
const {AssistantConversationService}=require('../dist/modules/assistant/assistant-conversation.service');
const {TelegramConversationService}=require('../dist/modules/telegram/telegram-conversation.service');
const {GarageService}=require('../dist/modules/garage/services/garage.service');
const {GarageDbService}=require('../dist/modules/garage/garage.db.service');
const OWNER='33333333-3333-4333-8333-333333333333',CAR='11111111-1111-4111-8111-111111111111',CAR2='22222222-2222-4222-8222-222222222222';
const base=process.env.CARA_TEST_URL||'http://127.0.0.1:5193';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
function deferred(){let resolve;const promise=new Promise(fn=>{resolve=fn});return{promise,resolve};}
(async()=>{
  const pg=new PGlite();let app,browser;
  try{
    for(const entry of JSON.parse(fs.readFileSync('drizzle/meta/_journal.json')).entries)await pg.exec(fs.readFileSync(`drizzle/${entry.tag}.sql`,'utf8'));
    await pg.exec(`INSERT INTO users(id,email,password_hash,language) VALUES('${OWNER}','memory@example.test','fixture','en');
      INSERT INTO vehicles(id,owner_id,make,model) VALUES('${CAR}','${OWNER}','Nissan','Memory fixture'),('${CAR2}','${OWNER}','Toyota','Memory fixture');`);
    const db={connection:drizzle(pg)},garage=new GarageService(new GarageDbService(db)),memory=new AssistantMemoryService(db,garage);
    const calls=[],telegramCalls=[],delayed=deferred(),release=deferred();let webCalls=0;
    const model={
      chat:async input=>{calls.push(input);const number=++webCalls;if(input.message==='Delayed question'){delayed.resolve();await release.promise;}return{answer:`Website reply ${number}`,provider:'fixture',model:'fixture'};},
      planTurn:async input=>{telegramCalls.push(input);return{answer:'Telegram continuation reply',action:null};},
    };
    const conversations=new AssistantConversationService(model,memory),jwt=new JwtService({secret:'isolated-browser-memory'});
    class MemoryHttpModule{}
    Module({controllers:[AssistantController],providers:[JwtAuthGuard,{provide:JwtService,useValue:jwt},{provide:AssistantMemoryService,useValue:memory},{provide:AssistantConversationService,useValue:conversations}]})(MemoryHttpModule);
    app=await NestFactory.create(MemoryHttpModule,{logger:false});app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));await app.listen(0,'127.0.0.1');
    const apiBase=await app.getUrl(),token=jwt.sign({sub:OWNER}),cars=await garage.getVehicles(OWNER),scope={ownerId:OWNER,vehicleId:CAR,language:'en'};
    browser=await chromium.launch({headless:true});const errors=[];
    async function pageFor(width){
      const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage();
      page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
      const user={id:OWNER,email:'memory@example.test',displayName:'Memory fixture',language:'en',telegramLinked:true};
      await page.addInitScript(({user,token,CAR})=>{localStorage.setItem('cara.token',token);localStorage.setItem('cara.user',JSON.stringify(user));localStorage.setItem('cara.language','en');localStorage.setItem('cara.vehicleId',CAR);},{user,token,CAR});
      await page.route('**/*',async route=>{
        const req=route.request(),url=new URL(req.url()),path=url.pathname;
        if(url.origin!==new URL(base).origin)return route.abort();
        if(path.startsWith('/assistant/')){
          const response=await route.fetch({url:apiBase+path+url.search});return route.fulfill({response});
        }
        if(path==='/auth/me'){if(req.method()==='PATCH')user.language=req.postDataJSON().language;return route.fulfill({json:req.method()==='PATCH'?{accessToken:token,user}:user});}
        if(path==='/garage/vehicles')return route.fulfill({json:cars});
        if(path==='/vin-access')return route.fulfill({json:{state:'available',freeRemaining:1,paidEnabled:false}});
        if(path==='/vin/checks')return route.fulfill({json:[]});
        if(!path.startsWith('/vehicles/'))return route.continue();
        const json=path.endsWith('/reminders')?{telegramLinked:true,deliveryEnabled:true,reminders:[]}:path.endsWith('/mileage/anomalies')?{anomalies:[]}:path.endsWith('/expenses/monthly-summary')?{currencies:[],distanceKm:null}:path.endsWith('/energy/monthly-summary')?{entriesCount:0,money:[],fuelLiters:0,energyKwh:0}:path.endsWith('/profile/current')||path.endsWith('/mileage/latest')||path.endsWith('/vin/latest')||path.endsWith('/energy/full-to-full')?null:[];
        return route.fulfill({json});
      });
      await page.goto(base,{waitUntil:'networkidle'});return page;
    }
    const desktop=await pageFor(1440),mobile=await pageFor(390);
    await desktop.locator('.sidebar nav').getByRole('button',{name:'Settings',exact:true}).click();
    const preferencesForm=desktop.locator('.assistant-preferences');
    await preferencesForm.getByLabel('Answer detail',{exact:true}).selectOption('detailed');await preferencesForm.getByLabel('Your priority',{exact:true}).selectOption('economy');await preferencesForm.getByLabel('Driving pattern',{exact:true}).selectOption('city');
    await preferencesForm.getByRole('button',{name:'SAVE CHANGES',exact:true}).click();await preferencesForm.getByText('Assistant preferences saved.',{exact:true}).waitFor();
    assert.equal((await memory.preferences(OWNER)).detailLevel,'detailed');
    await desktop.screenshot({path:'scratch/assistant-preferences-desktop.png',fullPage:true});
    const open=async page=>{await page.locator('.ai-mode').click();await page.locator('.ai-dialog input').waitFor();await page.waitForFunction(()=>!document.querySelector('.ai-dialog input')?.disabled);};
    const send=async(page,text,answer)=>{await page.locator('.ai-dialog input').fill(text);await page.locator('.ai-dialog').getByRole('button',{name:'Send',exact:true}).click();if(answer)await page.getByText(answer,{exact:true}).waitFor();};
    await open(desktop);await send(desktop,'Question from website','Website reply 1');
    const telegram=new TelegramConversationService(conversations,garage,{},memory),replies=[];
    await telegram.handle({sendChatAction:async()=>{},reply:async text=>{replies.push(text)}},{id:OWNER,language:'en'},{history:[],selectedVehicleId:CAR,processedUpdates:[]},'Continue from Telegram');
    for(const input of [calls[0],telegramCalls[0]]){assert.equal(input.preferences.detailLevel,'detailed');assert.equal(input.preferences.priority,'economy');assert.equal(input.preferences.drivingPattern,'city');}
    assert.ok(telegramCalls[0].history.some(message=>message.content==='Question from website'));assert.deepEqual(replies,['Telegram continuation reply']);
    await open(mobile);await mobile.getByText('Telegram continuation reply',{exact:true}).waitFor();assert.equal(await mobile.locator('.ai-message').count(),4);
    await send(mobile,'Continue on another device','Website reply 2');assert.ok(calls[1].history.some(message=>message.content==='Continue from Telegram'));
    for(const question of await mobile.locator('.ai-message.user').all())assert.equal(await question.isVisible(),true);
    await mobile.waitForFunction(()=>{const box=document.querySelector('.ai-messages'),last=box?.lastElementChild;if(!box||!last)return false;const bounds=box.getBoundingClientRect(),message=last.getBoundingClientRect();return message.bottom<=bounds.bottom+1&&message.top>=bounds.top-1;});
    await desktop.locator('.ai-dialog').getByRole('button',{name:'Refresh',exact:true}).click();await desktop.getByText('Website reply 2',{exact:true}).waitFor();
    await desktop.screenshot({path:'scratch/shared-memory-desktop.png',fullPage:true});await mobile.screenshot({path:'scratch/shared-memory-mobile.png',fullPage:true});
    assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await desktop.getByRole('button',{name:'Clear chat history',exact:true}).click();await desktop.waitForFunction(()=>document.querySelectorAll('.ai-message').length===0);
    assert.equal((await memory.get(scope)).messages.length,0);
    const before=calls.length;await send(mobile,'Stale second device');await mobile.locator('.ai-dialog [role=alert]').waitFor();
    await mobile.waitForFunction(()=>document.querySelectorAll('.ai-message').length===0&&!document.querySelector('.ai-dialog input')?.disabled);
    assert.equal(calls.length,before);assert.equal(await mobile.locator('.ai-dialog input').inputValue(),'Stale second device');
    await send(desktop,'Delayed question');await delayed.promise;
    await desktop.getByRole('button',{name:'Clear chat history',exact:true}).click();await desktop.waitForFunction(()=>!document.querySelector('.ai-dialog input')?.disabled);
    release.resolve();await desktop.waitForTimeout(250);assert.equal((await memory.get(scope)).messages.length,0);assert.equal(await desktop.locator('.ai-message').count(),0);
    await desktop.getByRole('button',{name:'Close',exact:true}).click();await desktop.locator('.sidebar nav').getByRole('button',{name:'Garage',exact:true}).click();
    await desktop.locator('.vehicle-card').filter({hasText:'Toyota'}).getByRole('button',{name:'SELECT',exact:true}).click();
    await open(desktop);assert.equal(await desktop.locator('.ai-message').count(),0);await send(desktop,'Toyota only','Website reply 4');
    assert.equal((await memory.get(scope)).messages.length,0);assert.equal((await memory.get({...scope,vehicleId:CAR2})).messages.length,2);
    assert.equal((await pg.query('SELECT id FROM vehicles WHERE owner_id=$1',[OWNER])).rows.length,2);
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({browserToHttpToPostgres:true,preferencesSavedFromSettings:true,bothChannelsReceivePreferences:true,websiteToTelegramToSecondDevice:true,clearPreservesVehicleData:true,staleDeviceRejectedBeforeAi:true,delayedAnswerCannotRestoreHistory:true,carIsolation:true,desktopAndMobile:true,mobileQuestionsVisible:true,latestReplyVisible:true,realAiCalls:0,realTelegramMessages:0,runtimeErrors:errors},null,2));
  }finally{if(browser)await browser.close();if(app)await app.close();await pg.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
