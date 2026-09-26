import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { House, CarFront, ClipboardList, Gauge, Wrench, Wallet, Fuel, FileText, History, Bell, Bot, PlugZap, ChartNoAxesCombined, Settings, ChevronDown, Search, MessageSquare, Sun, Check, ShieldCheck, ArrowRight, Menu, X, Plus, Send, CircleHelp, Orbit, Sparkles, Volume2, VolumeX, LogOut, AlertTriangle, RefreshCw, Loader2, Download } from 'lucide-react';
import { sfx, soundEnabled, setSoundEnabled } from './sound';
import { AuthProvider, AuthScreen, useAuth } from './auth';
import {
  API_BASE,
  ApiError,
  expensesApi,
  energyApi,
  externalReportsApi,
  fmtDate,
  fmtMoney,
  fmtNumber,
  fmtShortDate,
  garageApi,
  historyApi,
  maintenanceApi,
  mileageApi,
  num,
  profileApi,
  serviceRecordsApi,
  vinApi,
  type AnomalyReport,
  type CreateEnergyInput,
  type CreateExpenseInput,
  type EnergyEntry,
  type EnergyMonthlySummary,
  type Expense,
  type ExpenseMonthlySummary,
  type ExternalReport,
  type FullToFull,
  type HistoryEvent,
  type MaintenanceStatus,
  type MileageReading,
  type ReportSource,
  type SourceFetchSummary,
  type Vehicle,
  type VehicleProfile,
  type ServiceRecord,
} from './api';
import './style.css';

const sections = [
  {name:'Главная', icon:House}, {name:'Гараж',icon:CarFront}, {name:'Профиль авто',icon:ClipboardList}, {name:'Пробег',icon:Gauge}, {name:'Сервис и ТО',icon:Wrench}, {name:'Расходы',icon:Wallet}, {name:'Топливо и энергия',icon:Fuel}, {name:'Документы',icon:FileText}, {name:'История событий',icon:History}, {name:'Напоминания',icon:Bell}, {name:'AI Ассистент',icon:Bot}, {name:'Интеграции',icon:PlugZap}, {name:'Отчёты',icon:ChartNoAxesCombined}, {name:'Настройки',icon:Settings}
];
const healthColors = ['#00dcae','#2ce59c','#44baff','#6bafff','#aa65ff','#cd6bff'];
const donutColors = ['#2c72f1','#18c47a','#f5a32b','#9c46ec','#e46bff','#37c6ff'];

const CATEGORY_LABELS: Record<string,string> = {
  maintenance:'Обслуживание', repair:'Ремонт', parts:'Запчасти', insurance:'Страховка',
  inspection:'Техосмотр', tax:'Налог', parking:'Парковка', toll:'Дороги', fine:'Штрафы',
  wash:'Мойка', detailing:'Детейлинг', accessories:'Аксессуары', tires:'Шины',
  roadside:'Помощь на дороге', registration:'Регистрация', other:'Прочее',
  fuel:'Топливо', charge:'Зарядка', energy:'Топливо и энергия',
};

const EVENT_META: Record<string,{title:string,color:string}> = {
  'vehicle.mileage_updated':{title:'Запись пробега',color:'green'},
  'expense.recorded':{title:'Расход добавлен',color:'orange'},
  'service.completed':{title:'Сервисная запись',color:'purple'},
  'energy.refuel':{title:'Заправка',color:'blue'},
  'energy.charge':{title:'Зарядка',color:'green'},
  'external.sale_listing':{title:'Объявление о продаже',color:'blue'},
  'external.auction_sale':{title:'Продажа на аукционе',color:'purple'},
  'external.market_valuation':{title:'Рыночная оценка',color:'green'},
  'external.recall':{title:'Отзывная кампания',color:'red'},
  'external.vin_decode':{title:'Расшифровка VIN',color:'blue'},
  'external.msrp':{title:'Цена производителя (MSRP)',color:'green'},
  'external.vin_suggestion':{title:'Предложенный VIN',color:'orange'},
  'external.stolen_check':{title:'Проверка на угон',color:'blue'},
  'external.stolen_alert':{title:'Внимание: угон!',color:'red'},
  'external.title_check':{title:'Проверка титула',color:'orange'},
};

const URGENCY_META: Record<MaintenanceStatus['urgency'],{tag:string,color:string}> = {
  stop:{tag:'Срочно',color:'red'},
  check_soon:{tag:'Скоро',color:'red'},
  attention:{tag:'Внимание',color:'purple'},
  normal:{tag:'В норме',color:'green'},
};

const MODULE_LABELS: Record<string,string> = {
  mileage:'пробег', expenses:'расходы', energy:'топливо',
  'service-records':'сервис', 'external-reports':'внешний отчёт',
};

function eventIcon(type:string){
  if(type.startsWith('external.'))return type.includes('stolen')?ShieldCheck:FileText;
  if(type.includes('mileage'))return Gauge;
  if(type.includes('expense'))return Wallet;
  if(type.includes('energy'))return Fuel;
  if(type.includes('service'))return Wrench;
  return History;
}

function vehicleTitle(v:Vehicle):string{
  const parts=[v.make,v.model].filter(Boolean);
  if(parts.length)return parts.join(' ');
  if(v.nickname)return v.nickname;
  return v.vin?`VIN ${v.vin}`:'Автомобиль без названия';
}

function vehicleLine(v:Vehicle,latest:MileageReading|null):string{
  const bits=[v.modelYear,v.licensePlate].filter(Boolean) as string[];
  if(latest)bits.push(`${fmtNumber(latest.odometerKm)} км`);
  return bits.length?bits.join(' · '):'Данные не заполнены';
}

function errText(err:unknown):string{
  if(err instanceof ApiError)return err.message;
  if(err instanceof Error)return err.message;
  return 'Неизвестная ошибка';
}

// ---------- data layer ----------

interface VehicleData{
  latest:MileageReading|null;
  mileageHistory:MileageReading[];
  anomalies:AnomalyReport|null;
  monthExpenses:ExpenseMonthlySummary|null;
  expenses:Expense[];
  fullToFull:FullToFull|null;
  energy:EnergyEntry[];
  energyMonth:EnergyMonthlySummary|null;
  maintenance:MaintenanceStatus[];
  events:HistoryEvent[];
  profile:VehicleProfile|null;
  services:ServiceRecord[];
  loading:boolean;
  failed:boolean;
}

