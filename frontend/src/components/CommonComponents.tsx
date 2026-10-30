import { t, getUiLocale } from "../i18n";
import type { ReactNode } from "react";
import {
  ArrowRight,
  CarFront,
  CircleHelp,
  Loader2,
  RefreshCw,
  Wrench,
} from "lucide-react";
import { fmtDate, type HistoryEvent, type Vehicle } from "../api";
import { EVENT_META, MODULE_LABELS } from "../constants/dashboard";
import { eventIcon, humanizeType, vehicleTitle } from "../utils/formatters";

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="state-note">
      <Loader2 size={16} className="spin" />
      {label ?? t("Завантажуємо дані...")}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: typeof CircleHelp;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-card">
      <Icon size={32} />
      <h2>{title}</h2>
      <p>{text}</p>
      {action}
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function PageHeader({
  page,
  vehicle,
  onRefresh,
  refreshing,
}: {
  page: string;
  vehicle: Vehicle | null;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <>
      <span className="eyebrow">CARA / {t(page)}</span>
      <div className="page-title-row">
        <h1>{t(page)}</h1>
        <button
          className="refresh-btn"
          onClick={onRefresh}
          disabled={refreshing}
          aria-label={t("Оновити")}
        >
          {refreshing ? (
            <Loader2 size={16} className="spin" />
          ) : (
            <RefreshCw size={16} />
          )}{" "} {t("Оновити")} </button>
      </div>
      <p>
        {vehicle
          ? `${vehicleTitle(vehicle)}${vehicle.modelYear ? ` · ${vehicle.modelYear}` : ""}${vehicle.vin ? ` · VIN ${vehicle.vin}` : ""}`
          : t("Автомобіль не вибрано")}
      </p>
    </>
  );
}

export function NoVehicle({ onGoGarage }: { onGoGarage: () => void }) {
  return (
    <EmptyState
      icon={CarFront}
      title={t("Спочатку додайте автомобіль")}
      text={t("Усі розділи працюють навколо конкретного автомобіля. Додайте його в гараж, і дані підтягнуться.")}
      action={
        <button className="primary" onClick={onGoGarage}> {t("ПЕРЕЙТИ В ГАРАЖ")} <ArrowRight size={16} />
        </button>
      }
    />
  );
}

export function NoVehiclePanel({ onGoGarage }: { onGoGarage: () => void }) {
  return (
    <div className="panel empty-garage">
      <h2>{t("ГАРАЖ ПОРОЖНІЙ")}</h2>
      <p> {t("Додайте перший автомобіль, щоб CARA могла розраховувати регламенти ТО, вести облік пробігу, заправок і витрат.")} </p>
      <button className="primary" onClick={onGoGarage}> {t("ПЕРЕЙТИ В ГАРАЖ")} <ArrowRight size={16} />
      </button>
    </div>
  );
}

export function Reminder({
  icon: Icon,
  title,
  detail,
  tag,
  color,
}: {
  icon: typeof Wrench;
  title: string;
  detail: string;
  tag: string;
  color: string;
}) {
  return (
    <div className="reminder">
      <span className={"icon-disc " + color}>
        <Icon size={16} />
      </span>
      <div className="reminder-copy">
        <b>{title}</b>
        <small>{detail}</small>
      </div>
      <span className={"tag " + color}>{t(tag)}</span>
    </div>
  );
}

export function EventCard({ event }: { event: HistoryEvent }) {
  const Icon = eventIcon(event.type);
  const meta = EVENT_META[event.type];
  const color = meta?.color ?? "blue";
  const detail =
    event.mileageKm !== null
      ? t("{0} км · {1}", { 0: event.mileageKm.toLocaleString(getUiLocale()), 1: t(MODULE_LABELS[event.sourceModule] ?? event.sourceModule) })
      : t(MODULE_LABELS[event.sourceModule] ?? event.sourceModule);

  return (
    <div className="event">
      <span className={"icon-disc " + color}>
        <Icon size={16} />
      </span>
      <div className="event-copy">
        <b>{humanizeType(event.type)}</b>
        <small>{detail}</small>
        <small className="dim">{fmtDate(event.occurredAt)}</small>
      </div>
    </div>
  );
}
