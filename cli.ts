import { parseArgs } from 'node:util';
import factorsData from './factors.json';
import pkg from './package.json';
import { extractResourceInputs } from './extractor.js';
import { analysePlan } from './engine.js';
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
    env: { type: 'string', default: 'production' },
  }
});

if (values.version) {
  console.log(pkg.version);
  process.exit(0);
}

if (values.help) {
  console.log(`GreenOps CLI v${pkg.version}\nUsage: greenops-cli diff <plan.json> [--format markdown|table|json]\n       greenops-cli --coverage [--format json]\n       greenops-cli --version`);
  process.exit(0);
}

if (values.coverage) {
  const rawFs = Object.assign({}, factorsData);
  if (values.format === 'json') {
    console.log(JSON.stringify({ regions: Object.keys(rawFs.regions), instances: Object.keys(rawFs.instances) }, null, 2));
  } else {
    console.log(`Supported Regions: ${Object.keys(rawFs.regions).join(', ')}`);
    console.log(`Supported Instances: ${Object.keys(rawFs.instances).join(', ')}`);
  }
  process.exit(0);
}

const command = positionals[0];
const planFile = positionals[1];

if (command !== 'diff' || !planFile) {
  console.error("Error: Missing 'diff' command or plan file parameter.");
  process.exit(1);
}

// Environment profiles: staging environments typically run ~22% of the month
// (weekday business hours only), so we use 160h/month instead of 730h.
const HOURS_BY_ENV: Record<string, number> = {
  production: 730,
  staging: 160,
};
const hoursPerMonth = HOURS_BY_ENV[values.env ?? 'production'] ?? 730;

const extracted = extractResourceInputs(planFile);

if (extracted.error) {
  console.error(`Extraction Error: ${extracted.error}`);
  process.exit(1);
}

// Apply the environment's hoursPerMonth to every resource that doesn't already have one set
const resourcesWithEnv = extracted.resources.map(r =>
  r.hoursPerMonth !== undefined ? r : { ...r, hoursPerMonth }
);

const result = analysePlan(resourcesWithEnv, extracted.skipped, planFile, undefined, extracted.unsupportedTypes);
const showUpgradePrompt = values['show-upgrade-prompt'] === 'true';

if (values.format === 'table') {
  console.log(formatTable(result));
} else if (values.format === 'json') {
  console.log(formatJson(result));
} else {
  console.log(formatMarkdown(result, { showUpgradePrompt }));
}

process.exit(0);
