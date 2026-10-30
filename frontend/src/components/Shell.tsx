import { t } from "./../i18n";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Bell,
  ChevronDown,
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
import { assistantApi, garageApi, type UserLanguage, type Vehicle } from "../api";
import { useAuth } from "../auth";
import { PageHeader } from "../components/CommonComponents";
import { LanguagePicker } from "./LanguagePicker";
import { SECTIONS, sections } from "../constants/dashboard";
import { useVehicleData } from "../hooks/useVehicleData";
import { DashboardPage } from "../pages/DashboardPage";
import { ExternalPages } from "../pages/ExternalPages";
import { TrackingPages } from "../pages/TrackingPages";
import { VehiclePages } from "../pages/VehiclePages";
import { setSoundEnabled, sfx, soundEnabled } from "../sound";
import type { PageProps } from "../types/dashboard";
import { errText, resolvedVehicleLine, resolvedVehicleTitle } from "../utils/formatters";

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
      {page === "AI Асистент" && (
        <button className="primary" onClick={props.openAi}> {t("Відкрити AI Асистента")} <ArrowRight size={16} />
        </button>
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
  const {user,logout,updateLanguage}=useAuth();
  const [page,setPage]=useState('Головна'); const [mobile,setMobile]=useState(false); const [ai,setAi]=useState(false); const [query,setQuery]=useState(''); const [aiQuery,setAiQuery]=useState(''); const [aiBusy,setAiBusy]=useState(false); const [aiMessages,setAiMessages]=useState<AiMessage[]>([]); const [search,setSearch]=useState(false); const [soundOn,setSoundOn]=useState(soundEnabled());
  const [vehicles,setVehicles]=useState<Vehicle[]>([]);
  const [vehiclesLoading,setVehiclesLoading]=useState(true);
  const [vehiclesError,setVehiclesError]=useState<string|null>(null);
  const [vehicleId,setVehicleId]=useState<string|null>(()=>localStorage.getItem(VEHICLE_KEY));
  const currentLanguage:UserLanguage=user?.language==="pl"||user?.language==="en"||user?.language==="uk"?user.language:"uk";

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
  const aiConversationId=useRef(0);
  useEffect(()=>{aiConversationId.current+=1;setAiMessages([]);setAiBusy(false)},[vehicleId,currentLanguage]);

  const selectVehicle=(id:string)=>{setVehicleId(id);localStorage.setItem(VEHICLE_KEY,id)};
  const navigate=(name:string,sound:'tick'|'chime'='tick')=>{setPage(name);setMobile(false);setSearch(false);sfx(sound)};
  const openAi=()=>{setAi(true);sfx('open')};
  const closeAi=()=>{setAi(false);sfx('close')};
  const toggleSound=()=>{const v=!soundOn;setSoundEnabled(v);setSoundOn(v);if(v)sfx('tick')};
  const [languageSaving,setLanguageSaving]=useState(false);
  const [languageError,setLanguageError]=useState<string|null>(null);
  const changeLanguage=async(language:UserLanguage)=>{
    setLanguageSaving(true);setLanguageError(null);
    try{await updateLanguage(language);sfx('tick')}catch(err){setLanguageError(errText(err))}finally{setLanguageSaving(false)}
  };
  const afterMutate=async()=>{await Promise.all([refresh(),loadVehicles()])};

  useEffect(()=>{
    const h=(e:KeyboardEvent)=>{if(e.key!=='Escape')return;if(ai){setAi(false);sfx('close')}setSearch(false);setMobile(false)};
    window.addEventListener('keydown',h);return()=>window.removeEventListener('keydown',h);
  },[ai]);

  const alerts=data.maintenance.filter(s=>s.urgency!=='normal').length;
  const userName=user?.displayName||user?.email||t("Гість");
  const userInitial=userName[0]?.toUpperCase()??'?';
  const currentVehicleTitle=vehicle?resolvedVehicleTitle(vehicle,data.vinDecode):t("Оберіть авто");
  const currentVehicleLine=vehicle?resolvedVehicleLine(vehicle,data.latest,data.vinDecode,data.profile):t("Гараж порожній");

  const pageProps={vehicle,vehicles,data,refresh,navigate,selectVehicle,loadVehicles,afterMutate,openAi,vehiclesLoading,vehiclesError,userName,logout};

  const sendAiMessage=async(e:FormEvent)=>{
    e.preventDefault();
    const text=aiQuery.trim();
    if(!text||aiBusy)return;
    setAiQuery('');
    setAiBusy(true);
    const conversationId=aiConversationId.current;
    setAiMessages(prev=>[...prev,{role:'user',text}]);
    try{
      const res=await assistantApi.chat({message:text,vehicleId:vehicle?.id,language:currentLanguage,
        history:aiMessages.slice(-12).map(({role,text})=>({role,content:text.slice(0,3000)}))});
      if(conversationId===aiConversationId.current)setAiMessages(prev=>[...prev,{role:'assistant',text:res.answer}]);
    }catch(err){
      if(conversationId===aiConversationId.current)setAiMessages(prev=>[...prev,{role:'assistant',text:errText(err)}]);
    }finally{
      if(conversationId===aiConversationId.current)setAiBusy(false);
    }
  };

  return <div className="app">
   <aside className={'sidebar '+(mobile?'open':'')}>
    <div className="brand"><span className="brand-mark">C</span><div><strong>CARA</strong><small>AI CAR ASSISTANT</small></div><button className="close-menu" onClick={()=>setMobile(false)}><X size={20}/></button></div>
    <button className="vehicle-picker" onClick={()=>navigate('Гараж')}>
     <img className="vehicle-thumb" src="/car.webp" alt=""/>
     <span className="vehicle-copy">
      <b>{currentVehicleTitle}</b>
      <small>{currentVehicleLine}</small>
      <em>● {vehicle?t("Онлайн"):t("Додайте автомобіль")}</em>
     </span><ChevronDown size={15}/>
    </button>
    <nav>{sections.slice(0,11).map(({name,icon:Icon})=><button key={name} className={page===name?'active':''} onClick={()=>navigate(name)}><Icon size={18}/><span>{t(name)}</span>{name==='AI Асистент'&&<i>BETA</i>}</button>)}</nav>
    <nav className="lower-nav">{sections.slice(11).map(({name,icon:Icon})=><button key={name} className={page===name?'active':''} onClick={()=>navigate(name)}><Icon size={18}/><span>{t(name)}</span></button>)}</nav>
    <button className="assistant-tile" onClick={openAi}>
     <span className="bot-avatar"><img src="/robot.webp" alt=""/></span>
     <span className="assistant-copy"><b>{t("AI Асистент")}</b><em>{t("● Онлайн")}</em><svg className="waveform" viewBox="0 0 110 22" preserveAspectRatio="none" aria-hidden="true"><polyline points="0,11 10,11 14,4 18,18 22,7 26,15 30,11 40,11 44,2 48,20 52,9 56,13 60,11 70,11 74,5 78,17 82,8 86,14 90,11 110,11"/></svg><small>{vehicle?currentVehicleTitle:t("Оберіть авто")}</small></span>
    </button>
   </aside>
   <main className="main">
    <header>
     <button className="menu-button" onClick={()=>setMobile(true)}><Menu/></button>
     <span className="pilot"><Orbit size={14}/> {t("АВТОПІЛОТ:")} {vehicleId?t("АКТИВНИЙ"):t("НЕ АКТИВНИЙ")}</span>
     <button className="ai-mode" onClick={()=>{setAi(true);sfx('activate')}}><Sparkles size={15}/> {t("АКТИВУВАТИ AI РЕЖИМ")} <span className="orb"/></button>
     <div className="header-actions">
      <button aria-label={t("Пошук")} onClick={()=>setSearch(!search)}><Search size={19}/></button>
      <button aria-label={t("Нагадування")} onClick={()=>navigate('Нагадування')}><Bell size={19}/>{alerts>0&&<sup>{alerts}</sup>}</button>
      <button aria-label={t("AI чат")} onClick={openAi}><MessageSquare size={19}/></button>
      <button aria-label={soundOn?t("Вимкнути звук"):t("Увімкнути звук")} onClick={toggleSound}>{soundOn?<Volume2 size={19}/>:<VolumeX size={19}/>}</button>
      <LanguagePicker language={currentLanguage} disabled={languageSaving} onChange={language=>void changeLanguage(language)}/>
      <button className="user-chip" onClick={()=>navigate('Налаштування')}><span className="avatar">{userInitial}</span><span className="user">{userName}<small>{t("Власник")}</small></span><ChevronDown size={14}/></button>
     </div>
    </header>
    {languageError&&<div className="auth-error" role="alert">{languageError}</div>}
    {search&&<div className="search-panel"><Search size={18}/><input autoFocus placeholder={t("Знайти розділ...")} value={query} onChange={e=>setQuery(e.target.value)}/>{sections.filter(x=>t(x.name).toLowerCase().includes(query.toLowerCase())).slice(0,5).map(x=><button key={x.name} onClick={()=>navigate(x.name)}>{t(x.name)}</button>)}</div>}
    {page==='Головна'?<DashboardPage {...pageProps}/>:<InnerPage page={page} {...pageProps}/>}
   </main>
   {mobile&&<div className="scrim" onClick={()=>setMobile(false)}/>}
   {ai&&<div className="modal-backdrop" onClick={closeAi}><div className="ai-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-dialog-title" onClick={e=>e.stopPropagation()}><button className="modal-close" aria-label={t("Закрити")} onClick={closeAi}><X/></button><img className="dialog-bot" src="/robot.webp" alt=""/><h2 id="ai-dialog-title">{t("CARA AI Асистент")}</h2><p>{t("Запитайте мене про автомобіль — я відповім з урахуванням поточного профілю, пробігу й нагадувань.")}</p><div className="ai-messages">{aiMessages.length===0?<div className="chat-placeholder">{t("Вітаю,")} {userName}{t("! Чим допомогти")}{vehicle?t(" з {0}", { 0: currentVehicleTitle }):''}?</div>:aiMessages.map((m,i)=><div key={i} className={'ai-message '+m.role}>{m.text}</div>)}{aiBusy&&<div className="ai-message assistant">{t("Думаю...")}</div>}</div><form onSubmit={sendAiMessage}><input autoFocus placeholder={t("Напишіть запитання...")} value={aiQuery} onChange={e=>setAiQuery(e.target.value)} disabled={aiBusy}/><button aria-label={t("Надіслати")} disabled={aiBusy||!aiQuery.trim()}><Send size={18}/></button></form></div></div>}
  </div>;
}
