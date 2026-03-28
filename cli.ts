import { parseArgs } from 'node:util';
import factorsData from './factors.json';
import pkg from './package.json';
import { extractResourceInputs } from './extractor.js';
import { analysePlan } from './engine.js';
import { loadPolicy, evaluatePolicy } from './policy.js';
import { postSuggestions } from './suggestions.js';
import { formatMarkdown } from './formatters/markdown.js';
import { formatTable } from './formatters/table.js';
import { formatJson } from './formatters/json.js';

const { positionals, values } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    format: { type: 'string', default: 'markdown' },
    coverage: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
    version: { type: 'boolean', default: false },
    'show-upgrade-prompt': { type: 'string', default: 'true' },
    // Policy + suggestions flags (used by GitHub Action)
    'github-token': { type: 'string' },
    'repo': { type: 'string' },
    'pr-number': { type: 'string' },
    'commit-sha': { type: 'string' },
    'post-suggestions': { type: 'boolean', default: false },
  }
});

if (values.version) {
  console.log(pkg.version);
  process.exit(0);
}

if (values.help) {
  console.log([
    `GreenOps CLI v${pkg.version}`,
    ``,
    `Usage:`,
    `  greenops-cli diff <plan.json> [options]`,
    `  greenops-cli --coverage [--format json]`,
    `  greenops-cli --version`,
    ``,
    `Options:`,
    `  --format          Output format: markdown (default), table, json`,
    `  --coverage        List supported regions and instance types`,
    `  --github-token    GitHub token for posting suggestion comments`,
    `  --repo            Repository full name (e.g. owner/repo)`,
    `  --pr-number       Pull request number`,
    `  --commit-sha      Head commit SHA for suggestion anchoring`,
    `  --post-suggestions  Post inline Terraform suggestion comments on the PR`,
    `  --show-upgrade-prompt  Show dashboard upsell (true/false, default: true)`,
    `  --version         Print version and exit`,
    `  --help            Print this help and exit`,
  ].join('\n'));
  process.exit(0);
}

if (values.coverage) {
  const rawFs = factorsData as any;
  const awsRegions = Object.keys(rawFs.aws.regions);
  const azureRegions = Object.keys(rawFs.azure.regions);
  const gcpRegions = Object.keys(rawFs.gcp.regions);
  const awsInstances = Object.keys(rawFs.aws.instances);
  const azureInstances = Object.keys(rawFs.azure.instances);
  const gcpInstances = Object.keys(rawFs.gcp.instances);
  if (values.format === 'json') {
    console.log(JSON.stringify({
      ledgerVersion: rawFs.metadata.ledger_version,
      providers: {
        aws:   { regions: awsRegions,   instances: awsInstances },
        azure: { regions: azureRegions, instances: azureInstances },
        gcp:   { regions: gcpRegions,   instances: gcpInstances },
      }
    }, null, 2));
  } else {
    console.log(`GreenOps Methodology Ledger v${rawFs.metadata.ledger_version}`);
    console.log(`AWS:   ${awsRegions.length} regions | ${awsInstances.length} instances`);
    console.log(`Azure: ${azureRegions.length} regions | ${azureInstances.length} instances`);
    console.log(`GCP:   ${gcpRegions.length} regions | ${gcpInstances.length} instances`);
  }
  process.exit(0);
}

const command = positionals[0];
const planFile = positionals[1];

if (command !== 'diff' || !planFile) {
  console.error("Error: Missing 'diff' command or plan file parameter. Run --help for usage.");
  process.exit(1);
}

const extracted = extractResourceInputs(planFile);

if (extracted.error) {
  console.error(`Extraction Error: ${extracted.error}`);
  process.exit(1);
}

const result = analysePlan(extracted.resources, extracted.skipped, planFile, undefined, extracted.unsupportedTypes);
const showUpgradePrompt = values['show-upgrade-prompt'] === 'true';

// --- Policy evaluation ---
let policyExitCode = 0;
try {
  const policy = loadPolicy(process.cwd());
  if (policy) {
    const evaluation = evaluatePolicy(result, policy);
    if (!evaluation.isCompliant) {
      // Append violations to output regardless of format
      const violationLines = evaluation.violations.map(v =>
        `⛔ Policy violation [${v.constraint}]: ${v.message}`
      ).join('\n');

      if (values.format === 'json') {
        // For JSON format, violations are included in the output object downstream
        // We write them to stderr so they don't corrupt the JSON pipe
        process.stderr.write(`\n${violationLines}\n`);
      } else {
        // Append to stdout for markdown/table formats
        process.stdout.write(`\n${violationLines}\n`);
      }

      if (evaluation.shouldBlock) {
        policyExitCode = 1;
      }
    }
  }
} catch (err) {
  // Policy file parse errors are warnings, not fatal
  process.stderr.write(`[WARN] .greenops.yml parse error: ${err instanceof Error ? err.message : String(err)}\n`);
}

// --- Format and output ---
if (values.format === 'table') {
  console.log(formatTable(result));
} else if (values.format === 'json') {
  console.log(formatJson(result));
} else {
  console.log(formatMarkdown(result, { showUpgradePrompt }));
}

// --- Post GitHub suggestion comments (async, fail-open) ---
// IMPORTANT: process.exit must be deferred until after async suggestion posting
// completes. Calling process.exit() synchronously would terminate the Node.js
// process before unresolved HTTP requests to the GitHub API resolve, causing
// suggestions to be silently dropped on policy violation builds.
if (values['post-suggestions']) {
  const token = values['github-token'];
  const repo = values['repo'];
  const prNumber = values['pr-number'];
  const commitSha = values['commit-sha'];

  if (!token || !repo || !prNumber || !commitSha) {
    process.stderr.write(
      '[WARN] --post-suggestions requires --github-token, --repo, --pr-number, and --commit-sha. Skipping.\n'
    );
    process.exit(policyExitCode);
  } else {
    postSuggestions(result, {
      token,
      repoFullName: repo,
      pullNumber: parseInt(prNumber, 10),
      commitSha,
      planFilePath: planFile,
    }).then(suggestionResult => {
      if (suggestionResult.posted > 0 || suggestionResult.updated > 0) {
        process.stderr.write(
          `[GreenOps] Suggestions: ${suggestionResult.posted} posted, ${suggestionResult.updated} updated, ${suggestionResult.skipped} skipped\n`
        );
      }
      for (const warn of suggestionResult.warnings) {
        process.stderr.write(`[WARN] ${warn}\n`);
      }
    }).catch(err => {
      // Fail-open: suggestion posting errors never block the CLI
      process.stderr.write(
        `[WARN] GreenOps suggestion engine error: ${err instanceof Error ? err.message : String(err)}. Continuing.\n`
      );
    }).finally(() => {
      // Exit only after suggestions have been posted (or failed gracefully)
      process.exit(policyExitCode);
    });
  }
} else {
  process.exit(policyExitCode);
}
