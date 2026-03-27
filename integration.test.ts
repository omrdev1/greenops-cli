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

      // --- Math traces from factors.json v1.2.0 ---
      //
      // Baseline calculations (watts = idle + (max-idle)*0.5, pue applied, 730h/month):
      //
      // 1. aws_instance.web — m5.large us-east-1
      //    watts = 6.8 + (20.4-6.8)*0.5 = 13.6W
      //    energy = 13.6 * 1.13 * 730 / 1000 = 11.226kWh
      //    co2e = 11.226 * 384.5 = 4313.567g
      //    cost = 0.0960 * 730 = $70.08
      //
      // 2. aws_instance.worker — m6g.large us-west-2
      //    watts = 4.1 + (13.2-4.1)*0.5 = 8.65W
      //    energy = 8.65 * 1.13 * 730 / 1000 = 7.138kWh
      //    co2e = 7.138 * 240.1 = 1713.206g
      //    cost = 0.0770 * 730 = $56.21
      //
      // 3. aws_db_instance.db — m5.xlarge eu-west-1 (normalised from db.m5.xlarge)
      //    watts = 13.6 + (40.8-13.6)*0.5 = 27.2W
      //    energy = 27.2 * 1.13 * 730 / 1000 = 22.451kWh
      //    co2e = 22.451 * 334.0 = 7494.052g
      //    cost = 0.1070 * 730 = $78.11... wait actual is 0.2140*730=$156.22 (xlarge not large)
      //    — confirmed: 0.2140 * 730 = $156.22
      //
      // Total baseline: 4313.567 + 1713.206 + 7494.052 = 13520.825g, $282.51
      //
      // Recommendation savings:
      //   web:    eu-north-1 shift → saves 4214.843g, costs +$2.92/mo
      //   worker: eu-north-1 shift → saves 1650.415g, costs $0.00/mo
      //   db:     eu-north-1 shift → saves 7296.603g, saves $10.22/mo
      //
      // Total savings: 4214.843 + 1650.415 + 7296.603 = 13161.861g
      // Total cost savings: |2.92| + |0.00| + |10.22| = 13.14 (net of cost increases)
      // Note: potentialCostSavingUsdPerMonth uses Math.abs() of each delta,
      // so cost increases count the same as cost decreases in the total.
      // -----------------------------------------------

      const totalCo2e = 4313.567079999999 + 1713.2059385 + 7494.05152;
      const totalCost = 70.08 + 56.21 + 156.22;

      assert.ok(Math.abs(result.totals.currentCo2eGramsPerMonth - totalCo2e) < 0.001);
      assert.ok(Math.abs(result.totals.currentCostUsdPerMonth - totalCost) < 0.001);

      // All three resources now have recommendations (eu-north-1 shift)
      // Verify savings are substantial — >90% of total baseline CO2e
      const savingsPct = result.totals.potentialCo2eSavingGramsPerMonth / result.totals.currentCo2eGramsPerMonth;
      assert.ok(savingsPct > 0.90, `Expected >90% CO2e savings with 14-region ledger, got ${(savingsPct*100).toFixed(1)}%`);

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
