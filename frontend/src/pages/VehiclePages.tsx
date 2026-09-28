import { useState, type FormEvent } from "react";
import { AlertTriangle, Check, CircleHelp, ClipboardList, Gauge, Loader2, Plus, RefreshCw, Search, Wrench } from "lucide-react";
import { fmtDate, fmtMoney, fmtNumber, garageApi, mileageApi, vinApi } from "../api";
import { AddVehicleForm } from "../components/AddVehicleForm";
import { EmptyState, Field, NoVehicle, Spinner } from "../components/CommonComponents";
import { URGENCY_META } from "../constants/dashboard";
import type { PageProps } from "../types/dashboard";
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
  const [message,setMessage]=useState<{kind:'ok'|'err',text:string}|null>(null);
  if(!vehicle)return <NoVehicle onGoGarage={()=>props.navigate('Гараж')}/>;
  const profile=data.profile;
  const decode=async()=>{
    if(!vehicle.vin){setMessage({kind:'err',text:'У автомобиля не указан VIN — сначала добавьте его в гараже.'});return}
    setBusy(true);setMessage(null);
    try{
      await vinApi.decode(vehicle.id);
      setMessage({kind:'ok',text:'VIN расшифрован — профиль и карточка обновлены.'});
      await afterMutate();
    }catch(err){setMessage({kind:'err',text:errText(err)})}finally{setBusy(false)}
  };
  const rows:[string,string][]=profile?[
    ['Двигатель',[profile.engineFamily,profile.engineCode].filter(Boolean).join(' ')||'—'],
    ['Объём',profile.displacementCc?`${fmtNumber(profile.displacementCc)} см³`:'—'],
    ['Топливо',profile.fuelType??'—'],
    ['Наддув',profile.aspirationType??'—'],
    ['Мощность',profile.powerHp?`${fmtNumber(profile.powerHp)} л.с. (${fmtNumber(profile.powerKw)} кВт)`:'—'],
    ['Коробка',[profile.transmissionType,profile.transmissionCode].filter(Boolean).join(' ')||'—'],
    ['Привод',profile.driveType??'—'],
    ['Бак',profile.fuelTankCapacityLiters?`${profile.fuelTankCapacityLiters} л`:'—'],
    ['Батарея',profile.batteryUsableCapacityKwh?`${profile.batteryUsableCapacityKwh} кВт⋅ч (полная ${profile.batteryGrossCapacityKwh??'—'})`:'—'],
    ['Версия профиля',`v${profile.version} · источник ${profile.source}`],
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
  </>;
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
