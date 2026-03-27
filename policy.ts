/**
 * GreenOps Policy Engine
 *
 * Reads an optional .greenops.yml file from the repository root and evaluates
 * the analysis result against the declared budget constraints.
 *
 * Design principles:
 * - Fail-open: if no policy file exists, evaluation always passes.
 * - Offline-first: zero network calls, pure computation against local state.
 * - Transparent: every violation includes the constraint that was breached,
 *   the actual value, and the allowed limit — suitable for PR comment output.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PlanAnalysisResult } from './types.js';

// ---------------------------------------------------------------------------
// Policy schema types
// ---------------------------------------------------------------------------

/**
 * Shape of .greenops.yml
 *
 * All fields are optional — omitting a field means no constraint on that axis.
 * This allows teams to adopt GreenOps incrementally.
 *
 * Example .greenops.yml:
 *
 *   version: 1
 *   budgets:
 *     max_pr_co2e_increase_kg: 10
 *     max_pr_cost_increase_usd: 500
 *     max_total_co2e_kg: 100
 *   fail_on_violation: true
 */
export interface GreenOpsPolicy {
  version: number;
  budgets?: {
    /** Maximum CO2e increase (kg) this PR is allowed to introduce. */
    max_pr_co2e_increase_kg?: number;
    /** Maximum cost increase (USD/month) this PR is allowed to introduce. */
    max_pr_cost_increase_usd?: number;
    /** Maximum total CO2e (kg/month) across all analysed resources in this plan. */
    max_total_co2e_kg?: number;
  };
  /** If true, CLI exits with code 1 when policy is violated. Default: false (warn-only). */
  fail_on_violation?: boolean;
}

export interface PolicyViolation {
  constraint: string;
  actual: number;
  limit: number;
  unit: string;
  message: string;
}

export interface PolicyEvaluationResult {
  /** True if no policy file was found OR all constraints pass. */
  isCompliant: boolean;
  /** The loaded policy, or null if no file was found. */
  policy: GreenOpsPolicy | null;
  violations: PolicyViolation[];
  /** If true, the CLI should exit with code 1. Derived from policy.fail_on_violation. */
  shouldBlock: boolean;
}

// ---------------------------------------------------------------------------
// YAML parser — minimal, no dependencies
// ---------------------------------------------------------------------------

/**
 * Parses a minimal subset of YAML sufficient for .greenops.yml.
 *
 * Supports:
 *   - String keys
 *   - Numeric and boolean values
 *   - One level of nesting via indentation
 *
 * This is intentionally not a full YAML parser. We control the schema and
 * can validate it after parsing. Using a full YAML library would add a runtime
 * dependency that contradicts the zero-dependency architecture.
 */
function parseMinimalYaml(content: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = content.split('\n');
  let currentSection: string | null = null;
  let currentObj: Record<string, unknown> = {};

  for (const rawLine of lines) {
    // Strip comments
    const line = rawLine.replace(/#.*$/, '').trimEnd();
    if (!line.trim()) continue;

    const indent = line.match(/^(\s*)/)?.[1]?.length ?? 0;
    const trimmed = line.trim();

    // Top-level key (no indent)
    if (indent === 0) {
      // Save previous section if any
      if (currentSection && Object.keys(currentObj).length > 0) {
        result[currentSection] = { ...currentObj };
      }

      const colonIdx = trimmed.indexOf(':');
      if (colonIdx === -1) continue;

      const key = trimmed.slice(0, colonIdx).trim();
      const val = trimmed.slice(colonIdx + 1).trim();

      if (val === '' || val === null) {
        // This key has nested children
        currentSection = key;
        currentObj = {};
      } else {
        currentSection = null;
        result[key] = parseScalar(val);
      }
    } else {
      // Nested key (indented)
      if (!currentSection) continue;
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx === -1) continue;
      const key = trimmed.slice(0, colonIdx).trim();
      const val = trimmed.slice(colonIdx + 1).trim();
      if (val !== '') {
        currentObj[key] = parseScalar(val);
      }
    }
  }

  // Flush last section
  if (currentSection && Object.keys(currentObj).length > 0) {
    result[currentSection] = { ...currentObj };
  }

  return result;
}

function parseScalar(val: string): unknown {
  if (val === 'true') return true;
  if (val === 'false') return false;
  if (val === 'null' || val === '~') return null;
  const num = Number(val);
  if (!isNaN(num) && val !== '') return num;
  // Strip surrounding quotes
  if ((val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))) {
    return val.slice(1, -1);
  }
  return val;
}

// ---------------------------------------------------------------------------
// Policy loading
// ---------------------------------------------------------------------------

/**
 * Loads and validates .greenops.yml from the given directory.
 * Returns null if the file does not exist.
 * Throws a descriptive error if the file is malformed.
 */
