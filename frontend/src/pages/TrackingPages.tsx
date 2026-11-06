import { t, enumLabel } from "../i18n";
import { useEffect, useState, type FormEvent } from "react";
import { Bell, CircleHelp, Fuel, History, Plus, Wallet, Wrench } from "lucide-react";
import { energyApi, expensesApi, fmtDate, fmtMoney, fmtNumber, historyApi, num, type CreateEnergyInput, type CreateExpenseInput, type HistoryEvent, type MaintenanceStatus } from "../api";
import { EmptyState, EventCard, Field, NoVehicle, Reminder, Spinner } from "../components/CommonComponents";
import { CATEGORY_LABELS, URGENCY_META } from "../constants/dashboard";
import type { PageProps } from "../types/dashboard";
import { pickMainCurrency } from "../utils/calculations";
import { errText, reminderDetail } from "../utils/formatters";
import { ScheduledReminders } from "../components/ScheduledReminders";
import { MonthlyExpenses } from "../components/MonthlyExpenses";

const EXPENSE_CATEGORIES=Object.keys(CATEGORY_LABELS).filter(c=>!['fuel','charge'].includes(c));

function ExpensesPage(props:PageProps){
  const {vehicle,data,refresh}=props;
  const [form,setForm]=useState({category:'maintenance',title:'',totalCost:'',currency:'PLN',occurredAt:''});
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState<{kind:'ok'|'err',text:string}|null>(null);
  if(!vehicle)return <NoVehicle onGoGarage={()=>props.navigate('Гараж')}/>;
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
      setMessage({kind:'ok',text:t("Витрату додано.")});
      await refresh();
    }catch(err){setMessage({kind:'err',text:errText(err)})}finally{setBusy(false)}
  };
  return <>
   <div className="panels-row">
    <form className="form-card" onSubmit={submit}>
     <h3><Wallet size={16}/> {t("Нова витрата")}</h3>
     <div className="form-grid">
      <Field label={t("Категорія")}><select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{EXPENSE_CATEGORIES.map(c=><option key={c} value={c}>{t(CATEGORY_LABELS[c])}</option>)}</select></Field>
      <Field label={t("Назва")}><input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} maxLength={160} placeholder={t("Заміна оливи")} required/></Field>
      <Field label={t("Сума")}><input value={form.totalCost} onChange={e=>setForm({...form,totalCost:e.target.value})} placeholder="450.00" inputMode="decimal"/></Field>
      <Field label={t("Валюта")}><input value={form.currency} onChange={e=>setForm({...form,currency:e.target.value.toUpperCase().slice(0,3)})} maxLength={3}/></Field>
      <Field label={t("Дата")}><input type="date" value={form.occurredAt} onChange={e=>setForm({...form,occurredAt:e.target.value})}/></Field>
     </div>
     {message&&<div className={message.kind==='ok'?'ok-note':'auth-error'}>{message.text}</div>}
     <button className="primary" type="submit" disabled={busy}>{busy?t("Зберігаємо..."):t("ДОДАТИ ВИТРАТУ")}</button>
    </form>
    <MonthlyExpenses vehicleId={vehicle.id} current={data.monthExpenses}/>
   </div>
   <div className="panel list-panel">
    <h2>{t("ОСТАННІ ВИТРАТИ")}</h2>
    {data.expenses.length
     ?<table className="data-table"><thead><tr><th>{t("Дата")}</th><th>{t("Категорія")}</th><th>{t("Назва")}</th><th>{t("Пробіг")}</th><th>{t("Сума")}</th></tr></thead><tbody>
       {data.expenses.map(x=><tr key={x.id}><td>{fmtDate(x.occurredAt)}</td><td><span className="tag">{t(CATEGORY_LABELS[x.category]??x.category)}</span></td><td><b>{x.title}</b>{x.providerName&&<small className="sub">{x.providerName}</small>}</td><td>{x.odometerKm!==null?t("{0} км", { 0: fmtNumber(x.odometerKm) }):'—'}</td><td><b>{fmtMoney(x.totalCost,x.currency)}</b></td></tr>)}
      </tbody></table>
     :<div className="state-note">{t("Витрат поки немає.")}</div>}
   </div>
  </>;
}

