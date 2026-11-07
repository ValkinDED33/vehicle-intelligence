import type { Vehicle, VehicleProfile, VinDecode } from "../api";

export function profileDisplayFacts(vehicle: Vehicle | null, profile?: VehicleProfile | null, decode?: VinDecode | null) {
  const currentDecode = decode?.vin && decode.vin.toUpperCase() === vehicle?.vin?.toUpperCase() ? decode : null;
  return {
    fuelType: profile?.fuelType ?? currentDecode?.fuelType ?? null,
    bodyType: profile?.bodyType ?? currentDecode?.bodyType ?? null,
    exteriorColor: profile?.exteriorColor ?? currentDecode?.exteriorColor ?? null,
  };
}
