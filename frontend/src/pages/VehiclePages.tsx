import { t, enumLabel } from "../i18n";
import { useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, Check, CircleHelp, ClipboardList, FileText, Gauge, Loader2, Pencil, Plus, RefreshCw, Search, Trash2, Wrench, X } from "lucide-react";
import { documentsApi, fmtDate, fmtMoney, fmtNumber, garageApi, maintenanceApi, mileageApi, profileApi, vinApi, type VehicleDocument } from "../api";
import { AddVehicleForm } from "../components/AddVehicleForm";
import { EmptyState, Field, NoVehicle, Spinner } from "../components/CommonComponents";
import { URGENCY_META } from "../constants/dashboard";
import type { PageProps } from "../types/dashboard";
import type { VinDecode } from "../api";
import { serviceProgress } from "../utils/calculations";
import { errText, intervalLines, reminderDetail, urgencyScore, vehicleLine, vehicleTitle } from "../utils/formatters";
import { ServiceEntry } from "../components/ServiceEntry";
import { ReminderPreferenceFields, defaultReminderPreferences } from "../components/ReminderPreferenceFields";
import type { MaintenanceRule } from "../api";

function GaragePage(props: PageProps) {
  const {vehicles,vehicle,selectVehicle,loadVehicles,vehiclesLoading,vehiclesError,navigate,data}=props;
  const [showArchived,setShowArchived]=useState(false);
  const visible=vehicles.filter(v=>showArchived||!v.isArchived);
  return <>
   {vehiclesLoading&&<Spinner/>}
   {vehiclesError&&<div className="auth-error">{vehiclesError}</div>}
   <div className="page-actions">
    <label className="toggle-line"><input type="checkbox" checked={showArchived} onChange={e=>setShowArchived(e.target.checked)}/> {t("Показати архівні")}</label>
   </div>
   <div className="vehicles-grid">
    {visible.map(v=><div key={v.id} className={'vehicle-card'+(vehicle?.id===v.id?' selected':'')}>
      <img src="/car.webp" alt=""/>
      <div className="vehicle-card-body">
       <b>{vehicleTitle(v)}{v.isArchived&&<span className="badge">{t("АРХІВ")}</span>}</b>
       <small>{vehicleLine(v,v.id===vehicle?.id?data.latest:null)}</small>
       {v.vin&&<small className="vin">VIN {v.vin}</small>}
      </div>
      <div className="vehicle-card-actions">
       {vehicle?.id!==v.id&&<button className="primary" onClick={()=>{selectVehicle(v.id);navigate('Головна','chime')}}>{t("ВИБРАТИ")}</button>}
       {vehicle?.id===v.id&&<span className="tag green">{t("Поточний")}</span>}
       {v.isArchived
        ?<button className="ghost-btn" onClick={async()=>{await garageApi.restore(v.id);await loadVehicles()}}>{t("Повернути")}</button>
        :<button className="ghost-btn" onClick={async()=>{await garageApi.archive(v.id);await loadVehicles()}}>{t("В архів")}</button>}
      </div>
     </div>)}
    {!visible.length&&!vehiclesLoading&&<div className="state-note">{t("Гараж порожній.")}</div>}
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
    if(!vehicle.vin){setMessage({kind:'err',text:t("В автомобіля не вказано VIN — спочатку додайте його в гаражі.")});return}
    setBusy(true);setMessage(null);
    try{
      const decoded=await vinApi.decode(vehicle.id);
      const hasProfileData=Boolean(decoded.engineCode||decoded.engineFamily||decoded.displacementCc||decoded.fuelType||decoded.powerKw||decoded.powerHp||decoded.transmissionType||decoded.driveType);
      setMessage({kind:'ok',text:hasProfileData?t("VIN розшифровано — профіль і картку оновлено."):t("VIN розшифровано — картку оновлено, але провайдер не повернув технічні дані для профілю.")});
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
      setMessage({kind:'ok',text:t("Підтверджені дані збережено — тепер вони мають вищий пріоритет, ніж відповідь VIN-провайдера.")});
      await afterMutate();
    }catch(err){setMessage({kind:'err',text:errText(err)})}finally{setSavingProfile(false)}
  };
  const rows:[string,string][]=profile?[
    [t("Двигун"),[profile.engineFamily,profile.engineCode].filter(Boolean).join(' ')||'—'],
    [t("Об’єм"),profile.displacementCc?t("{0} см³", { 0: fmtNumber(profile.displacementCc) }):'—'],
    [t("Пальне"),formatFuel(profile.fuelType)],
    [t("Наддув"),formatAspiration(profile.aspirationType)],
    [t("Потужність"),profile.powerHp?t("{0} к.с. ({1} кВт)", { 0: fmtNumber(profile.powerHp), 1: fmtNumber(profile.powerKw) }):'—'],
    [t("Коробка"),[formatTransmission(profile.transmissionType),profile.transmissionCode].filter(v=>v&&v!=='—').join(' ')||'—'],
    [t("Привід"),formatDrive(profile.driveType)],
    [t("Кузов"),formatBody(profile.bodyType)],
    [t("Дверей"),profile.doorCount!=null?String(profile.doorCount):'—'],
    [t("Місць"),profile.seatCount!=null?String(profile.seatCount):'—'],
    [t("Комплектація"),profile.trimLevel??'—'],
    [t("Колір"),profile.exteriorColor??'—'],
    [t("Бак"),profile.fuelTankCapacityLiters?t("{0} л", { 0: profile.fuelTankCapacityLiters }):'—'],
    [t("Батарея"),profile.batteryUsableCapacityKwh?t("{0} кВт⋅год (повна {1})", { 0: profile.batteryUsableCapacityKwh, 1: profile.batteryGrossCapacityKwh??'—' }):'—'],
    [t("Версія профілю"),`v${profile.version} · ${formatProfileSource(profile.source)}`],
    [t("Підтверджено"),fmtDate(profile.confirmedAt)],
  ]:[
    [t("Марка"),vehicle.make??'—'],[t("Рік"),vehicle.modelYear??'—'],['VIN',vehicle.vin??'—'],
    [t("Держномер"),vehicle.licensePlate??'—'],[t("Країна"),vehicle.country],
  ];
  return <>
   <div className="page-actions">
    <button className="primary" onClick={()=>void decode()} disabled={busy}>{busy?<Loader2 size={15} className="spin"/>:<Search size={15}/>} {busy?t("РОЗШИФРОВУЄМО VIN..."):t("РОЗШИФРУВАТИ VIN")}</button>
   </div>
   {message&&<div className={message.kind==='ok'?'ok-note':'auth-error'}>{message.text}</div>}
   {profile
    ?<div className="panel spec-panel"><h2>{t("ТЕХНІЧНИЙ ПРОФІЛЬ")}</h2><div className="spec-grid">{rows.map(([k,v])=><div key={k}><span>{k}</span><b>{v}</b></div>)}</div></div>
    :<EmptyState icon={ClipboardList} title={t("Профіль ще не заповнено")} text={t("Натисніть «Розшифрувати VIN» — дані підтягнуться з Vehicle Databases і збережуться в профілі автомобіля.")}/>}
   <form className="panel profile-correction-panel" onSubmit={saveCorrection}>
    <div className="panel-heading"><h2>{t("ПІДТВЕРДЖЕНІ ДАНІ ВЛАСНИКА")}</h2><span className="tag green">{t("вище VIN-провайдера")}</span></div>
    <div className="correction-grid">
     <Field label={t("Пальне")}><select value={correction.fuelType} onChange={e=>setCorrection({...correction,fuelType:e.target.value})}>
      <option value="">{t("Не вказано")}</option><option value="petrol">{t("Бензин")}</option><option value="diesel">{t("Дизель")}</option><option value="lpg">LPG</option><option value="cng">CNG</option><option value="hybrid">{t("Гібрид")}</option><option value="phev">PHEV</option><option value="electric">{t("Електро")}</option>
     </select></Field>
     <Field label={t("Кузов")}><select value={correction.bodyType} onChange={e=>setCorrection({...correction,bodyType:e.target.value})}>
      <option value="">{t("Не вказано")}</option><option value="hatchback">{t("Хетчбек")}</option><option value="sedan">{t("Седан")}</option><option value="wagon">{t("Універсал")}</option><option value="coupe">{t("Купе")}</option><option value="suv">SUV</option><option value="mpv">MPV</option><option value="van">{t("Фургон")}</option><option value="pickup">{t("Пікап")}</option><option value="convertible">{t("Кабріолет")}</option><option value="other">{t("Інше")}</option>
     </select></Field>
     <Field label={t("Дверей")}><input value={correction.doorCount} onChange={e=>setCorrection({...correction,doorCount:e.target.value.replace(/[^\d]/g,'')})} placeholder="3" inputMode="numeric"/></Field>
     <Field label={t("Місць")}><input value={correction.seatCount} onChange={e=>setCorrection({...correction,seatCount:e.target.value.replace(/[^\d]/g,'')})} placeholder="5" inputMode="numeric"/></Field>
     <Field label={t("Комплектація")}><input value={correction.trimLevel} onChange={e=>setCorrection({...correction,trimLevel:e.target.value})} placeholder="GOAL"/></Field>
     <Field label={t("Колір")}><input value={correction.exteriorColor} onChange={e=>setCorrection({...correction,exteriorColor:e.target.value})} placeholder={t("наприклад, сріблястий")}/></Field>
    </div>
    <button className="ghost-btn save-profile-btn" type="submit" disabled={savingProfile}>{savingProfile?<Loader2 size={15} className="spin"/>:<Check size={15}/>} {t("ЗБЕРЕГТИ ПІДТВЕРДЖЕННЯ")}</button>
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
   <div className="panel-heading"><h2>{t("ПОВНЕ РОЗШИФРУВАННЯ VIN")}</h2></div>
   <div className="state-note">{t("Повне розшифрування з’явиться після успішного VIN decode.")}</div>
  </div>;
  const groups=groupDecodeFacts(facts);
  const hasColor=facts.some(f=>/color|colour|paint|цвет/i.test(f.label));
  const hasTrim=facts.some(f=>/trim|variant|version|grade|комплек/i.test(f.label));
  return <div className="panel decode-panel">
   <div className="decode-head">
    <div>
     <h2>{t("ПОВНЕ РОЗШИФРУВАННЯ VIN")}</h2>
     <p>{formatVinProvider(decode.provider)}{decode.decodedAt?` · ${fmtDate(decode.decodedAt,true)}`:''} · {facts.length} {t("полів")}</p>
    </div>
    {decode.vin&&<span className="decode-vin">{decode.vin}</span>}
   </div>
   {(!hasColor||!hasTrim)&&<div className="state-note">{t("Провайдер не повернув")} {[
    !hasTrim?t("комплектацію/trim"):null,
    !hasColor?t("колір/paint"):null,
   ].filter(Boolean).join(t(" і "))} {t("для цього VIN. Інші отримані поля збережено й показано нижче.")}</div>}
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
    {title:t("Ідентифікація"),facts:[]},
    {title:t("Кузов і комплектація"),facts:[]},
    {title:t("Двигун і трансмісія"),facts:[]},
    {title:t("Розміри, маса й колеса"),facts:[]},
    {title:t("Оснащення й безпека"),facts:[]},
    {title:t("Виробництво й документи"),facts:[]},
    {title:t("Інше"),facts:[]},
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
    "Vehicle ID":t("ID автомобіля"),
    "Make":t("Марка"),
    "Model":t("Модель"),
    "Model Year":t("Рік моделі"),
    "Product Type":t("Тип ТЗ"),
    "Body":t("Кузов"),
    "Series":t("Серія"),
    "Drive":t("Привід"),
    "Transmission":t("Коробка"),
    "Engine Manufacturer":t("Виробник двигуна"),
    "Engine Type":t("Тип двигуна"),
    "Emission Standard":t("Екостандарт"),
    "Average CO2 Emission":t("Середній CO2"),
    "Manufacturer":t("Виробник"),
    "Plant Country":t("Країна складання"),
    "Number of Wheels":t("Коліс"),
    "Number of Axles":t("Осей"),
    "Number of Doors":t("Дверей"),
    "Number of Seats":t("Місць"),
    "Rear Brakes":t("Задні гальма"),
    "Brake System":t("Гальмівна система"),
    "Suspension":t("Підвіска"),
    "Steering Type":t("Кермове управління"),
    "Wheel Size":t("Розмір коліс"),
    "Wheelbase":t("Колісна база"),
    "Height":t("Висота"),
    "Length":t("Довжина"),
    "Width":t("Ширина"),
    "Track Front":t("Передня колія"),
    "Track Rear":t("Задня колія"),
    "Max Speed":t("Макс. швидкість"),
    "Weight Empty":t("Споряджена маса"),
    "Max Weight":t("Макс. маса"),
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
  const map:Record<string,string>={petrol:t("бензин"),diesel:t("дизель"),lpg:'LPG',cng:'CNG',hybrid:t("гібрид"),phev:'plug-in hybrid',electric:t("електро"),hydrogen:t("водень")};
  return value?map[value]??value:'—';
}

