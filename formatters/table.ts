import { PlanAnalysisResult } from '../types.js';
import { formatDelta, formatCostDelta, formatGrams } from './util.js';

function truncate(str: string, len: number): string {
  const visible = str.replace(/\x1b\[[0-9;]*m/g, '');
  if (visible.length > len) return visible.substring(0, len - 3) + '...';
  return visible + ' '.repeat(len - visible.length);
}

function formatWater(litres: number): string {
  if (litres >= 1000) return `${(litres / 1000).toFixed(1)}m³`;
  return `${litres.toFixed(1)}L`;
}

export function formatTable(result: PlanAnalysisResult): string {
  let out = `\n\x1b[1m🌱 GreenOps Infrastructure Impact\x1b[0m\n\n`;

  if (result.resources.length === 0 && result.skipped.length === 0) {
    return out + `No compatible infrastructure detected.\n`;
  }

  out += `┌${'─'.repeat(38)}┬${'─'.repeat(13)}┬${'─'.repeat(13)}┬${'─'.repeat(11)}┬${'─'.repeat(11)}┬${'─'.repeat(9)}┬${'─'.repeat(13)}┐\n`;
  out += `│ ${truncate('Resource', 36)} │ ${truncate('Instance', 11)} │ ${truncate('Region', 11)} │ ${truncate('Scope 2', 9)} │ ${truncate('Scope 3', 9)} │ ${truncate('Water', 7)} │ ${truncate('Action', 11)} │\n`;
  out += `├${'─'.repeat(38)}┼${'─'.repeat(13)}┼${'─'.repeat(13)}┼${'─'.repeat(11)}┼${'─'.repeat(11)}┼${'─'.repeat(9)}┼${'─'.repeat(13)}┤\n`;

  for (const r of result.resources) {
    const scope2 = formatGrams(r.baseline.totalCo2eGramsPerMonth);
    const scope3 = formatGrams(r.baseline.embodiedCo2eGramsPerMonth);
    const water = formatWater(r.baseline.waterLitresPerMonth);
    const action = r.recommendation ? `\x1b[33mUPGRADE\x1b[0m` : `\x1b[32mOK\x1b[0m`;
    out += `│ ${truncate(r.input.resourceId, 36)} │ ${truncate(r.input.instanceType, 11)} │ ${truncate(r.input.region, 11)} │ ${truncate(scope2, 9)} │ ${truncate(scope3, 9)} │ ${truncate(water, 7)} │ ${truncate(action, 11)} │\n`;
  }
  for (const s of result.skipped) {
    out += `│ \x1b[90m${truncate(s.resourceId, 36)}\x1b[0m │ \x1b[90m${truncate('---', 11)}\x1b[0m │ \x1b[90m${truncate('---', 11)}\x1b[0m │ \x1b[90m${truncate('---', 9)}\x1b[0m │ \x1b[90m${truncate('---', 9)}\x1b[0m │ \x1b[90m${truncate('---', 7)}\x1b[0m │ \x1b[33m${truncate('⚠ SKIPPED', 11)}\x1b[0m │\n`;
  }
  out += `└${'─'.repeat(38)}┴${'─'.repeat(13)}┴${'─'.repeat(13)}┴${'─'.repeat(11)}┴${'─'.repeat(11)}┴${'─'.repeat(9)}┴${'─'.repeat(13)}┘\n\n`;

  out += `Scope 2: ${formatGrams(result.totals.currentCo2eGramsPerMonth)} | Scope 3: ${formatGrams(result.totals.currentEmbodiedCo2eGramsPerMonth)} | Lifecycle: ${formatGrams(result.totals.currentLifecycleCo2eGramsPerMonth)}\n`;
  out += `Water: ${formatWater(result.totals.currentWaterLitresPerMonth)} | Cost: $${result.totals.currentCostUsdPerMonth.toFixed(2)}/month\n`;

  if (result.totals.potentialCo2eSavingGramsPerMonth > 0) {
    out += `\x1b[32mScope 2 Savings: ${formatDelta(-result.totals.potentialCo2eSavingGramsPerMonth)} | ${formatCostDelta(-result.totals.potentialCostSavingUsdPerMonth)}\x1b[0m\n`;
  }

  if (result.skipped.length > 0) {
    out += `\n\x1b[90mNote: ${result.skipped.length} resource(s) were skipped due to runtime abstractions.\x1b[0m\n`;
  }

  return out;
}
