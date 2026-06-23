import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { calculateBaseline, generateRecommendation } from './engine';

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

  // ---------------------------------------------------------------------------
  // t2 series — kunduso compatibility tests
  // ---------------------------------------------------------------------------

  it('t2.micro: calculates Scope 2 CO2e in us-east-1 (HIGH confidence)', () => {
    const result = calculateBaseline({
      resourceId: 'aws_instance.web', instanceType: 't2.micro', region: 'us-east-1', provider: 'aws',
    });
    assert.equal(result.confidence, 'HIGH');
    assert.ok(result.totalCo2eGramsPerMonth > 0);
    assert.ok(result.totalCo2eGramsPerMonth < 2000, 't2.micro should emit less than 2kg CO2e/month');
    assert.equal(result.assumptionsApplied.powerModelUsed, 'LINEAR_INTERPOLATION');
  });

  it('t2.micro: emits less than t3.micro (lower power spec)', () => {
    const t2 = calculateBaseline({ resourceId: 'x', instanceType: 't2.micro', region: 'us-east-1', provider: 'aws' });
    const t3 = calculateBaseline({ resourceId: 'x', instanceType: 't3.micro', region: 'us-east-1', provider: 'aws' });
    assert.ok(t2.totalCo2eGramsPerMonth < t3.totalCo2eGramsPerMonth, 't2.micro should emit less than t3.micro');
  });

  it('t2.micro: generates a recommendation in us-east-1', () => {
    const input = { resourceId: 'x', instanceType: 't2.micro', region: 'us-east-1', provider: 'aws' as const };
    const baseline = calculateBaseline(input);
    const rec = generateRecommendation(input, baseline);
    assert.ok(rec !== null, 'Should recommend region shift or ARM upgrade for t2.micro in us-east-1');
  });

  // ---------------------------------------------------------------------------
  // nodeCount — Kubernetes node group support (EKS/AKS/GKE)
  // ---------------------------------------------------------------------------

  it('nodeCount defaults to 1 when absent (backward compatible)', () => {
    const withCount = calculateBaseline({
      resourceId: 'x', instanceType: 'm5.large', region: 'us-east-1', provider: 'aws', nodeCount: 1,
    });
    const withoutCount = calculateBaseline({
      resourceId: 'x', instanceType: 'm5.large', region: 'us-east-1', provider: 'aws',
    });
    assert.equal(withCount.totalCo2eGramsPerMonth, withoutCount.totalCo2eGramsPerMonth);
    assert.equal(withCount.totalCostUsdPerMonth, withoutCount.totalCostUsdPerMonth);
  });

  it('nodeCount scales Scope 2, Scope 3, water, and cost linearly', () => {
    const single = calculateBaseline({
      resourceId: 'x', instanceType: 'm5.large', region: 'us-east-1', provider: 'aws',
    });
    const triple = calculateBaseline({
      resourceId: 'x', instanceType: 'm5.large', region: 'us-east-1', provider: 'aws', nodeCount: 3,
    });

    assert.equal(triple.totalCo2eGramsPerMonth, single.totalCo2eGramsPerMonth * 3);
    assert.equal(triple.embodiedCo2eGramsPerMonth, single.embodiedCo2eGramsPerMonth * 3);
    assert.equal(triple.waterLitresPerMonth, single.waterLitresPerMonth * 3);
    assert.equal(triple.totalCostUsdPerMonth, single.totalCostUsdPerMonth * 3);
    assert.equal(
      triple.totalLifecycleCo2eGramsPerMonth,
      triple.totalCo2eGramsPerMonth + triple.embodiedCo2eGramsPerMonth
    );
  });

  it('nodeCount does not change confidence or assumptions metadata, only output magnitude', () => {
    const single = calculateBaseline({
      resourceId: 'x', instanceType: 'm5.large', region: 'us-east-1', provider: 'aws',
    });
    const five = calculateBaseline({
      resourceId: 'x', instanceType: 'm5.large', region: 'us-east-1', provider: 'aws', nodeCount: 5,
    });
    assert.equal(five.confidence, single.confidence);
    assert.deepEqual(five.assumptionsApplied, single.assumptionsApplied);
  });

  it('recommendation deltas scale with nodeCount (ARM upgrade on a 4-node group)', () => {
    const input = {
      resourceId: 'aws_eks_node_group.workers', instanceType: 'm5.large', region: 'us-east-1',
      provider: 'aws' as const, nodeCount: 4,
    };
    const singleInput = { ...input, nodeCount: 1 };

    const baseline = calculateBaseline(input);
    const singleBaseline = calculateBaseline(singleInput);
    const rec = generateRecommendation(input, baseline);
    const singleRec = generateRecommendation(singleInput, singleBaseline);

    assert.ok(rec !== null && singleRec !== null, 'Both should recommend an upgrade');
    // The per-node delta should be identical; the node-group delta should be 4x.
    assert.equal(rec!.co2eDeltaGramsPerMonth, singleRec!.co2eDeltaGramsPerMonth * 4);
    assert.equal(rec!.costDeltaUsdPerMonth, singleRec!.costDeltaUsdPerMonth * 4);
  });
});

