import { BadRequestException, Inject, Injectable, Logger } from "@nestjs/common";

import { GarageService } from "../../garage/services/garage.service";
import { MileageService } from "../../mileage/services/mileage.service";
import { VehicleHistoryService } from "../../vehicle-history/services/vehicle-history.service";
import { VehicleProfileService } from "../../vehicle-profile/services/vehicle-profile.service";
import { type VehicleExternalReport } from "../schemas/vehicle-external-report.schema";
import { deterministicUuid } from "./deterministic-uuid";
import {
  type NormalizedSourceFacts,
  type SourceNormalizer,
} from "./types";

export const SOURCE_NORMALIZERS = Symbol("SOURCE_NORMALIZERS");

export interface NormalizationOutcome {
  normalized: boolean;
  reason?: string;
  identityUpdated?: boolean;
  profileUpdated?: boolean;
  eventsRecorded?: number;
  mileagesRecorded?: number;
  mileagesSkipped?: number;
}

const EXTERNAL_MILEAGE_CONFIDENCE_CAP = 0.8;

@Injectable()
export class SourceNormalizationService {
  private readonly logger = new Logger(SourceNormalizationService.name);
  private readonly normalizers: Map<string, SourceNormalizer>;

  constructor(
    private readonly garageService: GarageService,
    private readonly vehicleProfileService: VehicleProfileService,
    private readonly vehicleHistoryService: VehicleHistoryService,
    private readonly mileageService: MileageService,

    @Inject(SOURCE_NORMALIZERS)
    normalizers: SourceNormalizer[],
  ) {
    this.normalizers = new Map(
      normalizers.map((normalizer) => [normalizer.sourceKey, normalizer]),
    );
  }

  async applyToReport(
    ownerId: string,
    vehicleId: string,
    report: VehicleExternalReport,
  ): Promise<NormalizationOutcome> {
    if (report.status !== "success") {
      return { normalized: false, reason: `report status: ${report.status}` };
    }

    const normalizer = this.normalizers.get(report.reportType);

    if (!normalizer) {
      return { normalized: false, reason: "no normalizer for source" };
    }

    let facts: NormalizedSourceFacts;

    try {
      facts = normalizer.normalize(report.rawPayload, report.vin ?? "");
    } catch (error) {
      this.logger.warn(
        `Normalization failed for ${report.reportType}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return { normalized: false, reason: "normalizer error" };
    }

    const outcome: NormalizationOutcome = {
      normalized: true,
      identityUpdated: false,
      profileUpdated: false,
      eventsRecorded: 0,
      mileagesRecorded: 0,
      mileagesSkipped: 0,
    };

    try {
      outcome.identityUpdated = await this.applyIdentity(
        ownerId,
        vehicleId,
        facts,
      );

      outcome.profileUpdated = await this.applyProfile(
        ownerId,
        vehicleId,
        report.reportType,
        facts,
      );

      outcome.eventsRecorded = await this.applyHistoryEvents(
        ownerId,
        vehicleId,
        report,
        facts,
      );

      const mileage = await this.applyMileage(ownerId, vehicleId, report, facts);
      outcome.mileagesRecorded = mileage.recorded;
      outcome.mileagesSkipped = mileage.skipped;
    } catch (error) {
      this.logger.warn(
        `Applying normalized facts failed for ${report.reportType}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return outcome;
  }

  private async applyIdentity(
    ownerId: string,
    vehicleId: string,
    facts: NormalizedSourceFacts,
  ): Promise<boolean> {
    if (!facts.identity) {
      return false;
    }

    const vehicle = await this.garageService.getVehicle(ownerId, vehicleId);

    const updates: { make?: string; model?: string; modelYear?: string } = {};

    if (!vehicle.make && facts.identity.make) {
      updates.make = facts.identity.make;
    }

    if (!vehicle.model && facts.identity.model) {
      updates.model = facts.identity.model;
    }

    if (!vehicle.modelYear && facts.identity.modelYear) {
      updates.modelYear = facts.identity.modelYear;
    }

    if (Object.keys(updates).length === 0) {
      return false;
    }

    await this.garageService.updateVehicle(ownerId, vehicleId, updates);

    return true;
  }

  private async applyProfile(
    ownerId: string,
    vehicleId: string,
    reportType: string,
    facts: NormalizedSourceFacts,
  ): Promise<boolean> {
    const profile = facts.profile;

    if (!profile) {
      return false;
    }

    const fields = {
      engineCode: profile.engineCode,
      engineFamily: profile.engineFamily,
      displacementCc: profile.displacementCc,
      fuelType: profile.fuelType,
      powerKw: profile.powerKw,
      powerHp: profile.powerHp,
      transmissionType: profile.transmissionType,
      driveType: profile.driveType,
    };

    const hasData = Object.values(fields).some(
      (value) => value !== undefined && value !== null,
    );

    if (!hasData) {
      return false;
    }

    const current = await this.vehicleProfileService.getCurrentProfile(
      ownerId,
      vehicleId,
    );

    const isNewInformation = Object.entries(fields).some(([key, value]) => {
      if (value === undefined || value === null) {
        return false;
      }

      const currentValue = current
        ? (current as Record<string, unknown>)[key]
        : undefined;

      return (
        currentValue === undefined ||
        currentValue === null ||
        String(currentValue) !== String(value)
      );
    });

    if (!isNewInformation) {
      return false;
    }

    await this.vehicleProfileService.createProfileVersion(
      ownerId,
      vehicleId,
      {
        source: `vdb:${reportType}`.slice(0, 32),
        ...fields,
      },
    );

    return true;
  }

  private async applyHistoryEvents(
    ownerId: string,
    vehicleId: string,
    report: VehicleExternalReport,
    facts: NormalizedSourceFacts,
  ): Promise<number> {
    let recorded = 0;

    for (const event of facts.historyEvents) {
      const eventId = deterministicUuid(
        `vdb:${report.reportType}:${vehicleId}:${report.vin ?? ""}:${event.eventIdSuffix}`,
      );

      await this.vehicleHistoryService.recordEvent(ownerId, vehicleId, {
        eventId,
        type: event.type.slice(0, 120),
        sourceModule: "external-reports",
        origin: event.origin,
        mileageKm: event.mileageKm,
        confidence: event.confidence,
        payload: event.payload,
        occurredAt: event.occurredAt,
      });

      recorded += 1;
    }

    return recorded;
  }

  private async applyMileage(
    ownerId: string,
    vehicleId: string,
    report: VehicleExternalReport,
    facts: NormalizedSourceFacts,
  ): Promise<{ recorded: number; skipped: number }> {
    let recorded = 0;
    let skipped = 0;

    for (const reading of facts.mileageReadings) {
      if (
        !Number.isFinite(reading.odometerKm) ||
        reading.odometerKm <= 0 ||
        (reading.recordedAt && reading.recordedAt.getTime() > Date.now())
      ) {
        skipped += 1;
        continue;
      }

      try {
        await this.mileageService.recordReading(ownerId, vehicleId, {
          odometerKm: Math.round(reading.odometerKm),
          source: `vdb:${report.reportType}`.slice(0, 32),
          confidence: Math.min(
            reading.confidence,
            EXTERNAL_MILEAGE_CONFIDENCE_CAP,
          ),
          recordedAt: reading.recordedAt,
        });

        recorded += 1;
      } catch (error) {
        // Older external readings below the stored maximum are legitimately
        // rejected by the monotonicity guard — keep them only in the raw report.
        if (error instanceof BadRequestException) {
          skipped += 1;
          continue;
        }

        throw error;
      }
    }

    return { recorded, skipped };
  }
}
