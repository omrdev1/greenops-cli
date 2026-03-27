import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { calculateBaseline } from './engine';

describe('calculateBaseline', () => {
  it('calculates the exact gCO2e value using the ledger default utilization (HIGH confidence)', () => {
    // Audit Ledger Proof
    // Instance: m5.large (x86_64, 2 vCPU, 8GB)
    // Power: Idle = 6.8W, Max = 20.4W
    // Utilisation: 50% (0.5) [LEDGER DEFAULT]
    // Effective Watts = 6.8 + (20.4 - 6.8) * 0.5 = 13.6W
    // 
    // Region: us-east-1
    // Grid Intensity: 384.5 gCO2e/kWh
    // PUE: 1.13
    // 
    // Power Draw = 13.6W * 1.13 = 15.368W
    // Hours (default) = 730
    // Energy per month = 15.368W * 730 / 1000 = 11.21864 kWh
    // Total Carbon = 11.21864 kWh * 384.5 gCO2e/kWh = 4313.56708 gCO2e

    const expectedCo2e = 4313.56708;

    // No avgUtilization supplied -> engine uses ledger default -> confidence HIGH
    const result = calculateBaseline({
      resourceId: 'test-db',
      region: 'us-east-1',
      instanceType: 'm5.large',
    });

    assert.equal(result.confidence, 'HIGH');
    
    // Assert exactly to 5 decimal places to prevent floating point mismatch
    assert.ok(
      Math.abs(result.totalCo2eGramsPerMonth - expectedCo2e) < 0.0001,
      `Expected ~${expectedCo2e}, got ${result.totalCo2eGramsPerMonth}`
    );
  });

  it('calculates a different gCO2e value for an explicitly-supplied utilization (MEDIUM confidence)', () => {
    const defaultResult = calculateBaseline({
      resourceId: 'test-db',
      region: 'us-east-1',
      instanceType: 'm5.large',
    });

    const explicitResult = calculateBaseline({
      resourceId: 'test-db',
      region: 'us-east-1',
      instanceType: 'm5.large',
      avgUtilization: 0.75, // Explicit value
    });

    assert.equal(explicitResult.confidence, 'MEDIUM');
    assert.ok(explicitResult.totalCo2eGramsPerMonth > defaultResult.totalCo2eGramsPerMonth);
  });

  it('calculates a meaningfully lower gCO2e value for the same instance in us-west-2', () => {
    const eastResult = calculateBaseline({
      resourceId: 'east-db',
      region: 'us-east-1',
      instanceType: 'm5.large',
    });

    const westResult = calculateBaseline({
      resourceId: 'west-db',
      region: 'us-west-2',
      instanceType: 'm5.large',
    });

    // us-west-2 has grid intensity of 240.1, compared to us-east-1 which is 384.5
    assert.ok(
      westResult.totalCo2eGramsPerMonth < eastResult.totalCo2eGramsPerMonth,
      'us-west-2 carbon should be lower than us-east-1'
    );
    
    // Verify it is meaningfully lower (>30% reduction)
    assert.ok(
      westResult.totalCo2eGramsPerMonth < eastResult.totalCo2eGramsPerMonth * 0.7,
      'us-west-2 should provide a significant carbon reduction'
    );
  });

  it('handles unsupported instance types gracefully', () => {
    const result = calculateBaseline({
      resourceId: 'unknown-db',
      region: 'us-east-1',
      instanceType: 'x99.superlarge',
    });

    assert.equal(result.confidence, 'LOW_ASSUMED_DEFAULT');
    assert.ok(result.unsupportedReason !== undefined);
    assert.ok(result.unsupportedReason!.length > 0);
    assert.equal(result.totalCo2eGramsPerMonth, 0);
    assert.equal(result.totalCostUsdPerMonth, 0);
  });

  it('returns zero cost and carbon for unsupported region', () => {
    const result = calculateBaseline({
      resourceId: 'test',
      region: 'xx-fake-1',
      instanceType: 'm5.large',
    });
    assert.equal(result.confidence, 'LOW_ASSUMED_DEFAULT');
    assert.ok(result.unsupportedReason?.includes('xx-fake-1'));
    assert.equal(result.totalCo2eGramsPerMonth, 0);
    assert.equal(result.totalCostUsdPerMonth, 0);
  });

  it('uses 730 hours when hoursPerMonth is not supplied', () => {
    const withDefault = calculateBaseline({
      resourceId: 'test',
      region: 'us-east-1',
      instanceType: 'm5.large',
    });
    const explicit730 = calculateBaseline({
      resourceId: 'test',
      region: 'us-east-1',
      instanceType: 'm5.large',
      hoursPerMonth: 730,
    });
    // Both should produce identical carbon output
    assert.equal(
      withDefault.totalCo2eGramsPerMonth,
      explicit730.totalCo2eGramsPerMonth
    );
  });

  it('throws RangeError for avgUtilization > 1', () => {
    assert.throws(() => {
      calculateBaseline({ resourceId: 'test', region: 'us-east-1', instanceType: 'm5.large', avgUtilization: 1.5 });
    }, RangeError);
  });

  it('throws RangeError for avgUtilization < 0', () => {
    assert.throws(() => {
      calculateBaseline({ resourceId: 'test', region: 'us-east-1', instanceType: 'm5.large', avgUtilization: -0.1 });
    }, RangeError);
  });

  it('throws RangeError for hoursPerMonth = 0', () => {
    assert.throws(() => {
      calculateBaseline({ resourceId: 'test', region: 'us-east-1', instanceType: 'm5.large', hoursPerMonth: 0 });
    }, RangeError);
  });

  it('throws RangeError for negative hoursPerMonth', () => {
    assert.throws(() => {
      calculateBaseline({ resourceId: 'test', region: 'us-east-1', instanceType: 'm5.large', hoursPerMonth: -100 });
    }, RangeError);
  });

  it('accepts avgUtilization = 0 (idle-only carbon)', () => {
    const result = calculateBaseline({
      resourceId: 'test', region: 'us-east-1', instanceType: 'm5.large', avgUtilization: 0,
    });
    assert.ok(result.totalCo2eGramsPerMonth > 0, 'Should still have carbon from idle power');
  });

  it('accepts avgUtilization = 1 (max carbon)', () => {
    const idle = calculateBaseline({
      resourceId: 'test', region: 'us-east-1', instanceType: 'm5.large', avgUtilization: 0,
    });
    const max = calculateBaseline({
      resourceId: 'test', region: 'us-east-1', instanceType: 'm5.large', avgUtilization: 1,
    });
    assert.ok(max.totalCo2eGramsPerMonth > idle.totalCo2eGramsPerMonth, 'Max utilization should produce more carbon');
  });

  it('returns scope SCOPE_2_AND_3 on all estimates', () => {
    const result = calculateBaseline({
      resourceId: 'test', region: 'us-east-1', instanceType: 'm5.large',
    });
    assert.equal(result.scope, 'SCOPE_2_AND_3');
  });
});
