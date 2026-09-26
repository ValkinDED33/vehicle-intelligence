import { Injectable } from "@nestjs/common";

import {
  asInteger,
  asMeaningfulString,
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
export class VinSuggestionNormalizer implements SourceNormalizer {
  readonly sourceKey = "vin-suggestion";

  normalize(rawPayload: unknown, vin: string): NormalizedSourceFacts {
    const facts = emptyFacts();

    const records = Array.isArray(rawPayload)
      ? asRecordArray(rawPayload)
      : [asRecord(rawPayload)].filter(
          (record): record is Record<string, unknown> => record !== null,
        );

    for (const record of records) {
      const status = asMeaningfulString(pick(record, "vin_status", "status"));
      const suggestedVin = asMeaningfulString(
        pick(record, "suggested_vin", "suggestedVin", "corrected_vin"),
      );

      if (status?.toLowerCase() === "invalid" && suggestedVin) {
        const make = asMeaningfulString(pick(record, "make", "brand"));
        const model = asMeaningfulString(pick(record, "model"));
        const modelYear = asInteger(pick(record, "year", "model_year"));

        facts.historyEvents.push({
          type: "external.vin_suggestion",
          origin: "system",
          eventIdSuffix: suggestedVin,
          confidence: 0.9,
          payload: {
            source: "vehicle-databases:vin-suggestion",
            enteredVin: vin,
            suggestedVin,
            make,
            model,
            modelYear,
          },
        });
      }
    }

    return facts;
  }
}
