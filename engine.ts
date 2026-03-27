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
// Internal types for ledger shape (mirrors factors.json v1.3.0)
// ---------------------------------------------------------------------------

interface LedgerInstance {
  architecture: string;
  vcpus: number;
  memory_gb: number;
  power_watts: { idle: number; max: number };
  /** Prorated Scope 3 embodied carbon from manufacturing lifecycle (gCO2e/month).
   *  Source: CCF DELL R740 baseline (1,200 kgCO2e/server, 4yr lifespan, 48 vCPUs).
   *  ARM (Graviton) applies 20% discount reflecting smaller die + lower TDP. */
  embodied_co2e_grams_per_month: number;
}

interface LedgerRegion {
  location: string;
  grid_intensity_gco2e_per_kwh: number;
  pue: number;
  /** AWS WUE (Water Usage Effectiveness) in litres per kWh of IT load.
   *  Source: AWS 2023 Sustainability Report. */
  water_intensity_litres_per_kwh: number;
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

const HOURS_PER_MONTH = 730;
const GRAMS_PER_KWH_TO_KWH_FACTOR = 1000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
 * Linear interpolation power model (standard CCF methodology):
 *   W = W_idle + (W_max - W_idle) × utilization
 *
 * CPU-only. Memory power draw tracked via memory_gb in factors.json
 * but not yet included in the calculation (reserved for v1.4.0).
 */
function linearInterpolationWatts(idle: number, max: number, utilization: number): number {
  return idle + (max - idle) * utilization;
}

/**
 * Converts effective CPU watts to monthly Scope 2 CO2e grams.
 *   energy_kwh = watts × pue × hours / 1000
 *   carbon_g   = energy_kwh × grid_intensity_gco2e_per_kwh
 */
function wattsToScope2Carbon(
  watts: number,
  hours: number,
  pue: number,
  gridIntensityGco2ePerKwh: number
): number {
  const energyKwh = (watts * pue * hours) / GRAMS_PER_KWH_TO_KWH_FACTOR;
  return energyKwh * gridIntensityGco2ePerKwh;
}

/**
 * Calculates monthly water consumption from operational energy.
 *   energy_kwh (IT load, before PUE) × WUE litres/kWh
 */
function wattsToWater(watts: number, hours: number, waterIntensityLitresPerKwh: number): number {
  const energyKwh = (watts * hours) / GRAMS_PER_KWH_TO_KWH_FACTOR;
  return energyKwh * waterIntensityLitresPerKwh;
}

// ---------------------------------------------------------------------------
// ARM recommendation map
// ---------------------------------------------------------------------------

const ARM_UPGRADE_MAP: Record<string, string> = {
  // x86 → ARM64 upgrade targets (same vCPU/RAM class, lower power + embodied)
  t3: 't4g',
  t3a: 't4g',
  m5: 'm6g',
  m5a: 'm6g',
  c5: 'c6g',
  c5a: 'c6g',
  r5: 'r6g',
  r5a: 'r6g',
};

function getArmAlternative(instanceType: string, ledger: Ledger): string | null {
  const [family, size] = instanceType.split('.');
  if (!family || !size) return null;
  const armFamily = ARM_UPGRADE_MAP[family];
  if (!armFamily) return null;
  const candidate = `${armFamily}.${size}`;
  return ledger.instances[candidate] ? candidate : null;
}

function getCleanerRegion(currentRegion: string, instanceType: string, ledger: Ledger): string | null {
  const regions = Object.entries(ledger.regions)
    .filter(([regionId]) => {
      if (regionId === currentRegion) return false;
      return !!ledger.pricing_usd_per_hour[regionId]?.[instanceType];
    })
    .sort(([, a], [, b]) => a.grid_intensity_gco2e_per_kwh - b.grid_intensity_gco2e_per_kwh);

  if (regions.length === 0) return null;

  const [cleanestRegionId, cleanestRegion] = regions[0];
  const currentIntensity = ledger.regions[currentRegion]?.grid_intensity_gco2e_per_kwh ?? Infinity;
  if (cleanestRegion.grid_intensity_gco2e_per_kwh >= currentIntensity * 0.9) return null;
  return cleanestRegionId;
}

// ---------------------------------------------------------------------------
// Core Engine
// ---------------------------------------------------------------------------

/**
 * Calculates the full environmental and cost baseline for a single resource.
 *
 * Returns three emission dimensions:
 *   - Scope 2 operational (CPU power × grid carbon intensity × PUE)
 *   - Scope 3 embodied (prorated hardware manufacturing lifecycle)
 *   - Water consumption (operational energy × regional AWS WUE)
 *
 * Every assumption applied is recorded in assumptionsApplied for audit transparency.
 */
export function calculateBaseline(
  input: ResourceInput,
  ledger: Ledger = factorsData as Ledger
): EmissionAndCostEstimate {
  const hours = input.hoursPerMonth ?? HOURS_PER_MONTH;
  const utilization = resolveUtilization(input, ledger);

  const zeroResult = (unsupportedReason: string, gridIntensity = 0, embodied = 0, waterIntensity = 0): EmissionAndCostEstimate => ({
    totalCo2eGramsPerMonth: 0,
    embodiedCo2eGramsPerMonth: 0,
    totalLifecycleCo2eGramsPerMonth: 0,
    waterLitresPerMonth: 0,
    totalCostUsdPerMonth: 0,
    confidence: 'LOW_ASSUMED_DEFAULT',
    scope: 'SCOPE_2_AND_3',
    unsupportedReason,
    assumptionsApplied: {
      utilizationApplied: utilization,
      gridIntensityApplied: gridIntensity,
      powerModelUsed: 'LINEAR_INTERPOLATION',
      embodiedCo2ePerVcpuPerMonthApplied: embodied,
      waterIntensityLitresPerKwhApplied: waterIntensity,
    },
  });

  const regionData = ledger.regions[input.region];
  if (!regionData) {
    return zeroResult(`Region "${input.region}" is not present in the Open GreenOps Methodology Ledger v${ledger.metadata.ledger_version}.`);
  }

  const instanceData = ledger.instances[input.instanceType];
  if (!instanceData) {
    return zeroResult(
      `Instance type "${input.instanceType}" is not present in the Open GreenOps Methodology Ledger v${ledger.metadata.ledger_version}.`,
      regionData.grid_intensity_gco2e_per_kwh, 0, regionData.water_intensity_litres_per_kwh
    );
  }

  const pricePerHour = ledger.pricing_usd_per_hour[input.region]?.[input.instanceType];
  if (pricePerHour === undefined) {
    return zeroResult(
      `No pricing data for "${input.instanceType}" in "${input.region}" in the Open GreenOps Methodology Ledger v${ledger.metadata.ledger_version}.`,
      regionData.grid_intensity_gco2e_per_kwh,
      instanceData.embodied_co2e_grams_per_month,
      regionData.water_intensity_litres_per_kwh
    );
  }

  const powerModel: PowerModel = 'LINEAR_INTERPOLATION';
  const effectiveWatts = linearInterpolationWatts(
    instanceData.power_watts.idle,
    instanceData.power_watts.max,
    utilization
  );

  // Scope 2: operational emissions
  const totalCo2eGramsPerMonth = wattsToScope2Carbon(
    effectiveWatts, hours, regionData.pue, regionData.grid_intensity_gco2e_per_kwh
  );

  // Scope 3: embodied emissions — prorated by hours if partial month
  const embodiedCo2eGramsPerMonth =
    instanceData.embodied_co2e_grams_per_month * (hours / HOURS_PER_MONTH);

  // Water consumption
  const waterLitresPerMonth = wattsToWater(
    effectiveWatts, hours, regionData.water_intensity_litres_per_kwh
  );

  const totalLifecycleCo2eGramsPerMonth = totalCo2eGramsPerMonth + embodiedCo2eGramsPerMonth;
  const totalCostUsdPerMonth = pricePerHour * hours;
  const confidence: ConfidenceLevel = input.avgUtilization !== undefined ? 'MEDIUM' : 'HIGH';

  return {
    totalCo2eGramsPerMonth,
    embodiedCo2eGramsPerMonth,
    totalLifecycleCo2eGramsPerMonth,
    waterLitresPerMonth,
    totalCostUsdPerMonth,
    confidence,
    scope: 'SCOPE_2_AND_3',
    assumptionsApplied: {
      utilizationApplied: utilization,
      gridIntensityApplied: regionData.grid_intensity_gco2e_per_kwh,
      powerModelUsed: powerModel,
      embodiedCo2ePerVcpuPerMonthApplied: instanceData.embodied_co2e_grams_per_month,
      waterIntensityLitresPerKwhApplied: regionData.water_intensity_litres_per_kwh,
    },
  };
}

/**
 * Generates the single best recommendation for reducing environmental impact.
 *
 * Scoring: 60% weight on CO2 reduction, 40% on cost reduction.
 * Both dimensions normalised to percentage-of-baseline.
 * ARM upgrades surface embodied carbon benefit in the rationale.
 */
export function generateRecommendation(
  input: ResourceInput,
  baseline: EmissionAndCostEstimate,
  ledger: Ledger = factorsData as Ledger
): UpgradeRecommendation | null {
  if (baseline.confidence === 'LOW_ASSUMED_DEFAULT') return null;

  const candidates: UpgradeRecommendation[] = [];

  // Strategy 1: ARM upgrade
  const armAlternative = getArmAlternative(input.instanceType, ledger);
  if (armAlternative) {
    const armEstimate = calculateBaseline({ ...input, instanceType: armAlternative }, ledger);
    if (armEstimate.confidence !== 'LOW_ASSUMED_DEFAULT') {
      const co2Delta = armEstimate.totalCo2eGramsPerMonth - baseline.totalCo2eGramsPerMonth;
      const costDelta = armEstimate.totalCostUsdPerMonth - baseline.totalCostUsdPerMonth;
      const embodiedDelta = armEstimate.embodiedCo2eGramsPerMonth - baseline.embodiedCo2eGramsPerMonth;
      if (co2Delta < 0 && costDelta < 0) {
        const embodiedNote = embodiedDelta < 0
          ? ` ARM64 also reduces embodied (Scope 3) carbon by ${Math.abs(Math.round(embodiedDelta))}g CO2e/month.`
          : '';
        candidates.push({
          suggestedInstanceType: armAlternative,
          co2eDeltaGramsPerMonth: co2Delta,
          costDeltaUsdPerMonth: costDelta,
          rationale: `Switching from ${input.instanceType} (x86_64) to ${armAlternative} (ARM64) provides identical vCPU and memory at lower power draw, reducing Scope 2 carbon by ${Math.abs(Math.round(co2Delta))}g CO2e/month and cost by $${Math.abs(costDelta).toFixed(2)}/month.${embodiedNote}`,
        });
      }
    }
  }

  // Strategy 2: Region shift
  const cleanerRegion = getCleanerRegion(input.region, input.instanceType, ledger);
  if (cleanerRegion) {
    const regionEstimate = calculateBaseline({ ...input, region: cleanerRegion }, ledger);
    if (regionEstimate.confidence !== 'LOW_ASSUMED_DEFAULT') {
      const co2Delta = regionEstimate.totalCo2eGramsPerMonth - baseline.totalCo2eGramsPerMonth;
      const costDelta = regionEstimate.totalCostUsdPerMonth - baseline.totalCostUsdPerMonth;
      const co2ReductionPct = baseline.totalCo2eGramsPerMonth > 0
        ? Math.abs(co2Delta) / baseline.totalCo2eGramsPerMonth : 0;
      if (co2Delta < 0 && co2ReductionPct > 0.15) {
        const regionName = ledger.regions[cleanerRegion]?.location ?? cleanerRegion;
        const costNote = costDelta > 0
          ? ` (note: cost increases by $${costDelta.toFixed(2)}/month)`
          : ` saving $${Math.abs(costDelta).toFixed(2)}/month`;
        const waterDelta = regionEstimate.waterLitresPerMonth - baseline.waterLitresPerMonth;
        const waterNote = waterDelta < -0.1
          ? ` Water consumption also decreases by ${Math.abs(waterDelta).toFixed(1)}L/month.` : '';
        candidates.push({
          suggestedRegion: cleanerRegion,
          co2eDeltaGramsPerMonth: co2Delta,
          costDeltaUsdPerMonth: costDelta,
          rationale: `Moving ${input.instanceType} from ${input.region} to ${regionName} (${cleanerRegion}) reduces Scope 2 grid carbon intensity from ${ledger.regions[input.region]?.grid_intensity_gco2e_per_kwh}g to ${ledger.regions[cleanerRegion]?.grid_intensity_gco2e_per_kwh}g CO2e/kWh, saving ${Math.abs(Math.round(co2Delta))}g CO2e/month${costNote}.${waterNote}`,
        });
      }
    }
  }

  if (candidates.length === 0) return null;

  const scored = candidates.map((rec) => {
    const co2Pct = baseline.totalCo2eGramsPerMonth > 0
      ? Math.abs(rec.co2eDeltaGramsPerMonth) / baseline.totalCo2eGramsPerMonth : 0;
    const costPct = baseline.totalCostUsdPerMonth > 0
      ? Math.abs(rec.costDeltaUsdPerMonth) / baseline.totalCostUsdPerMonth : 0;
    return { rec, score: co2Pct * 0.6 + costPct * 0.4 };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].rec;
}

// ---------------------------------------------------------------------------
// Plan-level aggregator
// ---------------------------------------------------------------------------

export function analysePlan(
  resources: ResourceInput[],
  skipped: PlanAnalysisResult['skipped'],
  planFile: string,
  ledger: Ledger = factorsData as Ledger,
  unsupportedTypes: string[] = []
): PlanAnalysisResult {
  const analysedResources: PlanAnalysisResult['resources'] = resources.map((input) => {
    const baseline = calculateBaseline(input, ledger);
    const recommendation = generateRecommendation(input, baseline, ledger);
    return { input, baseline, recommendation };
  });

  const totals = analysedResources.reduce(
    (acc, { baseline, recommendation }) => {
      acc.currentCo2eGramsPerMonth += baseline.totalCo2eGramsPerMonth;
      acc.currentEmbodiedCo2eGramsPerMonth += baseline.embodiedCo2eGramsPerMonth;
      acc.currentLifecycleCo2eGramsPerMonth += baseline.totalLifecycleCo2eGramsPerMonth;
      acc.currentWaterLitresPerMonth += baseline.waterLitresPerMonth;
      acc.currentCostUsdPerMonth += baseline.totalCostUsdPerMonth;
      if (recommendation) {
        acc.potentialCo2eSavingGramsPerMonth += Math.abs(recommendation.co2eDeltaGramsPerMonth);
        acc.potentialCostSavingUsdPerMonth += Math.abs(recommendation.costDeltaUsdPerMonth);
      }
      return acc;
    },
    {
      currentCo2eGramsPerMonth: 0,
      currentEmbodiedCo2eGramsPerMonth: 0,
      currentLifecycleCo2eGramsPerMonth: 0,
      currentWaterLitresPerMonth: 0,
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
    unsupportedTypes,
    totals,
  };
}
