import { useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, Check, CircleHelp, ClipboardList, FileText, Gauge, Loader2, Plus, RefreshCw, Search, Trash2, Wrench } from "lucide-react";
import { documentsApi, fmtDate, fmtMoney, fmtNumber, garageApi, maintenanceApi, mileageApi, profileApi, vinApi, type VehicleDocument } from "../api";
import { AddVehicleForm } from "../components/AddVehicleForm";
import { EmptyState, Field, NoVehicle, Spinner } from "../components/CommonComponents";
import { URGENCY_META } from "../constants/dashboard";
import type { PageProps } from "../types/dashboard";
import type { VinDecode } from "../api";
import { serviceProgress } from "../utils/calculations";
import { errText, intervalLines, reminderDetail, urgencyScore, vehicleLine, vehicleTitle } from "../utils/formatters";

function GaragePage(props: PageProps) {
  const {vehicles,vehicle,selectVehicle,loadVehicles,vehiclesLoading,vehiclesError,navigate,data}=props;
  const [showArchived,setShowArchived]=useState(false);
  const visible=vehicles.filter(v=>showArchived||!v.isArchived);
  return <>
   {vehiclesLoading&&<Spinner/>}
   {vehiclesError&&<div className="auth-error">{vehiclesError}</div>}
   <div className="page-actions">
    <label className="toggle-line"><input type="checkbox" checked={showArchived} onChange={e=>setShowArchived(e.target.checked)}/> Показати архівні</label>
   </div>
   <div className="vehicles-grid">
    {visible.map(v=><div key={v.id} className={'vehicle-card'+(vehicle?.id===v.id?' selected':'')}>
      <img src="/car.webp" alt=""/>
      <div className="vehicle-card-body">
       <b>{vehicleTitle(v)}{v.isArchived&&<span className="badge">АРХІВ</span>}</b>
       <small>{vehicleLine(v,v.id===vehicle?.id?data.latest:null)}</small>
       {v.vin&&<small className="vin">VIN {v.vin}</small>}
      </div>
      <div className="vehicle-card-actions">
       {vehicle?.id!==v.id&&<button className="primary" onClick={()=>{selectVehicle(v.id);navigate('Головна','chime')}}>ВИБРАТИ</button>}
       {vehicle?.id===v.id&&<span className="tag green">Поточний</span>}
       {v.isArchived
        ?<button className="ghost-btn" onClick={async()=>{await garageApi.restore(v.id);await loadVehicles()}}>Повернути</button>
        :<button className="ghost-btn" onClick={async()=>{await garageApi.archive(v.id);await loadVehicles()}}>В архів</button>}
      </div>
     </div>)}
    {!visible.length&&!vehiclesLoading&&<div className="state-note">Гараж порожній.</div>}
   </div>
   <AddVehicleForm onDone={()=>void loadVehicles()}/>
  </>;
}

