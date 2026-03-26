import { readFileSync } from 'node:fs';
import type { ResourceInput, PlanAnalysisResult } from './types.js';

// ---------------------------------------------------------------------------
// Internal types for Terraform plan shape
// ---------------------------------------------------------------------------

interface TerraformResourceChange {
  address: string;
  type: string;
  change?: {
    actions?: string[];
    after?: Record<string, unknown>;
    after_unknown?: Record<string, unknown>;
    before?: Record<string, unknown>;
  };
}

interface TerraformPlan {
  resource_changes: unknown[];
  configuration?: {
    provider_config?: Record<string, {
      expressions?: {
        region?: { constant_value?: string };
        alias?: { constant_value?: string };
      };
    }>;
  };
  planned_values?: {
    root_module?: {
      resources?: Array<{
        address: string;
        values?: Record<string, unknown>;
      }>;
    };
  };
}

export interface ExtractorResult {
  resources: ResourceInput[];
  skipped: PlanAnalysisResult['skipped'];
  /** Resource types present in the plan but not supported for carbon analysis */
  unsupportedTypes: string[];
  error?: string;
}

/**
 * Checks if a specific attribute on a Terraform resource change is 'known after apply'
 * or completely absent (which means unresolvable before apply).
 */
function isKnownAfterApply(change: TerraformResourceChange['change'], fieldPath: string): boolean {
  if (!change) return true;
  // If explicitly flagged as unknown by Terraform
  if (change.after_unknown?.[fieldPath] === true) return true;
  // If null or undefined in the known values mapping
  if (change.after?.[fieldPath] === null || change.after?.[fieldPath] === undefined) return true;
  return false;
}

/**
 * Extracts the default AWS region from the plan's provider configuration block.
 * Handles multi-provider configs by preferring the un-aliased "aws" provider.
 * Returns null if not statically resolvable (e.g. region set via variable).
 */
function extractProviderRegion(plan: TerraformPlan): string | null {
  const providerConfig = plan.configuration?.provider_config;
  if (!providerConfig) return null;

  // First pass: prefer the default (un-aliased) aws provider
  for (const [key, provider] of Object.entries(providerConfig)) {
    if (key === 'aws' || key.startsWith('aws.')) {
      const alias = provider.expressions?.alias?.constant_value;
      if (alias && key !== 'aws') continue;
      const region = provider.expressions?.region?.constant_value;
      if (region && typeof region === 'string') return region;
    }
  }

  // Second pass: accept any aws provider if no un-aliased one found
  for (const [key, provider] of Object.entries(providerConfig)) {
    if (key === 'aws' || key.startsWith('aws.')) {
      const region = provider.expressions?.region?.constant_value;
      if (region && typeof region === 'string') return region;
    }
  }

  return null;
}

/**
 * Attempts to resolve the AWS region for a resource in the plan.
 * Lookup chain:
 * 1. `change.after.arn` (e.g. arn:aws:ec2:us-east-1:...)
 * 2. `change.after.availability_zone` (strips trailing AZ letter)
 * 3. `change.after.region` (explicit resource-level region attribute)
 * 4. `change.before.region` (for update actions where region is unchanged)
 * 5. `providerRegion` (from configuration.provider_config — handles real-world plans
 *    where region is set on the provider block, not on individual resources)
 *
 * If all fail, returns null → resource will be skipped as known_after_apply.
 */
function resolveRegion(change: TerraformResourceChange['change'], providerRegion: string | null): string | null {
  if (change?.after?.arn && typeof change.after.arn === 'string') {
    const parts = change.after.arn.split(':');
    if (parts.length >= 4 && parts[3]) return parts[3];
  }
  
  if (change?.after?.availability_zone && typeof change.after.availability_zone === 'string') {
    // Handles Local Zones (e.g. us-east-1-bos-1a) and standard AZs (e.g. us-east-1a)
    const azMatch = (change.after.availability_zone as string).match(/^([a-z]{2}-[a-z]+-\d+)/);
    if (azMatch) return azMatch[1];
  }
  
  if (change?.after?.region && typeof change.after.region === 'string') {
    return change.after.region as string;
  }

  // For update actions where region is stable and lives in before state
  if (change?.before?.region && typeof change.before.region === 'string') {
    return change.before.region as string;
  }

  // Real-world AWS plans: region lives on the provider block, not the resource.
  // This is the most common case in practice.
  if (providerRegion) return providerRegion;
  
  return null;
}

