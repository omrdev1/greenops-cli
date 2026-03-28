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

  // ---------------------------------------------------------------------------
  // Azure engine tests
  // ---------------------------------------------------------------------------

  it('Azure: calculates correct Scope 2 CO2e for Standard_D2s_v3 in eastus', () => {
    // Audit trace:
    // Instance: Standard_D2s_v3 (x86_64, 2 vCPU, 8GB)
    // Power: idle=6.8W, max=20.4W → effective at 50% = 13.6W
    // Region: eastus — grid=380.0 gCO2e/kWh, PUE=1.125, WUE=0.43 L/kWh
    // Scope 2: 13.6 × 1.125 × 730 / 1000 × 380.0 = 4244.22 gCO2e/month
    // Scope 3: 1041.7 gCO2e/month (2 vCPU × 520.83 g/vCPU/month, x86)
    // Water:   13.6 × 730 / 1000 × 0.43 = 4.26904 L/month
    // Cost:    $0.096 × 730 = $70.08/month
    const result = calculateBaseline({
      resourceId: 'azurerm_linux_virtual_machine.api',
      instanceType: 'Standard_D2s_v3',
      region: 'eastus',
      provider: 'azure',
    });

    assert.equal(result.confidence, 'HIGH');
    assert.equal(result.scope, 'SCOPE_2_AND_3');
    assert.ok(Math.abs(result.totalCo2eGramsPerMonth - 4244.22) < 0.01, `Scope 2 expected ~4244.22, got ${result.totalCo2eGramsPerMonth}`);
    assert.ok(Math.abs(result.embodiedCo2eGramsPerMonth - 1041.7) < 0.01, 'Scope 3 should be 1041.7g');
    assert.ok(Math.abs(result.waterLitresPerMonth - 4.26904) < 0.001, `Water expected ~4.27L, got ${result.waterLitresPerMonth}`);
    assert.ok(Math.abs(result.totalCostUsdPerMonth - 70.08) < 0.001, `Cost expected ~$70.08, got ${result.totalCostUsdPerMonth}`);
  });

  it('Azure: ARM upgrade recommendation (Standard_D2s_v3 → Standard_D2ps_v5) produces savings', () => {
    // Standard_D2s_v3 (x86) → Standard_D2ps_v5 (ARM64/Ampere)
    // ARM Scope 2: 2699.45 gCO2e/month — saves 1544.77g CO2e/month
    // ARM Scope 3: 833.3g (2 vCPU ARM, 20% discount) — saves 208.4g embodied
    // ARM Cost: $0.077 × 730 = $56.21 — saves $13.87/month
    const baseline = calculateBaseline({
      resourceId: 'test', instanceType: 'Standard_D2s_v3', region: 'eastus', provider: 'azure',
    });
    const arm = calculateBaseline({
      resourceId: 'test', instanceType: 'Standard_D2ps_v5', region: 'eastus', provider: 'azure',
    });

    assert.ok(arm.totalCo2eGramsPerMonth < baseline.totalCo2eGramsPerMonth, 'ARM should have lower Scope 2');
    assert.ok(arm.embodiedCo2eGramsPerMonth < baseline.embodiedCo2eGramsPerMonth, 'ARM should have lower embodied carbon');
    assert.ok(arm.totalCostUsdPerMonth < baseline.totalCostUsdPerMonth, 'ARM should be cheaper');
    assert.ok(Math.abs(arm.embodiedCo2eGramsPerMonth - 833.3) < 0.01, 'ARM Scope 3 should be 833.3g');
  });

  it('Azure: returns LOW_ASSUMED_DEFAULT for unsupported instance', () => {
    const result = calculateBaseline({
      resourceId: 'test', instanceType: 'Standard_M96ms_v3', region: 'eastus', provider: 'azure',
    });
    assert.equal(result.confidence, 'LOW_ASSUMED_DEFAULT');
    assert.equal(result.totalCo2eGramsPerMonth, 0);
    assert.ok(result.unsupportedReason?.includes('Standard_M96ms_v3'));
  });

  it('Azure: returns LOW_ASSUMED_DEFAULT for unsupported region', () => {
    const result = calculateBaseline({
      resourceId: 'test', instanceType: 'Standard_D2s_v3', region: 'newzealandnorth', provider: 'azure',
    });
    assert.equal(result.confidence, 'LOW_ASSUMED_DEFAULT');
  });

  // ---------------------------------------------------------------------------
  // GCP engine tests
  // ---------------------------------------------------------------------------

  it('GCP: calculates correct Scope 2 CO2e for n2-standard-2 in us-central1', () => {
    // Audit trace:
    // Instance: n2-standard-2 (x86_64, 2 vCPU, 8GB)
    // Power: idle=6.8W, max=20.4W → effective at 50% = 13.6W
    // Region: us-central1 (Iowa) — grid=340.0 gCO2e/kWh, PUE=1.10, WUE=0.40 L/kWh
    // Scope 2: 13.6 × 1.10 × 730 / 1000 × 340.0 = 3713.072 gCO2e/month
    // Scope 3: 1041.7 gCO2e/month (2 vCPU x86)
    // Water:   13.6 × 730 / 1000 × 0.40 = 3.9712 L/month
    // Cost:    $0.097 × 730 = $70.81/month
    const result = calculateBaseline({
      resourceId: 'google_compute_instance.web',
      instanceType: 'n2-standard-2',
      region: 'us-central1',
      provider: 'gcp',
    });

    assert.equal(result.confidence, 'HIGH');
    assert.equal(result.scope, 'SCOPE_2_AND_3');
    assert.ok(Math.abs(result.totalCo2eGramsPerMonth - 3713.072) < 0.01, `Scope 2 expected ~3713.07, got ${result.totalCo2eGramsPerMonth}`);
    assert.ok(Math.abs(result.embodiedCo2eGramsPerMonth - 1041.7) < 0.01, 'Scope 3 should be 1041.7g');
    assert.ok(Math.abs(result.waterLitresPerMonth - 3.9712) < 0.001, `Water expected ~3.97L, got ${result.waterLitresPerMonth}`);
    assert.ok(Math.abs(result.totalCostUsdPerMonth - 70.81) < 0.001, `Cost expected ~$70.81, got ${result.totalCostUsdPerMonth}`);
  });

  it('GCP: ARM upgrade recommendation (n2-standard-2 → t2a-standard-2) produces savings', () => {
    // n2-standard-2 (x86) → t2a-standard-2 (ARM64/Ampere T2A)
    // ARM Scope 2: 2361.62 gCO2e/month — saves ~1351g CO2e/month
    // ARM Scope 3: 833.3g (20% discount) — saves 208.4g embodied
    // ARM Cost: $0.076 × 730 = $55.48 — saves ~$15.33/month
    const baseline = calculateBaseline({
      resourceId: 'test', instanceType: 'n2-standard-2', region: 'us-central1', provider: 'gcp',
    });
    const arm = calculateBaseline({
      resourceId: 'test', instanceType: 't2a-standard-2', region: 'us-central1', provider: 'gcp',
    });

    assert.ok(arm.totalCo2eGramsPerMonth < baseline.totalCo2eGramsPerMonth, 'ARM should have lower Scope 2');
    assert.ok(arm.embodiedCo2eGramsPerMonth < baseline.embodiedCo2eGramsPerMonth, 'ARM should have lower embodied carbon');
    assert.ok(arm.totalCostUsdPerMonth < baseline.totalCostUsdPerMonth, 'ARM should be cheaper');
    assert.ok(Math.abs(arm.embodiedCo2eGramsPerMonth - 833.3) < 0.01, 'ARM Scope 3 should be 833.3g');
  });

  it('GCP: GCP region has lower PUE than AWS (1.10 vs 1.13) — produces lower carbon than equivalent AWS', () => {
    // Same instance power draw, same grid intensity (both ~380g), but GCP PUE=1.10 vs AWS PUE=1.13
    // AWS us-east-1: grid=384.5, PUE=1.13
    // GCP us-east1:  grid=380.0, PUE=1.10
    // GCP should produce slightly less carbon per watt-hour
    const aws = calculateBaseline({
      resourceId: 'test', instanceType: 'm5.large', region: 'us-east-1', provider: 'aws',
    });
    const gcp = calculateBaseline({
      resourceId: 'test', instanceType: 'n2-standard-2', region: 'us-east1', provider: 'gcp',
    });
    // Both are 2 vCPU x86 — similar power draw, similar grid. GCP PUE advantage should show.
    assert.ok(gcp.totalCo2eGramsPerMonth < aws.totalCo2eGramsPerMonth, 'GCP us-east1 should have lower Scope 2 than AWS us-east-1 due to lower PUE');
  });

  it('GCP: returns LOW_ASSUMED_DEFAULT for unsupported instance', () => {
    const result = calculateBaseline({
      resourceId: 'test', instanceType: 'n1-standard-2', region: 'us-central1', provider: 'gcp',
    });
    assert.equal(result.confidence, 'LOW_ASSUMED_DEFAULT');
    assert.ok(result.unsupportedReason?.includes('n1-standard-2'));
  });

  it('GCP: returns LOW_ASSUMED_DEFAULT for unsupported region', () => {
    const result = calculateBaseline({
      resourceId: 'test', instanceType: 'n2-standard-2', region: 'me-west1', provider: 'gcp',
    });
    assert.equal(result.confidence, 'LOW_ASSUMED_DEFAULT');
  });
});
