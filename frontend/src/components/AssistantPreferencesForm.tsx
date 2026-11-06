import { useEffect, useState, type FormEvent } from "react";
import { RefreshCw, Save } from "lucide-react";
import { assistantApi, type AssistantPreferences } from "../api";
import { t } from "../i18n";
import { errText } from "../utils/formatters";
import { Field, Spinner } from "./CommonComponents";

export function AssistantPreferencesForm() {
  const [value,setValue]=useState<AssistantPreferences|null>(null);
  const [busy,setBusy]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [saved,setSaved]=useState(false);
  useEffect(()=>{
    let cancelled=false;
    void assistantApi.preferences().then(data=>{if(!cancelled)setValue(data)},err=>{if(!cancelled)setError(errText(err))}).finally(()=>{if(!cancelled)setBusy(false)});
    return()=>{cancelled=true;};
  },[]);
  const reload=async()=>{
    setBusy(true);setError(null);setSaved(false);
    try {setValue(await assistantApi.preferences());} catch(err){setError(errText(err));}finally{setBusy(false);}
  };
  const submit=async(event:FormEvent)=>{
    event.preventDefault();if(!value||busy)return;
    setBusy(true);setError(null);setSaved(false);
    try {
      const {revision,...preferences}=value;
      setValue(await assistantApi.savePreferences({...preferences,expectedRevision:revision}));setSaved(true);
    }catch(err){setError(errText(err));}finally{setBusy(false);}
  };
  return <form className="assistant-preferences" onSubmit={submit}>
    <div className="panel-heading"><h2>{t("НАЛАШТУВАННЯ ПОМІЧНИКА")}</h2><button type="button" className="ghost-btn" disabled={busy} title={t("Оновити")} aria-label={t("Оновити")} onClick={()=>void reload()}><RefreshCw size={16}/></button></div>
    {busy&&!value?<Spinner/>:value&&<fieldset disabled={busy} className="form-grid">
      <Field label={t("Докладність відповідей")}><select aria-label={t("Докладність відповідей")} value={value.detailLevel} onChange={event=>{setValue({...value,detailLevel:event.target.value as AssistantPreferences['detailLevel']});setSaved(false)}}><option value="concise">{t("Стисло")}</option><option value="detailed">{t("Докладно")}</option></select></Field>
      <Field label={t("Ваш пріоритет")}><select aria-label={t("Ваш пріоритет")} value={value.priority} onChange={event=>{setValue({...value,priority:event.target.value as AssistantPreferences['priority']});setSaved(false)}}><option value="balanced">{t("Баланс витрат і надійності")}</option><option value="reliability">{t("Надійність")}</option><option value="economy">{t("Ощадливе обслуговування")}</option></select></Field>
      <Field label={t("Тип поїздок")}><select aria-label={t("Тип поїздок")} value={value.drivingPattern} onChange={event=>{setValue({...value,drivingPattern:event.target.value as AssistantPreferences['drivingPattern']});setSaved(false)}}><option value="unspecified">{t("Не вказано")}</option><option value="city">{t("Місто")}</option><option value="highway">{t("Траса")}</option><option value="mixed">{t("Змішаний")}</option></select></Field>
    </fieldset>}
    {error&&<div className="auth-error" role="alert">{error}</div>}
    {saved&&<div className="ok-note" role="status">{t("Налаштування помічника збережено.")}</div>}
    <button className="ghost-btn" type="submit" disabled={busy||!value}><Save size={16}/>{t("ЗБЕРЕГТИ ЗМІНИ")}</button>
  </form>;
}
