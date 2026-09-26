import { Injectable } from "@nestjs/common";

import {
  asDateMdy,
  asMeaningfulString,
  asMoney,
  asRecord,
  asRecordArray,
  parseOdometerKm,
  pick,
  stableSuffix,
} from "../payload-utils";
import {
  emptyFacts,
  type NormalizedSourceFacts,
  type SourceNormalizer,
} from "../types";

@Injectable()
export class AuctionNormalizer implements SourceNormalizer {
  readonly sourceKey = "auction";

  normalize(rawPayload: unknown): NormalizedSourceFacts {
    const facts = emptyFacts();

    // The auction endpoint returns data as an array of lots.
    const lots = Array.isArray(rawPayload)
      ? asRecordArray(rawPayload)
      : asRecordArray(asRecord(rawPayload)?.["data"]);

    for (const lot of lots) {
      const saleDateLocation =
        asRecord(pick(lot, "sale-date-location", "sale_date_location")) ?? {};
      const technicalSpecs =
        asRecord(pick(lot, "technical-specs", "technical_specs")) ?? {};
      const titleAndCondition =
        asRecord(pick(lot, "title-and-condition", "title_and_condition")) ?? {};

      const saleIndex = asMeaningfulString(
        pick(lot, "sale_index", "saleIndex", "lot-number", "lot_number"),
      );

      const occurredAt = asDateMdy(
        pick(saleDateLocation, "Auction Date", "auction_date", "sale date"),
      );

      const odometerKm = parseOdometerKm(
        pick(technicalSpecs, "Odometer", "odometer"),
      );

      const titleType = asMeaningfulString(
        pick(titleAndCondition, "Title Type", "title_type", "title"),
      );

      const price =
        asMoney(pick(lot, "price", "final price", "high bid")) ??
        asMoney(pick(saleDateLocation, "price"));

      if (odometerKm !== undefined && odometerKm > 0) {
        facts.mileageReadings.push({
          odometerKm,
          recordedAt: occurredAt,
          confidence: 0.7,
          sourceLabel: saleIndex ? `auction lot ${saleIndex}` : "auction lot",
        });
      }

      facts.historyEvents.push({
        type: "external.auction_sale",
        origin: "system",
        eventIdSuffix: saleIndex ?? stableSuffix(lot),
        occurredAt,
        mileageKm: odometerKm,
        confidence: 0.7,
        payload: {
          source: "vehicle-databases:auction",
          saleIndex,
          price,
          saleStatus: asMeaningfulString(pick(lot, "sale status", "sale_status")),
          titleType,
          titleCondition: asMeaningfulString(
            pick(titleAndCondition, "Condition", "condition"),
          ),
          location: asMeaningfulString(
            pick(saleDateLocation, "Location", "location"),
          ),
          damages: asMeaningfulString(pick(lot, "damages", "damage")),
        },
      });
    }

    return facts;
  }
}
