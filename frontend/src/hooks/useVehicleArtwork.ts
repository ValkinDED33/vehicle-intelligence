import { useCallback, useSyncExternalStore } from "react";
import type { Vehicle, VehicleProfile, VinDecode } from "../api";
import { useAuth } from "../auth";
import { artworkEntry } from "../utils/vehicleArtworkStore";

export function useVehicleArtwork(vehicle: Vehicle | null, profile?: VehicleProfile | null, decode?: VinDecode | null) {
  const { user } = useAuth();
  const key = JSON.stringify([user?.id, vehicle?.id, vehicle?.updatedAt, vehicle?.vin, vehicle?.make, vehicle?.model, vehicle?.modelYear, profile?.id, profile?.exteriorColor, profile?.bodyType, profile?.doorCount, decode?.id]);
  const entry = user && vehicle ? artworkEntry(key, user.id, vehicle.id) : null;
  const subscribe = useCallback((listener: () => void) => entry?.activate(listener) ?? (() => {}), [entry]);
  const snapshot = useCallback(() => entry?.data ?? null, [entry]);
  return useSyncExternalStore(subscribe, snapshot, () => null);
}
