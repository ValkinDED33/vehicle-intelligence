import { t, enumLabel } from "../i18n";
import { LanguagePicker } from "../components/LanguagePicker";
import { useEffect, useState, type ReactNode } from "react";
import { ChartNoAxesCombined, Check, ChevronDown, Download, Loader2, LogOut, MessageCircle, PlugZap } from "lucide-react";
import { API_BASE, authApi, externalReportsApi, fmtDate, profileApi, type ExternalReport, type ReportSource, type SourceFetchSummary, type UserLanguage, type Vehicle, type VehicleProfile } from "../api";
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
  if(!vehicle)return <><TelegramIntegrationCard/><NoVehicle onGoGarage={()=>props.navigate('Гараж')}/></>;
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
      setMessage({kind:'ok',text:t("Опрацьовано VIN-джерел: {0} з {1} (успішно/без даних: {2}).", { 0: res.length, 1: vinSources.length, 2: ok })});
      await afterMutate();
    }catch(err){setMessage({kind:'err',text:errText(err)})}finally{setBusy(null)}
  };
  const fetchOne=async(key:string)=>{
    setBusy(key);setMessage(null);
    try{
      const res=await fetchOneSource(vehicle.id,key);
      setResults([res]);
      setMessage({kind:res.status==='error'?'err':'ok',text:`${key}: ${enumLabel(res.status)}${res.error?` — ${res.error}`:''}`});
      await afterMutate();
    }catch(err){setMessage({kind:'err',text:errText(err)})}finally{setBusy(null)}
  };
  const fetchOneAuto=async(key:string)=>{
    setBusy(key);setMessage(null);
    try{
      const res=await externalReportsApi.fetchOneAutoSource(vehicle.id,key);
      setResults([{source:key,status:res.report.status,reportId:res.report.id}]);
      setMessage({kind:'ok',text:t("{0}: звіт OneAutoAPI збережено. Перевірте raw-відповідь перед перенесенням у підтверджений профіль.", { 0: key })});
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
      setMessage({kind:'ok',text:t("CEPiK збережено як альтернативний звіт. Перевірте дані перед перенесенням у підтверджений профіль.")});
      await afterMutate();
    }catch(err){setMessage({kind:'err',text:errText(err)})}finally{setBusy(null)}
  };
  const fetchCepikDetail=async()=>{
    setBusy('cepik-pojazdy-detail');setMessage(null);setResults(null);
    try{
      const res=await externalReportsApi.fetchCepikVehicleById(vehicle.id,cepik.detailId);
      setResults([{source:'cepik-pojazdy-detail',status:res.report.status,reportId:res.report.id}]);
      setMessage({kind:'ok',text:t("CEPiK detail збережено як окремий звіт за технічним ID запису.")});
      await afterMutate();
    }catch(err){setMessage({kind:'err',text:errText(err)})}finally{setBusy(null)}
  };
  return <>
   <TelegramIntegrationCard />
   <div className="page-actions">
    <button className="primary" onClick={()=>void fetchAll()} disabled={busy!==null||vinSources.length===0||!vehicle.vin}>{busy==='all'?<Loader2 size={15} className="spin"/>:<Download size={15}/>} {busy==='all'?t("ЗАБИРАЄМО ЗВІТИ..."):t("ЗАВАНТАЖИТИ VIN-ЗВІТИ")}</button>
    <span className="hint-note">{t("Vehicle Databases працює за VIN. CEPiK нижче — окрема польська альтернатива за регіоном і періодом реєстрації.")}</span>
   </div>
   {!vehicle.vin&&<div className="state-note">{t("VIN-джерела недоступні, бо для автомобіля не вказано VIN. CEPiK можна запросити окремо, якщо відомі регіон і період реєстрації в Польщі.")}</div>}
   {message&&<div className={message.kind==='ok'?'ok-note':'auth-error'}>{message.text}</div>}
   <ProviderAccordion title="OneAutoAPI" meta={t("{0} VIN-джерел", { 0: oneAutoSources.length })} open={openProviders.oneauto} onToggle={()=>toggleProvider('oneauto')}>
    <div className="sources-grid">
     {oneAutoSources.map(s=><SourceCard key={s.key} source={s} result={results?.find(r=>r.source===s.key)} busy={busy} vehicleHasVin={Boolean(vehicle.vin)} onClick={()=>void fetchOneAuto(s.key)}/>)}
     {!oneAutoSources.length&&<div className="state-note">{t("Джерела OneAutoAPI не знайдено.")}</div>}
    </div>
   </ProviderAccordion>
   <ProviderAccordion title="CEPiK" meta={t("польський реєстр")} open={openProviders.cepik} onToggle={()=>toggleProvider('cepik')}>
    <div className="cepik-grid">
      <label><span>{t("Воєводство")}</span><select value={cepik.wojewodztwo} onChange={e=>setCepik({...cepik,wojewodztwo:e.target.value})}>{wojewodztwoOptions.map(w=><option key={w.code} value={w.code}>{w.code} · {w.name}</option>)}</select></label>
      <label><span>{t("Дата від YYYYMMDD")}</span><input value={cepik.dataOd} onChange={e=>setCepik({...cepik,dataOd:e.target.value.replace(/[^\d]/g,'').slice(0,8)})} placeholder="20070101"/></label>
      <label><span>{t("Дата до YYYYMMDD")}</span><input value={cepik.dataDo} onChange={e=>setCepik({...cepik,dataDo:e.target.value.replace(/[^\d]/g,'').slice(0,8)})} placeholder="20071231"/></label>
      <label><span>{t("Тип дати")}</span><select value={cepik.typDaty} onChange={e=>setCepik({...cepik,typDaty:e.target.value as '1'|'2'})}><option value="1">{t("перша реєстрація в PL")}</option><option value="2">{t("остання реєстрація")}</option></select></label>
      <label><span>{t("Ліміт")}</span><input value={cepik.limit} onChange={e=>setCepik({...cepik,limit:e.target.value.replace(/[^\d]/g,'')})} placeholder="25"/></label>
      <label><span>{t("CEPiK ID запису")}</span><input value={cepik.detailId} onChange={e=>setCepik({...cepik,detailId:e.target.value.replace(/[^\d]/g,'')})} placeholder={t("id з /pojazdy")}/></label>
     </div>
     <div className="page-actions">
      <button className="ghost-btn save-profile-btn" onClick={()=>void fetchCepik()} disabled={busy!==null||!cepik.wojewodztwo||!cepik.dataOd}>{busy==='cepik-pojazdy'?<Loader2 size={15} className="spin"/>:<Download size={15}/>} {t("ПОШУК CEPIK")}</button>
      <button className="ghost-btn save-profile-btn" onClick={()=>void fetchCepikDetail()} disabled={busy!==null||!cepik.detailId}>{busy==='cepik-pojazdy-detail'?<Loader2 size={15} className="spin"/>:<Download size={15}/>} {t("ДЕТАЛІ ЗА ID")}</button>
     </div>
   </ProviderAccordion>
   <ProviderAccordion title="Vehicle Databases" meta={t("{0} VIN-джерел", { 0: vehicleDatabaseSources.length })} open={openProviders.vehicleDatabases} onToggle={()=>toggleProvider('vehicleDatabases')}>
    <div className="sources-grid">
     {vehicleDatabaseSources.map(s=><SourceCard key={s.key} source={s} result={results?.find(r=>r.source===s.key)} busy={busy} vehicleHasVin={Boolean(vehicle.vin)} onClick={()=>void fetchOne(s.key)}/>)}
    </div>
   </ProviderAccordion>
   {otherSources.length>0&&<ProviderAccordion title={t("Окремі потоки")} meta={t("{0} джерел", { 0: otherSources.length })} open={openProviders.other} onToggle={()=>toggleProvider('other')}>
    <div className="sources-grid">
     {otherSources.map(s=><SourceCard key={s.key} source={s} result={results?.find(r=>r.source===s.key)} busy={busy} vehicleHasVin={Boolean(vehicle.vin)} onClick={()=>void fetchOne(s.key)}/>)}
    </div>
   </ProviderAccordion>}
   {results&&results.length>1&&<div className="panel list-panel">
    <h2>{t("РЕЗУЛЬТАТИ ЗАВАНТАЖЕННЯ")}</h2>
    <table className="data-table"><thead><tr><th>{t("Джерело")}</th><th>{t("Статус")}</th><th>{t("Деталі")}</th></tr></thead><tbody>
     {results.map(r=><tr key={r.source}><td>{r.source}</td><td><span className={'tag '+(r.status==='success'?'green':r.status==='no-data'?'purple':'red')}>{enumLabel(r.status)}</span></td><td>{r.error??(r.reportId?t("звіт збережено"):'—')}</td></tr>)}
    </tbody></table>
   </div>}
   <div className="panel list-panel">
    <h2>{t("ОСТАННІ ПОДІЇ ЗІ ЗВІТІВ")}</h2>
    {data.events.filter(e=>e.type.startsWith('external.')).slice(0,8).map(e=><EventCard key={e.id} event={e}/>)}
    {!data.events.some(e=>e.type.startsWith('external.'))&&<div className="state-note">{t("Подій із зовнішніх джерел поки немає.")}</div>}
   </div>
  </>;
}

