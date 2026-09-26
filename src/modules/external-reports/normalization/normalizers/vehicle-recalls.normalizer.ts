import { Injectable } from "@nestjs/common";

import {
  asAmbiguousSlashDate,
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
export class VehicleRecallsNormalizer implements SourceNormalizer {
  readonly sourceKey = "vehicle-recalls";

  normalize(rawPayload: unknown): NormalizedSourceFacts {
    const facts = emptyFacts();

    const data = asRecord(rawPayload);

    if (!data) {
      return facts;
    }

    const recalls = asRecordArray(pick(data, "recall", "recalls"));

    for (const recall of recalls) {
      const campaignId = asMeaningfulString(
        pick(recall, "campaign_id", "campaignId", "recall_no", "recall_number"),
      );

      // Recall date formats differ between markets (DD/MM vs MM/DD) —
      // only used when unambiguous, and always kept verbatim in the payload.
      const recallDateRaw = asMeaningfulString(
        pick(recall, "recall_date", "recallDate", "date"),
      );

      facts.historyEvents.push({
        type: "external.recall",
        origin: "system",
        eventIdSuffix: campaignId ?? stableSuffix(recall),
        occurredAt: asAmbiguousSlashDate(recallDateRaw),
        confidence: 0.9,
        payload: {
          source: "vehicle-databases:vehicle-recalls",
          campaignId,
          recallDate: recallDateRaw,
          componentAffected: asMeaningfulString(
            pick(recall, "component_affected", "componentAffected", "component"),
          ),
          summary: asMeaningfulString(
            pick(recall, "summary", "description", "defect_description"),
          ),
          remedy: asMeaningfulString(pick(recall, "remedy", "fix")),
          manufacturerName: asMeaningfulString(
            pick(recall, "manufacturer_name", "manufacturerName", "manufacturer"),
          ),
        },
      });
    }

    return facts;
  }
}
