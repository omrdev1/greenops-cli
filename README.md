# GreenOps CLI
> Open-source carbon footprint linting for your CI/CD pipeline.

## 🚀 Quickstart
Paste this into your GitHub Actions workflow (`.github/workflows/greenops.yml`) to evaluate Terraform pull requests:

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
        uses: greenops-cli/greenops-action@v0
        with:
          plan-file: plan.json
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### JSON Output Mode
The CLI supports extracting raw machine-readable calculations via `--format json`. This emits the raw `PlanAnalysisResult` enveloped within a `{"schemaVersion": "1.0.0"}` object. It allows you to pipe the outputs upstream directly into external data warehouses or the GreenOps SaaS Dashboard, bypassing the formatted markdown layers natively.

## 📊 Supported Matrix
Currently supported baseline evaluation coverage:
```text
Supported Regions: us-east-1, us-west-2, eu-west-1, eu-central-1, ap-southeast-2
Supported Instances: t3.medium, t3.large, m5.large, m5.xlarge, c5.large, c5.xlarge, m6g.large, m6g.xlarge, c6g.large, c6g.xlarge
```

## 🧮 How the Math Works
GreenOps calculates your infrastructure carbon footprint using the open Cloud Carbon Footprint (CCF) hardware metrics and Grid Carbon Intensity mapping. We prioritize methodology transparency over proprietary black-box calculations—[Read our full mathematical breakdown in METHODOLOGY.md](./METHODOLOGY.md).

## 🛑 What it doesn't do
Trust requires honesty. For v0.1.0, GreenOps **does not** support:
- Microsoft Azure or Google Cloud Platform (AWS only).
- Scope 3 Embodied Carbon (manufacturing/lifecycle impact footprinting).
- AWS Lambda or serverless billing ingestion formats.
- **Provider Alias Regions:** Provider blocks abstracting regional values default to `known_after_apply` skips.

## 🤝 Contributing
Want to extend the methodology? See [CONTRIBUTING.md](./CONTRIBUTING.md) to add AWS instances or expand regional matrices.
