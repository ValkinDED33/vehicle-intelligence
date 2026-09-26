import { type VinDecodeResult } from "../vin-provider.interface";

import {
  mapDriveType,
  mapFuelType,
  mapTransmissionType,
} from "./vehicle-databases.normalizers";
import { type UnknownRecord } from "./vehicle-databases.types";

export function mapVehicleDatabasesResponse(
  data: UnknownRecord,
): VinDecodeResult {
  const general = getRecord(data, "General Information");
  const specification = getRecord(data, "Vehicle Specification");

  const make = getLimitedString(general, "Make", 120);
  const model = getLimitedString(general, "Model", 120);

  const modelYear = toModelYear(
    getValue(general, "Model year", "Model Year", "Year") ??
      getValue(data, "Model year", "Model Year", "Year"),
  );

  const engineType = getLimitedString(general, "Engine type", 120);

  const displacementCc = toDisplacementCc(
    getValue(
      specification,
      "Displacement SI",
      "Displacement cc",
      "Displacement CC",
    ),
  );

  const fuelType = mapFuelType(
    getString(general, "Fuel type") ?? getString(specification, "Fuel type"),
  );

  const transmissionType = mapTransmissionType(
    getString(general, "Transmission") ??
      getString(specification, "Transmission"),
  );

  const driveType = mapDriveType(
    getString(specification, "Driveline") ?? getString(general, "Driveline"),
  );

  return {
    provider: "vehicle-databases",
    make,
    model,
    modelYear,
    engineFamily: engineType,
    displacementCc,
    fuelType,
    transmissionType,
    driveType,
    rawPayload: data,
  };
}

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getRecord(record: UnknownRecord, key: string): UnknownRecord {
  const value = record[key];

  return isRecord(value) ? value : {};
}

function getString(record: UnknownRecord, key: string): string | undefined {
  const value = record[key];

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : undefined;
}

function getLimitedString(
  record: UnknownRecord,
  key: string,
  maxLength: number,
): string | undefined {
  const value = getString(record, key);

  if (!value) {
    return undefined;
  }

  return value.length <= maxLength ? value : value.slice(0, maxLength);
}

function getValue(record: UnknownRecord, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = record[key];

    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return undefined;
}

function toModelYear(value: unknown): number | undefined {
  const parsed = toInteger(value);

  if (parsed === undefined || parsed < 1000 || parsed > 9999) {
    return undefined;
  }

  return parsed;
}

function toDisplacementCc(value: unknown): number | undefined {
  const parsed = toInteger(value);

  if (parsed === undefined || parsed < 50 || parsed > 20_000) {
    return undefined;
  }

  return parsed;
}

function toInteger(value: unknown): number | undefined {
  if (typeof value !== "string" && typeof value !== "number") {
    return undefined;
  }

  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    return undefined;
  }

  return parsed;
}
