import factorsData from './factors.json';
import type {
  ResourceInput,
  EmissionAndCostEstimate,
  UpgradeRecommendation,
  PlanAnalysisResult,
  ConfidenceLevel,
  PowerModel,
  CloudProvider,
} from './types';

// ---------------------------------------------------------------------------
// Internal types for ledger shape (mirrors factors.json v2.0.0)
// ---------------------------------------------------------------------------

interface LedgerInstance {
  architecture: string;
  vcpus: number;
  memory_gb: number;
  power_watts: { idle: number; max: number };
  embodied_co2e_grams_per_month: number;
}

interface LedgerRegion {
  location: string;
  grid_intensity_gco2e_per_kwh: number;
  pue: number;
  water_intensity_litres_per_kwh: number;
}

interface ProviderLedger {
  regions: Record<string, LedgerRegion>;
  instances: Record<string, LedgerInstance>;
  pricing_usd_per_hour: Record<string, Record<string, number>>;
}

interface Ledger {
  metadata: {
    ledger_version: string;
    assumptions: { default_utilization: { value: number } };
  };
  aws: ProviderLedger;
  azure: ProviderLedger;
  gcp: ProviderLedger;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HOURS_PER_MONTH = 730;
const GRAMS_PER_KWH = 1000;

/**
 * Memory power draw coefficient — CCF standard (0.392W per GB of RAM).
 * Applied to all instances with a known memory_gb value.
 * Source: Cloud Carbon Footprint methodology v3.
 */
const MEMORY_WATTS_PER_GB = 0.392;

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
 * Returns total effective watts: CPU interpolation + memory power draw.
 * Memory contribution is constant (not utilization-dependent) per CCF methodology.
 */
function effectiveTotalWatts(idle: number, max: number, utilization: number, memoryGb: number): number {
  const cpuWatts = idle + (max - idle) * utilization;
  const memoryWatts = memoryGb * MEMORY_WATTS_PER_GB;
  return cpuWatts + memoryWatts;
}

function wattsToScope2Carbon(watts: number, hours: number, pue: number, gridIntensity: number): number {
  return (watts * pue * hours / GRAMS_PER_KWH) * gridIntensity;
}

function wattsToWater(watts: number, hours: number, wue: number): number {
  return (watts * hours / GRAMS_PER_KWH) * wue;
}

// ---------------------------------------------------------------------------
// ARM upgrade maps — per provider
// ---------------------------------------------------------------------------

const ARM_UPGRADE_MAP: Record<CloudProvider, Record<string, string>> = {
  aws: {
    t3: 't4g', t3a: 't4g',
    m5: 'm6g', m5a: 'm6g',
    c5: 'c6g', c5a: 'c6g',
    r5: 'r6g', r5a: 'r6g',
  },
  azure: {
    'Standard_D2s_v3': 'Standard_D2ps_v5',
    'Standard_D4s_v3': 'Standard_D4ps_v5',
    'Standard_D8s_v3': 'Standard_D8ps_v5',
    'Standard_D2s_v4': 'Standard_D2ps_v5',
    'Standard_D4s_v4': 'Standard_D4ps_v5',
  },
  gcp: {
    n2: 't2a',
    n2d: 't2a',
    e2: 't2a',
  },
};

function getArmAlternative(instanceType: string, provider: CloudProvider, ledger: Ledger): string | null {
  const providerLedger = ledger[provider];
  const map = ARM_UPGRADE_MAP[provider];

  if (provider === 'azure') {
    const candidate = map[instanceType];
    return candidate && providerLedger.instances[candidate] ? candidate : null;
  }

  const [family, size] = instanceType.split('.');
  if (!family || !size) return null;
  const armFamily = map[family];
  if (!armFamily) return null;
  const candidate = `${armFamily}.${size}`;
  return providerLedger.instances[candidate] ? candidate : null;
}

function getCleanerRegion(currentRegion: string, instanceType: string, provider: CloudProvider, ledger: Ledger): string | null {
  const providerLedger = ledger[provider];
  const regions = Object.entries(providerLedger.regions)
    .filter(([regionId]) => {
      if (regionId === currentRegion) return false;
      return !!providerLedger.pricing_usd_per_hour[regionId]?.[instanceType];
    })
    .sort(([, a], [, b]) => a.grid_intensity_gco2e_per_kwh - b.grid_intensity_gco2e_per_kwh);

  if (regions.length === 0) return null;
  const [cleanestRegionId, cleanestRegion] = regions[0];
  const currentIntensity = providerLedger.regions[currentRegion]?.grid_intensity_gco2e_per_kwh ?? Infinity;
  if (cleanestRegion.grid_intensity_gco2e_per_kwh >= currentIntensity * 0.9) return null;
  return cleanestRegionId;
}

// ---------------------------------------------------------------------------
// Core Engine
// ---------------------------------------------------------------------------

export function calculateBaseline(
  input: ResourceInput,
  ledger: Ledger = factorsData as Ledger
): EmissionAndCostEstimate {
  const provider: CloudProvider = input.provider ?? 'aws';
  const providerLedger = ledger[provider];
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
      memoryWattsApplied: 0,
    },
  });

  const regionData = providerLedger.regions[input.region];
  if (!regionData) {
    return zeroResult(`Region "${input.region}" is not present in the ${provider.toUpperCase()} section of the Open GreenOps Methodology Ledger v${ledger.metadata.ledger_version}.`);
  }

  const instanceData = providerLedger.instances[input.instanceType];
  if (!instanceData) {
    return zeroResult(
      `Instance type "${input.instanceType}" is not present in the ${provider.toUpperCase()} section of the Open GreenOps Methodology Ledger v${ledger.metadata.ledger_version}.`,
      regionData.grid_intensity_gco2e_per_kwh, 0, regionData.water_intensity_litres_per_kwh
    );
  }

  const pricePerHour = providerLedger.pricing_usd_per_hour[input.region]?.[input.instanceType];
  if (pricePerHour === undefined) {
    return zeroResult(
      `No pricing data for "${input.instanceType}" in "${input.region}" (${provider.toUpperCase()}).`,
      regionData.grid_intensity_gco2e_per_kwh,
      instanceData.embodied_co2e_grams_per_month,
      regionData.water_intensity_litres_per_kwh
    );
  }

  const powerModel: PowerModel = 'LINEAR_INTERPOLATION';
  const effectiveWatts = effectiveTotalWatts(
    instanceData.power_watts.idle,
    instanceData.power_watts.max,
    utilization,
    instanceData.memory_gb
  );

  const totalCo2eGramsPerMonth = wattsToScope2Carbon(
    effectiveWatts, hours, regionData.pue, regionData.grid_intensity_gco2e_per_kwh
  );
  const embodiedCo2eGramsPerMonth = instanceData.embodied_co2e_grams_per_month * (hours / HOURS_PER_MONTH);
  const waterLitresPerMonth = wattsToWater(effectiveWatts, hours, regionData.water_intensity_litres_per_kwh);
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
      memoryWattsApplied: instanceData.memory_gb * MEMORY_WATTS_PER_GB,
    },
  };
}