describe('calculateBaseline: GPU instances', () => {
  it('calculates real Scope 2 carbon for g5.xlarge using NVIDIA A10G TDP, but flags embodied as not yet modeled', () => {
    const result = calculateBaseline({
      resourceId: 'aws_instance.gpu_worker', instanceType: 'g5.xlarge', region: 'us-east-1', provider: 'aws',
    });
    assert.ok(result.totalCo2eGramsPerMonth > 0, 'Scope 2 should be calculated from real GPU TDP');
    assert.equal(result.embodiedCo2eGramsPerMonth, 0, 'Embodied carbon not yet modeled for GPU hardware');
    assert.equal(result.confidence, 'LOW_ASSUMED_DEFAULT', 'Unmodeled embodied carbon must downgrade confidence');
    assert.ok(result.unsupportedReason?.includes('Embodied'), 'Reason must explain the embodied-carbon gap specifically');
    assert.ok(result.totalCostUsdPerMonth > 0, 'Real pricing should still be applied');
  });

  it('p4d.24xlarge (8x A100) produces far higher Scope 2 carbon than a CPU instance of similar vCPU count', () => {
    const gpu = calculateBaseline({
      resourceId: 'x', instanceType: 'p4d.24xlarge', region: 'us-east-1', provider: 'aws',
    });
    const cpu = calculateBaseline({
      resourceId: 'x', instanceType: 'c5.4xlarge', region: 'us-east-1', provider: 'aws',
    });
    assert.ok(gpu.totalCo2eGramsPerMonth > cpu.totalCo2eGramsPerMonth * 10,
      'An 8x A100 node should be at least an order of magnitude more carbon-intensive than a CPU instance');
  });

  it('p5.48xlarge (8x H100) produces higher Scope 2 carbon than p4d.24xlarge (8x A100), matching real TDP ratio', () => {
    const h100 = calculateBaseline({
      resourceId: 'x', instanceType: 'p5.48xlarge', region: 'us-east-1', provider: 'aws',
    });
    const a100 = calculateBaseline({
      resourceId: 'x', instanceType: 'p4d.24xlarge', region: 'us-east-1', provider: 'aws',
    });
    assert.ok(h100.totalCo2eGramsPerMonth > a100.totalCo2eGramsPerMonth,
      'H100 (700W TDP) should draw more power than A100 (400W TDP) per GPU');
  });

  it('GPU node groups (EKS/AKS/GKE) scale GPU carbon linearly with nodeCount, same as CPU node groups', () => {
    const single = calculateBaseline({
      resourceId: 'x', instanceType: 'g5.xlarge', region: 'us-east-1', provider: 'aws',
    });
    const triple = calculateBaseline({
      resourceId: 'x', instanceType: 'g5.xlarge', region: 'us-east-1', provider: 'aws', nodeCount: 3,
    });
    assert.equal(triple.totalCo2eGramsPerMonth, single.totalCo2eGramsPerMonth * 3);
    assert.equal(triple.confidence, single.confidence, 'GPU node groups stay LOW_ASSUMED_DEFAULT regardless of node count');
  });

  it('does not generate an upgrade recommendation for GPU instances (LOW_ASSUMED_DEFAULT baselines are excluded)', () => {
    const baseline = calculateBaseline({
      resourceId: 'x', instanceType: 'g5.xlarge', region: 'us-east-1', provider: 'aws',
    });
    const rec = generateRecommendation(
      { resourceId: 'x', instanceType: 'g5.xlarge', region: 'us-east-1', provider: 'aws' },
      baseline
    );
    assert.equal(rec, null, 'Recommendations require a confident baseline; GPU embodied-carbon gap should suppress them');
  });
});

