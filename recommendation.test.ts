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

  it('recommends region shift from a high-carbon region', () => {
    // c5.large in ap-southeast-2 (Sydney, 650 gCO2e/kWh) — multiple regions are
    // significantly cleaner. ARM-upgrade recommendations were removed in v2.1.0,
    // so region shift is the only strategy; assert it fires here.
    const input = {
      resourceId: 'test-sydney',
      region: 'ap-southeast-2',
      instanceType: 'c5.large',
    };
    const baseline = calculateBaseline(input);
    const rec = generateRecommendation(input, baseline);

    assert.ok(rec !== null, 'Should recommend region shift from high-carbon region');
    assert.ok(rec!.suggestedRegion !== undefined, 'Should suggest a target region');
    assert.ok(rec!.co2eDeltaGramsPerMonth < 0, 'Carbon should decrease');
  });

  it('region-shift recommendation delivers a substantial carbon saving', () => {
    // c5.large us-east-1 -> eu-north-1 region shift gives a very large CO2 saving
    // (Stockholm's grid is close to zero-carbon). ARM-upgrade recommendations
    // were removed in v2.1.0, so region shift is the only strategy in play.
    const input = {
      resourceId: 'test-scoring',
      region: 'us-east-1',
      instanceType: 'c5.large',
    };
    const baseline = calculateBaseline(input);
    const rec = generateRecommendation(input, baseline);

    assert.ok(rec !== null, 'Should produce a recommendation');
    assert.ok(rec!.suggestedRegion !== undefined, 'Should be a region-shift recommendation');
    assert.ok(rec!.co2eDeltaGramsPerMonth < 0, 'Carbon delta should be negative');
    // Carbon saving should be substantial given eu-north-1's near-zero intensity
    const savingsPct = Math.abs(rec!.co2eDeltaGramsPerMonth) / baseline.totalCo2eGramsPerMonth;
    assert.ok(savingsPct > 0.80, `Expected >80% carbon savings from region shift, got ${(savingsPct * 100).toFixed(1)}%`);
  });
});
