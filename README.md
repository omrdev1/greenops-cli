# GreenOps CLI
> Open-source carbon footprint linting for your CI/CD pipeline.

## 💬 Example PR Comment

When a pull request modifies infrastructure, GreenOps posts this directly on the PR:
```
🌿 GreenOps Carbon Analysis

This plan adds +12.94 kg CO2e/month (~$210.24/mo)
💡 2 recommendations found — potential saving: −4.71kg CO2e/month | −$41.61/month

Resource               | Instance   | Region    | CO2e/mo | Cost/mo | Action
aws_instance.api       | m5.xlarge  | us-east-1 | 8.63kg  | $140.16 | → Switch to m6g.xlarge
aws_db_instance.main   | m5.large   | us-east-1 | 4.31kg  | $70.08  | → Switch to m6g.large

Emissions calculated using Open GreenOps Methodology Ledger v1.0.0 · MIT Licensed
```

## 🚀 Quickstart

Paste this into your GitHub Actions workflow (`.github/workflows/greenops.yml`):
```yaml
name: GreenOps PR Analysis
on:
  pull_request:
    paths:
      - '**/*.tf'

jobs:
  carbon-lint:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    steps:
      - uses: actions/checkout@v4

      - name: Generate Terraform Plan
        # Note: this example uses -backend=false for demonstration.
        # For repositories with remote state, remove that flag and configure
        # your backend credentials as secrets before this step.
        run: |
          terraform init -backend=false
          terraform plan -out=tfplan -refresh=false
          terraform show -json tfplan > plan.json

      - name: GreenOps Carbon Lint
        uses: omrdev1/greenops-cli@v0
        with:
          plan-file: plan.json
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### JSON Output Mode

The CLI supports `--format json`, which emits the raw `PlanAnalysisResult` wrapped in a `{"schemaVersion": "1.0.0"}` envelope. Use this to pipe output into external data warehouses or the GreenOps Dashboard.
```bash
node dist/index.cjs diff plan.json --format json > result.json
```

## 📊 Supported Matrix
```text
Regions:   us-east-1, us-west-2, eu-west-1, eu-central-1, ap-southeast-2
Instances: t3.medium, t3.large, m5.large, m5.xlarge, c5.large, c5.xlarge,
           m6g.large, m6g.xlarge, c6g.large, c6g.xlarge
```

Run `node dist/index.cjs --coverage` to see the full matrix, or `--coverage --json` for machine-readable output.


## 🧮 How the Math Works

GreenOps uses the open Cloud Carbon Footprint (CCF) hardware coefficients and Electricity Maps grid intensity data. The methodology is MIT-licensed and fully documented in [METHODOLOGY.md](./METHODOLOGY.md) — including a worked example that produces the exact value asserted in `engine.test.ts`.


## 🛑 What it doesn't do

GreenOps does not support:

- Microsoft Azure or Google Cloud Platform (AWS only)
- AWS Lambda or serverless compute
- Scope 3 embodied carbon (hardware manufacturing lifecycle)
- Water consumption tracking
- **Provider alias regions:** if your Terraform abstracts region into provider aliases, affected resources are skipped with a `known_after_apply` reason

All of the above are tracked in [open issues](https://github.com/omrdev1/greenops-cli/issues).

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) to add instance types, expand regional coverage, or improve the methodology. Coverage extensions are the fastest PRs to merge.