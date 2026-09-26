import {
  type VinDriveType,
  type VinFuelType,
  type VinTransmissionType,
} from "../vin-provider.interface";

export function mapFuelType(value?: string): VinFuelType | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized.includes("gasoline") || normalized.includes("petrol")) {
    return "petrol";
  }

  if (normalized.includes("diesel")) {
    return "diesel";
  }

  if (normalized.includes("lpg")) {
    return "lpg";
  }

  if (normalized.includes("cng")) {
    return "cng";
  }

  if (
    normalized.includes("plug-in hybrid") ||
    normalized.includes("plug in hybrid") ||
    normalized.includes("phev")
  ) {
    return "phev";
  }

  if (normalized.includes("hybrid")) {
    return "hybrid";
  }

  if (normalized.includes("electric") || normalized.includes("bev")) {
    return "electric";
  }

  if (normalized.includes("hydrogen")) {
    return "hydrogen";
  }

  return undefined;
}

export function mapTransmissionType(
  value?: string,
): VinTransmissionType | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();

  if (
    normalized.includes("dual clutch") ||
    normalized.includes("dual-clutch") ||
    normalized.includes("dct") ||
    normalized.includes("dsg")
  ) {
    return "dct";
  }

  if (normalized.includes("cvt")) {
    return "cvt";
  }

  if (
    normalized.includes("single speed") ||
    normalized.includes("single-speed")
  ) {
    return "single-speed";
  }

  if (normalized.includes("automatic")) {
    return "automatic";
  }

  if (normalized.includes("manual")) {
    return "manual";
  }

  return "other";
}

export function mapDriveType(value?: string): VinDriveType | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");

  if (
    normalized === "fwd" ||
    normalized.includes("front-wheel") ||
    normalized.includes("frontwheel")
  ) {
    return "fwd";
  }

  if (
    normalized === "rwd" ||
    normalized.includes("rear-wheel") ||
    normalized.includes("rearwheel")
  ) {
    return "rwd";
  }

  if (
    normalized === "awd" ||
    normalized.includes("all-wheel") ||
    normalized.includes("allwheel")
  ) {
    return "awd";
  }

  if (
    normalized === "4wd" ||
    normalized === "4x4" ||
    normalized.includes("four-wheel") ||
    normalized.includes("fourwheel")
  ) {
    return "4wd";
  }

  return "other";
}