const EMPTY_DATA:VehicleData={latest:null,mileageHistory:[],anomalies:null,monthExpenses:null,expenses:[],fullToFull:null,energy:[],energyMonth:null,maintenance:[],events:[],profile:null,services:[],loading:false,failed:false};

function useVehicleData(vehicleId:string|null){
  const [data,setData]=useState<VehicleData>(EMPTY_DATA);

  const refresh=useCallback(async()=>{
    if(!vehicleId){setData(EMPTY_DATA);return}
    setData(prev=>({...prev,loading:true,failed:false}));
    const now=new Date();
    const year=now.getFullYear(), month=now.getMonth()+1;
    const settled=await Promise.allSettled([
      mileageApi.latest(vehicleId),
      mileageApi.history(vehicleId,{limit:60}),
      mileageApi.anomalies(vehicleId),
      expensesApi.monthlySummary(vehicleId,year,month),
      expensesApi.list(vehicleId,{limit:30}),
      energyApi.fullToFull(vehicleId),
      energyApi.list(vehicleId,{limit:30}),
      energyApi.monthlySummary(vehicleId,year,month),
      maintenanceApi.status(vehicleId),
      historyApi.list(vehicleId,{limit:16}),
      profileApi.current(vehicleId),
      serviceRecordsApi.list(vehicleId),
    ]);
    const pick=<T,>(i:number,fallback:T):T=>settled[i].status==='fulfilled'?(settled[i] as PromiseFulfilledResult<T>).value:fallback;
    const history=pick<MileageReading[]>(1,[]);
    const anyOk=settled.some(s=>s.status==='fulfilled');
    setData({
      latest:pick<MileageReading|null>(0,null),
      mileageHistory:[...history].sort((a,b)=>new Date(a.recordedAt).getTime()-new Date(b.recordedAt).getTime()),
      anomalies:pick<AnomalyReport|null>(2,null),
      monthExpenses:pick<ExpenseMonthlySummary|null>(3,null),
      expenses:pick<Expense[]>(4,[]),
      fullToFull:pick<FullToFull|null>(5,null),
      energy:pick<EnergyEntry[]>(6,[]),
      energyMonth:pick<EnergyMonthlySummary|null>(7,null),
      maintenance:pick<MaintenanceStatus[]>(8,[]),
      events:pick<HistoryEvent[]>(9,[]),
      profile:pick<VehicleProfile|null>(10,null),
      services:pick<ServiceRecord[]>(11,[]),
      loading:false,
      failed:!anyOk,
    });
  },[vehicleId]);

  useEffect(()=>{void refresh()},[refresh]);
  return {data,refresh};
}

// ---------- small building blocks ----------

function Spinner({label}:{label?:string}){
  return <div className="state-note"><Loader2 size={16} className="spin"/>{label??'Загружаем данные...'}</div>;
}
function EmptyState({icon:Icon,title,text,action}:{icon:typeof CircleHelp,title:string,text:string,action?:ReactNode}){
  return <div className="empty-card"><Icon size={32}/><h2>{title}</h2><p>{text}</p>{action}</div>;
}
function Field({label,children}:{label:string,children:ReactNode}){
  return <label className="field"><span>{label}</span>{children}</label>;
}

function AddVehicleForm({onDone}:{onDone:()=>void}){
  const [vin,setVin]=useState(''); const [nickname,setNickname]=useState(''); const [make,setMake]=useState('');
  const [modelYear,setModelYear]=useState(''); const [plate,setPlate]=useState(''); const [country,setCountry]=useState('PL');
  const [busy,setBusy]=useState(false); const [error,setError]=useState<string|null>(null);
  const submit=async(e:FormEvent)=>{
    e.preventDefault();
    if(busy)return;
    setBusy(true);setError(null);
    try{
      await garageApi.create({
        vin:vin.trim()?vin.trim().toUpperCase():undefined,
        nickname:nickname.trim()||undefined,
        make:make.trim()||undefined,
        modelYear:modelYear.trim()||undefined,
        licensePlate:plate.trim()||undefined,
        country:country.trim()||undefined,
      });
      setVin('');setNickname('');setMake('');setModelYear('');setPlate('');
      onDone();
    }catch(err){setError(errText(err))}finally{setBusy(false)}
  };
  return <form className="form-card" onSubmit={submit}>
    <h3><CarFront size={16}/> Новый автомобиль</h3>
    <div className="form-grid">
      <Field label="VIN (17 символов)"><input value={vin} onChange={e=>setVin(e.target.value)} maxLength={17} placeholder="WVWZZZ1KZAW000000"/></Field>
      <Field label="Название"><input value={nickname} onChange={e=>setNickname(e.target.value)} maxLength={80} placeholder="Мой Qashqai"/></Field>
      <Field label="Марка"><input value={make} onChange={e=>setMake(e.target.value)} maxLength={120} placeholder="Nissan"/></Field>
      <Field label="Год выпуска"><input value={modelYear} onChange={e=>setModelYear(e.target.value.replace(/\D/g,'').slice(0,4))} placeholder="2017"/></Field>
      <Field label="Госномер"><input value={plate} onChange={e=>setPlate(e.target.value)} maxLength={32} placeholder="XX 1234X"/></Field>
      <Field label="Страна"><input value={country} onChange={e=>setCountry(e.target.value.toUpperCase().slice(0,2))} maxLength={2} placeholder="PL"/></Field>
    </div>
    {error&&<div className="auth-error">{error}</div>}
    <button className="primary" type="submit" disabled={busy}>{busy?'Добавляем...':'ДОБАВИТЬ В ГАРАЖ'}</button>
  </form>;
}

// ---------- shell ----------

const VEHICLE_KEY='cara.vehicleId';

