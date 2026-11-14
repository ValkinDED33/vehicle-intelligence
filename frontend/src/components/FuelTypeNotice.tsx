import { AlertTriangle } from "lucide-react";
import type { FuelTypeProvenance } from "../api";
import { enumLabel, t } from "../i18n";

export function fuelSourceLabel(source: string): string {
  if (source.startsWith("vin:")) {
    const provider = source.slice(4);
    return `${provider === "vincario" ? "Vincario" : provider === "vehicle-databases" ? "Vehicle Databases" : provider} VIN`;
  }
  if (source.startsWith("vdb:")) return `Vehicle Databases / ${source.slice(4)}`;
  if (source.startsWith("report:")) return source.slice(7).replace(/:/g, " / ");
  return enumLabel(source);
}

export function FuelTypeNotice({ facts, conflictsOnly = false }: {
  facts: { fuelType: string | null; fuelTypeProvenance: FuelTypeProvenance | null };
  conflictsOnly?: boolean;
}) {
  const provenance = facts.fuelTypeProvenance;
  if (!provenance || !facts.fuelType || (conflictsOnly && provenance.conflicts.length === 0)) return null;
  return <div className="state-note fuel-type-notice">
    {t("Пальне")}: {enumLabel(facts.fuelType)}. {t("Джерело")}: <span title={provenance.source}>{fuelSourceLabel(provenance.source)}</span>
    {provenance.ownerConfirmed && provenance.source !== "manual-confirmed" && <> · {t("Підтверджено власником")}</>}
    {provenance.conflicts.length > 0 && <p role="alert" title={provenance.conflicts.map(conflict => conflict.source).join(", ")}>
      <AlertTriangle size={16} aria-hidden="true"/> {t("Є розбіжності з поточним профілем: {0}. Перевірте перед застосуванням.", {
        0: provenance.conflicts.map(conflict => `${enumLabel(conflict.value)} (${fuelSourceLabel(conflict.source)})`).join(", "),
      })}
    </p>}
  </div>;
}
