require('reflect-metadata');
const {describe,test,before,beforeEach,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const {drizzle}=require('drizzle-orm/pglite');
const {ServiceUnavailableException,Module}=require('@nestjs/common');
const {NestFactory}=require('@nestjs/core');
const {JwtService}=require('@nestjs/jwt');
const {of}=require('rxjs');
const {VinAccessService}=require('../dist/modules/vin-access/vin-access.service');
const {VinAccessController}=require('../dist/modules/vin-access/vin-access.controller');
const {VinController}=require('../dist/modules/vin/controllers/vin.controller');
const {StandaloneVinController}=require('../dist/modules/vin/controllers/standalone-vin.controller');
const {VinService}=require('../dist/modules/vin/services/vin.service');
const {VinDbService}=require('../dist/modules/vin/vin.db.service');
const {GarageService}=require('../dist/modules/garage/services/garage.service');
const {GarageDbService}=require('../dist/modules/garage/garage.db.service');
const {ExternalReportsDbService}=require('../dist/modules/external-reports/external-reports.db.service');
const {ExternalReportsService}=require('../dist/modules/external-reports/services/external-reports.service');
const {VehicleDatabasesSourcesService}=require('../dist/modules/external-reports/services/vehicle-databases-sources.service');
const {OneAutoReportsService}=require('../dist/modules/external-reports/services/one-auto-reports.service');
const {VehicleDatabasesNoRecordsError}=require('../dist/common/vehicle-databases/vehicle-databases-client.service');
const {IdentityDbService}=require('../dist/modules/identity/identity.db.service');
const {AssistantService}=require('../dist/modules/assistant/assistant.service');
const OWNER='33333333-3333-4333-8333-333333333333',OTHER='44444444-4444-4444-8444-444444444444';
const CAR='11111111-1111-4111-8111-111111111111',CAR2='22222222-2222-4222-8222-222222222222';
const VIN='WBA12345678901234';
const status=expected=>error=>error.getStatus()===expected;

describe('one VIN trial shared across website, Telegram, cars and providers',()=>{
  let pg,db,access,garage,vin,reports,vdb,oneauto,history,calls,identity;
  const decode=()=>{calls++;return Promise.resolve({provider:'fixture',vin:VIN,make:'Fixture',rawPayload:{fixture:true}});};
  before(async()=>{
    pg=new PGlite();
    for(const entry of JSON.parse(fs.readFileSync('drizzle/meta/_journal.json')).entries)await pg.exec(fs.readFileSync(`drizzle/${entry.tag}.sql`,'utf8'));
    await pg.exec(`INSERT INTO users(id,email,password_hash) VALUES('${OWNER}','owner@fixture.test','fixture'),('${OTHER}','telegram_123@telegram.local','fixture');
      INSERT INTO vehicles(id,owner_id,make,vin) VALUES('${CAR}','${OWNER}','Fixture','${VIN}'),('${CAR2}','${OWNER}','Fixture B','${VIN}');`);
    db={connection:drizzle(pg)};access=new VinAccessService(db);garage=new GarageService(new GarageDbService(db));
    vin=new VinService(garage,{createProfileVersion:async()=>{}},new VinDbService(db),{decode},access);
    reports=new ExternalReportsDbService(db);
    vdb=new VehicleDatabasesSourcesService(garage,reports,{buildVinUrl:()=>'/fixture',fetch:async()=>{calls++;return {fixture:true};}},{applyToReport:async()=>({normalized:false})},access);
    oneauto=new OneAutoReportsService(garage,reports,{get:()=>{calls++;return of({data:{fixture:true}});}},{get:key=>key==='ONEAUTO_API_KEY'?'fixture-not-a-real-key':undefined},access);
    history=new ExternalReportsService(garage,reports,{getHistory:async()=>{calls++;return {provider:'fixture',vin:VIN,rawPayload:{fixture:true}};}},access);
    identity=new IdentityDbService(db);
  });
  beforeEach(async()=>{
    calls=0;await pg.exec('TRUNCATE vin_check_access,vin_decodes,vehicle_external_reports,telegram_links,standalone_vin_checks');
    await pg.query("UPDATE users SET telegram_id = NULL");
  });
  after(async()=>{await pg?.close();});

  test('one standalone Telegram lookup prevents all website provider paths and car changes, but not saved reads',async()=>{
    await vin.decodeStandaloneVin(OWNER,VIN);
    assert.deepEqual(await access.status(OWNER),{state:'used',freeRemaining:0,paidEnabled:false});
    for(const operation of [()=>vin.decodeVehicleVin(OWNER,CAR),()=>vdb.fetchSource(OWNER,CAR2,'basic-vin-decode'),()=>oneauto.fetchSource(OWNER,CAR,'oneauto-recall-check-vin'),()=>history.fetchVehicleHistory(OWNER,CAR)])await assert.rejects(operation,status(402));
    assert.equal(calls,1);assert.deepEqual(await vin.getDecodeHistory(OWNER,CAR),[]);assert.deepEqual(await history.getReports(OWNER,CAR),[]);
    const saved=await vin.getStandaloneChecks(OWNER);assert.equal(saved.length,1);assert.equal(saved[0].vin,VIN);assert.equal(saved[0].result.make,'Fixture');assert.deepEqual(await vin.getStandaloneChecks(OTHER),[]);
    assert.equal((await access.status(OTHER)).freeRemaining,1);
  });
  test('each provider route consumes exactly one allowance and its saved report can still be read',async()=>{
    for(const operation of [()=>vin.decodeVehicleVin(OWNER,CAR),()=>vdb.fetchSource(OWNER,CAR,'basic-vin-decode'),()=>oneauto.fetchSource(OWNER,CAR,'oneauto-recall-check-vin'),()=>history.fetchVehicleHistory(OWNER,CAR)]){
      await pg.exec('TRUNCATE vin_check_access');const before=calls;
      await operation();assert.equal(calls,before+1);assert.equal((await access.status(OWNER)).state,'used');
      await assert.rejects(()=>vin.decodeStandaloneVin(OWNER,VIN),status(402));
    }
    assert.equal((await vin.getDecodeHistory(OWNER,CAR)).length,1);
    assert.equal((await history.getReports(OWNER,CAR)).length,3);
    assert.equal(calls,4);
  });
  test('parallel requests from independent instances reserve before contacting a provider',async()=>{
    let release,started;const waiting=new Promise(r=>release=r),entered=new Promise(r=>started=r);
    const first=access.run(OWNER,'fixture',VIN,async()=>{calls++;started();await waiting;return true;});await entered;
    const recreated=new VinAccessService(db);
    assert.equal((await recreated.status(OWNER)).state,'in_progress');
    await assert.rejects(()=>recreated.run(OWNER,'other-source',VIN,decode),status(409));
    release();await first;assert.equal(calls,1);
    await assert.rejects(()=>recreated.run(OWNER,'fixture',VIN,decode),status(402));
  });
  test('invalid VINs, foreign cars, unknown sources and bulk requests never spend the trial or call providers',async()=>{
    for(const operation of [()=>vin.decodeStandaloneVin(OWNER,'invalid'),()=>vin.decodeVehicleVin(OTHER,CAR),()=>vdb.fetchSource(OWNER,CAR,'unknown'),()=>vdb.fetchAllSources(OWNER,CAR)])await assert.rejects(operation);
    assert.equal(calls,0);assert.equal((await access.status(OWNER)).freeRemaining,1);assert.equal((await access.status(OTHER)).freeRemaining,1);
  });
  test('unconfigured, quota-rejected and rate-rejected requests release access without a lookup result',async()=>{
    for(const code of ['VIN_PROVIDER_NOT_CONFIGURED','VINCARIO_NOT_CONFIGURED','VIN_PROVIDER_AUTH_FAILED','VIN_PROVIDER_QUOTA_EXHAUSTED','VIN_PROVIDER_RATE_LIMITED']){
      await assert.rejects(()=>access.run(OWNER,'fixture',VIN,async()=>{throw new ServiceUnavailableException({code});}),status(503));
      assert.equal((await access.status(OWNER)).freeRemaining,1);
    }
    const disabled=new OneAutoReportsService(garage,reports,{}, {get:()=>undefined},access);
    await assert.rejects(()=>disabled.fetchSource(OWNER,CAR,'oneauto-recall-check-vin'),status(503));
    assert.equal((await access.status(OWNER)).freeRemaining,1);assert.equal(calls,0);
  });
  test('no-data is a consumed lookup, with an explicit response rather than a clean-car assertion',async()=>{
    await assert.rejects(()=>access.run(OWNER,'fixture',VIN,async()=>{throw new VehicleDatabasesNoRecordsError('fixture');}),error=>error.getStatus()===404&&error.getResponse().code==='VIN_NO_DATA');
    assert.equal((await access.status(OWNER)).state,'used');
    await pg.exec('TRUNCATE vin_check_access');
    const empty=new VehicleDatabasesSourcesService(garage,reports,{buildVinUrl:()=>'/fixture',fetch:async()=>{throw new VehicleDatabasesNoRecordsError('fixture');}}, {},access);
    const result=await empty.fetchSource(OWNER,CAR,'basic-vin-decode');assert.equal(result.report.status,'no-data');
    assert.equal((await access.status(OWNER)).state,'used');
    await pg.exec('TRUNCATE vin_check_access');
    const standalone=new VinService(garage,{},new VinDbService(db),{decode:async()=>{throw new VehicleDatabasesNoRecordsError('fixture');}},access);
    await assert.rejects(()=>standalone.decodeStandaloneVin(OWNER,VIN),status(404));
    assert.equal((await vin.getStandaloneChecks(OWNER))[0].status,'no-data');assert.equal((await access.status(OWNER)).state,'used');
    await pg.exec('TRUNCATE vin_check_access');
    await assert.rejects(()=>standalone.decodeVehicleVin(OWNER,CAR),status(404));assert.equal((await vin.getLatestDecode(OWNER,CAR)).status,'no-data');assert.equal((await access.status(OWNER)).state,'used');
  });
  test('transport ambiguity, persistence failure and a crashed reservation never auto-release or repeat a paid upstream call',async()=>{
    await assert.rejects(()=>access.run(OWNER,'fixture',VIN,async()=>{calls++;throw Error('timeout');}));
    assert.equal((await access.status(OWNER)).state,'uncertain');
    await assert.rejects(()=>access.run(OWNER,'fixture',VIN,decode),status(409));assert.equal(calls,1);
    await pg.query("UPDATE vin_check_access SET state='in_progress',claimed_at=now()-interval '1 hour' WHERE owner_id=$1",[OWNER]);
    assert.equal((await access.status(OWNER)).state,'uncertain');await assert.rejects(()=>access.run(OWNER,'fixture',VIN,decode),status(409));
    await pg.exec('TRUNCATE vin_check_access');
    const broken=new VinService(garage,{}, {saveDecodeResult:async()=>{throw Error('storage unavailable');}}, {decode},access);
    await assert.rejects(()=>broken.decodeVehicleVin(OWNER,CAR));
    assert.equal(calls,2);assert.equal((await access.status(OWNER)).state,'uncertain');
    await assert.rejects(()=>vin.decodeStandaloneVin(OWNER,VIN),status(409));assert.equal(calls,2);
  });
  test('deployment backfills previously successful VIN reports but not non-VIN registry queries',async()=>{
    const third='55555555-5555-4555-8555-555555555555';
    await pg.query('INSERT INTO vehicles(id,owner_id,make) VALUES($1,$2,$3)',[third,OTHER,'Registry fixture']);
    try{
      await pg.query("INSERT INTO vin_decodes(vehicle_id,vin,provider,status) VALUES($1,$2,'fixture','success')",[CAR,VIN]);
      await reports.createReport({vehicleId:third,vin:VIN,provider:'cepik',reportType:'registry',status:'success',rawPayload:{}});
      await pg.exec('DROP TABLE vin_check_access,standalone_vin_checks');
      await pg.exec(fs.readFileSync('drizzle/0023_vin_check_access.sql','utf8'));
      assert.equal((await access.status(OWNER)).freeRemaining,0);assert.equal((await access.status(OTHER)).freeRemaining,1);
    }finally{await pg.query('DELETE FROM vehicles WHERE id=$1',[third]);}
  });
  test('linking carries the consumed Telegram trial to the website and retires the previous account',async()=>{
    await pg.query("UPDATE users SET telegram_id='123' WHERE id=$1",[OTHER]);
    await vin.decodeStandaloneVin(OTHER,VIN);
    const {token}=await identity.createTelegramLink(OWNER);await identity.consumeTelegramLink(token,'123');
    assert.equal((await access.status(OWNER)).state,'used');assert.equal((await access.status(OTHER)).state,'used');
    assert.equal((await vin.getStandaloneChecks(OWNER)).length,1);assert.deepEqual(await vin.getStandaloneChecks(OTHER),[]);
    await assert.rejects(()=>vin.decodeStandaloneVin(OWNER,VIN),status(402));await assert.rejects(()=>vin.decodeStandaloneVin(OTHER,VIN),status(402));assert.equal(calls,1);
  });
  test('an unused retired Telegram account cannot spend an old JWT trial, while its website account keeps one',async()=>{
    await pg.query("UPDATE users SET telegram_id='123' WHERE id=$1",[OTHER]);
    const {token}=await identity.createTelegramLink(OWNER);await identity.consumeTelegramLink(token,'123');
    assert.equal((await access.status(OWNER)).freeRemaining,1);assert.equal((await access.status(OTHER)).freeRemaining,0);
    await assert.rejects(()=>vin.decodeStandaloneVin(OTHER,VIN),status(402));assert.equal(calls,0);
  });
  test('an unresolved Telegram lookup prevents linking rather than duplicating its allowance',async()=>{
    await pg.query("UPDATE users SET telegram_id='123' WHERE id=$1",[OTHER]);
    await assert.rejects(()=>access.run(OTHER,'fixture',VIN,async()=>{throw Error('timeout');}));
    const {token}=await identity.createTelegramLink(OWNER);await assert.rejects(()=>identity.consumeTelegramLink(token,'123'),status(409));
    assert.equal((await access.status(OWNER)).freeRemaining,1);assert.equal((await access.status(OTHER)).state,'uncertain');
  });
  test('real JWT HTTP routes derive owner from the token and share the same server allowance',async()=>{
    const jwt=new JwtService({secret:'vin-fixture-only'});
    class App{};Module({controllers:[VinAccessController,VinController,StandaloneVinController],providers:[{provide:VinAccessService,useValue:access},{provide:VinService,useValue:vin},{provide:JwtService,useValue:jwt}]})(App);
    const app=await NestFactory.create(App,{logger:false});await app.listen(0,'127.0.0.1');
    try{
      const base=await app.getUrl();const token=jwt.sign({sub:OWNER}),other=jwt.sign({sub:OTHER});
      assert.equal((await fetch(base+'/vin-access')).status,401);
      assert.equal((await fetch(base+'/vin/checks')).status,401);
      assert.equal((await fetch(`${base}/vehicles/${CAR}/vin/decode`,{method:'POST',headers:{Authorization:`Bearer ${other}`}})).status,404);
      const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
      assert.equal((await fetch(`${base}/vehicles/${CAR}/vin/decode`,{method:'POST',headers,body:JSON.stringify({ownerId:OTHER})})).status,201);
      assert.equal((await fetch(`${base}/vehicles/${CAR2}/vin/decode`,{method:'POST',headers})).status,402);
      assert.equal((await (await fetch(base+'/vin-access',{headers})).json()).freeRemaining,0);
      assert.equal((await fetch(`${base}/vehicles/${CAR}/vin/latest`,{headers})).status,200);assert.equal(calls,1);
      await vin.decodeStandaloneVin(OTHER,VIN);
      assert.equal((await (await fetch(`${base}/vin/checks`,{headers})).json()).length,0);
      assert.equal((await (await fetch(`${base}/vin/checks`,{headers:{Authorization:`Bearer ${other}`}})).json())[0].vin,VIN);
    }finally{await app.close();}
  });
  test('both assistant channels receive current server eligibility, not a claim copied from conversation history',async()=>{
    const requests=[];
    const assistant=new AssistantService({complete:async input=>{requests.push(input);return {text:input.responseFormat==='json'?JSON.stringify({answer:'Review saved reports.',action:null}):'Review saved reports.',provider:'fixture',model:'fixture'};}},garage,undefined,undefined,undefined,vin);
    for(const expected of ['available','used','uncertain']){
      if(expected!=='available')await pg.query("INSERT INTO vin_check_access(owner_id,state) VALUES($1,$2) ON CONFLICT(owner_id) DO UPDATE SET state=excluded.state",[OWNER,expected]);
      if(expected==='used'){
        const storage=new VinDbService(db);
        await storage.saveStandalone(OWNER,VIN,{provider:'fixture',make:'Receipt fixture',rawPayload:{secretRaw:'RAW-MUST-NOT-ENTER-PROMPT'}});
        await storage.saveStandalone(OTHER,VIN,{provider:'fixture',make:'FOREIGN-RECEIPT'});
      }
      const input={ownerId:OWNER,language:'en',message:'Explain the context you received.',history:[{role:'assistant',content:'Unlimited free VIN checks are available.'}]};
      await assistant.chat(input);await assistant.planTurn(input);
      for(const request of requests.filter(row=>row.systemPrompt.startsWith('You are CARA')).slice(-2)){
        assert.equal(JSON.parse(request.userPrompt).vinAccess.state,expected);
        assert.equal(JSON.parse(request.userPrompt).standaloneVinChecks.length,expected==='available'?0:1);
        assert.doesNotMatch(request.userPrompt,/FOREIGN-RECEIPT|RAW-MUST-NOT-ENTER-PROMPT/);
        assert.match(request.systemPrompt,/Payments are not enabled/);assert.match(request.systemPrompt,/AI questions do not consume/);
      }
    }
    assert.equal(calls,0);
  });
  test('old cached Vincario results are normalized and billing is removed from vehicle and standalone read endpoints without new lookups',async()=>{
    const data={provider:'vincario',rawPayload:{balance:'PRIVATE-BALANCE',price:'PRIVATE-PRICE',decode:[{label:'Fuel Type - Primary',value:'Gasoline'},{label:'Body',value:'Wagon'},{label:'Engine Power (kW)',value:55}]}};
    const storage=new VinDbService(db);await storage.saveDecodeResult({vehicleId:CAR,vin:VIN,result:data});await storage.saveStandalone(OWNER,VIN,data);
    const latest=await vin.getLatestDecode(OWNER,CAR);assert.equal(latest.fuelType,'petrol');assert.equal(latest.bodyType,'wagon');assert.equal(latest.powerKw,55);
    for(const value of [latest,await vin.getDecodeHistory(OWNER,CAR),await vin.getStandaloneChecks(OWNER)])assert.doesNotMatch(JSON.stringify(value),/PRIVATE-/);
    assert.equal((await access.status(OWNER)).freeRemaining,1);assert.equal(calls,0);
  });
});
