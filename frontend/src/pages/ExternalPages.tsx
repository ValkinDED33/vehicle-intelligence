import { useEffect, useState } from "react";
import { ChartNoAxesCombined, Download, Loader2, LogOut, PlugZap } from "lucide-react";
import { API_BASE, externalReportsApi, fmtDate, type ExternalReport, type ReportSource, type SourceFetchSummary } from "../api";
import { useAuth } from "../auth";
import { EmptyState, EventCard, NoVehicle, Spinner } from "../components/CommonComponents";
import type { PageProps } from "../types/dashboard";
import { errText } from "../utils/formatters";

function IntegrationsPage(props:PageProps){
  const {vehicle,data,afterMutate}=props;
  const [sources,setSources]=useState<ReportSource[]|null>(null);
  const [busy,setBusy]=useState<string|null>(null);
  const [results,setResults]=useState<SourceFetchSummary[]|null>(null);
  const [message,setMessage]=useState<{kind:'ok'|'err',text:string}|null>(null);
  const vehicleId=vehicle?.id??null;
  useEffect(()=>{
    setSources(null);setResults(null);setMessage(null);
    if(!vehicleId)return;
    let cancelled=false;
    externalReportsApi.sources(vehicleId)
      .then(list=>{if(!cancelled)setSources(list)})
      .catch(()=>{if(!cancelled)setSources([])});
    return ()=>{cancelled=true};
  },[vehicleId]);
  if(!vehicle)return <NoVehicle onGoGarage={()=>props.navigate('Гараж')}/>;
  if(!vehicle.vin)return <EmptyState icon={PlugZap} title="Нужен VIN" text="Внешние отчёты Vehicle Databases запрашиваются по VIN. Укажите VIN в карточке автомобиля."/>;
  if(sources===null)return <Spinner/>;
  const fetchAll=async()=>{
    setBusy('all');setMessage(null);setResults(null);
    try{
      const res=await externalReportsApi.fetchAll(vehicle.id);
      setResults(res);
      const ok=res.filter(r=>r.status==='success'||r.status==='no-data').length;
      setMessage({kind:'ok',text:`Обработано источников: ${res.length} (успешно/без данных: ${ok}).`});
      await afterMutate();
    }catch(err){setMessage({kind:'err',text:errText(err)})}finally{setBusy(null)}
  };
  const fetchOne=async(key:string)=>{
    setBusy(key);setMessage(null);
    try{
      const res=await fetchOneSource(vehicle.id,key);
      setResults([res]);
      setMessage({kind:res.status==='error'?'err':'ok',text:`${key}: ${res.status}${res.error?` — ${res.error}`:''}`});
      await afterMutate();
    }catch(err){setMessage({kind:'err',text:errText(err)})}finally{setBusy(null)}
  };
  return <>
   <div className="page-actions">
    <button className="primary" onClick={()=>void fetchAll()} disabled={busy!==null}>{busy==='all'?<Loader2 size={15} className="spin"/>:<Download size={15}/>} {busy==='all'?'ЗАБИРАЕМ ОТЧЁТЫ...':'СКАЧАТЬ ВСЕ ОТЧЁТЫ ПО VIN'}</button>
    <span className="hint-note">Данные: Vehicle Databases. Сырые ответы сохраняются в «Отчётах».</span>
   </div>
   {message&&<div className={message.kind==='ok'?'ok-note':'auth-error'}>{message.text}</div>}
   <div className="sources-grid">
    {sources.map(s=><div key={s.key} className="panel source-card">
      <div className={'icon-disc '+(results?.find(r=>r.source===s.key)?.status==='success'?'green':'')}><PlugZap size={17}/></div>
      <div className="source-copy"><b>{s.apiName}</b><small>{s.key}</small></div>
      <button className="ghost-btn" onClick={()=>void fetchOne(s.key)} disabled={busy!==null}>{busy===s.key?'...':'Запросить'}</button>
     </div>)}
    {!sources.length&&<div className="state-note">Список источников пуст.</div>}
   </div>
   {results&&results.length>1&&<div className="panel list-panel">
    <h2>РЕЗУЛЬТАТЫ ЗАГРУЗКИ</h2>
    <table className="data-table"><thead><tr><th>Источник</th><th>Статус</th><th>Детали</th></tr></thead><tbody>
     {results.map(r=><tr key={r.source}><td>{r.source}</td><td><span className={'tag '+(r.status==='success'?'green':r.status==='no-data'?'purple':'red')}>{r.status}</span></td><td>{r.error??(r.reportId?'сохранён отчёт':'—')}</td></tr>)}
    </tbody></table>
   </div>}
   <div className="panel list-panel">
    <h2>ПОСЛЕДНИЕ СОБЫТИЯ ИЗ ОТЧЁТОВ</h2>
    {data.events.filter(e=>e.type.startsWith('external.')).slice(0,8).map(e=><EventCard key={e.id} event={e}/>)}
    {!data.events.some(e=>e.type.startsWith('external.'))&&<div className="state-note">Пока нет событий из внешних источников.</div>}
   </div>
  </>;
}

