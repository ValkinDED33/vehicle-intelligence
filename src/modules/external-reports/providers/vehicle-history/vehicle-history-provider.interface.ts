export const VEHICLE_HISTORY_PROVIDER_TOKEN =
  "VEHICLE_HISTORY_PROVIDER_TOKEN";

export interface VehicleHistoryProviderResult {
  provider: string;
  vin: string;
  rawPayload: Record<string, unknown>;
}

export interface VehicleHistoryProvider {
  getHistory(vin: string): Promise<VehicleHistoryProviderResult>;
}
