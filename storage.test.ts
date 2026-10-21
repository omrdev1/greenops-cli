import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { calculateBaseline, generateRecommendation } from './engine';

// CCF storage model: TB × coefficient (Wh/TB-h) × hours × replication factor.
// SSD 1.2 Wh/TB-h, HDD 0.65 Wh/TB-h (CCF AwsFootprintEstimationConstants).
// Replication: AWS EBS 2, Azure managed disks 3, GCP zonal PD 1 (CCF ReplicationFactors).

describe('block storage (disks)', () => {
  it('AWS gp3 100GB in us-east-1: SSD energy × replication 2, real EBS capacity price', () => {
    // Energy = 0.1 TB × 1.2 Wh × 730h × 2 / 1000 = 0.1752 kWh/month
    // CO2e   = 0.1752 × 1.13 PUE × 384.5 g/kWh
    const energyKwh = 0.1 * 1.2 * 730 * 2 / 1000;
    const result = calculateBaseline({
      resourceId: 'aws_ebs_volume.data', instanceType: 'disk:gp3:100', region: 'us-east-1', provider: 'aws',
    });

    assert.ok(Math.abs(result.totalCo2eGramsPerMonth - energyKwh * 1.13 * 384.5) < 1e-9);
    assert.ok(Math.abs(result.waterLitresPerMonth - energyKwh * 0.18) < 1e-9);
    assert.equal(result.totalCostUsdPerMonth, 8);
    assert.equal(result.embodiedCo2eGramsPerMonth, 0);
    assert.equal(result.scope, 'SCOPE_2_OPERATIONAL');
    assert.equal(result.confidence, 'MEDIUM');
  });

  it('AWS st1 uses the HDD coefficient, not SSD', () => {
    const energyKwh = 0.5 * 0.65 * 730 * 2 / 1000;
    const result = calculateBaseline({
      resourceId: 'aws_ebs_volume.logs', instanceType: 'disk:st1:500', region: 'us-east-1', provider: 'aws',
    });
    assert.ok(Math.abs(result.totalCo2eGramsPerMonth - energyKwh * 1.13 * 384.5) < 1e-9);
    assert.equal(result.totalCostUsdPerMonth, 22.5);
  });

  it('Azure Premium_LRS applies replication 3 and flags cost as not modelled', () => {
    const result = calculateBaseline({
      resourceId: 'azurerm_managed_disk.data', instanceType: 'disk:Premium_LRS:128', region: 'eastus', provider: 'azure',
    });
    // eastus: grid 380 g/kWh, PUE 1.125
    const energyKwh = 0.128 * 1.2 * 730 * 3 / 1000;
    assert.ok(Math.abs(result.totalCo2eGramsPerMonth - energyKwh * 1.125 * 380) < 1e-9);
    assert.equal(result.totalCostUsdPerMonth, 0);
    assert.equal(result.confidence, 'LOW_ASSUMED_DEFAULT');
    assert.match(result.unsupportedReason ?? '', /cost/i);
  });

  it('GCP pd-standard is HDD with replication 1', () => {
    const result = calculateBaseline({
      resourceId: 'google_compute_disk.data', instanceType: 'disk:pd-standard:1000', region: 'us-central1', provider: 'gcp',
    });
    // us-central1: grid 340 g/kWh, PUE 1.1
    const energyKwh = 1 * 0.65 * 730 * 1 / 1000;
    assert.ok(Math.abs(result.totalCo2eGramsPerMonth - energyKwh * 1.1 * 340) < 1e-9);
  });

  it('returns a zero LOW_ASSUMED_DEFAULT result for an unknown disk tier', () => {
    const result = calculateBaseline({
      resourceId: 'aws_ebs_volume.x', instanceType: 'disk:gp9:100', region: 'us-east-1', provider: 'aws',
    });
    assert.equal(result.totalCo2eGramsPerMonth, 0);
    assert.equal(result.confidence, 'LOW_ASSUMED_DEFAULT');
    assert.match(result.unsupportedReason ?? '', /gp9/);
  });

  it('never recommends a change for a disk', () => {
    const input = { resourceId: 'aws_ebs_volume.data', instanceType: 'disk:gp3:100', region: 'us-east-1', provider: 'aws' as const };
    const baseline = calculateBaseline(input);
    assert.equal(generateRecommendation(input, baseline), null);
  });
});
