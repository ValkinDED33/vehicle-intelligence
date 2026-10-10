import { useEffect, useState, type ReactNode } from "react";
import { ChartNoAxesCombined, Check, ChevronDown, Download, Loader2, LogOut, MessageCircle, PlugZap } from "lucide-react";
import { API_BASE, externalReportsApi, fmtDate, profileApi, type ExternalReport, type ReportSource, type SourceFetchSummary, type UserLanguage, type Vehicle, type VehicleProfile } from "../api";
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
  const otherSources=sources.filter(s=>!s.key.startsWith('oneauto-')&&s.key!=='cepik-pojazdy'&&s.fetchableByVehicleVin&&s.input!=='vin');
  const wojewodztwoOptions=CEPIK_WOJEWODZTWA;
  const toggleProvider=(key:string)=>setOpenProviders(prev=>({...prev,[key]:!prev[key]}));
  const fetchAll=async()=>{
    setBusy('all');setMessage(null);setResults(null);
    try{
      const res=await externalReportsApi.fetchAll(vehicle.id);
      setResults(res);
      const ok=res.filter(r=>r.status==='success'||r.status==='no-data').length;
      setMessage({kind:'ok',text:`Опрацьовано VIN-джерел: ${res.length} з ${vinSources.length} (успішно/без даних: ${ok}).`});
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
      setMessage({kind:'ok',text:`${key}: звіт OneAutoAPI збережено. Перевірте raw-відповідь перед перенесенням у підтверджений профіль.`});
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
      setMessage({kind:'ok',text:'CEPiK збережено як альтернативний звіт. Перевірте дані перед перенесенням у підтверджений профіль.'});
      await afterMutate();
    }catch(err){setMessage({kind:'err',text:errText(err)})}finally{setBusy(null)}
  };
  const fetchCepikDetail=async()=>{
    setBusy('cepik-pojazdy-detail');setMessage(null);setResults(null);
    try{
      const res=await externalReportsApi.fetchCepikVehicleById(vehicle.id,cepik.detailId);
      setResults([{source:'cepik-pojazdy-detail',status:res.report.status,reportId:res.report.id}]);
      setMessage({kind:'ok',text:'CEPiK detail збережено як окремий звіт за технічним ID запису.'});
      await afterMutate();
    }catch(err){setMessage({kind:'err',text:errText(err)})}finally{setBusy(null)}
  };
  return <>
   <TelegramIntegrationCard />
   <div className="page-actions">
    <button className="primary" onClick={()=>void fetchAll()} disabled={busy!==null||vinSources.length===0||!vehicle.vin}>{busy==='all'?<Loader2 size={15} className="spin"/>:<Download size={15}/>} {busy==='all'?'ЗАБИРАЄМО ЗВІТИ...':'ЗАВАНТАЖИТИ VIN-ЗВІТИ'}</button>
    <span className="hint-note">Vehicle Databases працює за VIN. CEPiK нижче — окрема польська альтернатива за регіоном і періодом реєстрації.</span>
   </div>
   {!vehicle.vin&&<div className="state-note">VIN-джерела недоступні, бо для автомобіля не вказано VIN. CEPiK можна запросити окремо, якщо відомі регіон і період реєстрації в Польщі.</div>}
   {message&&<div className={message.kind==='ok'?'ok-note':'auth-error'}>{message.text}</div>}
   <ProviderAccordion title="OneAutoAPI" meta={`${oneAutoSources.length} VIN-джерел`} open={openProviders.oneauto} onToggle={()=>toggleProvider('oneauto')}>
    <div className="sources-grid">
     {oneAutoSources.map(s=><SourceCard key={s.key} source={s} result={results?.find(r=>r.source===s.key)} busy={busy} vehicleHasVin={Boolean(vehicle.vin)} onClick={()=>void fetchOneAuto(s.key)}/>)}
     {!oneAutoSources.length&&<div className="state-note">Джерела OneAutoAPI не знайдено.</div>}
    </div>
   </ProviderAccordion>
   <ProviderAccordion title="CEPiK" meta="польский реестр" open={openProviders.cepik} onToggle={()=>toggleProvider('cepik')}>
    <div className="cepik-grid">
      <label><span>Województwo</span><select value={cepik.wojewodztwo} onChange={e=>setCepik({...cepik,wojewodztwo:e.target.value})}>{wojewodztwoOptions.map(w=><option key={w.code} value={w.code}>{w.code} · {w.name}</option>)}</select></label>
      <label><span>Дата від YYYYMMDD</span><input value={cepik.dataOd} onChange={e=>setCepik({...cepik,dataOd:e.target.value.replace(/[^\d]/g,'').slice(0,8)})} placeholder="20070101"/></label>
      <label><span>Дата до YYYYMMDD</span><input value={cepik.dataDo} onChange={e=>setCepik({...cepik,dataDo:e.target.value.replace(/[^\d]/g,'').slice(0,8)})} placeholder="20071231"/></label>
      <label><span>Тип дати</span><select value={cepik.typDaty} onChange={e=>setCepik({...cepik,typDaty:e.target.value as '1'|'2'})}><option value="1">перша реєстрація в PL</option><option value="2">остання реєстрація</option></select></label>
      <label><span>Лимит</span><input value={cepik.limit} onChange={e=>setCepik({...cepik,limit:e.target.value.replace(/[^\d]/g,'')})} placeholder="25"/></label>
      <label><span>CEPiK ID запису</span><input value={cepik.detailId} onChange={e=>setCepik({...cepik,detailId:e.target.value.replace(/[^\d]/g,'')})} placeholder="id з /pojazdy"/></label>
     </div>
     <div className="page-actions">
      <button className="ghost-btn save-profile-btn" onClick={()=>void fetchCepik()} disabled={busy!==null||!cepik.wojewodztwo||!cepik.dataOd}>{busy==='cepik-pojazdy'?<Loader2 size={15} className="spin"/>:<Download size={15}/>} ПОШУК CEPIK</button>
      <button className="ghost-btn save-profile-btn" onClick={()=>void fetchCepikDetail()} disabled={busy!==null||!cepik.detailId}>{busy==='cepik-pojazdy-detail'?<Loader2 size={15} className="spin"/>:<Download size={15}/>} ДЕТАЛІ ЗА ID</button>
     </div>
   </ProviderAccordion>
   <ProviderAccordion title="Vehicle Databases" meta={`${vehicleDatabaseSources.length} VIN-джерел`} open={openProviders.vehicleDatabases} onToggle={()=>toggleProvider('vehicleDatabases')}>
    <div className="sources-grid">
     {vehicleDatabaseSources.map(s=><SourceCard key={s.key} source={s} result={results?.find(r=>r.source===s.key)} busy={busy} vehicleHasVin={Boolean(vehicle.vin)} onClick={()=>void fetchOne(s.key)}/>)}
    </div>
   </ProviderAccordion>
   {otherSources.length>0&&<ProviderAccordion title="Окремі потоки" meta={`${otherSources.length} джерел`} open={openProviders.other} onToggle={()=>toggleProvider('other')}>
    <div className="sources-grid">
     {otherSources.map(s=><SourceCard key={s.key} source={s} result={results?.find(r=>r.source===s.key)} busy={busy} vehicleHasVin={Boolean(vehicle.vin)} onClick={()=>void fetchOne(s.key)}/>)}
    </div>
   </ProviderAccordion>}
   {results&&results.length>1&&<div className="panel list-panel">
    <h2>РЕЗУЛЬТАТИ ЗАВАНТАЖЕННЯ</h2>
    <table className="data-table"><thead><tr><th>Джерело</th><th>Статус</th><th>Деталі</th></tr></thead><tbody>
     {results.map(r=><tr key={r.source}><td>{r.source}</td><td><span className={'tag '+(r.status==='success'?'green':r.status==='no-data'?'purple':'red')}>{r.status}</span></td><td>{r.error??(r.reportId?'звіт збережено':'—')}</td></tr>)}
    </tbody></table>
   </div>}
   <div className="panel list-panel">
    <h2>ОСТАННІ ПОДІЇ ЗІ ЗВІТІВ</h2>
    {data.events.filter(e=>e.type.startsWith('external.')).slice(0,8).map(e=><EventCard key={e.id} event={e}/>)}
    {!data.events.some(e=>e.type.startsWith('external.'))&&<div className="state-note">Подій із зовнішніх джерел поки немає.</div>}
   </div>
  </>;
}

