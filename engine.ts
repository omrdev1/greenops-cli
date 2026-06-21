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
  /**
   * GPU instances: true when embodied carbon is not yet modeled.
   * CCF's Dell R740 CPU-server baseline does not represent a GPU server's
   * manufacturing footprint, and no equivalent public GPU baseline exists yet.
   * Reporting 0 here is an explicit "not yet modeled" signal, not a measured
   * zero — calculateBaseline() downgrades confidence and adds unsupportedReason
   * when this is set, consistent with the project's refusal to estimate without
   * a real source. Scope 2 (operational, GPU-specific TDP) remains HIGH/MEDIUM
   * confidence since NVIDIA's published TDP specs are a real source.
   */
  embodied_unmodeled?: boolean;
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
  /**
   * Managed AI service pricing (SageMaker inference endpoints, Vertex AI
   * Workbench, etc.), keyed by service name then region then the underlying
   * base instance type. Always a real premium over raw compute pricing in
   * pricing_usd_per_hour — managed AI services are priced separately by the
   * provider, never derived from the underlying instance's compute price.
   */
  managed_ai_pricing_usd_per_hour?: Record<string, Record<string, Record<string, number>>>;
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
// Serverless estimation model
// ---------------------------------------------------------------------------

/**
 * Parse a serverless instance type string into its parameters.
 * Format: "serverless:{memoryMb}mb:{invocations}inv:{durationMs}ms"
 */
function parseServerlessInstanceType(instanceType: string): {
  memoryMb: number;
  invocationsPerMonth: number;
  avgDurationMs: number;
} | null {
  if (!instanceType.startsWith('serverless:')) return null;
  const match = instanceType.match(/^serverless:(\d+)mb:(\d+)inv:(\d+)ms$/);
  if (!match) return null;
  return {
    memoryMb: parseInt(match[1], 10),
    invocationsPerMonth: parseInt(match[2], 10),
    avgDurationMs: parseInt(match[3], 10),
  };
}

/**
 * Calculate emissions for a serverless function.
 *
 * Model: AWS Lambda Power Model (CCF methodology)
 *   W = (memory_gb × 0.392W/GB) + CONSTANT_CPU_OVERHEAD
 *   energy_kwh = W × (avg_duration_seconds × invocations_per_month) / 3_600_000
 *
 * CPU overhead constant: 0.002W (Lambda micro-VM baseline)
 * This is conservative and marked LOW_ASSUMED_DEFAULT because we don't have
 * actual invocation telemetry — we use the Terraform-configured memory and defaults.
 *
 * Embodied carbon: Lambda shares hardware with other tenants — we use
 * a minimal prorated allocation (1/48 vCPU equivalent, prorated by duration fraction).
 */
