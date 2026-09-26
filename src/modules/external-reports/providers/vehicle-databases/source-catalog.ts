export interface VehicleDatabasesSourceDefinition {
  /** Stable key used as reportType in vehicle_external_reports and in API routes. */
  key: string;
  /** Human-readable API name for logs and error messages. */
  apiName: string;
  /** Absolute URL template; {vin} is replaced with the encoded VIN. */
  urlTemplate: string;
}

const BASE_URL = "https://api.vehicledatabases.com";

/**
 * VIN-based GET sources verified against vehicledatabases.com docs (2026-09-26).
 * YMM(T)-based sources (ymm-specs, warranty, ev-specs) and OCR/plate endpoints
 * are intentionally not here yet — they need profile data or multipart uploads.
 */
export const VEHICLE_DATABASES_VIN_SOURCES: readonly VehicleDatabasesSourceDefinition[] =
  [
    {
      key: "basic-vin-decode",
      apiName: "Basic VIN Decode",
      urlTemplate: `${BASE_URL}/vin-decode/{vin}`,
    },
    {
      key: "advanced-vin-decode",
      apiName: "Advanced VIN Decode",
      urlTemplate: `${BASE_URL}/advanced-vin-decode/v2/{vin}`,
    },
    {
      key: "europe-vin-decode",
      apiName: "Europe VIN Decode",
      urlTemplate: `${BASE_URL}/europe-vin-decode/v2/{vin}`,
    },
    {
      key: "market-value",
      apiName: "Market Value",
      urlTemplate: `${BASE_URL}/market-value/v2/{vin}`,
    },
    {
      key: "sales-history",
      apiName: "Sales History",
      urlTemplate: `${BASE_URL}/saleshistory/{vin}`,
    },
    {
      key: "auction",
      apiName: "Auction",
      urlTemplate: `${BASE_URL}/auction/{vin}`,
    },
    {
      key: "stolen-check",
      apiName: "Stolen Check",
      urlTemplate: `${BASE_URL}/stolen-check/{vin}`,
    },
    {
      key: "title-check",
      apiName: "Title Check",
      urlTemplate: `${BASE_URL}/title-check/{vin}`,
    },
    {
      key: "vehicle-recalls",
      apiName: "Vehicle Recalls",
      urlTemplate: `${BASE_URL}/vehicle-recalls/{vin}`,
    },
    {
      key: "vehicle-repairs",
      apiName: "Vehicle Repairs",
      urlTemplate: `${BASE_URL}/vehicle-repairs/v2/{vin}`,
    },
    {
      key: "repair-estimates",
      apiName: "Repair Estimates",
      urlTemplate: `${BASE_URL}/repair-estimates/{vin}`,
    },
    {
      key: "vehicle-maintenance",
      apiName: "Vehicle Maintenance",
      urlTemplate: `${BASE_URL}/vehicle-maintenance/v4/{vin}`,
    },
    {
      key: "dimensions",
      apiName: "Track & Wheelbase Dimensions",
      urlTemplate: `${BASE_URL}/dimensions/{vin}`,
    },
    {
      key: "windshield",
      apiName: "Windshield Lookup",
      urlTemplate: `${BASE_URL}/windshield-api/{vin}`,
    },
    {
      key: "vin-suggestion",
      apiName: "VIN Suggestion",
      urlTemplate: `${BASE_URL}/vin-suggestion/v2/{vin}`,
    },
    {
      key: "motorcycle-decode",
      apiName: "Motorcycle Decode",
      urlTemplate: `${BASE_URL}/motorcycle-decode/{vin}`,
    },
    {
      key: "owner-manual",
      apiName: "Owner's Manual",
      urlTemplate: `${BASE_URL}/owner-manual/{vin}`,
    },
  ] as const;

export const VEHICLE_DATABASES_SOURCE_MAP: ReadonlyMap<
  string,
  VehicleDatabasesSourceDefinition
> = new Map(
  VEHICLE_DATABASES_VIN_SOURCES.map((source) => [source.key, source]),
);