function EnergyPage(props:PageProps){
  const {vehicle,data,refresh}=props;
  const [form,setForm]=useState({kind:data.profile?.fuelType==='electric'?'charge':'fuel',energyType:data.profile?.fuelType??'unspecified',volumeLiters:'',unitPrice:'',totalCost:'',currency:'PLN',odometerKm:'',isFullTank:false,occurredAt:''});
  const [energyKindChosen,setEnergyKindChosen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState<{kind:'ok'|'err',text:string}|null>(null);
  useEffect(()=>{const fuel=data.profile?.fuelType;if(!energyKindChosen&&fuel)setForm(current=>({...current,kind:fuel==='electric'?'charge':'fuel',energyType:['petrol','diesel','lpg','cng'].includes(fuel)?fuel:'unspecified',isFullTank:false}))},[data.profile?.fuelType,energyKindChosen]);
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
        isFullTank:form.kind==='fuel'&&form.isFullTank,
        occurredAt:form.occurredAt?new Date(form.occurredAt).toISOString():undefined,
      };
      await energyApi.create(vehicle.id,input);
      setForm(f=>({...f,volumeLiters:'',unitPrice:'',totalCost:'',odometerKm:'',occurredAt:''}));
      setMessage({kind:'ok',text:form.kind==='charge'?t("Заряджання додано."):t("Заправку додано.")});
      await refresh();
    }catch(err){setMessage({kind:'err',text:errText(err)})}finally{setBusy(false)}
  };
  return <>
   <div className="panels-row">
    <form className="form-card" onSubmit={submit}>
     <h3><Fuel size={16}/> {t("Нова заправка / заряджання")}</h3>
     <div className="form-grid">
      <Field label={t("Тип")}><select value={form.kind} onChange={e=>{setEnergyKindChosen(true);setForm({...form,kind:e.target.value,isFullTank:false})}}><option value="fuel">{t("Пальне")}</option><option value="charge">{t("Заряджання")}</option></select></Field>
      {form.kind==='fuel'&&<Field label={t("Пальне")}><select value={form.energyType} onChange={e=>setForm({...form,energyType:e.target.value})}><option value="unspecified">{t("Не вказано")}</option><option value="petrol">{t("Бензин")}</option><option value="diesel">{t("Дизель")}</option><option value="lpg">LPG</option><option value="cng">CNG</option></select></Field>}
      <Field label={form.kind==='fuel'?t("Літри"):t("кВт⋅год")}><input value={form.volumeLiters} onChange={e=>setForm({...form,volumeLiters:e.target.value})} placeholder="42.5" inputMode="decimal"/></Field>
      <Field label={t("Ціна за одиницю")}><input value={form.unitPrice} onChange={e=>setForm({...form,unitPrice:e.target.value})} placeholder="6.15" inputMode="decimal"/></Field>
      <Field label={t("Сума")}><input value={form.totalCost} onChange={e=>setForm({...form,totalCost:e.target.value})} placeholder="261.00" inputMode="decimal"/></Field>
      <Field label={t("Валюта")}><input value={form.currency} onChange={e=>setForm({...form,currency:e.target.value.toUpperCase().slice(0,3)})} maxLength={3}/></Field>
      <Field label={t("Одометр, км")}><input value={form.odometerKm} onChange={e=>setForm({...form,odometerKm:e.target.value.replace(/[^\d]/g,'')})} placeholder="120450" inputMode="numeric"/></Field>
      <Field label={t("Дата")}><input type="date" value={form.occurredAt} onChange={e=>setForm({...form,occurredAt:e.target.value})}/></Field>
     </div>
     {form.kind==='fuel'&&<label className="toggle-line"><input type="checkbox" checked={form.isFullTank} onChange={e=>setForm({...form,isFullTank:e.target.checked})}/> {t("Повний бак")}</label>}
     {message&&<div className={message.kind==='ok'?'ok-note':'auth-error'}>{message.text}</div>}
     <button className="primary" type="submit" disabled={busy}>{busy?t("Зберігаємо..."):form.kind==='charge'?t("ДОДАТИ ЗАРЯДЖАННЯ"):t("ДОДАТИ ЗАПРАВКУ")}</button>
    </form>
    <div className="panel stat-panel">
     <h2>{data.profile?.fuelType==='electric'?t("ЗАРЯДЖЕНО"):'FULL-TO-FULL'}</h2>
     {data.profile?.fuelType==='electric'?<div className="metric-value">{data.energyMonth?fmtNumber(data.energyMonth.energyKwh,1):'—'} <span>{t("кВт⋅год")}</span></div>:f2f
      ?<><div className="metric-value">{f2f.consumptionLitersPer100Km.toFixed(1)} <span>{t("л/100км")}</span></div>
        <p>{fmtNumber(f2f.fromOdometerKm)} → {fmtNumber(f2f.toOdometerKm)} {t("км ·")} {fmtNumber(f2f.distanceKm)} {t("км · залито")} {fmtNumber(f2f.fuelAddedLiters,1)} {t("л")}</p>
        {f2f.costPer100Km!==null&&<p>{t("Вартість:")} {fmtNumber(f2f.costPer100Km,2)} {f2f.currency??''} {t("/ 100 км")}</p>}</>
      :<p>{t("Потрібні мінімум дві заправки з повним баком, щоб порахувати точну витрату.")}</p>}
     {data.energyMonth&&data.energyMonth.entriesCount>0&&<div className="mini-list">
      <div><span>{t("За місяць")}</span><b>{data.energyMonth.entriesCount} {t("операцій")}</b></div>
      {data.profile?.fuelType!=='electric'&&<div><span>{t("Пальне")}</span><b>{fmtNumber(data.energyMonth.fuelLiters,1)} {t("л")}</b></div>}
      {data.energyMonth.energyKwh>0&&<div><span>{t("Заряджання")}</span><b>{fmtNumber(data.energyMonth.energyKwh,1)} {t("кВт⋅год")}</b></div>}
      {data.energyMonth.money.map(m=><div key={m.currency}><span>{t("Витрачено")}</span><b>{fmtNumber(m.totalCost,2)} {m.currency}</b></div>)}
     </div>}
    </div>
   </div>
   <div className="panel list-panel">
    <h2>{t("ЗАПРАВКИ Й ЗАРЯДЖАННЯ")}</h2>
    {data.energy.length
     ?<table className="data-table"><thead><tr><th>{t("Дата")}</th><th>{t("Тип")}</th><th>{t("Об’єм")}</th><th>{t("Одометр")}</th><th>{t("Сума")}</th><th>{t("Повний бак")}</th></tr></thead><tbody>
       {data.energy.map(x=><tr key={x.id}><td>{fmtDate(x.occurredAt)}</td><td><span className="tag">{x.kind==='fuel'?t("Пальне"):t("Заряджання")} · {enumLabel(x.energyType)}</span></td><td>{num(x.volumeLiters)!==null?t("{0} л", { 0: fmtNumber(num(x.volumeLiters),1) }):num(x.energyKwh)!==null?t("{0} кВт⋅год", { 0: fmtNumber(num(x.energyKwh),1) }):'—'}</td><td>{x.odometerKm!==null?fmtNumber(x.odometerKm):'—'}</td><td>{fmtMoney(x.totalCost,x.currency)}</td><td>{x.isFullTank?t("так"):'—'}</td></tr>)}
      </tbody></table>
     :<div className="state-note">{t("Заправок поки немає.")}</div>}
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
   <div className="page-actions"><button className="ghost-btn" onClick={()=>void loadMore()} disabled={busy}>{busy?t("Завантаження..."):t("Показати до 100 подій")}</button></div>
   {data.loading&&!list.length?<Spinner/>
    :list.length?<div className="events-list">{list.map(e=><EventCard key={e.id} event={e}/>)}</div>
    :<EmptyState icon={History} title={t("Подій поки немає")} text={t("Події створюються автоматично із записів пробігу, витрат, сервісу й зовнішніх звітів Vehicle Databases.")}/>}
  </>;
}

function RemindersPage(props:PageProps){
  const {vehicle,data}=props;
  if(!vehicle)return <NoVehicle onGoGarage={()=>props.navigate('Гараж')}/>;
  const statuses=pickRemindersAll(data.maintenance);
  return <><ScheduledReminders key={vehicle.id} vehicleId={vehicle.id} onSettings={()=>props.navigate('Налаштування')} onService={()=>props.navigate('Сервіс і ТО')} onChanged={props.refresh}/>
   {statuses.length>0&&<><h2>{t("Сервіс і ТО")}</h2><div className="inner-grid">{statuses.map(s=><Reminder key={s.rule.id} icon={Wrench} title={s.rule.title} detail={reminderDetail(s)} tag={URGENCY_META[s.urgency].tag} color={URGENCY_META[s.urgency].color}/>)}</div></>}
  </>;
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
