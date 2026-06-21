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

/**
 * Renders an internal instanceType lookup key as a human-readable label.
 * Internal encodings (serverless:, managed_ai:, gpu_attached:) are engine
 * lookup keys, not display strings — a PR comment showing
 * "managed_ai:sagemaker:g5.xlarge" verbatim is unreadable to the engineer
 * reviewing it.
 */
export function formatInstanceTypeLabel(instanceType: string): string {
  if (instanceType.startsWith('serverless:')) return 'serverless';

  const managedAiMatch = instanceType.match(/^managed_ai:([a-z_]+):(.+)$/);
  if (managedAiMatch) {
    const [, service, baseType] = managedAiMatch;
    const serviceLabel = service === 'sagemaker' ? 'SageMaker' : service;
    return `ml.${baseType} (${serviceLabel})`;
  }

  const gpuAttachedMatch = instanceType.match(/^gpu_attached:(.+):(\d+(?:\.\d+)?):(\d+)$/);
  if (gpuAttachedMatch) {
    const [, baseMachineType, , coreCount] = gpuAttachedMatch;
    const gpuSuffix = coreCount === '1' ? '1x GPU' : `${coreCount}x GPU`;
    return `${baseMachineType} + ${gpuSuffix}`;
  }

  return instanceType;
}
