/**
 * GreenOps GitHub Suggestion Engine
 *
 * Translates UpgradeRecommendations into GitHub Pull Request Review Comments
 * using the "suggestion" syntax. This allows engineers to accept a Terraform
 * fix with a single click — the PR is rewritten in-place without leaving GitHub.
 *
 * Design principles:
 * - Zero runtime dependencies: uses Node 20's built-in fetch API exclusively.
 * - Precise targeting: suggestions are posted on the exact line that contains
 *   the attribute being changed (instance_type/instance_class for AWS,
 *   size for Azure, machine_type for GCP).
 * - Address-based file resolution: the Terraform resource address from plan.json
 *   is used to anchor the search to the correct .tf file before line matching.
 * - Idempotent: existing GreenOps suggestion comments are updated, not duplicated.
 * - Fail-open: if the GitHub API is unreachable or the plan file cannot be mapped
 *   to a source file, the CLI exits 0 with a warning. Never blocks a deployment.
 * - Paginated: fetches all PR files across multiple pages (100 per page) to
 *   handle large PRs correctly.
 *
 * How GitHub suggestion syntax works:
 *   A PR review comment with a code block tagged ```suggestion replaces the
 *   commented line(s) when the developer clicks "Commit suggestion". The comment
 *   must be posted to a specific file path + line number that exists in the PR diff.
 */

import type { PlanAnalysisResult, UpgradeRecommendation, CloudProvider } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SuggestionContext {
  /** GitHub token with pull-requests: write permission. */
  token: string;
  /** e.g. "omrdev1/greenops-cli" */
  repoFullName: string;
  /** PR number */
  pullNumber: number;
  /** SHA of the latest commit on the PR head branch */
  commitSha: string;
  /** Path to the Terraform plan JSON file, used to derive the .tf file path */
  planFilePath: string;
}

interface GitHubPRFile {
  filename: string;
  status: string;
  patch?: string;
}

interface GitHubReviewComment {
  id: number;
  body: string;
  path: string;
  line?: number;
}