function Shell(){
  const {user,logout}=useAuth();
  const [page,setPage]=useState('Главная'); const [mobile,setMobile]=useState(false); const [ai,setAi]=useState(false); const [query,setQuery]=useState(''); const [search,setSearch]=useState(false); const [soundOn,setSoundOn]=useState(soundEnabled());
  const [vehicles,setVehicles]=useState<Vehicle[]>([]);
  const [vehiclesLoading,setVehiclesLoading]=useState(true);
  const [vehiclesError,setVehiclesError]=useState<string|null>(null);
  const [vehicleId,setVehicleId]=useState<string|null>(()=>localStorage.getItem(VEHICLE_KEY));

  const loadVehicles=useCallback(async()=>{
    setVehiclesLoading(true);setVehiclesError(null);
    try{
      const list=await garageApi.list();
      setVehicles(list);
      setVehicleId(prev=>{
        if(prev&&list.some(v=>v.id===prev))return prev;
        const next=list[0]?.id??null;
        if(next)localStorage.setItem(VEHICLE_KEY,next);else localStorage.removeItem(VEHICLE_KEY);
        return next;
      });
    }catch(err){setVehiclesError(errText(err))}finally{setVehiclesLoading(false)}
  },[]);

  useEffect(()=>{void loadVehicles()},[loadVehicles]);

  const vehicle=useMemo(()=>vehicles.find(v=>v.id===vehicleId)??null,[vehicles,vehicleId]);
  const {data,refresh}=useVehicleData(vehicleId);

  const selectVehicle=(id:string)=>{setVehicleId(id);localStorage.setItem(VEHICLE_KEY,id)};
  const navigate=(name:string,sound:'tick'|'chime'='tick')=>{setPage(name);setMobile(false);setSearch(false);sfx(sound)};
  const openAi=()=>{setAi(true);sfx('open')};
  const closeAi=()=>{setAi(false);sfx('close')};
  const toggleSound=()=>{const v=!soundOn;setSoundEnabled(v);setSoundOn(v);if(v)sfx('tick')};
  const afterMutate=async()=>{await Promise.all([refresh(),loadVehicles()])};

  useEffect(()=>{
    const h=(e:KeyboardEvent)=>{if(e.key!=='Escape')return;if(ai){setAi(false);sfx('close')}setSearch(false);setMobile(false)};
    window.addEventListener('keydown',h);return()=>window.removeEventListener('keydown',h);
  },[ai]);

  const alerts=data.maintenance.filter(s=>s.urgency!=='normal').length;
  const userName=user?.displayName||user?.email||'Гость';
  const userInitial=userName[0]?.toUpperCase()??'?';

  const pageProps={vehicle,vehicles,data,refresh,navigate,selectVehicle,loadVehicles,afterMutate,openAi,vehiclesLoading,vehiclesError,userName,logout};

  return <div className="app">
   <aside className={'sidebar '+(mobile?'open':'')}>
    <div className="brand"><span className="brand-mark">C</span><div><strong>CARA</strong><small>AI CAR ASSISTANT</small></div><button className="close-menu" onClick={()=>setMobile(false)}><X size={20}/></button></div>
    <button className="vehicle-picker" onClick={()=>navigate('Гараж')}>
     <img className="vehicle-thumb" src="/car.webp" alt=""/>
     <span className="vehicle-copy">
      <b>{vehicle?vehicleTitle(vehicle):'Выберите авто'}</b>
      <small>{vehicle?vehicleLine(vehicle,data.latest):'Гараж пуст'}</small>
      <em>● {vehicle?'Онлайн':'Добавьте автомобиль'}</em>
     </span><ChevronDown size={15}/>
    </button>
    <nav>{sections.slice(0,11).map(({name,icon:Icon})=><button key={name} className={page===name?'active':''} onClick={()=>navigate(name)}><Icon size={18}/><span>{name}</span>{name==='AI Ассистент'&&<i>BETA</i>}</button>)}</nav>
    <nav className="lower-nav">{sections.slice(11).map(({name,icon:Icon})=><button key={name} className={page===name?'active':''} onClick={()=>navigate(name)}><Icon size={18}/><span>{name}</span></button>)}</nav>
    <button className="assistant-tile" onClick={openAi}>
     <span className="bot-avatar"><img src="/robot.webp" alt=""/></span>
     <span className="assistant-copy"><b>AI Ассистент</b><em>● Онлайн</em><svg className="waveform" viewBox="0 0 110 22" preserveAspectRatio="none" aria-hidden="true"><polyline points="0,11 10,11 14,4 18,18 22,7 26,15 30,11 40,11 44,2 48,20 52,9 56,13 60,11 70,11 74,5 78,17 82,8 86,14 90,11 110,11"/></svg><small>Готов помочь 24/7</small></span>
    </button>
   </aside>
   <main className="main">
    <header>
     <button className="menu-button" onClick={()=>setMobile(true)}><Menu/></button>
     <span className="pilot"><Orbit size={14}/> АВТОПИЛОТ: {vehicleId?'АКТИВЕН':'НЕ АКТИВЕН'}</span>
     <button className="ai-mode" onClick={()=>{setAi(true);sfx('activate')}}><Sparkles size={15}/> АКТИВИРОВАТЬ AI РЕЖИМ <span className="orb"/></button>
     <div className="header-actions">
      <button aria-label="Поиск" onClick={()=>setSearch(!search)}><Search size={19}/></button>
      <button aria-label="Напоминания" onClick={()=>navigate('Напоминания')}><Bell size={19}/>{alerts>0&&<sup>{alerts}</sup>}</button>
      <button aria-label="AI чат" onClick={openAi}><MessageSquare size={19}/></button>
      <button aria-label={soundOn?'Выключить звук':'Включить звук'} onClick={toggleSound}>{soundOn?<Volume2 size={19}/>:<VolumeX size={19}/>}</button>
      <button className="user-chip" onClick={()=>navigate('Настройки')}><span className="avatar">{userInitial}</span><span className="user">{userName}<small>Владелец</small></span><ChevronDown size={14}/></button>
     </div>
    </header>
    {search&&<div className="search-panel"><Search size={18}/><input autoFocus placeholder="Найти раздел..." value={query} onChange={e=>setQuery(e.target.value)}/>{sections.filter(x=>x.name.toLowerCase().includes(query.toLowerCase())).slice(0,5).map(x=><button key={x.name} onClick={()=>navigate(x.name)}>{x.name}</button>)}</div>}
    {page==='Главная'?<Dashboard {...pageProps}/>:<InnerPage page={page} {...pageProps}/>}
   </main>
   {mobile&&<div className="scrim" onClick={()=>setMobile(false)}/>}
   {ai&&<div className="modal-backdrop" onClick={closeAi}><div className="ai-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-dialog-title" onClick={e=>e.stopPropagation()}><button className="modal-close" aria-label="Закрыть" onClick={closeAi}><X/></button><img className="dialog-bot" src="/robot.webp" alt=""/><h2 id="ai-dialog-title">CARA AI Ассистент</h2><p>Спросите меня об автомобиле. Подключение к AI backend появится после настройки API.</p><div className="chat-placeholder">Привет, {userName}! Чем помочь{vehicle?` с ${vehicleTitle(vehicle)}`:''}?</div><form onSubmit={e=>{e.preventDefault();if(query.trim())setQuery('')}}><input autoFocus placeholder="Напишите вопрос..." value={query} onChange={e=>setQuery(e.target.value)}/><button aria-label="Отправить"><Send size={18}/></button></form></div></div>}
  </div>;
}

