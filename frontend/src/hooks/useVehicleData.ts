import { useCallback, useEffect, useRef, useState } from "react";
import {
  energyApi,
  expensesApi,
  historyApi,
  maintenanceApi,
  mileageApi,
  profileApi,
  serviceRecordsApi,
  vinApi,
  vinAccessApi,
  type VinAccessStatus,
  remindersApi,
  type RemindersResponse,
  type AnomalyReport,
  type EnergyEntry,
  type EnergyMonthlySummary,
  type Expense,
  type ExpenseMonthlySummary,
  type FullToFull,
  type HistoryEvent,
  type MaintenanceStatus,
  type MileageReading,
  type ServiceRecord,
  type VehicleProfile,
  type VinDecode,
} from "../api";
import type { VehicleData } from "../types/dashboard";

export const EMPTY_DATA: VehicleData = {
  vinAccess: null,
  reminders: null,
  errors: [],
  latest: null,
  mileageHistory: [],
  anomalies: null,
  monthExpenses: null,
  expenses: [],
  fullToFull: null,
  energy: [],
  energyMonth: null,
  maintenance: [],
  events: [],
  profile: null,
  vinDecode: null,
  services: [],
  loading: false,
  failed: false,
};

export function useVehicleData(vehicleId: string | null) {
  const [loaded, setLoaded] = useState<{ vehicleId: string | null; data: VehicleData }>({ vehicleId: null, data: EMPTY_DATA });
  const currentVehicle = useRef(vehicleId);
  const generation = useRef(0);
  currentVehicle.current = vehicleId;

  const refresh = useCallback(async () => {
    if (currentVehicle.current !== vehicleId) return;
    const requestId = ++generation.current;
    if (!vehicleId) {
      setLoaded({ vehicleId, data: EMPTY_DATA });
      return;
    }
    setLoaded(prev => ({ vehicleId, data: { ...(prev.vehicleId === vehicleId ? prev.data : EMPTY_DATA), loading: true, failed: false } }));
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const settled = await Promise.allSettled([
      mileageApi.latest(vehicleId),
      mileageApi.history(vehicleId, { limit: 60 }),
      mileageApi.anomalies(vehicleId),
      expensesApi.monthlySummary(vehicleId, year, month),
      expensesApi.list(vehicleId, { limit: 30 }),
      energyApi.fullToFull(vehicleId),
      energyApi.list(vehicleId, { limit: 30 }),
      energyApi.monthlySummary(vehicleId, year, month),
      maintenanceApi.status(vehicleId),
      historyApi.list(vehicleId, { limit: 16 }),
      profileApi.current(vehicleId),
      vinApi.latest(vehicleId),
      serviceRecordsApi.list(vehicleId),
      remindersApi.list(vehicleId),
      vinAccessApi.status(),
    ]);
    if (currentVehicle.current !== vehicleId || requestId !== generation.current) return;

    const pick = <T>(i: number, fallback: T): T =>
      settled[i].status === "fulfilled"
        ? (settled[i] as PromiseFulfilledResult<T>).value
        : fallback;

    const history = pick<MileageReading[]>(1, []);
    const names = ["mileage", "mileageHistory", "anomalies", "monthExpenses", "expenses", "fullToFull", "energy", "energyMonth", "maintenance", "events", "profile", "vinDecode", "services", "reminders"];
    names.push("vinAccess");
    const errors = names.filter((_, index) => settled[index].status === "rejected");

    setLoaded({ vehicleId, data: {
      vinAccess: pick<VinAccessStatus | null>(14, null),
      reminders: pick<RemindersResponse | null>(13, null),
      errors,
      latest: pick<MileageReading | null>(0, null),
      mileageHistory: [...history].sort(
        (a, b) =>
          new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime(),
      ),
      anomalies: pick<AnomalyReport | null>(2, null),
      monthExpenses: pick<ExpenseMonthlySummary | null>(3, null),
      expenses: pick<Expense[]>(4, []),
      fullToFull: pick<FullToFull | null>(5, null),
      energy: pick<EnergyEntry[]>(6, []),
      energyMonth: pick<EnergyMonthlySummary | null>(7, null),
      maintenance: pick<MaintenanceStatus[]>(8, []),
      events: pick<HistoryEvent[]>(9, []),
      profile: pick<VehicleProfile | null>(10, null),
      vinDecode: pick<VinDecode | null>(11, null),
      services: pick<ServiceRecord[]>(12, []),
      loading: false,
      failed: errors.length === names.length,
    } });
  }, [vehicleId]);

  useEffect(() => {
    void refresh();
    const onFocus=()=>void refresh();
    window.addEventListener('focus',onFocus);
    return () => { generation.current++; window.removeEventListener('focus',onFocus); };
  }, [refresh]);

  const data = loaded.vehicleId === vehicleId ? loaded.data : { ...EMPTY_DATA, loading: !!vehicleId };
  return { data, refresh };
}
