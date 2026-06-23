import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { formatMarkdown } from './markdown.js';
import { PlanAnalysisResult } from '../types.js';

function makeMockBaseline(overrides: Record<string, unknown> = {}) {
  return {
    totalCo2eGramsPerMonth: 1000,
    embodiedCo2eGramsPerMonth: 833.3,
    totalLifecycleCo2eGramsPerMonth: 1833.3,
    waterLitresPerMonth: 1.8,
    totalCostUsdPerMonth: 50,
    confidence: 'HIGH' as const,
    scope: 'SCOPE_2_AND_3' as const,
    assumptionsApplied: {
      utilizationApplied: 0.5,
      gridIntensityApplied: 240.1,
      powerModelUsed: 'LINEAR_INTERPOLATION' as const,
      embodiedCo2ePerVcpuPerMonthApplied: 833.3,
      waterIntensityLitresPerKwhApplied: 0.18,
      memoryWattsApplied: 3.136,
    },
    ...overrides,
  };
}

function makeMockTotals(overrides: Record<string, unknown> = {}) {
  return {
    currentCo2eGramsPerMonth: 0,
    currentEmbodiedCo2eGramsPerMonth: 0,
    currentLifecycleCo2eGramsPerMonth: 0,
    currentWaterLitresPerMonth: 0,
    currentCostUsdPerMonth: 0,
    potentialCo2eSavingGramsPerMonth: 0,
    potentialCostSavingUsdPerMonth: 0,
    ...overrides,
  };
}

function makeMockResult(overrides: Partial<PlanAnalysisResult> = {}): PlanAnalysisResult {
  return {
    analysedAt: '2026-03-25T00:00:00Z',
    ledgerVersion: '1.3.0',
    planFile: 'plan.json',
    resources: [],
    skipped: [],
    providers: ['aws' as const],
    unsupportedTypes: [],
    totals: makeMockTotals(),
    ...overrides,
  };
}