async function fetchOneSource(vehicleId:string,key:string):Promise<SourceFetchSummary>{
  try{
    const res=await externalReportsApi.fetchSource(vehicleId,key);
    return {source:key,status:res.report.status,reportId:res.report.id};
  }catch(err){
    return {source:key,status:'error',error:errText(err)};
  }
}

function ReportsPage(props:PageProps){
  const {vehicle}=props;
  const [reports,setReports]=useState<ExternalReport[]|null>(null);
  const [error,setError]=useState<string|null>(null);
  useEffect(()=>{
    if(!vehicle){setReports(null);return}
    let cancelled=false;
    externalReportsApi.list(vehicle.id)
      .then(r=>{if(!cancelled)setReports(r)})
      .catch(err=>{if(!cancelled){setError(errText(err));setReports([])}});
    return ()=>{cancelled=true};
  },[vehicle?.id]);
  if(!vehicle)return <NoVehicle onGoGarage={()=>props.navigate('Гараж')}/>;
  if(reports===null)return <Spinner/>;
  if(error)return <div className="auth-error">{error}</div>;
  return reports.length
   ?<div className="panel list-panel">
      <h2>СОХРАНЁННЫЕ ОТЧЁТЫ ({reports.length})</h2>
      <table className="data-table"><thead><tr><th>Тип</th><th>Провайдер</th><th>VIN</th><th>Статус</th><th>Получен</th></tr></thead><tbody>
       {reports.map(r=><tr key={r.id}><td><b>{r.reportType}</b></td><td>{r.provider}</td><td className="mono">{r.vin??'—'}</td><td><span className={'tag '+(r.status==='success'?'green':r.status==='no-data'?'purple':'red')}>{r.status}</span></td><td>{fmtDate(r.fetchedAt,true)}</td></tr>)}
      </tbody></table>
    </div>
   :<EmptyState icon={ChartNoAxesCombined} title="Отчётов пока нет" text="Загрузите отчёты в разделе «Интеграции» — сырые ответы Vehicle Databases сохранятся здесь навсегда."/>;
}

function SettingsPage(props:PageProps){
  const {userName,logout}=props;
  const {user}=useAuth();
  return <>
   <div className="panel list-panel">
    <h2>ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ</h2>
    <div className="settings-grid">
     <div><span>Имя</span><b>{userName}</b></div>
     <div><span>Email</span><b>{user?.email??'—'}</b></div>
     <div><span>Страна</span><b>{user?.country??'—'}</b></div>
     <div><span>Язык</span><b>{user?.language??'—'}</b></div>
     <div><span>API</span><b className="mono">{API_BASE||'same-origin'}</b></div>
    </div>
    <div className="page-actions">
     <button className="ghost-btn danger" onClick={logout}><LogOut size={15}/> Выйти из аккаунта</button>
    </div>
   </div>
   <div className="panel list-panel">
    <h2>О ПЛАТФОРМЕ</h2>
    <p className="about-text">CARA — единый профиль автомобиля: VIN-декодирование, история продаж, аукционы, оценки, отзывы, проверки на угон (Vehicle Databases) плюс ваши записи пробега, расходов, топлива и ТО. AI работает только поверх фактов.</p>
   </div>
  </>;
}

function ExternalRouter(props: PageProps & { page: string }) {
  const { page } = props;
  if (page === "Интеграции") return <IntegrationsPage {...props} />;
  if (page === "Отчёты") return <ReportsPage {...props} />;
  if (page === "Настройки") return <SettingsPage {...props} />;
  return null;
}

// ---------- root ----------

export { IntegrationsPage, ReportsPage, SettingsPage, ExternalRouter as ExternalPages };
