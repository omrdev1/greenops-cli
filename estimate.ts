import type { CloudProvider, ResourceInput } from './types';

const PROVIDERS: CloudProvider[] = ['aws', 'azure', 'gcp'];
const USAGE = 'Usage: greenops-cli estimate <aws|azure|gcp> <region> <instance-type> [--hours N] [--count N]';

export function buildEstimateInput(
  positionals: string[],
  hours?: string,
  count?: string
): { input?: ResourceInput; error?: string } {
  const [provider, region, instanceType] = positionals;
  if (!provider || !region || !instanceType) return { error: USAGE };
  if (!PROVIDERS.includes(provider as CloudProvider)) {
    return { error: `Unknown provider "${provider}". Use one of: ${PROVIDERS.join(', ')}.` };
  }

  const input: ResourceInput = { resourceId: 'estimate', provider: provider as CloudProvider, region, instanceType };

  if (hours !== undefined) {
    const hoursPerMonth = Number(hours);
    if (!(hoursPerMonth > 0)) return { error: `--hours must be a positive number, got "${hours}".` };
    input.hoursPerMonth = hoursPerMonth;
  }
  if (count !== undefined) {
    const nodeCount = Number(count);
    if (!Number.isInteger(nodeCount) || nodeCount < 1) return { error: `--count must be a whole number of 1 or more, got "${count}".` };
    input.nodeCount = nodeCount;
  }

  return { input };
}
