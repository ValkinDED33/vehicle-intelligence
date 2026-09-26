import { BadRequestException, Injectable } from "@nestjs/common";

import { type CreateServiceRecordInput } from "../service-records.types";

@Injectable()
export class ServiceRecordValidatorService {
  validate(input: CreateServiceRecordInput): void {
    if (!input.title.trim()) {
      throw new BadRequestException("Service record title is required");
    }

    if (input.odometerKm !== undefined && input.odometerKm < 0) {
      throw new BadRequestException("Odometer cannot be negative");
    }

    if (input.engineHours !== undefined && input.engineHours < 0) {
      throw new BadRequestException("Engine hours cannot be negative");
    }

    if (input.totalCost !== undefined && input.totalCost < 0) {
      throw new BadRequestException("Total cost cannot be negative");
    }

    if (input.totalCost !== undefined && !input.currency) {
      throw new BadRequestException(
        "Currency is required when total cost is provided",
      );
    }

    for (const item of input.items ?? []) {
      if (!item.name.trim()) {
        throw new BadRequestException("Service item name is required");
      }

      if (item.quantity !== undefined && item.quantity <= 0) {
        throw new BadRequestException(
          "Service item quantity must be greater than zero",
        );
      }

      if (item.unitCost !== undefined && item.unitCost < 0) {
        throw new BadRequestException(
          "Service item unit cost cannot be negative",
        );
      }

      if (item.totalCost !== undefined && item.totalCost < 0) {
        throw new BadRequestException(
          "Service item total cost cannot be negative",
        );
      }

      if (
        (item.unitCost !== undefined || item.totalCost !== undefined) &&
        !item.currency &&
        !input.currency
      ) {
        throw new BadRequestException(
          "Currency is required for priced service items",
        );
      }

      if (!item.currency && input.currency) {
        item.currency = input.currency;
      }
    }
  }
}
