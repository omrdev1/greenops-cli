import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { formatDelta, formatCostDelta, formatGrams, formatInstanceTypeLabel } from './util.js';

describe('formatDelta', () => {
  it('formats zero as positive (+0.00kg)', () => {
    assert.equal(formatDelta(0), '+0.00kg');
  });

  it('formats negative values with minus sign', () => {
    assert.equal(formatDelta(-1500), '-1.50kg');
  });

  it('formats positive values with plus sign', () => {
    assert.equal(formatDelta(2000), '+2.00kg');
  });
});

describe('formatCostDelta', () => {
  it('formats zero as positive (+$0.00)', () => {
    assert.equal(formatCostDelta(0), '+$0.00');
  });

  it('formats negative values with minus sign', () => {
    assert.equal(formatCostDelta(-13.87), '-$13.87');
  });

  it('formats positive values with plus sign', () => {
    assert.equal(formatCostDelta(5.50), '+$5.50');
  });
});

describe('formatGrams', () => {
  it('converts grams to kg with 2 decimal places', () => {
    assert.equal(formatGrams(4313.567), '4.31kg');
  });

  it('handles zero', () => {
    assert.equal(formatGrams(0), '0.00kg');
  });
});

describe('formatInstanceTypeLabel', () => {
  it('renders serverless: encoding as plain "serverless"', () => {
    assert.equal(formatInstanceTypeLabel('serverless:128mb:1000000inv:200ms'), 'serverless');
  });

  it('renders a managed_ai:sagemaker: encoding as "ml.<type> (SageMaker)"', () => {
    assert.equal(formatInstanceTypeLabel('managed_ai:sagemaker:g5.xlarge'), 'ml.g5.xlarge (SageMaker)');
  });

  it('renders a gpu_attached: encoding as "<machine> + Nx GPU"', () => {
    assert.equal(formatInstanceTypeLabel('gpu_attached:n2-standard-2:70:1'), 'n2-standard-2 + 1x GPU');
    assert.equal(formatInstanceTypeLabel('gpu_attached:n2-standard-2:70:2'), 'n2-standard-2 + 2x GPU');
  });

  it('passes through a plain instance type unchanged', () => {
    assert.equal(formatInstanceTypeLabel('m5.large'), 'm5.large');
    assert.equal(formatInstanceTypeLabel('p4d.24xlarge'), 'p4d.24xlarge');
  });
});
