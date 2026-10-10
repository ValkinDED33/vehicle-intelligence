import { Injectable } from "@nestjs/common";

import { GarageService } from "../../garage/services/garage.service";
import { type MileageReading } from "../schemas/mileage-reading.schema";
import { MileageDbService } from "../mileage.db.service";

export type MileageAnomalyType = "rollback" | "implausible_jump";

export interface MileageAnomaly {
  type: MileageAnomalyType;
  severity: "warning" | "critical";
  /** Moment of the offending (later) reading. */
  occurredAt: Date;
  fromReadingId: string;
  toReadingId: string;
  fromRecordedAt: Date;
  toRecordedAt: Date;
  fromOdometerKm: number;
  toOdometerKm: number;
  /** to − from; negative for a rollback. */
  deltaKm: number;
  daysBetween: number;
  avgKmPerDay: number | null;
  fromSource: string;
  toSource: string;
  message: string;
}

export interface MileageAnomalyReport {
  vehicleId: string;
  readingsAnalyzed: number;
  anomalies: MileageAnomaly[];
}

/** Any odometer decrease over time is treated as a rollback. */
const ROLLBACK_TOLERANCE_KM = 0;
/** A drop of at least this many km is escalated to "critical". */
const CRITICAL_ROLLBACK_KM = 100;
/** Sustained average above this is physically implausible for a car. */
const IMPLAUSIBLE_KM_PER_DAY = 2000;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Pure analysis: given readings in chronological order, find rollbacks
 * (odometer decreases over time — evidence of tampering) and implausible
 * jumps (distance too large for the elapsed time — likely a data error).
 */
export function detectMileageAnomalies(
  readings: Pick<
    MileageReading,
    "id" | "odometerKm" | "recordedAt" | "source"
  >[],
): MileageAnomaly[] {
  const ordered = [...readings].sort(
    (a, b) => a.recordedAt.getTime() - b.recordedAt.getTime(),
  );

  const anomalies: MileageAnomaly[] = [];

  for (let i = 1; i < ordered.length; i += 1) {
    const prev = ordered[i - 1];
    const cur = ordered[i];

    const deltaKm = cur.odometerKm - prev.odometerKm;
    const daysBetween =
      (cur.recordedAt.getTime() - prev.recordedAt.getTime()) / MS_PER_DAY;

    if (deltaKm < -ROLLBACK_TOLERANCE_KM) {
      const dropKm = Math.abs(deltaKm);

      anomalies.push({
        type: "rollback",
        severity: dropKm >= CRITICAL_ROLLBACK_KM ? "critical" : "warning",
        occurredAt: cur.recordedAt,
        fromReadingId: prev.id,
        toReadingId: cur.id,
        fromRecordedAt: prev.recordedAt,
        toRecordedAt: cur.recordedAt,
        fromOdometerKm: prev.odometerKm,
        toOdometerKm: cur.odometerKm,
        deltaKm,
        daysBetween: round(daysBetween, 3),
        avgKmPerDay: null,
        fromSource: prev.source,
        toSource: cur.source,
        message: `Відкат одометра: пробіг зменшився з ${prev.odometerKm} км до ${cur.odometerKm} км (−${dropKm} км)`,
      });

      continue;
    }

    // Sub-day gaps are treated as a full day so normal driving isn't flagged.
    const effectiveDays = Math.max(daysBetween, 1);
    const avgKmPerDay = deltaKm / effectiveDays;

    if (deltaKm > 0 && avgKmPerDay > IMPLAUSIBLE_KM_PER_DAY) {
      anomalies.push({
        type: "implausible_jump",
        severity: "warning",
        occurredAt: cur.recordedAt,
        fromReadingId: prev.id,
        toReadingId: cur.id,
        fromRecordedAt: prev.recordedAt,
        toRecordedAt: cur.recordedAt,
        fromOdometerKm: prev.odometerKm,
        toOdometerKm: cur.odometerKm,
        deltaKm,
        daysBetween: round(daysBetween, 3),
        avgKmPerDay: Math.round(avgKmPerDay),
        fromSource: prev.source,
        toSource: cur.source,
        message: `Підозрілий стрибок пробігу: +${deltaKm} км за ${round(daysBetween, 1)} дн. (~${Math.round(avgKmPerDay)} км/добу)`,
      });
    }
  }

  return anomalies;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

@Injectable()
export class MileageAnomalyService {
  constructor(
    private readonly garageService: GarageService,
    private readonly mileageDbService: MileageDbService,
  ) {}

  async analyze(
    ownerId: string,
    vehicleId: string,
  ): Promise<MileageAnomalyReport> {
    await this.garageService.getVehicle(ownerId, vehicleId);

    const readings = await this.mileageDbService.listChronological(vehicleId);

    return {
      vehicleId,
      readingsAnalyzed: readings.length,
      anomalies: detectMileageAnomalies(readings),
    };
  }
}