function TelegramIntegrationCard(){
  const {user}=useAuth();
  const botUrl=getTelegramBotUrl();
  const inTelegram=Boolean(window.Telegram?.WebApp?.initData);
  const [busy,setBusy]=useState(false);
  const [link,setLink]=useState<{url:string;expiresAt:string}|null>(null);
  const [error,setError]=useState<string|null>(null);
  const connect=async()=>{
    setBusy(true);setError(null);setLink(null);
    try{
      const result=await authApi.createTelegramLink();
      setLink({url:`${botUrl}?start=link_${result.token}`,expiresAt:result.expiresAt});
    }catch(err){setError(errText(err))}finally{setBusy(false)}
  };

  return <section className="panel telegram-panel">
   <div className="telegram-panel-copy">
    <span className="icon-disc"><MessageCircle size={18}/></span>
    <div>
     <h2>TELEGRAM</h2>
     <p>{user?.telegramLinked?t("Telegram під’єднано до цього облікового запису.")+(user.telegramUsername?` @${user.telegramUsername}`:""):inTelegram?t("Mini App відкрито через Telegram."):t("Під’єднайте Telegram до цього облікового запису.")}</p>
     {link&&!user?.telegramLinked&&<small>{t("Посилання діє до")} {fmtDate(link.expiresAt,true)}</small>}
     {error&&<small role="alert">{error}</small>}
    </div>
   </div>
   {user?.telegramLinked?<span className="tag green">{t("Під’єднано")}</span>:link
    ?<a className="primary telegram-panel-action" href={link.url} target="_blank" rel="noreferrer"><MessageCircle size={16}/> {t("ВІДКРИТИ TELEGRAM")}</a>
    :<button className="primary telegram-panel-action" type="button" onClick={()=>void connect()} disabled={busy}>{busy?<Loader2 size={16} className="spin"/>:<MessageCircle size={16}/>} {t("ПІД’ЄДНАТИ TELEGRAM")}</button>}
  </section>;
}

