import { PlanAnalysisResult } from '../types.js';
import { formatDelta, formatCostDelta, formatGrams } from './util.js';

export interface FormatterOptions {
  repositoryUrl?: string;
  showUpgradePrompt?: boolean;
}

function formatWater(litres: number): string {
  if (litres >= 1000) return `${(litres / 1000).toFixed(2)}m³`;
  return `${litres.toFixed(1)}L`;
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
  out += `> | 🔋 Scope 2 — Operational CO2e | **${scope2}** |\n`;
  out += `> | 🏭 Scope 3 — Embodied CO2e | **${scope3}** |\n`;
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

  // Separate fully-analysed resources from unsupported (LOW_ASSUMED_DEFAULT)
  const analysed = result.resources.filter(r => r.baseline.confidence !== 'LOW_ASSUMED_DEFAULT');
  const unsupportedResources = result.resources.filter(r => r.baseline.confidence === 'LOW_ASSUMED_DEFAULT');

  out += `### Resource Breakdown\n\n`;
  out += `| Resource | Type | Region | Scope 2 CO2e | Scope 3 CO2e | Water | Cost/mo | Action |\n`;
  out += `|---|---|---|---|---|---|---|---|\n`;
  for (const r of analysed) {
    const action = r.recommendation ? `💡 [View Recommendation](#recommendations)` : `✅ Optimal`;
    out += `| \`${r.input.resourceId}\` | \`${r.input.instanceType}\` | \`${r.input.region}\` | ${formatGrams(r.baseline.totalCo2eGramsPerMonth)} | ${formatGrams(r.baseline.embodiedCo2eGramsPerMonth)} | ${formatWater(r.baseline.waterLitresPerMonth)} | ${r.baseline.totalCostUsdPerMonth.toFixed(2)} | ${action} |\n`;
  }
  out += `\n`;

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
        out += `#### \`${r.input.resourceId}\`\n`;
        out += `- **Current:** \`${r.input.instanceType}\` in \`${r.input.region}\`\n`;
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
    out += `\n> 🏢 **GreenOps Dashboard** — aggregate carbon data across all your repositories, set team budgets, and export ESG reports. [Register your interest](https://github.com/omrdev1/greenops-cli/discussions/17)\n`;
  }

  return out;
}