function TelegramIntegrationCard(){
  const botUrl=getTelegramBotUrl();
  const inTelegram=Boolean(window.Telegram?.WebApp?.initData);

  return <section className="panel telegram-panel">
   <div className="telegram-panel-copy">
    <span className="icon-disc"><MessageCircle size={18}/></span>
    <div>
     <h2>TELEGRAM</h2>
     <p>{inTelegram?'Mini App відкрито через Telegram.':'Бот доступний як другий інтерфейс CARA.'}</p>
     <small>/garage · /addcar · /mileage · /expense · /fuel · /charge · /service · /document · /ask</small>
    </div>
   </div>
   {botUrl
    ?<a className="primary telegram-panel-action" href={botUrl} target="_blank" rel="noreferrer">ВІДКРИТИ БОТА</a>
    :<span className="hint-note">Додайте VITE_TELEGRAM_BOT_USERNAME, щоб показати кнопку бота.</span>}
  </section>;
}

function getTelegramBotUrl():string|null{
  const username=(import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string|undefined)?.trim();
  return username?`https://t.me/${username.replace(/^@/,"")}`:null;
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
  const copy=copyForSource(source);
  const separateFlow=!source.fetchableByVehicleVin&&source.key!=='cepik-pojazdy';
  const disabled=busy!==null||separateFlow||(!vehicleHasVin&&source.fetchableByVehicleVin);
  return <div className="panel source-card">
   <div className={'icon-disc '+(result?.status==='success'?'green':'')}><PlugZap size={17}/></div>
   <div className="source-copy"><b>{copy.title}</b><small>{copy.description}</small></div>
   <button className="ghost-btn" onClick={onClick} disabled={disabled}>{busy===source.key?'...':copy.button}</button>
  </div>;
}

