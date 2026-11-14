import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Headset, Plus, RefreshCw, Search, Send, ShieldCheck, X } from "lucide-react";
import { supportApi, type SupportCategory, type SupportDetail, type SupportList, type SupportStatus, type Vehicle } from "../api";
import { Field, Spinner } from "../components/CommonComponents";
import { getUiLocale, t } from "../i18n";
import { errText, vehicleTitle } from "../utils/formatters";

const statuses: Record<SupportStatus, string> = { open: "Нове", in_progress: "У роботі", resolved: "Вирішено" };
const categories: Record<SupportCategory, string> = { technical: "Технічна проблема", report: "Помилка у звіті", account: "Обліковий запис", other: "Інше" };
const notificationLabels = { pending: "Сповіщення в Telegram очікує відправлення", sending: "Сповіщення в Telegram надсилається", sent: "Сповіщення в Telegram надіслано", failed: "Не вдалося надіслати сповіщення в Telegram" };
function date(value: string) { return new Date(value).toLocaleString(getUiLocale(), { dateStyle: "medium", timeStyle: "short" }); }
export function supportTicketFromUrl(): string | null {
  const value = new URLSearchParams(window.location.search).get("supportTicket");
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

export function SupportPage({ admin = false, vehicles, vehicleId, notificationsConfigured }: {
  admin?: boolean; vehicles: Vehicle[]; vehicleId: string | null; notificationsConfigured: boolean;
}) {
  const [list, setList] = useState<SupportList | null>(null);
  const [status, setStatus] = useState<SupportStatus | "">("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(supportTicketFromUrl);
  const [detail, setDetail] = useState<SupportDetail | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<SupportCategory>("technical");
  const [message, setMessage] = useState("");
  const [ticketVehicle, setTicketVehicle] = useState(vehicleId ?? "");
  const listVersion = useRef(0);
  const detailVersion = useRef(0);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  useEffect(() => {
    const url = new URL(window.location.href);
    if (selected) url.searchParams.set("supportTicket", selected);
    else url.searchParams.delete("supportTicket");
    window.history.replaceState(null, "", url);
  }, [selected]);

  useEffect(() => { const timer = setTimeout(() => { setSearch(query.trim()); setPage(1); }, 300); return () => clearTimeout(timer); }, [query]);
  const loadList = useCallback(async (quiet = false) => {
    const version = ++listVersion.current;
    if (!quiet) setLoading(true);
    try {
      const result = await supportApi.list(admin, { status: status || undefined, q: search || undefined, page });
      if (version === listVersion.current) {
        setList(result);
        const lastPage = Math.max(1, Math.ceil(result.total / result.pageSize));
        if (page > lastPage) setPage(lastPage);
      }
    } catch (err) { if (version === listVersion.current) setError(errText(err)); }
    finally { if (version === listVersion.current) setLoading(false); }
  }, [admin, status, search, page]);
  const loadDetail = useCallback(async (id: string, quiet = false) => {
    const version = ++detailVersion.current;
    if (!quiet) setDetailLoading(true);
    try {
      const result = await supportApi.detail(admin, id);
      if (version === detailVersion.current && selectedRef.current === id) setDetail(result);
    } catch (err) { if (version === detailVersion.current) setError(errText(err)); }
    finally { if (version === detailVersion.current) setDetailLoading(false); }
  }, [admin]);
  useEffect(() => { void loadList(); return () => { listVersion.current++; }; }, [loadList]);
  useEffect(() => {
    setReply(""); setDetail(null); setError(null);
    if (selected) void loadDetail(selected);
    return () => { detailVersion.current++; };
  }, [selected, loadDetail]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible" || busy) return;
      void loadList(true);
      if (selected) void loadDetail(selected, true);
    }, 30000);
    return () => clearInterval(timer);
  }, [loadList, loadDetail, selected, busy]);

  const refresh = () => { setError(null); void loadList(); if (selected) void loadDetail(selected); };
  const choose = (id: string) => { setCreating(false); setSelected(id); };
  const create = async (event: FormEvent) => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(null);
    try {
      const result = await supportApi.create({ subject: subject.trim(), category, message: message.trim(), ...(ticketVehicle ? { vehicleId: ticketVehicle } : {}) });
      setSubject(""); setMessage(""); setCreating(false); setSelected(result.ticket.id); setPage(1);
      await loadList();
    } catch (err) { setError(errText(err)); }
    finally { setBusy(false); }
  };
  const send = async (event: FormEvent) => {
    event.preventDefault(); if (!selected || !reply.trim() || busy) return;
    const id = selected; setBusy(true); setError(null);
    try {
      const result = await supportApi.reply(admin, id, reply.trim());
      if (selectedRef.current === id) { detailVersion.current++; setDetail(result); setReply(""); }
      await loadList(true);
    } catch (err) { setError(errText(err)); }
    finally { setBusy(false); }
  };
  const changeStatus = async (value: SupportStatus) => {
    if (!selected || busy) return;
    const id = selected; setBusy(true); setError(null);
    try {
      const result = await supportApi.status(id, value);
      if (selectedRef.current === id) { detailVersion.current++; setDetail(result); }
      await loadList(true);
    } catch (err) { setError(errText(err)); }
    finally { setBusy(false); }
  };

  return <section className="inner-page support-page">
    <span className="eyebrow">CARA / {t(admin ? "Адмін-панель" : "Підтримка")}</span>
    <div className="page-title-row"><h1>{admin ? <ShieldCheck size={24} /> : <Headset size={24} />}{t(admin ? "Адмін-панель" : "Підтримка")}</h1>
      <div className="support-actions"><button className="ghost-btn support-icon" title={t("Оновити")} aria-label={t("Оновити")} onClick={refresh} disabled={loading || busy}><RefreshCw size={18} className={loading ? "spin" : ""} /></button>
        {!admin && <button className="primary" onClick={() => { setCreating(true); setSelected(null); setError(null); }} disabled={busy}><Plus size={16} />{t("Нове звернення")}</button>}</div>
    </div>
    {admin && !notificationsConfigured && <p className="support-notice" role="status">{t("Telegram-сповіщення підтримки ще не налаштовано. Заявки зберігаються тут.")}</p>}
    {error && <div className="auth-error" role="alert">{error}</div>}
    <div className={`support-workspace ${selected || creating ? "has-detail" : ""}`}>
      <aside className="support-inbox" aria-label={t(admin ? "Черга звернень" : "Мої звернення")}>
        <h2>{t(admin ? "Черга звернень" : "Мої звернення")}{list && <span>{list.total}</span>}</h2>
        <label className="support-search"><Search size={16} /><input aria-label={t("Пошук звернень")} placeholder={t("Пошук звернень")} maxLength={100} value={query} onChange={e => setQuery(e.target.value)} /></label>
        <label className="field support-filter"><span>{t("Статус")}</span><select value={status} onChange={e => { setStatus(e.target.value as SupportStatus | ""); setPage(1); }}><option value="">{t("Усі статуси")}</option>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label>
        <div className="support-ticket-list" aria-busy={loading}>
          {loading && !list ? <Spinner /> : list?.tickets.length ? list.tickets.map(ticket => <button key={ticket.id} className={`support-ticket ${selected === ticket.id ? "selected" : ""}`} onClick={() => choose(ticket.id)} disabled={busy}>
            <span className="support-ticket-meta"><span className={`support-status ${ticket.status}`}>{t(statuses[ticket.status])}</span><small>#{ticket.id.slice(0, 8)}</small></span>
            <strong>{ticket.subject}</strong><small>{t(categories[ticket.category])}</small>{admin && ticket.owner && <small>{ticket.owner.displayName || ticket.owner.email}</small>}<time dateTime={ticket.updatedAt}>{date(ticket.updatedAt)}</time>
          </button>) : <p className="support-empty">{t(search || status ? "Звернень за цим запитом немає" : "Звернень поки немає")}</p>}
        </div>
        {list && list.total > list.pageSize && <div className="support-pagination"><button className="ghost-btn support-icon" aria-label={t("Попередня сторінка")} title={t("Попередня сторінка")} disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}><ChevronLeft size={18} /></button><span>{page} / {Math.ceil(list.total / list.pageSize)}</span><button className="ghost-btn support-icon" aria-label={t("Наступна сторінка")} title={t("Наступна сторінка")} disabled={page * list.pageSize >= list.total || loading} onClick={() => setPage(page + 1)}><ChevronRight size={18} /></button></div>}
      </aside>
      <div className="support-conversation">
        {(selected || creating) && <button className="ghost-btn support-back" onClick={() => { setSelected(null); setCreating(false); }} disabled={busy}><ArrowLeft size={16} />{t("До звернень")}</button>}
        {creating ? <form className="support-create" onSubmit={create}>
          <div className="support-compose-heading"><h2>{t("Нове звернення")}</h2><button type="button" className="ghost-btn support-icon" aria-label={t("Закрити")} title={t("Закрити")} disabled={busy} onClick={() => setCreating(false)}><X size={18} /></button></div>
          <Field label={t("Тема звернення")}><input required minLength={3} maxLength={160} value={subject} onChange={e => setSubject(e.target.value)} /></Field>
          <div className="support-form-row"><Field label={t("Категорія")}><select value={category} onChange={e => setCategory(e.target.value as SupportCategory)}>{Object.entries(categories).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></Field>
            <Field label={t("Автомобіль")}><select value={ticketVehicle} onChange={e => setTicketVehicle(e.target.value)}><option value="">{t("Без прив’язки до авто")}</option>{vehicles.map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicleTitle(vehicle)}</option>)}</select></Field></div>
          <Field label={t("Повідомлення")}><textarea required minLength={5} maxLength={5000} rows={7} value={message} onChange={e => setMessage(e.target.value)} /></Field>
          <div className="support-actions"><button className="primary" disabled={busy || subject.trim().length < 3 || message.trim().length < 5}><Send size={16} />{t(busy ? "Надсилаємо..." : "Надіслати звернення")}</button></div>
        </form> : selected ? !detail && (detailLoading || !error) ? <Spinner /> : detail ? <>
          <div className="support-thread-heading"><div><small>#{detail.ticket.id.slice(0, 8)} / {t(categories[detail.ticket.category])}</small><h2>{detail.ticket.subject}</h2>{admin && detail.ticket.owner && <p>{detail.ticket.owner.displayName} {detail.ticket.owner.email}</p>}
            <span className={`support-status ${detail.ticket.status}`}>{t(statuses[detail.ticket.status])}</span></div>
            {admin && <Field label={t("Статус звернення")}><select aria-label={t("Статус звернення")} value={detail.ticket.status} disabled={busy} onChange={e => void changeStatus(e.target.value as SupportStatus)}>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></Field>}
          </div>
          {admin && detail.ticket.notification && <p className="support-notice" role="status">{t(notificationLabels[detail.ticket.notification.status])}</p>}
          <div className="support-messages" role="log" aria-label={t("Переписка зі службою підтримки")} aria-live="polite">{detail.messages.map(item => <article key={item.id} className={`support-message ${item.authorRole}`}><div><strong>{t(item.authorRole === "admin" ? "Служба підтримки" : admin ? "Користувач" : "Ви")}</strong><time dateTime={item.createdAt}>{date(item.createdAt)}</time></div><p>{item.body}</p></article>)}</div>
          <form className="support-reply" onSubmit={send}><Field label={t(admin ? "Відповідь користувачу" : "Ваше повідомлення")}><textarea required maxLength={5000} rows={3} value={reply} onChange={e => setReply(e.target.value)} /></Field><div className="support-actions"><button className="primary" disabled={busy || !reply.trim()}><Send size={16} />{t(busy ? "Надсилаємо..." : "Надіслати")}</button></div></form>
        </> : <p className="support-empty">{t("Не вдалося завантажити звернення")}</p> : <div className="support-unselected"><Headset size={32} /><h2>{t(admin ? "Черга звернень" : "Служба підтримки")}</h2><p>{t("Оберіть звернення")}</p></div>}
      </div>
    </div>
  </section>;
}
