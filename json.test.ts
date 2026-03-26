import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { formatJson } from './formatters/json.js';
import { PlanAnalysisResult } from './types.js';

describe('JSON Formatter', () => {
  it('outputs valid, compact JSON with schemaVersion matching ledgerVersion and no ANSI characters', () => {
    const mockResult: PlanAnalysisResult = {
      analysedAt: new Date().toISOString(),
      ledgerVersion: '1.1.0',
      planFile: 'plan.json',
      resources: [],
      skipped: [],
      unsupportedTypes: [],
      totals: {
        currentCo2eGramsPerMonth: 500,
        currentCostUsdPerMonth: 10,
        potentialCo2eSavingGramsPerMonth: 0,
        potentialCostSavingUsdPerMonth: 0
      }
    };
    const jsonStr = formatJson(mockResult);

    const parsed = JSON.parse(jsonStr);
    // schemaVersion must always mirror the ledgerVersion from the result
    assert.equal(parsed.schemaVersion, '1.1.0');
    assert.equal(parsed.result.totals.currentCo2eGramsPerMonth, 500);
    assert.ok(!jsonStr.includes('\\n'));
    assert.ok(!jsonStr.includes('\\x1b'));
  });
});
