import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { formatMarkdown } from './markdown.js';
import { PlanAnalysisResult } from '../types.js';

function makeMockResult(overrides: Partial<PlanAnalysisResult> = {}): PlanAnalysisResult {
  return {
    analysedAt: '2026-03-25T00:00:00Z',
    ledgerVersion: '1.1.0',
    planFile: 'plan.json',
    resources: [],
    skipped: [],
    unsupportedTypes: [],
    totals: {
      currentCo2eGramsPerMonth: 0,
      currentCostUsdPerMonth: 0,
      potentialCo2eSavingGramsPerMonth: 0,
      potentialCostSavingUsdPerMonth: 0,
    },
    ...overrides,
  };
}

describe('formatMarkdown', () => {
  it('shows "optimally configured" when no recommendations exist', () => {
    const result = makeMockResult({
      resources: [{
        input: { resourceId: 'aws_instance.web', instanceType: 'm6g.large', region: 'us-west-2' },
        baseline: {
          totalCo2eGramsPerMonth: 1000,
          totalCostUsdPerMonth: 50,
          confidence: 'HIGH',
          scope: 'SCOPE_2_OPERATIONAL',
          assumptionsApplied: { utilizationApplied: 0.5, gridIntensityApplied: 240.1, powerModelUsed: 'LINEAR_INTERPOLATION' },
        },
        recommendation: null,
      }],
      totals: { currentCo2eGramsPerMonth: 1000, currentCostUsdPerMonth: 50, potentialCo2eSavingGramsPerMonth: 0, potentialCostSavingUsdPerMonth: 0 },
    });

    const md = formatMarkdown(result);
    assert.ok(md.includes('Already optimally configured'), 'Should show optimally configured message');
    assert.ok(!md.includes('NaN'), 'Should not contain NaN');
  });

  it('does not produce NaN% when baseline CO2 is zero', () => {
    const result = makeMockResult({
      resources: [{
        input: { resourceId: 'aws_instance.test', instanceType: 'x99.fake', region: 'us-east-1' },
        baseline: {
          totalCo2eGramsPerMonth: 0,
          totalCostUsdPerMonth: 0,
          confidence: 'LOW_ASSUMED_DEFAULT',
          scope: 'SCOPE_2_OPERATIONAL',
          unsupportedReason: 'test',
          assumptionsApplied: { utilizationApplied: 0.5, gridIntensityApplied: 0, powerModelUsed: 'LINEAR_INTERPOLATION' },
        },
        recommendation: { suggestedInstanceType: 'y99.fake', co2eDeltaGramsPerMonth: -100, costDeltaUsdPerMonth: -5, rationale: 'test' },
      }],
      totals: { currentCo2eGramsPerMonth: 0, currentCostUsdPerMonth: 0, potentialCo2eSavingGramsPerMonth: 100, potentialCostSavingUsdPerMonth: 5 },
    });

    const md = formatMarkdown(result);
    assert.ok(!md.includes('NaN'), 'Should not contain NaN when baseline is zero');
  });

  it('shows recommendations section when recommendations exist', () => {
    const result = makeMockResult({
      resources: [{
        input: { resourceId: 'aws_instance.web', instanceType: 'm5.large', region: 'us-east-1' },
        baseline: {
          totalCo2eGramsPerMonth: 4313,
          totalCostUsdPerMonth: 70,
          confidence: 'HIGH',
          scope: 'SCOPE_2_OPERATIONAL',
          assumptionsApplied: { utilizationApplied: 0.5, gridIntensityApplied: 384.5, powerModelUsed: 'LINEAR_INTERPOLATION' },
        },
        recommendation: {
          suggestedInstanceType: 'm6g.large',
          co2eDeltaGramsPerMonth: -1500,
          costDeltaUsdPerMonth: -13.87,
          rationale: 'Switch to ARM64',
        },
      }],
      totals: { currentCo2eGramsPerMonth: 4313, currentCostUsdPerMonth: 70, potentialCo2eSavingGramsPerMonth: 1500, potentialCostSavingUsdPerMonth: 13.87 },
    });

    const md = formatMarkdown(result);
    assert.ok(md.includes('### Recommendations'), 'Should include recommendations section');
    assert.ok(md.includes('m6g.large'), 'Should include suggested instance type');
  });

  it('shows upgrade prompt when option is true', () => {
    const result = makeMockResult();
    const md = formatMarkdown(result, { showUpgradePrompt: true });
    assert.ok(md.includes('Upgrade to GreenOps Dashboard'), 'Should include upgrade prompt');
  });

  it('hides upgrade prompt when option is false', () => {
    const result = makeMockResult();
    const md = formatMarkdown(result, { showUpgradePrompt: false });
    assert.ok(!md.includes('Upgrade to GreenOps Dashboard'), 'Should not include upgrade prompt');
  });

  it('includes scope disclaimer in footer', () => {
    const result = makeMockResult();
    const md = formatMarkdown(result);
    assert.ok(md.includes('Scope 2 operational emissions only'), 'Should include scope disclaimer');
  });

  it('shows coverage note when unsupported compute types are present', () => {
    const result = makeMockResult({
      unsupportedTypes: ['aws_ecs_service', 'aws_lambda_function'],
    });
    const md = formatMarkdown(result);
    assert.ok(md.includes('Coverage note'), 'Should include coverage note for unsupported compute types');
    assert.ok(md.includes('aws_ecs_service'), 'Should list the unsupported type');
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
