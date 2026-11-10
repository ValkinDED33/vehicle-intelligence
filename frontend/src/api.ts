import { t, getUiLocale, hasTranslation } from "./i18n";
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

export interface VinAccessStatus {
  state: "available" | "in_progress" | "used" | "uncertain";
  freeRemaining: 0 | 1;
  paidEnabled: false;
}
export const vinAccessApi = { status: () => request<VinAccessStatus>("/vin-access") };

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
    throw new ApiError(0, t("Сервер недоступний. Перевірте з’єднання."));
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
  if (body && typeof body === "object" && "code" in body) {
    const messages: Record<string, string> = {
      VIN_PROVIDER_AUTH_FAILED: "VIN-провайдер зараз недоступний. Безкоштовну перевірку не використано. Зверніться до підтримки.",
      VIN_TRIAL_USED: "Безкоштовну VIN-перевірку використано. Повторні перевірки закрито до підключення оплати.",
      VIN_CHECK_IN_PROGRESS: "VIN-перевірка вже триває. Дочекайтеся результату.",
      VIN_CHECK_UNCERTAIN: "Результат VIN-запиту не підтверджено. Повторні перевірки заблоковано. Зверніться до підтримки.",
      VIN_NO_DATA: "Джерело не має даних за цим VIN. Безкоштовну перевірку використано.",
    };
    const message = messages[String(body.code)];
    if (message) return t(message);
  }
  if (body && typeof body === "object" && "message" in body) {
    const message = (body as { message: unknown }).message;
    if (typeof message === "string") {
      if (/quota exhausted/i.test(message)) {
        return t("Ліміт запитів Vehicle Databases вичерпано. Перевірте квоту або дочекайтеся її оновлення.");
      }
      if (/api key is not configured/i.test(message)) {
        return t("VIN-провайдер не налаштований: додайте VIN_PROVIDER_API_KEY на Render.");
      }
      if (hasTranslation(message)) return t(message);
    }
  }
  if (status === 400) return t("Перевірте дані форми й спробуйте ще раз.");
  if (status === 401) return t("Увійдіть ще раз або перевірте email і пароль.");
  if (status === 403) return t("Доступ до цієї дії заборонено.");
  if (status === 404) return t("Запис не знайдено. Оновіть дані.");
  if (status === 409) return t("Дані конфліктують із наявним записом. Перевірте й спробуйте ще раз.");
  if (status === 429) return t("Забагато запитів. Спробуйте ще раз за хвилину.");
  if (status === 503) return t("Зовнішній провайдер тимчасово недоступний або квоту вичерпано.");
  return t("Помилка запиту ({0})", { 0: status });
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
  telegramLinked?: boolean;
  telegramUsername?: string | null;
}

export interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

export type UserLanguage = "uk" | "pl" | "en";

export interface RegisterInput {
  email: string;
  password: string;
  displayName?: string;
  country?: string;
  language?: UserLanguage;
}

