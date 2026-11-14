require('reflect-metadata');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {AssistantService}=require('../dist/modules/assistant/assistant.service');
const {answerSavedVinQuestion}=require('../dist/modules/assistant/assistant-vin-answer');
const VIN='VF112345678901234';

function assistantFixture(profile,decode,reports=[]){
  const requests=[];
  const assistant=new AssistantService({complete:async input=>{
    requests.push(input);
    return {provider:'fixture',model:'offline',text:input.responseFormat==='json'?JSON.stringify({answer:'Review the fuel sources.',action:null}):'Review the fuel sources.'};
  }},{getVehicle:async()=>({id:'car',vin:VIN,make:'Renault',model:'Kadjar'}),getVehicles:async()=>[{id:'car'}]},
  {getCurrentProfile:async()=>profile},{getLatestReading:async()=>null},{getStatus:async()=>[]},
  {getLatestDecode:async()=>decode,getAccessStatus:async()=>({state:'used'}),getStandaloneChecks:async()=>[]},
  {getHistory:async()=>[]},{getHistory:async()=>[],calculateLatestFullToFullConsumption:async()=>null},
  {getMonthlyCostOfOwnership:async()=>null,getHistory:async()=>[]},{getHistory:async()=>[]},
  {getReports:async()=>reports},{getHistory:async()=>[]},{list:async()=>({reminders:[]})});
  return {assistant,requests};
}

test('both assistant channels receive owner fuel provenance, report conflicts and unmodified VIN facts',async()=>{
  const provenance={source:'manual-confirmed',ownerConfirmed:true,confirmedAt:'2026-11-14T09:00:00Z',conflicts:[{value:'petrol',source:'vdb:basic-vin-decode'}]};
  const {assistant,requests}=assistantFixture({fuelType:'diesel',source:'vin:fixture',fuelTypeProvenance:provenance},{vin:VIN,status:'success',provider:'fixture',fuelType:'petrol'});
  const input={ownerId:'owner',vehicleId:'car',message:'Which fuel does my Kadjar use?',language:'en',history:[{role:'assistant',content:'Your Kadjar is petrol.'}]};
  await assistant.chat(input);await assistant.planTurn(input);
  const channels=requests.filter(request=>request.userPrompt.includes('"context"'));
  assert.equal(channels.length,2);
  for(const request of channels){
    const {context}=JSON.parse(request.userPrompt);
    assert.match(context,/fuel=diesel/);assert.match(context,/"fuelType":"petrol"/);
    assert.match(context,/vdb:basic-vin-decode/);assert.match(context,/"ownerConfirmed":true/);
    assert.match(context,/Current profile \(mixed sources/);assert.doesNotMatch(context,/Confirmed profile:/);
    assert.deepEqual(JSON.parse(context.split('\n').find(line=>line.startsWith('Fuel provenance')).split(': ').slice(1).join(': ')),provenance);
    assert.match(request.systemPrompt,/latest explicit owner-confirmed correction takes priority/);
    assert.match(request.systemPrompt,/never conceal the conflict/);
    assert.match(request.systemPrompt,/current message supersedes older context/);
    assert.match(request.systemPrompt,/When generating a vehicle or report summary, explicitly flag an unresolved fuel discrepancy/);
  }
  for(const request of requests.filter(request=>!channels.includes(request)))assert.match(request.systemPrompt,/Preserve fuel values, owner-confirmed priority and conflicting source attributions/);
});

test('assistant report summaries carry saved conflicting fuel evidence only for the exact car and VIN',async()=>{
  const profile={fuelType:'diesel',source:'manual-confirmed',confirmedAt:new Date(),fuelTypeProvenance:{source:'manual-confirmed',ownerConfirmed:true,confirmedAt:'2026-11-14',observations:[{value:'petrol',source:'vdb:basic-vin-decode'}],conflicts:[{value:'petrol',source:'vdb:basic-vin-decode'}]}};
  const report={id:'report',vehicleId:'car',vin:VIN,provider:'vehicle-databases',reportType:'basic-vin-decode',status:'success',rawPayload:{fuel:{fuel_type:'Gasoline'}}};
  const {assistant,requests}=assistantFixture(profile,null,[report,{...report,id:'foreign',vin:'OTHER'},{...report,id:'other-car',vehicleId:'other'}]);
  await assistant.chat({ownerId:'owner',vehicleId:'car',message:'Generate a summary of my saved vehicle reports.',language:'en'});
  const context=JSON.parse(requests[0].userPrompt).context;
  const additional=JSON.parse(context.split('\n').find(line=>line.startsWith('Additional facts')).split(': ').slice(1).join(': '));
  assert.deepEqual(additional.externalReports[0].latestFuelObservationsForSource,[{value:'petrol',source:'vdb:basic-vin-decode'}]);
  assert.deepEqual(additional.externalReports[1].latestFuelObservationsForSource,[]);assert.deepEqual(additional.externalReports[2].latestFuelObservationsForSource,[]);
  assert.equal(Object.hasOwn(additional.externalReports[0],'rawPayload'),false);
  assert.deepEqual(report.rawPayload,{fuel:{fuel_type:'Gasoline'}});
  assert.match(context,/fuel=diesel/);assert.match(context,/"ownerConfirmed":true/);
});

test('assistant never labels inherited provider fuel owner-confirmed or substitutes another VIN',async()=>{
  const {assistant,requests}=assistantFixture({fuelType:'petrol',source:'manual-confirmed',confirmedAt:new Date(),fuelTypeProvenance:{source:'vin:fixture',ownerConfirmed:false,confirmedAt:null,conflicts:[]}},
    {vin:'OTHER',provider:'foreign',fuelType:'diesel'});
  await assistant.chat({ownerId:'owner',vehicleId:'car',message:'Explain my fuel sources.',language:'en'});
  const {context}=JSON.parse(requests[0].userPrompt);
  assert.match(context,/"ownerConfirmed":false/);assert.match(context,/Saved VIN facts .*: null/);
  assert.doesNotMatch(context,/foreign/);
});

test('saved VIN identity shortcuts cannot swallow a current fuel correction or source conflict',async()=>{
  const profile={fuelType:'diesel',source:'manual-confirmed',confirmedAt:new Date()};
  const decode={vin:VIN,status:'success',provider:'fixture',fuelType:'petrol'};
  for(const [language,message] of [
    ['en','Which fuel is saved from VIN? My Kadjar is diesel, not petrol.'],
    ['uk','\u042f\u043a\u0456 \u0434\u0430\u043d\u0456 \u043f\u0430\u043b\u044c\u043d\u043e\u0433\u043e \u0437\u0431\u0435\u0440\u0435\u0436\u0435\u043d\u043e \u0437\u0430 VIN? Kadjar diesel.'],
    ['pl','Jakie dane paliwa zapisano z VIN? Kadjar diesel.'],
  ]){
    assert.equal(answerSavedVinQuestion(message,language,{state:'used'},decode),null);
    const {assistant,requests}=assistantFixture(profile,decode);
    const input={ownerId:'owner',vehicleId:'car',message,language};
    await assistant.chat(input);await assistant.planTurn(input);
    assert.equal(requests.filter(request=>request.userPrompt.includes('"context"')).length,2);
    assert.match(JSON.parse(requests[0].userPrompt).context,/fuel=diesel/);
    assert.equal(JSON.parse(requests[0].userPrompt).message,message);
  }
});
