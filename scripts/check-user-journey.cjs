// All API, storage and AI responses are fixtures. No production data or paid calls.
require('reflect-metadata');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const {EnergyEntryValidatorService}=require('../dist/modules/energy/services/energy-entry-validator.service');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const OWNER='33333333-3333-4333-8333-333333333333';
const base=process.env.CARA_TEST_URL||'http://127.0.0.1:5193';
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Only a local test server is allowed');
const user={id:OWNER,email:'fixture@example.test',displayName:'Fixture',language:'en',telegramLinked:true};
const manual={id:'44444444-4444-4444-8444-444444444444',title:'Insurance renewal fixture',dueDate:'2027-11-10',remindAt:'09:00',timeZone:'Europe/Warsaw',offsets:[{amount:1,unit:'months'}],status:'active',revision:1,deliveries:[]};
const automatic={...manual,id:'55555555-5555-4555-8555-555555555555',title:'Oil service fixture',maintenanceRuleId:'66666666-6666-4666-8666-666666666666',dueDate:'2026-11-05',sourcePhase:'mileage_warning',targetOdometerKm:130000,serviceDueDate:null};
const cars=[{id:A,make:'Nissan',model:'Fixture A',country:'PL',isArchived:false},{id:B,make:'Toyota',model:'Fixture B',country:'PL',isArchived:false}];
const output={};
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    const errors=[],requests=[],chats=[],held=[];
    const histories=new Map();let messageId=0;
    let preferences={detailLevel:'concise',priority:'balanced',drivingPattern:'unspecified',revision:0};
    const historyFor=(vehicleId,language)=>{const key=JSON.stringify([vehicleId,language]);if(!histories.has(key))histories.set(key,{messages:[],epoch:0,expiresAt:new Date(Date.now()+7*86400000).toISOString()});return histories.get(key);};
    let partial=true,race=false,charge=null;
    let doc={id:'77777777-7777-4777-8777-777777777777',vehicleId:A,type:'insurance',title:'Policy fixture',processingStatus:'pending',storageKey:null,expiresAt:'2027-11-10',updatedAt:'2026-11-05T09:00:00Z'};
    let fields=[];
    page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
    await page.addInitScript(({user,A})=>{
      localStorage.setItem('cara.token','fixture-only');localStorage.setItem('cara.user',JSON.stringify(user));localStorage.setItem('cara.language','en');
      if(!localStorage.getItem('cara.vehicleId'))localStorage.setItem('cara.vehicleId',A);
      window.open=()=>({opener:null,location:{set href(value){window.__downloadUrl=value;}},close(){}});
    },{user,A});
    await page.route('**/*',async route=>{
      const req=route.request(),url=new URL(req.url()),path=url.pathname,method=req.method();
      if(url.hostname==='storage.fixture.test')return route.fulfill({status:200,headers:{'access-control-allow-origin':'*'},body:''});
      if(url.origin!==new URL(base).origin)return route.abort();
      if(path==='/auth/me'){if(method==='PATCH')user.language=req.postDataJSON().language;return route.fulfill({json:method==='PATCH'?{accessToken:'fixture-only',user}:user});}
      if(path==='/garage/vehicles')return route.fulfill({json:cars});
      if(path==='/vin-access')return route.fulfill({json:{state:'available',freeRemaining:1,paidEnabled:false}});
      if(path==='/vin/checks')return route.fulfill({json:[]});
      if(path==='/assistant/preferences'){if(method==='PATCH'){const input=req.postDataJSON();preferences={detailLevel:input.detailLevel,priority:input.priority,drivingPattern:input.drivingPattern,revision:preferences.revision+1};}return route.fulfill({json:preferences});}
      if(path==='/assistant/history'){
        const history=historyFor(url.searchParams.get('vehicleId')??undefined,url.searchParams.get('language'));
        if(method==='DELETE'){history.epoch++;history.messages=[];}
        return route.fulfill({json:history});
      }
      if(path==='/assistant/chat'){
        const input=req.postDataJSON(),history=historyFor(input.vehicleId,input.language);chats.push(input);
        history.messages.push(...[{role:'user',content:input.message},{role:'assistant',content:'Fixture car answer.'}].map(message=>({...message,id:String(++messageId),channel:'web',createdAt:new Date().toISOString()})));
        return route.fulfill({json:{answer:'Fixture car answer.',provider:'fixture',model:'fixture',history}});
      }
      if(!path.startsWith('/vehicles/'))return route.continue();
      requests.push({path,method,query:url.search,input:method!=='GET'?req.postDataJSON():null});
      if(race&&path.startsWith(`/vehicles/${A}/`))await new Promise(resolve=>held.push(resolve));
      if(partial&&(path.endsWith('/maintenance/status')||path.endsWith('/mileage/anomalies')))return route.fulfill({status:503,json:{message:'fixture unavailable'}});
      if(path.endsWith('/energy')&&method==='POST'){
        charge=req.postDataJSON();new EnergyEntryValidatorService().validate(charge);
        return route.fulfill({status:201,json:{entry:charge,calculations:{totalCost:null}}});
      }
      if(path.endsWith('/documents'))return route.fulfill({json:[doc]});
      if(path.includes('/documents/')){
        if(path.endsWith('/fields/confirm')){fields=req.postDataJSON().fields.map(field=>({...field,fieldKey:'policy_number',fieldLabel:'Policy number',source:'manual'}));doc={...doc,updatedAt:new Date().toISOString()};return route.fulfill({json:{document:doc,fields}});}
        if(path.endsWith('/upload'))return route.fulfill({json:{bucket:'fixture',key:'fixture/policy.pdf',uploadUrl:'https://storage.fixture.test/upload',method:'PUT',headers:{'Content-Type':'application/pdf'}}});
        if(path.endsWith('/confirm')){doc={...doc,storageKey:'fixture/policy.pdf',originalFileName:'policy.pdf'};return route.fulfill({json:{document:doc}});}
        if(path.endsWith('/download'))return route.fulfill({json:{downloadUrl:'https://storage.fixture.test/policy.pdf'}});
        if(path.endsWith('/process')){doc={...doc,processingStatus:'completed',extractedText:'Fixture insurance policy'};fields=[{id:'field',fieldKey:'policy_number',fieldLabel:'Policy number',valueText:'TEST-123',source:'ai'}];}
        return route.fulfill({json:{document:doc,fields}});
      }
      if(path.endsWith('/reminders'))return route.fulfill({json:{telegramLinked:true,deliveryEnabled:true,reminders:[manual,automatic]}});
      const profile={id:'profile',version:2,source:'manual-confirmed',confirmedAt:'2026-11-05T08:00:00Z',fuelType:'electric',batteryUsableCapacityKwh:60};
      const mileage={id:'mileage',odometerKm:path.includes(B)?222222:111111,recordedAt:'2026-11-05T08:00:00Z',source:'web',confidence:1};
      const json=path.endsWith('/mileage/latest')?mileage:path.endsWith('/mileage/history')?[mileage]:path.endsWith('/mileage/anomalies')?{anomalies:[]}:path.endsWith('/expenses/monthly-summary')?{year:Number(url.searchParams.get('year')),month:Number(url.searchParams.get('month')),distanceKm:500,currencies:[{currency:'PLN',totalCost:100,expenseCost:60,energyCost:40,costPer100Km:20,categories:[]},{currency:'EUR',totalCost:20,expenseCost:20,energyCost:0,costPer100Km:4,categories:[]}]}:path.endsWith('/energy/monthly-summary')?{entriesCount:1,money:[],fuelLiters:0,energyKwh:42}:path.endsWith('/profile/current')?profile:path.endsWith('/profile/history')?[profile,{...profile,id:'old',version:1,source:'vin-decoded'}]:path.endsWith('/vin/latest')||path.endsWith('/energy/full-to-full')?null:[];
      assert.equal(method,'GET',`Unexpected fixture write: ${path}`);
      return route.fulfill({json});
    });
    const nav=async name=>{if(await page.locator('.menu-button').isVisible())await page.locator('.menu-button').click();await page.locator('.sidebar nav').getByRole('button',{name,exact:true}).click();};
    await page.goto(base,{waitUntil:'networkidle'});
    assert.match(await page.locator('.hero-bubble').innerText(),/incomplete/i);
    assert.doesNotMatch(await page.locator('.good').innerText(),/up to date|in order|Keep it up/i);
    assert.ok(await page.locator('.reminders').getByText(manual.title).count());
    output.partialFailureAndCalendar=true;
    await page.screenshot({path:'scratch/journey-partial-data.png',fullPage:true});
    await nav('Reminders');
    const automaticRow=page.locator('.scheduled-reminder').filter({has:page.getByRole('heading',{name:automatic.title,exact:true})});
    assert.match((await automaticRow.innerText()).replace(/[\s,]/g,''),/130000/);
    assert.equal(await automaticRow.getByRole('button',{name:'Mark complete',exact:true}).count(),0);
    await automaticRow.getByRole('button',{name:'Record completed maintenance',exact:true}).click();
    await page.getByRole('heading',{name:'Completed maintenance',exact:true}).waitFor();
    output.generatedMaintenanceRoute=true;
    await nav('Fuel and energy');
    const form=page.locator('main form').first();
    assert.equal(await form.locator('select').first().inputValue(),'charge');
    assert.equal(await form.getByRole('checkbox').count(),0);
    await form.locator('input').first().fill('42');await form.locator('button[type=submit]').click();
    await form.getByText('Charge added.',{exact:true}).waitFor();
    assert.equal(charge.kind,'charge');assert.equal(charge.isFullTank,false);assert.equal(charge.energyKwh,42);
    assert.doesNotMatch(await page.locator('main').innerText(),/FULL-TO-FULL/);output.electricCharge=true;
    await nav('Documents');
    const documentRow=page.locator('tr').filter({hasText:doc.title});
    await documentRow.locator('input[type=file]').setInputFiles({name:'policy.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF fixture')});
    await documentRow.getByText('policy.pdf',{exact:true}).waitFor();
    await documentRow.getByRole('button',{name:'Extract document data',exact:true}).click();
    await documentRow.getByText('TEST-123',{exact:true}).waitFor();
    await documentRow.getByRole('button',{name:'Download file',exact:true}).click();
    await page.waitForFunction(()=>window.__downloadUrl?.includes('policy.pdf'));
    for(const suffix of ['/upload','/confirm','/process','/download'])assert.ok(requests.some(row=>row.path.endsWith(suffix)),suffix);
    assert.ok(await documentRow.getByText('Extracted data has not been confirmed by the owner.',{exact:true}).count());output.documentLifecycle=true;
    await documentRow.getByRole('button',{name:'Review details',exact:true}).click();await documentRow.locator('textarea').fill('REVIEWED-456');
    await documentRow.getByRole('button',{name:'Confirm reviewed details',exact:true}).click();await documentRow.locator('.document-details form').waitFor({state:'detached'});await documentRow.getByText('REVIEWED-456',{exact:true}).waitFor();
    assert.equal(await documentRow.getByText('Extracted data has not been confirmed by the owner.',{exact:true}).count(),0);output.documentReview=true;
    await page.screenshot({path:'scratch/journey-documents.png',fullPage:true});
    await nav('Vehicle profile');await page.getByRole('button',{name:'Profile history',exact:true}).click();await page.locator('.profile-history').getByText('v1',{exact:true}).waitFor();output.profileHistory=true;
    await nav('Expenses');await page.locator('input[type=month]').fill('2026-09');
    await page.waitForResponse(response=>response.url().includes('/expenses/monthly-summary')&&response.url().includes('month=9'));
    await page.locator('.stat-panel select').selectOption('EUR');assert.match(await page.locator('.stat-panel .metric-value').innerText(),/20.00 EUR/);output.monthAndCurrency=true;
    await page.locator('.ai-mode').click();await page.getByPlaceholder('Ask a question...').fill('Remember fixture question');await page.getByRole('button',{name:'Send',exact:true}).click();await page.getByText('Fixture car answer.',{exact:true}).waitFor();
    await page.reload({waitUntil:'networkidle'});await page.locator('.ai-mode').click();assert.equal(await page.locator('.ai-message').count(),2);
    await page.getByPlaceholder('Ask a question...').fill('And what next?');await page.getByRole('button',{name:'Send',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.ai-message').length===4);
    assert.equal(Object.hasOwn(chats[1],'history'),false);assert.equal(chats[1].expectedMemoryEpoch,0);
    await page.getByRole('button',{name:'Clear chat history',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.ai-message').length===0);output.chatReloadAndClear=true;
    await page.getByRole('button',{name:'Close',exact:true}).click();
    partial=false;await nav('Garage');race=true;
    await page.locator('main').getByRole('button',{name:'Refresh',exact:true}).first().click();await page.waitForTimeout(100);assert.ok(held.length);
    await page.locator('.vehicle-card').filter({hasText:'Toyota'}).getByRole('button',{name:'SELECT',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.weather b')?.textContent?.includes('222'));
    race=false;held.splice(0).forEach(resolve=>resolve());await page.waitForTimeout(300);
    assert.match((await page.locator('.weather b').innerText()).replace(/[\s,]/g,''),/222222/);output.vehicleRace=true;
    for(const width of [1440,390]){
      await page.setViewportSize({width,height:900});
      for(const language of ['uk','pl','en']){
        await page.locator('header .language-chip select').selectOption(language);await page.waitForFunction(language=>document.documentElement.lang===language,language);
        for(let i=0;i<14;i++){
          if(width===390)await page.locator('.menu-button').click();
          const button=page.locator('.sidebar nav button').nth(i),name=await button.innerText();
          await button.click();await page.waitForTimeout(80);
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Horizontal overflow: ${width} ${language} ${name}`);
          const content=await page.locator('.inner-page,.dashboard').innerText();
          if(language!=='uk')assert.doesNotMatch(content.replaceAll('Українська',''),/[А-Яа-яІіЇїЄєҐґ]/,`${width} ${language} ${name}`);
        }
      }
      await nav('Service and maintenance');
      await page.screenshot({path:`scratch/journey-service-${width}.png`,fullPage:true});
    }
    output.sectionsAndLanguages='14 sections, 3 languages, desktop and mobile';
    assert.deepEqual(errors,[]);output.runtimeErrors=errors;
    console.log(JSON.stringify(output,null,2));
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
