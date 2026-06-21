# GreenOps CLI
> Open-source carbon footprint linting for AWS, Azure, and GCP CI/CD pipelines.

Analyses Terraform plans for **Scope 2 operational**, **Scope 3 embodied**, and **water consumption** impact across all three major cloud providers. Posts actionable recommendations directly on GitHub pull requests. Zero network, zero dependencies, MIT-licensed methodology.

---

## 💬 Live PR Comment

> | Metric | Monthly Total |
> |---|---|
> | 🔋 Scope 2 (Operational CO2e) | **7.06kg** |
> | 🏭 Scope 3 (Embodied CO2e) | **1.88kg** |
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
| **AWS** | 14 | 50 | `aws_instance`, `aws_db_instance`, `aws_eks_node_group`, `aws_lambda_function`, `aws_sagemaker_endpoint_configuration` |
| **Azure** | 17 | 16 | `azurerm_linux_virtual_machine`, `azurerm_windows_virtual_machine`, `azurerm_virtual_machine`, `azurerm_kubernetes_cluster`, `azurerm_kubernetes_cluster_node_pool`, `azurerm_function_app`, `azurerm_linux_function_app`, `azurerm_windows_function_app` |
| **GCP** | 15 | 15 | `google_compute_instance`, `google_container_node_pool`, `google_cloud_run_service`, `google_cloudfunctions_function`, `google_cloudfunctions2_function`, `google_workbench_instance` |

