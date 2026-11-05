require('reflect-metadata');
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const { drizzle } = require('drizzle-orm/pglite');
const { DateTime } = require('luxon');
const { buildReminderSchedule, numericReminderDate } = require('../dist/modules/reminders/reminder-schedule');
const { RemindersService } = require('../dist/modules/reminders/reminders.service');
const { ReminderDeliveryStore } = require('../dist/modules/reminders/reminder-delivery.store');
const { ReminderWorker: ProductionWorker, TelegramReminderSender, reminderMessage } = require('../dist/modules/reminders/reminder-worker.service');
class ReminderWorker extends ProductionWorker { constructor(store,sender,sync={sync:async()=>{}}){super(store,sender,sync)} }
const { ReminderCronController } = require('../dist/modules/reminders/reminder-cron.controller');
const { RemindersController } = require('../dist/modules/reminders/reminders.controller');
const { JwtAuthGuard } = require('../dist/common/guards/jwt-auth.guard');
const { UuidRouteParamsPipe } = require('../dist/common/pipes/uuid-route-params.pipe');
const { NestFactory } = require('@nestjs/core');
const { Module, ValidationPipe } = require('@nestjs/common');
const { JwtService } = require('@nestjs/jwt');
const OWNER = '33333333-3333-4333-8333-333333333333';
const CAR = '11111111-1111-4111-8111-111111111111';
const CAR2 = '22222222-2222-4222-8222-222222222222';
const config = { get: key => ({ REMINDERS_WORKER_ENABLED: 'true', TELEGRAM_BOT_TOKEN: 'test-only-token', REMINDERS_CRON_SECRET: 's'.repeat(32) })[key] };
let pg, database, service, store, garage;
before(async () => {
  pg = new PGlite();
  for (const migration of JSON.parse(fs.readFileSync('drizzle/meta/_journal.json')).entries) await pg.exec(fs.readFileSync(`drizzle/${migration.tag}.sql`,'utf8'));
  await pg.exec(`INSERT INTO users(id,email,password_hash,telegram_id,language) VALUES('${OWNER}','fixture@example.test','not-a-real-password','123456','uk');
    INSERT INTO vehicles(id,owner_id,make,model) VALUES('${CAR}','${OWNER}','Nissan','Test'),('${CAR2}','${OWNER}','Toyota','Test');`);
  database = { connection: drizzle(pg) };
  garage = { getVehicle: async (owner, id) => {
    assert.equal(owner, OWNER);
    if (![CAR,CAR2].includes(id)) throw new Error('Not owned');
    const row = (await pg.query('SELECT * FROM vehicles WHERE id=$1', [id])).rows[0];
    return { id, ownerId: owner, isArchived: row.is_archived };
  } };
  service = new RemindersService(database, garage, config);
  store = new ReminderDeliveryStore(database);
});
beforeEach(async () => { await pg.exec(`TRUNCATE reminders,maintenance_rules,service_records,vehicle_documents,mileage_readings,vehicle_history_events CASCADE; UPDATE users SET telegram_id='123456'; UPDATE vehicles SET is_archived=false;`); });
after(async () => { await pg?.close(); });
const input = () => ({ title: 'Техогляд', dueDate: DateTime.now().plus({ days: 50 }).toISODate(), offsets: [{ amount: 1, unit: 'months' }, { amount: 1, unit: 'weeks' }] });
async function makeDue() {
  const reminder = await service.save(OWNER, CAR, input());
  await pg.query("UPDATE reminder_deliveries SET scheduled_at=now()-interval '1 minute' WHERE reminder_id=$1 AND scheduled_at=(SELECT min(scheduled_at) FROM reminder_deliveries WHERE reminder_id=$1)", [reminder.id]);
  return reminder;
}
const jobs = async () => (await pg.query('SELECT * FROM reminder_deliveries ORDER BY scheduled_at')).rows;