function calculateServerlessBaseline(
  input: ResourceInput,
  params: { memoryMb: number; invocationsPerMonth: number; avgDurationMs: number },
  regionData: LedgerRegion
): EmissionAndCostEstimate {
  const { memoryMb, invocationsPerMonth, avgDurationMs } = params;
  const memoryGb = memoryMb / 1024;

  // Power: memory-proportional + constant CPU overhead
  const LAMBDA_CPU_OVERHEAD_W = 0.002;
  const powerW = (memoryGb * MEMORY_WATTS_PER_GB) + LAMBDA_CPU_OVERHEAD_W;

  // Total compute seconds per month
  const computeSecondsPerMonth = (avgDurationMs / 1000) * invocationsPerMonth;

  // Energy in kWh (convert W×s to kWh: divide by 3,600,000)
  const energyKwh = (powerW * computeSecondsPerMonth) / 3_600_000;

  // Scope 2: energy × PUE × grid intensity
  const totalCo2eGramsPerMonth = energyKwh * regionData.pue * regionData.grid_intensity_gco2e_per_kwh;

  // Scope 3: minimal embodied — prorate by duration fraction of a month
  // Assumption: Lambda co-tenancy means ~1/100th of a single-server embodied allocation
  const EMBODIED_MONTHLY_SINGLE_SERVER_G = 500; // conservative baseline
  const durationFractionOfMonth = computeSecondsPerMonth / (730 * 3600);
  const embodiedCo2eGramsPerMonth = EMBODIED_MONTHLY_SINGLE_SERVER_G * durationFractionOfMonth;

  const totalLifecycleCo2eGramsPerMonth = totalCo2eGramsPerMonth + embodiedCo2eGramsPerMonth;

  // Water
  const waterLitresPerMonth = energyKwh * regionData.pue * regionData.water_intensity_litres_per_kwh;

  // Cost: AWS Lambda pricing at us-east-1 rates
  // $0.0000002/request + $0.0000000167/GB-second
  const REQUEST_COST = 0.0000002;
  const GB_SECOND_COST = 0.0000000167;
  const gbSeconds = memoryGb * (avgDurationMs / 1000) * invocationsPerMonth;
  const totalCostUsdPerMonth = (REQUEST_COST * invocationsPerMonth) + (GB_SECOND_COST * gbSeconds);

  return {
    totalCo2eGramsPerMonth,
    embodiedCo2eGramsPerMonth,
    totalLifecycleCo2eGramsPerMonth,
    waterLitresPerMonth,
    totalCostUsdPerMonth,
    confidence: 'LOW_ASSUMED_DEFAULT',
    scope: 'SCOPE_2_AND_3',
    unsupportedReason: `Serverless estimation uses assumed defaults: ${memoryMb}MB memory, ${invocationsPerMonth.toLocaleString()} invocations/month, ${avgDurationMs}ms avg duration. Override via .greenops.yml or resource tags for accuracy.`,
    assumptionsApplied: {
      utilizationApplied: 1.0, // serverless runs at full allocated memory
      gridIntensityApplied: regionData.grid_intensity_gco2e_per_kwh,
      powerModelUsed: 'SERVERLESS_INVOCATION',
      embodiedCo2ePerVcpuPerMonthApplied: EMBODIED_MONTHLY_SINGLE_SERVER_G,
      waterIntensityLitresPerKwhApplied: regionData.water_intensity_litres_per_kwh,
      memoryWattsApplied: memoryGb * MEMORY_WATTS_PER_GB,
    },
  };
}

// ---------------------------------------------------------------------------
// Managed AI Services (SageMaker inference endpoints, Vertex AI Workbench)
// ---------------------------------------------------------------------------

/**
 * Parse a managed-AI instance type string into its service and base instance.
 * Format: "managed_ai:{service}:{baseInstanceType}"
 *
 * The base instance type resolves to an existing entry in instances{} for
 * power/embodied-carbon specs (SageMaker ml.* instances and the underlying
 * EC2 instance family share identical vCPU/memory/GPU hardware — confirmed
 * against AWS's own SageMaker instance documentation). Pricing is NOT
 * derived from the base instance: managed AI services carry a real,
 * separately-published premium (e.g. ml.g5.xlarge runs ~2x raw g5.xlarge
 * on-demand pricing) and must use managed_ai_pricing_usd_per_hour.
 */
function parseManagedAiInstanceType(instanceType: string): {
  service: string;
  baseInstanceType: string;
} | null {
  if (!instanceType.startsWith('managed_ai:')) return null;
  const match = instanceType.match(/^managed_ai:([a-z_]+):(.+)$/);
  if (!match) return null;
  return { service: match[1], baseInstanceType: match[2] };
}