export interface SuggestionResult {
  posted: number;
  updated: number;
  skipped: number;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// GitHub API helpers — native fetch, zero dependencies
// ---------------------------------------------------------------------------

const GITHUB_API = 'https://api.github.com';
const GREENOPS_MARKER = '<!-- greenops-suggestion -->';

async function githubRequest<T>(
  method: string,
  path: string,
  token: string,
  body?: unknown
): Promise<T> {
  const response = await fetch(`${GITHUB_API}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'greenops-cli',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    // 3D: Produce plain-English hints for common permission errors
    if (response.status === 403 || response.status === 401) {
      throw new Error(
        `GitHub API ${method} ${path} → ${response.status}. ` +
        `Ensure your workflow has "permissions: pull-requests: write" and that ` +
        `the provided github-token has not expired. Raw: ${text.slice(0, 200)}`
      );
    }
    if (response.status === 422) {
      throw new Error(
        `GitHub API ${method} ${path} → 422 Unprocessable Entity. ` +
        `The line number may not exist in the PR diff — the file may not have been ` +
        `modified in this PR, or the diff context is too small. Raw: ${text.slice(0, 200)}`
      );
    }
    throw new Error(`GitHub API ${method} ${path} → ${response.status}: ${text.slice(0, 200)}`);
  }

  // 204 No Content — return empty object
  if (response.status === 204) return {} as T;
  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// PR diff file resolution — paginated (3C)
// ---------------------------------------------------------------------------

/**
 * Fetches ALL files changed in a PR across multiple pages.
 * GitHub caps per_page at 100. PRs with >100 changed files require pagination
 * via the Link: rel="next" response header. Without this, suggestions for
 * resources in files beyond the first 100 are silently skipped.
 */
async function getPRFiles(
  token: string,
  repoFullName: string,
  pullNumber: number
): Promise<GitHubPRFile[]> {
  const allFiles: GitHubPRFile[] = [];
  let url: string | null =
    `${GITHUB_API}/repos/${repoFullName}/pulls/${pullNumber}/files?per_page=100`;

  while (url) {
    const response: Response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'greenops-cli',
      },
    });

    if (!response.ok) {
      const text: string = await response.text().catch(() => '');
      if (response.status === 403 || response.status === 401) {
        throw new Error(
          `GitHub API GET /pulls/${pullNumber}/files → ${response.status}. ` +
          `Ensure your workflow has "permissions: pull-requests: write". Raw: ${text.slice(0, 200)}`
        );
      }
      throw new Error(`GitHub API GET /pulls files → ${response.status}: ${text.slice(0, 200)}`);
    }

    const page = await response.json() as GitHubPRFile[];
    allFiles.push(...page);

    // Parse Link header for next page
    const linkHeader: string = response.headers.get('link') ?? '';
    const nextMatch: RegExpMatchArray | null = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    url = nextMatch ? nextMatch[1] : null;
  }

  return allFiles;
}

/**
 * Parses a unified diff patch to build a line number map.
 * Returns a map of { trimmedLineContent → lineNumber } for the "right" (new) side.
 *
 * GitHub review comments reference the line number in the new file.
 */
function buildLineMap(patch: string): Map<string, number> {
  const map = new Map<string, number>();
  let lineNum = 0;

  for (const line of patch.split('\n')) {
    // Hunk header e.g. @@ -1,4 +5,8 @@
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      lineNum = parseInt(hunkMatch[1], 10) - 1;
      continue;
    }
    if (line.startsWith('-')) continue; // removed line, no right-side line number
    lineNum++;
    const content = line.startsWith('+') ? line.slice(1) : line;
    map.set(content.trim(), lineNum);
  }

  return map;
}

// ---------------------------------------------------------------------------
// Address-based file resolution (3E)
// ---------------------------------------------------------------------------

/**
 * Builds a map of { resourceAddress → sourceFilePath } from the Terraform plan's
 * configuration block. Full Terraform plans (generated by `terraform show -json`)
 * include file path information in the configuration.root_module.resources array.
 *
 * This allows us to target the correct .tf file directly rather than searching
 * all changed files for a matching attribute string, which fails when:
 *   - Two resources of the same instance type exist across different files
 *   - The instance type is set via a variable reference
 *
 * Falls back gracefully if the plan doesn't include configuration metadata
 * (e.g. plans generated by older Terraform versions).
 */
function buildAddressFileMap(planFilePath: string): Map<string, string> {
  const map = new Map<string, string>();

  try {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { resolve, isAbsolute } = require('node:path') as typeof import('node:path');

    const resolvedPath = isAbsolute(planFilePath)
      ? planFilePath : resolve(process.cwd(), planFilePath);

    const raw = readFileSync(resolvedPath, 'utf8');
    const plan = JSON.parse(raw) as Record<string, unknown>;

    // Terraform plan configuration block contains file metadata
    const rootModule = (plan as any)?.configuration?.root_module;
    if (!rootModule) return map;

    // Process root module resources
    extractAddressFileEntries(rootModule?.resources ?? [], map);

    // Process child modules recursively
    for (const [, mod] of Object.entries(rootModule?.module_calls ?? {})) {
      extractModuleResources((mod as any)?.module ?? {}, map, '');
    }
  } catch {
    // Plan file unreadable or missing configuration block — fall back to
    // content-based search across all changed .tf files
  }

  return map;
}

function extractAddressFileEntries(
  resources: unknown[],
  map: Map<string, string>
): void {
  for (const res of resources) {
    const r = res as Record<string, unknown>;
    if (r.address && r.pos) {
      // pos.filename is the .tf file path relative to the workspace root
      const filename = (r.pos as Record<string, unknown>).filename as string;
      if (filename) map.set(r.address as string, filename);
    }
  }
}

function extractModuleResources(
  mod: Record<string, unknown>,
  map: Map<string, string>,
  prefix: string
): void {
  for (const res of (mod.resources ?? []) as unknown[]) {
    const r = res as Record<string, unknown>;
    if (r.address && r.pos) {
      const filename = (r.pos as Record<string, unknown>).filename as string;
      const fullAddress = prefix ? `${prefix}.${r.address}` : r.address as string;
      if (filename) map.set(fullAddress, filename);
    }
  }
  for (const [, child] of Object.entries(mod.module_calls ?? {})) {
    extractModuleResources((child as any)?.module ?? {}, map, prefix);
  }
}

// ---------------------------------------------------------------------------
// Suggestion body builder
// ---------------------------------------------------------------------------

/**
 * Builds the body of a GitHub review comment using the suggestion syntax.
 *
 * The suggestion block replaces the matched line when committed. We reconstruct
 * the line with the new value, preserving the original indentation and key.
 */
function buildSuggestionBody(
  resourceId: string,
  recommendation: UpgradeRecommendation,
  originalLine: string,
  attributeKey: string,
  newValue: string
): string {
  // Preserve original indentation
  const indent = originalLine.match(/^(\s*)/)?.[1] ?? '';
  const suggestedLine = `${indent}${attributeKey} = "${newValue}"`;

  const changeDesc = recommendation.suggestedInstanceType
    ? `Switch \`${attributeKey}\` from \`${originalLine.trim().split('"')[1]}\` to \`${newValue}\``
    : `Move \`${resourceId}\` to \`${newValue}\` for lower grid carbon intensity`;

  return [
    GREENOPS_MARKER,
    `### 🌱 GreenOps Recommendation — \`${resourceId}\``,
    '',
    changeDesc + ':',
    '',
    '```suggestion',
    suggestedLine,
    '```',
    '',
    `**Impact:** ${formatDelta(recommendation.co2eDeltaGramsPerMonth)} CO2e/month | ${formatCostDelta(recommendation.costDeltaUsdPerMonth)}/month`,
    '',
    `> ${recommendation.rationale}`,
  ].join('\n');
}

function formatDelta(grams: number): string {
  const kg = Math.abs(grams) / 1000;
  const sign = grams < 0 ? '-' : '+';
  return kg >= 1 ? `${sign}${kg.toFixed(2)}kg` : `${sign}${Math.abs(Math.round(grams))}g`;
}

function formatCostDelta(usd: number): string {
  const sign = usd < 0 ? '-' : '+';
  return `${sign}$${Math.abs(usd).toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Existing comment management
// ---------------------------------------------------------------------------

async function getExistingSuggestionComments(
  token: string,
  repoFullName: string,
  pullNumber: number
): Promise<GitHubReviewComment[]> {
  // Also paginated — PRs with many existing comments need full traversal
  const allComments: GitHubReviewComment[] = [];
  let url: string | null =
    `${GITHUB_API}/repos/${repoFullName}/pulls/${pullNumber}/comments?per_page=100`;

  while (url) {
    const response: Response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'greenops-cli',
      },
    });

    if (!response.ok) {
      const text: string = await response.text().catch(() => '');
      throw new Error(`GitHub API GET comments → ${response.status}: ${text.slice(0, 200)}`);
    }

    const page = await response.json() as GitHubReviewComment[];
    allComments.push(...page);

    const linkHeader: string = response.headers.get('link') ?? '';
    const nextMatch: RegExpMatchArray | null = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    url = nextMatch ? nextMatch[1] : null;
  }

  return allComments.filter(c => c.body.includes(GREENOPS_MARKER));
}

// ---------------------------------------------------------------------------
// Attribute key resolution — provider-aware
// ---------------------------------------------------------------------------

function resolveAttributeKey(provider: CloudProvider | undefined, isDb: boolean): string {
  if (provider === 'azure') return 'size';
  if (provider === 'gcp') return 'machine_type';
  return isDb ? 'instance_class' : 'instance_type';
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Posts or updates GitHub PR review comments with suggestion syntax for each
 * recommendation in the analysis result.
 *
 * Targeting strategy:
 * 1. Build a resource-address → .tf-file map from the plan's configuration block
 * 2. Fetch all .tf files changed in the PR (paginated, handles >100 files)
 * 3. For each resource with a recommendation:
 *    a. If the address map has a file path, search that file first
 *    b. Otherwise, fall back to searching all changed .tf files
 *    c. Within the target file(s), match on resource block header + attribute line
 *       to disambiguate multiple resources of the same instance type
 * 4. Post a suggestion comment on the matched line
 * 5. If an existing GreenOps suggestion comment exists on that line, update it
 * 6. If the line cannot be found in the diff, log a warning and skip
 *
 * Fail-open: any error is caught and returned as a warning, never throws.
 */
export async function postSuggestions(
  result: PlanAnalysisResult,
  ctx: SuggestionContext
): Promise<SuggestionResult> {
  const output: SuggestionResult = { posted: 0, updated: 0, skipped: 0, warnings: [] };

  const resourcesWithRecs = result.resources.filter(r => r.recommendation !== null);
  if (resourcesWithRecs.length === 0) return output;

  // Build address → file map from plan configuration block (best-effort)
  const addressFileMap = buildAddressFileMap(ctx.planFilePath);

  let prFiles: GitHubPRFile[];
  let existingComments: GitHubReviewComment[];

  try {
    [prFiles, existingComments] = await Promise.all([
      getPRFiles(ctx.token, ctx.repoFullName, ctx.pullNumber),
      getExistingSuggestionComments(ctx.token, ctx.repoFullName, ctx.pullNumber),
    ]);
  } catch (err) {
    output.warnings.push(`Could not fetch PR data: ${err instanceof Error ? err.message : String(err)}`);
    return output;
  }

  // Only consider .tf files with a patch (i.e. modified lines we can target)
  const tfFiles = prFiles.filter(f => f.filename.endsWith('.tf') && f.patch);
  const tfFileMap = new Map(tfFiles.map(f => [f.filename, f]));

  for (const { input, recommendation } of resourcesWithRecs) {
    if (!recommendation) continue;

    // Determine attribute key and values — provider-aware
    const provider = input.provider;
    const isDb = provider === 'aws' && (
      input.resourceId.includes('aws_db_instance') ||
      input.instanceType.startsWith('db.')
    );
    const attributeKey = resolveAttributeKey(provider, isDb);
    const currentValue = isDb ? `db.${input.instanceType}` : input.instanceType;
    const newValue = recommendation.suggestedInstanceType
      ? (isDb ? `db.${recommendation.suggestedInstanceType}` : recommendation.suggestedInstanceType)
      : input.instanceType;

    // Region-only suggestions cannot be expressed as a single-line suggestion
    if (!recommendation.suggestedInstanceType) {
      output.skipped++;
      output.warnings.push(
        `[${input.resourceId}] Region-shift recommendation cannot be expressed as a single-line suggestion. ` +
        `See the GreenOps PR comment for details.`
      );
      continue;
    }

    // The attribute pattern we are searching for
    const searchPattern = `${attributeKey} = "${currentValue}"`;

    // Determine which files to search:
    // 1. If the address map has a file for this resource, search that file first
    // 2. Fall back to all changed .tf files
    const knownFile = addressFileMap.get(input.resourceId);
    const filesToSearch: GitHubPRFile[] = knownFile && tfFileMap.has(knownFile)
      ? [tfFileMap.get(knownFile)!, ...tfFiles.filter(f => f.filename !== knownFile)]
      : tfFiles;

    let matched = false;

    for (const file of filesToSearch) {
      if (!file.patch) continue;

      const lineMap = buildLineMap(file.patch);

      // Primary strategy: anchor to resource block header, then find attribute
      // This disambiguates when multiple resources use the same instance type
      const resourceType = input.resourceId.split('.')[0] ?? '';
      const resourceName = input.resourceId.split('.').slice(1).join('.') ?? '';
      // Strip module prefix for matching — "module.x.aws_instance.web" → type="aws_instance", name="web"
      const lastDotParts = input.resourceId.split('.');
      const bareType = lastDotParts.length >= 2 ? lastDotParts[lastDotParts.length - 2] : resourceType;
      const bareName = lastDotParts[lastDotParts.length - 1] ?? resourceName;

      // Build candidate line numbers: lines matching the attribute pattern
      // that appear after the resource block header in the diff
      const resourceHeaderPattern = `resource "${bareType}" "${bareName}"`;
      const lineNumber = findAttributeLineAfterHeader(
        file.patch,
        resourceHeaderPattern,
        searchPattern,
        lineMap
      );

      if (!lineNumber) continue;

      // Found the line — build suggestion
      const originalLine = `  ${attributeKey} = "${currentValue}"`;
      const body = buildSuggestionBody(
        input.resourceId,
        recommendation,
        originalLine,
        attributeKey,
        newValue
      );

      // Check if we already have a suggestion comment on this file+line
      const existing = existingComments.find(
        c => c.path === file.filename && c.line === lineNumber
      );

      try {
        if (existing) {
          await githubRequest(
            'PATCH',
            `/repos/${ctx.repoFullName}/pulls/comments/${existing.id}`,
            ctx.token,
            { body }
          );
          output.updated++;
        } else {
          await githubRequest(
            'POST',
            `/repos/${ctx.repoFullName}/pulls/${ctx.pullNumber}/comments`,
            ctx.token,
            {
              body,
              commit_id: ctx.commitSha,
              path: file.filename,
              line: lineNumber,
              side: 'RIGHT',
            }
          );
          output.posted++;
        }
        matched = true;
        break;
      } catch (err) {
        output.warnings.push(
          `[${input.resourceId}] Failed to post suggestion on ${file.filename}:${lineNumber}: ` +
          `${err instanceof Error ? err.message : String(err)}`
        );
        matched = true; // don't try other files
        output.skipped++;
        break;
      }
    }

    if (!matched) {
      output.skipped++;
      output.warnings.push(
        `[${input.resourceId}] Could not locate \`${searchPattern}\` in PR diff. ` +
        `Suggestion not posted — the attribute may use a variable reference, or the ` +
        `file containing this resource was not modified in this PR.`
      );
    }
  }

  return output;
}