function getTelegramBotUrl():string|null{
  const username=(import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string|undefined)?.trim();
  return `https://t.me/${username?.replace(/^@/,"")||"IACarsBot"}`;
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
    "oneauto-oe-build-sheet-europe-vin":{title:t("Комплектація EU"),description:t("Заводська комплектація й опції за VIN"),button:t("Отримати")},
    "oneauto-oe-build-sheet-vin":{title:t("Заводський лист"),description:t("Build sheet: комплектація, пакети, опції"),button:t("Отримати")},
    "oneauto-oe-service-schedule-vin":{title:t("Регламент ТО"),description:t("Заводський графік обслуговування за VIN"),button:t("Отримати")},
    "oneauto-recall-check-vin":{title:t("Перевірка recall"),description:t("Чи є сервісні кампанії за VIN"),button:t("Перевірити")},
    "oneauto-recall-report-vin":{title:t("Звіт по recall"),description:t("Подробиці сервісних кампаній"),button:t("Отримати")},
    "oneauto-vin-decode-basic-us":{title:t("VIN база US"),description:t("Базове розшифрування для ринку США"),button:t("Перевірити")},
    "oneauto-vin-decode-plus-us":{title:t("VIN розширений US"),description:t("Розширене розшифрування для ринку США"),button:t("Перевірити")},
    "cepik-pojazdy":{title:t("CEPiK пошук"),description:t("Польський реєстр за регіоном і датами"),button:t("Форма вище")},
    "basic-vin-decode":{title:t("VIN базовий"),description:t("Марка, модель, рік і базові параметри"),button:t("Отримати")},
    "advanced-vin-decode":{title:t("VIN розширений"),description:t("Більше технічних полів за VIN"),button:t("Отримати")},
    "europe-vin-decode":{title:t("VIN Європа"),description:t("Європейське розшифрування VIN"),button:t("Отримати")},
    "market-value":{title:t("Ринкова ціна"),description:t("Оцінка вартості за VIN/YMM"),button:t("Оцінити")},
    "sales-history":{title:t("Історія продажів"),description:t("Знайдені минулі продажі"),button:t("Отримати")},
    "auction":{title:t("Аукціони"),description:t("Аукціонні записи за VIN"),button:t("Перевірити")},
    "stolen-check":{title:t("Перевірка викрадення"),description:t("Бази викрадених авто"),button:t("Перевірити")},
    "title-check":{title:"Title check",description:t("Статус title / брендовані записи"),button:t("Перевірити")},
    "vehicle-recalls":{title:t("Сервісні кампанії"),description:t("Recall/кампанії виробника"),button:t("Перевірити")},
    "vehicle-repairs":{title:t("Ремонти"),description:t("Типові ремонти за моделлю/VIN"),button:t("Отримати")},
    "repair-estimates":{title:t("Вартість ремонту"),description:t("Оцінки робіт і деталей"),button:t("Оцінити")},
    "vehicle-maintenance":{title:t("ТО й обслуговування"),description:t("Регламент та інтервали обслуговування"),button:t("Отримати")},
    "dimensions":{title:t("Розміри авто"),description:t("Колісна база, колія й габарити"),button:t("Отримати")},
    "windshield":{title:t("Лобове скло"),description:t("Підбір windshield за VIN"),button:t("Підібрати")},
    "vin-suggestion":{title:t("VIN підказки"),description:t("Схожі/можливі VIN"),button:t("Отримати")},
    "owner-manual":{title:t("Інструкція власника"),description:t("Інструкція власника за VIN/YMM"),button:t("Знайти")},
    "motorcycle-decode":{title:t("Мото VIN"),description:t("Вимкнено для автомобільного гаража"),button:t("Недоступно")},
    "electric-vehicle-specifications":{title:t("EV характеристики"),description:t("Потрібен окремий YMMT-потік: рік, марка, модель і trim"),button:t("Отримати")},
    "vehicle-warranty":{title:t("Гарантія"),description:t("Потрібен окремий YMM-потік: рік, марка й модель"),button:t("Отримати")},
    "ymmt-specifications":{title:t("YMMT специфікації"),description:t("Потрібен окремий YMMT-потік: рік, марка, модель і trim"),button:t("Отримати")},
    "uk-registration-decode":{title:t("UK номер"),description:t("Потрібен окремий потік за британським номером"),button:t("Отримати")},
    "license-plate-ocr":{title:t("OCR номера"),description:t("Потрібен upload зображення номера"),button:t("Отримати")},
    "vin-ocr":{title:"OCR VIN",description:t("Потрібен upload фото VIN"),button:t("Отримати")},
    "oem-parts":{title:t("OEM деталі"),description:t("Потрібен окремий потік YMMT/каталогу деталі"),button:t("Отримати")},
  };

  if(copies[source.key])return copies[source.key];
  return {
    title:source.apiName,
    description:source.note??(source.fetchableByVehicleVin?t("Звіт за VIN"):t("Потрібен ввід: {0}", { 0: source.input })),
    button:t("Отримати"),
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
       <h2>{t("ЗБЕРЕЖЕНІ ЗВІТИ (")}{filteredReports.length}/{reports.length})</h2>
       <button className="ghost-btn" onClick={resetFilters} disabled={!query&&provider==="all"&&status==="all"&&type==="all"}>{t("Скинути")}</button>
      </div>
      <div className="reports-filter">
       <label><span>{t("Пошук")}</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={t("VIN, провайдер, тип звіту")}/></label>
       <label><span>{t("Провайдер")}</span><select value={provider} onChange={e=>setProvider(e.target.value)}><option value="all">{t("Усі")}</option>{providers.map(item=><option key={item} value={item}>{item}</option>)}</select></label>
       <label><span>{t("Статус")}</span><select value={status} onChange={e=>setStatus(e.target.value)}><option value="all">{t("Усі")}</option>{statuses.map(item=><option key={item} value={item}>{item}</option>)}</select></label>
       <label><span>{t("Тип")}</span><select value={type} onChange={e=>setType(e.target.value)}><option value="all">{t("Усі")}</option>{types.map(item=><option key={item} value={item}>{humanReportType(item)}</option>)}</select></label>
      </div>
      <table className="data-table"><thead><tr><th>{t("Тип")}</th><th>{t("Провайдер")}</th><th>VIN</th><th>{t("Статус")}</th><th>{t("Отримано")}</th><th></th></tr></thead><tbody>
       {filteredReports.map(r=><tr key={r.id}><td><b>{humanReportType(r.reportType)}</b><small className="sub">{r.reportType}</small></td><td>{r.provider}</td><td className="mono">{r.vin??'—'}</td><td><span className={'tag '+(r.status==='success'?'green':r.status==='no-data'?'purple':'red')}>{enumLabel(r.status)}</span></td><td>{fmtDate(r.fetchedAt,true)}</td><td><button className="ghost-btn" onClick={()=>setSelectedId(r.id)}>{selected?.id===r.id?t("Відкрито"):t("Відкрити")}</button></td></tr>)}
      </tbody></table>
      {!filteredReports.length&&<div className="state-note">{t("За цими фільтрами звітів немає.")}</div>}
    </div>
    {selected&&<ReportViewer report={selected} vehicle={vehicle} currentProfile={props.data.profile} afterMutate={props.afterMutate}/>}
   </>
   :<EmptyState icon={ChartNoAxesCombined} title={t("Звітів поки немає")} text={t("Завантажте звіти в розділі «Інтеграції» — сирі відповіді Vehicle Databases збережуться тут назавжди.")}/>;
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
      setMessage({kind:'ok',text:t("Дані зі звіту перенесено в профіль. Старі ручні поля, яких немає у звіті, збережено.")});
      await afterMutate();
    }catch(err){setMessage({kind:'err',text:errText(err)})}finally{setSaving(false)}
  };
  const toggleField=(key:keyof VehicleProfile)=>setSelectedFields(prev=>prev.includes(key)?prev.filter(item=>item!==key):[...prev,key]);
  return <div className="panel report-viewer">
   <div className="decode-head">
    <div>
     <h2>{humanReportType(report.reportType)}</h2>
     <p>{report.provider} · {fmtDate(report.fetchedAt,true)} · {facts.length} {t("полів показано")}</p>
    </div>
    <span className="decode-vin">{report.vin??t("без VIN")}</span>
   </div>
   {message&&<div className={message.kind==='ok'?'ok-note':'auth-error'}>{message.text}</div>}
   {warnings.length>0&&<div className="report-warnings">
    {warnings.map(w=><div key={w.text} className={'report-warning '+w.level}>{w.text}</div>)}
   </div>}
   {oneAutoBuildSheet?<OneAutoBuildSheetView payload={report.rawPayload}/>
    :facts.length?<div className="decode-grid">
    {facts.map(f=><div key={f.path} className="decode-item"><span>{f.path}</span><b>{f.value}</b></div>)}
   </div>:<div className="state-note">{t("У звіті немає простих полів для показу.")}</div>}
   {draft&&transferFields.length>0&&<section className="transfer-panel">
    <div className="transfer-head">
     <div>
      <h3>{t("Перенесення в профіль")}</h3>
      <p>{t("Оберіть лише ті поля, які реально збігаються з автомобілем.")}</p>
     </div>
     <span className="tag purple">{selectedFields.length} {t("вибрано")}</span>
    </div>
    <div className="transfer-table">
     {transferFields.map(field=>{
      const current=currentProfile?.[field.key];
      const changed=stringValue(current)!==stringValue(field.value);
      return <label key={field.key} className={'transfer-row '+(changed?'changed':'same')}>
       <input type="checkbox" checked={selectedFields.includes(field.key)} onChange={()=>toggleField(field.key)}/>
       <span className="transfer-label">{field.label}</span>
       <span><small>{t("Зараз")}</small><b>{displayProfileValue(field.key,current)}</b></span>
       <span><small>{t("Зі звіту")}</small><b>{displayProfileValue(field.key,field.value)}</b></span>
      </label>;
     })}
    </div>
    <div className="page-actions report-actions">
     <button className="primary" onClick={()=>void saveDraft()} disabled={saving||selectedFields.length===0}>{saving?<Loader2 size={15} className="spin"/>:<Check size={15}/>} {t("ЗАСТОСУВАТИ ВИБРАНЕ")}</button>
     <span className="hint-note">{t("Комплектацію, двері, пальне й кузов OneAuto тут не підтверджує — їх залишаємо ручним профілем.")}</span>
    </div>
   </section>}
   <details className="raw-report"><summary>RAW JSON</summary><pre>{JSON.stringify(report.rawPayload,null,2)}</pre></details>
  </div>;
}

