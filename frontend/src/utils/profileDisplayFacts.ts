import type { ExternalReport, FuelTypeProvenance, Vehicle, VehicleProfile, VinDecode } from "../api";

export function profileDisplayFacts(vehicle: Vehicle | null, profile?: VehicleProfile | null, decode?: VinDecode | null) {
  const currentDecode = decode?.vin && decode.vin.toUpperCase() === vehicle?.vin?.toUpperCase()
    && (!decode.vehicleId || decode.vehicleId === vehicle?.id) ? decode : null;
  const currentProfile = profile?.vehicleId && profile.vehicleId !== vehicle?.id ? null : profile;
  const fuelType = currentProfile?.fuelType ?? currentDecode?.fuelType ?? null;
  const ownerConfirmed = currentProfile?.source === "manual" || currentProfile?.source === "manual-confirmed";
  const provenance: FuelTypeProvenance | null = currentProfile?.fuelType
    ? currentProfile.fuelTypeProvenance ?? {
      source: currentProfile.source, ownerConfirmed,
      confirmedAt: ownerConfirmed ? currentProfile.confirmedAt : null, conflicts: [],
    }
    : currentDecode?.fuelType ? {
      source: `vin:${currentDecode.provider}`, ownerConfirmed: false, confirmedAt: null, conflicts: [],
    } : null;
  const conflicts = [...(provenance?.conflicts ?? [])];
  if (currentDecode?.fuelType && currentDecode.fuelType !== fuelType && !conflicts.some(
    conflict => conflict.value === currentDecode.fuelType && conflict.source === `vin:${currentDecode.provider}`,
  )) conflicts.push({ value: currentDecode.fuelType, source: `vin:${currentDecode.provider}` });
  return {
    fuelType,
    fuelTypeProvenance: provenance ? { ...provenance, conflicts } : null,
    bodyType: currentProfile?.bodyType ?? currentDecode?.bodyType ?? null,
    exteriorColor: currentProfile?.exteriorColor ?? currentDecode?.exteriorColor ?? null,
  };
}

export function reportFuelDisplayFacts(vehicle: Vehicle, profile: VehicleProfile | null, report: ExternalReport) {
  const facts = profileDisplayFacts(vehicle, profile);
  const provenance = facts.fuelTypeProvenance;
  if (!provenance) return facts;
  const matching = report.status === "success" && report.vehicleId === vehicle.id
    && Boolean(report.vin && vehicle.vin && report.vin.trim().toUpperCase() === vehicle.vin.trim().toUpperCase());
  const source = report.provider === "vehicle-databases"
    ? `vdb:${report.reportType}`.slice(0, 32) : `report:${report.provider}:${report.reportType}`;
  const values = matching ? reportFuelValues(report.rawPayload) : [];
  // Prefer this report's explicit fields over evidence from a newer report of
  // the same type. The original source values and RAW JSON remain unchanged.
  const conflicts = !matching ? [] : values.length
    ? values.filter(value => value !== facts.fuelType).map(value => ({ value, source }))
    : provenance.conflicts.filter(conflict => conflict.source === source);
  return { ...facts, fuelTypeProvenance: { ...provenance, conflicts } };
}

function reportFuelValues(payload: unknown): string[] {
  const aliases: Record<string, string> = {
    petrol: "petrol", gasoline: "petrol", benzyna: "petrol", diesel: "diesel",
    lpg: "lpg", cng: "cng", hybrid: "hybrid", phev: "phev", "plug in hybrid": "phev",
    electric: "electric", electricity: "electric", bev: "electric", hydrogen: "hydrogen",
  };
  const fuelKeys = new Set(["fuel", "fueltype", "primaryfueltype", "fueltypeprimary"]);
  const keyName = (value: string) => value.toLowerCase().replace(/[^a-z]/g, "");
  const values = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value !== "string") return;
    const normalized = aliases[value.trim().toLowerCase().replace(/[-_]+/g, " ")];
    if (normalized) values.add(normalized);
  };
  let visited = 0;
  function visit(value: unknown, depth: number) {
    if (++visited > 1000 || depth > 10 || !value || typeof value !== "object") return;
    if (Array.isArray(value)) { for (const item of value) visit(item, depth + 1); return; }
    const record = value as Record<string, unknown>;
    const level = record.electrification_level ?? record.electrificationLevel;
    const electrification = typeof level === "string" ? level.toLowerCase() : "";
    const electricFuel = /phev|plug-in/.test(electrification) ? "phev"
      : /hev|hybrid/.test(electrification) ? "hybrid"
        : /bev|electric/.test(electrification) ? "electric" : null;
    if (electricFuel) values.add(electricFuel);
    if (typeof record.label === "string" && fuelKeys.has(keyName(record.label))) add(record.value);
    for (const [key, item] of Object.entries(record)) {
      if (!electricFuel && fuelKeys.has(keyName(key))) add(item);
      visit(item, depth + 1);
    }
  }
  visit(payload, 0);
  return [...values];
}
