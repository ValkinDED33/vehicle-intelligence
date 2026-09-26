export function parseEnergyDecimal(value: string | null): number {
  if (value === null) {
    return 0;
  }

  const parsed = Number.parseFloat(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

export function roundEnergyValue(value: number, digits: number): number {
  const multiplier = 10 ** digits;

  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
}

export function roundEnergyMoney(value: number): number {
  return roundEnergyValue(value, 2);
}

export function toEnergyDecimalString(value: number, scale: number): string {
  return value.toFixed(scale);
}
