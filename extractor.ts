import { readFileSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';
import type { ResourceInput, PlanAnalysisResult, CloudProvider } from './types.js';

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
      name?: string;
      expressions?: {
        region?: { constant_value?: string };
        location?: { constant_value?: string };
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
  unsupportedTypes: string[];
  error?: string;
}

// ---------------------------------------------------------------------------
// Supported resource types per provider
// ---------------------------------------------------------------------------

const SUPPORTED_TYPES: Record<CloudProvider, string[]> = {
  aws:   ['aws_instance', 'aws_db_instance'],
  azure: ['azurerm_linux_virtual_machine', 'azurerm_windows_virtual_machine', 'azurerm_virtual_machine'],
  gcp:   ['google_compute_instance'],
};

const COMPUTE_RELEVANT_TYPES = [
  'aws_launch_template', 'aws_autoscaling_group', 'aws_ecs_service',
  'aws_eks_node_group', 'aws_lambda_function',
  'azurerm_virtual_machine_scale_set', 'azurerm_kubernetes_cluster',
  'azurerm_function_app',
  'google_compute_instance_template', 'google_container_cluster',
  'google_cloudfunctions_function',
];

function detectProvider(resourceType: string): CloudProvider | null {
  if (resourceType.startsWith('aws_')) return 'aws';
  if (resourceType.startsWith('azurerm_')) return 'azure';
  if (resourceType.startsWith('google_')) return 'gcp';
  return null;
}

function extractProviderRegions(plan: TerraformPlan): Record<CloudProvider, string | null> {
  const result: Record<CloudProvider, string | null> = { aws: null, azure: null, gcp: null };
  const providerConfig = plan.configuration?.provider_config;
  if (!providerConfig) return result;

  for (const [key, provider] of Object.entries(providerConfig)) {
    if (key === 'aws' || key.startsWith('aws.')) {
      const alias = provider.expressions?.alias?.constant_value;
      if (alias && key !== 'aws') continue;
      const region = provider.expressions?.region?.constant_value;
      if (region && !result.aws) result.aws = region;
    }
    if (key === 'azurerm' || key.startsWith('azurerm.')) {
      const location = provider.expressions?.location?.constant_value;
      if (location && !result.azure) result.azure = location;
    }
    if (key === 'google' || key.startsWith('google.')) {
      const region = provider.expressions?.region?.constant_value;
      if (region && !result.gcp) result.gcp = region;
    }
  }
  return result;
}

function isKnownAfterApply(change: TerraformResourceChange['change'], fieldPath: string): boolean {
  if (!change) return true;
  if (change.after_unknown?.[fieldPath] === true) return true;
  if (change.after?.[fieldPath] === null || change.after?.[fieldPath] === undefined) return true;
  return false;
}

function resolveAwsRegion(change: TerraformResourceChange['change'], providerRegion: string | null): string | null {
  if (change?.after?.arn && typeof change.after.arn === 'string') {
    const parts = (change.after.arn as string).split(':');
    if (parts.length >= 4 && parts[3]) return parts[3];
  }
  if (change?.after?.availability_zone && typeof change.after.availability_zone === 'string') {
    const azMatch = (change.after.availability_zone as string).match(/^([a-z]{2}-[a-z]+-\d+)/);
    if (azMatch) return azMatch[1];
  }
  if (change?.after?.region && typeof change.after.region === 'string') return change.after.region as string;
  if (change?.before?.region && typeof change.before.region === 'string') return change.before.region as string;
  if (providerRegion) return providerRegion;
  return null;
}

function resolveAzureRegion(change: TerraformResourceChange['change'], providerRegion: string | null): string | null {
  const raw = change?.after?.location ?? change?.before?.location ?? providerRegion;
  if (!raw || typeof raw !== 'string') return null;
  return raw.toLowerCase().replace(/\s+/g, '');
}

function resolveGcpRegion(change: TerraformResourceChange['change'], providerRegion: string | null): string | null {
  if (change?.after?.region && typeof change.after.region === 'string') return change.after.region as string;
  if (change?.after?.zone && typeof change.after.zone === 'string') {
    const zoneMatch = (change.after.zone as string).match(/^([a-z]+-[a-z]+\d+)/);
    if (zoneMatch) return zoneMatch[1];
  }
  if (change?.before?.region && typeof change.before.region === 'string') return change.before.region as string;
  if (providerRegion) return providerRegion;
  return null;
}

function extractAwsInstanceType(res: TerraformResourceChange, plannedValuesMap: Map<string, Record<string, unknown>>): { instanceType: string | null; skipReason?: string } {
  const isDb = res.type === 'aws_db_instance';
  const typeField = isDb ? 'instance_class' : 'instance_type';

  if (isKnownAfterApply(res.change, typeField)) {
    const plannedType = plannedValuesMap.get(res.address)?.[typeField];
    if (typeof plannedType !== 'string') return { instanceType: null, skipReason: 'known_after_apply' };
    if (!res.change!.after) res.change!.after = {};
    res.change!.after[typeField] = plannedType;
  }

  let instanceType = res.change?.after?.[typeField] as string;
  if (typeof instanceType !== 'string') return { instanceType: null, skipReason: 'known_after_apply' };

  if (isDb && instanceType.startsWith('db.')) {
    instanceType = instanceType.replace(/^db\./, '');
    if (!instanceType.includes('.')) return { instanceType: null, skipReason: 'unsupported_instance' };
  }

  return { instanceType };
}

function extractAzureInstanceType(res: TerraformResourceChange): { instanceType: string | null; skipReason?: string } {
  const size = res.change?.after?.size ?? res.change?.before?.size;
  if (!size || typeof size !== 'string') return { instanceType: null, skipReason: 'known_after_apply' };
  return { instanceType: size };
}

function extractGcpInstanceType(res: TerraformResourceChange): { instanceType: string | null; skipReason?: string } {
  const machineType = res.change?.after?.machine_type ?? res.change?.before?.machine_type;
  if (!machineType || typeof machineType !== 'string') return { instanceType: null, skipReason: 'known_after_apply' };
  return { instanceType: machineType };
}

export function extractResourceInputs(planFilePath: string): ExtractorResult {
  const result: ExtractorResult = { resources: [], skipped: [], unsupportedTypes: [] };

  const resolvedPath = isAbsolute(planFilePath)
    ? planFilePath : resolve(process.cwd(), planFilePath);

  let raw: string;
  try {
    raw = readFileSync(resolvedPath, 'utf8');
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
  const providerRegions = extractProviderRegions(typedPlan);

  const plannedValuesMap = new Map<string, Record<string, unknown>>();
  for (const r of typedPlan.planned_values?.root_module?.resources ?? []) {
    if (r.address && r.values) plannedValuesMap.set(r.address, r.values);
  }

  const allSupportedTypes = Object.values(SUPPORTED_TYPES).flat();

  for (const rawRes of typedPlan.resource_changes) {
    const res = rawRes as TerraformResourceChange;
    const actions = res.change?.actions;

    if (!Array.isArray(actions) || (!actions.includes('create') && !actions.includes('update'))) {
      continue;
    }

    const provider = detectProvider(res.type);

    if (!allSupportedTypes.includes(res.type)) {
      if (COMPUTE_RELEVANT_TYPES.includes(res.type) && !result.unsupportedTypes.includes(res.type)) {
        result.unsupportedTypes.push(res.type);
      }
      continue;
    }

    if (!provider) continue;

    let instanceType: string | null = null;
    let skipReason: string | undefined;
    let region: string | null = null;

    if (provider === 'aws') {
      const extracted = extractAwsInstanceType(res, plannedValuesMap);
      instanceType = extracted.instanceType;
      skipReason = extracted.skipReason;
      if (instanceType) region = resolveAwsRegion(res.change, providerRegions.aws);
    } else if (provider === 'azure') {
      const extracted = extractAzureInstanceType(res);
      instanceType = extracted.instanceType;
      skipReason = extracted.skipReason;
      if (instanceType) region = resolveAzureRegion(res.change, providerRegions.azure);
    } else if (provider === 'gcp') {
      const extracted = extractGcpInstanceType(res);
      instanceType = extracted.instanceType;
      skipReason = extracted.skipReason;
      if (instanceType) region = resolveGcpRegion(res.change, providerRegions.gcp);
    }

    if (!instanceType || skipReason) {
      result.skipped.push({ resourceId: res.address, reason: skipReason ?? 'known_after_apply' });
      continue;
    }

    if (!region) {
      result.skipped.push({ resourceId: res.address, reason: 'known_after_apply' });
      continue;
    }

    result.resources.push({ resourceId: res.address, instanceType, region, provider });
  }

  return result;
}