function calculateManagedAiBaseline(
  input: ResourceInput,
  params: { service: string; baseInstanceType: string },
  providerLedger: ProviderLedger,
  regionData: LedgerRegion,
  utilization: number,
  hours: number,
  provider: CloudProvider,
  ledgerVersion: string
): EmissionAndCostEstimate {
  const { service, baseInstanceType } = params;

  const instanceData = providerLedger.instances[baseInstanceType];
  if (!instanceData) {
    return {
      totalCo2eGramsPerMonth: 0,
      embodiedCo2eGramsPerMonth: 0,
      totalLifecycleCo2eGramsPerMonth: 0,
      waterLitresPerMonth: 0,
      totalCostUsdPerMonth: 0,
      confidence: 'LOW_ASSUMED_DEFAULT',
      scope: 'SCOPE_2_AND_3',
      unsupportedReason: `Managed AI service "${service}" base instance "${baseInstanceType}" is not present in the ${provider.toUpperCase()} section of the Open GreenOps Methodology Ledger v${ledgerVersion}.`,
      assumptionsApplied: {
        utilizationApplied: utilization,
        gridIntensityApplied: regionData.grid_intensity_gco2e_per_kwh,
        powerModelUsed: 'LINEAR_INTERPOLATION',
        embodiedCo2ePerVcpuPerMonthApplied: 0,
        waterIntensityLitresPerKwhApplied: regionData.water_intensity_litres_per_kwh,
        memoryWattsApplied: 0,
      },
    };
  }

  const managedPrice = providerLedger.managed_ai_pricing_usd_per_hour?.[service]?.[input.region]?.[baseInstanceType];
  if (managedPrice === undefined) {
    return {
      totalCo2eGramsPerMonth: 0,
      embodiedCo2eGramsPerMonth: 0,
      totalLifecycleCo2eGramsPerMonth: 0,
      waterLitresPerMonth: 0,
      totalCostUsdPerMonth: 0,
      confidence: 'LOW_ASSUMED_DEFAULT',
      scope: 'SCOPE_2_AND_3',
      unsupportedReason: `No managed AI pricing data for "${service}" base instance "${baseInstanceType}" in "${input.region}" (${provider.toUpperCase()}).`,
      assumptionsApplied: {
        utilizationApplied: utilization,
        gridIntensityApplied: regionData.grid_intensity_gco2e_per_kwh,
        powerModelUsed: 'LINEAR_INTERPOLATION',
        embodiedCo2ePerVcpuPerMonthApplied: instanceData.embodied_co2e_grams_per_month,
        waterIntensityLitresPerKwhApplied: regionData.water_intensity_litres_per_kwh,
        memoryWattsApplied: 0,
      },
    };
  }

  const effectiveWatts = effectiveTotalWatts(
    instanceData.power_watts.idle, instanceData.power_watts.max, utilization, instanceData.memory_gb
  );
  const nodeCount = input.nodeCount ?? 1;

  const totalCo2eGramsPerMonth = wattsToScope2Carbon(
    effectiveWatts, hours, regionData.pue, regionData.grid_intensity_gco2e_per_kwh
  ) * nodeCount;
  const embodiedCo2eGramsPerMonth = instanceData.embodied_unmodeled
    ? 0
    : instanceData.embodied_co2e_grams_per_month * (hours / HOURS_PER_MONTH) * nodeCount;
  const waterLitresPerMonth = wattsToWater(effectiveWatts, hours, regionData.water_intensity_litres_per_kwh) * nodeCount;
  const totalLifecycleCo2eGramsPerMonth = totalCo2eGramsPerMonth + embodiedCo2eGramsPerMonth;
  const totalCostUsdPerMonth = managedPrice * hours * nodeCount;

  // Managed AI services are always LOW_ASSUMED_DEFAULT: usage is billed by
  // actual invocation/runtime, not fixed instance-hours, and a Terraform plan
  // cannot see real utilization. The figure here assumes the endpoint runs
  // continuously at the ledger's default utilization — a ceiling estimate
  // for always-on endpoints, not a measurement of actual usage.
  const reasonParts = [
    `Managed AI service estimate (${service}) assumes the endpoint runs continuously; actual emissions depend on real invocation/runtime patterns not visible in a Terraform plan.`,
  ];
  if (instanceData.embodied_unmodeled) {
    reasonParts.push(`Embodied (Scope 3) carbon for "${baseInstanceType}" is not yet modeled — see GPU coverage notes in METHODOLOGY.md.`);
  }

  return {
    totalCo2eGramsPerMonth,
    embodiedCo2eGramsPerMonth,
    totalLifecycleCo2eGramsPerMonth,
    waterLitresPerMonth,
    totalCostUsdPerMonth,
    confidence: 'LOW_ASSUMED_DEFAULT',
    scope: 'SCOPE_2_AND_3',
    unsupportedReason: reasonParts.join(' '),
    assumptionsApplied: {
      utilizationApplied: utilization,
      gridIntensityApplied: regionData.grid_intensity_gco2e_per_kwh,
      powerModelUsed: 'LINEAR_INTERPOLATION',
      embodiedCo2ePerVcpuPerMonthApplied: instanceData.embodied_co2e_grams_per_month,
      waterIntensityLitresPerKwhApplied: regionData.water_intensity_litres_per_kwh,
      memoryWattsApplied: instanceData.memory_gb * MEMORY_WATTS_PER_GB,
    },
  };
}

