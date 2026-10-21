import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { buildEstimateInput } from './estimate';

function runCli(...args: string[]) {
  return spawnSync('npx', ['tsx', 'cli.ts', ...args], { encoding: 'utf8' });
}

describe('buildEstimateInput', () => {
  it('builds a single resource from provider, region and instance type', () => {
    assert.deepEqual(buildEstimateInput(['aws', 'us-east-1', 'm5.large']), {
      input: { resourceId: 'estimate', provider: 'aws', region: 'us-east-1', instanceType: 'm5.large' },
    });
  });

  it('applies --hours and --count', () => {
    const { input } = buildEstimateInput(['gcp', 'us-central1', 'n2-standard-2'], '200', '3');
    assert.equal(input?.hoursPerMonth, 200);
    assert.equal(input?.nodeCount, 3);
  });

  it('rejects an unknown provider', () => {
    assert.match(buildEstimateInput(['oracle', 'x', 'y']).error ?? '', /provider/i);
  });

  it('rejects missing arguments', () => {
    assert.match(buildEstimateInput(['aws', 'us-east-1']).error ?? '', /usage/i);
  });

  it('rejects a count that is not a positive whole number', () => {
    assert.match(buildEstimateInput(['aws', 'us-east-1', 'm5.large'], undefined, '1.5').error ?? '', /count/i);
    assert.match(buildEstimateInput(['aws', 'us-east-1', 'm5.large'], undefined, '0').error ?? '', /count/i);
  });

  it('rejects non-positive hours', () => {
    assert.match(buildEstimateInput(['aws', 'us-east-1', 'm5.large'], '-5').error ?? '', /hours/i);
  });
});

describe('greenops-cli estimate', () => {
  it('prints a JSON estimate with a recommendation, without a plan file', () => {
    const run = runCli('estimate', 'aws', 'us-east-1', 'm5.large', '--format', 'json');
    assert.equal(run.status, 0, run.stderr);
    const { result } = JSON.parse(run.stdout);
    assert.equal(result.resources[0].input.instanceType, 'm5.large');
    assert.equal(result.resources[0].recommendation.suggestedRegion, 'us-west-2');
  });

  it('tells the reader what to change, not just that a change exists', () => {
    const run = runCli('estimate', 'aws', 'us-east-1', 'm5.large');
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /Moving m5\.large from us-east-1 to .*us-west-2/);
  });

  it('exits 1 with the reason when the instance is not in the ledger', () => {
    const run = runCli('estimate', 'aws', 'us-east-1', 'm99.huge');
    assert.equal(run.status, 1);
    assert.match(run.stderr, /m99\.huge/);
  });
});
