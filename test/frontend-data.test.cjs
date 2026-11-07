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
});

test('each car has a stable independent transformer and confirmed body and paint affect its appearance',()=>{
  const {transformerAppearance}=load('frontend/src/utils/transformerAppearance.ts');
  const a={id:'11111111-1111-4111-8111-111111111111',make:'Nissan',model:'Qashqai'};
  const b={...a,id:'22222222-2222-4222-8222-222222222222'};
  const first=transformerAppearance(a,{bodyType:'suv',exteriorColor:'white'});
  assert.deepEqual(transformerAppearance({...a},{bodyType:'suv',exteriorColor:'white'}),first);
  assert.equal(first.paint,'#e3e9ed');assert.equal(first.frame,'utility');
  assert.notEqual(transformerAppearance(b,{bodyType:'suv',exteriorColor:'white'}).key,first.key);
  const updated=transformerAppearance(a,{bodyType:'coupe',exteriorColor:'czerwony'});
  assert.equal(updated.frame,'sport');assert.equal(updated.paint,'#b62c39');assert.notEqual(updated.key,first.key);assert.equal(updated.code,first.code);
  for(const color of ['сріблястий','srebrny','silver'])assert.equal(transformerAppearance(a,{exteriorColor:color}).paint,'#a7b8c1');
  assert.equal(transformerAppearance(a,{bodyType:'mpv',exteriorColor:'#123456'}).frame,'van');
  assert.equal(transformerAppearance(a,{exteriorColor:'#123456'}).paint,'#123456');
  assert.ok(transformerAppearance(null).key);
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
