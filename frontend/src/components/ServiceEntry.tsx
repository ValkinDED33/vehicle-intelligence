import { useState, type FormEvent } from "react";
import { Save, Wrench } from "lucide-react";
import { serviceRecordsApi, type MaintenanceStatus } from "../api";
import { t } from "../i18n";
import { Field } from "./CommonComponents";
import { MAINTENANCE_TASK_LABELS } from "../constants/maintenanceTasks";
import { ReminderPreferenceFields, defaultReminderPreferences } from "./ReminderPreferenceFields";
import { errText } from "../utils/formatters";

export function ServiceEntry({ vehicleId, rules, afterSave }: { vehicleId: string; rules: MaintenanceStatus[]; afterSave: () => Promise<void> }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [odometer, setOdometer] = useState("");
  const [date, setDate] = useState("");
  const [setupPlan, setSetupPlan] = useState(false);
  const [intervals, setIntervals] = useState<Record<string, { km?: string; months?: string; warning?: string }>>({});
  const [preferences, setPreferences] = useState(defaultReminderPreferences);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string }>();
  const labels = { ...MAINTENANCE_TASK_LABELS, ...Object.fromEntries(rules.filter(item => !MAINTENANCE_TASK_LABELS[item.rule.key]).map(item => [item.rule.key, item.rule.title])) };
  const label = (key: string) => MAINTENANCE_TASK_LABELS[key] ? t(MAINTENANCE_TASK_LABELS[key]) : labels[key];
  const updateInterval = (key: string, field: "km" | "months" | "warning", value: string) => setIntervals(current => ({ ...current, [key]: { ...current[key], [field]: value } }));
  const needsOdometer = selected.some(key => rules.some(item => item.rule.key === key && item.rule.intervalKm) || setupPlan && intervals[key]?.km);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage(undefined);
    try {
      if (setupPlan && (!selected.length || selected.some(key => !intervals[key]?.km && !intervals[key]?.months))) throw new Error(t("Укажіть інтервал для кожної вибраної роботи."));
      await serviceRecordsApi.create(vehicleId, {
        type: "maintenance", title: title.trim() || selected.map(label).join(", "), maintenanceKeys: selected,
        odometerKm: odometer ? Number(odometer) : undefined, occurredAt: date ? new Date(date).toISOString() : undefined,
        maintenancePlans: setupPlan ? selected.map(key => ({ key, title: label(key), completionEventType: `maintenance.${key}.completed`,
          intervalKm: intervals[key]?.km ? Number(intervals[key].km) : undefined,
          intervalMonths: intervals[key]?.months ? Number(intervals[key].months) : undefined,
          warningKmBefore: intervals[key]?.warning ? Number(intervals[key].warning) : undefined,
          telegramEnabled: true, notifyWhenDue: true, reminderOffsets: preferences.offsets, remindAt: preferences.remindAt, timeZone: preferences.timeZone,
        })) : undefined,
      });
      setTitle(""); setSelected([]); setOdometer(""); setDate(""); setSetupPlan(false); setIntervals({});
      setMessage({ error: false, text: t("Сервісний запис збережено.") }); await afterSave();
    } catch (error) { setMessage({ error: true, text: errText(error) }); }
    finally { setBusy(false); }
  };
  return <form className="form-card service-entry" onSubmit={submit}>
    <h2><Wrench size={17}/>{t("Виконане обслуговування")}</h2>
    <fieldset className="service-task-list" disabled={busy}><legend>{t("Виконані роботи")}</legend>{Object.keys(labels).map(key => <label className="toggle-line" key={key}>
      <input type="checkbox" checked={selected.includes(key)} onChange={e => setSelected(current => e.target.checked ? [...current, key] : current.filter(value => value !== key))}/>{label(key)}
    </label>)}</fieldset>
    <div className="form-grid">
      <Field label={t("Назва")}><input disabled={busy} required={!selected.length} maxLength={180} value={title} onChange={e => setTitle(e.target.value)} placeholder={selected.map(label).join(", ")}/></Field>
      <Field label={t("Одометр під час обслуговування, км")}><input disabled={busy} type="number" min={0} max={2147483647} required={needsOdometer} value={odometer} onChange={e => setOdometer(e.target.value)}/></Field>
      <Field label={t("Дата виконання")}><input disabled={busy} type="date" value={date} onChange={e => setDate(e.target.value)}/></Field>
    </div>
    {selected.length > 0 && <label className="toggle-line"><input disabled={busy} type="checkbox" checked={setupPlan} onChange={e => setSetupPlan(e.target.checked)}/>{t("Налаштувати наступне обслуговування й Telegram")}</label>}
    {setupPlan && selected.length > 0 && <>
      {selected.map(key => <fieldset className="service-plan-row" disabled={busy} key={key}><legend>{label(key)}</legend><div className="form-grid">
        <Field label={t("Інтервал, км")}><input type="number" min={1} max={2147483647} value={intervals[key]?.km ?? ""} onChange={e => updateInterval(key, "km", e.target.value)}/></Field>
        <Field label={t("Інтервал, міс.")}><input type="number" min={1} max={1200} value={intervals[key]?.months ?? ""} onChange={e => updateInterval(key, "months", e.target.value)}/></Field>
        <Field label={t("Попередити за, км")}><input type="number" min={0} max={2147483647} value={intervals[key]?.warning ?? ""} onChange={e => updateInterval(key, "warning", e.target.value)}/></Field>
      </div></fieldset>)}
      <ReminderPreferenceFields value={preferences} onChange={setPreferences} disabled={busy}/>
    </>}
    {message && <div role={message.error ? "alert" : "status"} className={message.error ? "auth-error" : "ok-note"}>{message.text}</div>}
    <button className="primary" disabled={busy} type="submit"><Save size={16}/>{busy ? t("Зберігаємо...") : t("ЗБЕРЕГТИ ОБСЛУГОВУВАННЯ")}</button>
  </form>;
}
