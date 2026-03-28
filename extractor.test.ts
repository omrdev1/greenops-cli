import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { extractResourceInputs } from './extractor';

function runFixtureTest(fixture: unknown) {
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

// ---------------------------------------------------------------------------
// AWS tests (unchanged from pre-multi-cloud)
// ---------------------------------------------------------------------------

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
    assert.equal(result.resources[0].provider, 'aws');

    assert.equal(result.resources[1].resourceId, 'aws_db_instance.db');
    assert.equal(result.resources[1].instanceType, 'm5.xlarge');
    assert.equal(result.resources[1].region, 'us-west-2');
    assert.equal(result.resources[1].provider, 'aws');
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
          change: { actions: ['create'], after: { bucket: 'my-bucket' } }
        }
      ]
    };
    const result = runFixtureTest(fixture);
    assert.equal(result.resources.length, 0);
    assert.equal(result.skipped.length, 0);
  });

  test('malformed input file returns structured error', () => {
    const result = extractResourceInputs('does_not_exist.json');
    assert.ok(result.error !== undefined);
    assert.ok(result.error.includes('Failed to read'));
  });

  test('delete action is correctly ignored (not extracted, not skipped)', () => {
    const fixture = {
      resource_changes: [
        {
          address: 'aws_instance.old',
          type: 'aws_instance',
          change: {
            actions: ['delete'],
            after: { instance_type: 'm5.large', region: 'us-east-1' }
          }
        }
      ]
    };
    const result = runFixtureTest(fixture);
    assert.equal(result.resources.length, 0);
    assert.equal(result.skipped.length, 0);
  });

  test('region resolved from change.before on update actions', () => {
    const fixture = {
      resource_changes: [
        {
          address: 'aws_instance.updating',
          type: 'aws_instance',
          change: {
            actions: ['update'],
            after: { instance_type: 'm5.large' },
            before: { region: 'eu-west-1' }
          }
        }
      ]
    };
    const result = runFixtureTest(fixture);
    assert.equal(result.resources.length, 1);
    assert.equal(result.resources[0].region, 'eu-west-1');
  });

  test('Local Zone AZ extracts correct region (us-east-1-bos-1a)', () => {
    const fixture = {
      resource_changes: [
        {
          address: 'aws_instance.local_zone',
          type: 'aws_instance',
          change: {
            actions: ['create'],
            after: { instance_type: 't3.medium', availability_zone: 'us-east-1-bos-1a' }
          }
        }
      ]
    };
    const result = runFixtureTest(fixture);
    assert.equal(result.resources.length, 1);
    assert.equal(result.resources[0].region, 'us-east-1');
  });

  test('db.serverless instance class is skipped as unsupported', () => {
    const fixture = {
      resource_changes: [
        {
          address: 'aws_db_instance.aurora',
          type: 'aws_db_instance',
          change: {
            actions: ['create'],
            after: { instance_class: 'db.serverless', region: 'us-east-1' }
          }
        }
      ]
    };
    const result = runFixtureTest(fixture);
    assert.equal(result.resources.length, 0);
    assert.equal(result.skipped.length, 1);
    assert.equal(result.skipped[0].reason, 'unsupported_instance');
  });

  test('empty resource_changes array produces empty result (no error)', () => {
    const fixture = { resource_changes: [] };
    const result = runFixtureTest(fixture);
    assert.equal(result.error, undefined);
    assert.equal(result.resources.length, 0);
    assert.equal(result.skipped.length, 0);
  });

  test('unsupported compute-relevant types are tracked', () => {
    const fixture = {
      resource_changes: [
        {
          address: 'aws_launch_template.web',
          type: 'aws_launch_template',
          change: { actions: ['create'], after: {} }
        },
        {
          address: 'aws_ecs_service.api',
          type: 'aws_ecs_service',
          change: { actions: ['create'], after: {} }
        }
      ]
    };
    const result = runFixtureTest(fixture);
    assert.equal(result.resources.length, 0);
    assert.ok(result.unsupportedTypes.includes('aws_launch_template'));
    assert.ok(result.unsupportedTypes.includes('aws_ecs_service'));
  });

  // ---------------------------------------------------------------------------
  // Azure tests
  // ---------------------------------------------------------------------------

  test('Azure: extracts azurerm_linux_virtual_machine with size and location', () => {
    const fixture = {
      resource_changes: [
        {
          address: 'azurerm_linux_virtual_machine.api',
          type: 'azurerm_linux_virtual_machine',
          change: {
            actions: ['create'],
            after: { size: 'Standard_D2s_v3', location: 'eastus' }
          }
        }
      ]
    };
    const result = runFixtureTest(fixture);
    assert.equal(result.error, undefined);
    assert.equal(result.resources.length, 1);
    assert.equal(result.resources[0].resourceId, 'azurerm_linux_virtual_machine.api');
    assert.equal(result.resources[0].instanceType, 'Standard_D2s_v3');
    assert.equal(result.resources[0].region, 'eastus');
    assert.equal(result.resources[0].provider, 'azure');
  });

  test('Azure: normalises "East US" location string to "eastus"', () => {
    // Azure location values in Terraform plans can appear as "East US" (display format)
    // or "eastus" (API format). The extractor normalises both to lowercase no-spaces.
    const fixture = {
      resource_changes: [
        {
          address: 'azurerm_linux_virtual_machine.web',
          type: 'azurerm_linux_virtual_machine',
          change: {
            actions: ['create'],
            after: { size: 'Standard_D4s_v3', location: 'East US' }
          }
        }
      ]
    };
    const result = runFixtureTest(fixture);
    assert.equal(result.resources.length, 1);
    assert.equal(result.resources[0].region, 'eastus', 'Should normalise "East US" to "eastus"');
  });

  test('Azure: extracts azurerm_windows_virtual_machine', () => {
    const fixture = {
      resource_changes: [
        {
          address: 'azurerm_windows_virtual_machine.worker',
          type: 'azurerm_windows_virtual_machine',
          change: {
            actions: ['create'],
            after: { size: 'Standard_F4s_v2', location: 'uksouth' }
          }
        }
      ]
    };
    const result = runFixtureTest(fixture);
    assert.equal(result.resources.length, 1);
    assert.equal(result.resources[0].instanceType, 'Standard_F4s_v2');
    assert.equal(result.resources[0].region, 'uksouth');
    assert.equal(result.resources[0].provider, 'azure');
  });

  test('Azure: skips VM with unknown size (known_after_apply)', () => {
    const fixture = {
      resource_changes: [
        {
          address: 'azurerm_linux_virtual_machine.dynamic',
          type: 'azurerm_linux_virtual_machine',
          change: {
            actions: ['create'],
            after: { location: 'eastus' }
            // size is absent — will be resolved at apply time
          }
        }
      ]
    };
    const result = runFixtureTest(fixture);
    assert.equal(result.resources.length, 0);
    assert.equal(result.skipped.length, 1);
    assert.equal(result.skipped[0].reason, 'known_after_apply');
  });

  test('Azure: unsupported compute-relevant types are tracked', () => {
    const fixture = {
      resource_changes: [
        {
          address: 'azurerm_virtual_machine_scale_set.pool',
          type: 'azurerm_virtual_machine_scale_set',
          change: { actions: ['create'], after: {} }
        }
      ]
    };
    const result = runFixtureTest(fixture);
    assert.equal(result.resources.length, 0);
    assert.ok(result.unsupportedTypes.includes('azurerm_virtual_machine_scale_set'));
  });

  // ---------------------------------------------------------------------------
  // GCP tests
  // ---------------------------------------------------------------------------

  test('GCP: extracts google_compute_instance with machine_type and zone', () => {
    // GCP plans typically include zone not region; the extractor strips the AZ suffix
    const fixture = {
      resource_changes: [
        {
          address: 'google_compute_instance.web',
          type: 'google_compute_instance',
          change: {
            actions: ['create'],
            after: { machine_type: 'n2-standard-2', zone: 'us-central1-a' }
          }
        }
      ]
    };
    const result = runFixtureTest(fixture);
    assert.equal(result.error, undefined);
    assert.equal(result.resources.length, 1);
    assert.equal(result.resources[0].resourceId, 'google_compute_instance.web');
    assert.equal(result.resources[0].instanceType, 'n2-standard-2');
    assert.equal(result.resources[0].region, 'us-central1', 'Should strip zone suffix from us-central1-a');
    assert.equal(result.resources[0].provider, 'gcp');
  });

  test('GCP: extracts region when provided directly (no zone)', () => {
    const fixture = {
      resource_changes: [
        {
          address: 'google_compute_instance.api',
          type: 'google_compute_instance',
          change: {
            actions: ['create'],
            after: { machine_type: 't2a-standard-2', region: 'europe-west1' }
          }
        }
      ]
    };
    const result = runFixtureTest(fixture);
    assert.equal(result.resources.length, 1);
    assert.equal(result.resources[0].region, 'europe-west1');
    assert.equal(result.resources[0].provider, 'gcp');
  });

  test('GCP: strips zone suffix correctly (europe-west1-b → europe-west1)', () => {
    const fixture = {
      resource_changes: [
        {
          address: 'google_compute_instance.db',
          type: 'google_compute_instance',
          change: {
            actions: ['create'],
            after: { machine_type: 'e2-standard-2', zone: 'europe-west1-b' }
          }
        }
      ]
    };
    const result = runFixtureTest(fixture);
    assert.equal(result.resources.length, 1);
    assert.equal(result.resources[0].region, 'europe-west1');
  });

  test('GCP: skips instance with unknown machine_type', () => {
    const fixture = {
      resource_changes: [
        {
          address: 'google_compute_instance.dynamic',
          type: 'google_compute_instance',
          change: {
            actions: ['create'],
            after: { zone: 'us-central1-a' }
            // machine_type absent
          }
        }
      ]
    };
    const result = runFixtureTest(fixture);
    assert.equal(result.resources.length, 0);
    assert.equal(result.skipped.length, 1);
    assert.equal(result.skipped[0].reason, 'known_after_apply');
  });

  test('GCP: unsupported compute-relevant types are tracked', () => {
    const fixture = {
      resource_changes: [
        {
          address: 'google_compute_instance_template.pool',
          type: 'google_compute_instance_template',
          change: { actions: ['create'], after: {} }
        }
      ]
    };
    const result = runFixtureTest(fixture);
    assert.equal(result.resources.length, 0);
    assert.ok(result.unsupportedTypes.includes('google_compute_instance_template'));
  });

  // ---------------------------------------------------------------------------
  // Multi-cloud plan test
  // ---------------------------------------------------------------------------

  test('Mixed AWS + Azure + GCP plan extracts all three providers correctly', () => {
    const fixture = {
      resource_changes: [
        {
          address: 'aws_instance.web',
          type: 'aws_instance',
          change: { actions: ['create'], after: { instance_type: 'm5.large', region: 'us-east-1' } }
        },
        {
          address: 'azurerm_linux_virtual_machine.api',
          type: 'azurerm_linux_virtual_machine',
          change: { actions: ['create'], after: { size: 'Standard_D2s_v3', location: 'eastus' } }
        },
        {
          address: 'google_compute_instance.worker',
          type: 'google_compute_instance',
          change: { actions: ['create'], after: { machine_type: 'n2-standard-2', zone: 'us-central1-a' } }
        }
      ]
    };
    const result = runFixtureTest(fixture);
    assert.equal(result.error, undefined);
    assert.equal(result.resources.length, 3);

    const aws = result.resources.find(r => r.provider === 'aws');
    const azure = result.resources.find(r => r.provider === 'azure');
    const gcp = result.resources.find(r => r.provider === 'gcp');

    assert.ok(aws, 'Should have AWS resource');
    assert.ok(azure, 'Should have Azure resource');
    assert.ok(gcp, 'Should have GCP resource');

    assert.equal(aws!.instanceType, 'm5.large');
    assert.equal(azure!.instanceType, 'Standard_D2s_v3');
    assert.equal(gcp!.instanceType, 'n2-standard-2');
  });
});
