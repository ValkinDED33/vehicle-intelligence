import { Plus, Trash2 } from "lucide-react";
import { t, getUiLocale } from "../i18n";
import type { ReminderInput } from "../api";
import { Field } from "./CommonComponents";

export type ReminderPreferences = Pick<ReminderInput, "offsets" | "remindAt" | "timeZone">;
export const defaultReminderPreferences = (): ReminderPreferences => ({ remindAt: "09:00", timeZone: "Europe/Warsaw", offsets: [{ amount: 1, unit: "months" }, { amount: 1, unit: "weeks" }] });

export function ReminderPreferenceFields({ value, onChange, disabled = false, showTime = true }: {
  value: ReminderPreferences; onChange: (value: ReminderPreferences) => void; disabled?: boolean; showTime?: boolean;
}) {
  const unitName = (amount: number, unit: string) => new Intl.NumberFormat(getUiLocale(), { style: "unit", unit: unit.slice(0, -1), unitDisplay: "long" }).formatToParts(amount).find(part => part.type === "unit")?.value ?? unit;
  return <>
    {showTime && <div className="form-grid">
      <Field label={t("Час надсилання")}><input disabled={disabled} type="time" required value={value.remindAt} onChange={e => onChange({ ...value, remindAt: e.target.value })}/></Field>
      <Field label={t("Часовий пояс")}><input disabled={disabled} required maxLength={64} value={value.timeZone} onChange={e => onChange({ ...value, timeZone: e.target.value })}/></Field>
    </div>}
    <fieldset className="reminder-offsets" disabled={disabled}><legend>{t("Нагадати за")}</legend>
      {value.offsets.map((offset, index) => <div className="reminder-offset" key={index}>
        <input type="number" min={0} max={offset.unit === "months" ? 120 : offset.unit === "weeks" ? 520 : 3650} required aria-label={t("Кількість")} value={offset.amount} onChange={e => onChange({ ...value, offsets: value.offsets.map((item, i) => i === index ? { ...item, amount: Number(e.target.value) } : item) })}/>
        <select aria-label={t("Одиниця часу")} value={offset.unit} onChange={e => onChange({ ...value, offsets: value.offsets.map((item, i) => i === index ? { ...item, unit: e.target.value as typeof offset.unit } : item) })}>{["days", "weeks", "months"].map(unit => <option key={unit} value={unit}>{unitName(offset.amount, unit)}</option>)}</select>
        <button type="button" className="ghost-btn icon-btn" title={t("Прибрати строк")} aria-label={t("Прибрати строк")} disabled={value.offsets.length === 1} onClick={() => onChange({ ...value, offsets: value.offsets.filter((_, i) => i !== index) })}><Trash2 size={16}/></button>
      </div>)}
      <button type="button" className="ghost-btn" disabled={value.offsets.length >= 10} onClick={() => onChange({ ...value, offsets: [...value.offsets, { amount: 1, unit: "days" }] })}><Plus size={16}/>{t("Додати строк")}</button>
    </fieldset>
  </>;
}