function copyForSource(source:ReportSource):{title:string;description:string;button:string}{
  const copies:Record<string,{title:string;description:string;button:string}>={
    "oneauto-oe-build-sheet-europe-vin":{title:"Комплектація EU",description:"Заводська комплектація й опції за VIN",button:"Отримати"},
    "oneauto-oe-build-sheet-vin":{title:"Заводський лист",description:"Build sheet: комплектація, пакети, опції",button:"Отримати"},
    "oneauto-oe-service-schedule-vin":{title:"Регламент ТО",description:"Заводський графік обслуговування за VIN",button:"Отримати"},
    "oneauto-recall-check-vin":{title:"Перевірка recall",description:"Чи є сервісні кампанії за VIN",button:"Перевірити"},
    "oneauto-recall-report-vin":{title:"Звіт по recall",description:"Подробиці сервісних кампаній",button:"Отримати"},
    "oneauto-vin-decode-basic-us":{title:"VIN база US",description:"Базове розшифрування для ринку США",button:"Перевірити"},
    "oneauto-vin-decode-plus-us":{title:"VIN розширений US",description:"Розширене розшифрування для ринку США",button:"Перевірити"},
    "cepik-pojazdy":{title:"CEPiK пошук",description:"Польський реєстр за регіоном і датами",button:"Форма вище"},
    "basic-vin-decode":{title:"VIN базовий",description:"Марка, модель, рік і базові параметри",button:"Отримати"},
    "advanced-vin-decode":{title:"VIN розширений",description:"Більше технічних полів за VIN",button:"Отримати"},
    "europe-vin-decode":{title:"VIN Європа",description:"Європейське розшифрування VIN",button:"Отримати"},
    "market-value":{title:"Ринкова ціна",description:"Оцінка вартості за VIN/YMM",button:"Оцінити"},
    "sales-history":{title:"Історія продажів",description:"Знайдені минулі продажі",button:"Отримати"},
    "auction":{title:"Аукціони",description:"Аукціонні записи за VIN",button:"Перевірити"},
    "stolen-check":{title:"Перевірка викрадення",description:"Бази викрадених авто",button:"Перевірити"},
    "title-check":{title:"Title check",description:"Статус title / брендовані записи",button:"Перевірити"},
    "vehicle-recalls":{title:"Сервісні кампанії",description:"Recall/кампанії виробника",button:"Перевірити"},
    "vehicle-repairs":{title:"Ремонти",description:"Типові ремонти за моделлю/VIN",button:"Отримати"},
    "repair-estimates":{title:"Вартість ремонту",description:"Оцінки робіт і деталей",button:"Оцінити"},
    "vehicle-maintenance":{title:"ТО й обслуговування",description:"Регламент та інтервали обслуговування",button:"Отримати"},
    "dimensions":{title:"Розміри авто",description:"Колісна база, колія й габарити",button:"Отримати"},
    "windshield":{title:"Лобове скло",description:"Підбір windshield за VIN",button:"Підібрати"},
    "vin-suggestion":{title:"VIN підказки",description:"Схожі/можливі VIN",button:"Отримати"},
    "owner-manual":{title:"Інструкція власника",description:"Інструкція власника за VIN/YMM",button:"Знайти"},
    "motorcycle-decode":{title:"Мото VIN",description:"Вимкнено для автомобільного гаража",button:"Недоступно"},
    "electric-vehicle-specifications":{title:"EV характеристики",description:"Потрібен окремий YMMT-потік: рік, марка, модель і trim",button:"Отримати"},
    "vehicle-warranty":{title:"Гарантія",description:"Потрібен окремий YMM-потік: рік, марка й модель",button:"Отримати"},
    "ymmt-specifications":{title:"YMMT специфікації",description:"Потрібен окремий YMMT-потік: рік, марка, модель і trim",button:"Отримати"},
    "uk-registration-decode":{title:"UK номер",description:"Потрібен окремий потік за британським номером",button:"Отримати"},
    "license-plate-ocr":{title:"OCR номера",description:"Потрібен upload зображення номера",button:"Отримати"},
    "vin-ocr":{title:"OCR VIN",description:"Потрібен upload фото VIN",button:"Отримати"},
    "oem-parts":{title:"OEM деталі",description:"Потрібен окремий потік YMMT/каталогу деталі",button:"Отримати"},
  };

  if(copies[source.key])return copies[source.key];
  return {
    title:source.apiName,
    description:source.note??(source.fetchableByVehicleVin?"Звіт за VIN":`Потрібен ввід: ${source.input}`),
    button:"Отримати",
  };
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
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [query,setQuery]=useState("");
  const [provider,setProvider]=useState("all");
  const [status,setStatus]=useState("all");
  const [type,setType]=useState("all");
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
  const providers=uniqueSorted(reports.map(r=>r.provider));
  const statuses=uniqueSorted(reports.map(r=>r.status));
  const types=uniqueSorted(reports.map(r=>r.reportType));
  const filteredReports=reports.filter(report=>{
    const text=[report.reportType,humanReportType(report.reportType),report.provider,report.status,report.vin].filter(Boolean).join(" ").toLowerCase();
    return (provider==="all"||report.provider===provider)&&
      (status==="all"||report.status===status)&&
      (type==="all"||report.reportType===type)&&
      (!query.trim()||text.includes(query.trim().toLowerCase()));
  });
  const selected=filteredReports.find(r=>r.id===selectedId)??filteredReports[0]??reports.find(r=>r.id===selectedId)??null;
  const resetFilters=()=>{setQuery("");setProvider("all");setStatus("all");setType("all")};
  return reports.length
   ?<>
    <div className="panel list-panel">
      <div className="reports-head">
       <h2>ЗБЕРЕЖЕНІ ЗВІТИ ({filteredReports.length}/{reports.length})</h2>
       <button className="ghost-btn" onClick={resetFilters} disabled={!query&&provider==="all"&&status==="all"&&type==="all"}>Скинути</button>
      </div>
      <div className="reports-filter">
       <label><span>Пошук</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="VIN, провайдер, тип звіту"/></label>
       <label><span>Провайдер</span><select value={provider} onChange={e=>setProvider(e.target.value)}><option value="all">Усі</option>{providers.map(item=><option key={item} value={item}>{item}</option>)}</select></label>
       <label><span>Статус</span><select value={status} onChange={e=>setStatus(e.target.value)}><option value="all">Усі</option>{statuses.map(item=><option key={item} value={item}>{item}</option>)}</select></label>
       <label><span>Тип</span><select value={type} onChange={e=>setType(e.target.value)}><option value="all">Усі</option>{types.map(item=><option key={item} value={item}>{humanReportType(item)}</option>)}</select></label>
      </div>
      <table className="data-table"><thead><tr><th>Тип</th><th>Провайдер</th><th>VIN</th><th>Статус</th><th>Отримано</th><th></th></tr></thead><tbody>
       {filteredReports.map(r=><tr key={r.id}><td><b>{humanReportType(r.reportType)}</b><small className="sub">{r.reportType}</small></td><td>{r.provider}</td><td className="mono">{r.vin??'—'}</td><td><span className={'tag '+(r.status==='success'?'green':r.status==='no-data'?'purple':'red')}>{r.status}</span></td><td>{fmtDate(r.fetchedAt,true)}</td><td><button className="ghost-btn" onClick={()=>setSelectedId(r.id)}>{selected?.id===r.id?'Відкрито':'Відкрити'}</button></td></tr>)}
      </tbody></table>
      {!filteredReports.length&&<div className="state-note">За цими фільтрами звітів немає.</div>}
    </div>
    {selected&&<ReportViewer report={selected} vehicle={vehicle} currentProfile={props.data.profile} afterMutate={props.afterMutate}/>}
   </>
   :<EmptyState icon={ChartNoAxesCombined} title="Звітів поки немає" text="Завантажте звіти в розділі «Інтеграції» — сирі відповіді Vehicle Databases збережуться тут назавжди."/>;
}