function OneAutoBuildSheetView({payload}:{payload:unknown}){
  const result=isRecord(payload)&&isRecord(payload.result)?payload.result:null;
  const options=Array.isArray(result?.options)?result.options.filter(isRecord):[];
  const summary=[
    [t("Колір"),stringValue(result?.oem_colour_desc)],
    [t("Салон"),stringValue(result?.oem_interior_trim_desc)],
    [t("Двигун"),stringValue(result?.oem_engine_desc)],
    [t("Коробка"),stringValue(result?.oem_transmission_type_desc)],
    [t("Привід"),stringValue(result?.oem_drivetrain_desc)],
    [t("Колеса"),stringValue(result?.oem_wheel_desc)],
    [t("Дата виробництва"),stringValue(result?.manufactured_date)],
    [t("Дата постачання"),stringValue(result?.delivered_date)],
  ].filter(([,value])=>value);

  return <>
   {summary.length>0&&<section className="decode-group">
    <h3>{t("Підсумок build sheet")}</h3>
    <div className="decode-grid">{summary.map(([label,value])=><div key={label} className="decode-item"><span>{label}</span><b>{value}</b></div>)}</div>
   </section>}
   {options.length>0&&<section className="report-options">
    <h3>{t("Заводські опції (")}{options.length})</h3>
    <table className="data-table"><thead><tr><th>{t("Код")}</th><th>{t("Опція")}</th><th>{t("Коментар")}</th></tr></thead><tbody>
     {options.map((option,index)=><tr key={`${stringValue(option.factory_code)??index}-${index}`}>
      <td className="mono">{stringValue(option.factory_code)??'—'}</td>
      <td><b>{stringValue(option.factory_desc)??'—'}</b></td>
      <td>{stringValue(option.additional_desc)??'—'}</td>
     </tr>)}
    </tbody></table>
   </section>}
   {!summary.length&&!options.length&&<div className="state-note">{t("OneAuto build sheet збережено, але очікуваних полів result/options немає. Відкрийте RAW JSON нижче.")}</div>}
  </>;
}

