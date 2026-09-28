import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Bell,
  ChevronDown,
  FileText,
  Menu,
  MessageSquare,
  Orbit,
  Search,
  Send,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { assistantApi, garageApi, type Vehicle } from "../api";
import { useAuth } from "../auth";
import { EmptyState, PageHeader } from "../components/CommonComponents";
import { SECTIONS, sections } from "../constants/dashboard";
import { useVehicleData } from "../hooks/useVehicleData";
import { DashboardPage } from "../pages/DashboardPage";
import { ExternalPages } from "../pages/ExternalPages";
import { TrackingPages } from "../pages/TrackingPages";
import { VehiclePages } from "../pages/VehiclePages";
import { setSoundEnabled, sfx, soundEnabled } from "../sound";
import type { PageProps } from "../types/dashboard";
import { errText, vehicleLine, vehicleTitle } from "../utils/formatters";

function InnerPage(props: PageProps & { page: string }) {
  const { page } = props;
  return (
    <section className="inner-page">
      <PageHeader
        page={page}
        vehicle={props.vehicle}
        onRefresh={() => void props.refresh()}
        refreshing={props.data.loading}
      />
      <VehiclePages {...props} page={page} />
      <TrackingPages {...props} page={page} />
      <ExternalPages {...props} page={page} />
      {page === "AI Ассистент" && (
        <button className="primary" onClick={props.openAi}>
          Открыть AI Ассистента <ArrowRight size={16} />
        </button>
      )}
      {page === "Документы" && (
        <EmptyState
          icon={FileText}
          title="Документы"
          text="Модуль документов уже есть в API. Интерфейс загрузки полисов и счетов появится следующим этапом."
        />
      )}
    </section>
  );
}



const VEHICLE_KEY='cara.vehicleId';

type AiMessage = {
  role: "assistant" | "user";
  text: string;
};

export function Shell(){
  const {user,logout}=useAuth();
  const [page,setPage]=useState('Главная'); const [mobile,setMobile]=useState(false); const [ai,setAi]=useState(false); const [query,setQuery]=useState(''); const [aiQuery,setAiQuery]=useState(''); const [aiBusy,setAiBusy]=useState(false); const [aiMessages,setAiMessages]=useState<AiMessage[]>([]); const [search,setSearch]=useState(false); const [soundOn,setSoundOn]=useState(soundEnabled());
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

  const sendAiMessage=async(e:FormEvent)=>{
    e.preventDefault();
    const text=aiQuery.trim();
    if(!text||aiBusy)return;
    setAiQuery('');
    setAiBusy(true);
    setAiMessages(prev=>[...prev,{role:'user',text}]);
    try{
      const res=await assistantApi.chat({message:text,vehicleId:vehicle?.id});
      setAiMessages(prev=>[...prev,{role:'assistant',text:res.answer}]);
    }catch(err){
      setAiMessages(prev=>[...prev,{role:'assistant',text:errText(err)}]);
    }finally{
      setAiBusy(false);
    }
  };

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
    {page==='Главная'?<DashboardPage {...pageProps}/>:<InnerPage page={page} {...pageProps}/>}
   </main>
   {mobile&&<div className="scrim" onClick={()=>setMobile(false)}/>}
   {ai&&<div className="modal-backdrop" onClick={closeAi}><div className="ai-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-dialog-title" onClick={e=>e.stopPropagation()}><button className="modal-close" aria-label="Закрыть" onClick={closeAi}><X/></button><img className="dialog-bot" src="/robot.webp" alt=""/><h2 id="ai-dialog-title">CARA AI Ассистент</h2><p>Спросите меня об автомобиле — я отвечу с учётом текущего профиля, пробега и напоминаний.</p><div className="ai-messages">{aiMessages.length===0?<div className="chat-placeholder">Привет, {userName}! Чем помочь{vehicle?` с ${vehicleTitle(vehicle)}`:''}?</div>:aiMessages.map((m,i)=><div key={i} className={'ai-message '+m.role}>{m.text}</div>)}{aiBusy&&<div className="ai-message assistant">Думаю...</div>}</div><form onSubmit={sendAiMessage}><input autoFocus placeholder="Напишите вопрос..." value={aiQuery} onChange={e=>setAiQuery(e.target.value)} disabled={aiBusy}/><button aria-label="Отправить" disabled={aiBusy||!aiQuery.trim()}><Send size={18}/></button></form></div></div>}
  </div>;
}
