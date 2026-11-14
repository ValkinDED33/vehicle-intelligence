const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const exportsObject={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('frontend/src/utils/profileDisplayFacts.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:exportsObject});
const facts=(...args)=>JSON.parse(JSON.stringify(exportsObject.profileDisplayFacts(...args)));
const reportFacts=(...args)=>JSON.parse(JSON.stringify(exportsObject.reportFuelDisplayFacts(...args)));
const vehicle={id:'car',vin:'VF112345678901234'};
const decode={vehicleId:'car',vin:vehicle.vin.toLowerCase(),provider:'fixture',fuelType:'petrol'};

test('fuel display keeps owner diesel, field-level provenance and both report/VIN conflicts visible',()=>{
  const profile={vehicleId:'car',source:'vdb:basic-vin-decode',fuelType:'diesel',fuelTypeProvenance:{source:'manual-confirmed',ownerConfirmed:true,confirmedAt:'2026-11-14',conflicts:[{value:'petrol',source:'vdb:basic-vin-decode'}]}};
  const before=structuredClone(profile);
  const result=facts(vehicle,profile,decode);
  assert.equal(result.fuelType,'diesel');assert.equal(result.fuelTypeProvenance.source,'manual-confirmed');
  assert.equal(result.fuelTypeProvenance.ownerConfirmed,true);
  assert.deepEqual(result.fuelTypeProvenance.conflicts,[{value:'petrol',source:'vdb:basic-vin-decode'},{value:'petrol',source:'vin:fixture'}]);
  assert.deepEqual(profile,before);assert.equal(decode.fuelType,'petrol');
  assert.deepEqual(facts(vehicle,{...profile,fuelTypeProvenance:result.fuelTypeProvenance},decode),result);
});

test('fuel display excludes foreign car/VIN conflicts and keeps VIN fallback explicitly unconfirmed',()=>{
  const profile={vehicleId:'car',source:'manual-confirmed',fuelType:'diesel',confirmedAt:'2026-11-14'};
  for(const foreign of [{...decode,vehicleId:'other'},{...decode,vin:'OTHER'}]){
    const result=facts(vehicle,profile,foreign);assert.equal(result.fuelType,'diesel');assert.deepEqual(result.fuelTypeProvenance.conflicts,[]);
  }
  const fallback=facts(vehicle,{...profile,vehicleId:'other'},decode);
  assert.equal(fallback.fuelType,'petrol');assert.equal(fallback.fuelTypeProvenance.source,'vin:fixture');assert.equal(fallback.fuelTypeProvenance.ownerConfirmed,false);
  assert.equal(facts(vehicle,null,{...decode,vin:'OTHER'}).fuelTypeProvenance,null);
});

test('display does not call inherited fuel owner-confirmed just because a later partial profile is manual',()=>{
  const profile={source:'manual-confirmed',fuelType:'petrol',confirmedAt:'2026-11-14',fuelTypeProvenance:{source:'vin:fixture',ownerConfirmed:false,confirmedAt:null,conflicts:[]}};
  const result=facts(vehicle,profile,decode);
  assert.equal(result.fuelTypeProvenance.ownerConfirmed,false);assert.equal(result.fuelTypeProvenance.confirmedAt,null);
});

test('the selected external report flags petrol versus owner diesel while retaining its original source fields',()=>{
  const profile={vehicleId:'car',source:'manual-confirmed',fuelType:'diesel',confirmedAt:'2026-11-14'};
  for(const rawPayload of [
    {fuel:{fuel_type:'Gasoline'}},
    {'General Information':{'Fuel type':'Petrol'}},
    {decode:[{label:'Fuel Type - Primary',value:'Gasoline'}]},
    {result:{fuelType:'petrol'}},
  ]){
    const report={vehicleId:'car',vin:vehicle.vin,provider:'vehicle-databases',reportType:'basic-vin-decode',status:'success',rawPayload};
    const before=structuredClone(report);
    const result=reportFacts(vehicle,profile,report);
    assert.equal(result.fuelType,'diesel');assert.equal(result.fuelTypeProvenance.ownerConfirmed,true);
    assert.deepEqual(result.fuelTypeProvenance.conflicts,[{value:'petrol',source:'vdb:basic-vin-decode'}]);
    assert.deepEqual(report,before);
    for(const different of [{...report,vehicleId:'other'},{...report,vin:'OTHER'},{...report,status:'failed'},{...report,status:'no-data'}]){
      assert.deepEqual(reportFacts(vehicle,profile,different).fuelTypeProvenance.conflicts,[]);
    }
  }
});

test('report warnings describe that snapshot, not a newer report or fuel guessed from narrative text',()=>{
  const profile={vehicleId:'car',source:'manual-confirmed',fuelType:'diesel',fuelTypeProvenance:{source:'manual-confirmed',ownerConfirmed:true,confirmedAt:'2026-11-14',conflicts:[{value:'petrol',source:'vdb:basic-vin-decode'}]}};
  const report={vehicleId:'car',vin:vehicle.vin,provider:'vehicle-databases',reportType:'basic-vin-decode',status:'success',rawPayload:{fuel:{fuel_type:'Diesel'}}};
  assert.deepEqual(reportFacts(vehicle,profile,report).fuelTypeProvenance.conflicts,[]);
  assert.deepEqual(reportFacts(vehicle,{...profile,fuelTypeProvenance:{...profile.fuelTypeProvenance,conflicts:[]}},{...report,rawPayload:{note:'It might be petrol',engine:'diesel or petrol'}}).fuelTypeProvenance.conflicts,[]);
  assert.deepEqual(reportFacts(vehicle,profile,{...report,reportType:'other',rawPayload:{}}).fuelTypeProvenance.conflicts,[]);
  assert.deepEqual(reportFacts(vehicle,{...profile,fuelType:'hybrid'},{...report,rawPayload:{fuel:{fuel_type:'Gasoline',electrification_level:'HEV'}}}).fuelTypeProvenance.conflicts,[]);
});

test('the shared rendered fuel notice exposes the discrepancy and humanizes provider source prefixes',()=>{
  const frontendRequire=require('node:module').createRequire(require('node:path').resolve('frontend/package.json'));
  const React=frontendRequire('react');
  const {renderToStaticMarkup}=frontendRequire('react-dom/server');
  function load(file,dependencies={}){
    const exports={};
    const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    vm.runInNewContext(source,{exports,require:name=>dependencies[name],localStorage:{getItem:()=> 'en'}},{filename:file});
    return exports;
  }
  const i18n=load('frontend/src/i18n.ts',{'./translations':load('frontend/src/translations.ts'),react:React});
  const {FuelTypeNotice,fuelSourceLabel}=load('frontend/src/components/FuelTypeNotice.tsx',{'../i18n':i18n,'react/jsx-runtime':frontendRequire('react/jsx-runtime'),'lucide-react':frontendRequire('lucide-react')});
  assert.equal(fuelSourceLabel('vin:vincario'),'Vincario VIN');
  assert.equal(fuelSourceLabel('vin:vehicle-databases'),'Vehicle Databases VIN');
  const profile={vehicleId:'car',source:'manual-confirmed',fuelType:'diesel',confirmedAt:'2026-11-14'};
  const report={vehicleId:'car',vin:vehicle.vin,provider:'vehicle-databases',reportType:'basic-vin-decode',status:'success',rawPayload:{fuel:{fuel_type:'Gasoline'}}};
  const render=facts=>renderToStaticMarkup(React.createElement(FuelTypeNotice,{facts,conflictsOnly:true}));
  const html=render(reportFacts(vehicle,profile,report));
  assert.match(html,/role="alert"/);assert.match(html,/diesel/i);assert.match(html,/petrol/i);
  assert.match(html,/Owner confirmed/i);assert.match(html,/Vehicle Databases \/ basic-vin-decode/);
  assert.match(html,/title="vdb:basic-vin-decode"/);assert.match(html,/Differences from the current profile/);
  assert.equal(render(reportFacts(vehicle,profile,{...report,rawPayload:{fuel:{fuel_type:'Diesel'}}})), '');
});