function ProfilePage(props: PageProps) {
  const {vehicle,data,afterMutate}=props;
  const [busy,setBusy]=useState(false);
  const [savingProfile,setSavingProfile]=useState(false);
  const [message,setMessage]=useState<{kind:'ok'|'err',text:string}|null>(null);
  const [correction,setCorrection]=useState({
    fuelType:'',
    bodyType:'',
    doorCount:'',
    seatCount:'',
    trimLevel:'',
    exteriorColor:'',
  });
  const profile=data.profile;
  useEffect(()=>{
    setCorrection({
      fuelType:profile?.fuelType??'',
      bodyType:profile?.bodyType??'',
      doorCount:profile?.doorCount!=null?String(profile.doorCount):'',
      seatCount:profile?.seatCount!=null?String(profile.seatCount):'',
      trimLevel:profile?.trimLevel??'',
      exteriorColor:profile?.exteriorColor??'',
    });
  },[profile?.id]);
  if(!vehicle)return <NoVehicle onGoGarage={()=>props.navigate('Гараж')}/>;
  const decode=async()=>{
    if(!vehicle.vin){setMessage({kind:'err',text:'В автомобіля не вказано VIN — спочатку додайте його в гаражі.'});return}
    setBusy(true);setMessage(null);
    try{
      const decoded=await vinApi.decode(vehicle.id);
      const hasProfileData=Boolean(decoded.engineCode||decoded.engineFamily||decoded.displacementCc||decoded.fuelType||decoded.powerKw||decoded.powerHp||decoded.transmissionType||decoded.driveType);
      setMessage({kind:'ok',text:hasProfileData?'VIN розшифровано — профіль і картку оновлено.':'VIN розшифровано — картку оновлено, але провайдер не повернув технічні дані для профілю.'});
      await afterMutate();
    }catch(err){setMessage({kind:'err',text:errText(err)})}finally{setBusy(false)}
  };
  const saveCorrection=async(e:FormEvent)=>{
    e.preventDefault();
    setSavingProfile(true);setMessage(null);
    try{
      await profileApi.create(vehicle.id,{
        source:'manual-confirmed',
        fuelType:emptyToUndefined(correction.fuelType),
        bodyType:emptyToUndefined(correction.bodyType),
        doorCount:numberOrUndefined(correction.doorCount),
        seatCount:numberOrUndefined(correction.seatCount),
        trimLevel:emptyToUndefined(correction.trimLevel),
        exteriorColor:emptyToUndefined(correction.exteriorColor),
      });
      setMessage({kind:'ok',text:'Підтверджені дані збережено — тепер вони мають вищий пріоритет, ніж відповідь VIN-провайдера.'});
      await afterMutate();
    }catch(err){setMessage({kind:'err',text:errText(err)})}finally{setSavingProfile(false)}
  };
  const rows:[string,string][]=profile?[
    ['Двигун',[profile.engineFamily,profile.engineCode].filter(Boolean).join(' ')||'—'],
    ['Об’єм',profile.displacementCc?`${fmtNumber(profile.displacementCc)} см³`:'—'],
    ['Пальне',formatFuel(profile.fuelType)],
    ['Наддув',formatAspiration(profile.aspirationType)],
    ['Потужність',profile.powerHp?`${fmtNumber(profile.powerHp)} к.с. (${fmtNumber(profile.powerKw)} кВт)`:'—'],
    ['Коробка',[formatTransmission(profile.transmissionType),profile.transmissionCode].filter(v=>v&&v!=='—').join(' ')||'—'],
    ['Привід',formatDrive(profile.driveType)],
    ['Кузов',formatBody(profile.bodyType)],
    ['Дверей',profile.doorCount!=null?String(profile.doorCount):'—'],
    ['Місць',profile.seatCount!=null?String(profile.seatCount):'—'],
    ['Комплектація',profile.trimLevel??'—'],
    ['Колір',profile.exteriorColor??'—'],
    ['Бак',profile.fuelTankCapacityLiters?`${profile.fuelTankCapacityLiters} л`:'—'],
    ['Батарея',profile.batteryUsableCapacityKwh?`${profile.batteryUsableCapacityKwh} кВт⋅год (повна ${profile.batteryGrossCapacityKwh??'—'})`:'—'],
    ['Версія профілю',`v${profile.version} · ${formatProfileSource(profile.source)}`],
    ['Підтверджено',fmtDate(profile.confirmedAt)],
  ]:[
    ['Марка',vehicle.make??'—'],['Рік',vehicle.modelYear??'—'],['VIN',vehicle.vin??'—'],
    ['Держномер',vehicle.licensePlate??'—'],['Країна',vehicle.country],
  ];
  return <>
   <div className="page-actions">
    <button className="primary" onClick={()=>void decode()} disabled={busy}>{busy?<Loader2 size={15} className="spin"/>:<Search size={15}/>} {busy?'РОЗШИФРОВУЄМО VIN...':'РОЗШИФРУВАТИ VIN'}</button>
   </div>
   {message&&<div className={message.kind==='ok'?'ok-note':'auth-error'}>{message.text}</div>}
   {profile
    ?<div className="panel spec-panel"><h2>ТЕХНІЧНИЙ ПРОФІЛЬ</h2><div className="spec-grid">{rows.map(([k,v])=><div key={k}><span>{k}</span><b>{v}</b></div>)}</div></div>
    :<EmptyState icon={ClipboardList} title="Профіль ще не заповнено" text="Натисніть «Розшифрувати VIN» — дані підтягнуться з Vehicle Databases і збережуться в профілі автомобіля."/>}
   <form className="panel profile-correction-panel" onSubmit={saveCorrection}>
    <div className="panel-heading"><h2>ПІДТВЕРДЖЕНІ ДАНІ ВЛАСНИКА</h2><span className="tag green">вище VIN-провайдера</span></div>
    <div className="correction-grid">
     <Field label="Пальне"><select value={correction.fuelType} onChange={e=>setCorrection({...correction,fuelType:e.target.value})}>
      <option value="">Не вказано</option><option value="petrol">Бензин</option><option value="diesel">Дизель</option><option value="lpg">LPG</option><option value="cng">CNG</option><option value="hybrid">Гібрид</option><option value="phev">PHEV</option><option value="electric">Електро</option>
     </select></Field>
     <Field label="Кузов"><select value={correction.bodyType} onChange={e=>setCorrection({...correction,bodyType:e.target.value})}>
      <option value="">Не вказано</option><option value="hatchback">Хетчбек</option><option value="sedan">Седан</option><option value="wagon">Універсал</option><option value="coupe">Купе</option><option value="suv">SUV</option><option value="mpv">MPV</option><option value="van">Фургон</option><option value="pickup">Пікап</option><option value="convertible">Кабріолет</option><option value="other">Інше</option>
     </select></Field>
     <Field label="Дверей"><input value={correction.doorCount} onChange={e=>setCorrection({...correction,doorCount:e.target.value.replace(/[^\d]/g,'')})} placeholder="3" inputMode="numeric"/></Field>
     <Field label="Місць"><input value={correction.seatCount} onChange={e=>setCorrection({...correction,seatCount:e.target.value.replace(/[^\d]/g,'')})} placeholder="5" inputMode="numeric"/></Field>
     <Field label="Комплектація"><input value={correction.trimLevel} onChange={e=>setCorrection({...correction,trimLevel:e.target.value})} placeholder="GOAL"/></Field>
     <Field label="Колір"><input value={correction.exteriorColor} onChange={e=>setCorrection({...correction,exteriorColor:e.target.value})} placeholder="наприклад, сріблястий"/></Field>
    </div>
    <button className="ghost-btn save-profile-btn" type="submit" disabled={savingProfile}>{savingProfile?<Loader2 size={15} className="spin"/>:<Check size={15}/>} ЗБЕРЕГТИ ПІДТВЕРДЖЕННЯ</button>
   </form>
   <VinDecodedFacts decode={data.vinDecode}/>
  </>;
}

