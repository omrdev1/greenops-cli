import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { extractResourceInputs } from './extractor';

// A mock fixture harness that prevents reliance on a direct CLI binary
function runFixtureTest(fixture: any) {
  const tmpFile = resolve(
    typeof __dirname !== 'undefined' ? __dirname : dirname(fileURLToPath(import.meta.url)), 
    `test-fixture-${Date.now()}-${Math.random()}.json`
  );
  writeFileSync(tmpFile, JSON.stringify(fixture));
  try {
    return extractResourceInputs(tmpFile);
  } finally {
    unlinkSync(tmpFile);
  }
}

describe('Terraform Plan Extractor', () => {
  test('clean plan with two supported resources', () => {
    const fixture = {
      resource_changes: [
        {
          address: 'aws_instance.web',
          type: 'aws_instance',
          change: {
            actions: ['create'],
            after: { instance_type: 'm5.large', availability_zone: 'us-east-1a' },
            after_unknown: { instance_type: false }
          }
        },
        {
          address: 'aws_db_instance.db',
          type: 'aws_db_instance',
          change: {
            actions: ['update'],
            after: { instance_class: 'db.m5.xlarge', arn: 'arn:aws:rds:us-west-2:1234:db:foo' },
            after_unknown: { instance_class: false }
          }
        }
      ]
    };

    const result = runFixtureTest(fixture);
    assert.equal(result.error, undefined);
    assert.equal(result.skipped.length, 0);
    assert.equal(result.resources.length, 2);

    assert.equal(result.resources[0].resourceId, 'aws_instance.web');
    assert.equal(result.resources[0].instanceType, 'm5.large');
    assert.equal(result.resources[0].region, 'us-east-1');

    assert.equal(result.resources[1].resourceId, 'aws_db_instance.db');
    assert.equal(result.resources[1].instanceType, 'm5.xlarge'); // Normalized
    assert.equal(result.resources[1].region, 'us-west-2');
  });

  test('plan with known_after_apply instance type goes to skipped', () => {
    const fixture = {
      resource_changes: [
        {
          address: 'aws_instance.unknown',
          type: 'aws_instance',
          change: {
            actions: ['create'],
            after: {},
            after_unknown: { instance_type: true }
          }
        }
      ]
    };
    const result = runFixtureTest(fixture);
    assert.equal(result.resources.length, 0);
    assert.equal(result.skipped.length, 1);
    assert.equal(result.skipped[0].resourceId, 'aws_instance.unknown');
    assert.equal(result.skipped[0].reason, 'known_after_apply');
  });

  test('plan with module-nested resource address extracts correctly', () => {
    const fixture = {
      resource_changes: [
        {
          address: 'module.compute.aws_instance.api',
          type: 'aws_instance',
          change: {
            actions: ['create'],
            after: { instance_type: 't3.medium', region: 'eu-west-1' }
          }
        }
      ]
    };
    const result = runFixtureTest(fixture);
    assert.equal(result.resources[0].resourceId, 'module.compute.aws_instance.api');
    assert.equal(result.resources[0].instanceType, 't3.medium');
    assert.equal(result.resources[0].region, 'eu-west-1');
  });

  test('completely unsupported resource type is silently ignored', () => {
    const fixture = {
      resource_changes: [
        {
          address: 'aws_s3_bucket.static',
          type: 'aws_s3_bucket',
          change: {
            actions: ['create'],
            after: { bucket: 'my-bucket' }
          }
        }
      ]
    };
    const result = runFixtureTest(fixture);
    assert.equal(result.resources.length, 0);
    assert.equal(result.skipped.length, 0); // Not skipped, completely ignored
  });

  test('malformed input file returns structured error', () => {
    // Passing a path to a non-existent file triggers ENOENT mapping
    const result = extractResourceInputs('does_not_exist.json');
    assert.ok(result.error !== undefined);
    assert.ok(result.error.includes('Failed to read'));
    assert.equal(result.resources.length, 0);
  });
});
