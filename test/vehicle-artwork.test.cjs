require('reflect-metadata');
const {describe,test,before,beforeEach,after}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite'),{drizzle}=require('drizzle-orm/pglite');
const {Module,ValidationPipe}=require('@nestjs/common'),{NestFactory}=require('@nestjs/core'),{JwtService}=require('@nestjs/jwt');
const {VehicleArtworkService}=require('../dist/modules/vehicle-artwork/vehicle-artwork.service');
const {VehicleArtworkController}=require('../dist/modules/vehicle-artwork/vehicle-artwork.controller');
const {ArtworkProviderError}=require('../dist/modules/vehicle-artwork/openai-artwork.provider');
const {artworkFacts,artworkDirection,artworkPrompt}=require('../dist/modules/vehicle-artwork/artwork-facts');
const {GarageService}=require('../dist/modules/garage/services/garage.service'),{GarageDbService}=require('../dist/modules/garage/garage.db.service');
const {VehicleProfileService}=require('../dist/modules/vehicle-profile/services/vehicle-profile.service'),{VehicleProfileDbService}=require('../dist/modules/vehicle-profile/vehicle-profile.db.service');
const {VinService}=require('../dist/modules/vin/services/vin.service'),{VinDbService}=require('../dist/modules/vin/vin.db.service');
const {CreateVehicleDto}=require('../dist/modules/garage/dto/create-vehicle.dto'),{UpdateVehicleDto}=require('../dist/modules/garage/dto/update-vehicle.dto'),{validateSync}=require('class-validator');
const OWNER='33333333-3333-4333-8333-333333333333',OTHER='44444444-4444-4444-8444-444444444444';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const image=fs.readFileSync('frontend/public/vehicle-artwork/volkswagen-golf-5-v2.webp').toString('base64');
const status=expected=>e=>e.getStatus()===expected;
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {resolve,promise};};

test('real OpenAI SDK sends one bounded image edit without private car identifiers or automatic retries',async()=>{
  const {OpenAiArtworkProvider}=require('../dist/modules/vehicle-artwork/openai-artwork.provider');
  const original=global.fetch;let requests=0;
  const facts={make:'Volkswagen',model:'Golf',year:2007,color:'blue',body:'hatchback',doors:5};
  const provider=new OpenAiArtworkProvider({get:()=> 'fixture-not-a-real-api-key'});
  const mockFetch=handler=>async(input,init)=>{const req=new Request(input,init);if(req.url.startsWith('data:'))return new Response('');requests++;return handler(req);};
  try{
    global.fetch=mockFetch(async req=>{
      assert.equal(req.url,'https://api.openai.com/v1/images/edits');
      const form=await req.formData();assert.equal(form.get('model'),'gpt-image-2');assert.equal(form.get('n'),'1');assert.equal(form.get('size'),'1536x1024');assert.equal(form.get('quality'),'high');assert.equal(form.get('output_format'),'webp');
      assert.equal(String(form.get('safety_identifier')).length,64);assert.ok(!form.get('prompt').includes(OWNER));assert.ok(!form.get('prompt').includes('WVWZZZ1KZ7B071116'));
      assert.ok([...form.values()].some(value=>typeof value==='object'&&value.type==='image/webp'));
      return new Response(JSON.stringify({data:[{b64_json:image}]}),{status:200,headers:{'Content-Type':'application/json'}});
    });
    assert.equal(await provider.generate(facts,OWNER,await provider.reference(facts)),image);assert.equal(requests,1);
    requests=0;global.fetch=mockFetch(async()=>new Response(JSON.stringify({error:{message:'SECRET upstream content'}}),{status:401,headers:{'Content-Type':'application/json'}}));
    await assert.rejects(()=>provider.generate(facts,OWNER,Buffer.from('fixture')),e=>e.code==='provider_access'&&!e.uncertain&&!e.message.includes('SECRET'));assert.equal(requests,1);
    requests=0;global.fetch=mockFetch(async()=>{throw new Error('SECRET transport');});
    await assert.rejects(()=>provider.generate(facts,OWNER,Buffer.from('fixture')),e=>e.code==='generation_uncertain'&&e.uncertain&&!e.message.includes('SECRET'));assert.equal(requests,1);
  }finally{global.fetch=original;}
});