type DecodeFact = {
  label: string;
  value: string;
};

type DecodeGroup = {
  title: string;
  facts: DecodeFact[];
};

function VinDecodedFacts({decode}:{decode:VinDecode|null}) {
  const facts=decode?extractVinFacts(decode):[];
  if(!decode||!facts.length)return <div className="panel decode-panel">
   <div className="panel-heading"><h2>ПОВНЕ РОЗШИФРУВАННЯ VIN</h2></div>
   <div className="state-note">Повне розшифрування з’явиться після успішного VIN decode.</div>
  </div>;
  const groups=groupDecodeFacts(facts);
  const hasColor=facts.some(f=>/color|colour|paint|цвет/i.test(f.label));
  const hasTrim=facts.some(f=>/trim|variant|version|grade|комплек/i.test(f.label));
  return <div className="panel decode-panel">
   <div className="decode-head">
    <div>
     <h2>ПОВНЕ РОЗШИФРУВАННЯ VIN</h2>
     <p>{formatVinProvider(decode.provider)}{decode.decodedAt?` · ${fmtDate(decode.decodedAt,true)}`:''} · {facts.length} полів</p>
    </div>
    {decode.vin&&<span className="decode-vin">{decode.vin}</span>}
   </div>
   {(!hasColor||!hasTrim)&&<div className="state-note">Провайдер не повернув {[
    !hasTrim?'комплектацію/trim':null,
    !hasColor?'колір/paint':null,
   ].filter(Boolean).join(' і ')} для цього VIN. Інші отримані поля збережено й показано нижче.</div>}
   <div className="decode-groups">
    {groups.map(group=><section key={group.title} className="decode-group">
     <h3>{group.title}</h3>
     <div className="decode-grid">
      {group.facts.map(f=><div key={`${group.title}-${f.label}`} className="decode-item">
       <span>{translateDecodeLabel(f.label)}</span>
       <b>{f.value}</b>
      </div>)}
     </div>
    </section>)}
   </div>
  </div>;
}

function extractVinFacts(decode:VinDecode):DecodeFact[] {
  const raw=isRecord(decode.rawPayload)?decode.rawPayload:null;
  const rawDecode=raw?.decode;
  const candidates:Array<{label:unknown;value:unknown}>=[];
  if(Array.isArray(rawDecode)){
    for(const item of rawDecode){
      if(isRecord(item))candidates.push({label:item.label??item.name??item.key,value:item.value});
    }
  }else if(isRecord(rawDecode)){
    for(const [label,value] of Object.entries(rawDecode))candidates.push({label,value});
  }
  if(!candidates.length&&raw){
    const payload=isRecord(raw.data)?raw.data:raw;
    for(const [label,value] of Object.entries(payload)){
      if(!["success","status","message","decode"].includes(label))candidates.push({label,value});
    }
  }
  const seen=new Set<string>();
  return candidates
    .map(({label,value})=>({label:String(label??"").trim(),value:formatDecodeValue(value)}))
    .filter(f=>f.label&&f.value&&f.value!=="—")
    .filter(f=>{
      const key=`${f.label.toLowerCase()}=${f.value.toLowerCase()}`;
      if(seen.has(key))return false;
      seen.add(key);
      return true;
    });
}

