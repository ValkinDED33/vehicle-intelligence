export type UnknownRecord = Record<string, unknown>;

export interface VehicleDatabasesResponse {
  status?: string;
  data?: UnknownRecord;
  error?: unknown;
  message?: unknown;
}
