import { parseArgs } from 'node:util';
import factorsData from './factors.json' with { type: 'json' };
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
    json: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
    'show-upgrade-prompt': { type: 'string', default: 'true' }
  }
});

if (values.help) {
  console.log(`GreenOps CLI\nUsage: greenops-cli diff <plan.json> [--format markdown|table]\n       greenops-cli --coverage [--json]`);
  process.exit(0);
}

if (values.coverage) {
  const rawFs = Object.assign({}, factorsData);
  if (values.json) {
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

const extracted = extractResourceInputs(planFile);

if (extracted.error) {
  console.error(`Extraction Error: ${extracted.error}`);
  process.exit(1);
}

const result = analysePlan(extracted.resources, extracted.skipped, planFile);
const showUpgradePrompt = values['show-upgrade-prompt'] === 'true';

if (values.format === 'table') {
  console.log(formatTable(result));
} else if (values.format === 'json') {
  console.log(formatJson(result));
} else {
  console.log(formatMarkdown(result, { showUpgradePrompt }));
}

process.exit(0);
