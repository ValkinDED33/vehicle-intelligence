const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,dependencies={},globals={}){
  const exports={};
  const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(source,{exports,require:name=>dependencies[name],...globals},{filename:file});return exports;
}

test('local frontend forwards VIN eligibility and saved checks to the backend instead of serving SPA HTML',()=>{
  const target='http://127.0.0.1:12345';
  const config=load('frontend/vite.config.ts',{vite:{defineConfig:value=>value}},{process:{env:{VITE_PROXY_TARGET:target}}}).default;
  assert.equal(config.server.proxy['/vin-access'].target,target);assert.equal(config.server.proxy['/vin'].target,target);
  const {VEHICLE_ARTWORK}=artworkModule(),rewrites=JSON.parse(fs.readFileSync('vercel.json','utf8')).rewrites;
  for(const {src} of VEHICLE_ARTWORK){
    assert.ok(!Object.keys(config.server.proxy).some(prefix=>src.startsWith(prefix)),`Artwork must not hit the API proxy: ${src}`);
    assert.ok(!rewrites.some(rule=>new RegExp('^'+rule.source+'$').test(src)),`Artwork must not become SPA HTML: ${src}`);
  }
});

function artworkModule(){
  return load('frontend/src/utils/transformerAppearance.ts',{'./profileDisplayFacts':load('frontend/src/utils/profileDisplayFacts.ts')});
}

test('all avatars share one artwork request and reuse it without a new generation on remount',async()=>{
  const {createArtworkStore}=load('frontend/src/utils/vehicleArtworkStore.ts',{'../api':{}},{setTimeout,clearTimeout});
  let reads=0,writes=0,resolveRead,resolveWrite;
  const read=new Promise(r=>resolveRead=r),write=new Promise(r=>resolveWrite=r);
  const get=createArtworkStore({current:()=>{reads++;return read;},ensure:()=>{writes++;return write;}},()=> 'owner');
  const a=get('owner:car:v1','owner','car'),b=get('owner:car:v1','owner','car');assert.equal(a,b);
  const off=a.activate(()=>{}),off2=b.activate(()=>{});assert.equal(reads,1);
  resolveRead({vehicleId:'car',state:'available',fingerprint:'f',missing:[]});await new Promise(setImmediate);assert.equal(writes,1);assert.equal(a.data.state,'generating');
  resolveWrite({vehicleId:'car',state:'ready',fingerprint:'f',missing:[],imageDataUrl:'fixture'});await new Promise(setImmediate);assert.equal(b.data.state,'ready');off();off2();
  const off3=a.activate(()=>{});assert.equal(reads,1);assert.equal(writes,1);off3();
});

test('a delayed artwork reply cannot cross accounts or substitute another car',async()=>{
  const {createArtworkStore}=load('frontend/src/utils/vehicleArtworkStore.ts',{'../api':{}},{setTimeout,clearTimeout});
  let owner='first',resolveRead,writes=0;
  const get=createArtworkStore({current:()=>new Promise(r=>resolveRead=r),ensure:()=>{writes++;}},()=>owner);
  const first=get('first:car','first','car'),off=first.activate(()=>{});owner='second';resolveRead({vehicleId:'car',state:'available',fingerprint:'f',missing:[]});await new Promise(setImmediate);
  assert.equal(first.data,null);assert.equal(writes,0);off();
  const second=get('second:car','second','car'),off2=second.activate(()=>{});resolveRead({vehicleId:'foreign',state:'ready',fingerprint:'f',missing:[],imageDataUrl:'foreign'});await new Promise(setImmediate);
  assert.equal(second.data,null);assert.equal(writes,0);off2();
});

test('model artwork is specific to the make, model and generation, never a random body or color',()=>{
  const {transformerAppearance,VEHICLE_ARTWORK}=artworkModule();
  const golf={id:'golf',vin:'WVWZZZ1KZ7B071116',make:'Volkswagen',model:'Golf',modelYear:'2007'};
  const a=transformerAppearance(golf);
  assert.equal(a.artwork.id,'volkswagen-golf-5');assert.equal(a.exteriorColor,null);
  assert.deepEqual(a,transformerAppearance({...golf}));
  assert.equal(transformerAppearance({...golf,id:'other-account-car'}).artwork.src,a.artwork.src);
  assert.notEqual(transformerAppearance({...golf,id:'other-account-car'}).key,a.key);
  assert.equal(transformerAppearance({...golf,make:'vw'}).artwork.id,a.artwork.id);
  assert.equal(transformerAppearance({...golf,modelYear:'2022'}).artwork,null);
  assert.equal(transformerAppearance({...golf,modelYear:null}).artwork,null);
  assert.equal(transformerAppearance({...golf,make:'Toyota'}).artwork,null);
  assert.equal(transformerAppearance({...golf,model:'Golf Plus'}).artwork,null);
  assert.equal(transformerAppearance({...golf,make:'SKODA SITIGO',model:'Citigo',modelYear:'2016'}).label,'Škoda Citigo');
  assert.equal(transformerAppearance({...golf,make:'Skoda',model:'Citigo',modelYear:'2016'}).artwork.id,'skoda-citigo-2012');
  assert.equal(transformerAppearance({...golf,make:'Nissan',model:'Qashqai',modelYear:'2017'},{bodyType:'wagon'}).artwork.id,'nissan-qashqai-j11');
  assert.equal(transformerAppearance({...golf,make:'Nissan',model:'Qashqai',modelYear:'2016'}).artwork,null);
  const {vehicleTitle}=load('frontend/src/utils/formatters.ts',{'./../i18n':{t:x=>x},'../api':{},'../constants/dashboard':{}});
  assert.equal(vehicleTitle({...golf,make:'SKODA SITIGO',model:'Citigo'}),'Škoda Citigo');
  assert.equal(transformerAppearance(null).artwork,null);
  assert.equal(new Set(VEHICLE_ARTWORK.map(x=>x.src)).size,3);
  for(const item of VEHICLE_ARTWORK){assert.ok(fs.statSync('frontend/public'+item.src).size>100000);assert.equal(item.robotCrop[2],item.robotCrop[3]);assert.equal(item.carCrop[2]/item.carCrop[3],4/3);}
});