function groupDecodeFacts(facts:DecodeFact[]):DecodeGroup[] {
  const buckets:DecodeGroup[]=[
    {title:"Ідентифікація",facts:[]},
    {title:"Кузов і комплектація",facts:[]},
    {title:"Двигун і трансмісія",facts:[]},
    {title:"Розміри, маса й колеса",facts:[]},
    {title:"Оснащення й безпека",facts:[]},
    {title:"Виробництво й документи",facts:[]},
    {title:"Інше",facts:[]},
  ];
  for(const fact of facts){
    bucketForDecodeLabel(fact.label,buckets).facts.push(fact);
  }
  return buckets.filter(group=>group.facts.length);
}

function bucketForDecodeLabel(label:string,buckets:DecodeGroup[]):DecodeGroup {
  const l=label.toLowerCase();
  if(/vin|vehicle id|make$|model$|model year|product type|series/.test(l))return buckets[0];
  if(/body|trim|variant|version|color|colour|paint|doors|seats/.test(l))return buckets[1];
  if(/engine|fuel|transmission|drive|emission|co2|power|displacement|turbo/.test(l))return buckets[2];
  if(/wheel|wheelbase|height|length|width|track|weight|speed|axle|tire|tyre/.test(l))return buckets[3];
  if(/abs|brake|suspension|steering|airbag|lamp|light|safety/.test(l))return buckets[4];
  if(/manufacturer|plant|country|logo|market|checksum/.test(l))return buckets[5];
  return buckets[6];
}

function formatDecodeValue(value:unknown):string {
  if(value===null||value===undefined||value==="")return "—";
  if(typeof value==="string")return value.trim();
  if(typeof value==="number"||typeof value==="boolean")return String(value);
  if(Array.isArray(value))return value.map(formatDecodeValue).filter(v=>v&&v!=="—").join(", ");
  if(isRecord(value)){
    return Object.entries(value)
      .map(([k,v])=>`${k}: ${formatDecodeValue(v)}`)
      .filter(v=>!v.endsWith(": —"))
      .join("; ");
  }
  return String(value);
}

function translateDecodeLabel(label:string):string {
  const map:Record<string,string>={
    "VIN":"VIN",
    "Vehicle ID":"ID автомобіля",
    "Make":"Марка",
    "Model":"Модель",
    "Model Year":"Рік моделі",
    "Product Type":"Тип ТЗ",
    "Body":"Кузов",
    "Series":"Серія",
    "Drive":"Привід",
    "Transmission":"Коробка",
    "Engine Manufacturer":"Виробник двигуна",
    "Engine Type":"Тип двигуна",
    "Emission Standard":"Екостандарт",
    "Average CO2 Emission":"Середній CO2",
    "Manufacturer":"Виробник",
    "Plant Country":"Країна складання",
    "Number of Wheels":"Коліс",
    "Number of Axles":"Осей",
    "Number of Doors":"Дверей",
    "Number of Seats":"Місць",
    "Rear Brakes":"Задні гальма",
    "Brake System":"Гальмівна система",
    "Suspension":"Підвіска",
    "Steering Type":"Кермове управління",
    "Wheel Size":"Розмір коліс",
    "Wheelbase":"Колісна база",
    "Height":"Висота",
    "Length":"Довжина",
    "Width":"Ширина",
    "Track Front":"Передня колія",
    "Track Rear":"Задня колія",
    "Max Speed":"Макс. швидкість",
    "Weight Empty":"Споряджена маса",
    "Max Weight":"Макс. маса",
    "ABS":"ABS",
  };
  return map[label]??label;
}

function formatVinProvider(provider:string|undefined):string {
  if(provider==="vincario")return "Vincario";
  if(provider==="vehicle-databases")return "Vehicle Databases";
  return provider??"VIN provider";
}

function isRecord(value:unknown):value is Record<string,unknown> {
  return typeof value==="object"&&value!==null&&!Array.isArray(value);
}

function formatFuel(value:string|null|undefined):string{
  const map:Record<string,string>={petrol:'бензин',diesel:'дизель',lpg:'LPG',cng:'CNG',hybrid:'гібрид',phev:'plug-in hybrid',electric:'електро',hydrogen:'водень'};
  return value?map[value]??value:'—';
}

function formatTransmission(value:string|null|undefined):string{
  const map:Record<string,string>={manual:'МКПП',automatic:'АКПП',dct:'робот DCT',cvt:'варіатор',other:'інша'};
  return value?map[value]??value:'—';
}

