import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { formatTable } from './table.js';
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
    unsupportedTypes: [],
    totals: makeMockTotals(),
    ...overrides,
  };
}

describe('formatTable', () => {
  it('returns "No compatible infrastructure" for empty resources and skipped', () => {
    const result = makeMockResult();
    const table = formatTable(result);
    assert.ok(table.includes('No compatible infrastructure'), 'Should show no infrastructure message');
  });

  it('truncates long resource IDs correctly', () => {
    const longId = 'module.very_long_module_name.aws_instance.extremely_long_resource_name_that_exceeds_column_width';
    const result = makeMockResult({
      resources: [{
        input: { resourceId: longId, instanceType: 'm5.large', region: 'us-east-1' },
        baseline: makeMockBaseline({ totalCo2eGramsPerMonth: 1000, totalCostUsdPerMonth: 50 }),
        recommendation: null,
      }],
      totals: makeMockTotals({ currentCo2eGramsPerMonth: 1000, currentCostUsdPerMonth: 50 }),
    });

    const table = formatTable(result);
    assert.ok(table.includes('...'), 'Should truncate long names with ...');
    assert.ok(!table.includes(longId), 'Should not contain the full long ID');
  });

  it('displays skipped resources with SKIPPED marker', () => {
    const result = makeMockResult({
      skipped: [{ resourceId: 'aws_instance.unknown', reason: 'known_after_apply' }],
    });
    const table = formatTable(result);
    assert.ok(table.includes('SKIPPED'), 'Should show SKIPPED for skipped resources');
  });

  it('shows Scope 2 and Scope 3 columns', () => {
    const result = makeMockResult({
      resources: [{
        input: { resourceId: 'aws_instance.web', instanceType: 'm5.large', region: 'us-east-1' },
        baseline: makeMockBaseline(),
        recommendation: null,
      }],
      totals: makeMockTotals({ currentCo2eGramsPerMonth: 1000 }),
    });

    const table = formatTable(result);
    assert.ok(table.includes('Scope 2'), 'Should show Scope 2 label');
    assert.ok(table.includes('Scope 3'), 'Should show Scope 3 label');
  });
});