test('artwork facts are private, exact to saved identity, year and paint, not random or stale VIN data',()=>{
  const car={id:A,make:'Volkswagen',model:'Golf',modelYear:'2007',vin:'WVWZZZ1KZ7B071116',licensePlate:'PRIVATE',ownerId:OWNER};
  const profile={vehicleId:A,exteriorColor:'cobalt blue',bodyType:'hatchback',doorCount:5};
  const result=artworkFacts(car,profile,{vin:'OTHER',make:'Toyota',model:'Corolla',exteriorColor:'red'});
  assert.equal(result.facts.model,'Golf');assert.equal(result.facts.color,'cobalt blue');assert.equal(result.missing.length,0);
  assert.equal(result.fingerprint,artworkFacts({...car,id:B,vin:'OTHER',ownerId:OTHER}, {...profile,vehicleId:B},null).fingerprint);
  assert.notEqual(result.fingerprint,artworkFacts(car,{...profile,exteriorColor:'red'},null).fingerprint);
  assert.equal(artworkFacts(car,{...profile,vehicleId:B},null).fingerprint,null);
  assert.equal(artworkFacts({...car,modelYear:'0'},profile,null).fingerprint,null);
  assert.equal(artworkFacts({...car,vin:null,make:null,model:null},null,{make:'Wrong',model:'Wrong',exteriorColor:'red'}).fingerprint,null);
  const prompt=artworkPrompt(result.facts);for(const value of [car.vin,car.licensePlate,OWNER])assert.ok(!prompt.includes(value));
  assert.match(prompt,/2007/);assert.match(prompt,/cobalt blue/);
  const small=artworkDirection({...result.facts,make:'Skoda',model:'Citigo'}),large=artworkDirection({...result.facts,make:'Nissan',model:'Qashqai',body:'wagon'});
  assert.ok(small.top>large.top);assert.ok(small.shoulders<large.shoulders);
});

test('manual vehicle model is accepted and bounded by both garage DTOs',()=>{
  for(const Dto of [CreateVehicleDto,UpdateVehicleDto]){
    assert.equal(validateSync(Object.assign(new Dto(),{model:'Citigo'}),{whitelist:true,forbidNonWhitelisted:true}).length,0);
    assert.ok(validateSync(Object.assign(new Dto(),{model:'x'.repeat(121)})).length);
  }
});

