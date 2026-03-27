# GreenOps CLI
> Open-source carbon footprint linting for your CI/CD pipeline.

Analyses Terraform plans for **Scope 2 operational**, **Scope 3 embodied**, and **water consumption** impact. Posts actionable recommendations directly on GitHub pull requests. Zero network, zero dependencies, MIT-licensed methodology.

---

## 💬 Live PR Comment

When a pull request modifies infrastructure, GreenOps posts this directly on the PR — generated live against a real AWS account during E2E testing:

## 🌱 GreenOps Infrastructure Impact

> | Metric | Monthly Total |
> |---|---|
> | 🔋 Scope 2 — Operational CO2e | **7.06kg** |
> | 🏭 Scope 3 — Embodied CO2e | **1.67kg** |
> | 🌍 Total Lifecycle CO2e | **8.73kg** |
> | 💧 Water Consumption | **32.2L** |
> | 💰 Infrastructure Cost | **$126.29/month** |

> **Potential Scope 2 Savings:** -6.90kg CO2e/month (97.7%) | -$5.11/month
> 💡 Found **2** optimization recommendations.

### Resource Breakdown

| Resource | Type | Region | Scope 2 CO2e | Scope 3 CO2e | Water | Cost/mo | Action |
|---|---|---|---|---|---|---|---|
| `aws_instance.web` | `m5.large` | `us-east-1` | 4.31kg | 1.04kg | 18.2L | $70.08 | 💡 View Recommendation |
| `aws_instance.worker` | `m6g.large` | `us-east-1` | 2.74kg | 0.83kg | 14.0L | $56.21 | 💡 View Recommendation |

### Recommendations

#### `aws_instance.web`
- **Current:** `m5.large` in `us-east-1`
- **Suggested:** `m5.large` in `eu-north-1`
- **Scope 2 Impact:** -4.21kg CO2e/month | +$2.92/month
- **Rationale:** Moving m5.large from us-east-1 to Europe (Stockholm) (eu-north-1) reduces grid carbon intensity from 384.5g to 8.8g CO2e/kWh, saving 4215g CO2e/month (note: cost increases by $2.92/month). Water consumption also decreases by 16.5L/month.

---

## 🚀 Quickstart

Add to `.github/workflows/greenops.yml`:

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
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        run: |
          terraform init
          terraform plan -out=tfplan
          terraform show -json tfplan > plan.json

      - name: GreenOps Carbon Lint
        uses: omrdev1/greenops-cli@v0
        with:
          plan-file: plan.json
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Inline Terraform Suggestions

Enable one-click committable Terraform fixes on the PR diff:

```yaml
      - name: GreenOps Carbon Lint
        uses: omrdev1/greenops-cli@v0
        with:
          plan-file: plan.json
          github-token: ${{ secrets.GITHUB_TOKEN }}
          post-suggestions: true
```

When enabled, GreenOps posts an inline suggestion comment directly on the `instance_type` line — the developer clicks **Commit suggestion** and the change is applied.

### Policy Budgets

Add `.greenops.yml` to your repository root to enforce carbon and cost limits:

```yaml
version: 1
budgets:
  max_pr_co2e_increase_kg: 10       # Block PRs adding >10kg CO2e/month
  max_pr_cost_increase_usd: 500     # Block PRs adding >$500/month
  max_total_co2e_kg: 50             # Block if total analysed footprint >50kg/month
fail_on_violation: true             # Exit code 1 on violation (blocks merge)
```

All fields are optional. Omitting `fail_on_violation` makes violations warnings only. No policy file means all PRs pass.

---

## 📊 Coverage

**Ledger version:** v1.3.0

```
Regions (14):   us-east-1, us-east-2, us-west-1, us-west-2,
                eu-west-1, eu-west-2, eu-central-1, eu-north-1,
                ap-southeast-1, ap-southeast-2, ap-northeast-1,
                ap-south-1, ca-central-1, sa-east-1

Instances (40): t3.micro/small/medium/large/xlarge
                t3a.medium/large
                m5.large/xlarge/2xlarge
                m5a.large/xlarge
                c5.large/xlarge/2xlarge
                c5a.large/xlarge
                r5.large/xlarge
                t4g.micro/small/medium/large/xlarge
                m6g.medium/large/xlarge/2xlarge
                m7g.medium/large/xlarge/2xlarge
                c6g.medium/large/xlarge/2xlarge
                c7g.large/xlarge
                r6g.large/xlarge
```

Run `node dist/index.cjs --coverage` to see the full matrix, or `--coverage --format json` for machine-readable output.

---

## 🧮 How the Maths Works

GreenOps tracks three environmental dimensions per resource:

**Scope 2 — Operational (CPU power × grid intensity):**
```
W = W_idle + (W_max - W_idle) × utilization    [linear interpolation]
energy_kwh = W × PUE × 730h / 1000
co2e_grams = energy_kwh × grid_intensity_gco2e_per_kwh
```

**Scope 3 — Embodied (hardware manufacturing lifecycle):**
```
embodied_gco2e/month = (1,200,000g / 35,040h / 48 vCPUs) × vcpus × 730h
                       × 0.80  [ARM64 discount for smaller die + lower TDP]
```

**Water consumption (data centre cooling):**
```
water_litres = (W × 730h / 1000) × WUE_litres_per_kwh
```

All coefficients are sourced from Cloud Carbon Footprint v3, Electricity Maps 2024 annual averages, and the AWS 2023 Sustainability Report. The full methodology with worked examples is in [METHODOLOGY.md](./METHODOLOGY.md).

---

## 🛑 What it doesn't cover

- Microsoft Azure or Google Cloud Platform (AWS only)
- AWS Lambda, ECS, EKS, Auto Scaling Groups (flagged as unsupported in output)
- Memory power draw (tracked in `factors.json`, excluded from calculation — consistent with CCF baseline)
- Scope 3 supply chain emissions beyond hardware embodied carbon
- Real-time marginal grid intensity (annual averages used for reproducibility)
- **Provider alias regions:** multi-aliased provider configs may skip with `known_after_apply`. Standard single-provider configs are fully supported.

All of the above are tracked in [open issues](https://github.com/omrdev1/greenops-cli/issues).

---

## 🧪 E2E Testing

The `fixtures/` directory contains a real Terraform plan (`tfplan.e2e.json`) generated against a live AWS account, with credentials stripped. The `.github/workflows/greenops-e2e.yml` workflow runs this fixture through the full Action on every PR touching core files, posting a real PR comment via `github-actions[bot]`.

```bash
npm run build
node dist/index.cjs diff fixtures/tfplan.e2e.json --format table
```

---

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) to add instance types, expand regional coverage, or improve the methodology. Coverage extensions are the fastest PRs to merge.