function uniqueSorted(values:string[]):string[]{
  return Array.from(new Set(values.filter(Boolean))).sort((a,b)=>a.localeCompare(b));
}

function ReportViewer({report,vehicle,currentProfile,afterMutate}:{report:ExternalReport;vehicle:Vehicle;currentProfile:VehicleProfile|null;afterMutate:()=>Promise<void>}){
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState<{kind:'ok'|'err';text:string}|null>(null);
  const facts=flattenReportFacts(report.rawPayload).slice(0,80);
  const oneAutoBuildSheet=isOneAutoBuildSheet(report);
  const draft=oneAutoBuildSheet?profileDraftFromOneAutoBuildSheet(report.rawPayload):null;
  const transferFields=draft?profileTransferFields(draft):[];
  const warnings=buildReportWarnings(report,vehicle,currentProfile,draft);
  const [selectedFields,setSelectedFields]=useState<Array<keyof VehicleProfile>>([]);
  useEffect(()=>{
    setSelectedFields(warnings.some(w=>w.level==="danger")?[]:transferFields.map(field=>field.key));
  },[report.id]);
  const saveDraft=async()=>{
    if(!draft||selectedFields.length===0)return;
    const selectedDraft:Partial<VehicleProfile>={source:draft.source??"manual-oneauto"};
    selectedFields.forEach(key=>{
      selectedDraft[key]=draft[key] as never;
    });
    setSaving(true);setMessage(null);
    try{
      await profileApi.create(vehicle.id,selectedDraft);
      setMessage({kind:'ok',text:'Дані зі звіту перенесено в профіль. Старі ручні поля, яких немає у звіті, збережено.'});
      await afterMutate();
    }catch(err){setMessage({kind:'err',text:errText(err)})}finally{setSaving(false)}
  };
  const toggleField=(key:keyof VehicleProfile)=>setSelectedFields(prev=>prev.includes(key)?prev.filter(item=>item!==key):[...prev,key]);
  return <div className="panel report-viewer">
   <div className="decode-head">
    <div>
     <h2>{humanReportType(report.reportType)}</h2>
     <p>{report.provider} · {fmtDate(report.fetchedAt,true)} · {facts.length} полів показано</p>
    </div>
    <span className="decode-vin">{report.vin??'без VIN'}</span>
   </div>
   {message&&<div className={message.kind==='ok'?'ok-note':'auth-error'}>{message.text}</div>}
   {warnings.length>0&&<div className="report-warnings">
    {warnings.map(w=><div key={w.text} className={'report-warning '+w.level}>{w.text}</div>)}
   </div>}
   {oneAutoBuildSheet?<OneAutoBuildSheetView payload={report.rawPayload}/>
    :facts.length?<div className="decode-grid">
    {facts.map(f=><div key={f.path} className="decode-item"><span>{f.path}</span><b>{f.value}</b></div>)}
   </div>:<div className="state-note">У звіті немає простих полів для показу.</div>}
   {draft&&transferFields.length>0&&<section className="transfer-panel">
    <div className="transfer-head">
     <div>
      <h3>Перенесення в профіль</h3>
      <p>Оберіть лише ті поля, які реально збігаються з автомобілем.</p>
     </div>
     <span className="tag purple">{selectedFields.length} вибрано</span>
    </div>
    <div className="transfer-table">
     {transferFields.map(field=>{
      const current=currentProfile?.[field.key];
      const changed=stringValue(current)!==stringValue(field.value);
      return <label key={field.key} className={'transfer-row '+(changed?'changed':'same')}>
       <input type="checkbox" checked={selectedFields.includes(field.key)} onChange={()=>toggleField(field.key)}/>
       <span className="transfer-label">{field.label}</span>
       <span><small>Зараз</small><b>{displayProfileValue(field.key,current)}</b></span>
       <span><small>Зі звіту</small><b>{displayProfileValue(field.key,field.value)}</b></span>
      </label>;
     })}
    </div>
    <div className="page-actions report-actions">
     <button className="primary" onClick={()=>void saveDraft()} disabled={saving||selectedFields.length===0}>{saving?<Loader2 size={15} className="spin"/>:<Check size={15}/>} ЗАСТОСУВАТИ ВИБРАНЕ</button>
     <span className="hint-note">Комплектацію, двері, пальне й кузов OneAuto тут не підтверджує — їх залишаємо ручним профілем.</span>
    </div>
   </section>}
   <details className="raw-report"><summary>RAW JSON</summary><pre>{JSON.stringify(report.rawPayload,null,2)}</pre></details>
  </div>;
}

