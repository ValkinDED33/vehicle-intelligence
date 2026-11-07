require('reflect-metadata');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {of,throwError}=require('rxjs');
const {mapVincarioResponse}=require('../dist/modules/vin/providers/vincario/vincario.mapper');
const {VincarioVinProvider}=require('../dist/modules/vin/providers/vincario-vin.provider');
const {VinService}=require('../dist/modules/vin/services/vin.service');
const payload={price:'PRIVATE-PRICE',balance:'PRIVATE-BALANCE',price_currency:'PRIVATE-CURRENCY',decode:[
  {label:'Make',value:'Skoda'},{label:'Model',value:'Fabia'},{label:'Model Year',value:2006},
  {label:'Engine Code',value:'BKY'},{label:'Engine Displacement (ccm)',value:1390},
  {label:'Engine Power (kW)',value:55},{label:'Engine Power (HP)',value:74},
  {label:'Fuel Type - Primary',value:'Gasoline'},{label:'Body',value:'Wagon'},
  {label:'Transmission',value:'Manual/Standard'},
]};
const config={get:key=>key==='VINCARIO_API_KEY'?'fixture-key':key==='VINCARIO_SECRET_KEY'?'fixture-secret':undefined};

test('Vincario primary fuel and body labels feed canonical facts without exposing provider billing',()=>{
  const result=mapVincarioResponse(payload);
  assert.equal(result.fuelType,'petrol');assert.equal(result.bodyType,'wagon');assert.equal(result.powerKw,55);assert.equal(result.engineCode,'BKY');
  assert.equal(result.rawPayload.decode.length,payload.decode.length);assert.doesNotMatch(JSON.stringify(result),/PRIVATE-/);
  assert.equal(payload.balance,'PRIVATE-BALANCE');
  assert.equal(mapVincarioResponse({decode:[{label:'Body',value:'Unknown'}]}).bodyType,undefined);
});

test('normalized Vincario fields are saved into the technical profile, not only left in raw JSON',async()=>{
  let saved;
  const vehicle={vin:'WBA12345678901234',make:'Skoda',model:'Fabia',modelYear:'2006'};
  const service=new VinService({getVehicle:async()=>vehicle},{createProfileVersion:async(owner,id,data)=>{saved=data;}},{saveDecodeResult:async value=>value},{decode:async()=>mapVincarioResponse(payload)},{run:async(owner,source,vin,operation)=>operation()});
  await service.decodeVehicleVin('owner','car');
  assert.equal(saved.fuelType,'petrol');assert.equal(saved.bodyType,'wagon');assert.equal(saved.powerKw,55);assert.equal(saved.source,'vin:vincario');
});

test('billing-only and error envelopes cannot masquerade as a successful VIN decode',async()=>{
  for(const data of [{price:1,balance:10},{error:{message:'provider failure'},decode:payload.decode},{decode:[]}]){
    const provider=new VincarioVinProvider({get:()=>of({data})},config);
    await assert.rejects(()=>provider.decode('WBA12345678901234'),error=>error.getStatus()===502&&error.getResponse().code==='VINCARIO_INVALID_RESPONSE');
  }
});

test('Vincario rejects auth and rate limits explicitly and never echoes a credential-bearing request URL',async()=>{
  for(const status of [401,403,429]){
    const provider=new VincarioVinProvider({get:()=>throwError(()=>({isAxiosError:true,response:{status},message:'fixture-key/fixture-secret'}))},config);
    await assert.rejects(()=>provider.decode('WBA12345678901234'),error=>error.getStatus()===503&&error.getResponse().code===(status===429?'VIN_PROVIDER_RATE_LIMITED':'VIN_PROVIDER_AUTH_FAILED'));
  }
  const provider=new VincarioVinProvider({get:()=>throwError(()=>Error('https://provider/fixture-key/fixture-secret'))},config);
  await assert.rejects(()=>provider.decode('WBA12345678901234'),error=>error.getStatus()===502&&!JSON.stringify(error.getResponse()).includes('fixture-key'));
});