function formatDrive(value:string|null|undefined):string{
  const map:Record<string,string>={fwd:'передній',rwd:'задній',awd:'повний AWD','4wd':'повний 4WD',other:'інший'};
  return value?map[value]??value:'—';
}

function formatBody(value:string|null|undefined):string{
  const map:Record<string,string>={hatchback:'хетчбек',sedan:'седан',wagon:'універсал',coupe:'купе',suv:'SUV',mpv:'MPV',van:'фургон',pickup:'пікап',convertible:'кабріолет',other:'інший'};
  return value?map[value]??value:'—';
}

function formatAspiration(value:string|null|undefined):string{
  const map:Record<string,string>={turbo:'турбо',supercharged:'компресор',naturally_aspirated:'атмосферний'};
  return value?map[value]??value:'—';
}

function emptyToUndefined(value:string):string|undefined{
  const trimmed=value.trim();
  return trimmed?trimmed:undefined;
}

function numberOrUndefined(value:string):number|undefined{
  if(!value.trim())return undefined;
  const parsed=Number(value);
  return Number.isFinite(parsed)?parsed:undefined;
}

function formatProfileSource(value:string):string{
  if(value==='manual-confirmed')return 'підтверджено власником';
  if(value==='manual')return 'ручний профіль';
  if(value==='vin:vincario')return 'Vincario VIN';
  if(value==='vin:vehicle-databases')return 'Vehicle Databases VIN';
  if(value.startsWith('vdb:'))return `Vehicle Databases · ${value.slice(4)}`;
  return value;
}

function MileagePage(props: PageProps) {
  const {vehicle,data,refresh}=props;
  const [odometer,setOdometer]=useState('');
  const [date,setDate]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState<{kind:'ok'|'err',text:string}|null>(null);
  if(!vehicle)return <NoVehicle onGoGarage={()=>props.navigate('Гараж')}/>;
  const anomalies=data.anomalies?.anomalies??[];
  const submit=async(e:FormEvent)=>{
    e.preventDefault();
    const km=Number(odometer);
    if(!Number.isFinite(km)||km<0){setMessage({kind:'err',text:'Введіть коректний пробіг.'});return}
    setBusy(true);setMessage(null);
    try{
      await mileageApi.create(vehicle.id,{odometerKm:Math.round(km),source:'web',recordedAt:date?new Date(date).toISOString():undefined});
      setOdometer('');setDate('');
      setMessage({kind:'ok',text:'Запис пробігу додано.'});
      await refresh();
    }catch(err){setMessage({kind:'err',text:errText(err)})}finally{setBusy(false)}
  };
  return <>
   <div className="panels-row">
    <form className="form-card" onSubmit={submit}>
     <h3><Gauge size={16}/> Додати показання</h3>
     <div className="form-grid">
      <Field label="Одометр, км"><input value={odometer} onChange={e=>setOdometer(e.target.value.replace(/[^\d]/g,''))} placeholder="120450" inputMode="numeric"/></Field>
      <Field label="Дата"><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></Field>
     </div>
     {message&&<div className={message.kind==='ok'?'ok-note':'auth-error'}>{message.text}</div>}
     <button className="primary" type="submit" disabled={busy}>{busy?'Зберігаємо...':'ДОДАТИ ЗАПИС'}</button>
    </form>
    <div className="panel stat-panel">
     <h2>ОСТАННЄ ПОКАЗАННЯ</h2>
     <div className="metric-value">{data.latest?fmtNumber(data.latest.odometerKm):'—'} <span>км</span></div>
     <p>{data.latest?`${fmtDate(data.latest.recordedAt,true)} · джерело ${data.latest.source} · впевненість ${Math.round(data.latest.confidence*100)}%`:'Немає записів'}</p>
    </div>
   </div>
   {anomalies.length>0&&<div className="panel anomaly-panel">
    <h2><AlertTriangle size={14}/> АНОМАЛІЇ ПРОБІГУ ({anomalies.length})</h2>
    {anomalies.map((a,i)=><div key={i} className={'anomaly '+a.severity}>
      <span className={'tag '+a.severity}>{a.type==='rollback'?'Скручування пробігу':'Неправдоподібний стрибок'}</span>
      <div><b>{a.message}</b><small>{fmtDate(a.fromRecordedAt)} → {fmtDate(a.toRecordedAt)} · {fmtNumber(a.fromOdometerKm)} → {fmtNumber(a.toOdometerKm)} км</small></div>
     </div>)}
   </div>}
   <div className="panel list-panel">
    <h2>ІСТОРІЯ ПРОБІГУ</h2>
    {data.loading&&!data.mileageHistory.length?<Spinner/>
     :data.mileageHistory.length
      ?<table className="data-table"><thead><tr><th>Дата</th><th>Одометр</th><th>Джерело</th><th>Впевненість</th></tr></thead><tbody>
       {[...data.mileageHistory].reverse().map(r=><tr key={r.id}><td>{fmtDate(r.recordedAt,true)}</td><td><b>{fmtNumber(r.odometerKm)} км</b></td><td>{r.source}</td><td>{Math.round(r.confidence*100)}%</td></tr>)}
      </tbody></table>
      :<div className="state-note">Записів поки немає.</div>}
   </div>
  </>;
}

