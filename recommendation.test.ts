import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { calculateBaseline, generateRecommendation } from './engine';

describe('generateRecommendation', () => {
  it('recommends something for x86 instance in high-carbon region', () => {
    // m5.large us-east-1 (384.5 gCO2e/kWh) — with 14 regions in the ledger,
    // eu-north-1 (Stockholm, 8.8 gCO2e/kWh) now wins the scoring over the ARM
    // upgrade because a 97.7% carbon reduction outweighs ARM's 36.4% reduction.
    // The engine is behaving correctly — we assert the recommendation exists
    // and delivers a significant carbon saving, not a specific strategy.
    const input = {
      resourceId: 'test-web',
      region: 'us-east-1',
      instanceType: 'm5.large',
    };
    const baseline = calculateBaseline(input);
    const rec = generateRecommendation(input, baseline);

    assert.ok(rec !== null, 'Should produce a recommendation');
    assert.ok(rec!.co2eDeltaGramsPerMonth < 0, 'Carbon delta should be negative (savings)');
    // With eu-north-1 as the best option, carbon savings should be >30% of baseline
    const savingsPct = Math.abs(rec!.co2eDeltaGramsPerMonth) / baseline.totalCo2eGramsPerMonth;
    assert.ok(savingsPct > 0.30, `Expected >30% carbon savings, got ${(savingsPct * 100).toFixed(1)}%`);
  });

  it('recommends ARM upgrade when already in cleanest region', () => {
    // eu-north-1 (Stockholm) is the lowest-carbon region in the ledger (8.8 gCO2e/kWh).
    // No region shift can beat it, so the engine should fall through to ARM upgrade.
    // m5.large -> m6g.large gives ~36% carbon reduction and ~19% cost reduction.
    const input = {
      resourceId: 'test-web-north',
      region: 'eu-north-1',
      instanceType: 'm5.large',
    };
    const baseline = calculateBaseline(input);
    const rec = generateRecommendation(input, baseline);

    assert.ok(rec !== null, 'Should recommend ARM upgrade in cleanest region');
    assert.equal(rec!.suggestedInstanceType, 'm6g.large', 'Should suggest ARM equivalent');
    assert.ok(rec!.co2eDeltaGramsPerMonth < 0, 'Carbon delta should be negative');
    assert.ok(rec!.costDeltaUsdPerMonth < 0, 'Cost delta should be negative');
    assert.ok(rec!.rationale.includes('ARM64'), 'Rationale should mention ARM64');
  });

  it('returns null for already-ARM instance in cleanest region', () => {
    // m6g.large in eu-north-1 — already ARM, already in the lowest-carbon region.
    // No ARM upgrade available (already ARM64), no region shift improves things.
    // This should be null — the resource is optimally placed.
    const input = {
      resourceId: 'test-worker',
      region: 'eu-north-1',
      instanceType: 'm6g.large',
    };
    const baseline = calculateBaseline(input);
    const rec = generateRecommendation(input, baseline);

    assert.equal(rec, null, 'No recommendation for optimally-placed ARM instance in cleanest region');
  });

  it('returns null for LOW_ASSUMED_DEFAULT baselines', () => {
    const input = {
      resourceId: 'test-unknown',
      region: 'us-east-1',
      instanceType: 'x99.superlarge',
    };
    const baseline = calculateBaseline(input);
    assert.equal(baseline.confidence, 'LOW_ASSUMED_DEFAULT');

    const rec = generateRecommendation(input, baseline);
    assert.equal(rec, null, 'Cannot recommend for unsupported resources');
  });

  it('recommends region shift when already-ARM and cleaner region available', () => {
    // m6g.large in ap-southeast-2 (Sydney, 650 gCO2e/kWh) — already ARM so no ARM upgrade.
    // Multiple regions are significantly cleaner — should recommend a region shift.
    const input = {
      resourceId: 'test-sydney',
      region: 'ap-southeast-2',
      instanceType: 'm6g.large',
    };
    const baseline = calculateBaseline(input);
    const rec = generateRecommendation(input, baseline);

    assert.ok(rec !== null, 'Should recommend region shift from high-carbon region');
    assert.ok(rec!.suggestedRegion !== undefined, 'Should suggest a target region');
    assert.ok(rec!.co2eDeltaGramsPerMonth < 0, 'Carbon should decrease');
  });

  it('scoring selects the highest-impact recommendation', () => {
    // c5.large us-east-1 — ARM upgrade (c6g.large) gives ~36% CO2 saving.
    // eu-north-1 region shift gives ~97% CO2 saving.
    // The scoring (60% CO2 weight, 40% cost weight) should pick eu-north-1.
    const input = {
      resourceId: 'test-scoring',
      region: 'us-east-1',
      instanceType: 'c5.large',
    };
    const baseline = calculateBaseline(input);
    const rec = generateRecommendation(input, baseline);

    assert.ok(rec !== null, 'Should produce a recommendation');
    // eu-north-1 wins on CO2 by a wide margin — assert it's a region recommendation
    assert.ok(rec!.suggestedRegion !== undefined, 'High-CO2-impact region shift should win scoring');
    assert.ok(rec!.co2eDeltaGramsPerMonth < 0, 'Carbon delta should be negative');
    // Carbon saving should be substantial (>80% given eu-north-1's low intensity)
    const savingsPct = Math.abs(rec!.co2eDeltaGramsPerMonth) / baseline.totalCo2eGramsPerMonth;
    assert.ok(savingsPct > 0.80, `Expected >80% carbon savings from region shift, got ${(savingsPct * 100).toFixed(1)}%`);
  });
});
