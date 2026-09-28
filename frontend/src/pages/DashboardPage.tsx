import { AlertTriangle, ArrowRight, Check, CircleHelp, Fuel, Gauge, History, Plus, RefreshCw, Sun, Wallet, Wrench } from "lucide-react";
import { fmtDate, fmtMoney, fmtNumber } from "../api";
import { AddVehicleForm } from "../components/AddVehicleForm";
import { EmptyState, EventCard, NoVehiclePanel, Reminder, Spinner } from "../components/CommonComponents";
import { healthColors, donutColors, URGENCY_META } from "../constants/dashboard";
import type { PageProps } from "../types/dashboard";
import { buildDonut, buildEnergyBars, buildSparkline, computeDelta30, computeHealthScore, pickMainCurrency, pickNextService, pickReminders, serviceProgress } from "../utils/calculations";
import { intervalLines, reminderDetail, urgencyScore, vehicleTitle } from "../utils/formatters";

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

export { Dashboard as DashboardPage };
