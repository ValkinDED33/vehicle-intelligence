import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Bell, Check, Pencil, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import { remindersApi, type ReminderInput, type RemindersResponse, type ScheduledReminder } from "../api";
import { getUiLocale, t } from "../i18n";
import { Field, Spinner } from "./CommonComponents";
import { errText } from "../utils/formatters";
import { reminderCondition, reminderDeliveryStatus } from "../utils/reminders";

const initialForm = (): ReminderInput => ({ title: "", dueDate: "", remindAt: "09:00", timeZone: "Europe/Warsaw", offsets: [{ amount: 1, unit: "months" }, { amount: 1, unit: "weeks" }] });

export function ScheduledReminders({ vehicleId, onSettings, onService, onChanged }: { vehicleId: string; onSettings: () => void; onService: () => void; onChanged: () => Promise<void> }) {
  const [result, setResult] = useState<RemindersResponse | null>(null);
  const [form, setForm] = useState<ReminderInput>(initialForm);
  const [editing, setEditing] = useState<{ id: string; revision: number }>();
  const [preview, setPreview] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showClosed, setShowClosed] = useState(false);
  const generation = useRef(0);
  const loadVersion = useRef(0);
  const reload = useCallback(async () => {
    const current = generation.current;
    const version = ++loadVersion.current;
    const data = await remindersApi.list(vehicleId);
    if (generation.current === current && loadVersion.current === version) setResult(data);
  }, [vehicleId]);
  useEffect(() => {
    generation.current++;
    setResult(null); setForm(initialForm()); setEditing(undefined); setPreview(null); setError(""); setBusy(false);
    void reload().catch(err => setError(errText(err)));
    const focus = () => { void reload().catch(() => undefined); };
    window.addEventListener("focus", focus);
    return () => { generation.current++; window.removeEventListener("focus", focus); };
  }, [reload]);
  const update = (next: ReminderInput) => { setForm(next); setPreview(null); };
  const dateTime = (date: string, timeZone: string) => new Intl.DateTimeFormat(getUiLocale(), {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone,
  }).format(new Date(date));
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(""); setBusy(true);
    const current = generation.current;
    try {
      if (!preview) {
        const response = await remindersApi.preview(vehicleId, form);
        if (current === generation.current) setPreview(response.scheduledAt);
      } else {
        await remindersApi.save(vehicleId, form, editing);
        if (current !== generation.current) return;
        setEditing(undefined); setForm(initialForm()); setPreview(null); await reload(); await onChanged();
      }
    } catch (err) { if (current === generation.current) setError(errText(err)); }
    finally { if (current === generation.current) setBusy(false); }
  };
  const close = async (reminder: ScheduledReminder, status: "completed" | "cancelled") => {
    if (!window.confirm(reminder.maintenanceRuleId ? t("Вимкнути всі сповіщення цього регламенту ТО?") : status === "completed" ? t("Позначити подію виконаною і зупинити сповіщення?") : t("Скасувати це нагадування та всі майбутні сповіщення?"))) return;
    const current = generation.current;
    setBusy(true); setError("");
    try {
      await remindersApi.status(vehicleId, reminder, status);
      if (current === generation.current) { if (editing?.id === reminder.id) { setEditing(undefined); setForm(initialForm()); setPreview(null); } await reload(); await onChanged(); }
    } catch (err) { if (current === generation.current) setError(errText(err)); }
    finally { if (current === generation.current) setBusy(false); }
  };
  const unitName = (amount: number, unit: string) => new Intl.NumberFormat(getUiLocale(), { style: "unit", unit: unit.slice(0, -1), unitDisplay: "long" }).formatToParts(amount).find(part => part.type === "unit")?.value ?? unit;
  return <section className="scheduled-reminders">
    <h2><Bell size={18}/>{t("Нагадування в Telegram")}<button className="ghost-btn icon-btn" aria-label={t("Оновити")} title={t("Оновити")} disabled={busy} onClick={() => { void reload().catch(err => setError(errText(err))); }}><RefreshCw size={16}/></button></h2>
    {result && !result.telegramLinked && <div className="state-note">{t("Telegram не під’єднано.")} <button className="ghost-btn" onClick={onSettings}>{t("Налаштування")}</button></div>}
    {result && !result.deliveryEnabled && <p role="status" className="auth-error">{t("Автоматичне надсилання ще не ввімкнено на сервері.")}</p>}
    <form className="form-card reminder-form" onSubmit={submit}>
      <h3>{editing ? t("Змінити нагадування") : t("Нове нагадування")}</h3>
      <div className="form-grid">
        <Field label={t("Назва")}><input disabled={busy} required maxLength={180} value={form.title} onChange={e => update({ ...form, title: e.target.value })}/></Field>
        <Field label={t("Дата події")}><input disabled={busy} type="date" required value={form.dueDate} onChange={e => update({ ...form, dueDate: e.target.value })}/></Field>
        <Field label={t("Час надсилання")}><input disabled={busy} type="time" required value={form.remindAt} onChange={e => update({ ...form, remindAt: e.target.value })}/></Field>
        <Field label={t("Часовий пояс")}><input disabled={busy} list="reminder-timezones" required maxLength={64} value={form.timeZone} onChange={e => update({ ...form, timeZone: e.target.value })}/><datalist id="reminder-timezones">{["Europe/Warsaw", "Europe/Kyiv", "Europe/London", "Europe/Berlin", "Europe/Paris", "America/New_York", "America/Los_Angeles", "Asia/Dubai", "UTC"].map(zone => <option key={zone} value={zone}/>)}</datalist></Field>
      </div>
      <fieldset className="reminder-offsets" disabled={busy}><legend>{t("Нагадати за")}</legend>
        {form.offsets.map((offset, index) => <div className="reminder-offset" key={index}>
          <input type="number" min={0} max={offset.unit === "months" ? 120 : offset.unit === "weeks" ? 520 : 3650} required aria-label={t("Кількість")} value={offset.amount} onChange={e => update({ ...form, offsets: form.offsets.map((value, i) => i === index ? { ...value, amount: Number(e.target.value) } : value) })}/>
          <select aria-label={t("Одиниця часу")} value={offset.unit} onChange={e => update({ ...form, offsets: form.offsets.map((value, i) => i === index ? { ...value, unit: e.target.value as typeof offset.unit } : value) })}>{["days", "weeks", "months"].map(unit => <option key={unit} value={unit}>{unitName(offset.amount, unit)}</option>)}</select>
          <button type="button" className="ghost-btn icon-btn" title={t("Прибрати строк")} aria-label={t("Прибрати строк")} disabled={form.offsets.length === 1} onClick={() => update({ ...form, offsets: form.offsets.filter((_, i) => i !== index) })}><Trash2 size={16}/></button>
        </div>)}
        <button type="button" className="ghost-btn" disabled={form.offsets.length >= 10} onClick={() => update({ ...form, offsets: [...form.offsets, { amount: 1, unit: "days" }] })}><Plus size={16}/>{t("Додати строк")}</button>
      </fieldset>
      {preview && <div className="reminder-preview" role="status"><b>{t("Дати сповіщень")}</b>{preview.map(date => <span key={date}>{dateTime(date, form.timeZone)} · {form.timeZone}</span>)}</div>}
      <div className="page-actions"><button type="submit" className="primary" disabled={busy}><Save size={16}/>{busy ? t("Зберігаємо...") : preview ? t("Підтвердити й зберегти") : t("Перевірити дати")}</button>
        {editing && <button type="button" className="ghost-btn" disabled={busy} onClick={() => { setEditing(undefined); setForm(initialForm()); setPreview(null); }}><X size={16}/>{t("Скасувати")}</button>}</div>
    </form>
    {error && <p role="alert" className="auth-error">{error}</p>}
    <div className="page-actions"><label className="toggle-line"><input type="checkbox" checked={showClosed} onChange={e => setShowClosed(e.target.checked)}/>{t("Показати завершені й скасовані")}</label></div>
    {!result && !error ? <Spinner/> : result?.reminders.filter(reminder => showClosed || reminder.status === "active").map(reminder => <article className="scheduled-reminder" key={reminder.id}>
      <div className="scheduled-reminder-heading"><div><h3>{reminder.title}</h3><span>{reminderCondition(reminder)} · {reminder.status === "active" ? t("Активне") : reminder.status === "completed" ? t("Виконано") : t("Скасовано")}</span>{reminder.maintenanceRuleId&&<small>{t("За регламентом ТО")}</small>}</div>
        {reminder.status === "active" && <div className="reminder-tools">
          {reminder.maintenanceRuleId ? <button className="ghost-btn" onClick={onService}>{t("Записати обслуговування")}</button> : <>
          <button className="ghost-btn icon-btn" disabled={busy} title={t("Змінити нагадування")} aria-label={t("Змінити нагадування")} onClick={() => { setEditing({ id: reminder.id, revision: reminder.revision }); setForm({ title: reminder.title, dueDate: reminder.dueDate, remindAt: reminder.remindAt, timeZone: reminder.timeZone, offsets: reminder.offsets.map(offset => ({ ...offset })) }); setPreview(null); document.querySelector('.reminder-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}><Pencil size={16}/></button>
          <button className="ghost-btn icon-btn" disabled={busy} title={t("Позначити виконаним")} aria-label={t("Позначити виконаним")} onClick={() => void close(reminder, "completed")}><Check size={16}/></button>
          </>}
          <button className="ghost-btn icon-btn" disabled={busy} title={t("Скасувати нагадування")} aria-label={t("Скасувати нагадування")} onClick={() => void close(reminder, "cancelled")}><X size={16}/></button>
        </div>}
      </div>
      <ul className="reminder-deliveries">{reminder.deliveries.map(delivery => <li key={delivery.id}><span>{dateTime(delivery.scheduledAt, reminder.timeZone)} · {reminder.timeZone}</span><b>{reminderDeliveryStatus(delivery.status)}</b>{delivery.lastError === "bot_blocked" && <span className="auth-error">{t("Бот заблокований у Telegram.")}</span>}</li>)}</ul>
      {reminder.deliveries.some(delivery=>delivery.status==='uncertain')&&<p className="auth-error">{t("Доставку не підтверджено. Перевірте Telegram перед повторним надсиланням.")}</p>}
    </article>)}
    {result && !result.reminders.some(reminder => showClosed || reminder.status === "active") && <p className="state-note">{t("Активних нагадувань немає.")}</p>}
  </section>;
}
