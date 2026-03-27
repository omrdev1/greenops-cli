import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { formatJson } from './formatters/json.js';
import { calculateBaseline, analysePlan } from './engine.js';

describe('JSON Formatter', () => {
  it('outputs valid compact JSON with schemaVersion, all emission scopes, and no ANSI characters', () => {
    // Use real engine output — no mocks
    const result = analysePlan(
      [{ resourceId: 'aws_instance.web', instanceType: 'm5.large', region: 'us-east-1' }],
      [],
      'plan.json'
    );

    const jsonStr = formatJson(result);
    const parsed = JSON.parse(jsonStr);

    // Schema version mirrors ledger version
    assert.equal(parsed.schemaVersion, result.ledgerVersion);

    // Scope 2 operational — non-zero for a supported instance
    assert.ok(parsed.result.totals.currentCo2eGramsPerMonth > 0, 'Should have Scope 2 CO2e');

    // Scope 3 embodied — non-zero
    assert.ok(parsed.result.totals.currentEmbodiedCo2eGramsPerMonth > 0, 'Should have Scope 3 embodied CO2e');

    // Lifecycle total = Scope 2 + Scope 3
    assert.ok(
      Math.abs(parsed.result.totals.currentLifecycleCo2eGramsPerMonth -
        (parsed.result.totals.currentCo2eGramsPerMonth + parsed.result.totals.currentEmbodiedCo2eGramsPerMonth)) < 0.001,
      'Lifecycle should equal Scope 2 + Scope 3'
    );

    // Water consumption — non-zero
    assert.ok(parsed.result.totals.currentWaterLitresPerMonth > 0, 'Should have water consumption');

    // No terminal escape codes or newlines in JSON output
    assert.ok(!jsonStr.includes('\n'), 'JSON should be compact');
    assert.ok(!jsonStr.includes('\x1b'), 'JSON should not contain ANSI codes');
  });

  it('individual resource baseline includes all three dimensions', () => {
    const result = analysePlan(
      [{ resourceId: 'aws_instance.api', instanceType: 'm6g.large', region: 'eu-north-1' }],
      [],
      'plan.json'
    );
    const parsed = JSON.parse(formatJson(result));
    const resource = parsed.result.resources[0];

    assert.ok(resource.baseline.totalCo2eGramsPerMonth > 0, 'Scope 2 present');
    assert.ok(resource.baseline.embodiedCo2eGramsPerMonth > 0, 'Scope 3 present');
    assert.ok(resource.baseline.waterLitresPerMonth > 0, 'Water present');
    assert.equal(resource.baseline.scope, 'SCOPE_2_AND_3', 'Scope should be SCOPE_2_AND_3');
  });
});
