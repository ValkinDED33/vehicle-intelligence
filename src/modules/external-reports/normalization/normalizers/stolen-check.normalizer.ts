import { Injectable } from "@nestjs/common";

import {
  asDateDmy,
  asMeaningfulString,
  asRecord,
  asRecordArray,
  pick,
  stableSuffix,
} from "../payload-utils";
import {
  emptyFacts,
  type NormalizedSourceFacts,
  type SourceNormalizer,
} from "../types";

@Injectable()
export class StolenCheckNormalizer implements SourceNormalizer {
  readonly sourceKey = "stolen-check";

  normalize(rawPayload: unknown): NormalizedSourceFacts {
    const facts = emptyFacts();

    // The stolen-check endpoint returns data as an array of records.
    const records = Array.isArray(rawPayload)
      ? asRecordArray(rawPayload)
      : asRecordArray(asRecord(rawPayload)?.["data"]);

    for (const [index, record] of records.entries()) {
      const possibleStolen =
        record["possible_stolen"] === true ||
        asMeaningfulString(record["possible_stolen"])?.toLowerCase() === "true";

      const occurredAt = asDateDmy(
        pick(record, "date", "stolen_date", "record_date"),
      );

      facts.historyEvents.push({
        type: possibleStolen ? "external.stolen_alert" : "external.stolen_check",
        origin: "system",
        eventIdSuffix: `${possibleStolen ? "stolen" : "clean"}-${index}-${stableSuffix(record)}`,
        occurredAt,
        confidence: 0.9,
        payload: {
          source: "vehicle-databases:stolen-check",
          possibleStolen,
          plate: asMeaningfulString(pick(record, "plate", "plate_number", "license_plate")),
          location: asMeaningfulString(pick(record, "location", "state", "region")),
          color: asMeaningfulString(pick(record, "color", "colour")),
        },
      });
    }

    return facts;
  }
}
