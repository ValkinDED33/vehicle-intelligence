import { useEffect, useState, type FormEvent } from "react";
import { Bell, CircleHelp, Fuel, History, Plus, Wallet, Wrench } from "lucide-react";
import { energyApi, expensesApi, fmtDate, fmtMoney, fmtNumber, historyApi, num, type CreateEnergyInput, type CreateExpenseInput, type HistoryEvent, type MaintenanceStatus } from "../api";
import { EmptyState, EventCard, Field, NoVehicle, Reminder, Spinner } from "../components/CommonComponents";
import { CATEGORY_LABELS, URGENCY_META } from "../constants/dashboard";
import type { PageProps } from "../types/dashboard";
import { pickMainCurrency } from "../utils/calculations";
import { errText, reminderDetail } from "../utils/formatters";

const EXPENSE_CATEGORIES=Object.keys(CATEGORY_LABELS).filter(c=>!['fuel','charge'].includes(c));

function ExpensesPage(props:PageProps){
  const {vehicle,data,refresh}=props;
  const [form,setForm]=useState({category:'maintenance',title:'',totalCost:'',currency:'PLN',occurredAt:''});
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState<{kind:'ok'|'err',text:string}|null>(null);
  if(!vehicle)return <NoVehicle onGoGarage={()=>props.navigate('Гараж')}/>;
  const summary=pickMainCurrency(data.monthExpenses);
  const submit=async(e:FormEvent)=>{
    e.preventDefault();
    setBusy(true);setMessage(null);
    try{
      const input:CreateExpenseInput={
        category:form.category,
        title:form.title.trim(),
        currency:form.currency.toUpperCase()||'PLN',
        totalCost:form.totalCost?Number(form.totalCost.replace(',','.')):undefined,
        occurredAt:form.occurredAt?new Date(form.occurredAt).toISOString():undefined,
      };
      await expensesApi.create(vehicle.id,input);
      setForm(f=>({...f,title:'',totalCost:'',occurredAt:''}));
      setMessage({kind:'ok',text:'Витрату додано.'});
      await refresh();
    }catch(err){setMessage({kind:'err',text:errText(err)})}finally{setBusy(false)}
  };
  return <>
   <div className="panels-row">
    <form className="form-card" onSubmit={submit}>
     <h3><Wallet size={16}/> Нова витрата</h3>
     <div className="form-grid">
      <Field label="Категорія"><select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{EXPENSE_CATEGORIES.map(c=><option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}</select></Field>
      <Field label="Назва"><input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} maxLength={160} placeholder="Заміна масла" required/></Field>
      <Field label="Сума"><input value={form.totalCost} onChange={e=>setForm({...form,totalCost:e.target.value})} placeholder="450.00" inputMode="decimal"/></Field>
      <Field label="Валюта"><input value={form.currency} onChange={e=>setForm({...form,currency:e.target.value.toUpperCase().slice(0,3)})} maxLength={3}/></Field>
      <Field label="Дата"><input type="date" value={form.occurredAt} onChange={e=>setForm({...form,occurredAt:e.target.value})}/></Field>
     </div>
     {message&&<div className={message.kind==='ok'?'ok-note':'auth-error'}>{message.text}</div>}
     <button className="primary" type="submit" disabled={busy}>{busy?'Зберігаємо...':'ДОДАТИ ВИТРАТУ'}</button>
    </form>
    <div className="panel stat-panel">
     <h2>ПОТОЧНИЙ МІСЯЦ</h2>
     <div className="metric-value">{summary?fmtNumber(summary.totalCost,2):'—'} <span>{summary?.currency??''}</span></div>
     <p>{summary?`Витрати ${fmtNumber(summary.expenseCost,2)} + енергія ${fmtNumber(summary.energyCost,2)}${data.monthExpenses?.distanceKm?` · ${fmtNumber(data.monthExpenses.distanceKm)} км`:''}`:'Немає операцій за місяць'}</p>
     {summary&&summary.categories.length>0&&<div className="mini-list">{summary.categories.map(c=><div key={c.category}><span>{CATEGORY_LABELS[c.category]??c.category}</span><b>{fmtNumber(c.totalCost,2)} {summary.currency}</b></div>)}</div>}
    </div>
   </div>
   <div className="panel list-panel">
    <h2>ОСТАННІ ВИТРАТИ</h2>
    {data.expenses.length
     ?<table className="data-table"><thead><tr><th>Дата</th><th>Категорія</th><th>Назва</th><th>Пробіг</th><th>Сума</th></tr></thead><tbody>
       {data.expenses.map(x=><tr key={x.id}><td>{fmtDate(x.occurredAt)}</td><td><span className="tag">{CATEGORY_LABELS[x.category]??x.category}</span></td><td><b>{x.title}</b>{x.providerName&&<small className="sub">{x.providerName}</small>}</td><td>{x.odometerKm!==null?`${fmtNumber(x.odometerKm)} км`:'—'}</td><td><b>{fmtMoney(x.totalCost,x.currency)}</b></td></tr>)}
      </tbody></table>
     :<div className="state-note">Витрат поки немає.</div>}
   </div>
  </>;
}

