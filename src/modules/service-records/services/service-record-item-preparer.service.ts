import { Injectable } from "@nestjs/common";

import { type CreateServiceRecordItemData } from "../service-records.db.service";
import { type CreateServiceRecordItemInput } from "../service-records.types";
import {
  roundServiceRecordMoney,
  toServiceRecordDecimalString,
} from "../utils/service-record-number.utils";

@Injectable()
export class ServiceRecordItemPreparerService {
  prepare(
    items: CreateServiceRecordItemInput[],
  ): CreateServiceRecordItemData[] {
    return items.map((item) => {
      let totalCost = item.totalCost;

      if (
        totalCost === undefined &&
        item.unitCost !== undefined &&
        item.quantity !== undefined
      ) {
        totalCost = roundServiceRecordMoney(item.unitCost * item.quantity);
      }

      return {
        itemType: item.itemType,
        name: item.name,
        description: item.description,
        brand: item.brand,
        partNumber: item.partNumber,

        quantity:
          item.quantity !== undefined
            ? toServiceRecordDecimalString(item.quantity, 3)
            : undefined,

        unit: item.unit,

        unitCost:
          item.unitCost !== undefined
            ? toServiceRecordDecimalString(item.unitCost, 2)
            : undefined,

        totalCost:
          totalCost !== undefined
            ? toServiceRecordDecimalString(totalCost, 2)
            : undefined,

        currency: item.currency,
        warrantyMonths: item.warrantyMonths,
        warrantyKm: item.warrantyKm,
      };
    });
  }
}