export function generateRecommendation(
  input: ResourceInput,
  baseline: EmissionAndCostEstimate,
  ledger: Ledger = factorsData as Ledger
): UpgradeRecommendation | null {
  if (baseline.confidence === 'LOW_ASSUMED_DEFAULT') return null;
  const provider: CloudProvider = input.provider ?? 'aws';
  const providerLedger = ledger[provider];
  const candidates: UpgradeRecommendation[] = [];

  const armAlternative = getArmAlternative(input.instanceType, provider, ledger);
  if (armAlternative) {
    const armEstimate = calculateBaseline({ ...input, instanceType: armAlternative }, ledger);
    if (armEstimate.confidence !== 'LOW_ASSUMED_DEFAULT') {
      const co2Delta = armEstimate.totalCo2eGramsPerMonth - baseline.totalCo2eGramsPerMonth;
      const costDelta = armEstimate.totalCostUsdPerMonth - baseline.totalCostUsdPerMonth;
      const embodiedDelta = armEstimate.embodiedCo2eGramsPerMonth - baseline.embodiedCo2eGramsPerMonth;
      if (co2Delta < 0 && costDelta < 0) {
        const embodiedNote = embodiedDelta < 0
          ? ` ARM also reduces embodied (Scope 3) carbon by ${Math.abs(Math.round(embodiedDelta))}g CO2e/month.` : '';
        candidates.push({
          suggestedInstanceType: armAlternative,
          co2eDeltaGramsPerMonth: co2Delta,
          costDeltaUsdPerMonth: costDelta,
          rationale: `Switching from ${input.instanceType} to ${armAlternative} (ARM) provides identical vCPU and memory at lower power draw, saving ${Math.abs(Math.round(co2Delta))}g CO2e/month and $${Math.abs(costDelta).toFixed(2)}/month.${embodiedNote}`,
        });
      }
    }
  }

  const cleanerRegion = getCleanerRegion(input.region, input.instanceType, provider, ledger);
  if (cleanerRegion) {
    const regionEstimate = calculateBaseline({ ...input, region: cleanerRegion }, ledger);
    if (regionEstimate.confidence !== 'LOW_ASSUMED_DEFAULT') {
      const co2Delta = regionEstimate.totalCo2eGramsPerMonth - baseline.totalCo2eGramsPerMonth;
      const costDelta = regionEstimate.totalCostUsdPerMonth - baseline.totalCostUsdPerMonth;
      const co2ReductionPct = baseline.totalCo2eGramsPerMonth > 0
        ? Math.abs(co2Delta) / baseline.totalCo2eGramsPerMonth : 0;
      if (co2Delta < 0 && co2ReductionPct > 0.15) {
        const regionName = providerLedger.regions[cleanerRegion]?.location ?? cleanerRegion;
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
          rationale: `Moving ${input.instanceType} from ${input.region} to ${regionName} (${cleanerRegion}) reduces grid carbon intensity from ${providerLedger.regions[input.region]?.grid_intensity_gco2e_per_kwh}g to ${providerLedger.regions[cleanerRegion]?.grid_intensity_gco2e_per_kwh}g CO2e/kWh, saving ${Math.abs(Math.round(co2Delta))}g CO2e/month${costNote}.${waterNote}`,
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

  const providers = [...new Set(resources.map(r => r.provider ?? 'aws'))] as CloudProvider[];

  return {
    analysedAt: new Date().toISOString(),
    ledgerVersion: ledger.metadata.ledger_version,
    planFile,
    providers: providers.length > 0 ? providers : ['aws'],
    resources: analysedResources,
    skipped,
    unsupportedTypes,
    totals,
  };
}
