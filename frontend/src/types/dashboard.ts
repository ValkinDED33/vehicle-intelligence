import type {
  AnomalyReport,
  EnergyEntry,
  EnergyMonthlySummary,
  Expense,
  ExpenseMonthlySummary,
  FullToFull,
  HistoryEvent,
  MaintenanceStatus,
  MileageReading,
  ServiceRecord,
  Vehicle,
  VehicleProfile,
} from "../api";

export interface VehicleData {
  latest: MileageReading | null;
  mileageHistory: MileageReading[];
  anomalies: AnomalyReport | null;
  monthExpenses: ExpenseMonthlySummary | null;
  expenses: Expense[];
  fullToFull: FullToFull | null;
  energy: EnergyEntry[];
  energyMonth: EnergyMonthlySummary | null;
  maintenance: MaintenanceStatus[];
  events: HistoryEvent[];
  profile: VehicleProfile | null;
  services: ServiceRecord[];
  loading: boolean;
  failed: boolean;
}

export interface PageProps {
  vehicle: Vehicle | null;
  vehicles: Vehicle[];
  data: VehicleData;
  refresh: () => Promise<void>;
  navigate: (n: string, sound?: "tick" | "chime") => void;
  selectVehicle: (id: string) => void;
  loadVehicles: () => Promise<void>;
  afterMutate: () => Promise<void>;
  openAi: () => void;
  vehiclesLoading: boolean;
  vehiclesError: string | null;
  userName: string;
  logout: () => void;
}

export interface Sparkline {
  line: string;
  area: string;
  lastX: number;
  lastY: number;
  minLabel: string;
  maxLabel: string;
  firstLabel: string;
  lastLabel: string;
}