function OneAutoBuildSheetView({payload}:{payload:unknown}){
  const result=isRecord(payload)&&isRecord(payload.result)?payload.result:null;
  const options=Array.isArray(result?.options)?result.options.filter(isRecord):[];
  const summary=[
    ["Колір",stringValue(result?.oem_colour_desc)],
    ["Салон",stringValue(result?.oem_interior_trim_desc)],
    ["Двигун",stringValue(result?.oem_engine_desc)],
    ["Коробка",stringValue(result?.oem_transmission_type_desc)],
    ["Привід",stringValue(result?.oem_drivetrain_desc)],
    ["Колеса",stringValue(result?.oem_wheel_desc)],
    ["Дата виробництва",stringValue(result?.manufactured_date)],
    ["Дата постачання",stringValue(result?.delivered_date)],
  ].filter(([,value])=>value);

  return <>
   {summary.length>0&&<section className="decode-group">
    <h3>Підсумок build sheet</h3>
    <div className="decode-grid">{summary.map(([label,value])=><div key={label} className="decode-item"><span>{label}</span><b>{value}</b></div>)}</div>
   </section>}
   {options.length>0&&<section className="report-options">
    <h3>Заводські опції ({options.length})</h3>
    <table className="data-table"><thead><tr><th>Код</th><th>Опція</th><th>Коментар</th></tr></thead><tbody>
     {options.map((option,index)=><tr key={`${stringValue(option.factory_code)??index}-${index}`}>
      <td className="mono">{stringValue(option.factory_code)??'—'}</td>
      <td><b>{stringValue(option.factory_desc)??'—'}</b></td>
      <td>{stringValue(option.additional_desc)??'—'}</td>
     </tr>)}
    </tbody></table>
   </section>}
   {!summary.length&&!options.length&&<div className="state-note">OneAuto build sheet збережено, але очікуваних полів result/options немає. Відкрийте RAW JSON нижче.</div>}
  </>;
}

