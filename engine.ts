import factorsData from './factors.json';
import type {
  ResourceInput,
  EmissionAndCostEstimate,
  UpgradeRecommendation,
  PlanAnalysisResult,
  ConfidenceLevel,
  PowerModel,
} from './types';

// ---------------------------------------------------------------------------
// Internal types for ledger shape (mirrors factors.json structure)
// ---------------------------------------------------------------------------

interface LedgerInstance {
  architecture: string;
  vcpus: number;
  memory_gb: number;
  power_watts: { idle: number; max: number };
}

interface LedgerRegion {
  location: string;
  grid_intensity_gco2e_per_kwh: number;
  pue: number;
}

interface Ledger {
  metadata: {
    ledger_version: string;
    assumptions: {
      default_utilization: { value: number };
    };
  };
  regions: Record<string, LedgerRegion>;
  instances: Record<string, LedgerInstance>;
  pricing_usd_per_hour: Record<string, Record<string, number>>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HOURS_PER_MONTH = 730; // 365 days * 24h / 12 months
const GRAMS_PER_KWH_TO_KWH_FACTOR = 1000; // grid intensity is in gCO2e/kWh

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolves the effective utilization for a resource.
 * Precedence: explicit input → ledger metadata default.
 */
function resolveUtilization(input: ResourceInput, ledger: Ledger): number {
  if (input.avgUtilization !== undefined && (input.avgUtilization < 0 || input.avgUtilization > 1)) {
    throw new RangeError(`avgUtilization must be between 0 and 1, got ${input.avgUtilization}`);
  }
  if (input.hoursPerMonth !== undefined && input.hoursPerMonth <= 0) {
    throw new RangeError(`hoursPerMonth must be positive, got ${input.hoursPerMonth}`);
  }
  return input.avgUtilization ?? ledger.metadata.assumptions.default_utilization.value;
}

/**
 * Linear interpolation power model:
 *   watts = idle + (max - idle) * utilization
 *
 * This is the standard CCF model for general-purpose compute.
 * It assumes power scales linearly between idle and max TDP
 * as CPU utilization increases from 0% to 100%.
 *
 * NOTE (CPU-only): This model uses only CPU TDP bounds. Memory power draw
 * is a known omission — GreenPixie and some CCF extensions include a separate
 * memory power component. Our factors.json stores memory_gb per instance for
 * future expansion, but it is NOT used in the current calculation.
 */
function linearInterpolationWatts(
  idle: number,
  max: number,
  utilization: number
): number {
  return idle + (max - idle) * utilization;
}

/**
 * Converts watt-hours of data center energy to grams of CO2e.
 *
 *   energy_kwh = watts * hours / 1000
 *   carbon_g   = energy_kwh * grid_intensity_gco2e_per_kwh
 */
function wattsToCarbon(
  watts: number,
  hours: number,
  pue: number,
  gridIntensityGco2ePerKwh: number
): number {
  const energyKwh = (watts * pue * hours) / GRAMS_PER_KWH_TO_KWH_FACTOR;
  return energyKwh * gridIntensityGco2ePerKwh;
}

// ---------------------------------------------------------------------------
// ARM recommendation map
// Maps x86 families → their ARM equivalents (same vCPU/RAM class).
// Extend this as new instance families are added to the ledger.
// ---------------------------------------------------------------------------

const ARM_UPGRADE_MAP: Record<string, string> = {
  m5: 'm6g',
  c5: 'c6g',
  t3: 't4g',
  // Extended families — entries are safe no-ops if targets aren't in factors.json
  r5: 'r6g',
  m5a: 'm6g',
  c5a: 'c6g',
  r5a: 'r6g',
};

/**
 * Given an instance type like "m5.large", returns the ARM equivalent
 * "m6g.large" if a mapping exists and the target is supported in the ledger.
 * Returns null if no upgrade is available.
 */
function getArmAlternative(
  instanceType: string,
  ledger: Ledger
): string | null {
  const [family, size] = instanceType.split('.');
  if (!family || !size) return null;

  const armFamily = ARM_UPGRADE_MAP[family];
  if (!armFamily) return null;

  const candidate = `${armFamily}.${size}`;
  return ledger.instances[candidate] ? candidate : null;
}

/**
 * Finds the cleanest (lowest grid intensity) supported region
 * that is NOT the current region, to use as a region-shift recommendation.
 */
function getCleanerRegion(
  currentRegion: string,
  instanceType: string,
  ledger: Ledger
): string | null {
  const regions = Object.entries(ledger.regions)
    .filter(([regionId]) => {
      // Must be a different region
      if (regionId === currentRegion) return false;
      // Must have pricing data for this instance type
      return !!ledger.pricing_usd_per_hour[regionId]?.[instanceType];
    })
    .sort(([, a], [, b]) => a.grid_intensity_gco2e_per_kwh - b.grid_intensity_gco2e_per_kwh);

  if (regions.length === 0) return null;

  const [cleanestRegionId, cleanestRegion] = regions[0];
  // If current region is unknown, treat intensity as Infinity so no region can appear "cleaner" — this
  // prevents recommendations when we can't establish a valid baseline for comparison.
  const currentIntensity = ledger.regions[currentRegion]?.grid_intensity_gco2e_per_kwh ?? Infinity;

  // Only recommend if the cleaner region is meaningfully better (>10% reduction)
  if (cleanestRegion.grid_intensity_gco2e_per_kwh >= currentIntensity * 0.9) return null;

  return cleanestRegionId;
}

// ---------------------------------------------------------------------------
// Core Engine Functions
// ---------------------------------------------------------------------------

/**
 * Calculates the baseline emissions and cost for a single resource.
 *
 * Returns a structured estimate with full transparency on every assumption
 * applied — suitable for inclusion in an audit ledger export.
 *
 * If the region or instance type is not present in the ledger, returns an
 * estimate with confidence "LOW_ASSUMED_DEFAULT" and an unsupportedReason.
 */
export function calculateBaseline(
  input: ResourceInput,
  ledger: Ledger = factorsData as Ledger
): EmissionAndCostEstimate {
  const hours = input.hoursPerMonth ?? HOURS_PER_MONTH;
  const utilization = resolveUtilization(input, ledger);

  // --- Validate region ---
  const regionData = ledger.regions[input.region];
  if (!regionData) {
    return {
      totalCo2eGramsPerMonth: 0,
      totalCostUsdPerMonth: 0,
      confidence: 'LOW_ASSUMED_DEFAULT',
      scope: 'SCOPE_2_OPERATIONAL',
      unsupportedReason: `Region "${input.region}" is not present in the open methodology ledger v${ledger.metadata.ledger_version}.`,
      assumptionsApplied: {
        utilizationApplied: utilization,
        gridIntensityApplied: 0,
        powerModelUsed: 'LINEAR_INTERPOLATION',
      },
    };
  }

  // --- Validate instance type ---
  const instanceData = ledger.instances[input.instanceType];
  if (!instanceData) {
    return {
      totalCo2eGramsPerMonth: 0,
      totalCostUsdPerMonth: 0,
      confidence: 'LOW_ASSUMED_DEFAULT',
      scope: 'SCOPE_2_OPERATIONAL',
      unsupportedReason: `Instance type "${input.instanceType}" is not present in the open methodology ledger v${ledger.metadata.ledger_version}.`,
      assumptionsApplied: {
        utilizationApplied: utilization,
        gridIntensityApplied: regionData.grid_intensity_gco2e_per_kwh,
        powerModelUsed: 'LINEAR_INTERPOLATION',
      },
    };
  }

  // --- Validate pricing ---
  const pricePerHour = ledger.pricing_usd_per_hour[input.region]?.[input.instanceType];
  if (pricePerHour === undefined) {
    return {
      totalCo2eGramsPerMonth: 0,
      totalCostUsdPerMonth: 0,
      confidence: 'LOW_ASSUMED_DEFAULT',
      scope: 'SCOPE_2_OPERATIONAL',
      unsupportedReason: `No pricing data for "${input.instanceType}" in "${input.region}" in the open methodology ledger v${ledger.metadata.ledger_version}.`,
      assumptionsApplied: {
        utilizationApplied: utilization,
        gridIntensityApplied: regionData.grid_intensity_gco2e_per_kwh,
        powerModelUsed: 'LINEAR_INTERPOLATION',
      },
    };
  }

  // --- Power model: LINEAR_INTERPOLATION ---
  // watts = idle + (max - idle) * utilization
  const powerModel: PowerModel = 'LINEAR_INTERPOLATION';
  const effectiveWatts = linearInterpolationWatts(
    instanceData.power_watts.idle,
    instanceData.power_watts.max,
    utilization
  );

  // --- Carbon calculation ---
  // Applies PUE to account for data center overhead (cooling, networking, etc.)
  const totalCo2eGramsPerMonth = wattsToCarbon(
    effectiveWatts,
    hours,
    regionData.pue,
    regionData.grid_intensity_gco2e_per_kwh
  );

  // --- Cost calculation ---
  const totalCostUsdPerMonth = pricePerHour * hours;

  // --- Confidence ---
  // HIGH:              all values sourced from ledger, default utilization applied.
  // MEDIUM:            caller supplied explicit avgUtilization. The estimate is still
  //                    mathematically valid but depends on the accuracy of the supplied
  //                    value. SaaS consumers should surface this to the end user.
  // LOW_ASSUMED_DEFAULT: unsupported region/instance/pricing — estimate is zero and
  //                    unreliable. See unsupportedReason for details.
  const confidence: ConfidenceLevel =
    input.avgUtilization !== undefined ? 'MEDIUM' : 'HIGH';

  return {
    totalCo2eGramsPerMonth,
    totalCostUsdPerMonth,
    confidence,
    scope: 'SCOPE_2_OPERATIONAL',
    assumptionsApplied: {
      utilizationApplied: utilization,
      gridIntensityApplied: regionData.grid_intensity_gco2e_per_kwh,
      powerModelUsed: powerModel,
    },
  };
}

/**
 * Analyses a baseline estimate and generates the single best recommendation
 * for reducing carbon and cost.
 *
 * Strategy (in priority order):
 *   1. ARM upgrade:        Same region, switch x86 → ARM (same vCPU/RAM class)
 *   2. Region shift:       Same instance, move to lowest grid-intensity region
 *   3. ARM + region shift: Combined — tried only if individual improvements
 *                          are below a minimum threshold (reserved for v1)
 *
 * Returns null if no improvement can be found in the current ledger.
 */
export function generateRecommendation(
  input: ResourceInput,
  baseline: EmissionAndCostEstimate,
  ledger: Ledger = factorsData as Ledger
): UpgradeRecommendation | null {
  // Cannot recommend for unsupported resources
  if (baseline.confidence === 'LOW_ASSUMED_DEFAULT') return null;

  const candidates: UpgradeRecommendation[] = [];

  // --- Strategy 1: ARM upgrade ---
  const armAlternative = getArmAlternative(input.instanceType, ledger);
  if (armAlternative) {
    const armEstimate = calculateBaseline(
      { ...input, instanceType: armAlternative },
      ledger
    );
    if (armEstimate.confidence !== 'LOW_ASSUMED_DEFAULT') {
      const co2Delta = armEstimate.totalCo2eGramsPerMonth - baseline.totalCo2eGramsPerMonth;
      const costDelta = armEstimate.totalCostUsdPerMonth - baseline.totalCostUsdPerMonth;

      // Only include if it actually reduces both carbon AND cost
      if (co2Delta < 0 && costDelta < 0) {
        candidates.push({
          suggestedInstanceType: armAlternative,
          co2eDeltaGramsPerMonth: co2Delta,
          costDeltaUsdPerMonth: costDelta,
          rationale: `Switching from ${input.instanceType} (x86_64) to ${armAlternative} (ARM64) provides identical vCPU and memory at lower power draw, reducing carbon by ${Math.abs(Math.round(co2Delta))}g CO2e/month and cost by $${Math.abs(costDelta).toFixed(2)}/month.`,
        });
      }
    }
  }

  // --- Strategy 2: Region shift ---
  const cleanerRegion = getCleanerRegion(input.region, input.instanceType, ledger);
  if (cleanerRegion) {
    const regionEstimate = calculateBaseline(
      { ...input, region: cleanerRegion },
      ledger
    );
    if (regionEstimate.confidence !== 'LOW_ASSUMED_DEFAULT') {
      const co2Delta = regionEstimate.totalCo2eGramsPerMonth - baseline.totalCo2eGramsPerMonth;
      const costDelta = regionEstimate.totalCostUsdPerMonth - baseline.totalCostUsdPerMonth;

      // Region shifts may increase cost — include if carbon reduction is significant (>15%)
      // Guard against division by zero: if baseline carbon is 0, no meaningful reduction to compare.
      const co2ReductionPct = baseline.totalCo2eGramsPerMonth > 0
        ? Math.abs(co2Delta) / baseline.totalCo2eGramsPerMonth
        : 0;

      if (co2Delta < 0 && co2ReductionPct > 0.15) {
        const regionName = ledger.regions[cleanerRegion]?.location ?? cleanerRegion;
        const costNote =
          costDelta > 0
            ? ` (note: cost increases by $${costDelta.toFixed(2)}/month)`
            : ` saving $${Math.abs(costDelta).toFixed(2)}/month`;

        candidates.push({
          suggestedRegion: cleanerRegion,
          co2eDeltaGramsPerMonth: co2Delta,
          costDeltaUsdPerMonth: costDelta,
          rationale: `Moving ${input.instanceType} from ${input.region} to ${regionName} (${cleanerRegion}) reduces grid carbon intensity from ${ledger.regions[input.region]?.grid_intensity_gco2e_per_kwh}g to ${ledger.regions[cleanerRegion]?.grid_intensity_gco2e_per_kwh}g CO2e/kWh, saving ${Math.abs(Math.round(co2Delta))}g CO2e/month${costNote}.`,
        });
      }
    }
  }

  if (candidates.length === 0) return null;

  // Return the recommendation with the greatest combined carbon + cost reduction.
  // We weight carbon reduction at 60% and cost at 40% to reflect the tool's primary mission.
  // Both dimensions are normalized to percentage-of-baseline so the weighting is accurate.
  const scored = candidates.map((rec) => {
    const co2Pct = baseline.totalCo2eGramsPerMonth > 0
      ? Math.abs(rec.co2eDeltaGramsPerMonth) / baseline.totalCo2eGramsPerMonth
      : 0;
    const costPct = baseline.totalCostUsdPerMonth > 0
      ? Math.abs(rec.costDeltaUsdPerMonth) / baseline.totalCostUsdPerMonth
      : 0;
    return { rec, score: co2Pct * 0.6 + costPct * 0.4 };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].rec;
}

// ---------------------------------------------------------------------------
// Plan-level aggregator
// ---------------------------------------------------------------------------

/**
 * Runs calculateBaseline + generateRecommendation for every resource in a
 * parsed plan and assembles the full PlanAnalysisResult, including pre-computed
 * totals for the PR comment headline.
 */
export function analysePlan(
  resources: ResourceInput[],
  skipped: PlanAnalysisResult['skipped'],
  planFile: string,
  ledger: Ledger = factorsData as Ledger
): PlanAnalysisResult {
  const analysedResources: PlanAnalysisResult['resources'] = resources.map((input) => {
    const baseline = calculateBaseline(input, ledger);
    const recommendation = generateRecommendation(input, baseline, ledger);
    return { input, baseline, recommendation };
  });

  const totals = analysedResources.reduce(
    (acc, { baseline, recommendation }) => {
      acc.currentCo2eGramsPerMonth += baseline.totalCo2eGramsPerMonth;
      acc.currentCostUsdPerMonth += baseline.totalCostUsdPerMonth;
      if (recommendation) {
        // Deltas are negative for improvements, so we negate for "saving" fields
        acc.potentialCo2eSavingGramsPerMonth += Math.abs(
          recommendation.co2eDeltaGramsPerMonth
        );
        acc.potentialCostSavingUsdPerMonth += Math.abs(
          recommendation.costDeltaUsdPerMonth
        );
      }
      return acc;
    },
    {
      currentCo2eGramsPerMonth: 0,
      currentCostUsdPerMonth: 0,
      potentialCo2eSavingGramsPerMonth: 0,
      potentialCostSavingUsdPerMonth: 0,
    }
  );

  return {
    analysedAt: new Date().toISOString(),
    ledgerVersion: ledger.metadata.ledger_version,
    planFile,
    resources: analysedResources,
    skipped,
    totals,
  };
}
