import { PlanAnalysisResult } from '../types.js';
import { formatDelta, formatCostDelta, formatGrams } from './util.js';

// Strip ANSI escape codes to get the true visible length of a string,
// so padEnd() aligns columns correctly in the terminal table.
function visibleLength(str: string): number {
  return str.replace(/\x1b\[[0-9;]*m/g, '').length;
}

function truncate(str: string, len: number): string {
  const visible = str.replace(/\x1b\[[0-9;]*m/g, '');
  if (visible.length > len) return visible.substring(0, len - 3) + '...';
  // Pad based on visible length, not raw string length (which includes ANSI bytes)
  return str + ' '.repeat(len - visible.length);
}

export function formatTable(result: PlanAnalysisResult): string {
  let out = `\n\x1b[1m🌱 GreenOps Infrastructure Impact\x1b[0m\n\n`;

  if (result.resources.length === 0 && result.skipped.length === 0) {
    return out + `No compatible infrastructure detected.\n`;
  }

  out += `┌${'─'.repeat(40)}┬${'─'.repeat(15)}┬${'─'.repeat(15)}┬${'─'.repeat(15)}┬${'─'.repeat(15)}┐\n`;
  out += `│ ${truncate('Resource', 38)} │ ${truncate('Instance', 13)} │ ${truncate('Region', 13)} │ ${truncate('CO2e/mo', 13)} │ ${truncate('Action', 13)} │\n`;
  out += `├${'─'.repeat(40)}┼${'─'.repeat(15)}┼${'─'.repeat(15)}┼${'─'.repeat(15)}┼${'─'.repeat(15)}┤\n`;

  for (const r of result.resources) {
    const c = formatGrams(r.baseline.totalCo2eGramsPerMonth);
    const action = r.recommendation ? `\x1b[33mUPGRADE\x1b[0m` : `\x1b[32mOK\x1b[0m`;
    out += `│ ${truncate(r.input.resourceId, 38)} │ ${truncate(r.input.instanceType, 13)} │ ${truncate(r.input.region, 13)} │ ${truncate(c, 13)} │ ${truncate(action, 13)} │\n`;
  }
  for (const s of result.skipped) {
    out += `│ \x1b[90m${truncate(s.resourceId, 38)}\x1b[0m │ \x1b[90m${truncate('---', 13)}\x1b[0m │ \x1b[90m${truncate('---', 13)}\x1b[0m │ \x1b[90m${truncate('---', 13)}\x1b[0m │ \x1b[33m${truncate('⚠ SKIPPED', 13)}\x1b[0m │\n`;
  }
  out += `└${'─'.repeat(40)}┴${'─'.repeat(15)}┴${'─'.repeat(15)}┴${'─'.repeat(15)}┴${'─'.repeat(15)}┘\n\n`;

  out += `Current: ${formatGrams(result.totals.currentCo2eGramsPerMonth)} | $${result.totals.currentCostUsdPerMonth.toFixed(2)}\n`;
  if (result.totals.potentialCo2eSavingGramsPerMonth > 0) {
    out += `\x1b[32mSavings: ${formatDelta(-result.totals.potentialCo2eSavingGramsPerMonth)} | ${formatCostDelta(-result.totals.potentialCostSavingUsdPerMonth)}\x1b[0m\n`;
  }

  if (result.skipped.length > 0) {
    out += `\n\x1b[90mNote: ${result.skipped.length} resource(s) were skipped due to runtime abstractions.\x1b[0m\n`;
  }

  return out;
}
