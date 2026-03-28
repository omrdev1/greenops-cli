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
});
