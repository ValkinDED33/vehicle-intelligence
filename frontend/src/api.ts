// Typed client for the vehicle-intelligence backend.
// Shapes mirror the NestJS controllers/DTOs exactly — money fields on raw rows
// arrive as STRINGS (Drizzle numeric), while summary/calculated fields are numbers.

const RENDER_API = "https://vehicle-intelligence-o9mi.onrender.com";

function resolveApiBase(): string {
  const fromEnv = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");

  const host = window.location.hostname;
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "";
  return isLocal ? "" : RENDER_API;
}

export const API_BASE = resolveApiBase();

const TOKEN_KEY = "cara.token";
const USER_KEY = "cara.user";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function saveSession(token: string, user: AuthUser): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function loadStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };

  if (init?.body !== undefined && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, "Сервер недоступен. Проверьте соединение.");
  }

  if (response.status === 401 && token) {
    clearSession();
    window.dispatchEvent(new Event("cara:unauthorized"));
  }

  const text = await response.text();
  const body: unknown = text ? safeJsonParse(text) : null;

  if (!response.ok) {
    throw new ApiError(response.status, extractMessage(body, response.status));
  }

  return body as T;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractMessage(body: unknown, status: number): string {
  if (body && typeof body === "object" && "message" in body) {
    const message = (body as { message: unknown }).message;
    if (typeof message === "string") {
      if (/quota exhausted/i.test(message)) {
        return "Лимит запросов Vehicle Databases исчерпан. Проверьте квоту или дождитесь её обновления.";
      }
      if (/api key is not configured/i.test(message)) {
        return "VIN-провайдер не настроен: добавьте VIN_PROVIDER_API_KEY на Render.";
      }
      return message;
    }
    if (Array.isArray(message)) return message.join("; ");
  }
  if (status === 503) return "Внешний провайдер временно недоступен или исчерпана квота.";
  return `Ошибка запроса (${status})`;
}

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

// ---------- auth ----------

export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  country: string | null;
  language: string | null;
}

export interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

export interface RegisterInput {
  email: string;
  password: string;
  displayName?: string;
  country?: string;
  language?: "ru" | "uk" | "pl" | "en";
}

export const authApi = {
  register: (input: RegisterInput) =>
    request<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  login: (email: string, password: string) =>
    request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
};

// ---------- garage ----------