describe('calculateBaseline: Azure GPU instances (NCasT4_v3 series)', () => {
  it('calculates real Scope 2 carbon for Standard_NC8as_T4_v3 using NVIDIA T4 TDP, but flags embodied as not yet modeled', () => {
    const result = calculateBaseline({
      resourceId: 'azurerm_linux_virtual_machine.gpu_worker', instanceType: 'Standard_NC8as_T4_v3', region: 'eastus', provider: 'azure',
    });
    assert.ok(result.totalCo2eGramsPerMonth > 0, 'Scope 2 should be calculated from real GPU TDP');
    assert.equal(result.embodiedCo2eGramsPerMonth, 0, 'Embodied carbon not yet modeled for GPU hardware');
    assert.equal(result.confidence, 'LOW_ASSUMED_DEFAULT', 'Unmodeled embodied carbon must downgrade confidence');
    assert.ok(result.unsupportedReason?.includes('Embodied'), 'Reason must explain the embodied-carbon gap specifically');
    assert.ok(result.totalCostUsdPerMonth > 0, 'Real pricing should still be applied');
  });

  it('Standard_NC4as_T4_v3, NC8as_T4_v3, and NC16as_T4_v3 all carry the same single-T4 GPU draw (only host vCPU/memory differs)', () => {
    const nc4 = calculateBaseline({ resourceId: 'x', instanceType: 'Standard_NC4as_T4_v3', region: 'eastus', provider: 'azure' });
    const nc16 = calculateBaseline({ resourceId: 'x', instanceType: 'Standard_NC16as_T4_v3', region: 'eastus', provider: 'azure' });
    assert.ok(nc16.totalCostUsdPerMonth > nc4.totalCostUsdPerMonth,
      'NC16as (16 vCPU) should cost more per month than NC4as (4 vCPU) despite the same single GPU');
  });

  it('does not generate an upgrade recommendation for Azure GPU instances (LOW_ASSUMED_DEFAULT baselines are excluded)', () => {
    const baseline = calculateBaseline({
      resourceId: 'x', instanceType: 'Standard_NC8as_T4_v3', region: 'eastus', provider: 'azure',
    });
    const rec = generateRecommendation(
      { resourceId: 'x', instanceType: 'Standard_NC8as_T4_v3', region: 'eastus', provider: 'azure' },
      baseline
    );
    assert.equal(rec, null, 'Recommendations require a confident baseline; GPU embodied-carbon gap should suppress them');
  });
});