function formatTransmission(value:string|null|undefined):string{
  const map:Record<string,string>={manual:t("МКПП"),automatic:t("АКПП"),dct:t("робот DCT"),cvt:t("варіатор"),other:t("інша")};
  return value?map[value]??value:'—';
}

function formatDrive(value:string|null|undefined):string{
  const map:Record<string,string>={fwd:t("передній"),rwd:t("задній"),awd:t("повний AWD"),'4wd':t("повний 4WD"),other:t("інший")};
  return value?map[value]??value:'—';
}

function formatBody(value:string|null|undefined):string{
  const map:Record<string,string>={hatchback:t("хетчбек"),sedan:t("седан"),wagon:t("універсал"),coupe:t("купе"),suv:'SUV',mpv:'MPV',van:t("фургон"),pickup:t("пікап"),convertible:t("кабріолет"),other:t("інший")};
  return value?map[value]??value:'—';
}

function formatAspiration(value:string|null|undefined):string{
  const map:Record<string,string>={turbo:t("турбо"),supercharged:t("компресор"),naturally_aspirated:t("атмосферний")};
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
  if(value==='manual-confirmed')return t("підтверджено власником");
  if(value==='manual')return t("ручний профіль");
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
    if(!Number.isFinite(km)||km<0){setMessage({kind:'err',text:t("Введіть коректний пробіг.")});return}
    setBusy(true);setMessage(null);
    try{
      await mileageApi.create(vehicle.id,{odometerKm:Math.round(km),source:'web',recordedAt:date?new Date(date).toISOString():undefined});
      setOdometer('');setDate('');
      setMessage({kind:'ok',text:t("Запис пробігу додано.")});
      await refresh();
    }catch(err){setMessage({kind:'err',text:errText(err)})}finally{setBusy(false)}
  };
  return <>
   <div className="panels-row">
    <form className="form-card" onSubmit={submit}>
     <h3><Gauge size={16}/> {t("Додати показання")}</h3>
     <div className="form-grid">
      <Field label={t("Одометр, км")}><input value={odometer} onChange={e=>setOdometer(e.target.value.replace(/[^\d]/g,''))} placeholder="120450" inputMode="numeric"/></Field>
      <Field label={t("Дата")}><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></Field>
     </div>
     {message&&<div className={message.kind==='ok'?'ok-note':'auth-error'}>{message.text}</div>}
     <button className="primary" type="submit" disabled={busy}>{busy?t("Зберігаємо..."):t("ДОДАТИ ЗАПИС")}</button>
    </form>
    <div className="panel stat-panel">
     <h2>{t("ОСТАННЄ ПОКАЗАННЯ")}</h2>
     <div className="metric-value">{data.latest?fmtNumber(data.latest.odometerKm):'—'} <span>{t("км")}</span></div>
     <p>{data.latest?t("{0} · джерело {1} · впевненість {2}%", { 0: fmtDate(data.latest.recordedAt,true), 1: data.latest.source, 2: Math.round(data.latest.confidence*100) }):t("Немає записів")}</p>
    </div>
   </div>
   {anomalies.length>0&&<div className="panel anomaly-panel">
    <h2><AlertTriangle size={14}/> {t("АНОМАЛІЇ ПРОБІГУ (")}{anomalies.length})</h2>
    {anomalies.map((a,i)=><div key={i} className={'anomaly '+a.severity}>
      <span className={'tag '+a.severity}>{a.type==='rollback'?t("Скручування пробігу"):t("Неправдоподібний стрибок")}</span>
      <div><b>{a.message}</b><small>{fmtDate(a.fromRecordedAt)} → {fmtDate(a.toRecordedAt)} · {fmtNumber(a.fromOdometerKm)} → {fmtNumber(a.toOdometerKm)} {t("км")}</small></div>
     </div>)}
   </div>}
   <div className="panel list-panel">
    <h2>{t("ІСТОРІЯ ПРОБІГУ")}</h2>
    {data.loading&&!data.mileageHistory.length?<Spinner/>
     :data.mileageHistory.length
      ?<table className="data-table"><thead><tr><th>{t("Дата")}</th><th>{t("Одометр")}</th><th>{t("Джерело")}</th><th>{t("Впевненість")}</th></tr></thead><tbody>
       {[...data.mileageHistory].reverse().map(r=><tr key={r.id}><td>{fmtDate(r.recordedAt,true)}</td><td><b>{fmtNumber(r.odometerKm)} {t("км")}</b></td><td>{enumLabel(r.source)}</td><td>{Math.round(r.confidence*100)}%</td></tr>)}
      </tbody></table>
      :<div className="state-note">{t("Записів поки немає.")}</div>}
   </div>
  </>;
}