export interface Vehicle {
  id: string;
  ownerId: string;
  vin: string | null;
  nickname: string | null;
  make: string | null;
  model: string | null;
  modelYear: string | null;
  licensePlate: string | null;
  country: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVehicleInput {
  vin?: string;
  nickname?: string;
  make?: string;
  modelYear?: string;
  licensePlate?: string;
  country?: string;
}

export const garageApi = {
  list: (includeArchived = false) =>
    request<Vehicle[]>(`/garage/vehicles${qs({ includeArchived: includeArchived || undefined })}`),
  get: (id: string) => request<Vehicle>(`/garage/vehicles/${id}`),
  create: (input: CreateVehicleInput) =>
    request<Vehicle>("/garage/vehicles", { method: "POST", body: JSON.stringify(input) }),
  update: (id: string, input: Partial<CreateVehicleInput>) =>
    request<Vehicle>(`/garage/vehicles/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  archive: (id: string) =>
    request<Vehicle>(`/garage/vehicles/${id}/archive`, { method: "PATCH" }),
  restore: (id: string) =>
    request<Vehicle>(`/garage/vehicles/${id}/restore`, { method: "PATCH" }),
};

// ---------- vehicle profile ----------

export interface VehicleProfile {
  id: string;
  vehicleId: string;
  version: number;
  isCurrent: boolean;
  source: string;
  engineCode: string | null;
  engineFamily: string | null;
  displacementCc: number | null;
  fuelType: string | null;
  aspirationType: string | null;
  powerKw: number | null;
  powerHp: number | null;
  transmissionType: string | null;
  transmissionCode: string | null;
  driveType: string | null;
  bodyType: string | null;
  doorCount: number | null;
  seatCount: number | null;
  trimLevel: string | null;
  exteriorColor: string | null;
  fuelTankCapacityLiters: number | null;
  adBlueTankCapacityLiters: number | null;
  batteryGrossCapacityKwh: number | null;
  batteryUsableCapacityKwh: number | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const profileApi = {
  current: (vehicleId: string) =>
    request<VehicleProfile | null>(`/vehicles/${vehicleId}/profile/current`),
  history: (vehicleId: string) =>
    request<VehicleProfile[]>(`/vehicles/${vehicleId}/profile/history`),
  create: (vehicleId: string, input: Partial<VehicleProfile>) =>
    request<VehicleProfile>(`/vehicles/${vehicleId}/profile`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
};

// ---------- mileage ----------

export interface MileageReading {
  id: string;
  vehicleId: string;
  odometerKm: number;
  engineHours: number | null;
  source: string;
  confidence: number;
  recordedAt: string;
  createdAt: string;
}

export interface MileageAnomaly {
  type: "rollback" | "implausible_jump";
  severity: "warning" | "critical";
  occurredAt: string;
  fromReadingId: string;
  toReadingId: string;
  fromRecordedAt: string;
  toRecordedAt: string;
  fromOdometerKm: number;
  toOdometerKm: number;
  deltaKm: number;
  daysBetween: number;
  avgKmPerDay: number;
  fromSource: string;
  toSource: string;
  message: string;
}

export interface AnomalyReport {
  vehicleId: string;
  readingsAnalyzed: number;
  anomalies: MileageAnomaly[];
}

export interface CreateMileageInput {
  odometerKm: number;
  engineHours?: number;
  source?: "manual" | "web" | "telegram" | "obd" | "document" | "service" | "system";
  confidence?: number;
  recordedAt?: string;
}

export const mileageApi = {
  create: (vehicleId: string, input: CreateMileageInput) =>
    request<MileageReading>(`/vehicles/${vehicleId}/mileage`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  latest: (vehicleId: string) =>
    request<MileageReading | null>(`/vehicles/${vehicleId}/mileage/latest`),
  history: (
    vehicleId: string,
    params: { from?: string; to?: string; limit?: number; offset?: number } = {},
  ) => request<MileageReading[]>(`/vehicles/${vehicleId}/mileage/history${qs(params)}`),
  stale: (vehicleId: string) =>
    request<boolean>(`/vehicles/${vehicleId}/mileage/stale`),
  anomalies: (vehicleId: string) =>
    request<AnomalyReport>(`/vehicles/${vehicleId}/mileage/anomalies`),
};

// ---------- history events ----------

export interface HistoryEvent {
  id: string;
  vehicleId: string;
  eventId: string;
  type: string;
  sourceModule: string;
  origin: string;
  mileageKm: number | null;
  confidence: number | null;
  payload: unknown;
  attachments: unknown;
  occurredAt: string;
  createdAt: string;
}

export const historyApi = {
  list: (
    vehicleId: string,
    params: { type?: string; from?: string; to?: string; limit?: number; offset?: number } = {},
  ) => request<HistoryEvent[]>(`/vehicles/${vehicleId}/history${qs(params)}`),
  latest: (vehicleId: string) =>
    request<HistoryEvent | null>(`/vehicles/${vehicleId}/history/latest`),
};

// ---------- expenses ----------

export interface Expense {
  id: string;
  vehicleId: string;
  category: string;
  subcategory: string | null;
  title: string;
  description: string | null;
  subtotalCost: string | null;
  discountPercent: string | null;
  discountAmount: string | null;
  discountLabel: string | null;
  totalCost: string;
  currency: string;
  odometerKm: number | null;
  providerName: string | null;
  documentNumber: string | null;
  source: string;
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseCalculations {
  subtotalCost: number;
  discountPercent: number;
  discountAmount: number;
  totalCost: number;
  savings: number;
}

export interface MonthlyCategoryTotal {
  category: string;
  totalCost: number;
}

export interface MonthlyCurrencySummary {
  currency: string;
  expenseCost: number;
  energyCost: number;
  totalCost: number;
  expenseDiscountSavings: number;
  energyDiscountSavings: number;
  totalDiscountSavings: number;
  categories: MonthlyCategoryTotal[];
  costPerKm: number | null;
  costPer100Km: number | null;
}

export interface ExpenseMonthlySummary {
  year: number;
  month: number;
  distanceKm: number | null;
  currencies: MonthlyCurrencySummary[];
  message?: string | null;
}

export interface CreateExpenseInput {
  category: string;
  title: string;
  currency: string;
  totalCost?: number;
  subtotalCost?: number;
  discountPercent?: number;
  description?: string;
  odometerKm?: number;
  providerName?: string;
  occurredAt?: string;
}

export const expensesApi = {
  create: (vehicleId: string, input: CreateExpenseInput) =>
    request<{ expense: Expense; calculations: ExpenseCalculations }>(
      `/vehicles/${vehicleId}/expenses`,
      { method: "POST", body: JSON.stringify(input) },
    ),
  list: (
    vehicleId: string,
    params: { from?: string; to?: string; category?: string; limit?: number; offset?: number } = {},
  ) => request<Expense[]>(`/vehicles/${vehicleId}/expenses${qs(params)}`),
  monthlySummary: (vehicleId: string, year: number, month: number) =>
    request<ExpenseMonthlySummary>(
      `/vehicles/${vehicleId}/expenses/monthly-summary${qs({ year, month })}`,
    ),
};

// ---------- energy ----------

export interface EnergyEntry {
  id: string;
  vehicleId: string;
  kind: "fuel" | "charge";
  energyType: string;
  volumeLiters: string | null;
  energyKwh: string | null;
  unitPrice: string | null;
  subtotalCost: string | null;
  discountPercent: string | null;
  discountAmount: string | null;
  discountLabel: string | null;
  totalCost: string | null;
  currency: string | null;
  odometerKm: number | null;
  isFullTank: boolean;
  providerName: string | null;
  source: string;
  occurredAt: string;
  createdAt: string;
}

export interface FullToFull {
  fromEntryId: string;
  toEntryId: string;
  fromOdometerKm: number;
  toOdometerKm: number;
  distanceKm: number;
  fuelAddedLiters: number;
  consumptionLitersPer100Km: number;
  totalCost: number;
  costPer100Km: number | null;
  costPerKm: number | null;
  currency: string | null;
  tankCapacityLiters: number | null;
  tankRefillPercent: number | null;
}

export interface EnergyMonthlySummary {
  year: number;
  month: number;
  entriesCount: number;
  fuelLiters: number;
  energyKwh: number;
  fullTankRefuels: number;
  money: { currency: string; subtotalCost: number; discountAmount: number; totalCost: number }[];
  odometerDistanceKm: number | null;
  averageFuelConsumptionLitersPer100Km: number | null;
  averageEnergyConsumptionKwhPer100Km: number | null;
  tankCapacityLiters: number | null;
  message?: string | null;
}

export interface CreateEnergyInput {
  kind: "fuel" | "charge";
  energyType: string;
  volumeLiters?: number;
  energyKwh?: number;
  unitPrice?: number;
  totalCost?: number;
  currency?: string;
  odometerKm?: number;
  isFullTank?: boolean;
  providerName?: string;
  occurredAt?: string;
}

export const energyApi = {
  create: (vehicleId: string, input: CreateEnergyInput) =>
    request<{ entry: EnergyEntry; calculations: unknown }>(`/vehicles/${vehicleId}/energy`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  list: (
    vehicleId: string,
    params: { from?: string; to?: string; energyType?: string; kind?: string; limit?: number; offset?: number } = {},
  ) => request<EnergyEntry[]>(`/vehicles/${vehicleId}/energy${qs(params)}`),
  latest: (vehicleId: string) =>
    request<EnergyEntry | null>(`/vehicles/${vehicleId}/energy/latest`),
  fullToFull: (vehicleId: string) =>
    request<FullToFull | null>(`/vehicles/${vehicleId}/energy/full-to-full`),
  monthlySummary: (vehicleId: string, year: number, month: number) =>
    request<EnergyMonthlySummary>(
      `/vehicles/${vehicleId}/energy/monthly-summary${qs({ year, month })}`,
    ),
};

// ---------- service records ----------

export interface ServiceRecord {
  id: string;
  vehicleId: string;
  expenseId: string | null;
  type: string;
  title: string;
  description: string | null;
  odometerKm: number | null;
  engineHours: string | null;
  providerName: string | null;
  documentNumber: string | null;
  totalCost: string | null;
  currency: string | null;
  source: string;
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceRecordItem {
  id: string;
  serviceRecordId: string;
  itemType: string;
  name: string;
  description: string | null;
  brand: string | null;
  partNumber: string | null;
  quantity: string | null;
  unit: string | null;
  unitCost: string | null;
  totalCost: string | null;
  currency: string | null;
  warrantyMonths: number | null;
  warrantyKm: number | null;
}

export const serviceRecordsApi = {
  list: (vehicleId: string) =>
    request<ServiceRecord[]>(`/vehicles/${vehicleId}/service-records`),
  get: (vehicleId: string, recordId: string) =>
    request<{ record: ServiceRecord; items: ServiceRecordItem[] }>(
      `/vehicles/${vehicleId}/service-records/${recordId}`,
    ),
};

// ---------- maintenance ----------

export interface MaintenanceRule {
  id: string;
  key: string;
  title: string;
  completionEventType: string;
  source?: string | null;
  intervalKm?: number | null;
  intervalMonths?: number | null;
  intervalEngineHours?: number | null;
  warningKmBefore?: number | null;
  warningDaysBefore?: number | null;
  warningEngineHoursBefore?: number | null;
}

export interface MaintenanceStatus {
  rule: MaintenanceRule;
  urgency: "normal" | "attention" | "check_soon" | "stop";
  lastCompletedAt: string | null;
  lastCompletedMileageKm: number | null;
  lastCompletedEngineHours: number | null;
  currentMileageKm: number | null;
  currentEngineHours: number | null;
  kmSinceService: number | null;
  monthsSinceService: number | null;
  engineHoursSinceService: number | null;
  kmRemaining: number | null;
  daysRemaining: number | null;
  engineHoursRemaining: number | null;
}

export const maintenanceApi = {
  rules: (vehicleId: string) =>
    request<MaintenanceRule[]>(`/vehicles/${vehicleId}/maintenance/rules`),
  status: (vehicleId: string) =>
    request<MaintenanceStatus[]>(`/vehicles/${vehicleId}/maintenance/status`),
};

// ---------- VIN ----------

export interface VinDecode {
  id?: string;
  vehicleId?: string;
  provider?: string;
  vin: string;
  make?: string | null;
  model?: string | null;
  modelYear?: number | null;
  engineCode?: string | null;
  engineFamily?: string | null;
  displacementCc?: number | null;
  fuelType?: string | null;
  powerKw?: number | null;
  powerHp?: number | null;
  transmissionType?: string | null;
  driveType?: string | null;
  rawPayload?: unknown;
  decodedAt?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export const vinApi = {
  decode: (vehicleId: string) =>
    request<VinDecode>(`/vehicles/${vehicleId}/vin/decode`, { method: "POST" }),
  latest: (vehicleId: string) =>
    request<VinDecode | null>(`/vehicles/${vehicleId}/vin/latest`),
};

// ---------- external reports ----------

export interface ReportSource {
  key: string;
  apiName: string;
  input: "vin" | "ymm" | "ymmt" | "plate" | "image";
  fetchableByVehicleVin: boolean;
  note?: string;
}

export interface SourceFetchSummary {
  source: string;
  status: string;
  reportId?: string;
  normalization?: unknown;
  error?: string;
}

export interface ExternalReport {
  id: string;
  vehicleId: string;
  provider: string;
  reportType: string;
  vin: string | null;
  status: string;
  rawPayload: unknown;
  fetchedAt: string;
  createdAt: string;
}

export const externalReportsApi = {
  sources: (vehicleId: string) =>
    request<ReportSource[]>(`/vehicles/${vehicleId}/external-reports/sources`),
  fetchAll: (vehicleId: string) =>
    request<SourceFetchSummary[]>(`/vehicles/${vehicleId}/external-reports/sources`, {
      method: "POST",
    }),
  fetchSource: (vehicleId: string, source: string) =>
    request<{ report: ExternalReport; normalization: unknown }>(
      `/vehicles/${vehicleId}/external-reports/sources/${source}`,
      { method: "POST" },
    ),
  list: (vehicleId: string, type?: string) =>
    request<ExternalReport[]>(
      `/vehicles/${vehicleId}/external-reports${qs({ type })}`,
    ),
};

// ---------- assistant ----------

export interface AssistantChatResponse {
  answer: string;
  provider: string;
  model: string;
}

export const assistantApi = {
  chat: (input: { message: string; vehicleId?: string }) =>
    request<AssistantChatResponse>("/assistant/chat", {
      method: "POST",
      body: JSON.stringify(input),
    }),
};

// ---------- helpers ----------

export function num(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function fmtNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString("ru-RU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtMoney(value: string | number | null | undefined, currency?: string | null): string {
  const parsed = num(value);
  if (parsed === null) return "—";
  const formatted = parsed.toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency ? `${formatted} ${currency}` : formatted;
}

const MONTHS_RU = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

export function fmtDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const day = `${date.getDate()} ${MONTHS_RU[date.getMonth()]} ${date.getFullYear()}`;
  if (!withTime) return day;
  const time = date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return `${day}, ${time}`;
}

export function fmtShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.getDate()} ${MONTHS_RU[date.getMonth()].slice(0, 3)}`;
}
