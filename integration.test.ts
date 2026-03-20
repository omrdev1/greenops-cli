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
    // 1. m5.large in us-east-1 -> normalisation to ARM m6g.large with cost/co2e savings
    // 2. m6g.large in us-west-2 -> perfectly clean ARM architecture with no meaningful region upgrade (>15%)
    // 3. aws_db_instance db.m5.xlarge in eu-west-1 -> normalizing to m5.xlarge and recommending ARM db.m6g.xlarge
    // 4. known_after_apply (skip path)
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

      // --- Math traces from factors.json ---
      // 1. aws_instance.web
      // baseline: 4313.56708 CO2e, 70.080 USD
      // recommendation (m6g.large): saving 1570.01158 CO2e, 13.87 USD

      // 2. aws_instance.worker
      // baseline: 1713.2059385 CO2e, 56.21 USD
      // recommendation: null (already ARM, cleanly placed)

      // 3. aws_db_instance.db
      // baseline: 7494.05152 CO2e, 156.22 USD
      // recommendation (m6g.xlarge): saving 2727.61434 CO2e, 30.66 USD
      // -------------------------------------

      const totalCo2e = 4313.56708 + 1713.2059385 + 7494.05152; // 13520.8245385
      const totalCost = 70.08 + 56.21 + 156.22; // 282.51
      const totalCo2eSavings = 1570.01158 + 2727.61434; // 4297.62592
      const totalCostSavings = 13.87 + 30.66; // 44.53

      assert.ok(Math.abs(result.totals.currentCo2eGramsPerMonth - totalCo2e) < 0.001);
      assert.ok(Math.abs(result.totals.currentCostUsdPerMonth - totalCost) < 0.001);
      assert.ok(Math.abs(result.totals.potentialCo2eSavingGramsPerMonth - totalCo2eSavings) < 0.001);
      assert.ok(Math.abs(result.totals.potentialCostSavingUsdPerMonth - totalCostSavings) < 0.001);
      
      const workerRes = result.resources.find(r => r.input.resourceId === 'aws_instance.worker');
      assert.equal(workerRes?.recommendation, null);
    } finally {
      unlinkSync(tmpFile);
    }
  });
});