export function extractResourceInputs(planFilePath: string): ExtractorResult {
  const result: ExtractorResult = { resources: [], skipped: [], unsupportedTypes: [] };
  
  let raw: string;
  try {
    raw = readFileSync(planFilePath, 'utf8');
  } catch (err: unknown) {
    result.error = `Failed to read plan file: ${err instanceof Error ? err.message : String(err)}`;
    return result;
  }

  let plan: unknown;
  try {
    plan = JSON.parse(raw);
  } catch (err: unknown) {
    result.error = `File is not valid JSON: ${err instanceof Error ? err.message : String(err)}`;
    return result;
  }

  if (!plan || typeof plan !== 'object' || !Array.isArray((plan as Record<string, unknown>).resource_changes)) {
    result.error = 'Invalid Terraform plan format: missing resource_changes array.';
    return result;
  }

  const typedPlan = plan as TerraformPlan;

  // Extract provider-level region once — used as final fallback in resolveRegion()
  const providerRegion = extractProviderRegion(typedPlan);

  // Build a lookup map from planned_values for instance type resolution.
  // planned_values resolves attributes that are statically known but may not yet
  // be reflected in change.after (e.g. when the provider populates defaults at plan time).
  const plannedValuesMap = new Map<string, Record<string, unknown>>();
  for (const r of typedPlan.planned_values?.root_module?.resources ?? []) {
    if (r.address && r.values) plannedValuesMap.set(r.address, r.values);
  }

  for (const rawRes of typedPlan.resource_changes) {
    const res = rawRes as TerraformResourceChange;
    const actions = res.change?.actions;
    
    // Only process resources where change.actions includes "create" or "update"
    // Deletes represent resources scaling down, so their baseline from today onwards will be zero,
    // hence we don't calculate future impact or upgrade recommendations on teardowns.
    if (!Array.isArray(actions) || (!actions.includes('create') && !actions.includes('update'))) {
      continue; 
    }

    // Track compute-relevant resource types that we can't yet analyse.
    // This lets formatters surface a coverage disclaimer.
    const SUPPORTED_TYPES = ['aws_instance', 'aws_db_instance'];
    const COMPUTE_RELEVANT_TYPES = ['aws_launch_template', 'aws_autoscaling_group', 'aws_ecs_service', 'aws_eks_node_group', 'aws_lambda_function'];

    if (!SUPPORTED_TYPES.includes(res.type)) {
      if (COMPUTE_RELEVANT_TYPES.includes(res.type) && !result.unsupportedTypes.includes(res.type)) {
        result.unsupportedTypes.push(res.type);
      }
      continue; 
    }

    const isDb = res.type === 'aws_db_instance';
    const typeField = isDb ? 'instance_class' : 'instance_type';

    // Verify type isn't unknown_after_apply.
    // If change.after doesn't have it, check planned_values before giving up —
    // some providers populate planned_values even when change.after is incomplete.
    if (isKnownAfterApply(res.change, typeField)) {
      const plannedType = plannedValuesMap.get(res.address)?.[typeField];
      if (typeof plannedType !== 'string') {
        result.skipped.push({ resourceId: res.address, reason: 'known_after_apply' });
        continue;
      }
      // Inject into change.after so downstream logic stays consistent
      if (!res.change!.after) res.change!.after = {};
      res.change!.after[typeField] = plannedType;
    }

    let instanceType: string = res.change!.after![typeField] as string;
    if (typeof res.change!.after![typeField] !== 'string') {
      result.skipped.push({ resourceId: res.address, reason: 'known_after_apply' });
      continue;
    }

    // Normalisation step: "db.m5.large" -> "m5.large".
    // It's vastly superior to isolate this DB normalisation logic entirely out of the Engine, 
    // so the mathematical formulas handle consistently flat datasets mapped identically to factors.json.
    if (isDb && instanceType.startsWith('db.')) {
      instanceType = instanceType.replace(/^db\./, '');
      // Guard: db.serverless (Aurora Serverless) produces invalid types after stripping
      if (!instanceType.includes('.')) {
        result.skipped.push({ resourceId: res.address, reason: 'unsupported_instance' });
        continue;
      }
    }

    const region = resolveRegion(res.change, providerRegion);
    if (!region) {
      // If we completely exhausted our lookup heuristics and failed to find a region,
      // it means we either need it applied dynamically, or the TF configuration leverages entirely external provider abstractions
      result.skipped.push({ resourceId: res.address, reason: 'known_after_apply' });
      continue;
    }

    result.resources.push({
      resourceId: res.address, // Correctly applies nested addresses as the ID (e.g. module.compute.aws_instance.api)
      instanceType,
      region
    });
  }

  return result;
}
