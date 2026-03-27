import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { formatTable } from './table.js';
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
        baseline: {
          totalCo2eGramsPerMonth: 1000,
          totalCostUsdPerMonth: 50,
          confidence: 'HIGH',
          scope: 'SCOPE_2_OPERATIONAL',
          assumptionsApplied: { utilizationApplied: 0.5, gridIntensityApplied: 384.5, powerModelUsed: 'LINEAR_INTERPOLATION' },
        },
        recommendation: null,
      }],
      totals: { currentCo2eGramsPerMonth: 1000, currentCostUsdPerMonth: 50, potentialCo2eSavingGramsPerMonth: 0, potentialCostSavingUsdPerMonth: 0 },
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
});
