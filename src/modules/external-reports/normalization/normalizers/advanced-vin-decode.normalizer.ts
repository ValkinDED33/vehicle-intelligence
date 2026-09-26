import { Injectable } from "@nestjs/common";

import {
  mapTransmissionType,
} from "../../../vin/providers/vehicle-databases/vehicle-databases.normalizers";
import {
  asInteger,
  asMeaningfulString,
  asMoney,
  asNumber,
  asRecord,
  asRecordArray,
  pick,
} from "../payload-utils";
import {
  emptyFacts,
  type NormalizedSourceFacts,
  type SourceNormalizer,
} from "../types";

@Injectable()
export class AdvancedVinDecodeNormalizer implements SourceNormalizer {
  readonly sourceKey = "advanced-vin-decode";

  normalize(rawPayload: unknown): NormalizedSourceFacts {
    const facts = emptyFacts();

    const data = asRecord(rawPayload);

    if (!data) {
      return facts;
    }

    const basic = asRecord(pick(data, "basic", "general")) ?? {};
    const transmission = asRecord(pick(data, "transmission")) ?? {};
    const price = asRecord(pick(data, "price", "pricing", "msrp")) ?? {};

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

    facts.profile = {
      displacementCc: findDisplacementCc(data),
      transmissionType: mapTransmissionType(
        asMeaningfulString(pick(transmission, "type", "transmission_type")),
      ),
    };

    const baseMsrp = asMoney(pick(price, "base_msrp", "baseMsrp", "msrp"));

    if (baseMsrp !== undefined) {
      facts.historyEvents.push({
        type: "external.msrp",
        origin: "system",
        eventIdSuffix: "msrp",
        confidence: 0.8,
        payload: {
          source: "vehicle-databases:advanced-vin-decode",
          baseMsrp,
          currency: asMeaningfulString(pick(price, "currency")),
          priceDetails: price,
        },
      });
    }

    return facts;
  }
}

/** Displacement lives in one of the entries of the specifications array. */
function findDisplacementCc(data: Record<string, unknown>): number | undefined {
  const specifications = asRecordArray(pick(data, "specifications", "specs"));

  for (const specification of specifications) {
    const engine = asRecord(pick(specification, "engine"));

    const numeric = asNumber(pick(engine ?? specification, "displacement"));

    if (numeric !== undefined && numeric >= 50 && numeric <= 20_000) {
      return Math.round(numeric);
    }
  }

  return undefined;
}
