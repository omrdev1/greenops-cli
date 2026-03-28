# GreenOps CLI
> Open-source carbon footprint linting for AWS, Azure, and GCP CI/CD pipelines.

Analyses Terraform plans for **Scope 2 operational**, **Scope 3 embodied**, and **water consumption** impact across all three major cloud providers. Posts actionable recommendations directly on GitHub pull requests. Zero network, zero dependencies, MIT-licensed methodology.

---

## 💬 Live PR Comment

> | Metric | Monthly Total |
> |---|---|
> | 🔋 Scope 2 — Operational CO2e | **7.06kg** |
> | 🏭 Scope 3 — Embodied CO2e | **1.88kg** |
> | 🌍 Total Lifecycle CO2e | **8.93kg** |
> | 💧 Water Consumption | **7.5L** |
> | 💰 Infrastructure Cost | **$126.29/month** |

> **Potential Scope 2 Savings:** -6.90kg CO2e/month (97.7%) | -$5.11/month
> 💡 Found **2** optimization recommendations.

### Resource Breakdown

| Resource | Type | Region | Scope 2 CO2e | Scope 3 CO2e | Water | Cost/mo | Action |
|---|---|---|---|---|---|---|---|
| `aws_instance.web` | `m5.large` | `us-east-1` | 4.31kg | 1.04kg | 4.6L | $70.08 | 💡 View Recommendation |
| `aws_instance.worker` | `m6g.large` | `us-east-1` | 2.74kg | 0.83kg | 2.9L | $56.21 | 💡 View Recommendation |

### Recommendations

#### `aws_instance.web`
- **Current:** `m5.large` in `us-east-1`
- **Suggested:** `m5.large` in `eu-north-1`
- **Scope 2 Impact:** -4.21kg CO2e/month | +$2.92/month
- **Rationale:** Moving m5.large from us-east-1 to Europe (Stockholm) (eu-north-1) reduces grid carbon intensity from 384.5g to 8.8g CO2e/kWh, saving 4215g CO2e/month. Water consumption also decreases by 16.5L/month.

---

## ☁️ Provider Coverage

| Provider | Regions | Instances | Resource Types |
|---|---|---|---|
| **AWS** | 14 | 40 | `aws_instance`, `aws_db_instance` |
| **Azure** | 17 | 16 | `azurerm_linux_virtual_machine`, `azurerm_windows_virtual_machine` |
| **GCP** | 15 | 15 | `google_compute_instance` |

Run `greenops-cli --coverage` for the full instance and region list per provider.

---

## 🚀 Quickstart

Add to `.github/workflows/greenops.yml`:

```yaml
name: GreenOps PR Analysis
on:
  pull_request:
    paths: ['**/*.tf']

jobs:
  carbon-lint:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    steps:
      - uses: actions/checkout@v4

      - name: Generate Terraform Plan
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

Works with AWS, Azure, and GCP plans — provider is detected automatically from resource types.

### Inline Terraform Suggestions

```yaml
      - name: GreenOps Carbon Lint
        uses: omrdev1/greenops-cli@v0
        with:
          plan-file: plan.json
          github-token: ${{ secrets.GITHUB_TOKEN }}
          post-suggestions: true
```

When enabled, GreenOps posts an inline suggestion comment on the `instance_type`/`size`/`machine_type` line — the developer clicks **Commit suggestion** and the change is applied.

### Policy Budgets

Add `.greenops.yml` to your repository root:

```yaml
version: 1
budgets:
  max_pr_co2e_increase_kg: 10
  max_pr_cost_increase_usd: 500
  max_total_co2e_kg: 50
fail_on_violation: true
```

All fields are optional. `fail_on_violation: true` exits with code 1, blocking merge.

---

## 📦 Install

**GitHub Action** (recommended for CI):
```yaml
uses: omrdev1/greenops-cli@v0
```

**npm:**
```bash
npm install -g greenops-cli
greenops-cli diff plan.json --format table
```

**Binary** (no Node.js required):
```bash
# macOS Apple Silicon
curl -L https://github.com/omrdev1/greenops-cli/releases/latest/download/greenops-cli-darwin-arm64 -o greenops-cli
chmod +x greenops-cli && ./greenops-cli --version
```
Binaries available for `linux-x64`, `linux-arm64`, `darwin-arm64`, `darwin-x64`, `windows-x64`.

---

## 🧮 How the Maths Works

All three environmental dimensions use the same formulas regardless of cloud provider:

**Scope 2 — Operational (CPU power × grid intensity):**
```
W = W_idle + (W_max - W_idle) × utilization    [CCF linear interpolation]
energy_kwh = W × PUE × 730h / 1000
co2e_grams = energy_kwh × grid_intensity_gco2e_per_kwh
```

**Scope 3 — Embodied (hardware manufacturing):**
```
embodied_gco2e/month = (1,200,000g / 35,040h / 48 vCPUs) × vcpus × 730h
                       × 0.80  [ARM64 discount — Graviton, Ampere, T2A]
```

**Water consumption (data centre cooling):**
```
water_litres = (W × 730h / 1000) × WUE_litres_per_kwh
```

PUE differs by provider: AWS 1.13, Azure 1.125, GCP 1.10. All other coefficients are from [CCF v3](https://www.cloudcarbonfootprint.org), [Electricity Maps 2024](https://www.electricitymaps.com), and provider sustainability reports. Full methodology with worked examples in [METHODOLOGY.md](./METHODOLOGY.md).

---

## 🛑 What it doesn't cover

- AWS Lambda, ECS, EKS, Auto Scaling Groups (flagged as unsupported in output)
- Azure VMSS, AKS node groups, Function Apps (flagged)
- GCP GKE node pools, Cloud Functions (flagged)
- Memory power draw (tracked in `factors.json`, excluded from calculation — consistent with CCF baseline)
- Real-time marginal grid intensity (annual averages used)
- Multi-aliased Terraform provider configs may skip with `known_after_apply`

---

## 🧪 E2E Testing

The `fixtures/` directory contains real Terraform plan files generated against live cloud accounts with credentials stripped. The `.github/workflows/greenops-e2e.yml` workflow runs these fixtures on every PR.

```bash
npm run build
node dist/index.cjs diff fixtures/tfplan.e2e.json --format table
```

---

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) to add instance types, expand regional coverage, or add a new cloud provider. Coverage extensions are the fastest PRs to merge.