// ---------- shared page props ----------

interface PageProps{
  vehicle:Vehicle|null;
  vehicles:Vehicle[];
  data:VehicleData;
  refresh:()=>Promise<void>;
  navigate:(n:string,sound?:'tick'|'chime')=>void;
  selectVehicle:(id:string)=>void;
  loadVehicles:()=>Promise<void>;
  afterMutate:()=>Promise<void>;
  openAi:()=>void;
  vehiclesLoading:boolean;
  vehiclesError:string|null;
  userName:string;
  logout:()=>void;
}

function PageHeader({page,vehicle,onRefresh,refreshing}:{page:string,vehicle:Vehicle|null,onRefresh:()=>void,refreshing:boolean}){
  return <>
   <span className="eyebrow">CARA / {page}</span>
   <div className="page-title-row">
    <h1>{page}</h1>
    <button className="refresh-btn" onClick={onRefresh} disabled={refreshing} aria-label="Обновить">{refreshing?<Loader2 size={16} className="spin"/>:<RefreshCw size={16}/>} Обновить</button>
   </div>
   <p>{vehicle?`${vehicleTitle(vehicle)}${vehicle.modelYear?` · ${vehicle.modelYear}`:''}${vehicle.vin?` · VIN ${vehicle.vin}`:''}`:'Автомобиль не выбран'}</p>
  </>;
}

function NoVehicle({onGoGarage}:{onGoGarage:()=>void}){
  return <EmptyState icon={CarFront} title="Сначала добавьте автомобиль" text="Все разделы работают вокруг конкретного автомобиля. Добавьте его в гараж — и данные подтянутся." action={<button className="primary" onClick={onGoGarage}>ПЕРЕЙТИ В ГАРАЖ <ArrowRight size={16}/></button>}/>;
}

// ---------- dashboard ----------

