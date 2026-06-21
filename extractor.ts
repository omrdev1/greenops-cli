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

// Serverless types — analysed with SERVERLESS_INVOCATION power model
const SUPPORTED_SERVERLESS_TYPES: Record<CloudProvider, string[]> = {
  aws:   ['aws_lambda_function'],
  azure: ['azurerm_function_app', 'azurerm_linux_function_app', 'azurerm_windows_function_app'],
  gcp:   ['google_cloudfunctions_function', 'google_cloudfunctions2_function', 'google_cloud_run_service'],
};

// Kubernetes node group types — one Terraform resource provisions N instances
// of the same type. Resolves to the standard instance ledger; nodeCount scales
// the output linearly (see calculateBaseline in engine.ts).
const SUPPORTED_NODE_GROUP_TYPES: Record<CloudProvider, string[]> = {
  aws:   ['aws_eks_node_group'],
  azure: ['azurerm_kubernetes_cluster', 'azurerm_kubernetes_cluster_node_pool'],
  gcp:   ['google_container_node_pool'],
};

const COMPUTE_RELEVANT_TYPES = [
  'aws_launch_template', 'aws_autoscaling_group', 'aws_ecs_service',
  'azurerm_virtual_machine_scale_set',
  'google_compute_instance_template', 'google_container_cluster',
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

/**
 * Extracts instance type and node count for a Kubernetes node group resource.
 *
 * Node count honesty rule: for autoscaling node groups, the MINIMUM configured
 * size is used as the baseline, never max or average. This follows the
 * project's LOW_ASSUMED_DEFAULT philosophy (a tool that shows a wrong number
 * is worse than a tool that shows no number) — actual emissions scale with
 * autoscaler activity above this floor, and the PR comment should make that
 * explicit rather than silently assuming a higher figure.
 */
function extractNodeGroupInput(
  res: TerraformResourceChange,
  provider: CloudProvider
): { instanceType: string | null; nodeCount: number; skipReason?: string } {
  const after = res.change?.after ?? {};
  const before = res.change?.before ?? {};

  if (provider === 'aws') {
    // aws_eks_node_group: instance_types is a list; Terraform plans typically
    // resolve it to a single-element array for a homogeneous node group.
    const instanceTypes = (after.instance_types ?? before.instance_types) as unknown;
    const instanceType = Array.isArray(instanceTypes) && typeof instanceTypes[0] === 'string'
      ? instanceTypes[0] : null;

    const scalingConfig = (after.scaling_config ?? before.scaling_config) as unknown;
    const scaling = Array.isArray(scalingConfig) ? scalingConfig[0] as Record<string, unknown> | undefined : undefined;
    const desiredSize = scaling?.desired_size;
    const minSize = scaling?.min_size;
    const nodeCount = typeof minSize === 'number' ? minSize
      : typeof desiredSize === 'number' ? desiredSize
      : 1;

    if (!instanceType) return { instanceType: null, nodeCount, skipReason: 'known_after_apply' };
    return { instanceType, nodeCount };
  }

  if (provider === 'azure') {
    // azurerm_kubernetes_cluster (default_node_pool block) or
    // azurerm_kubernetes_cluster_node_pool (additional pools) — same field
    // names in both resource types.
    const defaultPool = (after.default_node_pool ?? before.default_node_pool) as unknown;
    const pool = Array.isArray(defaultPool) ? defaultPool[0] as Record<string, unknown> | undefined : undefined;
    const vmSize = pool?.vm_size ?? after.vm_size ?? before.vm_size;
    const instanceType = typeof vmSize === 'string' ? vmSize : null;

    const nodeCountField = pool?.node_count ?? after.node_count ?? before.node_count;
    const minCountField = pool?.min_count ?? after.min_count ?? before.min_count;
    const nodeCount = typeof minCountField === 'number' ? minCountField
      : typeof nodeCountField === 'number' ? nodeCountField
      : 1;

    if (!instanceType) return { instanceType: null, nodeCount, skipReason: 'known_after_apply' };
    return { instanceType, nodeCount };
  }

  // gcp: google_container_node_pool
  const nodeConfig = (after.node_config ?? before.node_config) as unknown;
  const config = Array.isArray(nodeConfig) ? nodeConfig[0] as Record<string, unknown> | undefined : undefined;
  const machineType = config?.machine_type ?? after.machine_type ?? before.machine_type;
  const instanceType = typeof machineType === 'string' ? machineType : null;

  const initialNodeCount = after.initial_node_count ?? before.initial_node_count;
  const autoscaling = (after.autoscaling ?? before.autoscaling) as unknown;
  const autoscalingConfig = Array.isArray(autoscaling) ? autoscaling[0] as Record<string, unknown> | undefined : undefined;
  const minNodeCount = autoscalingConfig?.min_node_count;
  const nodeCount = typeof minNodeCount === 'number' ? minNodeCount
    : typeof initialNodeCount === 'number' ? initialNodeCount
    : 1;

  if (!instanceType) return { instanceType: null, nodeCount, skipReason: 'known_after_apply' };
  return { instanceType, nodeCount };
}

function extractServerlessInput(
  res: TerraformResourceChange,
  provider: CloudProvider,
  providerRegions: Record<CloudProvider, string | null>,
  plannedValuesMap: Map<string, Record<string, unknown>>
): { resourceInput: ResourceInput | null; skipReason?: string } {
  // --- Memory allocation (AWS: memory_size in MB, others default) ---
  const plannedValues = plannedValuesMap.get(res.address) ?? {};
  const after = res.change?.after ?? {};

  let memoryMb = 128; // AWS Lambda default
  let invocationsPerMonth = 1_000_000; // default: 1M invocations/month
  let avgDurationMs = 200; // default: 200ms avg duration
  let region: string | null = null;

  if (provider === 'aws') {
    const raw = after.memory_size ?? plannedValues.memory_size;
    if (typeof raw === 'number') memoryMb = raw;
    region = resolveAwsRegion(res.change, providerRegions.aws);
  } else if (provider === 'azure') {
    // Azure Function Apps: no explicit memory config in Terraform — use 256MB default
    memoryMb = 256;
    region = resolveAzureRegion(res.change, providerRegions.azure);
  } else if (provider === 'gcp') {
    // Cloud Run / Cloud Functions: memory from available_memory or available_memory_mb
    const rawMem = after.available_memory ?? plannedValues.available_memory;
    const rawMemMb = after.available_memory_mb ?? plannedValues.available_memory_mb;
    if (typeof rawMem === 'string') {
      // e.g. "256M" or "1G"
      const match = rawMem.match(/^(\d+(?:\.\d+)?)\s*([MmGg])?/);
      if (match) {
        const val = parseFloat(match[1]);
        memoryMb = match[2]?.toLowerCase() === 'g' ? val * 1024 : val;
      }
    } else if (typeof rawMemMb === 'number') {
      memoryMb = rawMemMb;
    } else {
      memoryMb = 256; // GCP default
    }
    region = resolveGcpRegion(res.change, providerRegions.gcp);
  }

  if (!region) return { resourceInput: null, skipReason: 'known_after_apply' };

  // Encode serverless params into instanceType string for engine lookup
  // Format: "serverless:{memoryMb}mb:{invocations}inv:{durationMs}ms"
  const instanceType = `serverless:${memoryMb}mb:${invocationsPerMonth}inv:${avgDurationMs}ms`;

  return {
    resourceInput: {
      resourceId: res.address,
      instanceType,
      region,
      provider,
    }
  };
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
  const allServerlessTypes = Object.values(SUPPORTED_SERVERLESS_TYPES).flat();
  const allNodeGroupTypes = Object.values(SUPPORTED_NODE_GROUP_TYPES).flat();

  for (const rawRes of typedPlan.resource_changes) {
    const res = rawRes as TerraformResourceChange;
    const actions = res.change?.actions;

    if (!Array.isArray(actions) || (!actions.includes('create') && !actions.includes('update'))) {
      continue;
    }

    const provider = detectProvider(res.type);

    // --- Serverless path ---
    if (allServerlessTypes.includes(res.type)) {
      if (!provider) continue;
      const { resourceInput, skipReason } = extractServerlessInput(
        res, provider, providerRegions, plannedValuesMap
      );
      if (resourceInput) {
        result.resources.push(resourceInput);
      } else {
        result.skipped.push({ resourceId: res.address, reason: skipReason ?? 'known_after_apply' });
      }
      continue;
    }

    // --- Kubernetes node group path ---
    if (allNodeGroupTypes.includes(res.type)) {
      if (!provider) continue;
      const { instanceType, nodeCount, skipReason } = extractNodeGroupInput(res, provider);
      if (!instanceType) {
        result.skipped.push({ resourceId: res.address, reason: skipReason ?? 'known_after_apply' });
        continue;
      }
      const region = provider === 'aws' ? resolveAwsRegion(res.change, providerRegions.aws)
        : provider === 'azure' ? resolveAzureRegion(res.change, providerRegions.azure)
        : resolveGcpRegion(res.change, providerRegions.gcp);
      if (!region) {
        result.skipped.push({ resourceId: res.address, reason: 'known_after_apply' });
        continue;
      }
      result.resources.push({ resourceId: res.address, instanceType, region, provider, nodeCount });
      continue;
    }

    // --- Standard compute path ---
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