function humanReportType(type:string):string{
  const names:Record<string,string>={
    "oneauto-oe-build-sheet-europe-vin":"Комплектація EU",
    "oneauto-oe-build-sheet-vin":"Заводський лист",
    "oneauto-oe-service-schedule-vin":"Регламент ТО",
    "oneauto-recall-check-vin":"Перевірка recall",
    "oneauto-recall-report-vin":"Звіт по recall",
    "oneauto-vin-decode-basic-us":"VIN база US",
    "oneauto-vin-decode-plus-us":"VIN розширений US",
    "cepik-pojazdy":"CEPiK пошук",
    "cepik-pojazdy-detail":"CEPiK деталі",
  };
  return names[type]??type;
}

function isOneAutoBuildSheet(report:ExternalReport):boolean{
  return report.provider==="oneauto"&&(
    report.reportType==="oneauto-oe-build-sheet-europe-vin"||
    report.reportType==="oneauto-oe-build-sheet-vin"
  );
}

function profileDraftFromOneAutoBuildSheet(payload:unknown):Partial<VehicleProfile>|null{
  const result=isRecord(payload)&&isRecord(payload.result)?payload.result:null;
  if(!result)return null;
  const engine=stringValue(result.oem_engine_desc);
  const transmission=stringValue(result.oem_transmission_type_desc);
  const drive=stringValue(result.oem_drivetrain_desc);
  const color=stringValue(result.oem_colour_desc);
  const draft:Partial<VehicleProfile>={source:"manual-oneauto"};
  if(engine)draft.engineFamily=truncate(engine,120);
  if(transmission){
    draft.transmissionType=normalizeTransmission(transmission);
    draft.transmissionCode=truncate(firstCode(transmission),64);
  }
  if(drive)draft.driveType=normalizeDrive(drive);
  if(color)draft.exteriorColor=truncate(color,120);
  return Object.keys(draft).length>1?draft:null;
}

