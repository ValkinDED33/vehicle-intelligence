require('reflect-metadata');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const {drizzle}=require('drizzle-orm/pglite');
const {DateTime}=require('luxon');
const get=(file,name)=>require('../dist/modules/'+file)[name];
const OWNER='33333333-3333-4333-8333-333333333333',CAR='11111111-1111-4111-8111-111111111111';

test('real maintenance journey sends one mileage notice, preserves other tasks and keeps document reminders atomic',async()=>{
  const pg=new PGlite();
  try {
    for(const entry of JSON.parse(fs.readFileSync('drizzle/meta/_journal.json')).entries)await pg.exec(fs.readFileSync(`drizzle/${entry.tag}.sql`,'utf8'));
    await pg.exec(`INSERT INTO users(id,email,password_hash,telegram_id,language) VALUES('${OWNER}','journey@example.test','fixture','123456','en');INSERT INTO vehicles(id,owner_id,make) VALUES('${CAR}','${OWNER}','Test');`);
    const db={connection:drizzle(pg)};
    const garage={getVehicle:async(owner,id)=>{assert.equal(owner,OWNER);assert.equal(id,CAR);return{id,ownerId:owner,isArchived:false}}};
    const history=new(get('vehicle-history/services/vehicle-history.service','VehicleHistoryService'))(garage,new(get('vehicle-history/vehicle-history.db.service','VehicleHistoryDbService'))(db));
    const mileage=new(get('mileage/services/mileage.service','MileageService'))(garage,new(get('mileage/mileage.db.service','MileageDbService'))(db),history);
    const recordsDb=new(get('service-records/service-records.db.service','ServiceRecordsDbService'))(db);
    const records=new(get('service-records/services/service-records.service','ServiceRecordsService'))(garage,recordsDb,history,new(get('service-records/services/service-record-validator.service','ServiceRecordValidatorService'))(),new(get('service-records/services/service-record-item-preparer.service','ServiceRecordItemPreparerService'))());
    const maintenance=new(get('maintenance/services/maintenance.service','MaintenanceService'))(garage,new(get('maintenance/maintenance.db.service','MaintenanceDbService'))(db),mileage,history,new(get('maintenance/services/maintenance-status-calculator.service','MaintenanceStatusCalculatorService'))(),recordsDb);
    const sync=new(get('reminders/maintenance-reminder-sync','MaintenanceReminderSync'))(db,maintenance);
    const store=new(get('reminders/reminder-delivery.store','ReminderDeliveryStore'))(db,maintenance);
    const sent=[];
    const worker=new(get('reminders/reminder-worker.service','ReminderWorker'))(store,{enabled:true,send:async(chat,text)=>{sent.push({chat,text});return{kind:'sent',messageId:sent.length}}},sync);
    const plan=(key,intervalKm)=>({key,title:key,intervalKm,warningKmBefore:1000,telegramEnabled:true,notifyWhenDue:true,completionEventType:`maintenance.${key}.completed`});
    await records.createRecord(OWNER,CAR,{type:'replacement',title:'Timing belt',maintenanceKeys:['timing_belt'],maintenancePlans:[{...plan('timing_belt',60000),intervalMonths:24,telegramEnabled:false,remindAt:'12:30',timeZone:'Europe/Kyiv'}],odometerKm:100000,occurredAt:DateTime.now().minus({days:3}).toJSDate()});
    await records.createRecord(OWNER,CAR,{type:'replacement',title:'Engine oil',maintenanceKeys:['engine_oil'],maintenancePlans:[plan('engine_oil',10000)],odometerKm:120000,occurredAt:DateTime.now().minus({days:2}).toJSDate()});
    await mileage.recordReading(OWNER,CAR,{odometerKm:129500,source:'web'});
    await worker.drain();await worker.drain();
    assert.equal(sent.length,1);assert.match(sent[0].text,/130000/);assert.doesNotMatch(sent[0].text,/timing_belt/);
    const byKey=(rows,key)=>rows.find(row=>row.rule.key===key);
    assert.equal(byKey(await maintenance.getStatus(OWNER,CAR),'engine_oil').kmRemaining,500);
    await records.createRecord(OWNER,CAR,{type:'replacement',title:'New engine oil',maintenanceKeys:['engine_oil'],odometerKm:129500,occurredAt:DateTime.now().minus({days:1}).toJSDate()});
    await worker.drain();
    const after=await maintenance.getStatus(OWNER,CAR);
    assert.equal(byKey(after,'engine_oil').kmRemaining,10000);
    assert.equal(byKey(after,'timing_belt').lastCompletedMileageKm,100000);
    assert.equal(sent.length,1);
    await records.createRecord(OWNER,CAR,{type:'replacement',title:'Belt plan adjustment',maintenanceKeys:['timing_belt'],maintenancePlans:[plan('timing_belt',70000)],odometerKm:129500});
    const preserved=byKey(await maintenance.getStatus(OWNER,CAR),'timing_belt').rule;
    assert.equal(preserved.intervalMonths,24);assert.equal(preserved.remindAt,'12:30');assert.equal(preserved.timeZone,'Europe/Kyiv');
    // A model omitting notification preferences must not reset the owner's previous choice.
    const partial=plan('timing_belt',80000);delete partial.telegramEnabled;delete partial.notifyWhenDue;
    await records.createRecord(OWNER,CAR,{type:'replacement',title:'Belt interval adjustment',maintenanceKeys:['timing_belt'],maintenancePlans:[{...partial,telegramEnabled:false}],odometerKm:129500});
    delete partial.telegramEnabled;
    await records.createRecord(OWNER,CAR,{type:'replacement',title:'Belt interval only',maintenanceKeys:['timing_belt'],maintenancePlans:[partial],odometerKm:129500});
    assert.equal(byKey(await maintenance.getStatus(OWNER,CAR),'timing_belt').rule.telegramEnabled,false);
    const docsDb=new(get('documents/documents.db.service','DocumentsDbService'))(db,new(get('documents/repositories/document.repository','DocumentRepository'))(db),new(get('documents/repositories/document-fields.repository','DocumentFieldsRepository'))(db));
    const docs=new(get('documents/services/documents.service','DocumentsService'))(garage,docsDb,{},new(get('documents/services/document-validator.service','DocumentValidatorService'))(),new(get('documents/services/document-field-mapper.service','DocumentFieldMapperService'))());
    const policy=await docs.createDocument(OWNER,CAR,{type:'insurance',title:'Insurance',expiresAt:DateTime.now().plus({months:3}).toJSDate(),reminder:{offsets:[{amount:1,unit:'months'},{amount:1,unit:'weeks'}]},fields:[{fieldKey:'policy_number',valueText:'AI-GUESS',source:'ai',confidence:0.7}]});
    const confirmation={expectedUpdatedAt:policy.document.updatedAt,fields:[{id:policy.fields[0].id,valueText:'VERIFIED-123'}]};
    await assert.rejects(()=>docs.confirmFields(OWNER,CAR,policy.document.id,{...confirmation,fields:[{id:CAR,valueText:'foreign'}]}),error=>error.getStatus()===400);
    const confirmed=await docs.confirmFields(OWNER,CAR,policy.document.id,confirmation);
    assert.equal(confirmed.fields[0].source,'manual');assert.equal(confirmed.fields[0].valueText,'VERIFIED-123');
    await assert.rejects(()=>docs.confirmFields(OWNER,CAR,policy.document.id,confirmation),error=>error.getStatus()===409);
    await assert.rejects(()=>docs.confirmFields(CAR,CAR,policy.document.id,confirmation));
    const reprocessed=await docsDb.replaceExtractedFields(CAR,policy.document.id,{processingStatus:'completed',fields:[{fieldKey:'policy_number',valueText:'AI-NEW-GUESS',source:'ai'}]});
    assert.equal(reprocessed.fields.length,1);assert.equal(reprocessed.fields[0].valueText,'VERIFIED-123');assert.equal(reprocessed.fields[0].source,'manual');
    const {NestFactory}=require('@nestjs/core');
    const {Module,ValidationPipe}=require('@nestjs/common');
    const {JwtService}=require('@nestjs/jwt');
    const {JwtAuthGuard}=require('../dist/common/guards/jwt-auth.guard');
    const jwt=new JwtService({secret:'isolated-document-review'});
    class DocumentHttpModule{}
    Module({controllers:[get('documents/controllers/documents.controller','DocumentsController')],providers:[JwtAuthGuard,
      {provide:JwtService,useValue:jwt},
      {provide:get('documents/services/documents.service','DocumentsService'),useValue:docs},
      {provide:get('documents/services/document-processing.service','DocumentProcessingService'),useValue:{}},
    ]})(DocumentHttpModule);
    const app=await NestFactory.create(DocumentHttpModule,{logger:false});
    app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));
    await app.listen(0,'127.0.0.1');
    try {
      const base=await app.getUrl(),token=jwt.sign({sub:OWNER});
      const body={expectedUpdatedAt:reprocessed.document.updatedAt.toISOString(),fields:[{id:reprocessed.fields[0].id,valueText:'HTTP-VERIFIED'}]};
      const post=(data,auth=token)=>fetch(`${base}/vehicles/${CAR}/documents/${policy.document.id}/fields/confirm`,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:`Bearer ${auth}`}:{})},body:JSON.stringify(data)});
      assert.equal((await post(body,'')).status,401);
      assert.equal((await post({...body,fields:[{...body.fields[0],source:'manual'}]})).status,400);
      assert.equal((await post({...body,fields:[{id:CAR,valueText:'foreign'}]})).status,400);
      const response=await post(body);assert.equal(response.status,201);
      const saved=await response.json();assert.equal(saved.fields[0].valueText,'HTTP-VERIFIED');assert.equal(saved.fields[0].source,'manual');
      assert.equal((await post(body)).status,409);
    } finally {await app.close();}
    await pg.query("UPDATE vehicle_documents SET processing_status='processing' WHERE id=$1",[policy.document.id]);
    await assert.rejects(()=>docs.confirmFields(OWNER,CAR,policy.document.id,{...confirmation,expectedUpdatedAt:reprocessed.document.updatedAt}),error=>error.getStatus()===409);
    const linked=(await pg.query('SELECT id FROM reminders WHERE document_id=$1',[policy.document.id])).rows;
    assert.equal(linked.length,1);assert.equal((await pg.query('SELECT id FROM reminder_deliveries WHERE reminder_id=$1',[linked[0].id])).rows.length,2);
    await assert.rejects(()=>docs.createDocument(OWNER,CAR,{type:'insurance',title:'Expired fixture',expiresAt:DateTime.now().minus({days:2}).toJSDate(),reminder:{}}));
    assert.equal((await pg.query('SELECT id FROM vehicle_documents')).rows.length,1);
    await docs.deleteDocument(OWNER,CAR,policy.document.id);
    assert.equal((await pg.query('SELECT id FROM reminders WHERE document_id=$1',[policy.document.id])).rows.length,0);
    assert.equal((await pg.query('SELECT id FROM reminder_deliveries WHERE reminder_id=$1',[linked[0].id])).rows.length,0);
  } finally { await pg.close(); }
});
