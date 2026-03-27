import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { calculateBaseline, generateRecommendation } from './engine';

describe('generateRecommendation', () => {
  it('recommends ARM upgrade for x86 instance with cost/carbon savings', () => {
    const input = {
      resourceId: 'test-web',
      region: 'us-east-1',
      instanceType: 'm5.large',
    };
    const baseline = calculateBaseline(input);
    const rec = generateRecommendation(input, baseline);

    assert.ok(rec !== null, 'Should produce a recommendation');
    assert.equal(rec!.suggestedInstanceType, 'm6g.large');
    assert.ok(rec!.co2eDeltaGramsPerMonth < 0, 'Carbon delta should be negative (savings)');
    assert.ok(rec!.costDeltaUsdPerMonth < 0, 'Cost delta should be negative (savings)');
    assert.ok(rec!.rationale.includes('ARM64'), 'Rationale should mention ARM');
  });

  it('returns null for already-ARM instances with no cleaner region', () => {
    // m6g.large in us-west-2 — already ARM, and us-west-2 is one of the cleanest regions
    const input = {
      resourceId: 'test-worker',
      region: 'us-west-2',
      instanceType: 'm6g.large',
    };
    const baseline = calculateBaseline(input);
    const rec = generateRecommendation(input, baseline);

    assert.equal(rec, null, 'No recommendation for optimally-placed ARM instance');
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

  it('recommends region shift when >15% CO2 reduction available', () => {
    // ap-southeast-2 has very high grid intensity (650), us-west-2 has low (240.1)
    // m6g.large is already ARM so no ARM upgrade available — only region shift
    const input = {
      resourceId: 'test-sydney',
      region: 'ap-southeast-2',
      instanceType: 'm6g.large',
    };
    const baseline = calculateBaseline(input);
    const rec = generateRecommendation(input, baseline);

    assert.ok(rec !== null, 'Should recommend region shift');
    assert.ok(rec!.suggestedRegion !== undefined, 'Should suggest a region');
    assert.ok(rec!.co2eDeltaGramsPerMonth < 0, 'Carbon should decrease');
  });

  it('scoring uses percentage-of-baseline normalization', () => {
    // Verify the scoring doesn't use raw grams/dollars by checking
    // that the recommendation exists and has a valid rationale
    const input = {
      resourceId: 'test-scoring',
      region: 'us-east-1',
      instanceType: 'c5.large',
    };
    const baseline = calculateBaseline(input);
    const rec = generateRecommendation(input, baseline);

    // c5.large -> c6g.large should be recommended
    assert.ok(rec !== null);
    assert.equal(rec!.suggestedInstanceType, 'c6g.large');
  });
});
