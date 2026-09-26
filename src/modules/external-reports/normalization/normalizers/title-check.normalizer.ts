import { Injectable } from "@nestjs/common";

import {
  asDateMdy,
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
export class TitleCheckNormalizer implements SourceNormalizer {
  readonly sourceKey = "title-check";

  normalize(rawPayload: unknown): NormalizedSourceFacts {
    const facts = emptyFacts();

    const data = asRecord(rawPayload);

    if (!data) {
      return facts;
    }

    const salvageDetails = asRecordArray(
      pick(data, "salvage_details", "salvageDetails"),
    );

    const isSalvage =
      data["salvage"] === true ||
      asMeaningfulString(data["salvage"])?.toLowerCase() === "true" ||
      salvageDetails.length > 0;

    let occurredAt: Date | undefined;

    for (const detail of salvageDetails) {
      occurredAt = asDateMdy(pick(detail, "date", "salvage_date"));

      if (occurredAt) {
        break;
      }
    }

    facts.historyEvents.push({
      type: isSalvage ? "external.title_salvage" : "external.title_check",
      origin: "system",
      eventIdSuffix: "title-check",
      occurredAt,
      confidence: 0.9,
      payload: {
        source: "vehicle-databases:title-check",
        salvage: isSalvage,
        salvageDetails,
      },
    });

    return facts;
  }
}
