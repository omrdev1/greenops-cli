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
 * Attempts to resolve the AWS region for a resource in the plan.
 * Lookup chain is:
 * 1. `change.after.arn` (e.g. arn:aws:ec2:us-east-1:...)
 * 2. `change.after.availability_zone` (fallback, stripping last char)
 * 3. `change.after.region` (if provided explicitly on the resource)
 * 
 * If all fail, we will emit known_after_apply to skip.
 */
function resolveRegion(change: TerraformResourceChange['change']): string | null {
  if (change?.after?.arn && typeof change.after.arn === 'string') {
    const parts = change.after.arn.split(':');
    if (parts.length >= 4 && parts[3]) return parts[3];
  }
  
  if (change?.after?.availability_zone && typeof change.after.availability_zone === 'string') {
    // Extract region from AZ using regex to handle Local Zones (e.g. us-east-1-bos-1a)
    // and standard AZs (e.g. us-east-1a) correctly.
    const azMatch = (change.after.availability_zone as string).match(/^([a-z]{2}-[a-z]+-\d+)/);
    if (azMatch) return azMatch[1];
  }
  
  if (change?.after?.region && typeof change.after.region === 'string') {
    return change.after.region as string;
  }

  // Fallback: check 'before' state for update actions where region persists unchanged
  if (change?.before?.region && typeof change.before.region === 'string') {
    return change.before.region as string;
  }
  
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

  const typedPlan = plan as { resource_changes: unknown[] };
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

    // Verify type isn't unknown_after_apply
    if (isKnownAfterApply(res.change, typeField)) {
      result.skipped.push({ resourceId: res.address, reason: 'known_after_apply' });
      continue;
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

    const region = resolveRegion(res.change);
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
