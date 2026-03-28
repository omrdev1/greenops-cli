import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { calculateBaseline } from './engine';

describe('calculateBaseline', () => {
  it('calculates the exact gCO2e value using the ledger default utilization (HIGH confidence)', () => {
    // Audit Ledger Proof — v0.7.0 includes memory power draw (CCF standard: 0.392W/GB)
    // Instance: m5.large (x86_64, 2 vCPU, 8GB RAM)
    // Power: Idle=6.8W, Max=20.4W
    // Utilisation: 50% (0.5) [LEDGER DEFAULT]
    //
    // CPU watts  = 6.8 + (20.4 - 6.8) × 0.50 = 13.6W
    // Memory     = 8GB × 0.392W/GB            =  3.136W
    // Total      = 13.6 + 3.136               = 16.736W
    //
    // Region: us-east-1 | Grid: 384.5 gCO2e/kWh | PUE: 1.13
    //
    // Energy = 16.736W × 1.13 × 730h / 1000  = 13.82 kWh/month
    // CO2e   = 13.82 × 384.5                 = 5,308.22g CO2e/month

    const expectedCo2e = 5308.2249;

    const result = calculateBaseline({
      resourceId: 'test',
      region: 'us-east-1',
      instanceType: 'm5.large',
    });

    assert.equal(result.confidence, 'HIGH');
    assert.ok(
      Math.abs(result.totalCo2eGramsPerMonth - expectedCo2e) < 0.001,
      `Expected ~${expectedCo2e}, got ${result.totalCo2eGramsPerMonth}`
    );

    // Verify memory watts are reported in assumptionsApplied
    assert.ok(
      Math.abs(result.assumptionsApplied.memoryWattsApplied - 3.136) < 0.001,
      `Memory watts expected 3.136W, got ${result.assumptionsApplied.memoryWattsApplied}`
    );
  });

  it('calculates a different gCO2e value for an explicitly-supplied utilization (MEDIUM confidence)', () => {
    const defaultResult = calculateBaseline({
      resourceId: 'test',
      region: 'us-east-1',
      instanceType: 'm5.large',
    });

    const explicitResult = calculateBaseline({
      resourceId: 'test',
      region: 'us-east-1',
      instanceType: 'm5.large',
      avgUtilization: 0.75,
    });

    assert.equal(explicitResult.confidence, 'MEDIUM');
    assert.ok(explicitResult.totalCo2eGramsPerMonth > defaultResult.totalCo2eGramsPerMonth);
  });

  it('calculates a meaningfully lower gCO2e value for the same instance in us-west-2', () => {
    const eastResult = calculateBaseline({
      resourceId: 'east',
      region: 'us-east-1',
      instanceType: 'm5.large',
    });

    const westResult = calculateBaseline({
      resourceId: 'west',
      region: 'us-west-2',
      instanceType: 'm5.large',
    });

    // us-west-2 (240.1 gCO2e/kWh) vs us-east-1 (384.5 gCO2e/kWh)
    assert.ok(
      westResult.totalCo2eGramsPerMonth < eastResult.totalCo2eGramsPerMonth,
      'us-west-2 should have lower carbon than us-east-1'
    );
    // >30% reduction (ratio is ~0.624)
    assert.ok(
      westResult.totalCo2eGramsPerMonth < eastResult.totalCo2eGramsPerMonth * 0.7,
      'us-west-2 should provide a significant carbon reduction'
    );
  });

  it('handles unsupported instance types gracefully', () => {
    const result = calculateBaseline({
      resourceId: 'unknown',
      region: 'us-east-1',
      instanceType: 'x99.superlarge',
    });

    assert.equal(result.confidence, 'LOW_ASSUMED_DEFAULT');
    assert.ok(result.unsupportedReason !== undefined);
    assert.equal(result.totalCo2eGramsPerMonth, 0);
    assert.equal(result.totalCostUsdPerMonth, 0);
    assert.equal(result.assumptionsApplied.memoryWattsApplied, 0);
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
    assert.equal(withDefault.totalCo2eGramsPerMonth, explicit730.totalCo2eGramsPerMonth);
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

  it('accepts avgUtilization = 0 (idle-only carbon + full memory)', () => {
    const result = calculateBaseline({
      resourceId: 'test', region: 'us-east-1', instanceType: 'm5.large', avgUtilization: 0,
    });
    // At zero CPU utilization, memory power still contributes
    assert.ok(result.totalCo2eGramsPerMonth > 0, 'Should have carbon from idle CPU + memory power');
    assert.ok(result.assumptionsApplied.memoryWattsApplied > 0, 'Memory watts should be non-zero');
  });

  it('accepts avgUtilization = 1 (max carbon)', () => {
    const idle = calculateBaseline({
      resourceId: 'test', region: 'us-east-1', instanceType: 'm5.large', avgUtilization: 0,
    });
    const max = calculateBaseline({
      resourceId: 'test', region: 'us-east-1', instanceType: 'm5.large', avgUtilization: 1,
    });
    assert.ok(max.totalCo2eGramsPerMonth > idle.totalCo2eGramsPerMonth);
  });

  it('returns scope SCOPE_2_AND_3 on all estimates', () => {
    const result = calculateBaseline({
      resourceId: 'test', region: 'us-east-1', instanceType: 'm5.large',
    });
    assert.equal(result.scope, 'SCOPE_2_AND_3');
  });

  // ---------------------------------------------------------------------------
  // 4A: Memory power draw tests
  // ---------------------------------------------------------------------------

  it('4A: memory power is included in Scope 2 calculation (CPU + memory watts)', () => {
    // m5.large: CPU=13.6W at 50%, Memory=8GB×0.392=3.136W, Total=16.736W
    // Without memory: 4313.57g (old). With memory: 5308.22g (new).
    const result = calculateBaseline({
      resourceId: 'test', region: 'us-east-1', instanceType: 'm5.large',
    });
    const expectedCo2e = 5308.2249;
    const expectedMemW = 3.136;

    assert.ok(
      Math.abs(result.totalCo2eGramsPerMonth - expectedCo2e) < 0.001,
      `Expected ${expectedCo2e}, got ${result.totalCo2eGramsPerMonth}`
    );
    assert.ok(
      Math.abs(result.assumptionsApplied.memoryWattsApplied - expectedMemW) < 0.001,
      `Expected memoryWatts=${expectedMemW}, got ${result.assumptionsApplied.memoryWattsApplied}`
    );
  });

  it('4A: memory-optimised instances carry higher memory power fraction than general-purpose', () => {
    // r5.large: 2 vCPU, 16GB RAM — memory is 28.2% of total watts
    // m5.large: 2 vCPU,  8GB RAM — memory is 18.7% of total watts
    // r5.large should have meaningfully higher Scope 2 than m5.large
    // even though both have similar CPU TDP profiles
    const r5 = calculateBaseline({
      resourceId: 'test', region: 'us-east-1', instanceType: 'r5.large',
    });
    const m5 = calculateBaseline({
      resourceId: 'test', region: 'us-east-1', instanceType: 'm5.large',
    });

    // r5.large memory=16GB vs m5.large memory=8GB
    assert.ok(
      r5.assumptionsApplied.memoryWattsApplied > m5.assumptionsApplied.memoryWattsApplied,
      'r5.large should have higher memory watts than m5.large'
    );
    assert.ok(
      Math.abs(r5.assumptionsApplied.memoryWattsApplied - 6.272) < 0.001,
      `r5.large memory watts expected 6.272W, got ${r5.assumptionsApplied.memoryWattsApplied}`
    );
    assert.ok(r5.totalCo2eGramsPerMonth > m5.totalCo2eGramsPerMonth,
      'r5.large should have higher total CO2e than m5.large'
    );
  });

  it('4A: memory power is constant regardless of CPU utilization', () => {
    // Memory draws constant power — not affected by CPU utilisation
    const at0 = calculateBaseline({
      resourceId: 'test', region: 'us-east-1', instanceType: 'm5.large', avgUtilization: 0,
    });
    const at100 = calculateBaseline({
      resourceId: 'test', region: 'us-east-1', instanceType: 'm5.large', avgUtilization: 1,
    });

    // Memory watts should be identical regardless of utilization
    assert.equal(
      at0.assumptionsApplied.memoryWattsApplied,
      at100.assumptionsApplied.memoryWattsApplied,
      'Memory watts should be constant across utilization levels'
    );
  });

  // ---------------------------------------------------------------------------
  // Azure engine tests
  // ---------------------------------------------------------------------------

  it('Azure: calculates correct Scope 2 CO2e for Standard_D2s_v3 in eastus', () => {
    // Audit trace (v0.7.0 — includes memory power):
    // Instance: Standard_D2s_v3 (x86_64, 2 vCPU, 8GB)
    // CPU: idle=6.8W, max=20.4W → 13.6W at 50%
    // Memory: 8GB × 0.392 = 3.136W
    // Total: 16.736W
    // Region: eastus — grid=380.0 gCO2e/kWh, PUE=1.125, WUE=0.43 L/kWh
    // Scope 2: 16.736 × 1.125 × 730 / 1000 × 380.0 = 5,222.89 gCO2e/month
    // Scope 3: 1041.7 gCO2e/month (unchanged)
    // Water:   16.736 × 730 / 1000 × 0.43 = 5.253 L/month
    // Cost:    $0.096 × 730 = $70.08/month (unchanged)
    const result = calculateBaseline({
      resourceId: 'azurerm_linux_virtual_machine.api',
      instanceType: 'Standard_D2s_v3',
      region: 'eastus',
      provider: 'azure',
    });

    assert.equal(result.confidence, 'HIGH');
    assert.equal(result.scope, 'SCOPE_2_AND_3');
    assert.ok(Math.abs(result.totalCo2eGramsPerMonth - 5222.8872) < 0.01,
      `Scope 2 expected ~5222.89, got ${result.totalCo2eGramsPerMonth}`);
    assert.ok(Math.abs(result.embodiedCo2eGramsPerMonth - 1041.7) < 0.01, 'Scope 3 unchanged');
    assert.ok(Math.abs(result.waterLitresPerMonth - 5.25343) < 0.001,
      `Water expected ~5.25L, got ${result.waterLitresPerMonth}`);
    assert.ok(Math.abs(result.totalCostUsdPerMonth - 70.08) < 0.001, 'Cost unchanged');
  });

  it('Azure: ARM upgrade recommendation (Standard_D2s_v3 → Standard_D2ps_v5) produces savings', () => {
    const baseline = calculateBaseline({
      resourceId: 'test', instanceType: 'Standard_D2s_v3', region: 'eastus', provider: 'azure',
    });
    const arm = calculateBaseline({
      resourceId: 'test', instanceType: 'Standard_D2ps_v5', region: 'eastus', provider: 'azure',
    });

    assert.ok(arm.totalCo2eGramsPerMonth < baseline.totalCo2eGramsPerMonth, 'ARM should have lower Scope 2');
    assert.ok(arm.embodiedCo2eGramsPerMonth < baseline.embodiedCo2eGramsPerMonth, 'ARM lower embodied');
    assert.ok(arm.totalCostUsdPerMonth < baseline.totalCostUsdPerMonth, 'ARM cheaper');
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
    // Audit trace (v0.7.0 — includes memory power):
    // Instance: n2-standard-2 (x86_64, 2 vCPU, 8GB)
    // CPU: idle=6.8W, max=20.4W → 13.6W at 50%
    // Memory: 8GB × 0.392 = 3.136W
    // Total: 16.736W
    // Region: us-central1 (Iowa) — grid=340.0 gCO2e/kWh, PUE=1.10, WUE=0.40 L/kWh
    // Scope 2: 16.736 × 1.10 × 730 / 1000 × 340.0 = 4,569.26 gCO2e/month
    // Scope 3: 1041.7 gCO2e/month (unchanged)
    // Water:   16.736 × 730 / 1000 × 0.40 = 4.887 L/month
    // Cost:    $0.097 × 730 = $70.81/month (unchanged)
    const result = calculateBaseline({
      resourceId: 'google_compute_instance.web',
      instanceType: 'n2-standard-2',
      region: 'us-central1',
      provider: 'gcp',
    });

    assert.equal(result.confidence, 'HIGH');
    assert.equal(result.scope, 'SCOPE_2_AND_3');
    assert.ok(Math.abs(result.totalCo2eGramsPerMonth - 4569.26272) < 0.01,
      `Scope 2 expected ~4569.26, got ${result.totalCo2eGramsPerMonth}`);
    assert.ok(Math.abs(result.embodiedCo2eGramsPerMonth - 1041.7) < 0.01, 'Scope 3 unchanged');
    assert.ok(Math.abs(result.waterLitresPerMonth - 4.88691) < 0.001,
      `Water expected ~4.89L, got ${result.waterLitresPerMonth}`);
    assert.ok(Math.abs(result.totalCostUsdPerMonth - 70.81) < 0.001, 'Cost unchanged');
  });

  it('GCP: ARM upgrade recommendation (n2-standard-2 → t2a-standard-2) produces savings', () => {
    const baseline = calculateBaseline({
      resourceId: 'test', instanceType: 'n2-standard-2', region: 'us-central1', provider: 'gcp',
    });
    const arm = calculateBaseline({
      resourceId: 'test', instanceType: 't2a-standard-2', region: 'us-central1', provider: 'gcp',
    });

    assert.ok(arm.totalCo2eGramsPerMonth < baseline.totalCo2eGramsPerMonth, 'ARM lower Scope 2');
    assert.ok(arm.embodiedCo2eGramsPerMonth < baseline.embodiedCo2eGramsPerMonth, 'ARM lower embodied');
    assert.ok(arm.totalCostUsdPerMonth < baseline.totalCostUsdPerMonth, 'ARM cheaper');
    assert.ok(Math.abs(arm.embodiedCo2eGramsPerMonth - 833.3) < 0.01, 'ARM Scope 3 should be 833.3g');
  });

  it('GCP: GCP region has lower PUE than AWS (1.10 vs 1.13) — produces lower carbon than equivalent AWS', () => {
    const aws = calculateBaseline({
      resourceId: 'test', instanceType: 'm5.large', region: 'us-east-1', provider: 'aws',
    });
    const gcp = calculateBaseline({
      resourceId: 'test', instanceType: 'n2-standard-2', region: 'us-east1', provider: 'gcp',
    });
    assert.ok(gcp.totalCo2eGramsPerMonth < aws.totalCo2eGramsPerMonth,
      'GCP us-east1 should have lower Scope 2 than AWS us-east-1 due to lower PUE'
    );
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
