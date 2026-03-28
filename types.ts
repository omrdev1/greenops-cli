/**
 * Core Types for GreenOps Plan Parser
 *
 * Emission scopes covered:
 *   SCOPE_2_OPERATIONAL  — CPU power draw × grid carbon intensity × PUE
 *   SCOPE_3_EMBODIED     — Prorated hardware manufacturing lifecycle emissions
 *
 * Water consumption is tracked separately as it is not an emission scope
 * but is a material environmental impact that GreenPixie and other tools report.
 */

export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW_ASSUMED_DEFAULT";

export type PowerModel =
  | "LINEAR_INTERPOLATION"     // W = idle + (max - idle) * util — standard CCF model
  | "IDLE_PLUS_DYNAMIC"        // for Lambda-style invocation models (future)
  | "STATIC_TDP";              // fallback when only max TDP is known

export type CloudProvider = 'aws' | 'azure' | 'gcp';

export interface ResourceInput {
  resourceId: string;       // e.g., "aws_instance.web_server"
  instanceType: string;     // e.g., "m5.large" / "Standard_D2s_v3" / "n2-standard-2"
  region: string;           // e.g., "us-east-1" / "eastus" / "us-central1"
  provider?: CloudProvider; // Default: 'aws' — backward compatible
  hoursPerMonth?: number;   // Default: 730 (full calendar month)
  avgUtilization?: number;  // Uses factors.json metadata default (50%) if omitted
}

export interface EmissionAndCostEstimate {
  // --- Scope 2: Operational emissions ---
  /** CPU power draw × PUE × grid carbon intensity. Primary metric. */
  totalCo2eGramsPerMonth: number;

  // --- Scope 3: Embodied emissions ---
  /**
   * Prorated hardware manufacturing lifecycle carbon for this resource.
   * Calculated as: (server_total_embodied_gco2e / lifespan_hours / vcpus_per_server)
   *                × vcpus × 730h
   * Source: CCF DELL R740 baseline (1,200 kgCO2e/server, 4yr lifespan, 48 vCPUs).
   * ARM (Graviton) instances apply a 20% discount reflecting smaller die size and
   * lower TDP manufacturing footprint.
   */
  embodiedCo2eGramsPerMonth: number;

  /** Combined Scope 2 + Scope 3 total. Use this for full-lifecycle reporting. */
  totalLifecycleCo2eGramsPerMonth: number;

  // --- Water consumption ---
  /**
   * Estimated water consumption from data center cooling.
   * Calculated as: operational_energy_kwh × regional_wue_litres_per_kwh
   * Source: AWS 2023 Sustainability Report (WUE by region).
   * Covers direct water withdrawal for cooling only — not supply chain water.
   */
  waterLitresPerMonth: number;

  // --- Cost ---
  totalCostUsdPerMonth: number;

  // --- Metadata ---
  confidence: ConfidenceLevel;
  unsupportedReason?: string;

  /**
   * Which emission scopes this estimate covers.
   * SCOPE_2_OPERATIONAL | SCOPE_3_EMBODIED | BOTH
   */
  scope: 'SCOPE_2_OPERATIONAL' | 'SCOPE_3_EMBODIED' | 'SCOPE_2_AND_3';

  assumptionsApplied: {
    utilizationApplied: number;
    gridIntensityApplied: number;
    powerModelUsed: PowerModel;
    embodiedCo2ePerVcpuPerMonthApplied: number;
    waterIntensityLitresPerKwhApplied: number;
    /** Memory power draw applied (W) = memory_gb × 0.392W/GB. CCF standard. */
    memoryWattsApplied: number;
  };
}

export interface UpgradeRecommendation {
  suggestedInstanceType?: string;
  suggestedRegion?: string;

  /** Negative = saving. Scope 2 operational only (matches current resource delta). */
  co2eDeltaGramsPerMonth: number;
  /** Negative = saving. */
  costDeltaUsdPerMonth: number;

  rationale: string;
}

export interface PlanAnalysisResult {
  analysedAt: string;       // ISO timestamp
  ledgerVersion: string;    // from factors.json metadata
  planFile: string;         // path of the input plan
  providers: CloudProvider[]; // which cloud providers were detected in this plan

  resources: Array<{
    input: ResourceInput;
    baseline: EmissionAndCostEstimate;
    recommendation: UpgradeRecommendation | null;
  }>;

  skipped: Array<{
    resourceId: string;
    reason: "known_after_apply" | "unsupported_instance" | "unsupported_region" | string;
  }>;

  /** Compute-relevant types in the plan not yet analysable (e.g. aws_lambda_function). */
  unsupportedTypes: string[];

  totals: {
    // Scope 2
    currentCo2eGramsPerMonth: number;
    // Scope 3
    currentEmbodiedCo2eGramsPerMonth: number;
    // Combined Scope 2 + 3
    currentLifecycleCo2eGramsPerMonth: number;
    // Water
    currentWaterLitresPerMonth: number;
    // Cost
    currentCostUsdPerMonth: number;
    // Savings potential (Scope 2 only — recommendations target operational emissions)
    potentialCo2eSavingGramsPerMonth: number;
    potentialCostSavingUsdPerMonth: number;
  };
}
