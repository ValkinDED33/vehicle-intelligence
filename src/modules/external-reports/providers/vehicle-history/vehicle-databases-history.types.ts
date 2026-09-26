export type UnknownRecord = Record<string, unknown>;

export interface VehicleDatabasesHistoryResponse {
  status?: string;
  vin?: string;
  data?: UnknownRecord;
  error?: unknown;
  message?: unknown;
}