Kubernetes node groups (EKS, AKS, GKE) resolve to the same instance ledger as standalone VMs. Node count scales the output, not the per-node calculation. See [Kubernetes Node Groups](#-kubernetes-node-groups) below.

GPU instances (`g5.xlarge`, `p4d.24xlarge`, `p5.48xlarge`) and managed AI services (SageMaker, Vertex AI Workbench) are also supported, Scope 2 only — see [AI & GPU Workloads](#-ai--gpu-workloads) below.

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
        uses: omrdev1/greenops-cli@v0.9.1
        with:
          plan-file: plan.json
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

Works with AWS, Azure, and GCP plans. Provider is detected automatically from resource types.

### Inline Terraform Suggestions

```yaml
      - name: GreenOps Carbon Lint
        uses: omrdev1/greenops-cli@v0.9.1
        with:
          plan-file: plan.json
          github-token: ${{ secrets.GITHUB_TOKEN }}
          post-suggestions: true
```

When enabled, GreenOps posts an inline suggestion comment on the `instance_type`/`size`/`machine_type` line. The developer clicks **Commit suggestion** and the change is applied.

### Policy Budgets

Add `.greenops.yml` to your repository root:

```yaml
version: 1
budgets:
  max_pr_co2e_increase_kg: 10
  max_pr_cost_increase_usd: 500
  max_total_co2e_kg: 50
  max_lifecycle_co2e_kg: 60  # Scope 2 + Scope 3 combined (CSRD reporting)
fail_on_violation: true
```

All fields are optional. `fail_on_violation: true` exits with code 1, blocking merge.

### Action Inputs Reference

| Input | Required | Default | Description |
|---|---|---|---|
| `plan-file` | ✅ | — | Path to `terraform show -json` output |
| `github-token` | ✅ | — | Token for posting PR comments (`pull-requests: write`) |
| `post-suggestions` | ❌ | `false` | Post inline Terraform suggestion comments (one-click committable) |
| `show-upgrade-prompt` | ❌ | `true` | Append a GreenOps Dashboard link to the PR comment. Set `false` to suppress. |
| `api-key` | ❌ | — | Optional API key for the GreenOps Dashboard telemetry aggregation. No calls are made if omitted. |

---

## 📦 Install

**GitHub Action** (recommended for CI):
```yaml
uses: omrdev1/greenops-cli@v0.9.1
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

**Scope 2 (Operational): CPU power times grid intensity**
```
W_cpu     = W_idle + (W_max - W_idle) × utilization    [CCF linear interpolation]
W_memory  = memory_gb × 0.392                          [CCF constant, not utilization-dependent]
W         = W_cpu + W_memory
energy_kwh = W × PUE × 730h / 1000
co2e_grams = energy_kwh × grid_intensity_gco2e_per_kwh
```

**Scope 3 (Embodied): hardware manufacturing**
```
embodied_gco2e/month = (1,200,000g / 35,040h / 48 vCPUs) × vcpus × 730h
                       × 0.80  [ARM64 discount: Graviton, Ampere, T2A]
```
_Note: these values are pre-computed per instance type and stored in the methodology ledger (`factors.json`). The formula above documents how ledger values are generated._

**Water consumption (data centre cooling):**
```
water_litres = (W × 730h / 1000) × WUE_litres_per_kwh
```

PUE differs by provider: AWS 1.13, Azure 1.125, GCP 1.10. All other coefficients are from [CCF v3](https://www.cloudcarbonfootprint.org), [Electricity Maps 2024](https://www.electricitymaps.com), and provider sustainability reports. Full methodology with worked examples in [METHODOLOGY.md](./METHODOLOGY.md).

---

## ☸️ Kubernetes Node Groups

`aws_eks_node_group`, `azurerm_kubernetes_cluster`, `azurerm_kubernetes_cluster_node_pool`, and `google_container_node_pool` are analysed the same way as standalone instances, multiplied by node count.

```
aws_eks_node_group.workers
  instance_types: ["m5.large"]
  scaling_config: { desired_size: 3, min_size: 2, max_size: 6 }

  -> reported as m5.large x 2
```

**Autoscaling groups are reported at minimum configured size, never desired or maximum.** This is intentional, not a limitation: a tool that overstates emissions is as misleading as one that understates them, and an autoscaler's actual node count at any given moment is unknown at plan time. The PR comment notes this explicitly whenever a node group is detected, so the reported figure is read as a floor, not an estimate of typical usage.

ARM upgrade and region shift recommendations apply across the whole node group. A recommendation on a 4-node group reports 4x the per-node saving, calculated from the same per-instance delta used for standalone resources.

---

## 🤖 AI & GPU Workloads

GPU instances and managed AI services are detected through the same extraction patterns as everything else — no special config needed — but are deliberately scoped to **Scope 2 (operational) carbon only**.

**GPU instances** (`g5.xlarge`, `p4d.24xlarge`, `p5.48xlarge`, AWS `us-east-1` only): power draw is calculated from real NVIDIA TDP specs (A10G 300W, A100 400W, H100 700W per GPU), not estimated.

**SageMaker** (`aws_sagemaker_endpoint_configuration`): reuses the underlying EC2 instance's hardware specs (`ml.g5.xlarge` and `g5.xlarge` are the same hardware) but tracks SageMaker's real, separately-published pricing premium — never derived from raw EC2 pricing. Assumes the endpoint runs continuously, since a Terraform plan can't see actual invocation volume.

**Vertex AI Workbench** (`google_workbench_instance`, GCP `us-central1` only): billed at standard Compute Engine rates, no managed-service markup. NVIDIA T4 GPU attachments are supported; A100/V100/L4 are not yet (no confidently-sourced standalone add-on price — explicitly skipped rather than guessed).

**Embodied (Scope 3) carbon is not modeled for any GPU, whether standalone, in SageMaker, or attached to a Workbench instance.** This ledger's embodied-carbon formula is calibrated to a generic CPU server; a GPU's manufacturing footprint is a different hardware class entirely, and no equivalent public baseline exists yet to cite honestly. Every GPU-touching resource is reported with embodied carbon as `0` and confidence `LOW_ASSUMED_DEFAULT`, with the gap stated explicitly in the PR comment — not silently approximated. Full detail in [METHODOLOGY.md](./METHODOLOGY.md#gpu-instances-scope-2-only).

Not yet supported: Azure GPU instances (NC/ND-series), Azure ML, GCP Vertex AI prediction endpoints (the model-serving compute itself, as opposed to Workbench notebooks).

---

## 🛑 What it doesn't cover

- `aws_ecs_service`, `aws_launch_template`, `aws_autoscaling_group` (flagged as unsupported in output)
- `azurerm_virtual_machine_scale_set` (flagged)
- `google_compute_instance_template`, `google_container_cluster` (flagged; use `google_container_node_pool` for GKE workloads, which is supported)
- Azure GPU instances, Azure ML, and GCP Vertex AI prediction endpoints — see [AI & GPU Workloads](#-ai--gpu-workloads) above for what IS covered
- Embodied (Scope 3) carbon for any GPU — explicit gap, not a measured zero, see above
- Real-time marginal grid intensity (annual averages used)
- Multi-aliased Terraform provider configs may skip with `known_after_apply`

> ⚡ **Lambda/serverless** (`aws_lambda_function`, `azurerm_function_app`, `azurerm_linux_function_app`, `azurerm_windows_function_app`, `google_cloud_run_service`, `google_cloudfunctions_function`, `google_cloudfunctions2_function`) are estimated using assumed defaults, flagged as `LOW_ASSUMED_DEFAULT` in output with assumptions shown.

---

## 🧪 E2E Testing

The `fixtures/` directory contains Terraform plan files for all three providers plus a Kubernetes node group case. The `.github/workflows/greenops-e2e.yml` workflow runs all four on every PR.

```bash
npm run build

# AWS
node dist/index.cjs diff fixtures/tfplan.e2e.json --format table

# Azure
node dist/index.cjs diff fixtures/tfplan.azure.e2e.json --format table

# GCP
node dist/index.cjs diff fixtures/tfplan.gcp.e2e.json --format table

# AWS EKS node group
node dist/index.cjs diff fixtures/tfplan.eks.e2e.json --format table
```

---

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) to add instance types, expand regional coverage, or add a new cloud provider. Coverage extensions are the fastest PRs to merge.
