import { Injectable } from "@nestjs/common";

import {
  mapFuelType,
  mapTransmissionType,
} from "../../../vin/providers/vehicle-databases/vehicle-databases.normalizers";
import {
  asInteger,
  asMeaningfulString,
  asNumber,
  asRecord,
  pick,
} from "../payload-utils";
import {
  emptyFacts,
  type NormalizedSourceFacts,
  type SourceNormalizer,
} from "../types";

@Injectable()
export class BasicVinDecodeNormalizer implements SourceNormalizer {
  readonly sourceKey = "basic-vin-decode";

  normalize(rawPayload: unknown): NormalizedSourceFacts {
    const facts = emptyFacts();

    const data = asRecord(rawPayload);

    if (!data) {
      return facts;
    }

    const basic = asRecord(pick(data, "basic")) ?? {};
    const engine = asRecord(pick(data, "engine")) ?? {};
    const fuel = asRecord(pick(data, "fuel")) ?? {};
    const transmission = asRecord(pick(data, "transmission")) ?? {};

    const make = asMeaningfulString(pick(basic, "make", "brand"));
    const model = asMeaningfulString(pick(basic, "model"));
    const modelYear = asInteger(pick(basic, "year", "model_year"));

    if (make || model || modelYear !== undefined) {
      facts.identity = {
        make,
        model,
        modelYear: modelYear !== undefined ? String(modelYear) : undefined,
      };
    }

    const electrification = asMeaningfulString(
      pick(fuel, "electrification_level", "electrificationLevel"),
    );

    // "4x2"-style drive_type values are ambiguous between markets — skipped.
    facts.profile = {
      displacementCc: toDisplacementCc(
        pick(engine, "engine_capacity", "displacement", "capacity"),
      ),
      fuelType: resolveFuelType(
        asMeaningfulString(pick(fuel, "fuel_type", "fuelType")),
        electrification,
      ),
      transmissionType: mapTransmissionType(
        asMeaningfulString(
          pick(transmission, "transmission_style", "transmission", "style"),
        ),
      ),
    };

    facts.historyEvents.push({
      type: "external.vin_decode",
      origin: "system",
      eventIdSuffix: "basic-decode",
      confidence: 0.8,
      payload: {
        source: "vehicle-databases:basic-vin-decode",
        make,
        model,
        modelYear,
      },
    });

    return facts;
  }
}

/** Providers send capacity both as cc ("3300.0") and liters ("3.3"). */
function toDisplacementCc(value: unknown): number | undefined {
  const numeric = asNumber(value);

  if (numeric === undefined || numeric <= 0) {
    return undefined;
  }

  const cc = numeric < 30 ? numeric * 1000 : numeric;

  return cc >= 50 && cc <= 20_000 ? Math.round(cc) : undefined;
}

function resolveFuelType(
  fuelType: string | undefined,
  electrification: string | undefined,
): string | undefined {
  const level = electrification?.toLowerCase();

  if (level?.includes("phev") || level?.includes("plug-in")) {
    return "phev";
  }

  if (level?.includes("hev") || level?.includes("hybrid")) {
    return "hybrid";
  }

  if (level?.includes("bev") || level?.includes("electric")) {
    return "electric";
  }

  return mapFuelType(fuelType);
}
