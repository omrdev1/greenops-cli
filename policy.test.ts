import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadPolicy, evaluatePolicy } from './policy';
import type { PlanAnalysisResult } from './types';

function makeMockResult(overrides: Partial<PlanAnalysisResult['totals']> = {}): PlanAnalysisResult {
  return {
    analysedAt: '2026-03-27T00:00:00Z',
    ledgerVersion: '1.2.0',
    planFile: 'plan.json',
    resources: [],
    skipped: [],
    providers: ['aws' as const],
    unsupportedTypes: [],
    totals: {
      currentCo2eGramsPerMonth: 5000,
      currentEmbodiedCo2eGramsPerMonth: 1041.7,
      currentLifecycleCo2eGramsPerMonth: 6041.7,
      currentWaterLitresPerMonth: 2.3,
      currentCostUsdPerMonth: 200,
      potentialCo2eSavingGramsPerMonth: 1000,
      potentialCostSavingUsdPerMonth: 20,
      ...overrides,
    },
  };
}

const TMP_DIR = resolve('/tmp', `greenops-policy-test-${Date.now()}`);

describe('Policy Engine', () => {
  it('returns null when no .greenops.yml exists', () => {
    mkdirSync(TMP_DIR, { recursive: true });
    const policy = loadPolicy(TMP_DIR);
    assert.equal(policy, null, 'Should return null when no policy file present');
  });

  it('loads a valid .greenops.yml', () => {
    mkdirSync(TMP_DIR, { recursive: true });
    const policyPath = resolve(TMP_DIR, '.greenops.yml');
    writeFileSync(policyPath, [
      'version: 1',
      'budgets:',
      '  max_pr_co2e_increase_kg: 10',
      '  max_pr_cost_increase_usd: 500',
      'fail_on_violation: true',
    ].join('\n'));

    const policy = loadPolicy(TMP_DIR);
    assert.ok(policy !== null);
    assert.equal(policy!.version, 1);
    assert.equal(policy!.budgets?.max_pr_co2e_increase_kg, 10);
    assert.equal(policy!.budgets?.max_pr_cost_increase_usd, 500);
    assert.equal(policy!.fail_on_violation, true);

    unlinkSync(policyPath);
  });

  it('is compliant when no policy file exists', () => {
    const result = makeMockResult();
    const evaluation = evaluatePolicy(result, null);

    assert.equal(evaluation.isCompliant, true);
    assert.equal(evaluation.violations.length, 0);
    assert.equal(evaluation.shouldBlock, false);
  });

  it('is compliant when all budgets are within limits', () => {
    const result = makeMockResult({
      currentCo2eGramsPerMonth: 5000,  // 5kg
      currentCostUsdPerMonth: 200,
    });
    const policy = {
      version: 1,
      budgets: {
        max_pr_co2e_increase_kg: 10,       // 5kg < 10kg ✓
        max_pr_cost_increase_usd: 500,     // $200 < $500 ✓
      },
      fail_on_violation: false,
    };

    const evaluation = evaluatePolicy(result, policy);
    assert.equal(evaluation.isCompliant, true);
    assert.equal(evaluation.violations.length, 0);
  });

  it('detects max_pr_co2e_increase_kg violation', () => {
    const result = makeMockResult({
      currentCo2eGramsPerMonth: 15000,  // 15kg — exceeds 10kg limit
    });
    const policy = {
      version: 1,
      budgets: { max_pr_co2e_increase_kg: 10 },
      fail_on_violation: false,
    };

    const evaluation = evaluatePolicy(result, policy);
    assert.equal(evaluation.isCompliant, false);
    assert.equal(evaluation.violations.length, 1);
    assert.equal(evaluation.violations[0].constraint, 'max_pr_co2e_increase_kg');
    assert.equal(evaluation.violations[0].actual, 15);
    assert.equal(evaluation.violations[0].limit, 10);
  });

  it('detects max_pr_cost_increase_usd violation', () => {
    const result = makeMockResult({
      currentCostUsdPerMonth: 600,  // $600 — exceeds $500 limit
    });
    const policy = {
      version: 1,
      budgets: { max_pr_cost_increase_usd: 500 },
      fail_on_violation: false,
    };

    const evaluation = evaluatePolicy(result, policy);
    assert.equal(evaluation.isCompliant, false);
    assert.equal(evaluation.violations[0].constraint, 'max_pr_cost_increase_usd');
  });

  it('collects multiple violations in a single pass', () => {
    const result = makeMockResult({
      currentCo2eGramsPerMonth: 20000, // 20kg
      currentCostUsdPerMonth: 1000,
    });
    const policy = {
      version: 1,
      budgets: {
        max_pr_co2e_increase_kg: 10,
        max_pr_cost_increase_usd: 500,
        max_total_co2e_kg: 15,
      },
      fail_on_violation: true,
    };

    const evaluation = evaluatePolicy(result, policy);
    assert.equal(evaluation.isCompliant, false);
    assert.equal(evaluation.violations.length, 3, 'Should collect all 3 violations');
    assert.equal(evaluation.shouldBlock, true, 'Should block when fail_on_violation is true');
  });

  it('shouldBlock is false when fail_on_violation is not set', () => {
    const result = makeMockResult({ currentCo2eGramsPerMonth: 20000 });
    const policy = {
      version: 1,
      budgets: { max_pr_co2e_increase_kg: 10 },
      // fail_on_violation not set — defaults to false
    };

    const evaluation = evaluatePolicy(result, policy);
    assert.equal(evaluation.isCompliant, false);
    assert.equal(evaluation.shouldBlock, false, 'Should not block when fail_on_violation is unset');
  });

  it('throws a descriptive error for malformed budgets values', () => {
    mkdirSync(TMP_DIR, { recursive: true });
    const policyPath = resolve(TMP_DIR, '.greenops.yml');
    writeFileSync(policyPath, [
      'version: 1',
      'budgets:',
      '  max_pr_co2e_increase_kg: -5',  // negative — invalid
    ].join('\n'));

    assert.throws(
      () => loadPolicy(TMP_DIR),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('max_pr_co2e_increase_kg'));
        return true;
      }
    );

    unlinkSync(policyPath);
  });
});
