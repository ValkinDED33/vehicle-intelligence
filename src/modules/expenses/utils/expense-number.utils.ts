export function parseExpenseDecimal(value: string | null): number {
  if (value === null) {
    return 0;
  }

  const parsed = Number.parseFloat(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

export function roundExpenseValue(value: number, digits: number): number {
  const multiplier = 10 ** digits;

  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
}

export function roundExpenseMoney(value: number): number {
  return roundExpenseValue(value, 2);
}

export function toExpenseDecimalString(value: number, scale: number): string {
  return value.toFixed(scale);
}