function ServicePage(props: PageProps) {
  const {vehicle,data,afterMutate}=props;
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState<{kind:'ok'|'err';text:string}|null>(null);
  const [editing,setEditing]=useState<string>();
  const [telegramEnabled,setTelegramEnabled]=useState(true);
  const [notifyWhenDue,setNotifyWhenDue]=useState(true);
  const [preferences,setPreferences]=useState(defaultReminderPreferences);
  const [rule,setRule]=useState({
    key:"engine_oil",
    title:"",
    intervalKm:"",
    intervalMonths:"",
    warningKmBefore:"",
    warningDaysBefore:"",
  });
  useEffect(()=>{setEditing(undefined);setPreferences(defaultReminderPreferences());setMessage(null)},[vehicle?.id]);
  if(!vehicle)return <NoVehicle onGoGarage={()=>props.navigate('Гараж')}/>;
  const createRule=async(e:FormEvent)=>{
    e.preventDefault();
    setBusy(true);setMessage(null);
    try{
      const input={
        key:slugifyRuleKey(rule.key||rule.title),
        title:rule.title.trim(),
        source:"manual",
        intervalKm:numberOrUndefined(rule.intervalKm),
        intervalMonths:numberOrUndefined(rule.intervalMonths),
        warningKmBefore:numberOrUndefined(rule.warningKmBefore),
        warningDaysBefore:numberOrUndefined(rule.warningDaysBefore),
        completionEventType:`maintenance.${slugifyRuleKey(rule.key||rule.title)}.completed`,
        telegramEnabled,notifyWhenDue,reminderOffsets:preferences.offsets,remindAt:preferences.remindAt,timeZone:preferences.timeZone,
      };
      if(editing)await maintenanceApi.updateRule(vehicle.id,editing,input);else await maintenanceApi.createRule(vehicle.id,input);
      setMessage({kind:'ok',text:t("Регламент додано. Статуси ТО перераховано.")});
      await afterMutate();
    }catch(err){setMessage({kind:'err',text:errText(err)})}finally{setBusy(false)}
  };
  const deleteRule=async(ruleId:string)=>{
    setBusy(true);setMessage(null);
    try{
      await maintenanceApi.deleteRule(vehicle.id,ruleId);
      setMessage({kind:'ok',text:t("Правило регламенту вимкнено.")});
      await afterMutate();
    }catch(err){setMessage({kind:'err',text:errText(err)})}finally{setBusy(false)}
  };
  const editRule=(item:MaintenanceRule)=>{
    setEditing(item.id);setRule({key:item.key,title:item.title,intervalKm:String(item.intervalKm??''),intervalMonths:String(item.intervalMonths??''),warningKmBefore:String(item.warningKmBefore??''),warningDaysBefore:String(item.warningDaysBefore??'')});
    setTelegramEnabled(item.telegramEnabled??false);setNotifyWhenDue(item.notifyWhenDue??true);
    setPreferences({offsets:item.reminderOffsets??defaultReminderPreferences().offsets,remindAt:item.remindAt??'09:00',timeZone:item.timeZone??'Europe/Warsaw'});
    document.querySelector('.maintenance-rule-form')?.scrollIntoView({behavior:'smooth',block:'start'});
  };
  return <>
   {message&&<div className={message.kind==='ok'?'ok-note':'auth-error'}>{message.text}</div>}
   <ServiceEntry key={vehicle.id} vehicleId={vehicle.id} rules={data.maintenance} afterSave={afterMutate}/>
   <form className="form-card maintenance-rule-form" onSubmit={createRule}>
    <h2>{editing?t("Змінити регламент"):t("ДОДАТИ РЕГЛАМЕНТ")}</h2>
    <div className="form-grid">
     <Field label={t("Ключ")}><input disabled={!!editing||busy} value={rule.key} onChange={e=>setRule({...rule,key:e.target.value})} placeholder="engine_oil"/></Field>
     <Field label={t("Робота")}><input value={rule.title} onChange={e=>setRule({...rule,title:e.target.value})} placeholder={t("Заміна оливи")} required/></Field>
     <Field label={t("Інтервал, км")}><input value={rule.intervalKm} onChange={e=>setRule({...rule,intervalKm:e.target.value.replace(/[^\d]/g,'')})} inputMode="numeric" placeholder="10000"/></Field>
     <Field label={t("Інтервал, міс.")}><input value={rule.intervalMonths} onChange={e=>setRule({...rule,intervalMonths:e.target.value.replace(/[^\d]/g,'')})} inputMode="numeric" placeholder="12"/></Field>
     <Field label={t("Попередити за, км")}><input value={rule.warningKmBefore} onChange={e=>setRule({...rule,warningKmBefore:e.target.value.replace(/[^\d]/g,'')})} inputMode="numeric" placeholder="1000"/></Field>
     <Field label={t("Попередити за, днів")}><input value={rule.warningDaysBefore} onChange={e=>setRule({...rule,warningDaysBefore:e.target.value.replace(/[^\d]/g,'')})} inputMode="numeric" placeholder="30"/></Field>
    </div>
    <label className="toggle-line"><input type="checkbox" disabled={busy} checked={telegramEnabled} onChange={e=>setTelegramEnabled(e.target.checked)}/>{t("Сповіщення в Telegram")}</label>
    {telegramEnabled&&<><ReminderPreferenceFields value={preferences} onChange={setPreferences} disabled={busy}/><label className="toggle-line"><input type="checkbox" disabled={busy} checked={notifyWhenDue} onChange={e=>setNotifyWhenDue(e.target.checked)}/>{t("Сповістити при досягненні строку або пробігу")}</label></>}
    <div className="page-actions"><button className="primary" type="submit" disabled={busy}>{busy?<Loader2 size={15} className="spin"/>:<Plus size={15}/>} {editing?t("ЗБЕРЕГТИ ЗМІНИ"):t("ДОДАТИ РЕГЛАМЕНТ")}</button>
    {editing&&<button type="button" className="ghost-btn" disabled={busy} onClick={()=>{setEditing(undefined);setRule({key:'engine_oil',title:'',intervalKm:'',intervalMonths:'',warningKmBefore:'',warningDaysBefore:''})}}><X size={16}/>{t("Скасувати")}</button>}</div>
   </form>
   <div className="panel list-panel">
    <h2>{t("СТАТУС ОБСЛУГОВУВАННЯ")}</h2>
    {data.loading&&!data.maintenance.length?<Spinner/>
     :data.maintenance.length
      ?<div className="status-list">{data.maintenance.map(s=><div key={s.rule.id} className="status-row">
        <span className={'tag '+URGENCY_META[s.urgency].color}>{t(URGENCY_META[s.urgency].tag)}</span>
       <div className="status-copy"><b>{s.rule.title}</b><small>{reminderDetail(s)}{s.lastCompletedAt?t(" · попереднє ТО {0}", { 0: fmtDate(s.lastCompletedAt) }):t(" · ще не виконувалося")}</small>{s.rule.telegramEnabled&&<small>{t("Сповіщення в Telegram")}{s.rule.intervalKm&&s.lastCompletedMileageKm===null?' · '+t("Невідомий пробіг під час заміни"):''}</small>}</div>
        <div className="status-nums">{s.rule.intervalKm?t("інтервал {0} км", { 0: fmtNumber(s.rule.intervalKm) }):''}{s.rule.intervalMonths?t(" · {0} міс.", { 0: s.rule.intervalMonths }):''}</div>
       </div>)}</div>
      :<div className="state-note"><Wrench size={15}/> {t("Правила ТО не налаштовані. Додайте перший регламент вище.")}</div>}
   </div>
   <div className="panel list-panel">
    <h2>{t("ПРАВИЛА РЕГЛАМЕНТУ")}</h2>
    {data.maintenance.length
     ?<table className="data-table"><thead><tr><th>{t("Робота")}</th><th>{t("Ключ")}</th><th>{t("Інтервал")}</th><th>{t("Попередження")}</th><th></th></tr></thead><tbody>
      {data.maintenance.map(s=><tr key={s.rule.id}><td><b>{s.rule.title}</b><small className="sub">{enumLabel(s.rule.source??'manual')}</small></td><td className="mono">{s.rule.key}</td><td>{[s.rule.intervalKm?t("{0} км", { 0: fmtNumber(s.rule.intervalKm) }):null,s.rule.intervalMonths?t("{0} міс.", { 0: s.rule.intervalMonths }):null].filter(Boolean).join(' / ')||'—'}</td><td>{[s.rule.warningKmBefore?t("{0} км", { 0: fmtNumber(s.rule.warningKmBefore) }):null,s.rule.warningDaysBefore?t("{0} дн.", { 0: s.rule.warningDaysBefore }):null].filter(Boolean).join(' / ')||'—'}</td><td><button className="ghost-btn" title={t("Змінити регламент")} aria-label={t("Змінити регламент")} onClick={()=>editRule(s.rule)} disabled={busy}><Pencil size={16}/></button><button className="ghost-btn danger" onClick={()=>void deleteRule(s.rule.id)} disabled={busy}><Trash2 size={14}/> {t("Видалити")}</button></td></tr>)}
     </tbody></table>
     :<div className="state-note">{t("Правил поки немає.")}</div>}
   </div>
   <div className="panel list-panel">
    <h2>{t("СЕРВІСНІ ЗАПИСИ")}</h2>
    {data.services.length
     ?<table className="data-table"><thead><tr><th>{t("Дата")}</th><th>{t("Робота")}</th><th>{t("Тип")}</th><th>{t("Пробіг")}</th><th>{t("Вартість")}</th></tr></thead><tbody>
       {data.services.map(r=><tr key={r.id}><td>{fmtDate(r.occurredAt)}</td><td><b>{r.title}</b>{r.providerName&&<small className="sub">{r.providerName}</small>}</td><td>{enumLabel(r.type)}</td><td>{r.odometerKm!==null?t("{0} км", { 0: fmtNumber(r.odometerKm) }):'—'}</td><td>{fmtMoney(r.totalCost,r.currency)}</td></tr>)}
      </tbody></table>
     :<div className="state-note">{t("Сервісних записів поки немає.")}</div>}
   </div>
  </>;
}