describe('calculateBaseline: managed AI services (SageMaker)', () => {
  it('calculates real Scope 2 carbon for a CPU SageMaker endpoint, using a SageMaker-specific price premium over raw EC2', () => {
    const sagemaker = calculateBaseline({
      resourceId: 'x', instanceType: 'managed_ai:sagemaker:m5.xlarge', region: 'us-east-1', provider: 'aws',
    });
    const rawEc2 = calculateBaseline({
      resourceId: 'x', instanceType: 'm5.xlarge', region: 'us-east-1', provider: 'aws',
    });
    assert.ok(sagemaker.totalCo2eGramsPerMonth > 0, 'Should calculate real Scope 2 carbon');
    assert.equal(sagemaker.confidence, 'LOW_ASSUMED_DEFAULT', 'Managed AI usage assumptions always downgrade confidence');
    assert.ok(sagemaker.totalCostUsdPerMonth > rawEc2.totalCostUsdPerMonth,
      'SageMaker pricing must be a real premium over raw EC2, never derived from it');
  });

  it('reuses GPU instance specs for a GPU-backed SageMaker endpoint and flags the same embodied-carbon gap', () => {
    const result = calculateBaseline({
      resourceId: 'x', instanceType: 'managed_ai:sagemaker:p4d.24xlarge', region: 'us-east-1', provider: 'aws',
    });
    assert.ok(result.totalCo2eGramsPerMonth > 1000, 'An 8x A100 SageMaker endpoint should have substantial Scope 2 carbon');
    assert.equal(result.embodiedCo2eGramsPerMonth, 0, 'Embodied carbon gap applies the same as raw GPU instances');
    assert.ok(result.unsupportedReason?.includes('not yet modeled'), 'Should mention the embodied-carbon gap specifically');
  });

  it('returns LOW_ASSUMED_DEFAULT with no cost/carbon for a base instance not in the ledger', () => {
    const result = calculateBaseline({
      resourceId: 'x', instanceType: 'managed_ai:sagemaker:c5.24xlarge', region: 'us-east-1', provider: 'aws',
    });
    assert.equal(result.totalCo2eGramsPerMonth, 0);
    assert.equal(result.totalCostUsdPerMonth, 0);
    assert.ok(result.unsupportedReason?.includes('not present in the AWS section'));
  });

  it('returns LOW_ASSUMED_DEFAULT with no cost/carbon when no managed AI pricing exists for the region', () => {
    const result = calculateBaseline({
      resourceId: 'x', instanceType: 'managed_ai:sagemaker:m5.xlarge', region: 'eu-west-1', provider: 'aws',
    });
    assert.equal(result.totalCostUsdPerMonth, 0);
    assert.ok(result.unsupportedReason?.includes('No managed AI pricing data'));
  });

  it('does not generate an upgrade recommendation for managed AI services (LOW_ASSUMED_DEFAULT baselines excluded)', () => {
    const baseline = calculateBaseline({
      resourceId: 'x', instanceType: 'managed_ai:sagemaker:m5.xlarge', region: 'us-east-1', provider: 'aws',
    });
    const rec = generateRecommendation(
      { resourceId: 'x', instanceType: 'managed_ai:sagemaker:m5.xlarge', region: 'us-east-1', provider: 'aws' },
      baseline
    );
    assert.equal(rec, null);
  });
});

describe('calculateBaseline: GPU-attached compute (Vertex AI Workbench)', () => {
  it('adds T4 GPU wattage on top of the base machine, billed at raw GCE rate plus the standalone GPU add-on (no managed-service markup)', () => {
    const withGpu = calculateBaseline({
      resourceId: 'x', instanceType: 'gpu_attached:n2-standard-2:70:1', region: 'us-central1', provider: 'gcp',
    });
    const withoutGpu = calculateBaseline({
      resourceId: 'x', instanceType: 'n2-standard-2', region: 'us-central1', provider: 'gcp',
    });
    assert.ok(withGpu.totalCo2eGramsPerMonth > withoutGpu.totalCo2eGramsPerMonth,
      'GPU-attached carbon must exceed the base machine alone');
    assert.ok(withGpu.totalCostUsdPerMonth > withoutGpu.totalCostUsdPerMonth,
      'GPU-attached cost must exceed the base machine alone (real GPU add-on rate)');
    assert.equal(withGpu.confidence, 'LOW_ASSUMED_DEFAULT');
  });

  it('multiple attached GPU cores scale both carbon and cost linearly', () => {
    const oneGpu = calculateBaseline({
      resourceId: 'x', instanceType: 'gpu_attached:n2-standard-2:70:1', region: 'us-central1', provider: 'gcp',
    });
    const twoGpu = calculateBaseline({
      resourceId: 'x', instanceType: 'gpu_attached:n2-standard-2:70:2', region: 'us-central1', provider: 'gcp',
    });
    assert.ok(twoGpu.totalCo2eGramsPerMonth > oneGpu.totalCo2eGramsPerMonth);
    assert.ok(twoGpu.totalCostUsdPerMonth > oneGpu.totalCostUsdPerMonth);
  });

  it('returns LOW_ASSUMED_DEFAULT with no cost/carbon for a base machine not in the ledger', () => {
    const result = calculateBaseline({
      resourceId: 'x', instanceType: 'gpu_attached:n1-standard-1:70:1', region: 'us-central1', provider: 'gcp',
    });
    assert.equal(result.totalCo2eGramsPerMonth, 0);
    assert.ok(result.unsupportedReason?.includes('not present in the GCP section'));
  });
});