export function loadPolicy(repoRoot: string = process.cwd()): GreenOpsPolicy | null {
  const policyPath = resolve(repoRoot, '.greenops.yml');
  if (!existsSync(policyPath)) return null;

  let raw: string;
  try {
    raw = readFileSync(policyPath, 'utf8');
  } catch (err) {
    throw new Error(`Failed to read .greenops.yml: ${err instanceof Error ? err.message : String(err)}`);
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = parseMinimalYaml(raw);
  } catch (err) {
    throw new Error(`Failed to parse .greenops.yml: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Validate version
  if (parsed.version !== undefined && typeof parsed.version !== 'number') {
    throw new Error(`.greenops.yml: "version" must be a number, got ${typeof parsed.version}`);
  }

  const policy: GreenOpsPolicy = {
    version: typeof parsed.version === 'number' ? parsed.version : 1,
    fail_on_violation: typeof parsed.fail_on_violation === 'boolean' ? parsed.fail_on_violation : false,
  };

  // Parse budgets section
  if (parsed.budgets && typeof parsed.budgets === 'object') {
    const budgets = parsed.budgets as Record<string, unknown>;
    policy.budgets = {};

    const numericFields: Array<keyof NonNullable<GreenOpsPolicy['budgets']>> = [
      'max_pr_co2e_increase_kg',
      'max_pr_cost_increase_usd',
      'max_total_co2e_kg',
    ];

    for (const field of numericFields) {
      if (budgets[field] !== undefined) {
        if (typeof budgets[field] !== 'number' || (budgets[field] as number) < 0) {
          throw new Error(`.greenops.yml: "budgets.${field}" must be a non-negative number`);
        }
        policy.budgets[field] = budgets[field] as number;
      }
    }
  }

  return policy;
}

// ---------------------------------------------------------------------------
// Policy evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluates a PlanAnalysisResult against a loaded policy.
 *
 * The evaluator is intentionally strict: it checks every declared constraint
 * and collects all violations rather than short-circuiting on the first one.
 * This gives engineers the full picture in a single PR run.
 */
export function evaluatePolicy(
  result: PlanAnalysisResult,
  policy: GreenOpsPolicy | null
): PolicyEvaluationResult {
  // No policy file — always compliant
  if (!policy || !policy.budgets) {
    return { isCompliant: true, policy, violations: [], shouldBlock: false };
  }

  const violations: PolicyViolation[] = [];
  const { totals } = result;
  const b = policy.budgets;

  // Constraint 1: max_pr_co2e_increase_kg
  // The "increase" for a PR is the total new footprint introduced (currentCo2eGramsPerMonth).
  // We don't have a pre-PR baseline here — the plan represents net-new resources being added.
  if (b.max_pr_co2e_increase_kg !== undefined) {
    const actualKg = totals.currentCo2eGramsPerMonth / 1000;
    if (actualKg > b.max_pr_co2e_increase_kg) {
      violations.push({
        constraint: 'max_pr_co2e_increase_kg',
        actual: Math.round(actualKg * 100) / 100,
        limit: b.max_pr_co2e_increase_kg,
        unit: 'kg CO2e/month',
        message: `This PR introduces ${(actualKg).toFixed(2)}kg CO2e/month, exceeding the ${b.max_pr_co2e_increase_kg}kg limit defined in .greenops.yml.`,
      });
    }
  }

  // Constraint 2: max_pr_cost_increase_usd
  if (b.max_pr_cost_increase_usd !== undefined) {
    const actualUsd = totals.currentCostUsdPerMonth;
    if (actualUsd > b.max_pr_cost_increase_usd) {
      violations.push({
        constraint: 'max_pr_cost_increase_usd',
        actual: Math.round(actualUsd * 100) / 100,
        limit: b.max_pr_cost_increase_usd,
        unit: 'USD/month',
        message: `This PR introduces $${actualUsd.toFixed(2)}/month in infrastructure cost, exceeding the $${b.max_pr_cost_increase_usd} limit defined in .greenops.yml.`,
      });
    }
  }

  // Constraint 3: max_total_co2e_kg
  if (b.max_total_co2e_kg !== undefined) {
    const actualKg = totals.currentCo2eGramsPerMonth / 1000;
    if (actualKg > b.max_total_co2e_kg) {
      violations.push({
        constraint: 'max_total_co2e_kg',
        actual: Math.round(actualKg * 100) / 100,
        limit: b.max_total_co2e_kg,
        unit: 'kg CO2e/month',
        message: `Total analysed footprint is ${actualKg.toFixed(2)}kg CO2e/month, exceeding the ${b.max_total_co2e_kg}kg ceiling defined in .greenops.yml.`,
      });
    }
  }

  const isCompliant = violations.length === 0;
  const shouldBlock = !isCompliant && (policy.fail_on_violation ?? false);

  return { isCompliant, policy, violations, shouldBlock };
}
