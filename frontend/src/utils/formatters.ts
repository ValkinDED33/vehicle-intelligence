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
  return EVENT_META[type]?.title ?? type;
}

export function vehicleTitle(v: Vehicle): string {
  const parts = [v.make, v.model].filter(Boolean);
  if (parts.length) return parts.join(" ");
  if (v.nickname) return v.nickname;
  return v.vin ? `VIN ${v.vin}` : "Автомобиль без названия";
}

export function vehicleLine(v: Vehicle, latest: MileageReading | null): string {
  const bits = [v.modelYear, v.licensePlate].filter(Boolean) as string[];
  if (latest) bits.push(`${fmtNumber(latest.odometerKm)} км`);
  return bits.length ? bits.join(" · ") : "Данные не заполнены";
}

export function resolvedVehicleTitle(
  v: Vehicle,
  vinDecode: VinDecode | null,
): string {
  const decodedParts = [vinDecode?.make, vinDecode?.model].filter(Boolean);
  if (decodedParts.length) return decodedParts.join(" ");
  return vehicleTitle(v);
}

export function resolvedVehicleLine(
  v: Vehicle,
  latest: MileageReading | null,
  vinDecode: VinDecode | null,
  profile: VehicleProfile | null,
): string {
  const year = vinDecode?.modelYear ? String(vinDecode.modelYear) : v.modelYear;
  const trimOrPlate = profile?.trimLevel ?? v.licensePlate;
  const bits = [year, trimOrPlate].filter(Boolean) as string[];
  if (latest) bits.push(`${fmtNumber(latest.odometerKm)} км`);
  return bits.length ? bits.join(" · ") : "Данные не заполнены";
}

export function errText(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Неизвестная ошибка";
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
        ? `просрочено на ${fmtNumber(Math.abs(s.kmRemaining))} км`
        : `через ${fmtNumber(s.kmRemaining)} км`,
    );
  }
  if (s.daysRemaining !== null) {
    parts.push(
      s.daysRemaining <= 0
        ? `просрочено на ${Math.abs(s.daysRemaining)} дн.`
        : `через ${s.daysRemaining} дн.`,
    );
  }
  return parts.join(" · ") || "Срок не определён";
}

export function intervalLines(s: MaintenanceStatus): string[] {
  const lines: string[] = [];
  if (s.rule.intervalKm) lines.push(`${fmtNumber(s.rule.intervalKm)} км`);
  if (s.rule.intervalMonths) lines.push(`${s.rule.intervalMonths} мес.`);
  if (s.rule.intervalEngineHours) lines.push(`${s.rule.intervalEngineHours} м/ч`);
  return lines.length ? lines : ["Регламент не задан"];
}