function buildReportWarnings(report:ExternalReport,vehicle:Vehicle,currentProfile:VehicleProfile|null,draft:Partial<VehicleProfile>|null):Array<{level:"warn"|"danger";text:string}>{
  const warnings:Array<{level:"warn"|"danger";text:string}>=[];
  const reportVin=report.vin?.trim().toUpperCase();
  const vehicleVin=vehicle.vin?.trim().toUpperCase();
  if(reportVin&&vehicleVin&&reportVin!==vehicleVin){
    warnings.push({level:"danger",text:`VIN звіту ${reportVin} не збігається з поточним VIN ${vehicleVin}. Перенесення заблоковано за замовчуванням.`});
  }
  if(looksLikeOneAutoDemoPayload(report.rawPayload)){
    warnings.push({level:"danger",text:"Звіт схожий на sandbox/demo OneAuto: є тестові коди або демонстраційні поля. Позначки знято, застосовуйте тільки після ручної перевірки RAW JSON."});
  }
  if(draft&&currentProfile){
    const conflicts=profileTransferFields(draft).filter(field=>{
      const current=currentProfile[field.key];
      return stringValue(current)&&stringValue(field.value)&&stringValue(current)!==stringValue(field.value);
    });
    if(conflicts.length>0){
      warnings.push({level:"warn",text:`Є розбіжності з поточним профілем: ${conflicts.map(c=>c.label).join(", ")}. Перевірте перед застосуванням.`});
    }
  }
  return warnings;
}

function looksLikeOneAutoDemoPayload(payload:unknown):boolean{
  const result=isRecord(payload)&&isRecord(payload.result)?payload.result:null;
  if(!result)return false;
  const options=Array.isArray(result.options)?result.options.filter(isRecord):[];
  const hasDemoCodes=options.some(option=>["123456","234567"].includes(stringValue(option.factory_code)??""));
  const hasPlaceholderError=stringValue(payload&&isRecord(payload)?payload.error:null)?.toLowerCase().includes("if there is an error");
  const hasMythicalColor=stringValue(result.oem_colour_desc)?.toLowerCase().includes("mythical")??false;
  return hasDemoCodes||Boolean(hasPlaceholderError)||hasMythicalColor;
}

function profileTransferFields(draft:Partial<VehicleProfile>):Array<{key:keyof VehicleProfile;label:string;value:unknown}>{
  const fields:Array<{key:keyof VehicleProfile;label:string;value:unknown}>=[
    {key:"exteriorColor",label:"Колір",value:draft.exteriorColor},
    {key:"engineFamily",label:"Двигун",value:draft.engineFamily},
    {key:"transmissionType",label:"Тип коробки",value:draft.transmissionType},
    {key:"transmissionCode",label:"Код коробки",value:draft.transmissionCode},
    {key:"driveType",label:"Привід",value:draft.driveType},
  ];
  return fields.filter(field=>field.value!==undefined&&field.value!==null&&String(field.value).trim()!=="");
}

function displayProfileValue(key:keyof VehicleProfile,value:unknown):string{
  const text=stringValue(value);
  if(!text)return "—";
  if(key==="transmissionType")return formatTransferTransmission(text);
  if(key==="driveType")return formatTransferDrive(text);
  return text;
}

function formatTransferTransmission(value:string):string{
  const names:Record<string,string>={
    manual:"механіка",
    automatic:"автомат",
    dct:"робот/DCT",
    cvt:"варіатор",
    "single-speed":"одноступенева",
    other:"інше",
  };
  return names[value]??value;
}

function formatTransferDrive(value:string):string{
  const names:Record<string,string>={
    fwd:"передній",
    rwd:"задній",
    awd:"повний AWD",
    "4wd":"повний 4WD",
    other:"інше",
  };
  return names[value]??value;
}

function normalizeTransmission(value:string):VehicleProfile["transmissionType"]{
  const lower=value.toLowerCase();
  if(lower.includes("manual"))return "manual";
  if(lower.includes("dct")||lower.includes("dual clutch")||lower.includes("dsg"))return "dct";
  if(lower.includes("cvt"))return "cvt";
  if(lower.includes("single-speed"))return "single-speed";
  if(lower.includes("automatic")||lower.includes("auto"))return "automatic";
  return "other";
}

function normalizeDrive(value:string):VehicleProfile["driveType"]{
  const lower=value.toLowerCase();
  if(lower.includes("all-wheel")||lower.includes("awd"))return "awd";
  if(lower.includes("four-wheel")||lower.includes("4wd")||lower.includes("4x4"))return "4wd";
  if(lower.includes("front-wheel")||lower.includes("fwd"))return "fwd";
  if(lower.includes("rear-wheel")||lower.includes("rwd"))return "rwd";
  return "other";
}

function firstCode(value:string):string{
  return value.match(/^[A-Z0-9]{2,8}\b/)?.[0]??value;
}

function truncate(value:string,max:number):string{
  return value.length>max?value.slice(0,max):value;
}

