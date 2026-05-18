import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { calculateBaseline, generateRecommendation } from './engine';

// ---------------------------------------------------------------------------
// Serverless estimation tests — Phase 4B
// ---------------------------------------------------------------------------

describe('Serverless: aws_lambda_function estimation', () => {
  it('calculates Scope 2 CO2e for a 128MB Lambda in us-east-1 at default invocations', () => {
    // Model:
    //   memory_gb = 128 / 1024 = 0.125GB
    //   powerW    = (0.125 × 0.392) + 0.002 = 0.049 + 0.002 = 0.051W
    //   compute_seconds = (200ms / 1000) × 1_000_000 = 200_000s/month
    //   energy_kwh = 0.051 × 200_000 / 3_600_000 = 0.002833 kWh
    //   co2e = 0.002833 × 1.13 × 384.5 = 1.231g CO2e/month

    const result = calculateBaseline({
      resourceId: 'aws_lambda_function.test',
      instanceType: 'serverless:128mb:1000000inv:200ms',
      region: 'us-east-1',
      provider: 'aws',
    });

    assert.equal(result.confidence, 'LOW_ASSUMED_DEFAULT');
    assert.equal(result.assumptionsApplied.powerModelUsed, 'SERVERLESS_INVOCATION');
    assert.ok(result.totalCo2eGramsPerMonth > 0, 'Scope 2 should be positive');
    assert.ok(result.totalCo2eGramsPerMonth < 5, 'Scope 2 for 128MB Lambda should be small (< 5g)');
    assert.ok(result.waterLitresPerMonth > 0, 'Water should be positive');
    assert.ok(result.totalCostUsdPerMonth > 0, 'Cost should be positive');
    assert.ok(result.unsupportedReason?.includes('assumed defaults'), 'Should note assumed defaults');
  });

  it('produces higher CO2e for higher memory allocation', () => {
    const small = calculateBaseline({
      resourceId: 'aws_lambda_function.small',
      instanceType: 'serverless:128mb:1000000inv:200ms',
      region: 'us-east-1',
      provider: 'aws',
    });

    const large = calculateBaseline({
      resourceId: 'aws_lambda_function.large',
      instanceType: 'serverless:1024mb:1000000inv:200ms',
      region: 'us-east-1',
      provider: 'aws',
    });

    assert.ok(
      large.totalCo2eGramsPerMonth > small.totalCo2eGramsPerMonth,
      `1024MB Lambda should emit more than 128MB Lambda`
    );
  });

  it('produces higher CO2e in us-east-1 than eu-north-1', () => {
    const usEast = calculateBaseline({
      resourceId: 'aws_lambda_function.test',
      instanceType: 'serverless:512mb:1000000inv:200ms',
      region: 'us-east-1',
      provider: 'aws',
    });

    const euNorth = calculateBaseline({
      resourceId: 'aws_lambda_function.test',
      instanceType: 'serverless:512mb:1000000inv:200ms',
      region: 'eu-north-1',
      provider: 'aws',
    });

    assert.ok(
      usEast.totalCo2eGramsPerMonth > euNorth.totalCo2eGramsPerMonth,
      `us-east-1 should emit more than eu-north-1`
    );
  });

  it('produces higher CO2e for more invocations', () => {
    const low = calculateBaseline({
      resourceId: 'aws_lambda_function.test',
      instanceType: 'serverless:128mb:100000inv:200ms',
      region: 'us-east-1',
      provider: 'aws',
    });

    const high = calculateBaseline({
      resourceId: 'aws_lambda_function.test',
      instanceType: 'serverless:128mb:10000000inv:200ms',
      region: 'us-east-1',
      provider: 'aws',
    });

    assert.ok(
      high.totalCo2eGramsPerMonth > low.totalCo2eGramsPerMonth,
      `10M invocations should emit more than 100k`
    );
    assert.ok(
      Math.abs(high.totalCo2eGramsPerMonth / low.totalCo2eGramsPerMonth - 100) < 1,
      `CO2e should scale linearly with invocations (100x diff)`
    );
  });

  it('does not generate a recommendation for serverless (confidence is LOW_ASSUMED_DEFAULT)', () => {
    const baseline = calculateBaseline({
      resourceId: 'aws_lambda_function.test',
      instanceType: 'serverless:128mb:1000000inv:200ms',
      region: 'us-east-1',
      provider: 'aws',
    });

    const recommendation = generateRecommendation({
      resourceId: 'aws_lambda_function.test',
      instanceType: 'serverless:128mb:1000000inv:200ms',
      region: 'us-east-1',
      provider: 'aws',
    }, baseline);

    assert.equal(recommendation, null, 'No recommendation should be generated for serverless (LOW_ASSUMED_DEFAULT)');
  });

  it('returns zero cost and emissions for unknown region', () => {
    const result = calculateBaseline({
      resourceId: 'aws_lambda_function.test',
      instanceType: 'serverless:128mb:1000000inv:200ms',
      region: 'ap-nonexistent-9',
      provider: 'aws',
    });

    assert.equal(result.confidence, 'LOW_ASSUMED_DEFAULT');
    assert.equal(result.totalCo2eGramsPerMonth, 0);
  });

  it('includes embodied CO2e in lifecycle total', () => {
    const result = calculateBaseline({
      resourceId: 'aws_lambda_function.test',
      instanceType: 'serverless:128mb:1000000inv:200ms',
      region: 'us-east-1',
      provider: 'aws',
    });

    assert.ok(
      result.totalLifecycleCo2eGramsPerMonth >= result.totalCo2eGramsPerMonth,
      'Lifecycle total should include Scope 3 embodied'
    );
    assert.ok(result.embodiedCo2eGramsPerMonth >= 0);
  });
});

describe('Serverless: GCP Cloud Run estimation', () => {
  it('calculates CO2e for a Cloud Run service in us-central1', () => {
    const result = calculateBaseline({
      resourceId: 'google_cloud_run_service.api',
      instanceType: 'serverless:256mb:1000000inv:200ms',
      region: 'us-central1',
      provider: 'gcp',
    });

    assert.equal(result.confidence, 'LOW_ASSUMED_DEFAULT');
    assert.equal(result.assumptionsApplied.powerModelUsed, 'SERVERLESS_INVOCATION');
    assert.ok(result.totalCo2eGramsPerMonth > 0);
  });
});

describe('Serverless: Azure Function App estimation', () => {
  it('calculates CO2e for a Function App in eastus', () => {
    const result = calculateBaseline({
      resourceId: 'azurerm_function_app.processor',
      instanceType: 'serverless:256mb:1000000inv:200ms',
      region: 'eastus',
      provider: 'azure',
    });

    assert.equal(result.confidence, 'LOW_ASSUMED_DEFAULT');
    assert.equal(result.assumptionsApplied.powerModelUsed, 'SERVERLESS_INVOCATION');
    assert.ok(result.totalCo2eGramsPerMonth > 0);
  });
});
