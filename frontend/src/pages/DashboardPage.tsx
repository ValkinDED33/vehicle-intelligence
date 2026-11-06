import { t, getUiLocale } from "../i18n";
import { AlertTriangle, ArrowRight, Bell, Check, CircleHelp, Fuel, Gauge, History, Plus, RefreshCw, Sun, Wallet, Wrench } from "lucide-react";
import { fmtDate, fmtMoney, fmtNumber } from "../api";
import { AddVehicleForm } from "../components/AddVehicleForm";
import { VehicleTransformer } from "../components/VehicleTransformer";
import { EmptyState, EventCard, NoVehiclePanel, Reminder, Spinner } from "../components/CommonComponents";
import { healthColors, donutColors, URGENCY_META } from "../constants/dashboard";
import type { PageProps } from "../types/dashboard";
import { buildDonut, buildEnergyBars, buildSparkline, computeDelta30, computeHealthScore, pickMainCurrency, pickNextService, pickReminders, serviceProgress } from "../utils/calculations";
import { intervalLines, reminderDetail, urgencyScore, vehicleTitle } from "../utils/formatters";
import { reminderCondition } from "../utils/reminders";

function Dashboard(props:PageProps){
  const {vehicle,data,navigate,openAi,vehiclesLoading,vehiclesError,userName,loadVehicles}=props;

  if(vehiclesLoading)return <div className="dashboard"><Spinner label={t("Під’єднуємо гараж...")}/></div>;
  if(vehiclesError)return <div className="dashboard"><EmptyState icon={AlertTriangle} title={t("Не вдалося завантажити гараж")} text={vehiclesError} action={<button className="primary" onClick={()=>void loadVehicles()}>{t("ПОВТОРИТИ")} <RefreshCw size={15}/></button>}/></div>;
  if(!vehicle)return <div className="dashboard">
    <NoVehiclePanel onGoGarage={()=>navigate('Гараж')}/>
    <AddVehicleForm onDone={()=>void loadVehicles()}/>
  </div>;

  const latest=data.latest;
  const monthSummary=pickMainCurrency(data.monthExpenses);
  const nextService=pickNextService(data.maintenance);
  const healthScore=data.loading||data.errors.length?null:computeHealthScore(data.maintenance);
  const healthItems=data.maintenance.slice(0,6);
  const reminders=pickReminders(data.maintenance);
  const scheduled=(data.reminders?.reminders??[]).filter(r=>r.status==='active').sort((a,b)=>new Date(a.serviceDueDate??a.dueDate).getTime()-new Date(b.serviceDueDate??b.dueDate).getTime()).slice(0,4);
  const linkedRules=new Set(scheduled.map(r=>r.maintenanceRuleId).filter(Boolean));
  const serviceReminders=reminders.filter(r=>!linkedRules.has(r.rule.id));
  const incomplete=data.errors.length>0;
  const electric=data.profile?.fuelType==='electric';
  const recentEvents=data.events.slice(0,8);
  const delta30=computeDelta30(data.mileageHistory);
  const spark=buildSparkline(data.mileageHistory);
  const consumption=data.fullToFull?.consumptionLitersPer100Km??null;
  const energyBars=buildEnergyBars(data.energy.filter(e=>e.kind===(electric?'charge':'fuel')));
  const donut=buildDonut(monthSummary);
  const anomalies=data.anomalies?.anomalies??[];

  return <div className="dashboard">
   {incomplete&&<div role="status" className="auth-error">{t("Частину даних не вдалося завантажити. Оновіть сторінку перед змінами.")} <button onClick={()=>void props.refresh()}>{t("Оновити")}</button></div>}
   {!data.loading&&!incomplete&&(!data.latest||!data.profile||!data.maintenance.length||!data.reminders?.telegramLinked)&&<section className="journey-steps"><h2>{t("Наступні дії")}</h2>
    {!data.profile&&<button className="ghost-btn" onClick={()=>navigate('Профіль авто')}>{t("Заповнити профіль авто")}<ArrowRight size={15}/></button>}
    {!data.latest&&<button className="ghost-btn" onClick={()=>navigate('Пробіг')}>{t("Записати поточний пробіг")}<ArrowRight size={15}/></button>}
    {!data.maintenance.length&&<button className="ghost-btn" onClick={()=>navigate('Сервіс і ТО')}>{t("Додати виконане обслуговування")}<ArrowRight size={15}/></button>}
    {data.reminders&&!data.reminders.telegramLinked&&<button className="ghost-btn" onClick={()=>navigate('Налаштування')}>{t("ПІД’ЄДНАТИ TELEGRAM")}<ArrowRight size={15}/></button>}
   </section>}
   <div className="top-grid">
    <section className="hero">
     <VehicleTransformer hero vehicle={vehicle} profile={data.profile}/>
     <div className="hero-copy"><h1>{t("Вітаю,")} {userName}! <span className="wave">👋</span></h1><p>{t("Я — твій автомобільний AI-помічник.")}<br/>{t("Я тут, щоб дбати про твій")} {vehicleTitle(vehicle)}<br/>{t("і робити кожну поїздку кращою.")}</p></div>
     <div className="weather"><Sun size={28}/><div><b>{latest?fmtNumber(latest.odometerKm):'—'} <small>{t("км")}</small></b><small>{t("одометр")}</small></div><small className="date">{fmtDate(new Date().toISOString())}<br/>{new Date().toLocaleTimeString(getUiLocale(),{hour:'2-digit',minute:'2-digit'})}</small></div>
     <div className="hero-bubble">{data.loading?t("Синхронізую дані..."):incomplete?t("Дані завантажено не повністю"):anomalies.length?t("Знайдено аномалії пробігу: {0}. Перевір розділ «Пробіг».", { 0: anomalies.length }):t("Дані синхронізовано.")}</div>
     <div className="status-cards">
      <div><span className="icon-disc green"><Gauge size={17}/></span><span>{t("ПРОБІГ")}<small>{t("останній запис")}</small><b>{latest?t("{0} км", { 0: fmtNumber(latest.odometerKm) }):t("немає даних")}</b></span></div>
      <div><span className="icon-disc orange"><Fuel size={17}/></span><span>{electric?t("ЗАРЯДЖЕНО"):t("ВИТРАТА")}<small>{electric?t("за місяць"):'full-to-full'}</small><b>{electric?(data.energyMonth?t("{0} кВт⋅год",{0:fmtNumber(data.energyMonth.energyKwh,1)}):'—'):consumption!==null?t("{0} л/100км", { 0: consumption.toFixed(1) }):'—'}</b></span></div>
      <div><span className="icon-disc purple"><Wrench size={17}/></span><span>{t("ТО")}<small>{nextService?nextService.rule.title:t("правил немає")}</small><b>{nextService&&nextService.kmRemaining!==null?t("через {0} км", { 0: fmtNumber(nextService.kmRemaining) }):nextService?'—':'—'}</b></span></div>
     </div>
    </section>
    <div className="right-stack">
     <section className="panel reminders">
      <div className="panel-heading"><h2>{t("НАЙБЛИЖЧІ НАГАДУВАННЯ")}</h2><button onClick={()=>navigate('Нагадування')}>{t("Дивитися всі")}</button></div>
      {data.loading&&!reminders.length?<Spinner/>
       :scheduled.length||serviceReminders.length?<>{scheduled.map(r=><button className="reminder-link" key={r.id} onClick={()=>navigate(r.maintenanceRuleId?'Сервіс і ТО':'Нагадування')}><Reminder icon={Bell} title={r.title} detail={reminderCondition(r)} tag={t("Відкрити")} color="blue"/></button>)}{serviceReminders.map(r=><button className="reminder-link" key={r.rule.id} onClick={()=>navigate('Сервіс і ТО')}><Reminder icon={Wrench} title={r.rule.title} detail={reminderDetail(r)} tag={URGENCY_META[r.urgency].tag} color={URGENCY_META[r.urgency].color}/></button>)}</>
       :<div className="state-note"><CircleHelp size={15}/> {t("Правила ТО не налаштовані — зазирніть у «Сервіс і ТО».")}</div>}
     </section>
     <section className="panel health">
      <h2>{t("СТАТУС ОБСЛУГОВУВАННЯ")}</h2>
      <div className="health-content">
       <div className="ring" style={healthScore!==null?{background:`conic-gradient(var(--teal) 0 ${healthScore}%,rgba(10,40,70,.9) ${healthScore}% 100%)`}:undefined}><strong>{healthScore!==null?healthScore:'—'}<small>/100</small></strong></div>
       <div className="health-list">
        {healthItems.length?healthItems.map((s,i)=><div key={s.rule.id}><i style={{background:healthColors[i%healthColors.length],color:healthColors[i%healthColors.length]}}/>{s.rule.title}<b>{computeHealthScore([s])??'—'}<span>/100</span></b></div>)
         :<div><i style={{background:'#44baff',color:'#44baff'}}/>{t("Немає активних правил ТО")}</div>}
       </div>
      </div>
      {anomalies.length
       ?<div className="good warn"><AlertTriangle size={15}/> {t("Аномалії пробігу:")} {anomalies.length} <span>{t("Перевірте розділ «Пробіг».")}</span></div>
       :<div className={'good'+(incomplete||healthScore===null||data.maintenance.some(s=>s.urgency!=='normal')?' warn':'')}>{healthScore===null?<CircleHelp size={15}/>:data.maintenance.some(s=>s.urgency!=='normal')?<AlertTriangle size={15}/>:<Check size={15}/>} {data.loading?t("Синхронізую дані..."):incomplete?t("Дані завантажено не повністю"):healthScore===null?t("Недостатньо даних для оцінки"):data.maintenance.some(s=>s.urgency!=='normal')?t("Обслуговування потребує уваги"):t("Дані в порядку")}</div>}
      <small className="data-note">{t("Оцінку розраховано за статусами обслуговування з vehicle-intelligence API.")}</small>
     </section>
    </div>
   </div>
   <div className="metric-grid">
    <section className="panel metric" onClick={()=>navigate('Пробіг')}>
     <h2>{t("ПРОБІГ")}</h2>
     <div className="metric-value">{latest?fmtNumber(latest.odometerKm):'—'} <span>{t("км")}</span></div>
     <div className="metric-sub">{delta30!==null?t("+{0} км за 30 днів", { 0: fmtNumber(delta30) }):t("Немає свіжих записів")}</div>
     {spark
      ?<div className="line-chart">
        <span className="chart-chip"><b>{fmtNumber(latest!.odometerKm)} {t("км")}</b><small>{fmtDate(latest!.recordedAt)}</small></span>
        <div className="chart-labels">{spark.maxLabel}<br/>{spark.minLabel}</div>
        <svg viewBox="0 0 260 110" preserveAspectRatio="none"><defs><linearGradient id="lg" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#00e88a" stopOpacity=".35"/><stop offset="1" stopColor="#00e88a" stopOpacity="0"/></linearGradient></defs><path d={spark.area} fill="url(#lg)"/><polyline points={spark.line} fill="none" stroke="#00eb9f" strokeWidth="2"/><circle cx={spark.lastX} cy={spark.lastY} r="3.5" fill="#00eb9f"/></svg>
       </div>
      :<div className="state-note tall"><Gauge size={16}/> {t("Додайте хоча б два записи пробігу — тут з’явиться графік.")}</div>}
     {spark&&<div className="chart-months">{spark.firstLabel} <span>{spark.lastLabel}</span></div>}
    </section>
    <section className="panel metric" onClick={()=>navigate('Витрати')}>
     <h2>{t("ВИТРАТИ")} <small>{t("(поточний місяць)")}</small></h2>
     <div className="metric-value">{monthSummary?fmtNumber(monthSummary.totalCost,2):'—'} <span>{monthSummary?.currency??''}</span></div>
     {(data.monthExpenses?.currencies.length??0)>1&&<div className="metric-sub">{data.monthExpenses!.currencies.filter(row=>row.currency!==monthSummary?.currency).map(row=>`${fmtNumber(row.totalCost,2)} ${row.currency}`).join(' · ')}</div>}
     <div className="metric-sub">{monthSummary&&monthSummary.costPer100Km!==null?t("{0} / 100 км", { 0: fmtNumber(monthSummary.costPer100Km,2) }):t("Підсумок за місяць")}</div>
     {donut
      ?<div className="expense-chart"><div className="donut" style={{background:donut.gradient}}/><div className="legend">{donut.items.map((c,i)=><div key={c.name}><i style={{background:donutColors[i%donutColors.length],boxShadow:`0 0 8px ${donutColors[i%donutColors.length]}`}}/>{c.name} <span>{fmtNumber(c.total,2)} {monthSummary?.currency} ({c.percent}%)</span></div>)}</div></div>
      :<div className="state-note tall"><Wallet size={16}/> {t("Цього місяця витрат поки немає.")}</div>}
    </section>
    <section className="panel metric" onClick={()=>navigate('Пальне й енергія')}>
     <h2>{electric?t("ЗАРЯДЖЕНО"):t("СЕРЕДНЯ ВИТРАТА")}</h2>
     <div className="metric-value">{electric?(data.energyMonth?fmtNumber(data.energyMonth.energyKwh,1):'—'):consumption!==null?consumption.toFixed(1):'—'} <span>{electric?t("кВт⋅год"):t("л/100км")}</span></div>
     <div className="metric-sub">{electric?t("за місяць"):data.fullToFull?t("full-to-full · {0} км", { 0: fmtNumber(data.fullToFull.distanceKm) }):t("Потрібні дві повні заправки")}</div>
     {energyBars.length
      ?<div className="bar-wrap"><span className="chart-chip"><b>{data.energyMonth?electric?t("{0} кВт⋅год",{0:fmtNumber(data.energyMonth.energyKwh,1)}):t("{0} л", { 0: fmtNumber(data.energyMonth.fuelLiters,1) }):'—'}</b><small>{t("за місяць")}</small></span><div className="bar-chart">{energyBars.map((n,i)=><div key={i} style={{height:`${n}%`}}/>)}</div></div>
      :<div className="state-note tall"><Fuel size={16}/> {electric?t("Записи заряджання доступні в розділі «Пальне й енергія»."):t("Додайте заправки — витрата порахується автоматично.")}</div>}
     {energyBars.length>0&&<div className="chart-months">{electric?t("Останні заряджання"):t("Останні заправки")} <span>{electric?t("кВт⋅год"):t("об’єм, л")}</span></div>}
    </section>
    <section className="panel metric service" onClick={()=>navigate('Сервіс і ТО')}>
     <h2>{t("НАСТУПНЕ ТО")}</h2>
     {nextService
      ?<>
        <div className="metric-value smaller">{nextService.kmRemaining!==null?t("Через {0} км", { 0: fmtNumber(nextService.kmRemaining) }):t("За строком")}</div>
        <p>{nextService.daysRemaining!==null?t("або {0} дн.", { 0: fmtNumber(nextService.daysRemaining) }):nextService.rule.title}</p>
        <div className="service-row">
         <div className="progress-ring" style={{background:`conic-gradient(#00cead 0 ${serviceProgress(nextService)}%,#893bff ${serviceProgress(nextService)}% 100%)`}}><strong>{serviceProgress(nextService)}<small>%</small></strong></div>
         <div className="checklist">{t("Інтервали:")}{intervalLines(nextService).map(x=><div key={x}><Check size={14}/> {x}</div>)}</div>
        </div>
       </>
      :<div className="state-note tall"><Wrench size={16}/> {t("Правила ТО не налаштовані. Відкрийте «Сервіс і ТО», щоб додати регламент.")}</div>}
    </section>
   </div>
   <div className="bottom-grid">
    <section className="panel recent">
     <div className="panel-heading"><h2>{t("ОСТАННІ ПОДІЇ")}</h2><button onClick={()=>navigate('Історія подій')}>{t("Усі події →")}</button></div>
     {data.loading&&!recentEvents.length?<Spinner/>
      :recentEvents.length?<div className="events">{recentEvents.map(e=><EventCard key={e.id} event={e}/>)}</div>
      :<div className="state-note"><History size={15}/> {t("Подій поки немає — вони з’являться із записів пробігу, витрат і зовнішніх звітів.")}</div>}
    </section>
    <section className="ai-banner"><VehicleTransformer className="banner-bot" vehicle={vehicle} profile={data.profile}/><div><h3>{t("Хочете, я перевірю ваш автомобіль і підкажу, на що звернути увагу?")}</h3><button className="primary" onClick={openAi}>{t("ПЕРЕВІРИТИ АВТО")} <ArrowRight size={17}/></button></div></section>
   </div>
   <button className="quick-add" title={t("Додати пробіг")} onClick={()=>navigate('Пробіг','chime')}><Plus size={24}/></button>
  </div>;
}

export { Dashboard as DashboardPage };
