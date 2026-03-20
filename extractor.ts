import { readFileSync } from 'node:fs';
import type { ResourceInput, PlanAnalysisResult } from './types.js';

export interface ExtractorResult {
  resources: ResourceInput[];
  skipped: PlanAnalysisResult['skipped'];
  error?: string;
}

/**
 * Checks if a specific attribute on a Terraform resource change is 'known after apply'
 * or completely absent (which means unresolvable before apply).
 */
function isKnownAfterApply(change: any, fieldPath: string): boolean {
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
function resolveRegion(change: any): string | null {
  if (change?.after?.arn && typeof change.after.arn === 'string') {
    const parts = change.after.arn.split(':');
    if (parts.length >= 4 && parts[3]) return parts[3];
  }
  
  if (change?.after?.availability_zone && typeof change.after.availability_zone === 'string') {
    // Strip the last char representing the logic zone (e.g. us-east-1a -> us-east-1)
    return change.after.availability_zone.slice(0, -1);
  }
  
  if (change?.after?.region && typeof change.after.region === 'string') {
    return change.after.region;
  }
  
  return null;
}

export function extractResourceInputs(planFilePath: string): ExtractorResult {
  const result: ExtractorResult = { resources: [], skipped: [] };
  
  let raw: string;
  try {
    raw = readFileSync(planFilePath, 'utf8');
  } catch (err: any) {
    result.error = `Failed to read plan file: ${err.message}`;
    return result;
  }

  let plan: any;
  try {
    plan = JSON.parse(raw);
  } catch (err: any) {
    result.error = `File is not valid JSON: ${err.message}`;
    return result;
  }

  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.resource_changes)) {
    result.error = 'Invalid Terraform plan format: missing resource_changes array.';
    return result;
  }

  for (const res of plan.resource_changes) {
    const actions = res.change?.actions;
    
    // Only process resources where change.actions includes "create" or "update"
    // Deletes represent resources scaling down, so their baseline from today onwards will be zero,
    // hence we don't calculate future impact or upgrade recommendations on teardowns.
    if (!Array.isArray(actions) || (!actions.includes('create') && !actions.includes('update'))) {
      continue; 
    }

    // Silently ignore strictly unsupported resource types 
    if (res.type !== 'aws_instance' && res.type !== 'aws_db_instance') {
      continue; 
    }

    const isDb = res.type === 'aws_db_instance';
    const typeField = isDb ? 'instance_class' : 'instance_type';

    // Verify type isn't unknown_after_apply
    if (isKnownAfterApply(res.change, typeField)) {
      result.skipped.push({ resourceId: res.address, reason: 'known_after_apply' });
      continue;
    }

    let instanceType = res.change.after[typeField];
    if (typeof instanceType !== 'string') {
      result.skipped.push({ resourceId: res.address, reason: 'known_after_apply' });
      continue;
    }

    // Normalisation step: "db.m5.large" -> "m5.large".
    // It's vastly superior to isolate this DB normalisation logic entirely out of the Engine, 
    // so the mathematical formulas handle consistently flat datasets mapped identically to factors.json.
    if (isDb && instanceType.startsWith('db.')) {
      instanceType = instanceType.replace(/^db\./, '');
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
