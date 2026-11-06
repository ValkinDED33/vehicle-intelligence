import { useEffect, useState } from "react";
import { expensesApi, fmtNumber, type ExpenseMonthlySummary } from "../api";
import { t } from "../i18n";
import { CATEGORY_LABELS } from "../constants/dashboard";
import { errText } from "../utils/formatters";
import { Field, Spinner } from "./CommonComponents";

export function MonthlyExpenses({vehicleId,current}:{vehicleId:string;current:ExpenseMonthlySummary|null}) {
  const [period,setPeriod]=useState(()=>{const date=new Date();return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;});
  const [currency,setCurrency]=useState('');
  const [data,setData]=useState<ExpenseMonthlySummary|null>(null);
  const [error,setError]=useState<string|null>(null);
  useEffect(()=>{
    if(!/^\d{4}-\d{2}$/.test(period))return;
    let cancelled=false;setData(null);setError(null);
    const [year,month]=period.split('-').map(Number);
    void expensesApi.monthlySummary(vehicleId,year,month).then(value=>{if(!cancelled)setData(value)},err=>{if(!cancelled)setError(errText(err))});
    return()=>{cancelled=true;};
  },[vehicleId,period,current]);
  const summary=data?.currencies.find(row=>row.currency===currency)??data?.currencies[0];
  return <section className="panel stat-panel">
    <h2>{t("ВИТРАТИ ЗА МІСЯЦЬ")}</h2>
    <div className="form-grid"><Field label={t("Місяць")}><input type="month" min="2000-01" max="2200-12" value={period} onChange={e=>{if(e.target.validity.valid&&e.target.value)setPeriod(e.target.value)}}/></Field>
      {Boolean(data?.currencies.length)&&<Field label={t("Валюта")}><select value={summary?.currency??''} onChange={e=>setCurrency(e.target.value)}>{data!.currencies.map(row=><option key={row.currency}>{row.currency}</option>)}</select></Field>}
    </div>
    {error?<div className="auth-error" role="alert">{error}</div>:data===null?<Spinner/>:<>
      <div className="metric-value">{summary?fmtNumber(summary.totalCost,2):'—'} <span>{summary?.currency??''}</span></div>
      <p>{summary?t("Витрати {0} + енергія {1}{2}",{0:fmtNumber(summary.expenseCost,2),1:fmtNumber(summary.energyCost,2),2:data.distanceKm?' · '+t("{0} км",{0:fmtNumber(data.distanceKm)}):''}):t("Немає операцій за місяць")}</p>
      {summary?.costPer100Km!=null&&<p>{fmtNumber(summary.costPer100Km,2)} {summary.currency} {t("/ 100 км")}</p>}
      {summary&&<div className="mini-list">{summary.categories.map(row=><div key={row.category}><span>{t(CATEGORY_LABELS[row.category]??row.category)}</span><b>{fmtNumber(row.totalCost,2)} {summary.currency}</b></div>)}</div>}
    </>}
  </section>;
}