function humanReportType(type:string):string{
  const names:Record<string,string>={
    "oneauto-oe-build-sheet-europe-vin":t("Комплектація EU"),
    "oneauto-oe-build-sheet-vin":t("Заводський лист"),
    "oneauto-oe-service-schedule-vin":t("Регламент ТО"),
    "oneauto-recall-check-vin":t("Перевірка recall"),
    "oneauto-recall-report-vin":t("Звіт по recall"),
    "oneauto-vin-decode-basic-us":t("VIN база US"),
    "oneauto-vin-decode-plus-us":t("VIN розширений US"),
    "cepik-pojazdy":t("CEPiK пошук"),
    "cepik-pojazdy-detail":t("CEPiK деталі"),
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
    warnings.push({level:"danger",text:t("VIN звіту {0} не збігається з поточним VIN {1}. Перенесення заблоковано за замовчуванням.", { 0: reportVin, 1: vehicleVin })});
  }
  if(looksLikeOneAutoDemoPayload(report.rawPayload)){
    warnings.push({level:"danger",text:t("Звіт схожий на sandbox/demo OneAuto: є тестові коди або демонстраційні поля. Позначки знято, застосовуйте тільки після ручної перевірки RAW JSON.")});
  }
  if(draft&&currentProfile){
    const conflicts=profileTransferFields(draft).filter(field=>{
      const current=currentProfile[field.key];
      return stringValue(current)&&stringValue(field.value)&&stringValue(current)!==stringValue(field.value);
    });
    if(conflicts.length>0){
      warnings.push({level:"warn",text:t("Є розбіжності з поточним профілем: {0}. Перевірте перед застосуванням.", { 0: conflicts.map(c=>c.label).join(", ") })});
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
    {key:"exteriorColor",label:t("Колір"),value:draft.exteriorColor},
    {key:"engineFamily",label:t("Двигун"),value:draft.engineFamily},
    {key:"transmissionType",label:t("Тип коробки"),value:draft.transmissionType},
    {key:"transmissionCode",label:t("Код коробки"),value:draft.transmissionCode},
    {key:"driveType",label:t("Привід"),value:draft.driveType},
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
    manual:t("механіка"),
    automatic:t("автомат"),
    dct:t("робот/DCT"),
    cvt:t("варіатор"),
    "single-speed":t("одноступенева"),
    other:t("інше"),
  };
  return names[value]??value;
}

function formatTransferDrive(value:string):string{
  const names:Record<string,string>={
    fwd:t("передній"),
    rwd:t("задній"),
    awd:t("повний AWD"),
    "4wd":t("повний 4WD"),
    other:t("інше"),
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
  const [languageSaving,setLanguageSaving]=useState(false);
  const [languageMessage,setLanguageMessage]=useState<string|null>(null);
  const currentLanguage=(user?.language==="uk"||user?.language==="pl"||user?.language==="en")?user.language:"uk";
  const changeLanguage=async(language:UserLanguage)=>{
    setLanguageSaving(true);
    setLanguageMessage(null);
    try{
      await updateLanguage(language);
      setLanguageMessage(t("Мову збережено."));
    }catch(err){
      setLanguageMessage(errText(err));
    }finally{
      setLanguageSaving(false);
    }
  };
  return <>
   <div className="panel list-panel">
    <h2>{t("ПРОФІЛЬ КОРИСТУВАЧА")}</h2>
    <div className="settings-grid">
     <div><span>{t("Ім’я")}</span><b>{userName}</b></div>
     <div><span>Email</span><b>{user?.email??'—'}</b></div>
     <div><span>{t("Країна")}</span><b>{user?.country??'—'}</b></div>
     <div><span>{t("Мова")}</span><b>{user?.language??'—'}</b></div>
     <div><span>API</span><b className="mono">{API_BASE||'same-origin'}</b></div>
    </div>
    <div className="settings-language">
     <span>{t("Мова інтерфейсу")}</span>
     <LanguagePicker language={currentLanguage} onChange={language=>void changeLanguage(language)} disabled={languageSaving}/>
     {languageSaving&&<span className="hint-note">{t("Зберігаємо...")}</span>}
     {languageMessage&&<span className="hint-note">{languageMessage}</span>}
    </div>
    <div className="page-actions">
     <button className="ghost-btn danger" onClick={logout}><LogOut size={15}/> {t("Вийти з акаунта")}</button>
    </div>
   </div>
   <TelegramIntegrationCard/>
   <div className="panel list-panel">
    <h2>{t("ПРО ПЛАТФОРМУ")}</h2>
    <p className="about-text">{t("CARA — єдиний профіль автомобіля: VIN-декодування, історія продажів, аукціони, оцінки, recall, перевірки на викрадення (Vehicle Databases) плюс ваші записи пробігу, витрат, пального й ТО. AI працює лише поверх фактів.")}</p>
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
