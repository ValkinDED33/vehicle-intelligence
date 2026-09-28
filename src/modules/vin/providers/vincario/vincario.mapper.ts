import {
  type VinDecodeResult,
  type VinDriveType,
  type VinFuelType,
  type VinTransmissionType,
} from "../vin-provider.interface";

type UnknownRecord = Record<string, unknown>;

export function mapVincarioResponse(payload: UnknownRecord): VinDecodeResult {
  const decode = getLabelValueRecord(payload, "decode");
  const attributes = getRecord(payload, "attributes");
  const vehicle = getRecord(payload, "vehicle");

  const make = firstString(
    decode,
    attributes,
    vehicle,
    ["Make", "make", "manufacturer", "Manufacturer"],
    120,
  );
  const model = firstString(
    decode,
    attributes,
    vehicle,
    ["Model", "model"],
    120,
  );

  return {
    provider: "vincario",
    make,
    model,
    modelYear: toModelYear(
      firstValue(decode, attributes, vehicle, [
        "Model Year",
        "Model year",
        "ModelYear",
        "Year",
        "year",
      ]),
    ),
    engineCode: firstString(decode, attributes, vehicle, [
      "Engine Code",
      "EngineCode",
      "engineCode",
      "Engine Model",
      "Engine Version",
    ], 64),
    engineFamily: firstString(decode, attributes, vehicle, [
      "Engine",
      "Engine Type",
      "engine",
      "Engine Description",
      "Engine Configuration",
    ], 120),
    displacementCc: toDisplacementCc(
      firstValue(decode, attributes, vehicle, [
        "Displacement (ccm)",
        "Engine Displacement (ccm)",
        "Engine Displacement (cc)",
        "Displacement",
        "Engine Displacement",
      ]),
    ),
    powerHp: toPositiveInteger(
      firstValue(decode, attributes, vehicle, [
        "Engine Power (HP)",
        "Engine Power (hp)",
        "Power HP",
        "Horsepower",
      ]),
    ),
    powerKw: toPositiveInteger(
      firstValue(decode, attributes, vehicle, [
        "Engine Power (kW)",
        "Engine Power (KW)",
        "Power kW",
        "Kilowatts",
      ]),
    ),
    fuelType: mapFuelType(
      firstString(decode, attributes, vehicle, ["Fuel Type", "Fuel", "Fuel System", "fuel"], 64),
    ),
    transmissionType: mapTransmissionType(
      firstString(decode, attributes, vehicle, [
        "Transmission",
        "Transmission Type",
        "Transmission Style",
      ], 64),
    ),
    driveType: mapDriveType(
      firstString(decode, attributes, vehicle, ["Drive", "Drive Type", "Drivetrain", "Driven Wheels"], 64),
    ),
    rawPayload: payload,
  };
}

function getRecord(record: UnknownRecord, key: string): UnknownRecord {
  const value = record[key];
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function getLabelValueRecord(record: UnknownRecord, key: string): UnknownRecord {
  const value = record[key];

  if (!Array.isArray(value)) {
    return getRecord(record, key);
  }

  const result: UnknownRecord = {};

  for (const item of value) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      continue;
    }

    const row = item as UnknownRecord;
    const label = row.label;

    if (typeof label !== "string" || !label.trim()) {
      continue;
    }

    result[label.trim()] = row.value;
  }

  return result;
}

function firstValue(
  first: UnknownRecord,
  second: UnknownRecord,
  third: UnknownRecord,
  keys: string[],
): unknown {
  for (const record of [first, second, third]) {
    for (const key of keys) {
      const value = record[key];
      if (value !== undefined && value !== null && value !== "") {
        return value;
      }
    }
  }
  return undefined;
}

function firstString(
  first: UnknownRecord,
  second: UnknownRecord,
  third: UnknownRecord,
  keys: string[],
  maxLength: number,
): string | undefined {
  const value = firstValue(first, second, third, keys);
  if (typeof value !== "string" && typeof value !== "number") {
    return undefined;
  }
  const text = String(value).trim();
  if (!text) return undefined;
  return text.length <= maxLength ? text : text.slice(0, maxLength);
}

function toModelYear(value: unknown): number | undefined {
  const year = toPositiveInteger(value);
  return year !== undefined && year >= 1000 && year <= 9999 ? year : undefined;
}

function toDisplacementCc(value: unknown): number | undefined {
  const parsed = toPositiveInteger(value);
  return parsed !== undefined && parsed >= 50 && parsed <= 20_000
    ? parsed
    : undefined;
}

function toPositiveInteger(value: unknown): number | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const parsed = Number(String(value).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.round(parsed);
}

function mapFuelType(value?: string): VinFuelType | undefined {
  const normalized = value?.toLowerCase();
  if (!normalized) return undefined;
  if (normalized.includes("diesel")) return "diesel";
  if (normalized.includes("electric")) return "electric";
  if (normalized.includes("hybrid")) return "hybrid";
  if (normalized.includes("lpg")) return "lpg";
  if (normalized.includes("cng")) return "cng";
  if (normalized.includes("hydrogen")) return "hydrogen";
  if (normalized.includes("gas") || normalized.includes("petrol")) return "petrol";
  return undefined;
}

function mapTransmissionType(value?: string): VinTransmissionType | undefined {
  const normalized = value?.toLowerCase();
  if (!normalized) return undefined;
  if (normalized.includes("manual")) return "manual";
  if (normalized.includes("cvt")) return "cvt";
  if (normalized.includes("dct") || normalized.includes("dual")) return "dct";
  if (normalized.includes("auto")) return "automatic";
  return undefined;
}

function mapDriveType(value?: string): VinDriveType | undefined {
  const normalized = value?.toLowerCase();
  if (!normalized) return undefined;
  if (normalized.includes("awd")) return "awd";
  if (normalized.includes("4wd") || normalized.includes("4x4")) return "4wd";
  if (normalized.includes("fwd") || normalized.includes("front")) return "fwd";
  if (normalized.includes("rwd") || normalized.includes("rear")) return "rwd";
  return undefined;
}
