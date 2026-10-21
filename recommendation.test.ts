import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { calculateBaseline, generateRecommendation } from './engine';

describe('generateRecommendation', () => {
  it('recommends something for x86 instance in high-carbon region', () => {
    // m5.large us-east-1 (384.5 gCO2e/kWh) — with 14 regions in the ledger,
    // eu-north-1 (Stockholm, 8.8 gCO2e/kWh) is a real, large carbon reduction.
    // ARM-upgrade recommendations were removed in v2.1.0 (no real Graviton/Ampere
    // Altra power data exists — see METHODOLOGY.md's Known Limitations), so the
    // only strategy left is region shift; assert it fires and delivers a real saving.
    const input = {
      resourceId: 'test-web',
      region: 'us-east-1',
      instanceType: 'm5.large',
    };
    const baseline = calculateBaseline(input);
    const rec = generateRecommendation(input, baseline);

    assert.ok(rec !== null, 'Should produce a recommendation');
    assert.ok(rec!.suggestedRegion !== undefined, 'Should be a region-shift recommendation (ARM strategy removed)');
    assert.ok(rec!.co2eDeltaGramsPerMonth < 0, 'Carbon delta should be negative (savings)');
    const savingsPct = Math.abs(rec!.co2eDeltaGramsPerMonth) / baseline.totalCo2eGramsPerMonth;
    assert.ok(savingsPct > 0.30, `Expected >30% carbon savings, got ${(savingsPct * 100).toFixed(1)}%`);
  });

  it('returns null when already in the cleanest region (no ARM fallback available)', () => {
    // eu-north-1 (Stockholm) is the lowest-carbon region in the ledger (8.8 gCO2e/kWh).
    // No region shift can beat it. ARM-upgrade recommendations were removed in
    // v2.1.0, so there is no fallback strategy — the engine should return null
    // rather than recommend a switch this ledger has no real data to support.
    const input = {
      resourceId: 'test-web-north',
      region: 'eu-north-1',
      instanceType: 'm5.large',
    };
    const baseline = calculateBaseline(input);
    const rec = generateRecommendation(input, baseline);

    assert.equal(rec, null, 'No recommendation available once already in the cleanest region');
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

  it('does not suggest leaving Australia, even though cleaner regions exist abroad', () => {
    // c5.large in ap-southeast-2 (Sydney, 650 gCO2e/kWh). Every cleaner region in the
    // ledger is in another jurisdiction, and v2.2.0 keeps region shifts within one.
    const input = {
      resourceId: 'test-sydney',
      region: 'ap-southeast-2',
      instanceType: 'c5.large',
    };
    const baseline = calculateBaseline(input);
    assert.equal(generateRecommendation(input, baseline), null);
  });

  it('region-shift recommendation delivers a substantial carbon saving', () => {
    // c5.large us-east-1 (384.5 g/kWh) -> us-west-2 (240.1 g/kWh): ~37.6% saving.
    // Stays in the US (residency guard) and Oregon is a lower water-stress band than Virginia.
    const input = {
      resourceId: 'test-scoring',
      region: 'us-east-1',
      instanceType: 'c5.large',
    };
    const baseline = calculateBaseline(input);
    const rec = generateRecommendation(input, baseline);

    assert.ok(rec !== null, 'Should produce a recommendation');
    assert.equal(rec!.suggestedRegion, 'us-west-2');
    assert.ok(rec!.co2eDeltaGramsPerMonth < 0, 'Carbon delta should be negative');
    const savingsPct = Math.abs(rec!.co2eDeltaGramsPerMonth) / baseline.totalCo2eGramsPerMonth;
    assert.ok(savingsPct > 0.35, `Expected >35% carbon savings from region shift, got ${(savingsPct * 100).toFixed(1)}%`);
  });
});
