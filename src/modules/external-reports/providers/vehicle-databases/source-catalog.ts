export interface VehicleDatabasesSourceDefinition {
  /** Stable key used as reportType in vehicle_external_reports and in API routes. */
  key: string;
  /** Human-readable API name for logs and error messages. */
  apiName: string;
  /**
   * Input shape required by the upstream endpoint.
   *
   * Only "vin" sources can be fetched by the generic vehicle VIN flow.
   */
  input: "vin" | "ymm" | "ymmt" | "plate" | "image";
  /** Absolute URL template; {vin} is replaced with the encoded VIN. */
  urlTemplate?: string;
  /** Why this source is catalogued but not part of generic VIN fetch-all. */
  note?: string;
  /** Disabled sources are visible for bookkeeping but cannot be fetched. */
  enabled?: boolean;
}

const BASE_URL = "https://api.vehicledatabases.com";

/**
 * Vehicle Databases sources available in the current subscription.
 *
 * Sources with input="vin" are safe to call from /external-reports/sources
 * because a garage vehicle always carries the VIN. Other source types are
 * listed for capability discovery but require a dedicated request shape.
 */
export const VEHICLE_DATABASES_SOURCES: readonly VehicleDatabasesSourceDefinition[] =
  [
    {
      key: "basic-vin-decode",
      apiName: "Basic VIN Decode",
      input: "vin",
      urlTemplate: `${BASE_URL}/vin-decode/{vin}`,
    },
    {
      key: "advanced-vin-decode",
      apiName: "Advanced VIN Decode",
      input: "vin",
      urlTemplate: `${BASE_URL}/advanced-vin-decode/v2/{vin}`,
    },
    {
      key: "europe-vin-decode",
      apiName: "Europe VIN Decode",
      input: "vin",
      urlTemplate: `${BASE_URL}/europe-vin-decode/v2/{vin}`,
    },
    {
      key: "market-value",
      apiName: "Market Value by VIN & YMM",
      input: "vin",
      urlTemplate: `${BASE_URL}/market-value/v2/{vin}`,
    },
    {
      key: "sales-history",
      apiName: "Sales History",
      input: "vin",
      urlTemplate: `${BASE_URL}/saleshistory/{vin}`,
    },
    {
      key: "auction",
      apiName: "Auction",
      input: "vin",
      urlTemplate: `${BASE_URL}/auction/{vin}`,
    },
    {
      key: "stolen-check",
      apiName: "Stolen Check",
      input: "vin",
      urlTemplate: `${BASE_URL}/stolen-check/{vin}`,
    },
    {
      key: "title-check",
      apiName: "Title Check",
      input: "vin",
      urlTemplate: `${BASE_URL}/title-check/{vin}`,
    },
    {
      key: "vehicle-recalls",
      apiName: "Vehicle Recalls by VIN & YMM",
      input: "vin",
      urlTemplate: `${BASE_URL}/vehicle-recalls/{vin}`,
    },
    {
      key: "vehicle-repairs",
      apiName: "Vehicle Repairs by VIN & YMM",
      input: "vin",
      urlTemplate: `${BASE_URL}/vehicle-repairs/v2/{vin}`,
    },
    {
      key: "repair-estimates",
      apiName: "Vehicle Repair Estimates by VIN & YMMT",
      input: "vin",
      urlTemplate: `${BASE_URL}/repair-estimates/{vin}`,
    },
    {
      key: "vehicle-maintenance",
      apiName: "Vehicle Maintenance by VIN & YMMT",
      input: "vin",
      urlTemplate: `${BASE_URL}/vehicle-maintenance/v4/{vin}`,
    },
    {
      key: "dimensions",
      apiName: "Track & Wheelbase Dimensions",
      input: "vin",
      urlTemplate: `${BASE_URL}/dimensions/{vin}`,
    },
    {
      key: "windshield",
      apiName: "Windshield Lookup",
      input: "vin",
      urlTemplate: `${BASE_URL}/windshield-api/{vin}`,
    },
    {
      key: "vin-suggestion",
      apiName: "VIN Suggestion",
      input: "vin",
      urlTemplate: `${BASE_URL}/vin-suggestion/v2/{vin}`,
    },
    {
      key: "motorcycle-decode",
      apiName: "Motorcycle Decode by VIN & YMMT",
      input: "vin",
      urlTemplate: `${BASE_URL}/motorcycle-decode/{vin}`,
      enabled: false,
      note: "Disabled for car garage flow.",
    },
    {
      key: "owner-manual",
      apiName: "Owner's Manual by VIN & YMM",
      input: "vin",
      urlTemplate: `${BASE_URL}/owner-manual/{vin}`,
    },
    {
      key: "electric-vehicle-specifications",
      apiName: "Electric Vehicle Specifications",
      input: "ymmt",
      urlTemplate: `${BASE_URL}/electric-vehicle/{year}/{make}/{model}/{trim}`,
      note: "Requires year, make, model and trim.",
    },
    {
      key: "vehicle-warranty",
      apiName: "Vehicle Warranty",
      input: "ymm",
      urlTemplate: `${BASE_URL}/vehicle-warranty/{year}/{make}/{model}`,
      note: "Requires year, make and model.",
    },
    {
      key: "ymmt-specifications",
      apiName: "YMMT Specifications",
      input: "ymmt",
      urlTemplate: `${BASE_URL}/ymm-specs/v3/{year}/{make}/{model}/{trim}`,
      note: "Requires year, make, model and trim.",
    },
    {
      key: "uk-registration-decode",
      apiName: "UK Registration Decode",
      input: "plate",
      urlTemplate: `${BASE_URL}/uk-registration-decode/{reg_num}`,
      note: "Requires a UK registration number.",
    },
    {
      key: "license-plate-ocr",
      apiName: "License Plate OCR",
      input: "image",
      urlTemplate: `${BASE_URL}/licenseplate-ocr`,
      note: "Requires multipart image upload.",
    },
    {
      key: "vin-ocr",
      apiName: "VIN OCR",
      input: "image",
      urlTemplate: `${BASE_URL}/vin-ocr`,
      note: "Requires multipart image upload.",
    },
    {
      key: "oem-parts",
      apiName: "OEM Parts API",
      input: "ymmt",
      note: "Subscribed service; public docs do not expose a stable endpoint in the current documentation.",
    },
  ] as const;

export const VEHICLE_DATABASES_VIN_SOURCES =
  VEHICLE_DATABASES_SOURCES.filter(
    (source) => source.input === "vin" && source.enabled !== false,
  );

export const VEHICLE_DATABASES_SOURCE_MAP: ReadonlyMap<
  string,
  VehicleDatabasesSourceDefinition
> = new Map(
  VEHICLE_DATABASES_SOURCES.map((source) => [source.key, source]),
);
