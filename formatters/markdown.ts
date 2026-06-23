import { PlanAnalysisResult } from '../types.js';
import { formatDelta, formatCostDelta, formatGrams, formatInstanceTypeLabel } from './util.js';

export interface FormatterOptions {
  repositoryUrl?: string;
  showUpgradePrompt?: boolean;
}

function formatWater(litres: number): string {
  if (litres >= 1000) return `${(litres / 1000).toFixed(2)}m³`;
  return `${litres.toFixed(1)}L`;
}

const RAW_GPU_INSTANCE_TYPES = new Set(['g5.xlarge', 'p4d.24xlarge', 'p5.48xlarge']);

/**
 * A resource is AI/GPU infrastructure if it's a raw GPU instance, a managed
 * AI service (SageMaker), or a GPU-attached managed instance (Vertex AI
 * Workbench). This is the set of resources the dedicated AI Infrastructure
 * Carbon Impact section surfaces, instead of leaving them to blend into the
 * generic resource table.
 */
function isAiResource(instanceType: string): boolean {
  return (
    RAW_GPU_INSTANCE_TYPES.has(instanceType) ||
    instanceType.startsWith('managed_ai:') ||
    instanceType.startsWith('gpu_attached:')
  );
}

function aiResourceKind(instanceType: string): 'GPU' | 'SageMaker' | 'Vertex AI Workbench' {
  if (instanceType.startsWith('managed_ai:')) return 'SageMaker';
  if (instanceType.startsWith('gpu_attached:')) return 'Vertex AI Workbench';
  return 'GPU';
}

