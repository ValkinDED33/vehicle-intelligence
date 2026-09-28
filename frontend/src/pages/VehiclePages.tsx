import { useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, Check, CircleHelp, ClipboardList, Gauge, Loader2, Plus, RefreshCw, Search, Wrench } from "lucide-react";
import { fmtDate, fmtMoney, fmtNumber, garageApi, mileageApi, profileApi, vinApi } from "../api";
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
    <label className="toggle-line"><input type="checkbox" checked={showArchived} onChange={e=>setShowArchived(e.target.checked)}/> Показать архивные</label>
   </div>
   <div className="vehicles-grid">
    {visible.map(v=><div key={v.id} className={'vehicle-card'+(vehicle?.id===v.id?' selected':'')}>
      <img src="/car.webp" alt=""/>
      <div className="vehicle-card-body">
       <b>{vehicleTitle(v)}{v.isArchived&&<span className="badge">АРХИВ</span>}</b>
       <small>{vehicleLine(v,v.id===vehicle?.id?data.latest:null)}</small>
       {v.vin&&<small className="vin">VIN {v.vin}</small>}
      </div>
      <div className="vehicle-card-actions">
       {vehicle?.id!==v.id&&<button className="primary" onClick={()=>{selectVehicle(v.id);navigate('Главная','chime')}}>ВЫБРАТЬ</button>}
       {vehicle?.id===v.id&&<span className="tag green">Текущий</span>}
       {v.isArchived
        ?<button className="ghost-btn" onClick={async()=>{await garageApi.restore(v.id);await loadVehicles()}}>Вернуть</button>
        :<button className="ghost-btn" onClick={async()=>{await garageApi.archive(v.id);await loadVehicles()}}>В архив</button>}
      </div>
     </div>)}
    {!visible.length&&!vehiclesLoading&&<div className="state-note">Гараж пуст.</div>}
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
    if(!vehicle.vin){setMessage({kind:'err',text:'У автомобиля не указан VIN — сначала добавьте его в гараже.'});return}
    setBusy(true);setMessage(null);
    try{
      const decoded=await vinApi.decode(vehicle.id);
      const hasProfileData=Boolean(decoded.engineCode||decoded.engineFamily||decoded.displacementCc||decoded.fuelType||decoded.powerKw||decoded.powerHp||decoded.transmissionType||decoded.driveType);
      setMessage({kind:'ok',text:hasProfileData?'VIN расшифрован — профиль и карточка обновлены.':'VIN расшифрован — карточка обновлена, но провайдер не вернул технические данные для профиля.'});
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
      setMessage({kind:'ok',text:'Подтверждённые данные сохранены — теперь они выше приоритета, чем ответ VIN-провайдера.'});
      await afterMutate();
    }catch(err){setMessage({kind:'err',text:errText(err)})}finally{setSavingProfile(false)}
  };
  const rows:[string,string][]=profile?[
    ['Двигатель',[profile.engineFamily,profile.engineCode].filter(Boolean).join(' ')||'—'],
    ['Объём',profile.displacementCc?`${fmtNumber(profile.displacementCc)} см³`:'—'],
    ['Топливо',formatFuel(profile.fuelType)],
    ['Наддув',formatAspiration(profile.aspirationType)],
    ['Мощность',profile.powerHp?`${fmtNumber(profile.powerHp)} л.с. (${fmtNumber(profile.powerKw)} кВт)`:'—'],
    ['Коробка',[formatTransmission(profile.transmissionType),profile.transmissionCode].filter(v=>v&&v!=='—').join(' ')||'—'],
    ['Привод',formatDrive(profile.driveType)],
    ['Кузов',formatBody(profile.bodyType)],
    ['Дверей',profile.doorCount!=null?String(profile.doorCount):'—'],
    ['Мест',profile.seatCount!=null?String(profile.seatCount):'—'],
    ['Комплектация',profile.trimLevel??'—'],
    ['Цвет',profile.exteriorColor??'—'],
    ['Бак',profile.fuelTankCapacityLiters?`${profile.fuelTankCapacityLiters} л`:'—'],
    ['Батарея',profile.batteryUsableCapacityKwh?`${profile.batteryUsableCapacityKwh} кВт⋅ч (полная ${profile.batteryGrossCapacityKwh??'—'})`:'—'],
    ['Версия профиля',`v${profile.version} · ${formatProfileSource(profile.source)}`],
    ['Подтверждён',fmtDate(profile.confirmedAt)],
  ]:[
    ['Марка',vehicle.make??'—'],['Год',vehicle.modelYear??'—'],['VIN',vehicle.vin??'—'],
    ['Госномер',vehicle.licensePlate??'—'],['Страна',vehicle.country],
  ];
  return <>
   <div className="page-actions">
    <button className="primary" onClick={()=>void decode()} disabled={busy}>{busy?<Loader2 size={15} className="spin"/>:<Search size={15}/>} {busy?'ДЕКОДИРУЕМ VIN...':'РАСШИФРОВАТЬ VIN'}</button>
   </div>
   {message&&<div className={message.kind==='ok'?'ok-note':'auth-error'}>{message.text}</div>}
   {profile
    ?<div className="panel spec-panel"><h2>ТЕХНИЧЕСКИЙ ПРОФИЛЬ</h2><div className="spec-grid">{rows.map(([k,v])=><div key={k}><span>{k}</span><b>{v}</b></div>)}</div></div>
    :<EmptyState icon={ClipboardList} title="Профиль ещё не заполнен" text="Нажмите «Расшифровать VIN» — данные подтянутся из Vehicle Databases и сохранятся в профиле автомобиля."/>}
   <form className="panel profile-correction-panel" onSubmit={saveCorrection}>
    <div className="panel-heading"><h2>ПОДТВЕРЖДЁННЫЕ ДАННЫЕ ВЛАДЕЛЬЦА</h2><span className="tag green">выше VIN-провайдера</span></div>
    <div className="correction-grid">
     <Field label="Топливо"><select value={correction.fuelType} onChange={e=>setCorrection({...correction,fuelType:e.target.value})}>
      <option value="">Не указано</option><option value="petrol">Бензин</option><option value="diesel">Дизель</option><option value="lpg">LPG</option><option value="cng">CNG</option><option value="hybrid">Гибрид</option><option value="phev">PHEV</option><option value="electric">Электро</option>
     </select></Field>
     <Field label="Кузов"><select value={correction.bodyType} onChange={e=>setCorrection({...correction,bodyType:e.target.value})}>
      <option value="">Не указано</option><option value="hatchback">Хэтчбек</option><option value="sedan">Седан</option><option value="wagon">Универсал</option><option value="coupe">Купе</option><option value="suv">SUV</option><option value="mpv">MPV</option><option value="van">Фургон</option><option value="pickup">Пикап</option><option value="convertible">Кабриолет</option><option value="other">Другое</option>
     </select></Field>
     <Field label="Дверей"><input value={correction.doorCount} onChange={e=>setCorrection({...correction,doorCount:e.target.value.replace(/[^\d]/g,'')})} placeholder="3" inputMode="numeric"/></Field>
     <Field label="Мест"><input value={correction.seatCount} onChange={e=>setCorrection({...correction,seatCount:e.target.value.replace(/[^\d]/g,'')})} placeholder="5" inputMode="numeric"/></Field>
     <Field label="Комплектация"><input value={correction.trimLevel} onChange={e=>setCorrection({...correction,trimLevel:e.target.value})} placeholder="GOAL"/></Field>
     <Field label="Цвет"><input value={correction.exteriorColor} onChange={e=>setCorrection({...correction,exteriorColor:e.target.value})} placeholder="например, серебристый"/></Field>
    </div>
    <button className="ghost-btn save-profile-btn" type="submit" disabled={savingProfile}>{savingProfile?<Loader2 size={15} className="spin"/>:<Check size={15}/>} СОХРАНИТЬ ПОДТВЕРЖДЕНИЕ</button>
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
   <div className="panel-heading"><h2>ПОЛНАЯ РАСШИФРОВКА VIN</h2></div>
   <div className="state-note">Полная расшифровка появится после успешного VIN decode.</div>
  </div>;
  const groups=groupDecodeFacts(facts);
  const hasColor=facts.some(f=>/color|colour|paint|цвет/i.test(f.label));
  const hasTrim=facts.some(f=>/trim|variant|version|grade|комплек/i.test(f.label));
  return <div className="panel decode-panel">
   <div className="decode-head">
    <div>
     <h2>ПОЛНАЯ РАСШИФРОВКА VIN</h2>
     <p>{formatVinProvider(decode.provider)}{decode.decodedAt?` · ${fmtDate(decode.decodedAt,true)}`:''} · {facts.length} полей</p>
    </div>
    {decode.vin&&<span className="decode-vin">{decode.vin}</span>}
   </div>
   {(!hasColor||!hasTrim)&&<div className="state-note">Провайдер не вернул {[
    !hasTrim?'комплектацию/trim':null,
    !hasColor?'цвет/paint':null,
   ].filter(Boolean).join(' и ')} для этого VIN. Остальные полученные поля сохранены и показаны ниже.</div>}
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
    {title:"Идентификация",facts:[]},
    {title:"Кузов и комплектация",facts:[]},
    {title:"Двигатель и трансмиссия",facts:[]},
    {title:"Размеры, масса и колёса",facts:[]},
    {title:"Оснащение и безопасность",facts:[]},
    {title:"Производство и документы",facts:[]},
    {title:"Прочее",facts:[]},
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
    "Vehicle ID":"ID автомобиля",
    "Make":"Марка",
    "Model":"Модель",
    "Model Year":"Год модели",
    "Product Type":"Тип ТС",
    "Body":"Кузов",
    "Series":"Серия",
    "Drive":"Привод",
    "Transmission":"Коробка",
    "Engine Manufacturer":"Производитель двигателя",
    "Engine Type":"Тип двигателя",
    "Emission Standard":"Экостандарт",
    "Average CO2 Emission":"Средний CO2",
    "Manufacturer":"Производитель",
    "Plant Country":"Страна сборки",
    "Number of Wheels":"Колёс",
    "Number of Axles":"Осей",
    "Number of Doors":"Дверей",
    "Number of Seats":"Мест",
    "Rear Brakes":"Задние тормоза",
    "Brake System":"Тормозная система",
    "Suspension":"Подвеска",
    "Steering Type":"Рулевое управление",
    "Wheel Size":"Размер колёс",
    "Wheelbase":"Колёсная база",
    "Height":"Высота",
    "Length":"Длина",
    "Width":"Ширина",
    "Track Front":"Колея передняя",
    "Track Rear":"Колея задняя",
    "Max Speed":"Макс. скорость",
    "Weight Empty":"Снаряженная масса",
    "Max Weight":"Макс. масса",
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
  const map:Record<string,string>={petrol:'бензин',diesel:'дизель',lpg:'LPG',cng:'CNG',hybrid:'гибрид',phev:'plug-in hybrid',electric:'электро',hydrogen:'водород'};
  return value?map[value]??value:'—';
}

