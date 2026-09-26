export function roundServiceRecordValue(value: number, digits: number): number {
  const multiplier = 10 ** digits;

  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
}

export function roundServiceRecordMoney(value: number): number {
  return roundServiceRecordValue(value, 2);
}

export function toServiceRecordDecimalString(
  value: number,
  scale: number,
): string {
  return value.toFixed(scale);
}