function ServicePage(props: PageProps) {
  const {vehicle,data,afterMutate}=props;
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState<{kind:'ok'|'err';text:string}|null>(null);
  const [rule,setRule]=useState({
    key:"engine_oil",
    title:"Заміна масла",
    intervalKm:"10000",
    intervalMonths:"12",
    warningKmBefore:"1000",
    warningDaysBefore:"30",
  });
  if(!vehicle)return <NoVehicle onGoGarage={()=>props.navigate('Гараж')}/>;
  const createRule=async(e:FormEvent)=>{
    e.preventDefault();
    setBusy(true);setMessage(null);
    try{
      await maintenanceApi.createRule(vehicle.id,{
        key:slugifyRuleKey(rule.key||rule.title),
        title:rule.title.trim(),
        source:"manual",
        intervalKm:numberOrUndefined(rule.intervalKm),
        intervalMonths:numberOrUndefined(rule.intervalMonths),
        warningKmBefore:numberOrUndefined(rule.warningKmBefore),
        warningDaysBefore:numberOrUndefined(rule.warningDaysBefore),
        completionEventType:`maintenance.${slugifyRuleKey(rule.key||rule.title)}.completed`,
      });
      setMessage({kind:'ok',text:'Регламент додано. Статуси ТО перераховано.'});
      await afterMutate();
    }catch(err){setMessage({kind:'err',text:errText(err)})}finally{setBusy(false)}
  };
  const deleteRule=async(ruleId:string)=>{
    setBusy(true);setMessage(null);
    try{
      await maintenanceApi.deleteRule(vehicle.id,ruleId);
      setMessage({kind:'ok',text:'Правило регламенту вимкнено.'});
      await afterMutate();
    }catch(err){setMessage({kind:'err',text:errText(err)})}finally{setBusy(false)}
  };
  return <>
   {message&&<div className={message.kind==='ok'?'ok-note':'auth-error'}>{message.text}</div>}
   <form className="panel form-card" onSubmit={createRule}>
    <h2>ДОДАТИ РЕГЛАМЕНТ</h2>
    <div className="form-grid">
     <Field label="Ключ"><input value={rule.key} onChange={e=>setRule({...rule,key:e.target.value})} placeholder="engine_oil"/></Field>
     <Field label="Робота"><input value={rule.title} onChange={e=>setRule({...rule,title:e.target.value})} placeholder="Заміна масла" required/></Field>
     <Field label="Інтервал, км"><input value={rule.intervalKm} onChange={e=>setRule({...rule,intervalKm:e.target.value.replace(/[^\d]/g,'')})} inputMode="numeric" placeholder="10000"/></Field>
     <Field label="Інтервал, міс."><input value={rule.intervalMonths} onChange={e=>setRule({...rule,intervalMonths:e.target.value.replace(/[^\d]/g,'')})} inputMode="numeric" placeholder="12"/></Field>
     <Field label="Попередити за, км"><input value={rule.warningKmBefore} onChange={e=>setRule({...rule,warningKmBefore:e.target.value.replace(/[^\d]/g,'')})} inputMode="numeric" placeholder="1000"/></Field>
     <Field label="Попередити за, днів"><input value={rule.warningDaysBefore} onChange={e=>setRule({...rule,warningDaysBefore:e.target.value.replace(/[^\d]/g,'')})} inputMode="numeric" placeholder="30"/></Field>
    </div>
    <button className="primary" type="submit" disabled={busy}>{busy?<Loader2 size={15} className="spin"/>:<Plus size={15}/>} ДОДАТИ РЕГЛАМЕНТ</button>
   </form>
   <div className="panel list-panel">
    <h2>СТАТУС ОБСЛУГОВУВАННЯ</h2>
    {data.loading&&!data.maintenance.length?<Spinner/>
     :data.maintenance.length
      ?<div className="status-list">{data.maintenance.map(s=><div key={s.rule.id} className="status-row">
        <span className={'tag '+URGENCY_META[s.urgency].color}>{URGENCY_META[s.urgency].tag}</span>
       <div className="status-copy"><b>{s.rule.title}</b><small>{reminderDetail(s)}{s.lastCompletedAt?` · попереднє ТО ${fmtDate(s.lastCompletedAt)}`:' · ще не виконувалося'}</small></div>
        <div className="status-nums">{s.rule.intervalKm?`інтервал ${fmtNumber(s.rule.intervalKm)} км`:''}{s.rule.intervalMonths?` · ${s.rule.intervalMonths} міс.`:''}</div>
       </div>)}</div>
      :<div className="state-note"><Wrench size={15}/> Правила ТО не налаштовані. Додайте перший регламент вище.</div>}
   </div>
   <div className="panel list-panel">
    <h2>ПРАВИЛА РЕГЛАМЕНТУ</h2>
    {data.maintenance.length
     ?<table className="data-table"><thead><tr><th>Робота</th><th>Ключ</th><th>Інтервал</th><th>Попередження</th><th></th></tr></thead><tbody>
      {data.maintenance.map(s=><tr key={s.rule.id}><td><b>{s.rule.title}</b><small className="sub">{s.rule.source??'manual'}</small></td><td className="mono">{s.rule.key}</td><td>{[s.rule.intervalKm?`${fmtNumber(s.rule.intervalKm)} км`:null,s.rule.intervalMonths?`${s.rule.intervalMonths} міс.`:null].filter(Boolean).join(' / ')||'—'}</td><td>{[s.rule.warningKmBefore?`${fmtNumber(s.rule.warningKmBefore)} км`:null,s.rule.warningDaysBefore?`${s.rule.warningDaysBefore} дн.`:null].filter(Boolean).join(' / ')||'—'}</td><td><button className="ghost-btn danger" onClick={()=>void deleteRule(s.rule.id)} disabled={busy}><Trash2 size={14}/> Видалити</button></td></tr>)}
     </tbody></table>
     :<div className="state-note">Правил поки немає.</div>}
   </div>
   <div className="panel list-panel">
    <h2>СЕРВІСНІ ЗАПИСИ</h2>
    {data.services.length
     ?<table className="data-table"><thead><tr><th>Дата</th><th>Робота</th><th>Тип</th><th>Пробіг</th><th>Вартість</th></tr></thead><tbody>
       {data.services.map(r=><tr key={r.id}><td>{fmtDate(r.occurredAt)}</td><td><b>{r.title}</b>{r.providerName&&<small className="sub">{r.providerName}</small>}</td><td>{r.type}</td><td>{r.odometerKm!==null?`${fmtNumber(r.odometerKm)} км`:'—'}</td><td>{fmtMoney(r.totalCost,r.currency)}</td></tr>)}
      </tbody></table>
     :<div className="state-note">Сервісних записів поки немає.</div>}
   </div>
  </>;
}

