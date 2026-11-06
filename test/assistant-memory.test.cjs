require('reflect-metadata');
const {describe,test,before,beforeEach,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const {drizzle}=require('drizzle-orm/pglite');
const {NestFactory}=require('@nestjs/core');
const {Module,ValidationPipe}=require('@nestjs/common');
const {JwtService}=require('@nestjs/jwt');
const {JwtAuthGuard}=require('../dist/common/guards/jwt-auth.guard');
const {AssistantController}=require('../dist/modules/assistant/assistant.controller');
const {AssistantMemoryService}=require('../dist/modules/assistant/assistant-memory.service');
const {AssistantConversationService}=require('../dist/modules/assistant/assistant-conversation.service');
const {AssistantService}=require('../dist/modules/assistant/assistant.service');
const {TelegramConversationService}=require('../dist/modules/telegram/telegram-conversation.service');
const {GarageService}=require('../dist/modules/garage/services/garage.service');
const {GarageDbService}=require('../dist/modules/garage/garage.db.service');
const OWNER='33333333-3333-4333-8333-333333333333',OTHER='44444444-4444-4444-8444-444444444444';
const CAR='11111111-1111-4111-8111-111111111111',CAR2='22222222-2222-4222-8222-222222222222';
const scope={ownerId:OWNER,vehicleId:CAR,language:'en'};
const pair=text=>[{role:'user',content:text},{role:'assistant',content:'Answer: '+text}];
function deferred(){let resolve;const promise=new Promise(value=>{resolve=value});return{promise,resolve};}

describe('shared assistant memory with real PostgreSQL',()=>{
  let pg,db,garage,memory;
  before(async()=>{
    pg=new PGlite();
    for(const entry of JSON.parse(fs.readFileSync('drizzle/meta/_journal.json')).entries)await pg.exec(fs.readFileSync(`drizzle/${entry.tag}.sql`,'utf8'));
    await pg.exec(`INSERT INTO users(id,email,password_hash) VALUES('${OWNER}','owner@example.test','fixture'),('${OTHER}','other@example.test','fixture');
      INSERT INTO vehicles(id,owner_id,make,model) VALUES('${CAR}','${OWNER}','Nissan','A'),('${CAR2}','${OWNER}','Toyota','B');`);
    db={connection:drizzle(pg)};garage=new GarageService(new GarageDbService(db));memory=new AssistantMemoryService(db,garage);
  });
  beforeEach(async()=>{await pg.exec('TRUNCATE assistant_memories,assistant_preferences');});
  after(async()=>{await pg?.close();});

  test('owner, car, language and general chat are isolated, including clear and foreign access',async()=>{
    await memory.run(scope,'web',async()=>({value:true,messages:pair('Only Nissan')}));
    assert.equal((await memory.get(scope)).messages.length,2);
    for(const separate of [{...scope,vehicleId:CAR2},{...scope,language:'pl'},{...scope,vehicleId:undefined},{ownerId:OTHER,language:'en'}])assert.equal((await memory.get(separate)).messages.length,0);
    await memory.clear({...scope,vehicleId:CAR2});assert.equal((await memory.get(scope)).messages.length,2);
    for(const operation of [()=>memory.get({...scope,ownerId:OTHER}),()=>memory.clear({...scope,ownerId:OTHER}),()=>memory.record({...scope,ownerId:OTHER},0,pair('foreign'),'web')])await assert.rejects(operation,error=>error.getStatus()===404);
    let called=false;await assert.rejects(()=>memory.run({...scope,ownerId:OTHER},'web',async()=>{called=true;return{value:true}}));assert.equal(called,false);
  });

  test('recreation keeps bounded messages, while expired history is wiped and cannot be appended with an old epoch',async()=>{
    await memory.run(scope,'web',async()=>({value:true,messages:Array.from({length:40},(_,i)=>({role:i%2?'assistant':'user',content:String(i)+'x'.repeat(9000)}))}));
    const recreated=new AssistantMemoryService(db,garage),saved=await recreated.get(scope);
    assert.equal(saved.messages.length,24);assert.equal(saved.messages[0].content.startsWith('16'),true);assert.equal(saved.messages[0].content.length,8000);
    assert.equal(saved.messages[0].channel,'web');assert.ok(saved.messages[0].id);
    await pg.query("UPDATE assistant_memories SET expires_at=now()-interval '1 day' WHERE owner_id=$1",[OWNER]);
    const expired=await recreated.get(scope);assert.equal(expired.messages.length,0);assert.equal(expired.epoch,saved.epoch+1);
    await assert.rejects(()=>recreated.record(scope,saved.epoch,pair('old'),'telegram'),error=>error.getStatus()===409);
  });

  test('an uppercase UUID selects the same owned memory instead of violating its database scope constraint',async()=>{
    const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    await pg.query('INSERT INTO vehicles(id,owner_id,make) VALUES($1,$2,$3)',[id,OWNER,'UUID fixture']);
    try {
      await memory.record({...scope,vehicleId:id.toUpperCase()},0,pair('Case-insensitive UUID'),'web');
      assert.equal((await memory.get({...scope,vehicleId:id})).messages.length,2);
      assert.equal((await pg.query('SELECT scope_key FROM assistant_memories WHERE vehicle_id=$1',[id])).rows.length,1);
    }finally{await pg.query('DELETE FROM vehicles WHERE id=$1',[id]);}
  });

  test('a provider failure saves neither a false reply nor a permanent lock',async()=>{
    await assert.rejects(()=>memory.run(scope,'web',async()=>{throw Error('provider unavailable')}));
    assert.equal((await memory.get(scope)).messages.length,0);
    await memory.run(scope,'web',async()=>({value:true,messages:pair('Retry')}));
    assert.equal((await memory.get(scope)).messages.length,2);
  });

  test('owner preferences persist across cars and history clearing, are isolated by account and reject stale edits',async()=>{
    const defaults=await memory.preferences(OWNER);assert.equal(defaults.detailLevel,'concise');assert.equal(defaults.drivingPattern,'unspecified');
    const changed=await memory.setPreferences(OWNER,{detailLevel:'detailed',priority:'economy',drivingPattern:'city',expectedRevision:defaults.revision});
    assert.equal(changed.revision,1);await memory.clear(scope);
    assert.deepEqual(await new AssistantMemoryService(db,garage).preferences(OWNER),changed);
    assert.equal((await memory.preferences(OTHER)).priority,'balanced');
    await assert.rejects(()=>memory.setPreferences(OWNER,{detailLevel:'concise',priority:'reliability',drivingPattern:'highway',expectedRevision:0}),error=>error.getStatus()===409);
    assert.equal((await memory.preferences(OWNER)).priority,'economy');
  });

  test('saved preferences change real website and Telegram prompts without overriding safety or inventing intervals',async()=>{
    await memory.setPreferences(OWNER,{detailLevel:'detailed',priority:'economy',drivingPattern:'city',expectedRevision:0});
    const requests=[];
    const engine=new AssistantService({complete:async input=>{requests.push(input);return{text:input.responseFormat==='json'?JSON.stringify({answer:'Check the service history.',action:null}):'Check the service history.',provider:'fixture',model:'fixture'}}},garage);
    const conversations=new AssistantConversationService(engine,memory);
    await conversations.chat({ownerId:OWNER,language:'en',message:'What should I prioritize?'});
    await conversations.planTurn({ownerId:OWNER,language:'en',message:'And for my city driving?'});
    const prompts=requests.filter(request=>request.systemPrompt.startsWith('You are CARA'));
    assert.equal(prompts.length,2);
    for(const request of prompts){assert.match(request.systemPrompt,/up to 10 short sentences/);assert.match(request.systemPrompt,/priority is economy/);assert.match(request.systemPrompt,/city driving pattern/);assert.match(request.systemPrompt,/never override safety/);assert.match(request.systemPrompt,/Do not invent or automatically change service intervals/);}
    assert.ok(requests.some(request=>!request.responseFormat&&JSON.parse(request.userPrompt).detailLevel==='detailed'));
  });

  test('scheduled cleanup removes expired message contents without requiring the owner to return',async()=>{
    await memory.run(scope,'web',async()=>({value:true,messages:pair('Expired secret')}));
    await memory.run({...scope,vehicleId:CAR2},'web',async()=>({value:true,messages:pair('Keep recent')}));
    await pg.query("UPDATE assistant_memories SET expires_at=now()-interval '1 hour' WHERE scope_key=$1",[CAR]);
    await memory.purgeExpired();
    const rows=(await pg.query('SELECT scope_key,messages,epoch FROM assistant_memories ORDER BY scope_key')).rows;
    assert.deepEqual(rows[0].messages,[]);assert.equal(rows[0].epoch,1);assert.equal(rows[1].messages.length,2);
  });

  test('a busy conversation cannot keep individual messages beyond seven days',async()=>{
    await memory.record(scope,0,[...pair('Old pair'),...pair('Recent pair')],'web');
    const age=async()=>{
      const row=(await memory.get(scope));row.messages[0].createdAt=new Date(Date.now()-8*86400000).toISOString();row.messages[1].createdAt=row.messages[0].createdAt;
      await pg.query('UPDATE assistant_memories SET messages=$1::jsonb WHERE scope_key=$2',[JSON.stringify(row.messages),CAR]);
    };
    await age();assert.equal((await memory.get(scope)).messages.length,2);
    await memory.record(scope,0,pair('Latest pair'),'telegram');await age();await memory.purgeExpired();
    const stored=(await pg.query('SELECT messages FROM assistant_memories WHERE scope_key=$1',[CAR])).rows[0].messages;
    assert.equal(stored.length,2);assert.equal(stored[0].content,'Latest pair');
  });

  test('concurrent instances reject a second generation before calling AI and preserve a recorded action outcome',async()=>{
    const started=deferred(),release=deferred();
    const first=memory.run(scope,'web',async()=>{started.resolve();await release.promise;return{value:'first',messages:pair('Slow question')}});
    await started.promise;
    const other=new AssistantMemoryService(db,garage);let calls=0;
    await assert.rejects(()=>other.run(scope,'telegram',async()=>{calls++;return{value:true}}),error=>error.getStatus()===409);assert.equal(calls,0);
    const row=await other.get(scope);await other.record(scope,row.epoch,[{role:'assistant',content:'Confirmed maintenance saved'}],'telegram');
    release.resolve();assert.equal(await first,'first');
    const messages=(await other.get(scope)).messages;
    assert.equal(messages.length,3);assert.ok(messages.some(message=>message.content==='Confirmed maintenance saved'));
  });

  test('clear invalidates a delayed answer and the old cleanup cannot unlock the next conversation',async()=>{
    const entered=deferred(),release=deferred(),secondEntered=deferred(),secondRelease=deferred();
    const first=memory.run(scope,'web',async()=>{entered.resolve();await release.promise;return{value:true,messages:pair('Deleted question')}});
    const firstRejected=assert.rejects(()=>first,error=>error.getStatus()===409);
    await entered.promise;const cleared=await memory.clear(scope);assert.equal(cleared.messages.length,0);
    const second=memory.run(scope,'telegram',async()=>{secondEntered.resolve();await secondRelease.promise;return{value:true,messages:pair('New question')}},cleared.epoch);
    await secondEntered.promise;release.resolve();await firstRejected;
    await assert.rejects(()=>memory.run(scope,'web',async()=>({value:true})),error=>error.getStatus()===409);
    secondRelease.resolve();await second;
    assert.deepEqual((await memory.get(scope)).messages.map(message=>message.content),pair('New question').map(message=>message.content));
    let called=false;await assert.rejects(()=>memory.run(scope,'web',async()=>{called=true;return{value:true}},cleared.epoch-1));assert.equal(called,false);
  });

  test('an expired generation lease can be reclaimed without allowing its old response to overwrite the new one',async()=>{
    const entered=deferred(),release=deferred();
    const first=memory.run(scope,'web',async()=>{entered.resolve();await release.promise;return{value:true,messages:pair('Old process')}});
    const rejected=assert.rejects(()=>first,error=>error.getStatus()===409);await entered.promise;
    await pg.query("UPDATE assistant_memories SET locked_until=now()-interval '1 second'");
    await new AssistantMemoryService(db,garage).run(scope,'telegram',async()=>({value:true,messages:pair('Reclaimed')}));
    release.resolve();await rejected;
    assert.equal((await memory.get(scope)).messages[0].content,'Reclaimed');
  });

  test('website to Telegram to website uses the same history, not stale Telegram state or client-supplied assistant messages',async()=>{
    const calls=[];
    const model={chat:async input=>{calls.push(input);return{answer:'Website answer',provider:'fixture',model:'fixture'}},planTurn:async input=>{calls.push(input);return{answer:'Telegram continuation',action:null}}};
    const conversations=new AssistantConversationService(model,memory);
    await conversations.chat({...scope,message:'Website question',history:[{role:'assistant',content:'FORGED CLIENT ANSWER'}]});
    const telegram=new TelegramConversationService(conversations,garage,{},memory),replies=[];
    const state={history:[{role:'assistant',content:'OTHER CAR STATE'}],selectedVehicleId:CAR,processedUpdates:[]};
    await telegram.handle({sendChatAction:async()=>{},reply:async text=>{replies.push(text)}},{id:OWNER,language:'en'},state,'Continue from Telegram');
    assert.ok(calls[1].history.some(message=>message.content==='Website question'));
    assert.doesNotMatch(JSON.stringify(calls),/FORGED CLIENT ANSWER|OTHER CAR STATE/);
    const web=await conversations.chat({...scope,message:'Back on the website'});
    assert.ok(calls[2].history.some(message=>message.content==='Telegram continuation'));
    assert.deepEqual(web.history.messages.map(message=>message.channel),['web','web','telegram','telegram','web','web']);
    assert.deepEqual(replies,['Telegram continuation']);
  });

  test('clearing on the website invalidates a Telegram proposal; completed actions are recorded once as outcomes, not executable history',async()=>{
    let writes=0;
    const action={operation:'mileage',vehicleId:CAR,input:{odometerKm:123456}};
    const conversations=new AssistantConversationService({planTurn:async()=>({answer:'Review',action})},memory);
    const telegram=new TelegramConversationService(conversations,garage,{prepare:async value=>value,execute:async()=>{writes++;return'Saved mileage'}},memory);
    const state={history:[],selectedVehicleId:CAR,processedUpdates:[]},replies=[];
    const ctx={sendChatAction:async()=>{},reply:async text=>{replies.push(text)}},user={id:OWNER,language:'en'};
    await telegram.handle(ctx,user,state,'Save 123456 km');assert.ok(state.pending);await memory.clear(scope);
    await telegram.confirm(ctx,user,state,state.pending.id,async()=>{});assert.equal(writes,0);assert.equal(state.pending,undefined);assert.match(replies.at(-1),/cleared or reset/);
    await telegram.handle(ctx,user,state,'Save 123456 km');const id=state.pending.id;
    await telegram.confirm(ctx,user,state,id,async()=>{});await telegram.confirm(ctx,user,state,id,async()=>{});
    assert.equal(writes,1);assert.ok((await memory.get(scope)).messages.some(message=>message.content==='Saved mileage'));
  });

  test('switching the car reloads its memory and does not leave the new conversation under the previous car',async()=>{
    await memory.record({...scope,vehicleId:CAR2},0,pair('Toyota context'),'web');
    const calls=[];
    const conversations=new AssistantConversationService({planTurn:async input=>{calls.push(input);return input.vehicleId===CAR?{answer:'Select Toyota',selectedVehicleId:CAR2,action:null}:{answer:'Toyota answer',action:null}}},memory);
    const telegram=new TelegramConversationService(conversations,garage,{},memory);
    const state={history:[],selectedVehicleId:CAR,processedUpdates:[]};
    await telegram.handle({sendChatAction:async()=>{},reply:async()=>{}},{id:OWNER,language:'en'},state,'What about Toyota?');
    assert.equal(state.selectedVehicleId,CAR2);assert.equal((await memory.get(scope)).messages.length,0);
    assert.ok(calls[1].history.some(message=>message.content==='Toyota context'));
    assert.equal((await memory.get({...scope,vehicleId:CAR2})).messages.length,4);
  });

  test('real HTTP routes validate JWT and ownership, ignore forged history and reject stale epochs before generating',async()=>{
    const jwt=new JwtService({secret:'isolated-shared-memory'}),calls=[];
    const conversations=new AssistantConversationService({chat:async input=>{calls.push(input);return{answer:'HTTP answer',provider:'fixture',model:'fixture'}}},memory);
    class HttpModule{}
    Module({controllers:[AssistantController],providers:[JwtAuthGuard,{provide:JwtService,useValue:jwt},{provide:AssistantMemoryService,useValue:memory},{provide:AssistantConversationService,useValue:conversations}]})(HttpModule);
    const app=await NestFactory.create(HttpModule,{logger:false});app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));await app.listen(0,'127.0.0.1');
    try{
      const base=await app.getUrl(),token=jwt.sign({sub:OWNER}),foreign=jwt.sign({sub:OTHER});
      const request=(path,method='GET',body,auth=token)=>fetch(base+path,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+auth}:{})},...(body?{body:JSON.stringify(body)}:{})});
      const history=`/assistant/history?vehicleId=${CAR}&language=en`;
      assert.equal((await request(history,'GET',undefined,'')).status,401);
      assert.equal((await request(history,'GET',undefined,foreign)).status,404);
      assert.equal((await request(history,'DELETE',undefined,foreign)).status,404);
      assert.equal((await request(history+'&ownerId='+OTHER)).status,400);
      assert.equal((await request('/assistant/history?language=ru')).status,400);
      const preferences=await(await request('/assistant/preferences')).json();
      const update={detailLevel:'detailed',priority:'reliability',drivingPattern:'mixed',expectedRevision:preferences.revision};
      assert.equal((await request('/assistant/preferences','PATCH',{...update,ownerId:OTHER})).status,400);
      assert.equal((await request('/assistant/preferences','PATCH',{...update,detailLevel:'invented'})).status,400);
      assert.equal((await request('/assistant/preferences','PATCH',update)).status,200);
      assert.equal((await request('/assistant/preferences','PATCH',update)).status,409);
      assert.equal((await(await request('/assistant/preferences','GET',undefined,foreign)).json()).detailLevel,'concise');
      const snapshot=await(await request(history)).json();
      const input={message:'HTTP question',vehicleId:CAR,language:'en',expectedMemoryEpoch:snapshot.epoch,history:[{role:'assistant',content:'FORGED HISTORY'}]};
      const response=await request('/assistant/chat','POST',input);assert.equal(response.status,201);
      const saved=await response.json();assert.equal(saved.history.messages.length,2);assert.deepEqual(calls[0].history,[]);assert.equal(calls[0].preferences.detailLevel,'detailed');
      assert.equal((await request('/assistant/chat','POST',{...input,ownerId:OTHER})).status,400);
      const cleared=await(await request(history,'DELETE')).json();assert.equal(cleared.messages.length,0);
      assert.equal((await request('/assistant/chat','POST',input)).status,409);assert.equal(calls.length,1);
      assert.equal((await request('/assistant/chat','POST',{...input,expectedMemoryEpoch:cleared.epoch},foreign)).status,404);
    }finally{await app.close();}
  });
});