describe('persistent vehicle artwork using isolated PostgreSQL and a fake image provider',()=>{
  let pg,db,config,values,calls,provider,garage,profiles,vin,service,behavior;
  const instance=()=>new VehicleArtworkService(db,garage,profiles,vin,provider,config);
  before(async()=>{
    pg=new PGlite();for(const entry of JSON.parse(fs.readFileSync('drizzle/meta/_journal.json')).entries)await pg.exec(fs.readFileSync(`drizzle/${entry.tag}.sql`,'utf8'));
    await pg.query('INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3),($4,$5,$3)',[OWNER,'owner@fixture.test','fixture',OTHER,'other@fixture.test']);
    await pg.query('INSERT INTO vehicles(id,owner_id,make,model,model_year,vin) VALUES($1,$2,$3,$4,$5,$6),($7,$2,$3,$4,$5,$6)',[A,OWNER,'Volkswagen','Golf','2007','WVWZZZ1KZ7B071116',B]);
    db={connection:drizzle(pg)};garage=new GarageService(new GarageDbService(db));profiles=new VehicleProfileService(garage,new VehicleProfileDbService(db));
    vin=new VinService(garage,profiles,new VinDbService(db),{decode:()=>{throw new Error('VIN provider must never be called');}},{});
    config={get:key=>values[key]};
    provider={configured:true,reference:async()=>Buffer.from('bundled fixture reference'),generate:async(...args)=>{calls++;return behavior(...args);}};
    service=instance();
  });
  beforeEach(async()=>{
    await pg.exec('TRUNCATE vehicle_artworks,vehicle_artwork_budgets,vehicle_profiles,vin_decodes');
    await pg.query('UPDATE vehicles SET is_archived=false');
    for(const id of [A,B])await profiles.createProfileVersion(OWNER,id,{source:'manual-confirmed',exteriorColor:'blue',bodyType:'hatchback',doorCount:5});
    values={VEHICLE_ARTWORK_ENABLED:'true',VEHICLE_ARTWORK_DAILY_LIMIT:'10',VEHICLE_ARTWORK_OWNER_DAILY_LIMIT:'5'};calls=0;behavior=async()=>image;
  });
  after(async()=>{await pg?.close();});
  test('GET is read-only; generate once, persist after recreation and reuse on refresh',async()=>{
    const before=await service.current(OWNER,A);assert.equal(before.state,'available');assert.equal(calls,0);
    const ready=await service.ensure(OWNER,A,before.fingerprint);assert.equal(ready.state,'ready');assert.equal(calls,1);assert.equal(ready.facts.color,'blue');
    assert.equal((await instance().current(OWNER,A)).imageDataUrl,ready.imageDataUrl);
    assert.equal((await instance().ensure(OWNER,A,before.fingerprint)).imageDataUrl,ready.imageDataUrl);assert.equal(calls,1);
    assert.equal((await pg.query('SELECT used FROM vehicle_artwork_budgets')).rows[0].used,1);
  });
  test('independent instances cannot duplicate a paid request while one is running',async()=>{
    const entered=deferred(),release=deferred();behavior=async()=>{entered.resolve();await release.promise;return image;};
    const {fingerprint}=await service.current(OWNER,A);const pending=service.ensure(OWNER,A,fingerprint);await entered.promise;
    assert.equal((await instance().ensure(OWNER,A,fingerprint)).state,'generating');assert.equal(calls,1);
    release.resolve();assert.equal((await pending).state,'ready');assert.equal(calls,1);
  });
  test('unknown color, a stale fingerprint, disabled feature, missing quotas and foreign ownership never call a provider',async()=>{
    await pg.query('UPDATE vehicle_profiles SET exterior_color=NULL WHERE vehicle_id=$1',[A]);
    assert.equal((await service.current(OWNER,A)).state,'missing_details');assert.equal((await service.ensure(OWNER,A,'a'.repeat(64))).state,'missing_details');
    const {fingerprint}=await service.current(OWNER,B);await assert.rejects(()=>service.ensure(OWNER,B,'a'.repeat(64)),status(409));
    for(const name of ['VEHICLE_ARTWORK_ENABLED','VEHICLE_ARTWORK_DAILY_LIMIT','VEHICLE_ARTWORK_OWNER_DAILY_LIMIT']){
      const saved=values[name];values[name]='0';assert.equal((await service.ensure(OWNER,B,fingerprint)).state,'disabled');values[name]=saved;
    }
    await assert.rejects(()=>service.current(OTHER,A),status(404));await assert.rejects(()=>service.ensure(OTHER,B,fingerprint),status(404));assert.equal(calls,0);
  });
  test('global and owner daily caps are persistent and reserve before generation',async()=>{
    values.VEHICLE_ARTWORK_DAILY_LIMIT='1';const a=await service.current(OWNER,A),b=await service.current(OWNER,B);
    await service.ensure(OWNER,A,a.fingerprint);assert.equal((await instance().ensure(OWNER,B,b.fingerprint)).state,'limit');assert.equal(calls,1);
    values.VEHICLE_ARTWORK_DAILY_LIMIT='10';values.VEHICLE_ARTWORK_OWNER_DAILY_LIMIT='1';assert.equal((await service.ensure(OWNER,B,b.fingerprint)).state,'limit');assert.equal(calls,1);
  });
  test('changed facts do not show an old in-flight image and an archived car does not generate',async()=>{
    const entered=deferred(),release=deferred();behavior=async()=>{entered.resolve();await release.promise;return image;};
    const a=await service.current(OWNER,A),pending=service.ensure(OWNER,A,a.fingerprint);await entered.promise;
    await pg.query("UPDATE vehicle_profiles SET exterior_color='red' WHERE vehicle_id=$1",[A]);release.resolve();
    const result=await pending;assert.equal(result.state,'available');assert.equal(result.imageDataUrl,undefined);assert.notEqual(result.fingerprint,a.fingerprint);
    await pg.query('UPDATE vehicles SET is_archived=true WHERE id=$1',[A]);assert.equal((await service.ensure(OWNER,A,result.fingerprint)).state,'disabled');assert.equal(calls,1);
  });
  test('transport failure, a crash and expired leases cannot auto-replay a possibly charged generation',async()=>{
    behavior=async()=>{throw new ArtworkProviderError('generation_uncertain',true);};
    const a=await service.current(OWNER,A);assert.equal((await service.ensure(OWNER,A,a.fingerprint)).state,'uncertain');
    assert.equal((await instance().ensure(OWNER,A,a.fingerprint)).state,'uncertain');assert.equal(calls,1);
    await pg.query("UPDATE vehicle_artworks SET state='generating',created_at=now()-interval '6 minutes'");
    assert.equal((await service.current(OWNER,A)).state,'uncertain');assert.equal((await service.ensure(OWNER,A,a.fingerprint)).state,'uncertain');assert.equal(calls,1);
  });
  test('provider failures never leak raw error text, headers, keys or request bodies',async()=>{
    behavior=async()=>{throw new Error('SECRET fixture raw provider request');};
    const a=await service.current(OWNER,A),result=await service.ensure(OWNER,A,a.fingerprint);
    assert.equal(result.state,'uncertain');assert.ok(!JSON.stringify(result).includes('SECRET'));
    const row=(await pg.query('SELECT error_code FROM vehicle_artworks')).rows[0];assert.equal(row.error_code,'generation_uncertain');
  });
  test('real JWT HTTP routes isolate owners, validate the fingerprint and reject injected prompts',async()=>{
    const jwt=new JwtService({secret:'artwork-fixture-only'});class App{};
    Module({controllers:[VehicleArtworkController],providers:[{provide:VehicleArtworkService,useValue:service},{provide:JwtService,useValue:jwt}]})(App);
    const app=await NestFactory.create(App,{logger:false});app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));await app.listen(0,'127.0.0.1');
    try{
      const url=await app.getUrl(),headers={Authorization:`Bearer ${jwt.sign({sub:OWNER})}`,'Content-Type':'application/json'};
      assert.equal((await fetch(`${url}/vehicles/${A}/artwork`)).status,401);
      const get=await fetch(`${url}/vehicles/${A}/artwork`,{headers});assert.equal(get.status,200);assert.match(get.headers.get('cache-control'),/no-store/);
      const {fingerprint}=await get.json();
      for(const body of [{fingerprint:'bad'},{fingerprint,prompt:'injected'},{fingerprint,ownerId:OTHER}])assert.equal((await fetch(`${url}/vehicles/${A}/artwork`,{method:'POST',headers,body:JSON.stringify(body)})).status,400);
      assert.equal((await fetch(`${url}/vehicles/${A}/artwork`,{headers:{Authorization:`Bearer ${jwt.sign({sub:OTHER})}`}})).status,404);
      assert.equal(calls,0);
      const generated=await fetch(`${url}/vehicles/${A}/artwork`,{method:'POST',headers,body:JSON.stringify({fingerprint})});assert.equal(generated.status,201);assert.equal((await generated.json()).state,'ready');assert.equal(calls,1);
    }finally{await app.close();}
  });
});