function Dashboard(props:PageProps){
  const {vehicle,data,navigate,openAi,vehiclesLoading,vehiclesError,userName,loadVehicles}=props;

  if(vehiclesLoading)return <div className="dashboard"><Spinner label="Подключаем гараж..."/></div>;
  if(vehiclesError)return <div className="dashboard"><EmptyState icon={AlertTriangle} title="Не удалось загрузить гараж" text={vehiclesError} action={<button className="primary" onClick={()=>void loadVehicles()}>ПОВТОРИТЬ <RefreshCw size={15}/></button>}/></div>;
  if(!vehicle)return <div className="dashboard">
    <NoVehiclePanel onGoGarage={()=>navigate('Гараж')}/>
    <AddVehicleForm onDone={()=>void loadVehicles()}/>
  </div>;

  const latest=data.latest;
  const monthSummary=pickMainCurrency(data.monthExpenses);
  const nextService=pickNextService(data.maintenance);
  const healthScore=computeHealthScore(data.maintenance);
  const healthItems=data.maintenance.slice(0,6);
  const reminders=pickReminders(data.maintenance);
  const recentEvents=data.events.slice(0,8);
  const delta30=computeDelta30(data.mileageHistory);
  const spark=buildSparkline(data.mileageHistory);
  const consumption=data.fullToFull?.consumptionLitersPer100Km??null;
  const energyBars=buildEnergyBars(data.energy);
  const donut=buildDonut(monthSummary);
  const anomalies=data.anomalies?.anomalies??[];

  return <div className="dashboard">
   <div className="top-grid">
    <section className="hero">
     <div className="hero-copy"><h1>Привет, {userName}! <span className="wave">👋</span></h1><p>Я — твой автомобильный AI-помощник.<br/>Я здесь, чтобы заботиться о твоём {vehicleTitle(vehicle)}<br/>и делать каждую поездку лучше.</p></div>
     <div className="weather"><Sun size={28}/><div><b>{latest?fmtNumber(latest.odometerKm):'—'} <small>км</small></b><small>одометр</small></div><small className="date">{fmtDate(new Date().toISOString())}<br/>{new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</small></div>
     <div className="hero-bubble">{data.loading?'Синхронизирую данные...':anomalies.length?`Найдено аномалий пробега: ${anomalies.length}. Проверь раздел «Пробег».`:'Все данные в норме! Поехали!'}</div>
     <div className="status-cards">
      <div><span className="icon-disc green"><Gauge size={17}/></span><span>ПРОБЕГ<small>последняя запись</small><b>{latest?`${fmtNumber(latest.odometerKm)} км`:'нет данных'}</b></span></div>
      <div><span className="icon-disc orange"><Fuel size={17}/></span><span>РАСХОД<small>full-to-full</small><b>{consumption!==null?`${consumption.toFixed(1)} л/100км`:'—'}</b></span></div>
      <div><span className="icon-disc purple"><Wrench size={17}/></span><span>ТО<small>{nextService?nextService.rule.title:'правил нет'}</small><b>{nextService&&nextService.kmRemaining!==null?`через ${fmtNumber(nextService.kmRemaining)} км`:nextService?'—':'—'}</b></span></div>
     </div>
    </section>
    <div className="right-stack">
     <section className="panel reminders">
      <div className="panel-heading"><h2>БЛИЖАЙШИЕ НАПОМИНАНИЯ</h2><button onClick={()=>navigate('Напоминания')}>Смотреть все</button></div>
      {data.loading&&!reminders.length?<Spinner/>
       :reminders.length?reminders.map(r=><Reminder key={r.rule.id} icon={Wrench} title={r.rule.title} detail={reminderDetail(r)} tag={URGENCY_META[r.urgency].tag} color={URGENCY_META[r.urgency].color}/>)
       :<div className="state-note"><CircleHelp size={15}/> Правила ТО не настроены — загляните в «Сервис и ТО».</div>}
     </section>
     <section className="panel health">
      <h2>ОБЩЕЕ СОСТОЯНИЕ АВТО</h2>
      <div className="health-content">
       <div className="ring" style={healthScore!==null?{background:`conic-gradient(var(--teal) 0 ${healthScore}%,rgba(10,40,70,.9) ${healthScore}% 100%)`}:undefined}><strong>{healthScore!==null?healthScore:'—'}<small>/100</small></strong></div>
       <div className="health-list">
        {healthItems.length?healthItems.map((s,i)=><div key={s.rule.id}><i style={{background:healthColors[i%healthColors.length],color:healthColors[i%healthColors.length]}}/>{s.rule.title}<b>{urgencyScore(s.urgency)}<span>/100</span></b></div>)
         :<div><i style={{background:'#44baff',color:'#44baff'}}/>Нет активных правил ТО</div>}
       </div>
      </div>
      {anomalies.length
       ?<div className="good warn"><AlertTriangle size={15}/> Аномалии пробега: {anomalies.length} <span>Проверьте раздел «Пробег».</span></div>
       :<div className="good"><Check size={15}/> {data.failed?'Нет связи с сервером':'Данные в порядке'} <span>{data.failed?'Проверьте подключение к API':'Продолжай в том же духе!'}</span></div>}
      <small className="data-note">Оценка рассчитана по статусам обслуживания из vehicle-intelligence API.</small>
     </section>
    </div>
   </div>
   <div className="metric-grid">
    <section className="panel metric" onClick={()=>navigate('Пробег')}>
     <h2>ПРОБЕГ</h2>
     <div className="metric-value">{latest?fmtNumber(latest.odometerKm):'—'} <span>км</span></div>
     <div className="metric-sub">{delta30!==null?`+${fmtNumber(delta30)} км за 30 дней`:'Нет свежих записей'}</div>
     {spark
      ?<div className="line-chart">
        <span className="chart-chip"><b>{fmtNumber(latest!.odometerKm)} км</b><small>{fmtDate(latest!.recordedAt)}</small></span>
        <div className="chart-labels">{spark.maxLabel}<br/>{spark.minLabel}</div>
        <svg viewBox="0 0 260 110" preserveAspectRatio="none"><defs><linearGradient id="lg" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#00e88a" stopOpacity=".35"/><stop offset="1" stopColor="#00e88a" stopOpacity="0"/></linearGradient></defs><path d={spark.area} fill="url(#lg)"/><polyline points={spark.line} fill="none" stroke="#00eb9f" strokeWidth="2"/><circle cx={spark.lastX} cy={spark.lastY} r="3.5" fill="#00eb9f"/></svg>
       </div>
      :<div className="state-note tall"><Gauge size={16}/> Добавьте хотя бы две записи пробега — здесь появится график.</div>}
     {spark&&<div className="chart-months">{spark.firstLabel} <span>{spark.lastLabel}</span></div>}
    </section>
    <section className="panel metric" onClick={()=>navigate('Расходы')}>
     <h2>РАСХОДЫ <small>(текущий месяц)</small></h2>
     <div className="metric-value">{monthSummary?fmtNumber(monthSummary.totalCost,2):'—'} <span>{monthSummary?.currency??''}</span></div>
     <div className="metric-sub">{monthSummary&&monthSummary.costPer100Km!==null?`${fmtNumber(monthSummary.costPer100Km,2)} / 100 км`:'Сводка за месяц'}</div>
     {donut
      ?<div className="expense-chart"><div className="donut" style={{background:donut.gradient}}/><div className="legend">{donut.items.map((c,i)=><div key={c.name}><i style={{background:donutColors[i%donutColors.length],boxShadow:`0 0 8px ${donutColors[i%donutColors.length]}`}}/>{c.name} <span>{fmtNumber(c.total,2)} {monthSummary?.currency} ({c.percent}%)</span></div>)}</div></div>
      :<div className="state-note tall"><Wallet size={16}/> В этом месяце расходов пока нет.</div>}
    </section>
    <section className="panel metric" onClick={()=>navigate('Топливо и энергия')}>
     <h2>СРЕДНИЙ РАСХОД</h2>
     <div className="metric-value">{consumption!==null?consumption.toFixed(1):'—'} <span>л/100км</span></div>
     <div className="metric-sub">{data.fullToFull?`full-to-full · ${fmtNumber(data.fullToFull.distanceKm)} км`:'Нужны две полные заправки'}</div>
     {energyBars.length
      ?<div className="bar-wrap"><span className="chart-chip"><b>{data.energyMonth?`${fmtNumber(data.energyMonth.fuelLiters,1)} л`:'—'}</b><small>за месяц</small></span><div className="bar-chart">{energyBars.map((n,i)=><div key={i} style={{height:`${n}%`}}/>)}</div></div>
      :<div className="state-note tall"><Fuel size={16}/> Добавьте заправки — расход посчитается автоматически.</div>}
     {energyBars.length>0&&<div className="chart-months">Последние заправки <span>объём, л</span></div>}
    </section>
    <section className="panel metric service" onClick={()=>navigate('Сервис и ТО')}>
     <h2>СЛЕДУЮЩЕЕ ТО</h2>
     {nextService
      ?<>
        <div className="metric-value smaller">{nextService.kmRemaining!==null?`Через ${fmtNumber(nextService.kmRemaining)} км`:'По сроку'}</div>
        <p>{nextService.daysRemaining!==null?`или ${fmtNumber(nextService.daysRemaining)} дня`:nextService.rule.title}</p>
        <div className="service-row">
         <div className="progress-ring" style={{background:`conic-gradient(#00cead 0 ${serviceProgress(nextService)}%,#893bff ${serviceProgress(nextService)}% 100%)`}}><strong>{serviceProgress(nextService)}<small>%</small></strong></div>
         <div className="checklist">Интервалы:{intervalLines(nextService).map(x=><div key={x}><Check size={14}/> {x}</div>)}</div>
        </div>
       </>
      :<div className="state-note tall"><Wrench size={16}/> Правила ТО не настроены. Откройте «Сервис и ТО», чтобы добавить регламент.</div>}
    </section>
   </div>
   <div className="bottom-grid">
    <section className="panel recent">
     <div className="panel-heading"><h2>ПОСЛЕДНИЕ СОБЫТИЯ</h2><button onClick={()=>navigate('История событий')}>Все события →</button></div>
     {data.loading&&!recentEvents.length?<Spinner/>
      :recentEvents.length?<div className="events">{recentEvents.map(e=><EventCard key={e.id} event={e}/>)}</div>
      :<div className="state-note"><History size={15}/> Событий пока нет — они появятся из записей пробега, расходов и внешних отчётов.</div>}
    </section>
    <section className="ai-banner"><img className="banner-bot" src="/robot.webp" alt=""/><div><h3>Хотите, я проверю ваш автомобиль и подскажу, на что обратить внимание?</h3><button className="primary" onClick={openAi}>ПРОВЕРИТЬ АВТО <ArrowRight size={17}/></button></div></section>
   </div>
   <button className="quick-add" title="Добавить пробег" onClick={()=>navigate('Пробег','chime')}><Plus size={24}/></button>
  </div>;
}

function NoVehiclePanel({onGoGarage}:{onGoGarage:()=>void}){
  return <section className="panel empty-garage">
   <CarFront size={40}/>
   <h2>Ваш гараж пуст</h2>
   <p>Добавьте первый автомобиль — по VIN мы соберём профиль, историю, продажи и оценки из Vehicle Databases.</p>
   <button className="primary" onClick={onGoGarage}>ОТКРЫТЬ ГАРАЖ <ArrowRight size={16}/></button>
  </section>;
}

function Reminder({icon:Icon,title,detail,tag,color}:{icon:typeof Wrench,title:string,detail:string,tag:string,color:string}){
  return <div className="reminder"><div className={'icon-disc '+color}><Icon size={19}/></div><div className="reminder-copy"><b>{title}</b><small>{detail}</small></div><span className={'tag '+color}>{tag}</span></div>;
}

function EventCard({event}:{event:HistoryEvent}){
  const meta=EVENT_META[event.type]??{title:humanizeType(event.type),color:'blue'};
  const Icon=eventIcon(event.type);
  const detail=event.mileageKm!==null?`${fmtNumber(event.mileageKm)} км · ${MODULE_LABELS[event.sourceModule]??event.sourceModule}`:(MODULE_LABELS[event.sourceModule]??event.sourceModule);
  return <div className="event"><div className={'icon-disc '+meta.color}><Icon size={20}/></div><div className="event-copy"><small>{meta.title}</small><b>{detail}</b><small className="dim">{fmtDate(event.occurredAt,true)}</small></div></div>;
}

function humanizeType(type:string){
  return type.split(/[._]/).map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' · ');
}

