/**
 * Core Types for GreenOps Plan Parser
 */

export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW_ASSUMED_DEFAULT";

export type PowerModel = 
  | "LINEAR_INTERPOLATION"     // (min + (max - min) * util) * pue
  | "IDLE_PLUS_DYNAMIC"        // for Lambda-style invocation models later
  | "STATIC_TDP";              // fallback when only max TDP is known

export interface ResourceInput {
  resourceId: string;       // e.g., "aws_instance.web_server"
  instanceType: string;     // e.g., "m5.large"
  region: string;           // e.g., "us-east-1"
  hoursPerMonth?: number;   // Default: 730
  avgUtilization?: number;  // Uses factors.json metadata default if omitted
}

export interface EmissionAndCostEstimate {
  totalCo2eGramsPerMonth: number;
  totalCostUsdPerMonth: number;
  
  confidence: ConfidenceLevel;
  unsupportedReason?: string;  

  /** Which emission scopes this estimate covers.
   *  Currently SCOPE_2_OPERATIONAL only — embodied emissions (Scope 3) and
   *  water consumption are not tracked. */
  scope: 'SCOPE_2_OPERATIONAL';

  assumptionsApplied: {
    utilizationApplied: number;
    gridIntensityApplied: number;
    powerModelUsed: PowerModel; 
  };
}

export interface UpgradeRecommendation {
  suggestedInstanceType?: string;
  suggestedRegion?: string;
  
  co2eDeltaGramsPerMonth: number; 
  costDeltaUsdPerMonth: number;   
  
  rationale: string;
}

export interface PlanAnalysisResult {
  analysedAt: string;           // ISO timestamp
  ledgerVersion: string;        // from factors.json metadata
  planFile: string;             // path or hash of the input
  
  resources: Array<{
    input: ResourceInput;
    baseline: EmissionAndCostEstimate;
    recommendation: UpgradeRecommendation | null;
  }>;
  
  skipped: Array<{
    resourceId: string;
    reason: "known_after_apply" | "unsupported_instance" | "unsupported_region" | string;
  }>;

  /** Compute-relevant resource types present in the plan that are not yet supported for analysis
   *  (e.g. aws_launch_template, aws_ecs_service). Empty array means full coverage of detected compute. */
  unsupportedTypes: string[];
  
  totals: {
    currentCo2eGramsPerMonth: number;
    currentCostUsdPerMonth: number;
    potentialCo2eSavingGramsPerMonth: number;
    potentialCostSavingUsdPerMonth: number;
  };
}