function formatTransmission(value:string|null|undefined):string{
  const map:Record<string,string>={manual:'МКПП',automatic:'АКПП',dct:'робот DCT',cvt:'вариатор',other:'другая'};
  return value?map[value]??value:'—';
}

function formatDrive(value:string|null|undefined):string{
  const map:Record<string,string>={fwd:'передний',rwd:'задний',awd:'полный AWD','4wd':'полный 4WD',other:'другой'};
  return value?map[value]??value:'—';
}

function formatBody(value:string|null|undefined):string{
  const map:Record<string,string>={hatchback:'хэтчбек',sedan:'седан',wagon:'универсал',coupe:'купе',suv:'SUV',mpv:'MPV',van:'фургон',pickup:'пикап',convertible:'кабриолет',other:'другой'};
  return value?map[value]??value:'—';
}

function formatAspiration(value:string|null|undefined):string{
  const map:Record<string,string>={turbo:'турбо',supercharged:'компрессор',naturally_aspirated:'атмосферный'};
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
  if(value==='manual-confirmed')return 'подтверждено владельцем';
  if(value==='manual')return 'ручной профиль';
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
    if(!Number.isFinite(km)||km<0){setMessage({kind:'err',text:'Введите корректный пробег.'});return}
    setBusy(true);setMessage(null);
    try{
      await mileageApi.create(vehicle.id,{odometerKm:Math.round(km),source:'web',recordedAt:date?new Date(date).toISOString():undefined});
      setOdometer('');setDate('');
      setMessage({kind:'ok',text:'Запись пробега добавлена.'});
      await refresh();
    }catch(err){setMessage({kind:'err',text:errText(err)})}finally{setBusy(false)}
  };
  return <>
   <div className="panels-row">
    <form className="form-card" onSubmit={submit}>
     <h3><Gauge size={16}/> Добавить показание</h3>
     <div className="form-grid">
      <Field label="Одометр, км"><input value={odometer} onChange={e=>setOdometer(e.target.value.replace(/[^\d]/g,''))} placeholder="120450" inputMode="numeric"/></Field>
      <Field label="Дата"><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></Field>
     </div>
     {message&&<div className={message.kind==='ok'?'ok-note':'auth-error'}>{message.text}</div>}
     <button className="primary" type="submit" disabled={busy}>{busy?'Сохраняем...':'ДОБАВИТЬ ЗАПИСЬ'}</button>
    </form>
    <div className="panel stat-panel">
     <h2>ПОСЛЕДНЕЕ ПОКАЗАНИЕ</h2>
     <div className="metric-value">{data.latest?fmtNumber(data.latest.odometerKm):'—'} <span>км</span></div>
     <p>{data.latest?`${fmtDate(data.latest.recordedAt,true)} · источник ${data.latest.source} · уверенность ${Math.round(data.latest.confidence*100)}%`:'Нет записей'}</p>
    </div>
   </div>
   {anomalies.length>0&&<div className="panel anomaly-panel">
    <h2><AlertTriangle size={14}/> АНОМАЛИИ ПРОБЕГА ({anomalies.length})</h2>
    {anomalies.map((a,i)=><div key={i} className={'anomaly '+a.severity}>
      <span className={'tag '+a.severity}>{a.type==='rollback'?'Скрутка пробега':'Неправдоподобный скачок'}</span>
      <div><b>{a.message}</b><small>{fmtDate(a.fromRecordedAt)} → {fmtDate(a.toRecordedAt)} · {fmtNumber(a.fromOdometerKm)} → {fmtNumber(a.toOdometerKm)} км</small></div>
     </div>)}
   </div>}
   <div className="panel list-panel">
    <h2>ИСТОРИЯ ПРОБЕГА</h2>
    {data.loading&&!data.mileageHistory.length?<Spinner/>
     :data.mileageHistory.length
      ?<table className="data-table"><thead><tr><th>Дата</th><th>Одометр</th><th>Источник</th><th>Уверенность</th></tr></thead><tbody>
       {[...data.mileageHistory].reverse().map(r=><tr key={r.id}><td>{fmtDate(r.recordedAt,true)}</td><td><b>{fmtNumber(r.odometerKm)} км</b></td><td>{r.source}</td><td>{Math.round(r.confidence*100)}%</td></tr>)}
      </tbody></table>
      :<div className="state-note">Записей пока нет.</div>}
   </div>
  </>;
}