test('artwork uses only matching saved VIN and profile facts, and never treats a concept paint as VIN data',()=>{
  const {transformerAppearance}=artworkModule();
  const car={id:'a',vin:'ABC123',make:null,model:null,modelYear:null};
  const decode={vehicleId:'a',vin:'abc123',make:'Volkswagen',model:'Golf',modelYear:2007,exteriorColor:'red'};
  assert.equal(transformerAppearance(car,null,decode).artwork.id,'volkswagen-golf-5');
  assert.equal(transformerAppearance(car,{vehicleId:'a',exteriorColor:'black'},decode).exteriorColor,'black');
  assert.equal(transformerAppearance(car,{vehicleId:'b',exteriorColor:'black'},decode).exteriorColor,'red');
  assert.equal(transformerAppearance(car,null,{...decode,vin:'OTHER'}).artwork,null);
  assert.equal(transformerAppearance(car,null,{...decode,vehicleId:'b'}).artwork,null);
  assert.equal(transformerAppearance(car,null,{...decode,exteriorColor:undefined}).exteriorColor,null);
});
test('unknown maintenance baselines cannot produce a reassuring score and currencies are not ranked by nominal amount',()=>{
  const {computeHealthScore,pickMainCurrency}=load('frontend/src/utils/calculations.ts',{'../api':{},'../constants/dashboard':{},'../i18n':{},'./formatters':{urgencyScore:value=>value==='normal'?100:50}});
  const status={rule:{intervalKm:10000},urgency:'normal',kmRemaining:null,daysRemaining:null,engineHoursRemaining:null};
  assert.equal(computeHealthScore([status]),null);
  assert.equal(computeHealthScore([{...status,kmRemaining:5000}]),100);
  assert.equal(computeHealthScore([{...status,kmRemaining:5000,rule:{intervalKm:10000,intervalMonths:12}}]),null);
  assert.equal(pickMainCurrency({currencies:[{currency:'UAH',totalCost:99999},{currency:'PLN',totalCost:10}]}).currency,'PLN');
});

test('saved VIN facts fill missing display fields without overriding a profile or crossing VINs',()=>{
  const {profileDisplayFacts}=load('frontend/src/utils/profileDisplayFacts.ts');
  const vehicle={vin:'WBA12345678901234'},decode={vin:'wba12345678901234',fuelType:'petrol',bodyType:'wagon',exteriorColor:'silver'};
  const facts=profileDisplayFacts(vehicle,{fuelType:null,bodyType:null},decode);
  assert.equal(facts.fuelType,'petrol');assert.equal(facts.bodyType,'wagon');assert.equal(facts.exteriorColor,'silver');
  const confirmed=profileDisplayFacts(vehicle,{fuelType:'lpg',bodyType:'hatchback',exteriorColor:'red'},decode);
  assert.equal(confirmed.fuelType,'lpg');assert.equal(confirmed.bodyType,'hatchback');assert.equal(confirmed.exteriorColor,'red');
  assert.equal(profileDisplayFacts({vin:'JTD12345678901234'},null,decode).fuelType,null);
  assert.equal(profileDisplayFacts(null,null,decode).bodyType,null);
  assert.equal(profileDisplayFacts(vehicle,null,null).exteriorColor,null);
});

test('all persisted reminder delivery states have translated labels, including claimed jobs',()=>{
  const {reminderDeliveryStatus}=load('frontend/src/utils/reminders.ts',{'../api':{},'../i18n':{t:value=>'translated:'+value}});
  for(const status of ['pending','claimed','sent','failed','uncertain','skipped','expired','cancelled'])assert.match(reminderDeliveryStatus(status),/^translated:/);
  assert.equal(reminderDeliveryStatus('claimed'),reminderDeliveryStatus('sending'));
  assert.equal(reminderDeliveryStatus('claimed'),'translated:Надсилання');
});
