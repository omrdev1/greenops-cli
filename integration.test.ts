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
    //    Ledger v2.2.0 keeps shifts within one jurisdiction: us-west-2 (240.1 g/kWh) wins,
    //    saves ~950g CO2e/month
    //
    // 2. aws_instance.worker — r5.large in us-west-2
    //    (v2.1.0: was m6g.large — AWS Graviton removed from the ledger, no real
    //    ARM power data exists, see METHODOLOGY.md. Swapped for a real x86 instance.)
    //    Already the cleanest US region in the ledger: no recommendation.
    //
    // 3. aws_db_instance.db  — db.m5.xlarge in eu-west-1
    //    Normalised to m5.xlarge. eu-north-1 is excluded on water stress (2 > 1),
    //    so eu-west-2 (London, same EEA_UK jurisdiction) wins: saves ~868g CO2e/month
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
          change: { actions: ['create'], after: { instance_type: 'r5.large', region: 'us-west-2' } }
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

      // --- Math traces from factors.json v2.1.0 (power_watts re-derived from ccf-coefficients) ---
      //
      // W_effective = W_cpu + W_memory
      // W_cpu    = W_idle + (W_max - W_idle) × 0.5
      // W_memory = memory_gb × 0.392W/GB
      //
      // 1. aws_instance.web — m5.large us-east-1 (8GB, Skylake-mapped)
      //    W_cpu=4.84W, W_mem=3.136W, W_total=7.976W
      //    energy = 7.976 × 1.13 × 730 / 1000 = 6.579 kWh
      //    co2e   = 6.579 × 384.5 = 2529.78g
      //    cost   = $0.096 × 730 = $70.08
      //
      // 2. aws_instance.worker — r5.large us-west-2 (16GB, Skylake-mapped)
      //    W_cpu=4.84W, W_mem=6.272W, W_total=11.112W
      //    energy = 11.112 × 1.13 × 730 / 1000 = 9.167 kWh
      //    co2e   = 9.167 × 240.1 = 2200.83g
      //    cost   = $0.126 × 730 = $91.98
      //
      // 3. aws_db_instance.db — m5.xlarge eu-west-1 (normalised from db.m5.xlarge, 16GB, Skylake-mapped)
      //    W_cpu=9.675W, W_mem=6.272W, W_total=15.947W
      //    energy = 15.947 × 1.13 × 730 / 1000 = 13.153 kWh
      //    co2e   = 13.153 × 334.0 = 4393.66g
      //    cost   = $0.214 × 730 = $156.22
      //
      // Total: 2529.78 + 2200.83 + 4393.66 = 9124.27g, $318.28
      // Note: potentialCostSavingUsdPerMonth uses Math.abs() of each delta.
      // -----------------------------------------------

      const totalCo2e = 2529.7802228 + 2200.82594088 + 4393.6632202;
      const totalCost = 70.08 + 91.98 + 156.22;

      assert.ok(Math.abs(result.totals.currentCo2eGramsPerMonth - totalCo2e) < 0.01);
      assert.ok(Math.abs(result.totals.currentCostUsdPerMonth - totalCost) < 0.001);

      // Two in-jurisdiction region shifts; savings ~19.9% of baseline
      const savingsPct = result.totals.potentialCo2eSavingGramsPerMonth / result.totals.currentCo2eGramsPerMonth;
      assert.ok(savingsPct > 0.19, `Expected >19% CO2e savings, got ${(savingsPct*100).toFixed(1)}%`);

      const suggested = Object.fromEntries(result.resources.map(r => [r.input.resourceId, r.recommendation?.suggestedRegion ?? null]));
      assert.deepEqual(suggested, {
        'aws_instance.web': 'us-west-2',
        'aws_instance.worker': null,
        'aws_db_instance.db': 'eu-west-2',
      });

    } finally {
      unlinkSync(tmpFile);
    }
  });
});
