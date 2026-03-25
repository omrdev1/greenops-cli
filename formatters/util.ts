/**
 * Centralized formatting helpers defining sign conventions for standard CLI usage.
 * Positive savings are represented as negative deltas (indicating reduction).
 */

export function formatDelta(grams: number): string {
  // If grams is negative, it's a reduction -> display '-' prefix.
  // E.g., co2eDeltaGramsPerMonth: -1500 -> -1.50kg
  const sign = grams < 0 ? '-' : '+';
  const kg = Math.abs(grams) / 1000;
  return `${sign}${kg.toFixed(2)}kg`;
}

export function formatCostDelta(usd: number): string {
  const sign = usd < 0 ? '-' : '+';
  return `${sign}$${Math.abs(usd).toFixed(2)}`;
}

export function formatGrams(grams: number): string {
  return `${(grams / 1000).toFixed(2)}kg`;
}