// ---------------------------------------------------------------------------
// Address-anchored line finding
// ---------------------------------------------------------------------------

/**
 * Finds the line number of an attribute pattern within the scope of a specific
 * resource block in a unified diff patch.
 *
 * Strategy:
 * 1. Scan the patch for the resource block header (e.g. `resource "aws_instance" "web" {`)
 * 2. Once found, scan forward for the attribute pattern (e.g. `instance_type = "m5.large"`)
 * 3. Stop scanning if we hit the end of the block (unindented `}`) or another resource header
 *
 * This prevents false positives when two resources of the same instance type
 * exist in the same file.
 *
 * Falls back to a simple map lookup if the header is not found in the diff
 * (e.g. the resource block was not modified but the attribute line was).
 */
function findAttributeLineAfterHeader(
  patch: string,
  resourceHeaderPattern: string,
  attributePattern: string,
  lineMap: Map<string, number>
): number | null {
  const lines = patch.split('\n');
  let lineNum = 0;
  let inTargetBlock = false;
  let blockDepth = 0;

  for (const line of lines) {
    // Track line numbers (right side only)
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      lineNum = parseInt(hunkMatch[1], 10) - 1;
      continue;
    }
    if (!line.startsWith('-')) lineNum++;

    const content = (line.startsWith('+') ? line.slice(1) : line).trim();

    if (!inTargetBlock) {
      // Look for the resource block header
      if (content.includes(resourceHeaderPattern)) {
        inTargetBlock = true;
        blockDepth = 1;
      }
    } else {
      // Track block depth to know when we've exited the resource block
      blockDepth += (content.match(/\{/g) ?? []).length;
      blockDepth -= (content.match(/\}/g) ?? []).length;

      if (blockDepth <= 0) {
        // Exited the resource block — attribute not found in this block
        inTargetBlock = false;
        blockDepth = 0;
        continue;
      }

      // Check if this line matches the attribute pattern
      if (content === attributePattern && !line.startsWith('-')) {
        return lineNum;
      }
    }
  }

  // Header not found in diff — fall back to simple map lookup
  // (handles cases where only the attribute line changed, not the whole block)
  return lineMap.get(attributePattern) ?? null;
}
