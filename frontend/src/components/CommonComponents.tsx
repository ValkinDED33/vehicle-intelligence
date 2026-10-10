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
      {label ?? "Завантажуємо дані..."}
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
      <span className="eyebrow">CARA / {page}</span>
      <div className="page-title-row">
        <h1>{page}</h1>
        <button
          className="refresh-btn"
          onClick={onRefresh}
          disabled={refreshing}
          aria-label="Оновити"
        >
          {refreshing ? (
            <Loader2 size={16} className="spin" />
          ) : (
            <RefreshCw size={16} />
          )}{" "}
          Оновити
        </button>
      </div>
      <p>
        {vehicle
          ? `${vehicleTitle(vehicle)}${vehicle.modelYear ? ` · ${vehicle.modelYear}` : ""}${vehicle.vin ? ` · VIN ${vehicle.vin}` : ""}`
          : "Автомобіль не вибрано"}
      </p>
    </>
  );
}

export function NoVehicle({ onGoGarage }: { onGoGarage: () => void }) {
  return (
    <EmptyState
      icon={CarFront}
      title="Спочатку додайте автомобіль"
      text="Усі розділи працюють навколо конкретного автомобіля. Додайте його в гараж, і дані підтягнуться."
      action={
        <button className="primary" onClick={onGoGarage}>
          ПЕРЕЙТИ В ГАРАЖ <ArrowRight size={16} />
        </button>
      }
    />
  );
}

export function NoVehiclePanel({ onGoGarage }: { onGoGarage: () => void }) {
  return (
    <div className="panel empty-garage">
      <h2>ГАРАЖ ПОРОЖНІЙ</h2>
      <p>
        Додайте перший автомобіль, щоб CARA могла розраховувати регламенти ТО,
        вести облік пробігу, заправок і витрат.
      </p>
      <button className="primary" onClick={onGoGarage}>
        ПЕРЕЙТИ В ГАРАЖ <ArrowRight size={16} />
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
    <div className="reminder-item">
      <span className={"icon-disc " + color}>
        <Icon size={16} />
      </span>
      <div className="reminder-copy">
        <b>{title}</b>
        <small>{detail}</small>
      </div>
      <span className={"tag " + color}>{tag}</span>
    </div>
  );
}

export function EventCard({ event }: { event: HistoryEvent }) {
  const Icon = eventIcon(event.type);
  const meta = EVENT_META[event.type];
  const color = meta?.color ?? "blue";
  const detail =
    event.mileageKm !== null
      ? `${event.mileageKm.toLocaleString("uk-UA")} км · ${MODULE_LABELS[event.sourceModule] ?? event.sourceModule}`
      : (MODULE_LABELS[event.sourceModule] ?? event.sourceModule);

  return (
    <div className="event-item">
      <span className={"icon-disc " + color}>
        <Icon size={16} />
      </span>
      <div className="event-copy">
        <b>{humanizeType(event.type)}</b>
        <small>{detail}</small>
      </div>
      <span className="event-time">{fmtDate(event.occurredAt)}</span>
    </div>
  );
}
