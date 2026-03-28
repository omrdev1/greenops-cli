import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { extractResourceInputs } from './extractor';
import { analysePlan } from './engine';

const _filename = typeof __filename !== 'undefined' ? __filename : fileURLToPath(import.meta.url);
const _dirname = typeof __dirname !== 'undefined' ? __dirname : dirname(_filename);

describe('End-to-End Integration', () => {
  test('Full pipeline extract -> analyse', () => {
    // Fixture covering all paths:
    // 1. aws_instance.web    — m5.large in us-east-1
    //    With ledger v1.2.0 (14 regions), eu-north-1 (8.8 gCO2e/kWh) wins scoring:
    //    region shift saves 4214.84g CO2e/month (+$2.92/month cost)
    //
    // 2. aws_instance.worker — m6g.large in us-west-2
    //    Already ARM. us-west-2 (240.1g) → eu-north-1 (8.8g) is >15% better:
    //    region shift saves 1650.41g CO2e/month ($0.00 cost delta)
    //
    // 3. aws_db_instance.db  — db.m5.xlarge in eu-west-1
    //    Normalised to m5.xlarge. eu-north-1 wins: saves 7296.60g CO2e/month (-$10.22/month)
    //
    // 4. aws_instance.unknown — known_after_apply (skip path)
    const fixture = {
      resource_changes: [
        {
          address: 'aws_instance.web',
          type: 'aws_instance',
          change: { actions: ['create'], after: { instance_type: 'm5.large', region: 'us-east-1' } }
        },
        {
          address: 'aws_instance.worker',
          type: 'aws_instance',
          change: { actions: ['create'], after: { instance_type: 'm6g.large', region: 'us-west-2' } }
        },
        {
          address: 'aws_db_instance.db',
          type: 'aws_db_instance',
          change: { actions: ['update'], after: { instance_class: 'db.m5.xlarge', region: 'eu-west-1' } }
        },
        {
          address: 'aws_instance.unknown',
          type: 'aws_instance',
          change: { actions: ['create'], after: {}, after_unknown: { instance_type: true } }
        }
      ]
    };

    const tmpFile = resolve(_dirname, `tfplan-fixture-${Date.now()}.json`);
    writeFileSync(tmpFile, JSON.stringify(fixture));

    try {
      const { resources, skipped, error } = extractResourceInputs(tmpFile);
      assert.equal(error, undefined);
      assert.equal(resources.length, 3);
      assert.equal(skipped.length, 1);
      assert.equal(skipped[0].reason, 'known_after_apply');

      const result = analysePlan(resources, skipped, tmpFile);

      // --- Math traces from factors.json v1.2.0 — v0.7.0 includes memory power (0.392W/GB) ---
      //
      // W_effective = W_cpu + W_memory
      // W_cpu    = W_idle + (W_max - W_idle) × 0.5
      // W_memory = memory_gb × 0.392W/GB
      //
      // 1. aws_instance.web — m5.large us-east-1 (8GB)
      //    W_cpu=13.6W, W_mem=3.136W, W_total=16.736W
      //    energy = 16.736 × 1.13 × 730 / 1000 = 13.816 kWh
      //    co2e   = 13.816 × 384.5 = 5308.22g
      //    cost   = $0.096 × 730 = $70.08
      //
      // 2. aws_instance.worker — m6g.large us-west-2 (ARM, 8GB)
      //    W_cpu=8.65W, W_mem=3.136W, W_total=11.786W
      //    energy = 11.786 × 1.13 × 730 / 1000 = 9.722 kWh
      //    co2e   = 9.722 × 240.1 = 2334.32g
      //    cost   = $0.077 × 730 = $56.21
      //
      // 3. aws_db_instance.db — m5.xlarge eu-west-1 (normalised from db.m5.xlarge, 16GB)
      //    W_cpu=27.2W, W_mem=6.272W, W_total=33.472W
      //    energy = 33.472 × 1.13 × 730 / 1000 = 27.622 kWh
      //    co2e   = 27.622 × 334.0 = 9222.09g
      //    cost   = $0.214 × 730 = $156.22
      //
      // Total: 5308.22 + 2334.32 + 9222.09 = 16864.63g, $282.51
      // Note: potentialCostSavingUsdPerMonth uses Math.abs() of each delta.
      // -----------------------------------------------

      // v0.7.0: Memory power draw included (0.392W/GB)
      // m5.large  us-east-1:  cpu=13.6W + mem=3.136W = 16.736W → 5308.22g CO2e
      // m6g.large us-west-2:  ARM — cpu=8.65W + mem=3.136W = 11.786W → 2334.32g CO2e
      // m5.xlarge eu-west-1:  cpu=27.2W + mem=6.272W = 33.472W → 9222.09g CO2e
      const totalCo2e = 5308.2249 + 2334.31736 + 9222.09164;
      const totalCost = 70.08 + 56.21 + 156.22;

      assert.ok(Math.abs(result.totals.currentCo2eGramsPerMonth - totalCo2e) < 0.01);
      assert.ok(Math.abs(result.totals.currentCostUsdPerMonth - totalCost) < 0.001);

      // All three resources now have recommendations (eu-north-1 shift)
      // Verify savings are substantial — >85% of total baseline CO2e
      // (memory power increases baseline, slightly reducing the savings percentage)
      const savingsPct = result.totals.potentialCo2eSavingGramsPerMonth / result.totals.currentCo2eGramsPerMonth;
      assert.ok(savingsPct > 0.85, `Expected >85% CO2e savings with 14-region ledger, got ${(savingsPct*100).toFixed(1)}%`);

      // All three resources should have a recommendation
      const resourcesWithRecs = result.resources.filter(r => r.recommendation !== null);
      assert.equal(resourcesWithRecs.length, 3, 'All 3 analysed resources should have a recommendation');

      // Worker should now recommend eu-north-1 (no longer null — us-west-2 is not the cleanest)
      const workerRes = result.resources.find(r => r.input.resourceId === 'aws_instance.worker');
      assert.ok(workerRes?.recommendation !== null, 'Worker now has a region-shift recommendation to eu-north-1');
      assert.equal(workerRes?.recommendation?.suggestedRegion, 'eu-north-1');

    } finally {
      unlinkSync(tmpFile);
    }
  });
});