// dashboard computations

function pickMainCurrency(summary:ExpenseMonthlySummary|null){
  if(!summary||!summary.currencies.length)return null;
  return [...summary.currencies].sort((a,b)=>b.totalCost-a.totalCost)[0];
}

function pickNextService(statuses:MaintenanceStatus[]):MaintenanceStatus|null{
  if(!statuses.length)return null;
  const rank={stop:0,check_soon:1,attention:2,normal:3};
  return [...statuses].sort((a,b)=>{
    const d=rank[a.urgency]-rank[b.urgency];
    if(d!==0)return d;
    return (a.kmRemaining??Infinity)-(b.kmRemaining??Infinity);
  })[0];
}

function computeHealthScore(statuses:MaintenanceStatus[]):number|null{
  if(!statuses.length)return null;
  const penalty={normal:0,attention:8,check_soon:16,stop:30};
  const total=statuses.reduce((acc,s)=>acc+penalty[s.urgency],0);
  return Math.max(20,Math.round(100-total/statuses.length*2));
}

function urgencyScore(urgency:MaintenanceStatus['urgency']):number{
  return {normal:96,attention:80,check_soon:58,stop:30}[urgency];
}

function reminderDetail(s:MaintenanceStatus):string{
  const bits:string[]=[];
  if(s.kmRemaining!==null)bits.push(`через ${fmtNumber(s.kmRemaining)} км`);
  if(s.daysRemaining!==null)bits.push(`${fmtNumber(s.daysRemaining)} дн`);
  if(s.currentMileageKm!==null&&!bits.length)bits.push(`${fmtNumber(s.currentMileageKm)} км сейчас`);
  return bits.length?`Осталось: ${bits.join(' / ')}`:'Статус: '+URGENCY_META[s.urgency].tag.toLowerCase();
}

function computeDelta30(history:MileageReading[]):number|null{
  if(history.length<2)return null;
  const cutoff=Date.now()-30*24*3600*1000;
  const recent=history.filter(r=>new Date(r.recordedAt).getTime()>=cutoff);
  if(recent.length<2)return null;
  const delta=recent[recent.length-1].odometerKm-recent[0].odometerKm;
  return delta>0?delta:null;
}

interface Sparkline{line:string,area:string,lastX:number,lastY:number,minLabel:string,maxLabel:string,firstLabel:string,lastLabel:string}