test('inspection date 10\\11-27 is 10 November 2027; calendar month and week keep local 09:00', () => {
  assert.equal(numericReminderDate('У меня 10\\11-27 техосмотр'), '2027-11-10');
  const schedule = buildReminderSchedule({ title: 'Техогляд', dueDate: '2027-11-10' }, new Date('2026-10-31T12:00Z'));
  assert.deepEqual(schedule.scheduledAt.map(date => date.toISOString()), ['2027-10-10T07:00:00.000Z','2027-11-03T08:00:00.000Z']);
});
test('calendar months clamp the end of month and custom zero/day/week/month notices deduplicate dates', () => {
  const schedule = buildReminderSchedule({ title: 'Inspection', dueDate: '2028-03-31', timeZone: 'Europe/Warsaw', offsets: [{ amount: 1, unit: 'months' },{ amount: 1, unit: 'weeks' },{ amount: 7, unit: 'days' },{ amount: 0, unit: 'days' }] }, new Date('2027-01-01Z'));
  assert.deepEqual(schedule.scheduledAt.map(date => DateTime.fromJSDate(date,{zone:'Europe/Warsaw'}).toISODate()), ['2028-02-29','2028-03-24','2028-03-31']);
});
test('invalid dates, nonexistent DST times, past-only, negative and unsafe schedules are rejected', () => {
  for (const change of [{dueDate:'2027-02-30'},{dueDate:'2027-03-28',remindAt:'02:30'},{timeZone:'not/a-zone'},{remindAt:'25:00'},{offsets:[]},{offsets:[{amount:-1,unit:'days'}]},{offsets:[{amount:1,unit:'hours'}]},{offsets:[{amount:121,unit:'months'}]},{offsets:[{amount:1,unit:'days',url:'https://bad.test'}]}]) {
    assert.throws(() => buildReminderSchedule({title:'Inspection',dueDate:'2027-11-10',...change},new Date('2026-10-31Z')));
  }
  assert.throws(() => buildReminderSchedule({title:'Past',dueDate:'2026-01-01'},new Date('2026-10-31Z')));
});
test('migration and shared service persist schedules, deliveries and Telegram availability', async () => {
  const reminder = await service.save(OWNER,CAR,input());
  const result = await service.list(OWNER,CAR);
  assert.equal(result.reminders[0].id,reminder.id);
  assert.equal(result.reminders[0].deliveries.length,2);
  assert.equal(result.telegramLinked,true); assert.equal(result.deliveryEnabled,true);
  assert.equal((await service.list(OWNER,CAR2)).reminders.length,0);
});
test('editing replaces the schedule atomically; completion and cancellation stop later notices', async () => {
  const reminder = await service.save(OWNER,CAR,input());
  await service.save(OWNER,CAR,{...input(),offsets:[{amount:3,unit:'days'}]},reminder.id);
  assert.deepEqual((await jobs()).map(job=>job.status).sort(),['cancelled','cancelled','pending']);
  const result = await service.list(OWNER,CAR); assert.equal(result.reminders[0].revision,2); assert.equal(result.reminders[0].deliveries.length,1);
  await service.setStatus(OWNER,CAR,reminder.id,'completed');
  assert.equal((await store.claim(new Date('2099-01-01Z'))),null);
  await assert.rejects(()=>service.save(OWNER,CAR,input(),reminder.id));
});
test('foreign record ids and archived cars cannot create or change reminders', async () => {
  const reminder = await service.save(OWNER,CAR,input());
  await assert.rejects(()=>service.save(OWNER,CAR2,input(),reminder.id));
  await assert.rejects(()=>service.setStatus(OWNER,CAR2,reminder.id,'cancelled'));
  await pg.query('UPDATE vehicles SET is_archived=true WHERE id=$1',[CAR]);
  await assert.rejects(()=>service.save(OWNER,CAR,input()));
  assert.equal(await store.claim(new Date('2027-01-01Z')),null);
});
test('stale website edits cannot overwrite a newer Telegram schedule or cancel it', async () => {
  const reminder=await service.save(OWNER,CAR,input());
  await service.save(OWNER,CAR,{...input(),title:'Changed'},reminder.id,1);
  await assert.rejects(()=>service.save(OWNER,CAR,input(),reminder.id,1),error=>error.getStatus()===409);
  await assert.rejects(()=>service.setStatus(OWNER,CAR,reminder.id,'cancelled',1),error=>error.getStatus()===409);
  assert.equal((await service.get(OWNER,CAR,reminder.id)).title,'Changed');
});
test('queue sends a due notification once and recreation never sends it again', async () => {
  await makeDue(); const sent=[];
  const sender={enabled:true,send:async(chat,text)=>{sent.push({chat,text});return{kind:'sent',messageId:42}}};
  const worker=new ReminderWorker(store,sender);
  await Promise.all([worker.drain(),worker.drain()]);
  await new ReminderWorker(new ReminderDeliveryStore(database),sender).drain();
  assert.equal(sent.length,1); assert.equal(sent[0].chat,'123456'); assert.match(sent[0].text,/Техогляд/);
  assert.equal((await jobs()).find(job=>job.status==='sent').message_id,42);
});
test('offline backlog is coalesced and a crashed send becomes uncertain, not a duplicate', async () => {
  const reminder=await service.save(OWNER,CAR,input());
  await pg.query("UPDATE reminder_deliveries SET scheduled_at=now()-CASE WHEN id=(SELECT id FROM reminder_deliveries ORDER BY scheduled_at LIMIT 1) THEN interval '2 hours' ELSE interval '1 hour' END WHERE reminder_id=$1",[reminder.id]);
  const job=await store.claim(new Date()); assert.ok(job);
  assert.equal((await jobs()).filter(job=>job.status==='skipped').length,1);
  await pg.exec("UPDATE reminder_deliveries SET locked_at=now()-interval '11 minutes' WHERE status='sending'");
  assert.equal(await new ReminderDeliveryStore(database).claim(new Date()),null);
  assert.equal((await jobs()).filter(job=>job.status==='uncertain').length,1);
});
test('blocked, throttled, unlinked, uncertain and cancelled deliveries are not reported as sent', async () => {
  const reminder=await makeDue(); let calls=0;
  await pg.exec('UPDATE users SET telegram_id=NULL');
  const sender={enabled:true,send:async()=>{calls++;return{kind:'uncertain',error:'delivery_uncertain'}}};
  const worker=new ReminderWorker(store,sender); await worker.drain(); assert.equal(calls,0);
  assert.equal((await jobs()).find(job=>job.last_error==='not_linked').status,'pending');
  await pg.exec("UPDATE users SET telegram_id='123456'; UPDATE reminder_deliveries SET retry_at=now() WHERE last_error='not_linked'");
  await worker.drain(); await worker.drain(); assert.equal(calls,1);
  assert.ok((await jobs()).some(job=>job.status==='uncertain'));
  await service.setStatus(OWNER,CAR,reminder.id,'cancelled');
  assert.equal(await store.claim(new Date()),null);
});
test('cancellation or relinking after a claim prevents a stale send', async () => {
  const reminder=await makeDue(); const job=await store.claim(new Date()); assert.equal(await store.isCurrent(job),true);
  await service.setStatus(OWNER,CAR,reminder.id,'cancelled'); assert.equal(await store.isCurrent(job),false);
});
test('cron dispatch is secret-protected and disabled workers make no calls', async () => {
  let count=0; const worker={drain:async()=>{count++;return{processed:1}}};
  const controller=new ReminderCronController(config,worker,{enabled:true});
  await assert.rejects(()=>controller.dispatch()); await assert.rejects(()=>controller.dispatch('Bearer wrong'));
  assert.equal(count,0); await controller.dispatch('Bearer '+'s'.repeat(32)); assert.equal(count,1);
  assert.deepEqual(await new ReminderWorker({}, {enabled:false}).drain(),{processed:0});
});
test('explicit Telegram rejection retries after a delay and stops at the attempt limit', async () => {
  await makeDue(); let calls=0;
  const worker=new ReminderWorker(store,{enabled:true,send:async()=>{calls++;return{kind:'retry',error:'rate_limited',delaySeconds:120}}});
  await worker.drain(); await worker.drain(); assert.equal(calls,1);
  const first=(await jobs()).find(job=>job.last_error==='rate_limited');assert.equal(first.status,'pending');assert.ok(new Date(first.retry_at)>new Date());
  await pg.exec("UPDATE reminder_deliveries SET attempts=4,retry_at=now() WHERE last_error='rate_limited'");
  await worker.drain();assert.equal(calls,2);assert.ok((await jobs()).some(job=>job.status==='failed'));
});
test('a blocked chat fails without an automatic resend, and expired events never send', async () => {
  const reminder=await makeDue();let calls=0;
  const worker=new ReminderWorker(store,{enabled:true,send:async()=>{calls++;return{kind:'failed',error:'bot_blocked'}}});
  await worker.drain();await worker.drain();assert.equal(calls,1);
  assert.ok((await jobs()).some(job=>job.last_error==='bot_blocked'&&job.status==='failed'));
  await pg.query("UPDATE reminders SET due_date='2000-01-01' WHERE id=$1",[reminder.id]);
  assert.equal(await store.claim(new Date()),null);assert.ok((await jobs()).some(job=>job.status==='expired'));
});
test('Telegram transport handles real API response shapes without exposing credentials or retrying ambiguous sends', async () => {
  const original=global.fetch; const sender=new TelegramReminderSender(config);
  try {
    for(const [body,kind] of [[{ok:true,result:{message_id:7}},'sent'],[{ok:false,error_code:403},'failed'],[{ok:false,error_code:429,parameters:{retry_after:120}},'retry'],[{ok:false,error_code:500},'retry'],[{},'uncertain']]){
      global.fetch=async(url,options)=>{assert.equal(JSON.parse(options.body).chat_id,'123');assert.equal(options.redirect,'error');return{json:async()=>body}};
      const result=await sender.send('123','Test');assert.equal(result.kind,kind); assert.doesNotMatch(JSON.stringify(result),/test-only-token/);
    }
    global.fetch=async()=>{throw new Error('secret-url')};assert.equal((await sender.send('123','Test')).kind,'uncertain');
  }finally{global.fetch=original}
});
test('notification copy follows the account language and distinguishes late dates', () => {
  for(const language of ['uk','pl','en']){
    const text=reminderMessage({title:'Inspection',vehicleName:'Nissan',dueDate:'2027-11-10',remindAt:'09:00',timeZone:'Europe/Warsaw',language},new Date('2027-11-03T08:00Z'));
    assert.match(text,/7/);assert.doesNotMatch(text,/[ыэёъ]/);
  }
});
test('real HTTP API validates JWT, nested inputs and revisions before changing PostgreSQL', async () => {
  const jwt=new JwtService({secret:'isolated-http-test'});
  class HttpModule{}
  Module({controllers:[RemindersController],providers:[JwtAuthGuard,{provide:RemindersService,useValue:service},{provide:JwtService,useValue:jwt}]})(HttpModule);
  const app=await NestFactory.create(HttpModule,{logger:false});
  app.useGlobalPipes(new UuidRouteParamsPipe(),new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));
  await app.listen(0,'127.0.0.1');
  try{
    const base=await app.getUrl();const token=jwt.sign({sub:OWNER,email:'fixture@example.test'});
    const request=(path,method='GET',body,auth=token)=>fetch(base+path,{method,headers:{...(auth?{Authorization:'Bearer '+auth}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    const root=`/vehicles/${CAR}/reminders`;
    assert.equal((await request(root,'GET',undefined,'')).status,401);
    assert.equal((await request(root,'POST',{...input(),ownerId:OWNER})).status,400);
    assert.equal((await request(root,'POST',{...input(),offsets:[{amount:1,unit:'days',url:'https://bad.test'}]})).status,400);
    const preview=await request(root+'/preview','POST',input());assert.equal(preview.status,201);assert.equal((await jobs()).length,0);
    const created=await request(root,'POST',input());assert.equal(created.status,201);const reminder=await created.json();
    const path=root+'/'+reminder.id;
    assert.equal((await request(path,'PATCH',input())).status,400);
    assert.equal((await request(path,'PATCH',{...input(),expectedRevision:1})).status,200);
    assert.equal((await request(path,'PATCH',{...input(),expectedRevision:1})).status,409);
    assert.equal((await request(`/vehicles/${CAR2}/reminders/${reminder.id}/status`,'PATCH',{status:'cancelled',expectedRevision:2})).status,404);
    assert.equal((await request(path+'/status','PATCH',{status:'cancelled',expectedRevision:2})).status,200);
    const result=await(await request(root)).json();assert.equal(result.reminders[0].status,'cancelled');
    assert.equal((await store.claim(new Date())),null);
  }finally{await app.close()}
});