export const authApi = {
  me: () => request<AuthUser>("/auth/me"),
  createTelegramLink: () => request<{ token: string; expiresAt: string }>("/auth/telegram/link", { method: "POST" }),
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
  telegram: (initData: string) =>
    request<AuthResponse>("/auth/telegram", {
      method: "POST",
      body: JSON.stringify({ initData }),
    }),
  updateProfile: (input: {
    displayName?: string;
    country?: string;
    language?: UserLanguage;
  }) =>
    request<AuthResponse>("/auth/me", {
      method: "PATCH",
      body: JSON.stringify(input),
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
  model?: string;
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

export interface VehicleArtworkResponse {
  vehicleId: string;
  state: "disabled" | "missing_details" | "available" | "generating" | "ready" | "failed" | "uncertain" | "limit";
  fingerprint: string | null;
  missing: string[];
  imageDataUrl?: string;
  facts?: { make: string; model: string; year: number; color: string; body: string; doors: number | null };
  framing?: { carCrop: number[]; robotCrop: number[] };
}
export const vehicleArtworkApi = {
  current: (id: string) => request<VehicleArtworkResponse>(`/vehicles/${id}/artwork`),
  ensure: (id: string, fingerprint: string) => request<VehicleArtworkResponse>(`/vehicles/${id}/artwork`, { method: "POST", body: JSON.stringify({ fingerprint }) }),
};

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
  maintenanceKeys?: string[];
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
  create: (vehicleId: string, input: { type: string; title: string; odometerKm?: number; occurredAt?: string; maintenanceKeys?: string[]; maintenancePlans?: Partial<MaintenanceRule>[] }) => request<{ record: ServiceRecord; items: ServiceRecordItem[] }>(`/vehicles/${vehicleId}/service-records`, { method: "POST", body: JSON.stringify(input) }),
  list: (vehicleId: string) =>
    request<ServiceRecord[]>(`/vehicles/${vehicleId}/service-records`),
  get: (vehicleId: string, recordId: string) =>
    request<{ record: ServiceRecord; items: ServiceRecordItem[] }>(
      `/vehicles/${vehicleId}/service-records/${recordId}`,
    ),
};

// ---------- documents ----------

export interface VehicleDocument {
  id: string;
  vehicleId: string;
  type: string;
  title: string;
  description: string | null;
  documentNumber: string | null;
  issuerName: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  storageProvider: string | null;
  storageBucket: string | null;
  storageKey: string | null;
  originalFileName: string | null;
  mimeType: string | null;
  fileSizeBytes: number | null;
  source: string;
  processingStatus: string;
  processingError: string | null;
  extractedText: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDocumentInput {
  reminder?: Pick<ReminderInput, "offsets" | "remindAt" | "timeZone">;
  type: string;
  title: string;
  description?: string;
  documentNumber?: string;
  issuerName?: string;
  issuedAt?: string;
  expiresAt?: string;
  source?: "manual" | "upload" | "telegram" | "email" | "integration" | "ocr" | "ai";
}

export interface DocumentField {
  id: string;
  fieldKey: string;
  fieldLabel: string | null;
  valueText: string | null;
  valueNumber: string | number | null;
  valueJson: unknown;
  confidence: string | number | null;
  source: string;
}
export interface DocumentDetails { document: VehicleDocument; fields: DocumentField[] }
export interface DocumentUploadTarget {
  bucket: string; key: string; uploadUrl: string; method: "PUT" | "POST"; headers?: Record<string,string>;
}

export const documentsApi = {
  confirmFields: (vehicleId: string, documentId: string, input: { expectedUpdatedAt: string; fields: { id: string; valueText: string }[] }) => request<DocumentDetails>(`/vehicles/${vehicleId}/documents/${documentId}/fields/confirm`, { method: "POST", body: JSON.stringify(input) }),
  get: (vehicleId: string, documentId: string) => request<DocumentDetails>(`/vehicles/${vehicleId}/documents/${documentId}`),
  uploadTarget: (vehicleId: string, documentId: string, file: File) => request<DocumentUploadTarget>(`/vehicles/${vehicleId}/documents/${documentId}/upload`, {
    method: "POST", body: JSON.stringify({ originalFileName: file.name, mimeType: file.type, fileSizeBytes: file.size }),
  }),
  confirmUpload: (vehicleId: string, documentId: string, target: DocumentUploadTarget, originalFileName: string) => request(`/vehicles/${vehicleId}/documents/${documentId}/confirm`, {
    method: "POST", body: JSON.stringify({ bucket: target.bucket, key: target.key, originalFileName }),
  }),
  process: (vehicleId: string, documentId: string) => request<DocumentDetails>(`/vehicles/${vehicleId}/documents/${documentId}/process`, { method: "POST" }),
  download: (vehicleId: string, documentId: string) => request<{ downloadUrl: string }>(`/vehicles/${vehicleId}/documents/${documentId}/download`),
  list: (vehicleId: string) =>
    request<VehicleDocument[]>(`/vehicles/${vehicleId}/documents`),
  create: (vehicleId: string, input: CreateDocumentInput) =>
    request<{ document: VehicleDocument; fields: unknown[] }>(
      `/vehicles/${vehicleId}/documents`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    ),
  remove: (vehicleId: string, documentId: string) =>
    request<{ id: string; deleted: true; objectDeleted: boolean }>(
      `/vehicles/${vehicleId}/documents/${documentId}`,
      { method: "DELETE" },
    ),
};

// ---------- maintenance ----------

export interface MaintenanceRule {
  telegramEnabled?: boolean;
  notifyWhenDue?: boolean;
  reminderOffsets?: ReminderOffset[];
  remindAt?: string;
  timeZone?: string;
  id: string;
  vehicleId?: string;
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
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
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
  updateRule: (vehicleId: string, id: string, input: Partial<MaintenanceRule>) => request<MaintenanceRule>(`/vehicles/${vehicleId}/maintenance/rules/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  rules: (vehicleId: string) =>
    request<MaintenanceRule[]>(`/vehicles/${vehicleId}/maintenance/rules`),
  createRule: (vehicleId: string, input: Partial<MaintenanceRule>) =>
    request<MaintenanceRule>(`/vehicles/${vehicleId}/maintenance/rules`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  deleteRule: (vehicleId: string, ruleId: string) =>
    request<MaintenanceRule>(`/vehicles/${vehicleId}/maintenance/rules/${ruleId}`, {
      method: "DELETE",
    }),
  status: (vehicleId: string) =>
    request<MaintenanceStatus[]>(`/vehicles/${vehicleId}/maintenance/status`),
};

// ---------- VIN ----------

export interface VinDecode {
  bodyType?: string;
  exteriorColor?: string;
  status?: string;
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
  savedChecks: () => request<StandaloneVinCheck[]>("/vin/checks"),
  decode: (vehicleId: string) =>
    request<VinDecode>(`/vehicles/${vehicleId}/vin/decode`, { method: "POST" }),
  latest: (vehicleId: string) =>
    request<VinDecode | null>(`/vehicles/${vehicleId}/vin/latest`),
};

// ---------- external reports ----------

export interface StandaloneVinCheck {
  id: string;
  vin: string;
  status: string;
  createdAt: string;
  result: { provider: string; make?: string; model?: string; modelYear?: number; engineCode?: string; fuelType?: string; transmissionType?: string; driveType?: string; rawPayload?: Record<string, unknown> };
}

export interface ReportSource {
  key: string;
  apiName: string;
  input: "vin" | "ymm" | "ymmt" | "plate" | "image" | "registry";
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
  fetchCepikVehicles: (
    vehicleId: string,
    input: {
      wojewodztwo: string;
      dataOd: string;
      dataDo?: string;
      typDaty?: "1" | "2";
      tylkoZarejestrowane?: boolean;
      limit?: string;
      page?: string;
    },
  ) =>
    request<{ report: ExternalReport; normalization: unknown }>(
      `/vehicles/${vehicleId}/external-reports/cepik/vehicles${qs(input)}`,
      { method: "POST" },
    ),
  fetchCepikVehicleById: (vehicleId: string, cepikId: string) =>
    request<{ report: ExternalReport; normalization: unknown }>(
      `/vehicles/${vehicleId}/external-reports/cepik/vehicles/${encodeURIComponent(cepikId)}`,
      { method: "POST" },
    ),
  cepikDictionaries: (vehicleId: string) =>
    request<unknown>(`/vehicles/${vehicleId}/external-reports/cepik/dictionaries`),
  cepikDictionary: (vehicleId: string, name: string) =>
    request<unknown>(
      `/vehicles/${vehicleId}/external-reports/cepik/dictionaries/${encodeURIComponent(name)}`,
    ),
  fetchOneAutoSource: (vehicleId: string, source: string) =>
    request<{ report: ExternalReport; normalization: unknown }>(
      `/vehicles/${vehicleId}/external-reports/oneauto/sources/${source}`,
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
  history: AssistantHistory;
}

export interface AssistantHistoryMessage {
  id: string; role: "user" | "assistant"; content: string; channel: "web" | "telegram"; createdAt: string;
}
export interface AssistantHistory { messages: AssistantHistoryMessage[]; epoch: number; expiresAt: string }
export interface AssistantPreferences {
  detailLevel: "concise" | "detailed";
  priority: "balanced" | "reliability" | "economy";
  drivingPattern: "unspecified" | "city" | "highway" | "mixed";
  revision: number;
}

export const assistantApi = {
  preferences: () => request<AssistantPreferences>("/assistant/preferences"),
  savePreferences: (input: Omit<AssistantPreferences,"revision"> & {expectedRevision:number}) => request<AssistantPreferences>("/assistant/preferences", {method:"PATCH",body:JSON.stringify(input)}),
  history: (vehicleId: string | null, language: UserLanguage) => request<AssistantHistory>(`/assistant/history${qs({vehicleId:vehicleId??undefined,language})}`),
  clearHistory: (vehicleId: string | null, language: UserLanguage) => request<AssistantHistory>(`/assistant/history${qs({vehicleId:vehicleId??undefined,language})}`, {method:"DELETE"}),
  chat: (input: { message: string; vehicleId?: string; language?: UserLanguage; expectedMemoryEpoch: number }) =>
    request<AssistantChatResponse>("/assistant/chat", {
      method: "POST",
      body: JSON.stringify(input),
    }),
};

// ---------- helpers ----------

export interface ReminderOffset { amount: number; unit: "days" | "weeks" | "months" }
export interface ReminderInput { title: string; dueDate: string; remindAt: string; timeZone: string; offsets: ReminderOffset[] }
export interface ScheduledReminder extends ReminderInput {
  documentId?: string | null; maintenanceRuleId?: string | null; sourcePhase?: string | null; targetOdometerKm?: number | null; serviceDueDate?: string | null;
  id: string; status: string; revision: number;
  deliveries: { id: string; scheduledAt: string; status: string; sentAt: string | null; lastError: string | null }[];
}
export interface RemindersResponse { telegramLinked: boolean; deliveryEnabled: boolean; reminders: ScheduledReminder[] }
export const remindersApi = {
  list: (vehicleId: string) => request<RemindersResponse>(`/vehicles/${vehicleId}/reminders`),
  preview: (vehicleId: string, input: ReminderInput) => request<ReminderInput & { scheduledAt: string[] }>(`/vehicles/${vehicleId}/reminders/preview`, { method: "POST", body: JSON.stringify(input) }),
  save: (vehicleId: string, input: ReminderInput, editing?: { id: string; revision: number }) => request(`/vehicles/${vehicleId}/reminders${editing ? `/${editing.id}` : ""}`, { method: editing ? "PATCH" : "POST", body: JSON.stringify({ ...input, ...(editing ? { expectedRevision: editing.revision } : {}) }) }),
  status: (vehicleId: string, reminder: { id: string; revision: number }, status: "completed" | "cancelled") => request(`/vehicles/${vehicleId}/reminders/${reminder.id}/status`, { method: "PATCH", body: JSON.stringify({ status, expectedRevision: reminder.revision }) }),
};

export function num(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function fmtNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString(getUiLocale(), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtMoney(value: string | number | null | undefined, currency?: string | null): string {
  const parsed = num(value);
  if (parsed === null) return "—";
  const formatted = parsed.toLocaleString(getUiLocale(), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency ? `${formatted} ${currency}` : formatted;
}

export function fmtDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(getUiLocale(), {
    day: "numeric", month: "long", year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } as const : {}),
  }).format(date);
}

export function fmtShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(getUiLocale(), { day: "numeric", month: "short" }).format(date);
}