function buildSparkline(history:MileageReading[]):Sparkline|null{
  const points=history.slice(-24);
  if(points.length<2)return null;
  const values=points.map(p=>p.odometerKm);
  const min=Math.min(...values), max=Math.max(...values);
  const span=max-min||1;
  const coords=points.map((p,i)=>({
    x:i/(points.length-1)*260,
    y:104-((p.odometerKm-min)/span)*88,
  }));
  const line=coords.map(c=>`${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const last=coords[coords.length-1];
  const area=`M${coords.map(c=>`${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' L')} L260 110 L0 110Z`;
  return {
    line,area,lastX:last.x,lastY:last.y,
    minLabel:`${Math.round(min/1000)}K`,
    maxLabel:`${Math.round(max/1000)}K`,
    firstLabel:fmtShortDate(points[0].recordedAt),
    lastLabel:fmtShortDate(points[points.length-1].recordedAt),
  };
}

function buildEnergyBars(entries:EnergyEntry[]):number[]{
  const volumes=entries.slice(-16).map(e=>num(e.volumeLiters)??num(e.energyKwh)??0).filter(v=>v>0);
  if(!volumes.length)return [];
  const max=Math.max(...volumes);
  return volumes.map(v=>Math.max(6,Math.round(v/max*92)));
}

function buildDonut(summary:{categories:{category:string,totalCost:number}[]}|null){
  if(!summary)return null;
  const cats=summary.categories.filter(c=>c.totalCost>0).sort((a,b)=>b.totalCost-a.totalCost);
  if(!cats.length)return null;
  const total=cats.reduce((acc,c)=>acc+c.totalCost,0);
  const top=cats.slice(0,5);
  const rest=total-top.reduce((acc,c)=>acc+c.totalCost,0);
  const items=[...top.map(c=>({name:CATEGORY_LABELS[c.category]??c.category,total:c.totalCost,percent:Math.round(c.totalCost/total*100)}))];
  if(rest>0.005)items.push({name:'Прочее',total:rest,percent:Math.round(rest/total*100)});
  let acc=0;
  const stops=items.map((it,i)=>{
    const from=acc;
    acc+=it.percent;
    return `${donutColors[i%donutColors.length]} ${from}% ${acc}%`;
  });
  return {items,gradient:`conic-gradient(${stops.join(',')})`};
}

function serviceProgress(s:MaintenanceStatus):number{
  const interval=s.rule.intervalKm??null;
  if(interval&&s.kmRemaining!==null){
    return Math.min(99,Math.max(0,Math.round((1-s.kmRemaining/interval)*100)));
  }
  return {stop:99,check_soon:85,attention:65,normal:30}[s.urgency];
}

function intervalLines(s:MaintenanceStatus):string[]{
  const lines:string[]=[];
  if(s.rule.intervalKm)lines.push(`Каждые ${fmtNumber(s.rule.intervalKm)} км`);
  if(s.rule.intervalMonths)lines.push(`Каждые ${s.rule.intervalMonths} мес`);
  if(s.rule.intervalEngineHours)lines.push(`Каждые ${fmtNumber(s.rule.intervalEngineHours)} м/ч`);
  if(s.currentMileageKm!==null)lines.push(`Сейчас ${fmtNumber(s.currentMileageKm)} км`);
  if(s.lastCompletedAt)lines.push(`Прошлое: ${fmtDate(s.lastCompletedAt)}`);
  return lines.length?lines:['Регламент не задан'];
}

function pickReminders(statuses:MaintenanceStatus[]):MaintenanceStatus[]{
  const rank={stop:0,check_soon:1,attention:2,normal:3};
  return [...statuses].sort((a,b)=>rank[a.urgency]-rank[b.urgency]).slice(0,4);
}

// ---------- inner pages ----------

function InnerPage(props:PageProps&{page:string}){
  const {page}=props;
  return <section className="inner-page">
   <PageHeader page={page} vehicle={props.vehicle} onRefresh={()=>void props.refresh()} refreshing={props.data.loading}/>
   {page==='Гараж'&&<GaragePage {...props}/>}
   {page==='Профиль авто'&&<ProfilePage {...props}/>}
   {page==='Пробег'&&<MileagePage {...props}/>}
   {page==='Сервис и ТО'&&<ServicePage {...props}/>}
   {page==='Расходы'&&<ExpensesPage {...props}/>}
   {page==='Топливо и энергия'&&<EnergyPage {...props}/>}
   {page==='История событий'&&<EventsPage {...props}/>}
   {page==='Напоминания'&&<RemindersPage {...props}/>}
   {page==='Интеграции'&&<IntegrationsPage {...props}/>}
   {page==='Отчёты'&&<ReportsPage {...props}/>}
   {page==='Настройки'&&<SettingsPage {...props}/>}
   {page==='AI Ассистент'&&<button className="primary" onClick={props.openAi}>Открыть AI Ассистента <ArrowRight size={16}/></button>}
   {page==='Документы'&&<EmptyState icon={FileText} title="Документы" text="Модуль документов уже есть в API. Интерфейс загрузки полисов и счетов появится следующим этапом."/>}
  </section>;
}

function GaragePage(props:PageProps){
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

function ProfilePage(props:PageProps){
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

function MileagePage(props:PageProps){
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

function ServicePage(props:PageProps){
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
      setMessage({kind:'ok',text:'Расход добавлен.'});
      await refresh();
    }catch(err){setMessage({kind:'err',text:errText(err)})}finally{setBusy(false)}
  };
  return <>
   <div className="panels-row">
    <form className="form-card" onSubmit={submit}>
     <h3><Wallet size={16}/> Новый расход</h3>
     <div className="form-grid">
      <Field label="Категория"><select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{EXPENSE_CATEGORIES.map(c=><option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}</select></Field>
      <Field label="Название"><input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} maxLength={160} placeholder="Замена масла" required/></Field>
      <Field label="Сумма"><input value={form.totalCost} onChange={e=>setForm({...form,totalCost:e.target.value})} placeholder="450.00" inputMode="decimal"/></Field>
      <Field label="Валюта"><input value={form.currency} onChange={e=>setForm({...form,currency:e.target.value.toUpperCase().slice(0,3)})} maxLength={3}/></Field>
      <Field label="Дата"><input type="date" value={form.occurredAt} onChange={e=>setForm({...form,occurredAt:e.target.value})}/></Field>
     </div>
     {message&&<div className={message.kind==='ok'?'ok-note':'auth-error'}>{message.text}</div>}
     <button className="primary" type="submit" disabled={busy}>{busy?'Сохраняем...':'ДОБАВИТЬ РАСХОД'}</button>
    </form>
    <div className="panel stat-panel">
     <h2>ТЕКУЩИЙ МЕСЯЦ</h2>
     <div className="metric-value">{summary?fmtNumber(summary.totalCost,2):'—'} <span>{summary?.currency??''}</span></div>
     <p>{summary?`Расходы ${fmtNumber(summary.expenseCost,2)} + энергия ${fmtNumber(summary.energyCost,2)}${data.monthExpenses?.distanceKm?` · ${fmtNumber(data.monthExpenses.distanceKm)} км`:''}`:'Нет операций за месяц'}</p>
     {summary&&summary.categories.length>0&&<div className="mini-list">{summary.categories.map(c=><div key={c.category}><span>{CATEGORY_LABELS[c.category]??c.category}</span><b>{fmtNumber(c.totalCost,2)} {summary.currency}</b></div>)}</div>}
    </div>
   </div>
   <div className="panel list-panel">
    <h2>ПОСЛЕДНИЕ РАСХОДЫ</h2>
    {data.expenses.length
     ?<table className="data-table"><thead><tr><th>Дата</th><th>Категория</th><th>Название</th><th>Пробег</th><th>Сумма</th></tr></thead><tbody>
       {data.expenses.map(x=><tr key={x.id}><td>{fmtDate(x.occurredAt)}</td><td><span className="tag">{CATEGORY_LABELS[x.category]??x.category}</span></td><td><b>{x.title}</b>{x.providerName&&<small className="sub">{x.providerName}</small>}</td><td>{x.odometerKm!==null?`${fmtNumber(x.odometerKm)} км`:'—'}</td><td><b>{fmtMoney(x.totalCost,x.currency)}</b></td></tr>)}
      </tbody></table>
     :<div className="state-note">Расходов пока нет.</div>}
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
      setMessage({kind:'ok',text:'Заправка добавлена.'});
      await refresh();
    }catch(err){setMessage({kind:'err',text:errText(err)})}finally{setBusy(false)}
  };
  return <>
   <div className="panels-row">
    <form className="form-card" onSubmit={submit}>
     <h3><Fuel size={16}/> Новая заправка / зарядка</h3>
     <div className="form-grid">
      <Field label="Тип"><select value={form.kind} onChange={e=>setForm({...form,kind:e.target.value})}><option value="fuel">Топливо</option><option value="charge">Зарядка</option></select></Field>
      {form.kind==='fuel'&&<Field label="Топливо"><select value={form.energyType} onChange={e=>setForm({...form,energyType:e.target.value})}><option value="petrol">Бензин</option><option value="diesel">Дизель</option><option value="lpg">LPG</option><option value="cng">CNG</option></select></Field>}
      <Field label={form.kind==='fuel'?'Литры':'кВт⋅ч'}><input value={form.volumeLiters} onChange={e=>setForm({...form,volumeLiters:e.target.value})} placeholder="42.5" inputMode="decimal"/></Field>
      <Field label="Цена за единицу"><input value={form.unitPrice} onChange={e=>setForm({...form,unitPrice:e.target.value})} placeholder="6.15" inputMode="decimal"/></Field>
      <Field label="Сумма"><input value={form.totalCost} onChange={e=>setForm({...form,totalCost:e.target.value})} placeholder="261.00" inputMode="decimal"/></Field>
      <Field label="Валюта"><input value={form.currency} onChange={e=>setForm({...form,currency:e.target.value.toUpperCase().slice(0,3)})} maxLength={3}/></Field>
      <Field label="Одометр, км"><input value={form.odometerKm} onChange={e=>setForm({...form,odometerKm:e.target.value.replace(/[^\d]/g,'')})} placeholder="120450" inputMode="numeric"/></Field>
      <Field label="Дата"><input type="date" value={form.occurredAt} onChange={e=>setForm({...form,occurredAt:e.target.value})}/></Field>
     </div>
     <label className="toggle-line"><input type="checkbox" checked={form.isFullTank} onChange={e=>setForm({...form,isFullTank:e.target.checked})}/> Полный бак</label>
     {message&&<div className={message.kind==='ok'?'ok-note':'auth-error'}>{message.text}</div>}
     <button className="primary" type="submit" disabled={busy}>{busy?'Сохраняем...':'ДОБАВИТЬ ЗАПРАВКУ'}</button>
    </form>
    <div className="panel stat-panel">
     <h2>FULL-TO-FULL</h2>
     {f2f
      ?<><div className="metric-value">{f2f.consumptionLitersPer100Km.toFixed(1)} <span>л/100км</span></div>
        <p>{fmtNumber(f2f.fromOdometerKm)} → {fmtNumber(f2f.toOdometerKm)} км · {fmtNumber(f2f.distanceKm)} км · залито {fmtNumber(f2f.fuelAddedLiters,1)} л</p>
        {f2f.costPer100Km!==null&&<p>Стоимость: {fmtNumber(f2f.costPer100Km,2)} {f2f.currency??''} / 100 км</p>}</>
      :<p>Нужны минимум две заправки с полным баком, чтобы посчитать точный расход.</p>}
     {data.energyMonth&&data.energyMonth.entriesCount>0&&<div className="mini-list">
      <div><span>За месяц</span><b>{data.energyMonth.entriesCount} операций</b></div>
      <div><span>Топливо</span><b>{fmtNumber(data.energyMonth.fuelLiters,1)} л</b></div>
      {data.energyMonth.money.map(m=><div key={m.currency}><span>Потрачено</span><b>{fmtNumber(m.totalCost,2)} {m.currency}</b></div>)}
     </div>}
    </div>
   </div>
   <div className="panel list-panel">
    <h2>ЗАПРАВКИ И ЗАРЯДКИ</h2>
    {data.energy.length
     ?<table className="data-table"><thead><tr><th>Дата</th><th>Тип</th><th>Объём</th><th>Одометр</th><th>Сумма</th><th>Полный бак</th></tr></thead><tbody>
       {data.energy.map(x=><tr key={x.id}><td>{fmtDate(x.occurredAt)}</td><td><span className="tag">{x.kind==='fuel'?(CATEGORY_LABELS.fuel??'Топливо'):'Зарядка'} · {x.energyType}</span></td><td>{num(x.volumeLiters)!==null?`${fmtNumber(num(x.volumeLiters),1)} л`:num(x.energyKwh)!==null?`${fmtNumber(num(x.energyKwh),1)} кВт⋅ч`:'—'}</td><td>{x.odometerKm!==null?fmtNumber(x.odometerKm):'—'}</td><td>{fmtMoney(x.totalCost,x.currency)}</td><td>{x.isFullTank?'да':'—'}</td></tr>)}
      </tbody></table>
     :<div className="state-note">Заправок пока нет.</div>}
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
   <div className="page-actions"><button className="ghost-btn" onClick={()=>void loadMore()} disabled={busy}>{busy?'Загрузка...':'Показать до 100 событий'}</button></div>
   {data.loading&&!list.length?<Spinner/>
    :list.length?<div className="events-list">{list.map(e=><EventCard key={e.id} event={e}/>)}</div>
    :<EmptyState icon={History} title="Событий пока нет" text="События создаются автоматически из записей пробега, расходов, сервисов и внешних отчётов Vehicle Databases."/>}
  </>;
}

function RemindersPage(props:PageProps){
  const {vehicle,data}=props;
  if(!vehicle)return <NoVehicle onGoGarage={()=>props.navigate('Гараж')}/>;
  const statuses=pickRemindersAll(data.maintenance);
  return statuses.length
   ?<div className="inner-grid">{statuses.map(s=><Reminder key={s.rule.id} icon={Wrench} title={s.rule.title} detail={reminderDetail(s)} tag={URGENCY_META[s.urgency].tag} color={URGENCY_META[s.urgency].color}/>)}</div>
   :<EmptyState icon={Bell} title="Напоминаний нет" text="Настройте правила ТО (сервисный интервал, срок) — CARA сама посчитает, когда пора на обслуживание."/>;
}

function pickRemindersAll(statuses:MaintenanceStatus[]):MaintenanceStatus[]{
  const rank={stop:0,check_soon:1,attention:2,normal:3};
  return [...statuses].sort((a,b)=>rank[a.urgency]-rank[b.urgency]);
}

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

// ---------- root ----------

function Root(){
  const {user,ready}=useAuth();
  if(!ready)return <div className="boot-screen"><span className="brand-mark">C</span><Spinner label="Запуск CARA..."/></div>;
  if(!user)return <AuthScreen/>;
  return <Shell/>;
}

createRoot(document.getElementById('root')!).render(<AuthProvider><Root/></AuthProvider>);