function isRecord(value:unknown):value is Record<string,unknown>{
  return typeof value==="object"&&value!==null&&!Array.isArray(value);
}

function stringValue(value:unknown):string|null{
  if(value===null||value===undefined)return null;
  const stringified=String(value).trim();
  return stringified?stringified:null;
}

function flattenReportFacts(value:unknown,path=""):Array<{path:string;value:string}>{
  if(value===null||value===undefined||value==="")return [];
  if(typeof value==="string"||typeof value==="number"||typeof value==="boolean"){
    return [{path:path||"value",value:String(value)}];
  }
  if(Array.isArray(value)){
    return value.flatMap((item,index)=>flattenReportFacts(item,path?`${path}.${index}`:`${index}`));
  }
  if(typeof value==="object"){
    return Object.entries(value as Record<string,unknown>).flatMap(([key,item])=>{
      const nextPath=path?`${path}.${key}`:key;
      return flattenReportFacts(item,nextPath);
    });
  }
  return [{path:path||"value",value:String(value)}];
}

function SettingsPage(props:PageProps){
  const {userName,logout}=props;
  const {user,updateLanguage}=useAuth();
  const botUrl=getTelegramBotUrl();
  const [languageSaving,setLanguageSaving]=useState(false);
  const [languageMessage,setLanguageMessage]=useState<string|null>(null);
  const currentLanguage=(user?.language==="uk"||user?.language==="pl"||user?.language==="en")?user.language:"uk";
  const changeLanguage=async(language:UserLanguage)=>{
    setLanguageSaving(true);
    setLanguageMessage(null);
    try{
      await updateLanguage(language);
      setLanguageMessage("Мову збережено.");
    }catch(err){
      setLanguageMessage(errText(err));
    }finally{
      setLanguageSaving(false);
    }
  };
  return <>
   <div className="panel list-panel">
    <h2>ПРОФІЛЬ КОРИСТУВАЧА</h2>
    <div className="settings-grid">
     <div><span>Ім’я</span><b>{userName}</b></div>
     <div><span>Email</span><b>{user?.email??'—'}</b></div>
     <div><span>Країна</span><b>{user?.country??'—'}</b></div>
     <div><span>Мова</span><b>{user?.language??'—'}</b></div>
     <div><span>API</span><b className="mono">{API_BASE||'same-origin'}</b></div>
    </div>
    <div className="settings-language">
     <label className="field">
      <span>Мова інтерфейсу</span>
      <select value={currentLanguage} onChange={e=>void changeLanguage(e.target.value as UserLanguage)} disabled={languageSaving}>
       <option value="uk">🇺🇦 Українська</option>
       <option value="pl">🇵🇱 Polski</option>
       <option value="en">🇬🇧 English</option>
      </select>
     </label>
     {languageSaving&&<span className="hint-note">Зберігаємо...</span>}
     {languageMessage&&<span className="hint-note">{languageMessage}</span>}
    </div>
    <div className="page-actions">
     <button className="ghost-btn danger" onClick={logout}><LogOut size={15}/> Вийти з акаунта</button>
    </div>
   </div>
   <div className="panel list-panel">
    <h2>TELEGRAM ДОСТУП</h2>
    <div className="settings-grid">
     <div><span>Статус</span><b>Увімкнено</b></div>
     <div><span>Авторизація</span><b>Telegram Mini App + JWT</b></div>
     <div><span>Команди</span><b>/ask · /garage · /mileage · /expense</b></div>
    </div>
    {botUrl&&<div className="page-actions"><a className="ghost-btn" href={botUrl} target="_blank" rel="noreferrer"><MessageCircle size={15}/> Відкрити Telegram-бота</a></div>}
   </div>
   <div className="panel list-panel">
    <h2>ПРО ПЛАТФОРМУ</h2>
    <p className="about-text">CARA — єдиний профіль автомобіля: VIN-декодування, історія продажів, аукціони, оцінки, recall, перевірки на викрадення (Vehicle Databases) плюс ваші записи пробігу, витрат, пального й ТО. AI працює лише поверх фактів.</p>
   </div>
  </>;
}

function ExternalRouter(props: PageProps & { page: string }) {
  const { page } = props;
  if (page === "Інтеграції") return <IntegrationsPage {...props} />;
  if (page === "Звіти") return <ReportsPage {...props} />;
  if (page === "Налаштування") return <SettingsPage {...props} />;
  return null;
}

// ---------- root ----------

export { IntegrationsPage, ReportsPage, SettingsPage, ExternalRouter as ExternalPages };