function EnergyPage(props:PageProps){
  const {vehicle,data,refresh}=props;
  const [form,setForm]=useState({kind:'fuel',energyType:'petrol',volumeLiters:'',unitPrice:'',totalCost:'',currency:'PLN',odometerKm:'',isFullTank:true,occurredAt:''});
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState<{kind:'ok'|'err',text:string}|null>(null);
  if(!vehicle)return <NoVehicle onGoGarage={()=>props.navigate('Гараж')}/>;
  const f2f=data.fullToFull;
  const submit=async(e:FormEvent)=>{
    e.preventDefault();
    setBusy(true);setMessage(null);
    try{
      const input:CreateEnergyInput={
        kind:form.kind as 'fuel'|'charge',
        energyType:form.kind==='charge'?'electricity':form.energyType,
        volumeLiters:form.kind==='fuel'&&form.volumeLiters?Number(form.volumeLiters.replace(',','.')):undefined,
        energyKwh:form.kind==='charge'&&form.volumeLiters?Number(form.volumeLiters.replace(',','.')):undefined,
        unitPrice:form.unitPrice?Number(form.unitPrice.replace(',','.')):undefined,
        totalCost:form.totalCost?Number(form.totalCost.replace(',','.')):undefined,
        currency:form.currency.toUpperCase()||'PLN',
        odometerKm:form.odometerKm?Number(form.odometerKm):undefined,
        isFullTank:form.isFullTank,
        occurredAt:form.occurredAt?new Date(form.occurredAt).toISOString():undefined,
      };
      await energyApi.create(vehicle.id,input);
      setForm(f=>({...f,volumeLiters:'',unitPrice:'',totalCost:'',odometerKm:'',occurredAt:''}));
      setMessage({kind:'ok',text:'Заправку додано.'});
      await refresh();
    }catch(err){setMessage({kind:'err',text:errText(err)})}finally{setBusy(false)}
  };
  return <>
   <div className="panels-row">
    <form className="form-card" onSubmit={submit}>
     <h3><Fuel size={16}/> Нова заправка / заряджання</h3>
     <div className="form-grid">
      <Field label="Тип"><select value={form.kind} onChange={e=>setForm({...form,kind:e.target.value})}><option value="fuel">Пальне</option><option value="charge">Заряджання</option></select></Field>
      {form.kind==='fuel'&&<Field label="Пальне"><select value={form.energyType} onChange={e=>setForm({...form,energyType:e.target.value})}><option value="petrol">Бензин</option><option value="diesel">Дизель</option><option value="lpg">LPG</option><option value="cng">CNG</option></select></Field>}
      <Field label={form.kind==='fuel'?'Літри':'кВт⋅год'}><input value={form.volumeLiters} onChange={e=>setForm({...form,volumeLiters:e.target.value})} placeholder="42.5" inputMode="decimal"/></Field>
      <Field label="Ціна за одиницю"><input value={form.unitPrice} onChange={e=>setForm({...form,unitPrice:e.target.value})} placeholder="6.15" inputMode="decimal"/></Field>
      <Field label="Сума"><input value={form.totalCost} onChange={e=>setForm({...form,totalCost:e.target.value})} placeholder="261.00" inputMode="decimal"/></Field>
      <Field label="Валюта"><input value={form.currency} onChange={e=>setForm({...form,currency:e.target.value.toUpperCase().slice(0,3)})} maxLength={3}/></Field>
      <Field label="Одометр, км"><input value={form.odometerKm} onChange={e=>setForm({...form,odometerKm:e.target.value.replace(/[^\d]/g,'')})} placeholder="120450" inputMode="numeric"/></Field>
      <Field label="Дата"><input type="date" value={form.occurredAt} onChange={e=>setForm({...form,occurredAt:e.target.value})}/></Field>
     </div>
     <label className="toggle-line"><input type="checkbox" checked={form.isFullTank} onChange={e=>setForm({...form,isFullTank:e.target.checked})}/> Повний бак</label>
     {message&&<div className={message.kind==='ok'?'ok-note':'auth-error'}>{message.text}</div>}
     <button className="primary" type="submit" disabled={busy}>{busy?'Зберігаємо...':'ДОДАТИ ЗАПРАВКУ'}</button>
    </form>
    <div className="panel stat-panel">
     <h2>FULL-TO-FULL</h2>
     {f2f
      ?<><div className="metric-value">{f2f.consumptionLitersPer100Km.toFixed(1)} <span>л/100км</span></div>
        <p>{fmtNumber(f2f.fromOdometerKm)} → {fmtNumber(f2f.toOdometerKm)} км · {fmtNumber(f2f.distanceKm)} км · залито {fmtNumber(f2f.fuelAddedLiters,1)} л</p>
        {f2f.costPer100Km!==null&&<p>Вартість: {fmtNumber(f2f.costPer100Km,2)} {f2f.currency??''} / 100 км</p>}</>
      :<p>Потрібні мінімум дві заправки з повним баком, щоб порахувати точну витрату.</p>}
     {data.energyMonth&&data.energyMonth.entriesCount>0&&<div className="mini-list">
      <div><span>За місяць</span><b>{data.energyMonth.entriesCount} операцій</b></div>
      <div><span>Пальне</span><b>{fmtNumber(data.energyMonth.fuelLiters,1)} л</b></div>
      {data.energyMonth.money.map(m=><div key={m.currency}><span>Витрачено</span><b>{fmtNumber(m.totalCost,2)} {m.currency}</b></div>)}
     </div>}
    </div>
   </div>
   <div className="panel list-panel">
    <h2>ЗАПРАВКИ Й ЗАРЯДЖАННЯ</h2>
    {data.energy.length
     ?<table className="data-table"><thead><tr><th>Дата</th><th>Тип</th><th>Об’єм</th><th>Одометр</th><th>Сума</th><th>Повний бак</th></tr></thead><tbody>
       {data.energy.map(x=><tr key={x.id}><td>{fmtDate(x.occurredAt)}</td><td><span className="tag">{x.kind==='fuel'?(CATEGORY_LABELS.fuel??'Пальне'):'Заряджання'} · {x.energyType}</span></td><td>{num(x.volumeLiters)!==null?`${fmtNumber(num(x.volumeLiters),1)} л`:num(x.energyKwh)!==null?`${fmtNumber(num(x.energyKwh),1)} кВт⋅год`:'—'}</td><td>{x.odometerKm!==null?fmtNumber(x.odometerKm):'—'}</td><td>{fmtMoney(x.totalCost,x.currency)}</td><td>{x.isFullTank?'так':'—'}</td></tr>)}
      </tbody></table>
     :<div className="state-note">Заправок поки немає.</div>}
   </div>
  </>;
}

