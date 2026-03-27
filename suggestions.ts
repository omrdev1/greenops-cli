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
 *   the attribute being changed (instance_type, instance_class).
 * - Idempotent: existing GreenOps suggestion comments are updated, not duplicated.
 * - Fail-open: if the GitHub API is unreachable or the plan file cannot be mapped
 *   to a source file, the CLI exits 0 with a warning. Never blocks a deployment.
 *
 * How GitHub suggestion syntax works:
 *   A PR review comment with a code block tagged ```suggestion replaces the
 *   commented line(s) when the developer clicks "Commit suggestion". The comment
 *   must be posted to a specific file path + line number that exists in the PR diff.
 */

import type { PlanAnalysisResult, UpgradeRecommendation } from './types.js';

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
    throw new Error(`GitHub API ${method} ${path} → ${response.status}: ${text.slice(0, 200)}`);
  }

  // 204 No Content — return empty object
  if (response.status === 204) return {} as T;
  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// PR diff file resolution
// ---------------------------------------------------------------------------

/**
 * Fetches the list of files changed in a PR and finds .tf files.
 * Used to map resource IDs to source file locations.
 */
async function getPRFiles(
  token: string,
  repoFullName: string,
  pullNumber: number
): Promise<GitHubPRFile[]> {
  return githubRequest<GitHubPRFile[]>(
    'GET',
    `/repos/${repoFullName}/pulls/${pullNumber}/files?per_page=100`,
    token
  );
}

/**
 * Parses a unified diff patch to build a line number map.
 * Returns a map of { lineContent → lineNumber } for the "right" (new) side.
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
  const comments = await githubRequest<GitHubReviewComment[]>(
    'GET',
    `/repos/${repoFullName}/pulls/${pullNumber}/comments?per_page=100`,
    token
  );
  return comments.filter(c => c.body.includes(GREENOPS_MARKER));
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Posts or updates GitHub PR review comments with suggestion syntax for each
 * recommendation in the analysis result.
 *
 * Targeting strategy:
 * 1. Fetch all .tf files changed in the PR
 * 2. For each resource with a recommendation, search changed .tf files for
 *    a line matching `instance_type = "current_type"` or `instance_class = "..."`
 * 3. Post a suggestion comment on that exact line
 * 4. If an existing GreenOps suggestion comment exists on that line, update it
 * 5. If the line cannot be found in the diff, log a warning and skip
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

  for (const { input, recommendation } of resourcesWithRecs) {
    if (!recommendation) continue;

    // Determine which attribute and value we're targeting
    const isDb = input.resourceId.includes('aws_db_instance') ||
                 input.instanceType.startsWith('db.');
    const attributeKey = isDb ? 'instance_class' : 'instance_type';
    const currentValue = isDb ? `db.${input.instanceType}` : input.instanceType;
    const newValue = recommendation.suggestedInstanceType
      ? (isDb ? `db.${recommendation.suggestedInstanceType}` : recommendation.suggestedInstanceType)
      : input.instanceType; // region-only suggestion — no instance change

    // For region-only suggestions we can't post a suggestion (no single line to target)
    // Instead we post a review comment without a suggestion block
    if (!recommendation.suggestedInstanceType) {
      output.skipped++;
      output.warnings.push(
        `[${input.resourceId}] Region-shift recommendation cannot be expressed as a single-line suggestion. ` +
        `See the GreenOps PR comment for details.`
      );
      continue;
    }

    // The attribute line we are searching for in the PR diff
    const searchPattern = `${attributeKey} = "${currentValue}"`;

    // Search for the matching line across all changed .tf files
    let matched = false;
    for (const file of tfFiles) {
      if (!file.patch) continue;

      const lineMap = buildLineMap(file.patch);

      // Look for a line like: instance_type = "m5.large"
      const lineNumber = lineMap.get(searchPattern);

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
        `Suggestion not posted — resource may be in a file not modified in this PR.`
      );
    }
  }

  return output;
}
