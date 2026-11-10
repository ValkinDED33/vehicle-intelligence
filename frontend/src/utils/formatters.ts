import { t } from "./../i18n";
import {
  FileText,
  Fuel,
  Gauge,
  History,
  ShieldCheck,
  Wallet,
  Wrench,
} from "lucide-react";
import {
  ApiError,
  fmtDate,
  fmtNumber,
  type MaintenanceStatus,
  type MileageReading,
  type Vehicle,
  type VehicleProfile,
  type VinDecode,
} from "../api";
import { EVENT_META } from "../constants/dashboard";

export function eventIcon(type: string) {
  if (type.startsWith("external.")) {
    return type.includes("stolen") ? ShieldCheck : FileText;
  }
  if (type.includes("mileage")) return Gauge;
  if (type.includes("expense")) return Wallet;
  if (type.includes("energy")) return Fuel;
  if (type.includes("service")) return Wrench;
  return History;
}

export function humanizeType(type: string) {
  return t(EVENT_META[type]?.title ?? type);
}

export function vehicleTitle(v: Vehicle): string {
  if (v.make?.trim().toUpperCase() === "SKODA SITIGO" && v.model?.trim().toLowerCase() === "citigo") return "Škoda Citigo";
  const parts = [v.make, v.model].filter(Boolean);
  if (parts.length) return parts.join(" ");
  if (v.nickname) return v.nickname;
  return v.vin ? `VIN ${v.vin}` : t("Автомобіль без назви");
}

export function vehicleLine(v: Vehicle, latest: MileageReading | null): string {
  const bits = [v.modelYear, v.licensePlate].filter(Boolean) as string[];
  if (latest) bits.push(t("{0} км", { 0: fmtNumber(latest.odometerKm) }));
  return bits.length ? bits.join(" · ") : t("Дані не заповнені");
}

export function resolvedVehicleTitle(
  v: Vehicle,
  vinDecode: VinDecode | null,
): string {
  if(v.make&&v.model)return vehicleTitle(v);
  const matches=vinDecode?.vin&&vinDecode.vin.toUpperCase()===v.vin?.toUpperCase();
  const decodedParts = matches?[v.make||vinDecode?.make,v.model||vinDecode?.model].filter(Boolean):[];
  if (decodedParts.length) return decodedParts.join(" ");
  return vehicleTitle(v);
}

export function resolvedVehicleLine(
  v: Vehicle,
  latest: MileageReading | null,
  vinDecode: VinDecode | null,
  profile: VehicleProfile | null,
): string {
  const matches=vinDecode?.vin&&vinDecode.vin.toUpperCase()===v.vin?.toUpperCase();
  const year = v.modelYear || (matches&&vinDecode?.modelYear?String(vinDecode.modelYear):null);
  const trimOrPlate = profile?.trimLevel ?? v.licensePlate;
  const bits = [year, trimOrPlate].filter(Boolean) as string[];
  if (latest) bits.push(t("{0} км", { 0: fmtNumber(latest.odometerKm) }));
  return bits.length ? bits.join(" · ") : t("Дані не заповнені");
}

export function errText(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return t("Невідома помилка");
}

export function urgencyScore(urgency: MaintenanceStatus["urgency"]): number {
  if (urgency === "stop") return 20;
  if (urgency === "check_soon") return 50;
  if (urgency === "attention") return 75;
  return 100;
}

export function reminderDetail(s: MaintenanceStatus): string {
  const parts: string[] = [];
  if (s.kmRemaining !== null) {
    parts.push(
      s.kmRemaining <= 0
        ? t("прострочено на {0} км", { 0: fmtNumber(Math.abs(s.kmRemaining)) })
        : t("через {0} км", { 0: fmtNumber(s.kmRemaining) }),
    );
  }
  if (s.daysRemaining !== null) {
    parts.push(
      s.daysRemaining <= 0
        ? t("прострочено на {0} дн.", { 0: Math.abs(s.daysRemaining) })
        : t("через {0} дн.", { 0: s.daysRemaining }),
    );
  }
  return parts.join(" · ") || t("Строк не визначено");
}

export function intervalLines(s: MaintenanceStatus): string[] {
  const lines: string[] = [];
  if (s.rule.intervalKm) lines.push(t("{0} км", { 0: fmtNumber(s.rule.intervalKm) }));
  if (s.rule.intervalMonths) lines.push(t("{0} міс.", { 0: s.rule.intervalMonths }));
  if (s.rule.intervalEngineHours) lines.push(t("{0} мотогод", { 0: s.rule.intervalEngineHours }));
  return lines.length ? lines : [t("Регламент не задано")];
}
