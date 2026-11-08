import type { Vehicle, VehicleProfile, VinDecode } from "../api";

export function profileDisplayFacts(vehicle: Vehicle | null, profile?: VehicleProfile | null, decode?: VinDecode | null) {
  const currentDecode = decode?.vin && decode.vin.toUpperCase() === vehicle?.vin?.toUpperCase()
    && (!decode.vehicleId || decode.vehicleId === vehicle?.id) ? decode : null;
  const currentProfile = profile?.vehicleId && profile.vehicleId !== vehicle?.id ? null : profile;
  return {
    fuelType: currentProfile?.fuelType ?? currentDecode?.fuelType ?? null,
    bodyType: currentProfile?.bodyType ?? currentDecode?.bodyType ?? null,
    exteriorColor: currentProfile?.exteriorColor ?? currentDecode?.exteriorColor ?? null,
  };
}