function ServicePage(props: PageProps) {
  const {vehicle,data}=props;
  if(!vehicle)return <NoVehicle onGoGarage={()=>props.navigate('Гараж')}/>;
  return <>
   <div className="panel list-panel">
    <h2>СТАТУС ОБСЛУЖИВАНИЯ</h2>
    {data.loading&&!data.maintenance.length?<Spinner/>
     :data.maintenance.length
      ?<div className="status-list">{data.maintenance.map(s=><div key={s.rule.id} className="status-row">
        <span className={'tag '+URGENCY_META[s.urgency].color}>{URGENCY_META[s.urgency].tag}</span>
        <div className="status-copy"><b>{s.rule.title}</b><small>{reminderDetail(s)}{s.lastCompletedAt?` · прошлое ТО ${fmtDate(s.lastCompletedAt)}`:' · ещё не выполнялось'}</small></div>
        <div className="status-nums">{s.rule.intervalKm?`интервал ${fmtNumber(s.rule.intervalKm)} км`:''}{s.rule.intervalMonths?` · ${s.rule.intervalMonths} мес`:''}</div>
       </div>)}</div>
      :<div className="state-note"><Wrench size={15}/> Правила ТО не настроены. Добавьте регламент через API (POST /maintenance/rules) — статусы появятся здесь автоматически.</div>}
   </div>
   <div className="panel list-panel">
    <h2>СЕРВИСНЫЕ ЗАПИСИ</h2>
    {data.services.length
     ?<table className="data-table"><thead><tr><th>Дата</th><th>Работа</th><th>Тип</th><th>Пробег</th><th>Стоимость</th></tr></thead><tbody>
       {data.services.map(r=><tr key={r.id}><td>{fmtDate(r.occurredAt)}</td><td><b>{r.title}</b>{r.providerName&&<small className="sub">{r.providerName}</small>}</td><td>{r.type}</td><td>{r.odometerKm!==null?`${fmtNumber(r.odometerKm)} км`:'—'}</td><td>{fmtMoney(r.totalCost,r.currency)}</td></tr>)}
      </tbody></table>
     :<div className="state-note">Сервисных записей пока нет.</div>}
   </div>
  </>;
}

function VehicleRouter(props: PageProps & { page: string }) {
  const { page } = props;
  if (page === "Гараж") return <GaragePage {...props} />;
  if (page === "Профиль авто") return <ProfilePage {...props} />;
  if (page === "Пробег") return <MileagePage {...props} />;
  if (page === "Сервис и ТО") return <ServicePage {...props} />;
  return null;
}

export { GaragePage, ProfilePage, MileagePage, ServicePage, VehicleRouter as VehiclePages };