const DOCUMENT_TYPES=[
  {value:"insurance",label:"Страхування"},
  {value:"registration",label:"Реєстрація"},
  {value:"inspection",label:"Техогляд"},
  {value:"service-invoice",label:"Сервісний рахунок"},
  {value:"purchase",label:"Купівля"},
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
  const [notifyExpiry,setNotifyExpiry]=useState(false);
  const [preferences,setPreferences]=useState(defaultReminderPreferences);
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
        reminder:notifyExpiry?preferences:undefined,
      });
      setForm({...form,title:"",documentNumber:"",issuerName:"",issuedAt:"",expiresAt:"",description:""});
      setMessage({kind:'ok',text:t("Документ додано в історію автомобіля.")});
      await loadDocuments();
    }catch(err){setMessage({kind:'err',text:errText(err)})}finally{setBusy(false)}
  };
  const deleteDocument=async(documentId:string)=>{
    setBusy(true);setMessage(null);
    try{
      await documentsApi.remove(vehicle.id,documentId);
      setMessage({kind:'ok',text:t("Документ видалено.")});
      await loadDocuments();
    }catch(err){setMessage({kind:'err',text:errText(err)})}finally{setBusy(false)}
  };
  return <>
   {message&&<div className={message.kind==='ok'?'ok-note':'auth-error'}>{message.text}</div>}
   <form className="panel form-card" onSubmit={createDocument}>
    <h2>{t("ДОДАТИ ДОКУМЕНТ")}</h2>
    <div className="form-grid">
     <Field label={t("Тип")}><select value={form.type} onChange={e=>setForm({...form,type:e.target.value})}>{DOCUMENT_TYPES.map(type=><option key={type.value} value={type.value}>{t(type.label)}</option>)}</select></Field>
     <Field label={t("Назва")}><input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} maxLength={180} placeholder={t("Поліс OC / рахунок за ТО")} required/></Field>
     <Field label={t("Номер")}><input value={form.documentNumber} onChange={e=>setForm({...form,documentNumber:e.target.value})} maxLength={160} placeholder={t("номер документа")}/></Field>
     <Field label={t("Ким видано")}><input value={form.issuerName} onChange={e=>setForm({...form,issuerName:e.target.value})} maxLength={180} placeholder={t("страхова / сервіс")}/></Field>
     <Field label={t("Дата видачі")}><input type="date" value={form.issuedAt} onChange={e=>setForm({...form,issuedAt:e.target.value})}/></Field>
     <Field label={t("Діє до")}><input type="date" required={notifyExpiry} value={form.expiresAt} onChange={e=>setForm({...form,expiresAt:e.target.value})}/></Field>
     <Field label={t("Опис")}><input value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder={t("коротка нотатка")}/></Field>
    </div>
    <label className="toggle-line"><input type="checkbox" disabled={busy} checked={notifyExpiry} onChange={e=>setNotifyExpiry(e.target.checked)}/>{t("Нагадати про закінчення дії в Telegram")}</label>
    {notifyExpiry&&<ReminderPreferenceFields value={preferences} onChange={setPreferences} disabled={busy}/>}
    <button className="primary" type="submit" disabled={busy}>{busy?<Loader2 size={15} className="spin"/>:<Plus size={15}/>} {t("ДОДАТИ ДОКУМЕНТ")}</button>
   </form>
   <div className="panel list-panel">
    <h2>{t("ДОКУМЕНТИ")}</h2>
    {documents===null?<Spinner/>
     :documents.length
      ?<table className="data-table"><thead><tr><th>{t("Тип")}</th><th>{t("Документ")}</th><th>{t("Номер")}</th><th>{t("Строк")}</th><th>{t("Статус")}</th><th></th></tr></thead><tbody>
       {documents.map(doc=><tr key={doc.id}><td>{formatDocumentType(doc.type)}</td><td><b>{doc.title}</b>{doc.issuerName&&<small className="sub">{doc.issuerName}</small>}</td><td>{doc.documentNumber??'—'}</td><td>{doc.expiresAt?fmtDate(doc.expiresAt):'—'}</td><td><span className={'tag '+documentStatusColor(doc)}>{enumLabel(doc.processingStatus)}</span></td><td><button className="ghost-btn danger" onClick={()=>void deleteDocument(doc.id)} disabled={busy}><Trash2 size={14}/> {t("Видалити")}</button></td></tr>)}
      </tbody></table>
      :<EmptyState icon={FileText} title={t("Документів поки немає")} text={t("Додайте поліс, техогляд, рахунок за сервіс або інший документ вручну. Завантаження файлів підключається через той самий backend-модуль окремо.")}/>}
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
  return t(DOCUMENT_TYPES.find(type=>type.value===value)?.label??value);
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