function EventsPage(props:PageProps){
  const {vehicle,data}=props;
  const [all,setAll]=useState<HistoryEvent[]|null>(null);
  const [busy,setBusy]=useState(false);
  const vehicleId=vehicle?.id??null;
  useEffect(()=>{setAll(null)},[vehicleId]);
  if(!vehicle)return <NoVehicle onGoGarage={()=>props.navigate('Гараж')}/>;
  const list=all??data.events;
  const loadMore=async()=>{
    setBusy(true);
    try{setAll(await historyApi.list(vehicle.id,{limit:100}))}catch{ /* keep current */ }finally{setBusy(false)}
  };
  return <>
   <div className="page-actions"><button className="ghost-btn" onClick={()=>void loadMore()} disabled={busy}>{busy?'Завантаження...':'Показати до 100 подій'}</button></div>
   {data.loading&&!list.length?<Spinner/>
    :list.length?<div className="events-list">{list.map(e=><EventCard key={e.id} event={e}/>)}</div>
    :<EmptyState icon={History} title="Подій поки немає" text="Події створюються автоматично із записів пробігу, витрат, сервісу й зовнішніх звітів Vehicle Databases."/>}
  </>;
}

function RemindersPage(props:PageProps){
  const {vehicle,data}=props;
  if(!vehicle)return <NoVehicle onGoGarage={()=>props.navigate('Гараж')}/>;
  const statuses=pickRemindersAll(data.maintenance);
  return statuses.length
   ?<div className="inner-grid">{statuses.map(s=><Reminder key={s.rule.id} icon={Wrench} title={s.rule.title} detail={reminderDetail(s)} tag={URGENCY_META[s.urgency].tag} color={URGENCY_META[s.urgency].color}/>)}</div>
   :<EmptyState icon={Bell} title="Нагадувань немає" text="Налаштуйте правила ТО (сервісний інтервал, строк), і CARA сама порахує, коли час на обслуговування."/>;
}

function pickRemindersAll(statuses: MaintenanceStatus[]): MaintenanceStatus[] {
  const rank: Record<MaintenanceStatus["urgency"], number> = { stop: 0, check_soon: 1, attention: 2, normal: 3 };
  return [...statuses].sort((a, b) => rank[a.urgency] - rank[b.urgency]);
}

function TrackingRouter(props: PageProps & { page: string }) {
  const { page } = props;
  if (page === "Витрати") return <ExpensesPage {...props} />;
  if (page === "Пальне й енергія") return <EnergyPage {...props} />;
  if (page === "Історія подій") return <EventsPage {...props} />;
  if (page === "Нагадування") return <RemindersPage {...props} />;
  return null;
}

export { ExpensesPage, EnergyPage, EventsPage, RemindersPage, TrackingRouter as TrackingPages };
