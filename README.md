# GreenOps CLI
> Open-source carbon footprint linting for your CI/CD pipeline.

## 💬 Example PR Comment

When a pull request modifies infrastructure, GreenOps automatically posts this on the PR:

## 🌱 GreenOps Infrastructure Impact

> **Total Current Footprint:** 7.06kg CO2e/month | **$126.29**/month
> **Potential Savings:** -2.60kg CO2e/month (36.8%) | -$13.87/month
> 💡 Found **2** optimization recommendations.

| Resource | Type | Region | CO2e/month | Cost/month | Action |
|---|---|---|---|---|---|
| `aws_instance.web` | `m5.large` | `us-east-1` | 4.31kg | $70.08 | 💡 View Recommendation |
| `aws_instance.worker` | `m6g.large` | `us-east-1` | 2.74kg | $56.21 | 💡 View Recommendation |

**Recommendations**

- `aws_instance.web` — switch `m5.large` → `m6g.large`: -1.57kg CO2e/month, -$13.87/month
- `aws_instance.worker` — move `us-east-1` → `us-west-2`: -1.03kg CO2e/month, $0 cost delta

*Emissions calculated using the Open GreenOps Methodology Ledger (v1.1.0). Scope 2 operational emissions only. MIT-licensed and auditable.*

> The above was generated live against a real AWS account during E2E testing. See `fixtures/tfplan.e2e.json` for the plan used.

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

The CLI supports `--format json`, which emits the raw `PlanAnalysisResult` wrapped in a `{"schemaVersion": "1.1.0"}` envelope. Use this to pipe output into external data warehouses or the GreenOps Dashboard.
```bash
node dist/index.cjs diff plan.json --format json > result.json
```

## 📊 Supported Matrix
```text
Regions:   us-east-1, us-west-2, eu-west-1, eu-central-1, ap-southeast-2
Instances: t3.medium, t3.large, t4g.medium, t4g.large,
           m5.large, m5.xlarge, m6g.large, m6g.xlarge,
           c5.large, c5.xlarge, c6g.large, c6g.xlarge
```

Run `node dist/index.cjs --coverage` to see the full matrix, `--coverage --format json` for machine-readable output, or `--version` to check the installed version.


## 🧮 How the Math Works

GreenOps uses the open Cloud Carbon Footprint (CCF) hardware coefficients and Electricity Maps grid intensity data. Estimates cover **Scope 2 operational emissions only** (CPU power draw via linear interpolation). Embodied carbon (Scope 3) and water consumption are not tracked. The methodology is MIT-licensed and fully documented in [METHODOLOGY.md](./METHODOLOGY.md) — including a worked example that produces the exact value asserted in `engine.test.ts`.


## 🛑 What it doesn't do

GreenOps does not support:

- Microsoft Azure or Google Cloud Platform (AWS only)
- AWS Lambda or serverless compute
- ECS, EKS, Auto Scaling Groups, or Launch Templates (compute managed behind these is not analysed — the tool will flag these as unsupported in its output)
- Scope 3 embodied carbon (hardware manufacturing lifecycle)
- Water consumption tracking
- **Provider alias regions:** if your Terraform uses multiple aliased providers (e.g. `provider "aws" { alias = "secondary" }`), resources tied to non-default aliases may be skipped with a `known_after_apply` reason. Standard single-provider setups where region is set on the provider block are fully supported.

All of the above are tracked in [open issues](https://github.com/omrdev1/greenops-cli/issues).

## 🧪 E2E Testing

The `fixtures/` directory contains a real Terraform plan (`tfplan.e2e.json`) generated against a live AWS account, with credentials stripped. The `.github/workflows/greenops-e2e.yml` workflow runs this fixture through the full Action on every PR that touches core files, posting a real PR comment via `github-actions[bot]`.

To run the fixture locally:
```bash
npm run build
node dist/index.cjs diff fixtures/tfplan.e2e.json --format table
```

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) to add instance types, expand regional coverage, or improve the methodology. Coverage extensions are the fastest PRs to merge.
