import { PlanAnalysisResult } from '../types.js';
import { formatDelta, formatCostDelta, formatGrams } from './util.js';

export interface FormatterOptions {
  repositoryUrl?: string;
  showUpgradePrompt?: boolean;
}

export function formatMarkdown(result: PlanAnalysisResult, options: FormatterOptions = {}): string {
  const METHODOLOGY_URL = options.repositoryUrl || 'https://github.com/omrdev1/greenops-cli/blob/main/METHODOLOGY.md';
  const recsCount = result.resources.filter(r => r.recommendation).length;

  let out = `## 🌱 GreenOps Infrastructure Impact\n\n`;
  
  out += `> **Total Current Footprint:** ${formatGrams(result.totals.currentCo2eGramsPerMonth)} CO2e/month | **$${result.totals.currentCostUsdPerMonth.toFixed(2)}**/month\n`;
  
  if (recsCount > 0) {
    const pct = ((result.totals.potentialCo2eSavingGramsPerMonth / result.totals.currentCo2eGramsPerMonth) * 100).toFixed(1);
    out += `> **Potential Savings:** -${formatGrams(result.totals.potentialCo2eSavingGramsPerMonth)} CO2e/month (${pct}%) | -$${result.totals.potentialCostSavingUsdPerMonth.toFixed(2)}/month\n`;
    out += `> 💡 Found **${recsCount}** optimization ${recsCount === 1 ? 'recommendation' : 'recommendations'}.\n\n`;
  } else {
    out += `> ✅ **Already optimally configured!** No upgrades recommended.\n\n`;
  }

  out += `### Resource Breakdown\n\n`;
  out += `| Resource | Type | Region | CO2e/month | Cost/month | Action |\n`;
  out += `|---|---|---|---|---|---|\n`;
  for (const r of result.resources) {
    const action = r.recommendation ? `💡 [View Recommendation](#recommendations)` : `✅ No change needed`;
    out += `| \`${r.input.resourceId}\` | \`${r.input.instanceType}\` | \`${r.input.region}\` | ${formatGrams(r.baseline.totalCo2eGramsPerMonth)} | $${r.baseline.totalCostUsdPerMonth.toFixed(2)} | ${action} |\n`;
  }
  out += `\n`;

  if (result.skipped.length > 0) {
    out += `<details><summary>⚠️ <b>${result.skipped.length} Skipped Resources</b></summary>\n\n`;
    out += `The following resources were skipped from calculation (usually due to runtime abstractions). The actual footprint may be higher.\n\n`;
    out += `| Resource | Reason |\n|---|---|\n`;
    for (const s of result.skipped) {
      out += `| \`${s.resourceId}\` | \`${s.reason}\` |\n`;
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
        out += `- **Impact:** ${formatDelta(r.recommendation.co2eDeltaGramsPerMonth)} CO2e/month | ${formatCostDelta(r.recommendation.costDeltaUsdPerMonth)}/month\n`;
        out += `- **Rationale:** ${r.recommendation.rationale}\n\n`;
      }
    }
  }

  out += `---\n`;
  out += `*Emissions calculated using the Open GreenOps Methodology Ledger (v${result.ledgerVersion}). Math is MIT-licensed and auditable. Analysed at ${result.analysedAt}. [Learn more](${METHODOLOGY_URL}).*\n`;

  if (options.showUpgradePrompt) {
    out += `\n> 🏢 **Managing green-ops across dozens of repositories?** [Upgrade to GreenOps Dashboard](https://greenops-cli.dev/upgrade) to aggregate CI/CD carbon data natively.\n`;
  }

  return out;
}
