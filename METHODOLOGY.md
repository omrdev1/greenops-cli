# GreenOps Methodology Ledger v2.0.0

**Methodology transparency is the only defence against greenwashing.**

All maths in GreenOps is open, auditable, and reproducible from `factors.json`. This document defines the exact formulas, assumptions, and data sources used in every calculation.

---

## Cloud Provider Coverage

| Provider | Regions | Instances | Status |
|---|---|---|---|
| AWS | 14 | 50 | Full coverage for listed instance and node group types. 3 GPU instances (`g5.xlarge`, `p4d.24xlarge`, `p5.48xlarge`) Scope 2-only, `us-east-1` only — see [GPU Instances](#gpu-instances-scope-2-only). SageMaker endpoint configs (Scope 2-only, `us-east-1` only) — see [Managed AI Services](#managed-ai-services) |
| Azure | 17 | 16 | Full coverage for listed instance and node group types |
| GCP | 15 | 15 | Full coverage for listed instance and node group types. Vertex AI Workbench (Scope 2-only, T4 GPU only) — see [Managed AI Services](#managed-ai-services) |

Run `greenops-cli --coverage` to see the full instance and region list per provider.

---

## Emission Scopes Covered

| Scope | What it measures | GreenOps status |
|---|---|---|
| Scope 2 (Operational) | CPU and memory power draw multiplied by grid carbon intensity | Tracked |
| Scope 3 (Embodied) | Hardware manufacturing lifecycle | Tracked |
| Water consumption | Data centre cooling water withdrawal | Tracked |
| Scope 3 (Supply chain) | Software, logistics, employee travel | Out of scope |
| Scope 1 (Direct) | On-site combustion | Not applicable to cloud infrastructure |

---

## Scope 2: Operational Emissions

### Power Model

GreenOps uses the **linear interpolation model** from the Cloud Carbon Footprint (CCF) methodology, extended with memory power draw:

```
W_cpu    = W_idle + (W_max - W_idle) × utilization
W_memory = memory_gb × 0.392 W/GB
W_effective = W_cpu + W_memory
```

Where:
- `W_idle` = idle TDP (watts) from `factors.json`
- `W_max` = maximum TDP (watts) from `factors.json`
- `utilization` = CPU utilisation fraction (default: 0.50, matching CCF baseline)
- `memory_gb` = RAM size from `factors.json`
- `0.392 W/GB` = CCF memory power coefficient (constant, not utilization-dependent)

Memory power draw is **constant** regardless of CPU utilisation. This reflects that DRAM draws near-constant power whether or not it is actively being written to, consistent with CCF v3 methodology.

### Carbon Calculation

```
energy_kwh = W_effective × PUE × hours_per_month / 1000
co2e_grams = energy_kwh × grid_intensity_gco2e_per_kwh
```

### PUE by Provider

| Provider | PUE | Source |
|---|---|---|
| AWS | 1.13 | AWS sustainability reports |
| Azure | 1.125 | Microsoft sustainability reports |
| GCP | 1.10 | Google sustainability reports |

GCP's 1.10 PUE is the best in class among the three major providers, producing ~3% less overhead energy per unit of compute.

### Worked Example: AWS m5.large in us-east-1 at 50% utilisation

1. **CPU power:** `W_cpu = 6.8 + (20.4 - 6.8) × 0.50 = 13.6W`
2. **Memory power:** `W_mem = 8GB × 0.392 = 3.136W`
3. **Total:** `W = 13.6 + 3.136 = 16.736W`
4. **Energy:** `16.736W × 1.13 PUE × 730h / 1000 = 13.816 kWh/month`
5. **Carbon:** `13.816 × 384.5 = 5,308.2g CO2e/month`

### Worked Example: Azure Standard_D2s_v3 in eastus at 50% utilisation

1. **CPU power:** `W_cpu = 6.8 + (20.4 - 6.8) × 0.50 = 13.6W`
2. **Memory power:** `W_mem = 8GB × 0.392 = 3.136W`
3. **Total:** `W = 16.736W`
4. **Energy:** `16.736W × 1.125 PUE × 730h / 1000 = 13.745 kWh/month`
5. **Carbon:** `13.745 × 380.0 = 5,222.9g CO2e/month`

### Worked Example: GCP n2-standard-2 in us-central1 at 50% utilisation

1. **CPU power:** `W_cpu = 6.8 + (20.4 - 6.8) × 0.50 = 13.6W`
2. **Memory power:** `W_mem = 8GB × 0.392 = 3.136W`
3. **Total:** `W = 16.736W`
4. **Energy:** `16.736W × 1.10 PUE × 730h / 1000 = 13.445 kWh/month`
5. **Carbon:** `13.445 × 340.0 = 4,569.3g CO2e/month`

---

## Scope 3: Embodied Emissions

Embodied carbon covers the manufacturing, transport, and end-of-life disposal of server hardware, prorated to the fraction of a physical server this instance type occupies.

### Formula

```
embodied_gco2e_per_month = (server_total_embodied_gco2e / lifespan_hours / vcpus_per_server)
                           × vcpus × 730h × architecture_factor
```

### Constants

| Parameter | Value | Source |
|---|---|---|
| Server total embodied CO2e | 1,200,000 gCO2e | CCF DELL R740 baseline |
| Server lifespan | 4 years = 35,040 hours | AWS/CCF assumption |
| vCPUs per physical server | 48 | Dual-socket Xeon baseline |
| ARM architecture discount | 0.80 (20% lower) | Graviton/Ampere smaller die + lower TDP |

### Per-vCPU rates

```
x86_64: (1,200,000 / 35,040 / 48) × 730 = 520.8g CO2e/vCPU/month
arm64:  520.8 × 0.80                     = 416.7g CO2e/vCPU/month
```

The ARM discount applies equally to AWS Graviton, Azure Ampere (Dps-series), and GCP T2A instances, all of which use Arm Neoverse cores with comparable manufacturing profiles.

---

## Kubernetes Node Groups

`aws_eks_node_group`, `azurerm_kubernetes_cluster`, `azurerm_kubernetes_cluster_node_pool`, and `google_container_node_pool` use the exact Scope 2, Scope 3, and water formulas above, applied once per node and multiplied by node count:

```
node_group_co2e_per_month = per_node_co2e_per_month × node_count
```

Node count for autoscaling groups is read from the minimum configured size (`min_size`, `min_count`, or `autoscaling.min_node_count`), never the desired or maximum size. This is a deliberate floor, not an estimate of typical usage: an autoscaler's actual node count at any given moment cannot be known from a Terraform plan, and reporting the maximum would overstate the footprint in the common case where the group is not fully scaled up. The PR comment notes this explicitly whenever a node group is detected.

ARM upgrade and region shift recommendations apply the same scoring as standalone instances (see Recommendation Engine below), with the resulting delta multiplied by node count.

---

## GPU Instances (Scope 2 only)

GPU-accelerated instances (`g5.xlarge`, `p4d.24xlarge`, `p5.48xlarge`) are detected through the same `aws_instance` extraction path as any other instance — no special-casing is required, since `instance_type` is a free-form ledger lookup key, not an allowlist.

### What is covered

Scope 2 (operational) carbon, using the GPU's published TDP as the power ceiling:

| Instance | GPUs | TDP per GPU | Total GPU power | Source |
|---|---|---|---|---|
| `g5.xlarge` | 1× NVIDIA A10G | 300W | 300W | AWS/NVIDIA A10G datasheet |
| `p4d.24xlarge` | 8× NVIDIA A100 40GB | 400W | 3,200W | NVIDIA A100 datasheet |
| `p5.48xlarge` | 8× NVIDIA H100 80GB | 700W | 5,600W | NVIDIA H100 datasheet |

Idle power is modelled at ~12% of TDP, sourced from published idle-draw figures for H100/A100 (NVIDIA forum and vendor reporting indicate idle draw under 100W on a 700W-TDP H100). This is a GPU-specific ratio, deliberately not reused from the ~30% idle/max ratio applied to CPU instances elsewhere in this ledger — GPUs idle proportionally lower than CPUs as a hardware characteristic, and forcing the CPU convention onto GPU entries would overstate idle draw.

### What is NOT covered (explicit gap, not a measured zero)

**Embodied (Scope 3) carbon is reported as `0` for all GPU instances.** This ledger's existing embodied-carbon model is calibrated to a generic CPU server (CCF's Dell R740 baseline, ~1,200kg CO2e/server, prorated per vCPU). A GPU server's manufacturing footprint is a fundamentally different hardware class — substantially higher per unit, dominated by the GPU dies themselves rather than CPU silicon — and no equivalent public CCF-style GPU baseline exists yet to cite honestly. Rather than apply the CPU baseline (which would understate embodied carbon) or guess a multiplier without a real source, GreenOps CLI reports `0` and marks the resource `LOW_ASSUMED_DEFAULT` confidence with an explicit `unsupportedReason`. The markdown PR comment surfaces this distinctly, per-resource, in a dedicated "🤖 AI Infrastructure Carbon Impact" section (separate from the general resource table) — so it cannot be mistaken for "no embodied carbon."

**Pricing and instance coverage is currently scoped to `us-east-1` only.** GPU instance availability and pricing vary meaningfully by region and were not uniformly verifiable across all 14 AWS regions already covered for CPU instances; rather than publish a guessed regional spread, only the region with the clearest, most consistently-cited public pricing was added. Other regions will report `unsupported_region` for these instance types until verified and added.

**No GPU coverage yet for Azure or GCP.** Azure NC/ND-series and GCP A2/A3/G2 GPU families are not yet in the ledger. This is a scoping limit, not a technical one — the same `aws_instance`-style extraction-by-resource-type pattern applies equally to `azurerm_linux_virtual_machine` and `google_compute_instance`.

---

## Managed AI Services

### AWS SageMaker (Scope 2 only)

`aws_sagemaker_endpoint_configuration` carries the actual instance sizing (`production_variants[].instance_type`) — the deployed `aws_sagemaker_endpoint` resource itself only references a config by name and has no sizing data, so the configuration resource is what's analysed.

SageMaker `ml.*` instance types share identical vCPU/memory/GPU hardware with the matching EC2 instance family (confirmed against AWS's own SageMaker documentation), so power and embodied-carbon specs are reused directly from the existing instance ledger — no duplicate hardware data. Pricing is NOT reused from EC2: SageMaker carries a real, separately-published premium (e.g. `ml.g5.xlarge` runs roughly 2x raw `g5.xlarge` on-demand pricing), tracked in its own `managed_ai_pricing_usd_per_hour` table, scoped to `us-east-1` for `m5.large`, `m5.xlarge`, `g5.xlarge`, and `p4d.24xlarge`.

Every SageMaker estimate is `LOW_ASSUMED_DEFAULT`: the figure assumes the endpoint runs continuously at the ledger's default utilization, since real invocation/runtime patterns are not visible in a Terraform plan (the same limitation Lambda serverless estimates already carry). GPU-backed endpoints (e.g. `ml.p4d.24xlarge`) carry the same embodied-carbon gap as raw GPU instances — reported as `0`, not estimated.

### GCP Vertex AI Workbench (Scope 2 only)

`google_workbench_instance` nests its sizing inside a `gce_setup {}` block (`machine_type`, and separately `accelerator_configs[]` for any attached GPU). Unlike SageMaker, Workbench carries no managed-service price premium — Google bills it as the underlying Compute Engine machine plus a standalone per-GPU accelerator rate (confirmed: Workbench appears in GCP billing as Compute Engine charges with a product label, not a separate line item). So this path reuses the existing raw `pricing_usd_per_hour` table for the base machine, plus a real standalone GPU add-on rate.

Currently supported: NVIDIA T4 (70W TDP, $0.35/hr standalone add-on, both GCP public figures) attached to any base machine type already in the GCP instance ledger. `n1-standard-*` is a common real-world Workbench default but is not yet in this ledger at all (separate gap, not specific to Workbench) — falls through honestly as `unsupported_instance`.

**A100/V100/L4 accelerators are explicitly NOT supported.** GCP's standalone per-GPU add-on pricing for these accelerators could not be confidently distinguished from bundled A2-family instance pricing during research for this release — rather than risk citing a wrong number, a Workbench instance with an unrecognized `accelerator_configs[].type` is skipped with reason `unsupported_accelerator:<type>`, not silently reported using only the base machine's carbon (which would understate the resource's real footprint without saying so).

### Explicitly out of scope this release

Azure ML (`azurerm_machine_learning_compute_instance`/`compute_cluster`) — not yet researched. Vertex AI prediction endpoints (`google_vertex_ai_endpoint`) — the actual model-serving compute is provisioned through a separate model-deployment step with no flat instance-type field on the endpoint resource itself, genuinely harder to extract correctly than Workbench; deferred rather than force a fragile extraction.

---

## Water Consumption

```
energy_kwh_IT = W_effective × hours / 1000   (IT load, before PUE)
water_litres   = energy_kwh_IT × WUE_litres_per_kwh
```

WUE is applied to IT load (before PUE multiplication), matching the AWS/Azure/Google definition.

### Regional WUE Values

#### AWS regions

| Region | Location | WUE (L/kWh) |
|---|---|---|
| us-east-1 | N. Virginia | 0.46 |
| us-east-2 | Ohio | 0.52 |
| us-west-1 | N. California | 0.38 |
| us-west-2 | Oregon | 0.18 |
| eu-west-1 | Ireland | 0.22 |
| eu-west-2 | London | 0.25 |
| eu-central-1 | Frankfurt | 0.28 |
| eu-north-1 | Stockholm | **0.10** |
| ap-southeast-1 | Singapore | 0.58 |
| ap-southeast-2 | Sydney | 0.45 |
| ap-northeast-1 | Tokyo | 0.50 |
| ap-south-1 | Mumbai | 0.72 |
| ca-central-1 | Canada | 0.20 |
| sa-east-1 | São Paulo | 0.35 |

#### Azure regions

| Region | Location | WUE (L/kWh) |
|---|---|---|
| swedencentral | Sweden Central | **0.10** |
| westus2 | West US 2 | 0.18 |
| northeurope | Ireland | 0.22 |
| canadacentral | Canada Central | 0.20 |
| westeurope | Netherlands | 0.20 |
| uksouth | London | 0.25 |

#### GCP regions

| Region | Location | WUE (L/kWh) |
|---|---|---|
| europe-north1 | Finland | **0.12** |
| northamerica-northeast1 | Montreal | 0.20 |
| us-west1 | Oregon | 0.18 |

Source: AWS 2023 Sustainability Report, Microsoft 2023 Environmental Sustainability Report, Google 2023 Environmental Report.

---

## Recommendation Engine

GreenOps evaluates two strategies per resource and selects the highest-scoring option:

**Strategy 1 (ARM upgrade):** Switch x86_64 to ARM64 (same vCPU/RAM class). Only recommended if both CO2e and cost decrease. Supported across all three providers.

**Strategy 2 (Region shift):** Move to the lowest grid-intensity region within the same provider that has pricing data for this instance. Only recommended if CO2e reduction exceeds 15% of baseline.

**Scoring:**

```
score = (|co2e_delta| / baseline_co2e) × 0.60
      + (|cost_delta| / baseline_cost) × 0.40
```

Carbon reduction is weighted at 60%, cost at 40%, both normalised to percentage-of-baseline.

### ARM Upgrade Maps

| AWS (x86 → ARM64) | Azure (x86 → ARM64) | GCP (x86 → ARM64) |
|---|---|---|
| t3/t3a → t4g | Standard_D2s_v3 → Standard_D2ps_v5 | n2 → t2a |
| m5/m5a → m6g | Standard_D4s_v3 → Standard_D4ps_v5 | n2d → t2a |
| c5/c5a → c6g | Standard_D8s_v3 → Standard_D8ps_v5 | e2 → t2a |
| r5/r5a → r6g | Standard_D2s_v4 → Standard_D2ps_v5 | | |

---

## Data Sources

| Data | Source | Version |
|---|---|---|
| AWS instance TDP | Cloud Carbon Footprint hardware coefficients | v3 |
| Azure instance TDP | Cloud Carbon Footprint Azure coefficients | v3 |
| GCP instance TDP | Cloud Carbon Footprint GCP coefficients | v3 |
| Embodied carbon per server | CCF DELL R740 baseline | v3 |
| AWS grid carbon intensity | Electricity Maps annual averages | 2024 |
| Azure grid carbon intensity | Electricity Maps annual averages | 2024 |
| GCP grid carbon intensity | Electricity Maps annual averages | 2024 |
| AWS PUE | AWS sustainability reports | 2023 |
| Azure PUE | Microsoft sustainability reports | 2023 |
| GCP PUE | Google sustainability reports | 2023 |
| AWS WUE | AWS 2023 Sustainability Report | 2023 |
| Azure WUE | Microsoft 2023 Environmental Sustainability Report | 2023 |
| GCP WUE | Google 2023 Environmental Report | 2023 |
| AWS pricing | AWS public pricing API | Q1 2026 |
| Azure pricing | Azure public pricing API | Q1 2026 |
| GCP pricing | GCP public pricing API | Q1 2026 |

---

## Coverage Boundaries and LOW_ASSUMED_DEFAULT

GreenOps only applies emission formulas to instance types explicitly present in `factors.json`. When a resource is encountered that is not in the ledger, it is classified as `LOW_ASSUMED_DEFAULT` and **excluded from all calculations**.

### What LOW_ASSUMED_DEFAULT means

`LOW_ASSUMED_DEFAULT` is not an estimate. It is a deliberate null. The resource appears in the output as `⚠ UNKNOWN` in the table formatter and in the skipped section of the markdown PR comment, with the exact `unsupportedReason` explaining which instance type is missing and from which provider's ledger section.

### Why this matters for FinOps auditors

The formula `embodied_gco2e = (1,200,000g / 35,040h / 48 vCPUs) × vcpus × 730h` is validated against the 78 instance types in the current ledger. Applying it blindly to unsupported instances, particularly memory-optimised families (AWS `r6i`, Azure `Standard_M` series, GCP `m2` series) with non-standard vCPU-to-memory ratios, would produce numbers that cannot be defended under CSRD audit.

The boundary is intentional. A tool that shows a wrong number is worse than a tool that shows no number.

### Heuristic ceiling for auditors

If you need a conservative upper-bound estimate for unsupported instances pending a formal ledger update:

```
Scope 2 upper bound = W_max × PUE × 730h / 1000 × grid_intensity_gco2e_per_kwh
Scope 3 upper bound = (1,200,000g / 35,040h / 48) × vcpus × 730h
```

These are the maximum-utilisation values. Actual emissions at typical utilisation (50%) will be lower. Open a PR to `factors.json` to add the instance type formally with validated coefficients.

### Current ledger coverage

| Provider | Instance types | Notable gaps |
|---|---|---|
| AWS | 50 (47 general-purpose + 3 GPU) | r6i, c6i, m6i (Intel v3), Graviton 4 (m8g, c8g), Azure/GCP-equivalent GPU generations |
| Azure | 16 | Standard_M series, Standard_L series, Standard_NC (GPU), Azure ML compute |
| GCP | 15 + Vertex AI Workbench (T4 only) | n1 series (legacy), m2/m3 memory-optimised, A2/A3 GPU families, Vertex AI prediction endpoints |

GPU instances (AWS `g5.xlarge`/`p4d.24xlarge`/`p5.48xlarge`) and managed AI services (AWS SageMaker, GCP Vertex AI Workbench) are in the ledger as of v0.10.0/v0.11.0, Scope 2 only — see [GPU Instances](#gpu-instances-scope-2-only) and [Managed AI Services](#managed-ai-services) above. Azure GPU instances, Azure ML, and GCP Vertex AI prediction endpoints remain unsupported. Kubernetes node groups (EKS, AKS, GKE) resolve to the standard instance entries above; node count multiplies the output, see Kubernetes Node Groups above.

All gaps are tracked as open issues. Coverage PRs are the fastest to merge.

---

## Known Limitations

- **Partial GPU and managed AI/ML compute model.** AWS GPU instances (`g5.xlarge`, `p4d.24xlarge`, `p5.48xlarge`), AWS SageMaker endpoint configs, and GCP Vertex AI Workbench (NVIDIA T4 only) are modeled, Scope 2 only — see [GPU Instances](#gpu-instances-scope-2-only) and [Managed AI Services](#managed-ai-services) above. Azure GPU instances (NC/ND-series), Azure ML, GCP Vertex AI prediction endpoints (the model-serving compute itself), and GPU embodied (Scope 3) carbon anywhere in the stack remain unmodeled. This is the largest open gap as of this writing.
- **Scope 2 only for region recommendations.** Embodied carbon does not change when shifting regions, so it is correctly excluded from the region-shift scoring.
- **Annual average grid intensity.** Real-time marginal emissions are not used. Annual averages are more stable and reproducible, consistent with CCF methodology.
- **WUE at data centre level.** Water figures cover direct data centre cooling withdrawal only.
- **Azure and GCP coverage is smaller than AWS.** AWS has 50 instance types (47 general-purpose + 3 GPU); Azure and GCP each have 15 to 16. Enterprise-scale instance families (M-series, X-series, A2 High Memory) are not yet in the ledger.
- **Provider alias regions.** Multi-aliased provider configs may not resolve correctly. Standard single-provider configs are fully supported.
- **Node group autoscaling is reported at minimum size.** EKS, AKS, and GKE node groups with autoscaling enabled report the minimum configured node count, not the desired or current count. Actual emissions at any given time may be higher if the autoscaler has scaled up.

---

## Licence

The methodology, coefficients, and source code are MIT-licensed. Every assertion in `engine.test.ts` includes a commented math trace derivable from this document and `factors.json`.