export function formatMarkdown(result: PlanAnalysisResult, options: FormatterOptions = {}): string {
  const METHODOLOGY_URL = options.repositoryUrl || 'https://github.com/omrdev1/greenops-cli/blob/main/METHODOLOGY.md';
  const analysedForCount = result.resources.filter(r => r.baseline.confidence !== 'LOW_ASSUMED_DEFAULT');
  const recsCount = analysedForCount.filter(r => r.recommendation).length;

  let out = `## 🌱 GreenOps Infrastructure Impact\n\n`;

  const scope2 = formatGrams(result.totals.currentCo2eGramsPerMonth);
  const scope3 = formatGrams(result.totals.currentEmbodiedCo2eGramsPerMonth);
  const lifecycle = formatGrams(result.totals.currentLifecycleCo2eGramsPerMonth);
  const water = formatWater(result.totals.currentWaterLitresPerMonth);
  const cost = result.totals.currentCostUsdPerMonth.toFixed(2);

  out += `> | Metric | Monthly Total |\n`;
  out += `> |---|---|\n`;
  out += `> | 🔋 Scope 2 (Operational CO2e) | **${scope2}** |\n`;
  out += `> | 🏭 Scope 3 (Embodied CO2e) | **${scope3}** |\n`;
  out += `> | 🌍 Total Lifecycle CO2e | **${lifecycle}** |\n`;
  out += `> | 💧 Water Consumption | **${water}** |\n`;
  out += `> | 💰 Infrastructure Cost | **$${cost}/month** |\n\n`;

  if (recsCount > 0) {
    const pct = result.totals.currentCo2eGramsPerMonth > 0
      ? ((result.totals.potentialCo2eSavingGramsPerMonth / result.totals.currentCo2eGramsPerMonth) * 100).toFixed(1)
      : '0.0';
    out += `> **Potential Scope 2 Savings:** -${formatGrams(result.totals.potentialCo2eSavingGramsPerMonth)} CO2e/month (${pct}%) | -$${result.totals.potentialCostSavingUsdPerMonth.toFixed(2)}/month\n`;
    out += `> 💡 Found **${recsCount}** optimization ${recsCount === 1 ? 'recommendation' : 'recommendations'}.\n\n`;
  } else {
    out += `> ✅ **Already optimally configured.** No upgrades recommended.\n\n`;
  }

  // Separate fully-analysed, serverless-estimated, partially-analysed (e.g. GPU
  // Scope 2 with unmodeled embodied carbon), and fully-unsupported resources.
  // A LOW_ASSUMED_DEFAULT baseline with a non-zero Scope 2 figure has real data
  // worth showing in the table — it should not be buried in "Skipped Resources"
  // alongside resources where nothing was calculated at all.
  const analysed = result.resources.filter(r =>
    r.baseline.confidence !== 'LOW_ASSUMED_DEFAULT' ||
    r.input.instanceType.startsWith('serverless:') ||
    r.baseline.totalCo2eGramsPerMonth > 0
  );
  const unsupportedResources = result.resources.filter(r =>
    r.baseline.confidence === 'LOW_ASSUMED_DEFAULT' &&
    !r.input.instanceType.startsWith('serverless:') &&
    r.baseline.totalCo2eGramsPerMonth === 0
  );

  out += `### Resource Breakdown\n\n`;
  out += `| Resource | Type | Region | Scope 2 CO2e | Scope 3 CO2e | Water | Cost/mo | Action |\n`;
  out += `|---|---|---|---|---|---|---|---|\n`;
  for (const r of analysed) {
    const isServerless = r.input.instanceType.startsWith('serverless:');
    const nodeCount = r.input.nodeCount ?? 1;
    const displayType = `\`${formatInstanceTypeLabel(r.input.instanceType)}\`${nodeCount > 1 ? ` × ${nodeCount}` : ''}`;
    const serverlessBadge = isServerless ? ' ⚡' : '';
    const action = r.recommendation ? `💡 [View Recommendation](#recommendations)` : `✅ Optimal`;
    out += `| \`${r.input.resourceId}\`${serverlessBadge} | ${displayType} | \`${r.input.region}\` | ${formatGrams(r.baseline.totalCo2eGramsPerMonth)} | ${formatGrams(r.baseline.embodiedCo2eGramsPerMonth)} | ${formatWater(r.baseline.waterLitresPerMonth)} | ${r.baseline.totalCostUsdPerMonth.toFixed(2)} | ${action} |\n`;
  }
  out += `\n`;

  // Serverless assumptions note
  const serverlessResources = analysed.filter(r => r.input.instanceType.startsWith('serverless:'));
  if (serverlessResources.length > 0) {
    out += `> ⚡ **Serverless resources** are estimated using assumed defaults (1M invocations/month, 200ms avg duration). Actual emissions depend on real invocation patterns. Values are marked \`LOW_ASSUMED_DEFAULT\`.\n\n`;
  }

  // Node group note
  const nodeGroupResources = analysed.filter(r => (r.input.nodeCount ?? 1) > 1);
  if (nodeGroupResources.length > 0) {
    out += `> 🧮 **Node group totals** reflect the minimum configured size for autoscaling groups (\`min_size\` / \`min_count\` / \`autoscaling.min_node_count\`), never the desired or maximum size. Actual emissions scale up with autoscaler activity above this floor.\n\n`;
  }

  // AI Infrastructure Carbon Impact — dedicated callout, not folded into the
  // generic resource table. This is the part of the AI differentiation
  // strategy that actually puts the carbon/cost tradeoff of an AI
  // infrastructure decision in front of the engineer reviewing the PR,
  // rather than leaving it to blend in among ordinary compute resources.
  const aiResources = analysed.filter(r => isAiResource(r.input.instanceType));
  if (aiResources.length > 0) {
    const aiCo2e = aiResources.reduce((sum, r) => sum + r.baseline.totalCo2eGramsPerMonth, 0);
    const aiCost = aiResources.reduce((sum, r) => sum + r.baseline.totalCostUsdPerMonth, 0);
    const embodiedGapCount = aiResources.filter(r => r.baseline.unsupportedReason?.includes('Embodied (Scope 3)')).length;

    out += `### 🤖 AI Infrastructure Carbon Impact\n\n`;
    out += `Detected **${aiResources.length}** AI/GPU ${aiResources.length === 1 ? 'resource' : 'resources'} in this plan, totalling **${formatGrams(aiCo2e)} CO2e/month** (Scope 2) and **$${aiCost.toFixed(2)}/month**.\n\n`;
    out += `| Resource | Type | Region | Scope 2 CO2e | Embodied (Scope 3) | Cost/mo |\n`;
    out += `|---|---|---|---|---|---|\n`;
    for (const r of aiResources) {
      // Managed AI types already carry their service name via
      // formatInstanceTypeLabel (e.g. "ml.g5.xlarge (SageMaker)") — only
      // raw GPU instances need the "GPU:" prefix added here to identify them.
      const kind = aiResourceKind(r.input.instanceType);
      const typeLabel = formatInstanceTypeLabel(r.input.instanceType);
      const typeCell = kind === 'GPU' ? `GPU: \`${typeLabel}\`` : `\`${typeLabel}\``;
      const embodiedGap = r.baseline.unsupportedReason?.includes('Embodied (Scope 3)');
      const embodiedCell = embodiedGap ? '⚠️ not modeled' : formatGrams(r.baseline.embodiedCo2eGramsPerMonth);
      out += `| \`${r.input.resourceId}\` | ${typeCell} | \`${r.input.region}\` | ${formatGrams(r.baseline.totalCo2eGramsPerMonth)} | ${embodiedCell} | ${r.baseline.totalCostUsdPerMonth.toFixed(2)} |\n`;
    }
    out += `\n`;

    if (embodiedGapCount > 0) {
      out += `> ⚠️ **Embodied carbon gap:** ${embodiedGapCount} of ${aiResources.length} AI/GPU ${embodiedGapCount === 1 ? 'resource' : 'resources'} above ${embodiedGapCount === 1 ? 'has' : 'have'} manufacturing-footprint (Scope 3) carbon explicitly **not modeled** — GPU hardware's embodied footprint differs substantially from this ledger's CPU-server baseline, and no equivalent public GPU baseline exists yet to cite honestly. This is a stated gap, not a measured zero.\n\n`;
    }

    const hasManagedAi = aiResources.some(r => r.input.instanceType.startsWith('managed_ai:'));
    if (hasManagedAi) {
      out += `> Managed AI service estimates (e.g. SageMaker) assume the endpoint runs continuously at the ledger's default utilization — real invocation/runtime patterns aren't visible in a Terraform plan. Pricing reflects the managed-service rate, not the underlying instance's raw compute price.\n\n`;
    }

    out += `> Putting this in front of you here, before these resources are provisioned, is the point: no other carbon-tooling vendor surfaces AI infrastructure cost at PR time. See the [Methodology](${METHODOLOGY_URL}) for full coverage and limitations.\n\n`;
  }

  const totalSkipped = result.skipped.length + unsupportedResources.length;
  if (totalSkipped > 0) {
    out += `<details><summary>⚠️ <b>${totalSkipped} Skipped Resource${totalSkipped !== 1 ? 's' : ''}</b></summary>\n\n`;
    out += `The following resources were excluded from analysis. The actual footprint may be higher.\n\n`;
    out += `| Resource | Instance | Reason |\n|---|---|---|\n`;
    for (const s of result.skipped) {
      out += `| \`${s.resourceId}\` | — | \`${s.reason}\` |\n`;
    }
    for (const r of unsupportedResources) {
      const reason = r.baseline.unsupportedReason ?? 'Instance type not in ledger';
      out += `| \`${r.input.resourceId}\` | \`${r.input.instanceType}\` | ${reason} |\n`;
    }
    out += `\n</details>\n\n`;
  }

  if (recsCount > 0) {
    out += `### Recommendations\n\n`;
    for (const r of result.resources) {
      if (r.recommendation) {
        const nodeCount = r.input.nodeCount ?? 1;
        const nodeSuffix = nodeCount > 1 ? ` × ${nodeCount} nodes` : '';
        out += `#### \`${r.input.resourceId}\`\n`;
        out += `- **Current:** \`${r.input.instanceType}\`${nodeSuffix} in \`${r.input.region}\`\n`;
        const sugRegion = r.recommendation.suggestedRegion || r.input.region;
        const sugInst = r.recommendation.suggestedInstanceType || r.input.instanceType;
        out += `- **Suggested:** \`${sugInst}\` in \`${sugRegion}\`\n`;
        out += `- **Scope 2 Impact:** ${formatDelta(r.recommendation.co2eDeltaGramsPerMonth)} CO2e/month | ${formatCostDelta(r.recommendation.costDeltaUsdPerMonth)}/month\n`;
        out += `- **Rationale:** ${r.recommendation.rationale}\n\n`;
      }
    }
  }

  if (result.unsupportedTypes.length > 0) {
    const typeList = result.unsupportedTypes.map(t => `\`${t}\``).join(', ');
    out += `> ⚠️ **Coverage note:** The following compute-relevant types were detected but are not yet supported: ${typeList}. Their footprint is not reflected above.\n\n`;
  }

  out += `---\n`;
  out += `*Emissions calculated using the [Open GreenOps Methodology Ledger v${result.ledgerVersion}](${METHODOLOGY_URL}). `;
  out += `Scope 2 (operational) and Scope 3 (embodied) emissions tracked. `;
  out += `Water consumption estimated from provider sustainability reports (AWS 2023, Microsoft 2023, Google 2023). `;
  out += `Math is MIT-licensed and auditable. Analysed at ${result.analysedAt}.*\n`;

  if (options.showUpgradePrompt) {
    out += `\n> 🏢 **GreenOps Dashboard**: aggregate carbon trends across all your repositories and export ESG reports. [Get started free](https://getgreenops.com)\n`;
  }

  return out;
}
