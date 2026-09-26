import { Injectable } from "@nestjs/common";

import {
  isRecord,
  mapVehicleDatabasesResponse,
} from "../../../vin/providers/vehicle-databases/vehicle-databases.mapper";
import {
  emptyFacts,
  type NormalizedSourceFacts,
  type SourceNormalizer,
} from "../types";

@Injectable()
export class EuropeVinNormalizer implements SourceNormalizer {
  readonly sourceKey = "europe-vin-decode";

  normalize(rawPayload: unknown): NormalizedSourceFacts {
    const facts = emptyFacts();

    if (!isRecord(rawPayload)) {
      return facts;
    }

    const decoded = mapVehicleDatabasesResponse(rawPayload);

    facts.profile = {
      engineCode: decoded.engineCode,
      engineFamily: decoded.engineFamily,
      displacementCc: decoded.displacementCc,
      fuelType: decoded.fuelType,
      powerKw: decoded.powerKw,
      powerHp: decoded.powerHp,
      transmissionType: decoded.transmissionType,
      driveType: decoded.driveType,
    };

    facts.identity = {
      make: decoded.make,
      model: decoded.model,
      modelYear:
        decoded.modelYear !== undefined ? String(decoded.modelYear) : undefined,
    };

    facts.historyEvents.push({
      type: "external.vin_decode",
      origin: "system",
      eventIdSuffix: "decode",
      confidence: 0.9,
      payload: {
        source: "vehicle-databases:europe-vin-decode",
        make: decoded.make,
        model: decoded.model,
        modelYear: decoded.modelYear,
      },
    });

    return facts;
  }
}
