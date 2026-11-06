import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { fmtDate, profileApi, type VehicleProfile } from "../api";
import { enumLabel, t } from "../i18n";
import { errText } from "../utils/formatters";
import { Spinner } from "./CommonComponents";

export function ProfileHistory({ vehicleId, version }: { vehicleId: string; version?: number }) {
  const [open,setOpen]=useState(false);
  const [rows,setRows]=useState<VehicleProfile[]|null>(null);
  const [error,setError]=useState<string|null>(null);
  useEffect(()=>{
    if(!open)return;
    let cancelled=false;setRows(null);setError(null);
    void profileApi.history(vehicleId).then(value=>{if(!cancelled)setRows(value)},err=>{if(!cancelled)setError(errText(err))});
    return()=>{cancelled=true;};
  },[vehicleId,version,open]);
  return <section className="profile-history">
    <button className="ghost-btn" aria-expanded={open} onClick={()=>setOpen(!open)}><History size={16}/>{t("Історія профілю")}</button>
    {open&&(error?<div className="auth-error" role="alert">{error}</div>:rows===null?<Spinner/>:rows.length?<div className="table-scroll"><table className="data-table"><thead><tr><th>{t("Версія профілю")}</th><th>{t("Дата")}</th><th>{t("Джерело")}</th><th>{t("Пальне")}</th><th>{t("Комплектація")}</th><th>{t("Колір")}</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td>v{row.version}{row.version===version?' · '+t("Поточний"):''}</td><td>{fmtDate(row.confirmedAt??row.createdAt,true)}</td><td>{enumLabel(row.source)}</td><td>{row.fuelType?enumLabel(row.fuelType):'—'}</td><td>{row.trimLevel??'—'}</td><td>{row.exteriorColor??'—'}</td></tr>)}</tbody></table></div>:<p className="state-note">{t("Попередніх версій немає.")}</p>)}
  </section>;
}
