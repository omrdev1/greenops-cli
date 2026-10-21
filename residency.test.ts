import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import factors from './factors.json';
import { calculateBaseline, generateRecommendation } from './engine';
import type { CloudProvider } from './types';

const SAMPLE_INSTANCE: Record<CloudProvider, string> = {
  aws: 'm5.large', azure: 'Standard_D2s_v3', gcp: 'n2-standard-2',
};

function jurisdictionOf(provider: CloudProvider, region: string): string {
  return (factors[provider].regions as Record<string, { jurisdiction: string }>)[region].jurisdiction;
}

function recommend(provider: CloudProvider, region: string) {
  const input = { resourceId: 'x', instanceType: SAMPLE_INSTANCE[provider], region, provider };
  return generateRecommendation(input, calculateBaseline(input));
}

describe('data residency in region recommendations', () => {
  it('never suggests a region in a different jurisdiction, for any region on any provider', () => {
    for (const provider of ['aws', 'azure', 'gcp'] as const) {
      for (const region of Object.keys(factors[provider].regions)) {
        const target = recommend(provider, region)?.suggestedRegion;
        if (target) {
          assert.equal(jurisdictionOf(provider, target), jurisdictionOf(provider, region), `${provider} ${region} -> ${target}`);
        }
      }
    }
  });

  it('no longer moves a London workload to São Paulo', () => {
    assert.notEqual(recommend('aws', 'eu-west-2')?.suggestedRegion, 'sa-east-1');
  });

  it('says "at the same cost" rather than "saving $0.00" when the price does not change', () => {
    const rationale = recommend('aws', 'us-east-1')?.rationale ?? '';
    assert.match(rationale, /at the same cost/);
    assert.doesNotMatch(rationale, /\$0\.00/);
  });

  it('treats UK and EU/EEA regions as one jurisdiction', () => {
    assert.equal(jurisdictionOf('azure', 'uksouth'), jurisdictionOf('azure', 'swedencentral'));
    assert.equal(recommend('azure', 'uksouth')?.suggestedRegion, 'swedencentral');
  });
});
