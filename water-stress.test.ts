import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import factors from './factors.json';
import { calculateBaseline, generateRecommendation } from './engine';
import type { CloudProvider } from './types';

// WRI Aqueduct 4.0 baseline water stress, 0 (Low) to 4 (Extremely High); null = no data.
function stressOf(provider: CloudProvider, region: string): number | null {
  const regions = factors[provider].regions as Record<string, { baseline_water_stress: number | null }>;
  return regions[region].baseline_water_stress;
}

function recommend(region: string, provider: CloudProvider = 'aws', instanceType = 'm5.large') {
  const input = { resourceId: 'x', instanceType, region, provider };
  return generateRecommendation(input, calculateBaseline(input));
}

describe('water stress in region recommendations', () => {
  it('does not move a workload from London to a more water-stressed region', () => {
    const rec = recommend('eu-west-2');
    if (rec?.suggestedRegion) {
      assert.ok(stressOf('aws', rec.suggestedRegion)! <= stressOf('aws', 'eu-west-2')!);
    }
    assert.notEqual(rec?.suggestedRegion, 'eu-north-1');
  });

  it('still suggests a cleaner region in the same water-stress band', () => {
    // Ireland and London are both Low - Medium (1)
    assert.equal(recommend('eu-west-1', 'aws', 'm5.xlarge')?.suggestedRegion, 'eu-west-2');
  });

  it('does not let missing water-stress data block a suggestion', () => {
    // No same-jurisdiction alternative has null stress in the real ledger, so
    // blank out Stockholm's band and check it becomes eligible from Ireland again.
    const ledger = structuredClone(factors) as typeof factors;
    (ledger.aws.regions['eu-north-1'] as { baseline_water_stress: number | null }).baseline_water_stress = null;
    const input = { resourceId: 'x', instanceType: 'm5.xlarge', region: 'eu-west-1', provider: 'aws' as const };
    const rec = generateRecommendation(input, calculateBaseline(input, ledger as never), ledger as never);
    assert.equal(rec?.suggestedRegion, 'eu-north-1');
    assert.match(rec?.rationale ?? '', /no water-stress data/);
  });

  it('names the target region\'s water-stress band in the rationale', () => {
    assert.match(recommend('eu-west-1', 'aws', 'm5.xlarge')?.rationale ?? '', /water stress.*Low - Medium \(10-20%\)/i);
  });
});
