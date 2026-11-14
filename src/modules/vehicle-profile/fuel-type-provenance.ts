export interface FuelTypeConflict {
  value: string;
  source: string;
}

export interface FuelTypeProvenance {
  source: string;
  ownerConfirmed: boolean;
  confirmedAt: string | null;
  observations?: FuelTypeConflict[];
  conflicts: FuelTypeConflict[];
}

interface FuelProfile {
  fuelType: string | null;
  source: string;
  confirmedAt: Date | null;
  fuelTypeProvenance?: FuelTypeProvenance | null;
}

export function isOwnerFuelSource(source: string): boolean {
  return source === "manual" || source === "manual-confirmed";
}

export function fuelTypeProvenance(profile: FuelProfile | null): FuelTypeProvenance | null {
  if (!profile?.fuelType) return null;
  if (profile.fuelTypeProvenance) return profile.fuelTypeProvenance;
  // Legacy profiles only have row-level provenance. Never use an inherited
  // confirmedAt timestamp to promote a VIN/report value to owner confirmation.
  const ownerConfirmed = isOwnerFuelSource(profile.source);
  return {
    source: profile.source,
    ownerConfirmed,
    confirmedAt: ownerConfirmed ? profile.confirmedAt?.toISOString() ?? null : null,
    observations: ownerConfirmed ? [] : [{ value: profile.fuelType, source: profile.source }],
    conflicts: [],
  };
}

export function resolveFuelTypeUpdate(
  current: FuelProfile | null,
  incoming: { fuelType?: string | null; source: string; confirmedAt?: Date },
): { fuelType: string | null; fuelTypeProvenance: FuelTypeProvenance | null } {
  const previous = fuelTypeProvenance(current);
  const value = incoming.fuelType?.trim().toLowerCase();
  if (!value) return { fuelType: current?.fuelType ?? null, fuelTypeProvenance: previous };

  const ownerConfirmed = isOwnerFuelSource(incoming.source);
  const protectedByOwner = previous?.ownerConfirmed && !ownerConfirmed;
  const selectedValue = protectedByOwner ? current!.fuelType! : value;
  // Keep corroborating provider evidence too: a later owner edit can make it
  // conflicting. Only a newer observation from that same source replaces it.
  let observations = [...(previous?.observations ?? previous?.conflicts ?? [])];
  if (current?.fuelType && previous && !previous.ownerConfirmed && !observations.some(
    observation => observation.source === previous.source,
  )) observations.push({ value: current.fuelType, source: previous.source });
  if (!ownerConfirmed) {
    observations = observations.filter(observation => observation.source !== incoming.source);
    observations.push({ value, source: incoming.source });
  }
  const conflicts = observations.filter(observation => observation.value !== selectedValue);

  return {
    fuelType: selectedValue,
    fuelTypeProvenance: protectedByOwner ? { ...previous, observations, conflicts } : {
      source: incoming.source,
      ownerConfirmed,
      confirmedAt: ownerConfirmed ? (incoming.confirmedAt ?? new Date()).toISOString() : null,
      observations,
      conflicts,
    },
  };
}