// ---------------------------------------------------------------------------
// GPU-Attached Compute (Vertex AI Workbench accelerator_configs)
// ---------------------------------------------------------------------------

/**
 * Parse a GPU-attached instance type string.
 * Format: "gpu_attached:{baseMachineType}:{acceleratorWatts}:{coreCount}"
 *
 * Unlike SageMaker, Vertex AI Workbench has no managed-service price premium
 * — Google bills it as the underlying Compute Engine machine plus a
 * standalone per-GPU accelerator rate (confirmed: Workbench appears in GCP
 * billing as Compute Engine charges with a product label, not a separate
 * line item). So this path reuses raw pricing_usd_per_hour for the base
 * machine and adds a real GPU accelerator rate on top, rather than needing
 * a managed_ai-style separate pricing table.
 */
function parseGpuAttachedInstanceType(instanceType: string): {
  baseMachineType: string;
  acceleratorWatts: number;
  coreCount: number;
} | null {
  if (!instanceType.startsWith('gpu_attached:')) return null;
  const match = instanceType.match(/^gpu_attached:(.+):(\d+(?:\.\d+)?):(\d+)$/);
  if (!match) return null;
  return {
    baseMachineType: match[1],
    acceleratorWatts: parseFloat(match[2]),
    coreCount: parseInt(match[3], 10),
  };
}