describe('formatMarkdown', () => {
  it('shows "optimally configured" when no recommendations exist', () => {
    const result = makeMockResult({
      resources: [{
        input: { resourceId: 'aws_instance.web', instanceType: 'm6g.large', region: 'us-west-2' },
        baseline: makeMockBaseline({ totalCo2eGramsPerMonth: 1000, totalCostUsdPerMonth: 50 }),
        recommendation: null,
      }],
      totals: makeMockTotals({ currentCo2eGramsPerMonth: 1000, currentCostUsdPerMonth: 50 }),
    });

    const md = formatMarkdown(result);
    assert.ok(md.includes('optimally configured') || md.includes('Optimal'), 'Should show optimal message');
    assert.ok(!md.includes('NaN'), 'Should not contain NaN');
  });

  it('does not produce NaN% when baseline CO2 is zero', () => {
    const result = makeMockResult({
      resources: [{
        input: { resourceId: 'aws_instance.test', instanceType: 'x99.fake', region: 'us-east-1' },
        baseline: makeMockBaseline({
          totalCo2eGramsPerMonth: 0,
          totalCostUsdPerMonth: 0,
          confidence: 'LOW_ASSUMED_DEFAULT',
          unsupportedReason: 'test',
        }),
        recommendation: { suggestedInstanceType: 'y99.fake', co2eDeltaGramsPerMonth: -100, costDeltaUsdPerMonth: -5, rationale: 'test' },
      }],
      totals: makeMockTotals({ potentialCo2eSavingGramsPerMonth: 100, potentialCostSavingUsdPerMonth: 5 }),
    });

    const md = formatMarkdown(result);
    assert.ok(!md.includes('NaN'), 'Should not contain NaN when baseline is zero');
  });

  it('shows recommendations section when recommendations exist', () => {
    const result = makeMockResult({
      resources: [{
        input: { resourceId: 'aws_instance.web', instanceType: 'm5.large', region: 'us-east-1' },
        baseline: makeMockBaseline({ totalCo2eGramsPerMonth: 4313, totalCostUsdPerMonth: 70 }),
        recommendation: {
          suggestedInstanceType: 'm6g.large',
          co2eDeltaGramsPerMonth: -1500,
          costDeltaUsdPerMonth: -13.87,
          rationale: 'Switch to ARM64',
        },
      }],
      totals: makeMockTotals({ currentCo2eGramsPerMonth: 4313, currentCostUsdPerMonth: 70, potentialCo2eSavingGramsPerMonth: 1500, potentialCostSavingUsdPerMonth: 13.87 }),
    });

    const md = formatMarkdown(result);
    assert.ok(md.includes('### Recommendations'), 'Should include recommendations section');
    assert.ok(md.includes('m6g.large'), 'Should include suggested instance type');
  });

  it('shows embodied carbon and water in resource breakdown', () => {
    const result = makeMockResult({
      resources: [{
        input: { resourceId: 'aws_instance.web', instanceType: 'm5.large', region: 'us-east-1' },
        baseline: makeMockBaseline({ embodiedCo2eGramsPerMonth: 1041.7, waterLitresPerMonth: 5.16 }),
        recommendation: null,
      }],
      totals: makeMockTotals({ currentEmbodiedCo2eGramsPerMonth: 1041.7, currentWaterLitresPerMonth: 5.16 }),
    });

    const md = formatMarkdown(result);
    assert.ok(md.includes('Scope 3'), 'Should include Scope 3 column');
    assert.ok(md.includes('Water'), 'Should include Water column');
  });

  it('shows upgrade prompt when option is true', () => {
    const result = makeMockResult();
    const md = formatMarkdown(result, { showUpgradePrompt: true });
    assert.ok(md.includes('GreenOps Dashboard'), 'Should include upgrade prompt');
  });

  it('hides upgrade prompt when option is false', () => {
    const result = makeMockResult();
    const md = formatMarkdown(result, { showUpgradePrompt: false });
    assert.ok(!md.includes('GreenOps Dashboard'), 'Should not include upgrade prompt');
  });

  it('includes Scope 2 and Scope 3 in footer', () => {
    const result = makeMockResult();
    const md = formatMarkdown(result);
    assert.ok(md.includes('Scope 2'), 'Should include Scope 2 in footer');
    assert.ok(md.includes('Scope 3'), 'Should include Scope 3 in footer');
  });

  it('shows coverage note when unsupported compute types are present', () => {
    const result = makeMockResult({
      unsupportedTypes: ['aws_ecs_service', 'aws_lambda_function'],
    });
    const md = formatMarkdown(result);
    assert.ok(md.includes('Coverage note'), 'Should include coverage note for unsupported compute types');
    assert.ok(md.includes('aws_ecs_service'), 'Should list the unsupported type');
  });

  it('shows LOW_ASSUMED_DEFAULT resources in skipped section with unsupportedReason', () => {
    const result = makeMockResult({
      resources: [
        {
          input: { resourceId: 'google_compute_instance.old', instanceType: 'n1-standard-4', region: 'us-central1', provider: 'gcp' as const },
          baseline: makeMockBaseline({
            confidence: 'LOW_ASSUMED_DEFAULT' as const,
            totalCo2eGramsPerMonth: 0,
            embodiedCo2eGramsPerMonth: 0,
            totalCostUsdPerMonth: 0,
            unsupportedReason: 'Instance type "n1-standard-4" is not present in the GCP section of the Open GreenOps Methodology Ledger.',
          }),
          recommendation: null,
        },
      ],
      totals: makeMockTotals(),
    });
    const md = formatMarkdown(result);
    assert.ok(md.includes('Skipped Resource'), 'Should show skipped section for unsupported instances');
    assert.ok(md.includes('n1-standard-4'), 'Should show the unsupported instance type in skipped section');
    assert.ok(md.includes('not present in the GCP'), 'Should show the unsupportedReason');
    assert.ok(!md.includes('✅ Optimal'), 'Should NOT show as optimal resource');
  });

  it('does not show coverage note when only known_after_apply resources are skipped', () => {
    const result = makeMockResult({
      skipped: [{ resourceId: 'aws_instance.unknown', reason: 'known_after_apply' }],
      unsupportedTypes: [],
    });
    const md = formatMarkdown(result);
    assert.ok(!md.includes('Coverage note'), 'Should NOT show coverage note when skipped is only known_after_apply');
  });

  it('shows node count multiplier and node group note for EKS/AKS/GKE resources', () => {
    const result = makeMockResult({
      resources: [{
        input: { resourceId: 'aws_eks_node_group.workers', instanceType: 'm5.large', region: 'us-east-1', nodeCount: 3 },
        baseline: makeMockBaseline({ totalCo2eGramsPerMonth: 3000, totalCostUsdPerMonth: 150 }),
        recommendation: {
          suggestedInstanceType: 'm6g.large',
          co2eDeltaGramsPerMonth: -900,
          costDeltaUsdPerMonth: -30,
          rationale: 'Switch to ARM for lower power draw.',
        },
      }],
    });
    const md = formatMarkdown(result);
    assert.ok(md.includes('m5.large` × 3'), 'Resource breakdown should show the node count multiplier');
    assert.ok(md.includes('Node group totals'), 'Should show the node group autoscaling-minimum note');
    assert.ok(md.includes('m5.large` × 3 nodes'), 'Recommendation section should show node count');
  });

  it('does not show node group note for single-instance resources (nodeCount absent)', () => {
    const result = makeMockResult({
      resources: [{
        input: { resourceId: 'aws_instance.web', instanceType: 'm5.large', region: 'us-east-1' },
        baseline: makeMockBaseline(),
        recommendation: null,
      }],
    });
    const md = formatMarkdown(result);
    assert.ok(!md.includes('Node group totals'), 'Should NOT show node group note for a plain single instance');
    assert.ok(!md.includes('×'), 'Should NOT show a multiplier badge for a plain single instance');
  });

  it('shows GPU resources in the resource breakdown table, not buried in skipped section, despite LOW_ASSUMED_DEFAULT confidence', () => {
    const result = makeMockResult({
      resources: [{
        input: { resourceId: 'aws_instance.gpu_worker', instanceType: 'g5.xlarge', region: 'us-east-1', provider: 'aws' as const },
        baseline: makeMockBaseline({
          confidence: 'LOW_ASSUMED_DEFAULT' as const,
          totalCo2eGramsPerMonth: 500,
          embodiedCo2eGramsPerMonth: 0,
          totalCostUsdPerMonth: 734.38,
          unsupportedReason: 'Embodied (Scope 3) carbon for "g5.xlarge" is not yet modeled — GPU manufacturing footprint differs substantially from the CCF Dell R740 CPU-server baseline used elsewhere in this ledger, and no equivalent public GPU baseline exists yet. Scope 2 operational carbon above uses real NVIDIA TDP specs and is not affected.',
        }),
        recommendation: null,
      }],
      totals: makeMockTotals({ currentCo2eGramsPerMonth: 500, currentCostUsdPerMonth: 734.38 }),
    });
    const md = formatMarkdown(result);
    assert.ok(!md.includes('Skipped Resource'), 'GPU resource with real Scope 2 data should NOT be in skipped section');
    assert.ok(md.includes('g5.xlarge'), 'Should show the GPU instance type in the breakdown table');
    assert.ok(md.includes('AI Infrastructure Carbon Impact'), 'Should show the dedicated AI Infrastructure Carbon Impact section');
    assert.ok(md.includes('Embodied carbon gap'), 'Should still flag the embodied-carbon gap honestly');
  });

  it('still buries a fully-unsupported GPU-adjacent instance (zero Scope 2 too) in skipped section', () => {
    const result = makeMockResult({
      resources: [{
        input: { resourceId: 'aws_instance.unknown_gpu', instanceType: 'p9000.fictional', region: 'us-east-1', provider: 'aws' as const },
        baseline: makeMockBaseline({
          confidence: 'LOW_ASSUMED_DEFAULT' as const,
          totalCo2eGramsPerMonth: 0,
          embodiedCo2eGramsPerMonth: 0,
          totalCostUsdPerMonth: 0,
          unsupportedReason: 'Instance type "p9000.fictional" is not present in the AWS section of the Open GreenOps Methodology Ledger.',
        }),
        recommendation: null,
      }],
    });
    const md = formatMarkdown(result);
    assert.ok(md.includes('Skipped Resource'), 'A genuinely unsupported instance (zero Scope 2) should stay in skipped section');
    assert.ok(md.includes('p9000.fictional'));
  });

  it('shows a human-readable label for a managed_ai: SageMaker resource, not the raw internal encoding', () => {
    const result = makeMockResult({
      resources: [{
        input: { resourceId: 'aws_sagemaker_endpoint_configuration.inference', instanceType: 'managed_ai:sagemaker:g5.xlarge', region: 'us-east-1', provider: 'aws' as const },
        baseline: makeMockBaseline({
          confidence: 'LOW_ASSUMED_DEFAULT' as const,
          totalCo2eGramsPerMonth: 500,
          embodiedCo2eGramsPerMonth: 0,
          totalCostUsdPerMonth: 1481.90,
          unsupportedReason: 'Managed AI service estimate (sagemaker) assumes the endpoint runs continuously. Embodied (Scope 3) carbon for "g5.xlarge" is not yet modeled.',
        }),
        recommendation: null,
      }],
      totals: makeMockTotals({ currentCo2eGramsPerMonth: 500, currentCostUsdPerMonth: 1481.90 }),
    });
    const md = formatMarkdown(result);
    assert.ok(!md.includes('managed_ai:sagemaker:g5.xlarge'), 'Should NOT show the raw internal encoding string');
    assert.ok(md.includes('ml.g5.xlarge (SageMaker)'), 'Should show the human-readable label');
    assert.ok(!md.includes('Skipped Resource'), 'Real Scope 2 data should not be buried in skipped section');
    assert.ok(md.includes('AI Infrastructure Carbon Impact'), 'Should show the dedicated AI Infrastructure Carbon Impact section');
    assert.ok(md.includes('Managed AI service estimates'), 'Should show the managed AI assumptions note');
    assert.ok(md.includes('Embodied carbon gap'), 'Should also flag the embodied-carbon gap (Embodied (Scope 3) appears in this resource\'s reason)');
  });

  it('shows a human-readable label for a gpu_attached: Vertex AI Workbench resource', () => {
    const result = makeMockResult({
      resources: [{
        input: { resourceId: 'google_workbench_instance.gpu_notebook', instanceType: 'gpu_attached:n2-standard-2:70:1', region: 'us-central1', provider: 'gcp' as const },
        baseline: makeMockBaseline({
          confidence: 'LOW_ASSUMED_DEFAULT' as const,
          totalCo2eGramsPerMonth: 300,
          embodiedCo2eGramsPerMonth: 0,
          totalCostUsdPerMonth: 326.31,
          unsupportedReason: 'Embodied (Scope 3) carbon for the attached GPU is not yet modeled.',
        }),
        recommendation: null,
      }],
      totals: makeMockTotals({ currentCo2eGramsPerMonth: 300, currentCostUsdPerMonth: 326.31 }),
    });
    const md = formatMarkdown(result);
    assert.ok(!md.includes('gpu_attached:n2-standard-2:70:1'), 'Should NOT show the raw internal encoding string');
    assert.ok(md.includes('n2-standard-2 + 1x GPU'), 'Should show the human-readable label');
    assert.ok(!md.includes('Skipped Resource'));
    assert.ok(md.includes('AI Infrastructure Carbon Impact'), 'Vertex AI Workbench resources should also surface in the dedicated section');
  });

  it('shows an Azure NC GPU resource in the dedicated AI Infrastructure Carbon Impact section', () => {
    const result = makeMockResult({
      resources: [{
        input: { resourceId: 'azurerm_linux_virtual_machine.gpu_worker', instanceType: 'Standard_NC8as_T4_v3', region: 'eastus', provider: 'azure' as const },
        baseline: makeMockBaseline({
          confidence: 'LOW_ASSUMED_DEFAULT' as const,
          totalCo2eGramsPerMonth: 400,
          embodiedCo2eGramsPerMonth: 0,
          totalCostUsdPerMonth: 548.96,
          unsupportedReason: 'Embodied (Scope 3) carbon for "Standard_NC8as_T4_v3" is not yet modeled — GPU manufacturing footprint differs substantially from the CCF Dell R740 CPU-server baseline used elsewhere in this ledger, and no equivalent public GPU baseline exists yet.',
        }),
        recommendation: null,
      }],
      totals: makeMockTotals({ currentCo2eGramsPerMonth: 400, currentCostUsdPerMonth: 548.96 }),
    });
    const md = formatMarkdown(result);
    assert.ok(!md.includes('Skipped Resource'), 'Azure GPU resource with real Scope 2 data should NOT be in skipped section');
    assert.ok(md.includes('AI Infrastructure Carbon Impact'), 'Azure GPU resources should surface in the dedicated section');
    assert.ok(md.includes('GPU: `Standard_NC8as_T4_v3`'), 'Should label it as a GPU resource type, same as AWS GPU instances');
    assert.ok(md.includes('Embodied carbon gap'), 'Should flag the embodied-carbon gap honestly');
  });

  it('omits the AI Infrastructure Carbon Impact section entirely when no AI/GPU resources are present', () => {
    const result = makeMockResult({
      resources: [{
        input: { resourceId: 'aws_instance.web', instanceType: 'm5.large', region: 'us-east-1', provider: 'aws' as const },
        baseline: makeMockBaseline({ totalCo2eGramsPerMonth: 1000, totalCostUsdPerMonth: 50 }),
        recommendation: null,
      }],
      totals: makeMockTotals({ currentCo2eGramsPerMonth: 1000, currentCostUsdPerMonth: 50 }),
    });
    const md = formatMarkdown(result);
    assert.ok(!md.includes('AI Infrastructure Carbon Impact'), 'Should not show the AI section for a plan with no AI/GPU resources');
  });

  it('aggregates multiple AI/GPU resources into one combined total in the dedicated section', () => {
    const result = makeMockResult({
      resources: [
        {
          input: { resourceId: 'aws_instance.gpu_worker', instanceType: 'g5.xlarge', region: 'us-east-1', provider: 'aws' as const },
          baseline: makeMockBaseline({
            confidence: 'LOW_ASSUMED_DEFAULT' as const,
            totalCo2eGramsPerMonth: 500,
            embodiedCo2eGramsPerMonth: 0,
            totalCostUsdPerMonth: 734.38,
            unsupportedReason: 'Embodied (Scope 3) carbon for "g5.xlarge" is not yet modeled.',
          }),
          recommendation: null,
        },
        {
          input: { resourceId: 'aws_sagemaker_endpoint_configuration.inference', instanceType: 'managed_ai:sagemaker:g5.xlarge', region: 'us-east-1', provider: 'aws' as const },
          baseline: makeMockBaseline({
            confidence: 'LOW_ASSUMED_DEFAULT' as const,
            totalCo2eGramsPerMonth: 500,
            embodiedCo2eGramsPerMonth: 0,
            totalCostUsdPerMonth: 1481.90,
            unsupportedReason: 'Managed AI service estimate (sagemaker) assumes the endpoint runs continuously. Embodied (Scope 3) carbon for "g5.xlarge" is not yet modeled.',
          }),
          recommendation: null,
        },
      ],
      totals: makeMockTotals({ currentCo2eGramsPerMonth: 1000, currentCostUsdPerMonth: 2216.28 }),
    });
    const md = formatMarkdown(result);
    assert.ok(md.includes('Detected **2** AI/GPU resources'), 'Should count both AI/GPU resources');
    assert.ok(md.includes('1.00kg CO2e/month'), 'Should sum Scope 2 across both resources (500g + 500g = 1000g = 1.00kg)');
    assert.ok(md.includes('$2216.28/month'), 'Should sum cost across both resources');
    assert.ok(md.includes('Embodied carbon gap:** 2 of 2'), 'Should report both resources as having the embodied-carbon gap');
  });
});