const DOCUMENT_TYPES=[
  {value:"insurance",label:"Страхування"},
  {value:"registration",label:"Реєстрація"},
  {value:"inspection",label:"Техогляд"},
  {value:"service-invoice",label:"Сервісний рахунок"},
  {value:"purchase",label:"Покупка"},
  {value:"warranty",label:"Гарантія"},
  {value:"tax",label:"Податок"},
  {value:"fine",label:"Штраф"},
  {value:"receipt",label:"Чек"},
  {value:"manual",label:"Інструкція"},
  {value:"other",label:"Інше"},
];

function DocumentsPage(props: PageProps) {
  const {vehicle}=props;
  const [documents,setDocuments]=useState<VehicleDocument[]|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState<{kind:'ok'|'err';text:string}|null>(null);
  const [form,setForm]=useState({
    type:"insurance",
    title:"",
    documentNumber:"",
    issuerName:"",
    issuedAt:"",
    expiresAt:"",
    description:"",
  });
  const vehicleId=vehicle?.id??null;
  const loadDocuments=async()=>{
    if(!vehicleId)return;
    setDocuments(await documentsApi.list(vehicleId));
  };
  useEffect(()=>{setDocuments(null);if(vehicleId)void loadDocuments().catch(err=>setMessage({kind:'err',text:errText(err)}))},[vehicleId]);
  if(!vehicle)return <NoVehicle onGoGarage={()=>props.navigate('Гараж')}/>;
  const createDocument=async(e:FormEvent)=>{
    e.preventDefault();
    setBusy(true);setMessage(null);
    try{
      await documentsApi.create(vehicle.id,{
        type:form.type,
        title:form.title.trim(),
        documentNumber:emptyToUndefined(form.documentNumber),
        issuerName:emptyToUndefined(form.issuerName),
        issuedAt:emptyToUndefined(form.issuedAt),
        expiresAt:emptyToUndefined(form.expiresAt),
        description:emptyToUndefined(form.description),
        source:"manual",
      });
      setForm({...form,title:"",documentNumber:"",issuerName:"",issuedAt:"",expiresAt:"",description:""});
      setMessage({kind:'ok',text:'Документ додано в історію автомобіля.'});
      await loadDocuments();
    }catch(err){setMessage({kind:'err',text:errText(err)})}finally{setBusy(false)}
  };
  const deleteDocument=async(documentId:string)=>{
    setBusy(true);setMessage(null);
    try{
      await documentsApi.remove(vehicle.id,documentId);
      setMessage({kind:'ok',text:'Документ видалено.'});
      await loadDocuments();
    }catch(err){setMessage({kind:'err',text:errText(err)})}finally{setBusy(false)}
  };
  return <>
   {message&&<div className={message.kind==='ok'?'ok-note':'auth-error'}>{message.text}</div>}
   <form className="panel form-card" onSubmit={createDocument}>
    <h2>ДОДАТИ ДОКУМЕНТ</h2>
    <div className="form-grid">
     <Field label="Тип"><select value={form.type} onChange={e=>setForm({...form,type:e.target.value})}>{DOCUMENT_TYPES.map(type=><option key={type.value} value={type.value}>{type.label}</option>)}</select></Field>
     <Field label="Назва"><input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} maxLength={180} placeholder="Поліс OC / рахунок за ТО" required/></Field>
     <Field label="Номер"><input value={form.documentNumber} onChange={e=>setForm({...form,documentNumber:e.target.value})} maxLength={160} placeholder="номер документа"/></Field>
     <Field label="Ким видано"><input value={form.issuerName} onChange={e=>setForm({...form,issuerName:e.target.value})} maxLength={180} placeholder="страхова / сервіс"/></Field>
     <Field label="Дата видачі"><input type="date" value={form.issuedAt} onChange={e=>setForm({...form,issuedAt:e.target.value})}/></Field>
     <Field label="Діє до"><input type="date" value={form.expiresAt} onChange={e=>setForm({...form,expiresAt:e.target.value})}/></Field>
     <Field label="Опис"><input value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="коротка нотатка"/></Field>
    </div>
    <button className="primary" type="submit" disabled={busy}>{busy?<Loader2 size={15} className="spin"/>:<Plus size={15}/>} ДОДАТИ ДОКУМЕНТ</button>
   </form>
   <div className="panel list-panel">
    <h2>ДОКУМЕНТИ</h2>
    {documents===null?<Spinner/>
     :documents.length
      ?<table className="data-table"><thead><tr><th>Тип</th><th>Документ</th><th>Номер</th><th>Строк</th><th>Статус</th><th></th></tr></thead><tbody>
       {documents.map(doc=><tr key={doc.id}><td>{formatDocumentType(doc.type)}</td><td><b>{doc.title}</b>{doc.issuerName&&<small className="sub">{doc.issuerName}</small>}</td><td>{doc.documentNumber??'—'}</td><td>{doc.expiresAt?fmtDate(doc.expiresAt):'—'}</td><td><span className={'tag '+documentStatusColor(doc)}>{doc.processingStatus}</span></td><td><button className="ghost-btn danger" onClick={()=>void deleteDocument(doc.id)} disabled={busy}><Trash2 size={14}/> Видалити</button></td></tr>)}
      </tbody></table>
      :<EmptyState icon={FileText} title="Документів поки немає" text="Додайте поліс, техогляд, рахунок за сервіс або інший документ вручну. Завантаження файлів підключається через той самий backend-модуль окремо."/>}
   </div>
  </>;
}

function VehicleRouter(props: PageProps & { page: string }) {
  const { page } = props;
  if (page === "Гараж") return <GaragePage {...props} />;
  if (page === "Профіль авто") return <ProfilePage {...props} />;
  if (page === "Пробіг") return <MileagePage {...props} />;
  if (page === "Сервіс і ТО") return <ServicePage {...props} />;
  if (page === "Документи") return <DocumentsPage {...props} />;
  return null;
}

function formatDocumentType(value:string):string{
  return DOCUMENT_TYPES.find(type=>type.value===value)?.label??value;
}

function documentStatusColor(doc:VehicleDocument):string{
  if(doc.processingStatus==="completed")return "green";
  if(doc.processingStatus==="failed")return "red";
  if(doc.processingStatus==="processing"||doc.processingStatus==="pending")return "purple";
  return "";
}

function slugifyRuleKey(value:string):string{
  const slug=value.trim().toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"");
  return slug||"maintenance_rule";
}

export { GaragePage, ProfilePage, MileagePage, ServicePage, DocumentsPage, VehicleRouter as VehiclePages };
