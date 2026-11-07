require('reflect-metadata');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {answerSavedVinQuestion}=require('../dist/modules/assistant/assistant-vin-answer');
const {AssistantService}=require('../dist/modules/assistant/assistant.service');
const facts={vin:'WBA12345678901234',provider:'vincario',status:'success',make:'Skoda',model:'Fabia',modelYear:2006,engineCode:'BKY',displacementCc:1390,transmissionType:'manual'};
const used={state:'used',freeRemaining:0,paidEnabled:false};

test('saved vehicle VIN facts are not confused with an empty standalone list in any supported language',()=>{
  for(const [language,message] of [['uk','Які дані вже збережені за VIN?'],['pl','Jakie dane mojego auta sa zapisane z VIN?'],['en','List the saved make and model from VIN.']]){
    const answer=answerSavedVinQuestion(message,language,used,facts);
    for(const value of ['Skoda','Fabia','BKY','1390','2006'])assert.ok(answer.includes(value));
    assert.doesNotMatch(answer,/no saved|немає збережених|nie ma zapisanych/);
  }
});

test('VIN access replies cannot invent purchase links or a renewing free allowance',()=>{
  for(const [language,message] of [['uk','Можна ще раз безкоштовно перевірити VIN?'],['pl','Czy moge ponownie sprawdzic VIN za darmo?'],['en','Can I run another free VIN check?']]){
    const answer=answerSavedVinQuestion(message,language,used,facts);assert.ok(answer);
    assert.doesNotMatch(answer,/purchase additional|wait for a new|купіть|купити доступ|kup dostęp|https?:/i);
  }
  const answer=answerSavedVinQuestion('Which make, model and engine code are saved from VIN? Can I run another free VIN check?','en',used,facts);
  assert.match(answer,/BKY/);assert.match(answer,/payments are not enabled/i);assert.match(answer,/does not renew/);
  assert.match(answerSavedVinQuestion('Can I run a free VIN check?','en',{state:'available',freeRemaining:1,paidEnabled:false},null),/separate confirmation/);
  assert.equal(answerSavedVinQuestion('Why does the engine hesitate under load?','en',used,facts),null);
});

test('both assistant channels enforce VIN policy before any model call even with misleading old history',async()=>{
  let calls=0;
  const assistant=new AssistantService({complete:async()=>{calls++;throw Error('Must not generate a payment policy');}},{getVehicles:async()=>[]},undefined,undefined,undefined,{getAccessStatus:async()=>used,getStandaloneChecks:async()=>[]});
  const input={ownerId:'owner',message:'Can I run another free VIN check?',language:'en',history:[{role:'assistant',content:'Buy access or wait for a new free allowance.'}]};
  const web=await assistant.chat(input),telegram=await assistant.planTurn(input);
  assert.equal(web.provider,'cara');assert.equal(telegram.action,null);assert.match(web.answer,/payments are not enabled/);assert.equal(web.answer,telegram.answer);assert.equal(calls,0);
});

test('eligible lookup commands reach Telegram planning instead of being swallowed by the access answer',async()=>{
  const available={state:'available',freeRemaining:1,paidEnabled:false};
  for(const message of ['Check VIN for free','Перевір VIN','Proszę sprawdź VIN'])assert.equal(answerSavedVinQuestion(message,'en',available,facts),null);
  const proposal={operation:'request_report',vehicleId:'car',input:{source:'basic-vin-decode'}};
  const assistant=new AssistantService({complete:async()=>({text:JSON.stringify({answer:'Review the check.',action:proposal})})},{getVehicles:async()=>[{id:'car'}]},undefined,undefined,undefined,{getAccessStatus:async()=>available,getStandaloneChecks:async()=>[]});
  const turn=await assistant.planTurn({ownerId:'owner',message:'Check VIN for free',language:'en'});
  assert.deepEqual(turn.action,proposal);
});

test('a question about a different VIN never receives the selected car identity as its facts',()=>{
  assert.equal(answerSavedVinQuestion('Which saved make and model belong to VIN JTD12345678901234?','en',used,facts),null);
  const answer=answerSavedVinQuestion('What saved data exist for VIN JTD12345678901234? Can I run another free VIN check?','en',used,facts);
  assert.doesNotMatch(answer,/Fabia|BKY|1390/);assert.match(answer,/payments are not enabled/);
});

test('the saved standalone Telegram result remains usable by both assistant channels without a garage',async()=>{
  const assistant=new AssistantService({complete:async()=>{throw Error('Saved facts need no model');}},{getVehicles:async()=>[]},undefined,undefined,undefined,{getAccessStatus:async()=>used,getStandaloneChecks:async()=>[{id:'check',vin:facts.vin,status:'success',result:facts}]});
  const input={ownerId:'owner',message:'List saved make, model, engine and displacement from VIN.',language:'en'};
  const web=await assistant.chat(input),telegram=await assistant.planTurn(input);
  for(const value of ['Fabia','BKY','1390','manual'])assert.ok(web.answer.includes(value));
  assert.equal(telegram.answer,web.answer);assert.equal(telegram.action,null);
});
