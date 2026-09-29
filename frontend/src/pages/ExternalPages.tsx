import { useEffect, useState, type ReactNode } from "react";
import { ChartNoAxesCombined, ChevronDown, Download, Loader2, LogOut, PlugZap } from "lucide-react";
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
  const [openProviders,setOpenProviders]=useState<Record<string,boolean>>({
    oneauto:true,
    cepik:true,
    vehicleDatabases:false,
    other:false,
  });
  const [cepik,setCepik]=useState({
    wojewodztwo:'14',
    dataOd:'',
    dataDo:'',
    typDaty:'1' as '1'|'2',
    limit:'25',
    detailId:'',
  });
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
  if(sources===null)return <Spinner/>;
  const vinSources=sources.filter(s=>s.fetchableByVehicleVin&&!s.key.startsWith('oneauto-'));
  const oneAutoSources=sources.filter(s=>s.key.startsWith('oneauto-'));
  const vehicleDatabaseSources=sources.filter(s=>!s.key.startsWith('oneauto-')&&s.key!=='cepik-pojazdy'&&s.input==='vin'&&s.fetchableByVehicleVin);
  const otherSources=sources.filter(s=>!s.key.startsWith('oneauto-')&&s.key!=='cepik-pojazdy'&&(!s.fetchableByVehicleVin||s.input!=='vin'));
  const wojewodztwoOptions=CEPIK_WOJEWODZTWA;
  const toggleProvider=(key:string)=>setOpenProviders(prev=>({...prev,[key]:!prev[key]}));
  const fetchAll=async()=>{
    setBusy('all');setMessage(null);setResults(null);
    try{
      const res=await externalReportsApi.fetchAll(vehicle.id);
      setResults(res);
      const ok=res.filter(r=>r.status==='success'||r.status==='no-data').length;
      setMessage({kind:'ok',text:`Обработано VIN-источников: ${res.length} из ${vinSources.length} (успешно/без данных: ${ok}).`});
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
  const fetchOneAuto=async(key:string)=>{
    setBusy(key);setMessage(null);
    try{
      const res=await externalReportsApi.fetchOneAutoSource(vehicle.id,key);
      setResults([{source:key,status:res.report.status,reportId:res.report.id}]);
      setMessage({kind:'ok',text:`${key}: OneAutoAPI отчёт сохранён. Проверь raw-ответ перед переносом в подтверждённый профиль.`});
      await afterMutate();
    }catch(err){setMessage({kind:'err',text:errText(err)})}finally{setBusy(null)}
  };
  const fetchCepik=async()=>{
    setBusy('cepik-pojazdy');setMessage(null);setResults(null);
    try{
      const res=await externalReportsApi.fetchCepikVehicles(vehicle.id,{
        wojewodztwo:cepik.wojewodztwo,
        dataOd:cepik.dataOd,
        dataDo:cepik.dataDo||undefined,
        typDaty:cepik.typDaty,
        limit:cepik.limit,
        page:'1',
      });
      setResults([{source:'cepik-pojazdy',status:res.report.status,reportId:res.report.id}]);
      setMessage({kind:'ok',text:'CEPiK сохранён как альтернативный отчёт. Проверь данные перед переносом в подтверждённый профиль.'});
      await afterMutate();
    }catch(err){setMessage({kind:'err',text:errText(err)})}finally{setBusy(null)}
  };
  const fetchCepikDetail=async()=>{
    setBusy('cepik-pojazdy-detail');setMessage(null);setResults(null);
    try{
      const res=await externalReportsApi.fetchCepikVehicleById(vehicle.id,cepik.detailId);
      setResults([{source:'cepik-pojazdy-detail',status:res.report.status,reportId:res.report.id}]);
      setMessage({kind:'ok',text:'CEPiK detail сохранён как отдельный отчёт по техническому ID записи.'});
      await afterMutate();
    }catch(err){setMessage({kind:'err',text:errText(err)})}finally{setBusy(null)}
  };
  return <>
   <div className="page-actions">
    <button className="primary" onClick={()=>void fetchAll()} disabled={busy!==null||vinSources.length===0||!vehicle.vin}>{busy==='all'?<Loader2 size={15} className="spin"/>:<Download size={15}/>} {busy==='all'?'ЗАБИРАЕМ ОТЧЁТЫ...':'СКАЧАТЬ VIN-ОТЧЁТЫ'}</button>
    <span className="hint-note">Vehicle Databases работает по VIN. CEPiK ниже — отдельная польская альтернатива по региону и периоду регистрации.</span>
   </div>
   {!vehicle.vin&&<div className="state-note">VIN-источники недоступны, потому что у автомобиля не указан VIN. CEPiK можно запросить отдельно, если известен регион и период регистрации в Польше.</div>}
   {message&&<div className={message.kind==='ok'?'ok-note':'auth-error'}>{message.text}</div>}
   <ProviderAccordion title="OneAutoAPI" meta={`${oneAutoSources.length} VIN источников`} open={openProviders.oneauto} onToggle={()=>toggleProvider('oneauto')}>
    <div className="sources-grid">
     {oneAutoSources.map(s=><SourceCard key={s.key} source={s} result={results?.find(r=>r.source===s.key)} busy={busy} vehicleHasVin={Boolean(vehicle.vin)} onClick={()=>void fetchOneAuto(s.key)}/>)}
     {!oneAutoSources.length&&<div className="state-note">OneAutoAPI источники не найдены.</div>}
    </div>
   </ProviderAccordion>
   <ProviderAccordion title="CEPiK" meta="польский реестр" open={openProviders.cepik} onToggle={()=>toggleProvider('cepik')}>
    <div className="cepik-grid">
      <label><span>Województwo</span><select value={cepik.wojewodztwo} onChange={e=>setCepik({...cepik,wojewodztwo:e.target.value})}>{wojewodztwoOptions.map(w=><option key={w.code} value={w.code}>{w.code} · {w.name}</option>)}</select></label>
      <label><span>Дата от YYYYMMDD</span><input value={cepik.dataOd} onChange={e=>setCepik({...cepik,dataOd:e.target.value.replace(/[^\d]/g,'').slice(0,8)})} placeholder="20070101"/></label>
      <label><span>Дата до YYYYMMDD</span><input value={cepik.dataDo} onChange={e=>setCepik({...cepik,dataDo:e.target.value.replace(/[^\d]/g,'').slice(0,8)})} placeholder="20071231"/></label>
      <label><span>Тип даты</span><select value={cepik.typDaty} onChange={e=>setCepik({...cepik,typDaty:e.target.value as '1'|'2'})}><option value="1">первая регистрация в PL</option><option value="2">последняя регистрация</option></select></label>
      <label><span>Лимит</span><input value={cepik.limit} onChange={e=>setCepik({...cepik,limit:e.target.value.replace(/[^\d]/g,'')})} placeholder="25"/></label>
      <label><span>CEPiK ID записи</span><input value={cepik.detailId} onChange={e=>setCepik({...cepik,detailId:e.target.value.replace(/[^\d]/g,'')})} placeholder="id из /pojazdy"/></label>
     </div>
     <div className="page-actions">
      <button className="ghost-btn save-profile-btn" onClick={()=>void fetchCepik()} disabled={busy!==null||!cepik.wojewodztwo||!cepik.dataOd}>{busy==='cepik-pojazdy'?<Loader2 size={15} className="spin"/>:<Download size={15}/>} ПОИСК CEPIK</button>
      <button className="ghost-btn save-profile-btn" onClick={()=>void fetchCepikDetail()} disabled={busy!==null||!cepik.detailId}>{busy==='cepik-pojazdy-detail'?<Loader2 size={15} className="spin"/>:<Download size={15}/>} ДЕТАЛИ ПО ID</button>
     </div>
   </ProviderAccordion>
   <ProviderAccordion title="Vehicle Databases" meta={`${vehicleDatabaseSources.length} VIN источников`} open={openProviders.vehicleDatabases} onToggle={()=>toggleProvider('vehicleDatabases')}>
    <div className="sources-grid">
     {vehicleDatabaseSources.map(s=><SourceCard key={s.key} source={s} result={results?.find(r=>r.source===s.key)} busy={busy} vehicleHasVin={Boolean(vehicle.vin)} onClick={()=>void fetchOne(s.key)}/>)}
    </div>
   </ProviderAccordion>
   <ProviderAccordion title="Отдельные потоки" meta={`${otherSources.length} источников`} open={openProviders.other} onToggle={()=>toggleProvider('other')}>
    <div className="sources-grid">
     {otherSources.map(s=><SourceCard key={s.key} source={s} result={results?.find(r=>r.source===s.key)} busy={busy} vehicleHasVin={Boolean(vehicle.vin)} onClick={()=>void fetchOne(s.key)}/>)}
     {!otherSources.length&&<div className="state-note">Отдельных потоков нет.</div>}
    </div>
   </ProviderAccordion>
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

function ProviderAccordion({title,meta,open,onToggle,children}:{title:string;meta:string;open:boolean;onToggle:()=>void;children:ReactNode}){
  return <section className={'panel provider-accordion '+(open?'open':'')}>
   <button className="provider-head" type="button" onClick={onToggle}>
    <span><b>{title}</b><small>{meta}</small></span>
    <ChevronDown size={18}/>
   </button>
   {open&&<div className="provider-body">{children}</div>}
  </section>;
}

function SourceCard({source,result,busy,vehicleHasVin,onClick}:{source:ReportSource;result:SourceFetchSummary|undefined;busy:string|null;vehicleHasVin:boolean;onClick:()=>void}){
  const disabled=busy!==null||(!source.fetchableByVehicleVin&&source.key!=='cepik-pojazdy')||(!vehicleHasVin&&source.fetchableByVehicleVin);
  return <div className="panel source-card">
   <div className={'icon-disc '+(result?.status==='success'?'green':'')}><PlugZap size={17}/></div>
   <div className="source-copy"><b>{source.apiName}</b><small>{source.key} · {source.fetchableByVehicleVin?'VIN':'нужен '+source.input}</small>{!source.fetchableByVehicleVin&&source.note&&<small>{source.note}</small>}</div>
   <button className="ghost-btn" onClick={onClick} disabled={disabled}>{busy===source.key?'...':buttonLabelForSource(source)}</button>
  </div>;
}

function buttonLabelForSource(source:ReportSource):string{
  const labels:Record<string,string>={
    "oneauto-oe-build-sheet-europe-vin":"Получить комплектацию",
    "oneauto-oe-build-sheet-vin":"Получить build sheet",
    "oneauto-oe-service-schedule-vin":"Получить регламент ТО",
    "oneauto-recall-check-vin":"Проверить отзывы",
    "oneauto-recall-report-vin":"Отчёт по отзывам",
    "oneauto-vin-decode-basic-us":"VIN decode US",
    "oneauto-vin-decode-plus-us":"VIN decode Plus",
    "cepik-pojazdy":"Форма выше",
    "basic-vin-decode":"Расшифровать VIN",
    "advanced-vin-decode":"Расширенный decode",
    "europe-vin-decode":"EU VIN decode",
    "market-value":"Оценить стоимость",
    "sales-history":"История продаж",
    "auction":"Аукционы",
    "stolen-check":"Проверить угон",
    "title-check":"Проверить title",
    "vehicle-recalls":"Проверить отзывы",
    "vehicle-repairs":"Ремонты",
    "repair-estimates":"Оценка ремонта",
    "vehicle-maintenance":"Регламент ТО",
    "dimensions":"Размеры и база",
    "windshield":"Стекло",
    "vin-suggestion":"VIN подсказки",
    "owner-manual":"Мануал",
  };

  if(labels[source.key])return labels[source.key];
  return source.fetchableByVehicleVin?'Получить отчёт':'Отдельная форма';
}

const CEPIK_WOJEWODZTWA:Array<{code:string;name:string}>=[
  {code:"02",name:"DOLNOŚLĄSKIE"},
  {code:"04",name:"KUJAWSKO-POMORSKIE"},
  {code:"06",name:"LUBELSKIE"},
  {code:"08",name:"LUBUSKIE"},
  {code:"10",name:"ŁÓDZKIE"},
  {code:"12",name:"MAŁOPOLSKIE"},
  {code:"14",name:"MAZOWIECKIE"},
  {code:"16",name:"OPOLSKIE"},
  {code:"18",name:"PODKARPACKIE"},
  {code:"20",name:"PODLASKIE"},
  {code:"22",name:"POMORSKIE"},
  {code:"24",name:"ŚLĄSKIE"},
  {code:"26",name:"ŚWIĘTOKRZYSKIE"},
  {code:"28",name:"WARMIŃSKO-MAZURSKIE"},
  {code:"30",name:"WIELKOPOLSKIE"},
  {code:"32",name:"ZACHODNIOPOMORSKIE"},
  {code:"XX",name:"NIEOKREŚLONE"},
];

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
