export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

export function asRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => item !== null);
}

export function asString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : undefined;
}

export function asNumber(value: unknown): number | undefined {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.replace(/[^0-9eE.+-]/g, ""))
        : NaN;

  return Number.isFinite(numeric) ? numeric : undefined;
}

export function asInteger(value: unknown): number | undefined {
  const numeric = asNumber(value);

  if (numeric === undefined) {
    return undefined;
  }

  return Math.trunc(numeric);
}

/** Field lookup tolerant to case/spacing differences between providers. */
export function pick(
  record: Record<string, unknown>,
  ...keys: string[]
): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) {
      return record[key];
    }
  }

  const normalized = new Map(
    Object.keys(record).map((key) => [
      key.toLowerCase().replace(/[^a-z0-9]/g, ""),
      key,
    ]),
  );

  for (const key of keys) {
    const actual = normalized.get(key.toLowerCase().replace(/[^a-z0-9]/g, ""));

    if (actual !== undefined) {
      return record[actual];
    }
  }

  return undefined;
}

const DATE_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/;
const US_DATE_PATTERN = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/;

export function asDate(value: unknown): Date | undefined {
  const text = asString(value);

  if (!text) {
    return undefined;
  }

  const iso = DATE_PATTERN.exec(text);

  if (iso) {
    const date = new Date(text);

    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  const us = US_DATE_PATTERN.exec(text);

  if (us) {
    const [, month, day, year] = us;
    const date = new Date(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`);

    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  const fallback = new Date(text);

  return Number.isNaN(fallback.getTime()) ? undefined : fallback;
}

const DMY_PATTERN = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;

function buildDate(year: string, month: number, day: number): Date | undefined {
  const date = new Date(
    `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  );

  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Parses DD/MM/YYYY or DD-MM-YYYY (e.g. stolen-check "20/03/2026"). */
export function asDateDmy(value: unknown): Date | undefined {
  const text = asString(value);

  if (!text) {
    return undefined;
  }

  const match = DMY_PATTERN.exec(text);

  if (!match) {
    return undefined;
  }

  const [, day, month, year] = match;

  return buildDate(year, Number(month), Number(day));
}

/** Parses MM-DD-YYYY (e.g. auction "01-21-2020", title salvage_details). */
export function asDateMdy(value: unknown): Date | undefined {
  const text = asString(value);

  if (!text) {
    return undefined;
  }

  const match = DMY_PATTERN.exec(text);

  if (!match) {
    return undefined;
  }

  const [, month, day, year] = match;

  return buildDate(year, Number(month), Number(day));
}

/**
 * Slash dates whose element order differs between sources (recalls).
 * Only parsed when unambiguous — never guess month vs day.
 */
export function asAmbiguousSlashDate(value: unknown): Date | undefined {
  const text = asString(value);

  if (!text) {
    return undefined;
  }

  const match = DMY_PATTERN.exec(text);

  if (!match) {
    return asDate(text);
  }

  const [, first, second, year] = match;
  const a = Number(first);
  const b = Number(second);

  if (a > 12 && b >= 1 && b <= 12) {
    return buildDate(year, b, a);
  }

  if (b > 12 && a >= 1 && a <= 12) {
    return buildDate(year, a, b);
  }

  return undefined;
}

const SENTINELS = new Set(["n/a", "na", "none", "null", "-", "unknown"]);

/** String value with provider sentinels ("N/A" etc.) filtered out. */
export function asMeaningfulString(value: unknown): string | undefined {
  const text = asString(value);

  return text && !SENTINELS.has(text.toLowerCase()) ? text : undefined;
}

/** Parses money strings like "$8,398" / "12 500 USD"; sentinels → undefined. */
export function asMoney(value: unknown): number | undefined {
  const text = asMeaningfulString(value);

  if (!text) {
    return undefined;
  }

  const numeric = Number(
    text.replace(/[^0-9.,-]/g, "").replace(/,/g, ""),
  );

  return Number.isFinite(numeric) ? numeric : undefined;
}

const ODOMETER_KM_PATTERN = /\(([\d,]+(?:\.\d+)?)\s*km\)/i;
const ODOMETER_MI_PATTERN = /\(([\d,]+(?:\.\d+)?)\s*mi\)/i;

const KM_PER_MILE = 1.60934;

export function milesToKm(miles: number): number {
  return Math.round(miles * KM_PER_MILE);
}

/** Auction odometer strings like "Odometer (123,456 km)" → kilometers. */
export function parseOdometerKm(value: unknown): number | undefined {
  const text = asString(value);

  if (!text) {
    return undefined;
  }

  const km = ODOMETER_KM_PATTERN.exec(text);

  if (km) {
    const numeric = Number(km[1].replace(/,/g, ""));

    return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined;
  }

  const mi = ODOMETER_MI_PATTERN.exec(text);

  if (mi) {
    const numeric = Number(mi[1].replace(/,/g, ""));

    return Number.isFinite(numeric) && numeric > 0
      ? milesToKm(numeric)
      : undefined;
  }

  return undefined;
}

/** Stable short hash for idempotent eventIds when a source has no record ids. */
export function stableSuffix(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value) ?? "";

  let hash = 5381;

  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }

  return (hash >>> 0).toString(36);
}
