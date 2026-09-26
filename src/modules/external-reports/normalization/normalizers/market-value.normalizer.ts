import { Injectable } from "@nestjs/common";

import {
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
export class MarketValueNormalizer implements SourceNormalizer {
  readonly sourceKey = "market-value";

  normalize(rawPayload: unknown): NormalizedSourceFacts {
    const facts = emptyFacts();

    const data = asRecord(rawPayload);

    if (!data) {
      return facts;
    }

    const basic = asRecord(pick(data, "basic")) ?? {};

    const valuationTables = asRecordArray(
      pick(data, "market_value_data", "marketValueData"),
    ).map((entry) => pick(entry, "market value", "market_value"));

    facts.historyEvents.push({
      type: "external.market_valuation",
      origin: "system",
      eventIdSuffix: "market-value",
      confidence: 0.8,
      payload: {
        source: "vehicle-databases:market-value",
        // Mileage here is an echo of the request input, not an observation —
        // it is kept in the payload but never recorded as a mileage reading.
        odometerInput: asMeaningfulString(pick(basic, "mileage", "odometer")),
        state: asMeaningfulString(pick(basic, "state")),
        marketValue: valuationTables,
      },
    });

    return facts;
  }
}
