import {
  fmtShortDate,
  num,
  type EnergyEntry,
  type ExpenseMonthlySummary,
  type MaintenanceStatus,
  type MileageReading,
} from "../api";
import { CATEGORY_LABELS, donutColors } from "../constants/dashboard";
import type { Sparkline } from "../types/dashboard";
import { urgencyScore } from "./formatters";

export function pickMainCurrency(summary: ExpenseMonthlySummary | null) {
  if (!summary || !summary.currencies.length) return null;
  return [...summary.currencies].sort((a, b) => b.totalCost - a.totalCost)[0];
}

export function pickNextService(
  statuses: MaintenanceStatus[],
): MaintenanceStatus | null {
  if (!statuses.length) return null;
  const rank = { stop: 0, check_soon: 1, attention: 2, normal: 3 };
  return [...statuses].sort((a, b) => {
    const d = rank[a.urgency] - rank[b.urgency];
    if (d !== 0) return d;
    return (a.kmRemaining ?? Infinity) - (b.kmRemaining ?? Infinity);
  })[0];
}

export function computeHealthScore(
  statuses: MaintenanceStatus[],
): number | null {
  if (!statuses.length) return null;
  const weights = statuses.map((s) => urgencyScore(s.urgency));
  const avg = weights.reduce((acc, v) => acc + v, 0) / weights.length;
  return Math.max(10, Math.min(100, Math.round(avg)));
}

export function computeDelta30(history: MileageReading[]): number | null {
  if (history.length < 2) return null;
  const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
  const recent = history.filter((r) => new Date(r.recordedAt).getTime() >= cutoff);
  if (recent.length < 2) return null;
  const delta = recent[recent.length - 1].odometerKm - recent[0].odometerKm;
  return delta > 0 ? delta : null;
}

export function buildSparkline(history: MileageReading[]): Sparkline | null {
  const points = history.slice(-24);
  if (points.length < 2) return null;
  const values = points.map((p) => p.odometerKm);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const coords = points.map((p, i) => ({
    x: (i / (points.length - 1)) * 260,
    y: 104 - ((p.odometerKm - min) / span) * 88,
  }));
  const line = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const last = coords[coords.length - 1];
  const area = `M${coords.map((c) => `${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" L")} L260 110 L0 110Z`;
  return {
    line,
    area,
    lastX: last.x,
    lastY: last.y,
    minLabel: `${Math.round(min / 1000)}K`,
    maxLabel: `${Math.round(max / 1000)}K`,
    firstLabel: fmtShortDate(points[0].recordedAt),
    lastLabel: fmtShortDate(points[points.length - 1].recordedAt),
  };
}

export function buildEnergyBars(entries: EnergyEntry[]): number[] {
  const volumes = entries
    .slice(-16)
    .map((e) => num(e.volumeLiters) ?? num(e.energyKwh) ?? 0)
    .filter((v) => v > 0);
  if (!volumes.length) return [];
  const max = Math.max(...volumes, 1);
  return volumes.map((v) => Math.round((v / max) * 100));
}

export function buildDonut(summary: {
  categories: { category: string; totalCost: number }[];
  totalCost: number;
} | null) {
  if (!summary || !summary.categories.length) return null;
  const total = summary.totalCost;
  if (total <= 0) return null;
  let cursor = 0;
  const segments: string[] = [];
  const items = summary.categories.map((c, i) => {
    const pct = (c.totalCost / total) * 100;
    const from = cursor;
    const to = cursor + pct;
    cursor = to;
    const color = donutColors[i % donutColors.length];
    segments.push(`${color} ${from.toFixed(1)}% ${to.toFixed(1)}%`);
    return {
      name: CATEGORY_LABELS[c.category] ?? c.category,
      total: c.totalCost,
      percent: Math.round(pct),
    };
  });
  return { gradient: `conic-gradient(${segments.join(", ")})`, items };
}

export function serviceProgress(s: MaintenanceStatus): number {
  if (s.urgency === "stop") return 100;
  if (s.urgency === "check_soon") return 90;
  if (s.urgency === "attention") return 75;
  if (s.kmRemaining !== null && s.rule.intervalKm) {
    const done = s.rule.intervalKm - s.kmRemaining;
    return Math.max(10, Math.min(100, Math.round((done / s.rule.intervalKm) * 100)));
  }
  return 30;
}

export function pickReminders(
  statuses: MaintenanceStatus[],
): MaintenanceStatus[] {
  const active = statuses.filter((s) => s.urgency !== "normal");
  return (active.length ? active : statuses).slice(0, 3);
}

export function pickRemindersAll(
  statuses: MaintenanceStatus[],
): MaintenanceStatus[] {
  const rank = { stop: 0, check_soon: 1, attention: 2, normal: 3 };
  return [...statuses].sort((a, b) => rank[a.urgency] - rank[b.urgency]);
}
