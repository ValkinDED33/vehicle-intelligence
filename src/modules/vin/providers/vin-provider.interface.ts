export const VIN_PROVIDER_TOKEN = "VIN_PROVIDER_TOKEN";

export const VIN_FUEL_TYPES = [
  "petrol",
  "diesel",
  "lpg",
  "cng",
  "hybrid",
  "phev",
  "electric",
  "hydrogen",
] as const;

export const VIN_TRANSMISSION_TYPES = [
  "manual",
  "automatic",
  "dct",
  "cvt",
  "single-speed",
  "other",
] as const;

export const VIN_DRIVE_TYPES = ["fwd", "rwd", "awd", "4wd", "other"] as const;

export type VinFuelType = (typeof VIN_FUEL_TYPES)[number];

export type VinTransmissionType = (typeof VIN_TRANSMISSION_TYPES)[number];

export type VinDriveType = (typeof VIN_DRIVE_TYPES)[number];

export interface VinDecodeResult {
  provider: string;

  make?: string;
  model?: string;
  modelYear?: number;

  engineCode?: string;
  engineFamily?: string;
  displacementCc?: number;

  powerKw?: number;
  powerHp?: number;

  fuelType?: VinFuelType;
  transmissionType?: VinTransmissionType;
  driveType?: VinDriveType;

  rawPayload?: Record<string, unknown>;
}

export interface VinProvider {
  decode(vin: string): Promise<VinDecodeResult>;
}
