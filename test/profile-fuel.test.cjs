require('reflect-metadata');
const {describe,test,before,beforeEach,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const {drizzle}=require('drizzle-orm/pglite');
const {GarageService}=require('../dist/modules/garage/services/garage.service');
const {GarageDbService}=require('../dist/modules/garage/garage.db.service');
const {VehicleProfileService}=require('../dist/modules/vehicle-profile/services/vehicle-profile.service');
const {VehicleProfileDbService}=require('../dist/modules/vehicle-profile/vehicle-profile.db.service');
const {resolveFuelTypeUpdate}=require('../dist/modules/vehicle-profile/fuel-type-provenance');
const {VinService}=require('../dist/modules/vin/services/vin.service');
const {VinDbService}=require('../dist/modules/vin/vin.db.service');
const {ExternalReportsDbService}=require('../dist/modules/external-reports/external-reports.db.service');
const {SourceNormalizationService}=require('../dist/modules/external-reports/normalization/source-normalization.service');
const {BasicVinDecodeNormalizer}=require('../dist/modules/external-reports/normalization/normalizers/basic-vin-decode.normalizer');

const OWNER='33333333-3333-4333-8333-333333333333',OTHER='44444444-4444-4444-8444-444444444444';
const CAR='11111111-1111-4111-8111-111111111111',CAR2='22222222-2222-4222-8222-222222222222';
const VIN='VF112345678901234';

test('legacy fuel provenance uses the source, never an inherited confirmation timestamp',()=>{
  const confirmedAt=new Date('2026-11-01T10:00:00Z');
  for(const source of ['manual','manual-confirmed']){
    const result=resolveFuelTypeUpdate({fuelType:'diesel',source,confirmedAt},{fuelType:'petrol',source:'vin:fixture'});
    assert.equal(result.fuelType,'diesel');assert.equal(result.fuelTypeProvenance.ownerConfirmed,true);
    assert.equal(result.fuelTypeProvenance.confirmedAt,confirmedAt.toISOString());
    assert.deepEqual(result.fuelTypeProvenance.conflicts,[{value:'petrol',source:'vin:fixture'}]);
  }
  const result=resolveFuelTypeUpdate({fuelType:'petrol',source:'vin:fixture',confirmedAt},{source:'manual-confirmed'});
  assert.equal(result.fuelTypeProvenance.ownerConfirmed,false);assert.equal(result.fuelTypeProvenance.confirmedAt,null);
  assert.equal(result.fuelTypeProvenance.source,'vin:fixture');
});

describe('profile fuel priority in isolated PostgreSQL, with offline VIN/report fixtures',()=>{
  let pg,db,garage,profiles,profileDb,reports,normalization,vin;
  before(async()=>{
    pg=new PGlite();
    for(const entry of JSON.parse(fs.readFileSync('drizzle/meta/_journal.json')).entries)await pg.exec(fs.readFileSync(`drizzle/${entry.tag}.sql`,'utf8'));
    await pg.query('INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3),($4,$5,$3)',[OWNER,'owner@fixture.test','fixture',OTHER,'other@fixture.test']);
    await pg.query('INSERT INTO vehicles(id,owner_id,make,model,vin) VALUES($1,$2,$3,$4,$5),($6,$2,$3,$4,$5)',[CAR,OWNER,'Renault','Kadjar',VIN,CAR2]);
    db={connection:drizzle(pg)};garage=new GarageService(new GarageDbService(db));
    profileDb=new VehicleProfileDbService(db);profiles=new VehicleProfileService(garage,profileDb);reports=new ExternalReportsDbService(db);
    normalization=new SourceNormalizationService(garage,profiles,{recordEvent:async()=>{}},{recordReading:async()=>{}},[new BasicVinDecodeNormalizer()]);
    vin=new VinService(garage,profiles,new VinDbService(db),{
      decode:async()=>({provider:'fixture',fuelType:'petrol',powerHp:130,rawPayload:{fuel:'petrol',original:true}}),
    },{run:async(_owner,_source,_vin,operation)=>operation()});
  });
  beforeEach(async()=>{await pg.exec('TRUNCATE vehicle_profiles,vin_decodes,vehicle_external_reports');});
  after(async()=>{await pg?.close();});
  const current=()=>profiles.getCurrentProfile(OWNER,CAR);
  const correct=(fuelType='diesel')=>profiles.createProfileVersion(OWNER,CAR,{source:'manual-confirmed',fuelType});
  async function petrolReport(){
    return reports.createReport({vehicleId:CAR,provider:'vehicle-databases',reportType:'basic-vin-decode',vin:VIN,status:'success',rawPayload:{fuel:{fuel_type:'Gasoline'},engine:{engine_capacity:1600},original:true}});
  }

  test('Kadjar owner diesel survives later petrol report and VIN refresh without changing raw evidence',async()=>{
    const report=await petrolReport();const raw=structuredClone(report.rawPayload);
    await normalization.applyToReport(OWNER,CAR,report);
    await correct();
    await normalization.applyToReport(OWNER,CAR,report);
    const decode=await vin.decodeVehicleVin(OWNER,CAR);
    const saved=await current();
    assert.equal(saved.fuelType,'diesel');assert.equal(saved.source,'vin:fixture');assert.equal(saved.powerHp,130);
    assert.equal(saved.fuelTypeProvenance.source,'manual-confirmed');assert.equal(saved.fuelTypeProvenance.ownerConfirmed,true);
    assert.deepEqual(saved.fuelTypeProvenance.conflicts,[{value:'petrol',source:'vdb:basic-vin-decode'},{value:'petrol',source:'vin:fixture'}]);
    assert.equal(decode.fuelType,'petrol');assert.deepEqual(decode.rawPayload,{fuel:'petrol',original:true});
    assert.deepEqual(report.rawPayload,raw);assert.deepEqual((await reports.listForVehicle(CAR))[0].rawPayload,raw);
    assert.equal((await current()).fuelType,'diesel');
    const history=await profiles.getProfileHistory(OWNER,CAR);
    assert.equal(history.filter(row=>row.isCurrent).length,1);assert.equal(history.at(-1).fuelType,'petrol');
  });

  test('protection survives partial versions, all lower-priority sources, blanks and service recreation',async()=>{
    const owner=await correct();
    await profiles.createProfileVersion(OWNER,CAR,{source:'vin:fixture',engineCode:'K9K'});
    await profiles.createProfileVersion(OWNER,CAR,{source:'manual-confirmed',exteriorColor:'blue'});
    for(const source of ['vin:fixture','vdb:basic-vin-decode','report:fixture','ai','ai-inferred']){
      await profiles.createProfileVersion(OWNER,CAR,{source,fuelType:'petrol'});
      assert.equal((await current()).fuelType,'diesel');
    }
    for(const fuelType of ['',null,undefined])await profileDb.createVersion({vehicleId:CAR,source:'vin:fixture',fuelType});
    const recreated=new VehicleProfileService(garage,new VehicleProfileDbService(db));
    const saved=await recreated.getCurrentProfile(OWNER,CAR);
    assert.equal(saved.fuelType,'diesel');assert.equal(saved.engineCode,'K9K');assert.equal(saved.exteriorColor,'blue');
    assert.equal(saved.fuelTypeProvenance.confirmedAt,owner.fuelTypeProvenance.confirmedAt);
    assert.equal(saved.fuelTypeProvenance.conflicts.length,5);
    await assert.rejects(()=>recreated.createProfileVersion(OTHER,CAR,{fuelType:'petrol'}),error=>error.getStatus()===404);
  });

  test('the latest explicit owner correction wins, including the default manual source',async()=>{
    await vin.decodeVehicleVin(OWNER,CAR);
    await correct();
    await profiles.createProfileVersion(OWNER,CAR,{fuelType:'lpg'});
    await vin.decodeVehicleVin(OWNER,CAR);
    const saved=await current();
    assert.equal(saved.fuelType,'lpg');assert.equal(saved.fuelTypeProvenance.source,'manual');
    assert.equal(saved.fuelTypeProvenance.ownerConfirmed,true);assert.ok(saved.fuelTypeProvenance.confirmedAt);
    assert.deepEqual(saved.fuelTypeProvenance.conflicts,[{value:'petrol',source:'vin:fixture'}]);
    await correct('petrol');
    assert.deepEqual((await current()).fuelTypeProvenance.conflicts,[]);
    await correct('diesel');
    assert.deepEqual((await current()).fuelTypeProvenance.conflicts,[{value:'petrol',source:'vin:fixture'}]);
  });

  test('confirming another field does not promote inherited provider fuel to owner-confirmed fuel',async()=>{
    await vin.decodeVehicleVin(OWNER,CAR);
    await profiles.createProfileVersion(OWNER,CAR,{source:'manual-confirmed',bodyType:'suv'});
    let saved=await current();
    assert.equal(saved.source,'manual-confirmed');assert.ok(saved.confirmedAt);
    assert.equal(saved.fuelTypeProvenance.ownerConfirmed,false);assert.equal(saved.fuelTypeProvenance.source,'vin:fixture');
    await profiles.createProfileVersion(OWNER,CAR,{source:'vdb:other',fuelType:'diesel'});
    saved=await current();assert.equal(saved.fuelType,'diesel');assert.equal(saved.fuelTypeProvenance.ownerConfirmed,false);
    assert.equal(saved.fuelTypeProvenance.confirmedAt,null);assert.equal(saved.bodyType,'suv');
  });

  test('without owner fuel, provider facts still fill/update fuel without crossing vehicles',async()=>{
    await profiles.createProfileVersion(OWNER,CAR,{source:'manual-confirmed',bodyType:'suv'});
    await normalization.applyToReport(OWNER,CAR,await petrolReport());
    assert.equal((await current()).fuelType,'petrol');assert.equal((await current()).fuelTypeProvenance.ownerConfirmed,false);
    await correct();
    await profiles.createProfileVersion(OWNER,CAR2,{source:'vin:fixture',fuelType:'petrol'});
    assert.equal((await profiles.getCurrentProfile(OWNER,CAR2)).fuelType,'petrol');
    assert.equal((await current()).fuelType,'diesel');
  });

  test('a report started before an owner correction cannot overwrite that correction when it finishes',async()=>{
    await profiles.createProfileVersion(OWNER,CAR,{source:'vin:fixture',fuelType:'petrol'});
    const stale=await current();
    const delayed=new SourceNormalizationService(garage,{
      getCurrentProfile:async()=>{await correct();return stale;},
      createProfileVersion:(...args)=>profiles.createProfileVersion(...args),
    },{recordEvent:async()=>{}},{recordReading:async()=>{}},[new BasicVinDecodeNormalizer()]);
    await delayed.applyToReport(OWNER,CAR,await petrolReport());
    assert.equal((await current()).fuelType,'diesel');
    assert.deepEqual((await current()).fuelTypeProvenance.conflicts,[{value:'petrol',source:'vin:fixture'},{value:'petrol',source:'vdb:basic-vin-decode'}]);
  });

  test('matching report evidence remains visible after another owner correction, and newer source facts resolve only that source conflict',async()=>{
    await correct('petrol');
    const report=await reports.createReport({vehicleId:CAR,provider:'vehicle-databases',reportType:'basic-vin-decode',vin:VIN,status:'success',rawPayload:{fuel:{fuel_type:'Gasoline'}}});
    assert.equal((await normalization.applyToReport(OWNER,CAR,report)).profileUpdated,true);
    assert.equal((await normalization.applyToReport(OWNER,CAR,report)).profileUpdated,false);
    assert.deepEqual((await current()).fuelTypeProvenance.conflicts,[]);
    await correct('diesel');
    assert.deepEqual((await current()).fuelTypeProvenance.conflicts,[{value:'petrol',source:'vdb:basic-vin-decode'}]);
    await vin.decodeVehicleVin(OWNER,CAR);
    const corrected=await reports.createReport({vehicleId:CAR,provider:'vehicle-databases',reportType:'basic-vin-decode',vin:VIN,status:'success',rawPayload:{fuel:{fuel_type:'Diesel'}}});
    await normalization.applyToReport(OWNER,CAR,corrected);
    assert.equal((await current()).fuelType,'diesel');
    assert.deepEqual((await current()).fuelTypeProvenance.conflicts,[{value:'petrol',source:'vin:fixture'}]);
    assert.equal((await reports.listForVehicle(CAR)).length,2);
  });
});