function calculateGpuAttachedBaseline(
  input: ResourceInput,
  params: { baseMachineType: string; acceleratorWatts: number; coreCount: number },
  providerLedger: ProviderLedger,
  regionData: LedgerRegion,
  utilization: number,
  hours: number,
  provider: CloudProvider,
  ledgerVersion: string
): EmissionAndCostEstimate {
  const { baseMachineType, acceleratorWatts, coreCount } = params;

  const instanceData = providerLedger.instances[baseMachineType];
  const pricePerHour = providerLedger.pricing_usd_per_hour[input.region]?.[baseMachineType];

  if (!instanceData || pricePerHour === undefined) {
    return {
      totalCo2eGramsPerMonth: 0,
      embodiedCo2eGramsPerMonth: 0,
      totalLifecycleCo2eGramsPerMonth: 0,
      waterLitresPerMonth: 0,
      totalCostUsdPerMonth: 0,
      confidence: 'LOW_ASSUMED_DEFAULT',
      scope: 'SCOPE_2_AND_3',
      unsupportedReason: !instanceData
        ? `GPU-attached base machine type "${baseMachineType}" is not present in the ${provider.toUpperCase()} section of the Open GreenOps Methodology Ledger v${ledgerVersion}.`
        : `No pricing data for base machine type "${baseMachineType}" in "${input.region}" (${provider.toUpperCase()}).`,
      assumptionsApplied: {
        utilizationApplied: utilization,
        gridIntensityApplied: regionData.grid_intensity_gco2e_per_kwh,
        powerModelUsed: 'LINEAR_INTERPOLATION',
        embodiedCo2ePerVcpuPerMonthApplied: instanceData?.embodied_co2e_grams_per_month ?? 0,
        waterIntensityLitresPerKwhApplied: regionData.water_intensity_litres_per_kwh,
        memoryWattsApplied: 0,
      },
    };
  }

  // Base machine watts (CPU interpolation + memory) plus the attached GPU's
  // TDP at full draw — GPUs in inference/training workloads do not idle the
  // way general CPU utilization does, so the accelerator contribution is not
  // utilization-scaled, only the base machine's CPU portion is.
  const baseWatts = effectiveTotalWatts(
    instanceData.power_watts.idle, instanceData.power_watts.max, utilization, instanceData.memory_gb
  );
  const gpuWatts = acceleratorWatts * coreCount;
  const totalWatts = baseWatts + gpuWatts;

  const GPU_ACCELERATOR_PRICE_PER_HOUR = 0.35; // NVIDIA T4 standalone add-on rate, GCP public pricing
  const totalPricePerHour = pricePerHour + (GPU_ACCELERATOR_PRICE_PER_HOUR * coreCount);

  const totalCo2eGramsPerMonth = wattsToScope2Carbon(totalWatts, hours, regionData.pue, regionData.grid_intensity_gco2e_per_kwh);
  const waterLitresPerMonth = wattsToWater(totalWatts, hours, regionData.water_intensity_litres_per_kwh);
  // GPU embodied carbon is not modeled (same gap as the AWS GPU ledger entries).
  const embodiedCo2eGramsPerMonth = 0;
  const totalLifecycleCo2eGramsPerMonth = totalCo2eGramsPerMonth + embodiedCo2eGramsPerMonth;
  const totalCostUsdPerMonth = totalPricePerHour * hours;

  return {
    totalCo2eGramsPerMonth,
    embodiedCo2eGramsPerMonth,
    totalLifecycleCo2eGramsPerMonth,
    waterLitresPerMonth,
    totalCostUsdPerMonth,
    confidence: 'LOW_ASSUMED_DEFAULT',
    scope: 'SCOPE_2_AND_3',
    unsupportedReason: `Embodied (Scope 3) carbon for the attached GPU is not yet modeled (same gap as AWS GPU instances — see METHODOLOGY.md). Base machine "${baseMachineType}" embodied carbon is included; GPU embodied carbon is not.`,
    assumptionsApplied: {
      utilizationApplied: utilization,
      gridIntensityApplied: regionData.grid_intensity_gco2e_per_kwh,
      powerModelUsed: 'LINEAR_INTERPOLATION',
      embodiedCo2ePerVcpuPerMonthApplied: instanceData.embodied_co2e_grams_per_month,
      waterIntensityLitresPerKwhApplied: regionData.water_intensity_litres_per_kwh,
      memoryWattsApplied: instanceData.memory_gb * MEMORY_WATTS_PER_GB,
    },
  };
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

  // --- Serverless path ---
  const serverlessParams = parseServerlessInstanceType(input.instanceType);
  if (serverlessParams) {
    return calculateServerlessBaseline(input, serverlessParams, regionData);
  }

  // --- Managed AI service path (SageMaker) ---
  const managedAiParams = parseManagedAiInstanceType(input.instanceType);
  if (managedAiParams) {
    return calculateManagedAiBaseline(
      input, managedAiParams, providerLedger, regionData, utilization, hours, provider, ledger.metadata.ledger_version
    );
  }

  // --- GPU-attached compute path (Vertex AI Workbench) ---
  const gpuAttachedParams = parseGpuAttachedInstanceType(input.instanceType);
  if (gpuAttachedParams) {
    return calculateGpuAttachedBaseline(
      input, gpuAttachedParams, providerLedger, regionData, utilization, hours, provider, ledger.metadata.ledger_version
    );
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

  // Node groups (EKS/AKS/GKE) provision N instances of this type. All output
  // figures scale linearly with node count; the power/cost model itself is
  // identical to a single instance.
  const nodeCount = input.nodeCount ?? 1;

  const totalCo2eGramsPerMonth = wattsToScope2Carbon(
    effectiveWatts, hours, regionData.pue, regionData.grid_intensity_gco2e_per_kwh
  ) * nodeCount;
  const embodiedCo2eGramsPerMonth = instanceData.embodied_co2e_grams_per_month * (hours / HOURS_PER_MONTH) * nodeCount;
  const waterLitresPerMonth = wattsToWater(effectiveWatts, hours, regionData.water_intensity_litres_per_kwh) * nodeCount;
  const totalLifecycleCo2eGramsPerMonth = totalCo2eGramsPerMonth + embodiedCo2eGramsPerMonth;
  const totalCostUsdPerMonth = pricePerHour * hours * nodeCount;
  const confidence: ConfidenceLevel = instanceData.embodied_unmodeled
    ? 'LOW_ASSUMED_DEFAULT'
    : (input.avgUtilization !== undefined ? 'MEDIUM' : 'HIGH');

  return {
    totalCo2eGramsPerMonth,
    embodiedCo2eGramsPerMonth,
    totalLifecycleCo2eGramsPerMonth,
    waterLitresPerMonth,
    totalCostUsdPerMonth,
    confidence,
    scope: 'SCOPE_2_AND_3',
    ...(instanceData.embodied_unmodeled && {
      unsupportedReason: `Embodied (Scope 3) carbon for "${input.instanceType}" is not yet modeled — GPU manufacturing footprint differs substantially from the CCF Dell R740 CPU-server baseline used elsewhere in this ledger, and no equivalent public GPU baseline exists yet. Scope 2 operational carbon above uses real NVIDIA TDP specs and is not affected.`,
    }),
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
