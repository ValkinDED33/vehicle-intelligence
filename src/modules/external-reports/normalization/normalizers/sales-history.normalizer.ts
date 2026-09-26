import { Injectable } from "@nestjs/common";

import {
  asDate,
  asMeaningfulString,
  asNumber,
  asRecord,
  asRecordArray,
  milesToKm,
  pick,
  stableSuffix,
} from "../payload-utils";
import {
  emptyFacts,
  type NormalizedSourceFacts,
  type SourceNormalizer,
} from "../types";

@Injectable()
export class SalesHistoryNormalizer implements SourceNormalizer {
  readonly sourceKey = "sales-history";

  normalize(rawPayload: unknown): NormalizedSourceFacts {
    const facts = emptyFacts();

    const data = asRecord(rawPayload);

    if (!data) {
      return facts;
    }

    const rawListings = asRecordArray(
      pick(data, "sales_history", "salesHistory", "sales"),
    );

    for (const rawListing of rawListings) {
      const listing = asRecord(pick(rawListing, "data")) ?? rawListing;

      const listingId = asMeaningfulString(
        pick(listing, "listing_id", "listingId", "id"),
      );

      const occurredAt = asDate(
        pick(listing, "last_updated", "sale_date", "date"),
      );

      const odometerKmRaw = asNumber(
        pick(listing, "odometer_km", "odometerKm"),
      );
      const odometerMi = asNumber(pick(listing, "odometer_mi", "odometerMiles"));

      const odometerKm =
        odometerKmRaw ?? (odometerMi !== undefined ? milesToKm(odometerMi) : undefined);

      if (odometerKm !== undefined && odometerKm > 0) {
        facts.mileageReadings.push({
          odometerKm,
          recordedAt: occurredAt,
          confidence: 0.6,
          sourceLabel: listingId
            ? `sale listing ${listingId}`
            : "sales-history listing",
        });
      }

      facts.historyEvents.push({
        type: "external.sale_listing",
        origin: "system",
        eventIdSuffix: listingId ?? stableSuffix(listing),
        occurredAt,
        mileageKm: odometerKm,
        confidence: 0.7,
        payload: {
          source: "vehicle-databases:sales-history",
          listingId,
          sellerType: asMeaningfulString(pick(listing, "seller_type", "sellerType")),
          dealerName: asMeaningfulString(pick(listing, "dealer_name", "dealerName")),
          saleStatus: asMeaningfulString(pick(listing, "sale_status", "status")),
          city: asMeaningfulString(pick(listing, "city")),
          state: asMeaningfulString(pick(listing, "state")),
          listingPrice: asMeaningfulString(pick(listing, "listing_price", "price")),
          damages: asMeaningfulString(pick(listing, "damages")),
        },
      });
    }

    return facts;
  }
}
