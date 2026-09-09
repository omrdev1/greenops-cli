# GreenOps Methodology Ledger v2.1.0

**Methodology transparency is the only defence against greenwashing.**

All maths in GreenOps is open, auditable, and reproducible from `factors.json`. This document defines the exact formulas, assumptions, and data sources used in every calculation.

> [!note] AWS/Azure/GCP CPU power figures re-derived against CCF's current source data, v2.1.0 ([#25](https://github.com/omrdev1/greenops-cli/issues/25))
> A reader comparing `factors.json` against Cloud Carbon Footprint's `aws-instances.csv` surfaced a discrepancy that, on investigation, turned out to be ledger-wide. Further investigation found the comparison itself had been built against `cloud-carbon-coefficients`, a repo CCF has since **archived** in favour of the actively-maintained `ccf-coefficients`, which computes wattage at the CPU-architecture level (min/max watts per hardware thread) rather than per-instance-type. `power_watts.idle`/`power_watts.max` for every x86/AMD instance in this ledger have been re-derived directly from `ccf-coefficients`' current data, paired with each instance family's real, documented CPU architecture (sourced from AWS/Azure/GCP's own instance-type docs, not third-party summaries). For families where the provider itself doesn't guarantee a single chip (e.g. AWS t3/m5/c5/r5, several Azure D-series generations, GCP N2/E2), the documented option with the higher max-watts figure was used, disclosed per-family below rather than silently picked.
>
> **All ARM instance types (AWS Graviton, Azure Ampere Dpsv5, GCP T2A) have been removed from this ledger.** CCF's own current source code (`ccfcoef/aws/coefficients.py`) substitutes AMD EPYC 2nd Gen wattage for every Graviton generation, with the comment *"we don't know the values for the Graviton chips so assume they are the same spec as AMD EPYC Gen 2 but listed separately"* — meaning no real, independently-measured Graviton wattage exists in CCF's data, old or new. No Ampere Altra entry exists for Azure or GCP either. Shipping numbers with no real source behind them, even ones that happened to match another chip's figures, would violate this ledger's own refusal-to-guess principle. The ARM-upgrade recommendation strategy has been removed accordingly — see [Recommendation Engine](#recommendation-engine). Azure and GCP power figures, previously silently reused from AWS by matching vCPU/RAM shape (not independently sourced despite an inaccurate "CCF Azure/GCP coefficients" citation), are now genuinely provider-specific.

---

## Cloud Provider Coverage

| Provider | Regions | Instances | Status |
|---|---|---|---|
| AWS | 14 | 29 (26 general-purpose + 3 GPU) | Full coverage for listed instance and node group types. All AWS Graviton (ARM) instance types removed in v2.1.0 — see the note above and [Known Limitations](#known-limitations). 3 GPU instances (`g5.xlarge`, `p4d.24xlarge`, `p5.48xlarge`) Scope 2-only, `us-east-1` only — see [GPU Instances](#gpu-instances-scope-2-only). SageMaker endpoint configs (Scope 2-only, `us-east-1` only) — see [Managed AI Services](#managed-ai-services) |
| Azure | 17 | 19 (13 general-purpose + 6 GPU) | Full coverage for listed instance and node group types. Ampere-based `Standard_D*ps_v5` instance types removed in v2.1.0 — see the note above. 6 GPU instances (`Standard_NC4as_T4_v3`, `Standard_NC8as_T4_v3`, `Standard_NC16as_T4_v3`, `Standard_NC64as_T4_v3`, `Standard_ND96amsr_A100_v4`, `Standard_ND96isr_H100_v5`) Scope 2-only, `eastus` only — see [GPU Instances](#gpu-instances-scope-2-only) |
| GCP | 15 | 11 | Full coverage for listed instance and node group types. T2A (Ampere Altra) instance types removed in v2.1.0 — see the note above. Vertex AI Workbench (Scope 2-only, T4 GPU only) — see [Managed AI Services](#managed-ai-services) |

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

> [!note] `W_idle`/`W_max` re-derived per-family from real CPU architecture data, v2.1.0
> Values are now `ccf-coefficients`' per-architecture min/max-watts-per-thread multiplied by the instance's vCPU count, using the architecture that instance family's own provider documentation confirms (see the per-family table in [Known Limitations](#known-limitations)). Where a provider doesn't guarantee a single chip for a family, the documented option with the higher max-watts is used — see the top-of-document note.

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

m5.large is one of the "either/or" AWS families (Skylake-SP or Cascade Lake per AWS's own docs) — Skylake used per the higher-max-watts convention (see [Known Limitations](#known-limitations)).

1. **CPU power:** `W_cpu = 1.29 + (8.39 - 1.29) × 0.50 = 4.84W`
2. **Memory power:** `W_mem = 8GB × 0.392 = 3.136W`
3. **Total:** `W = 4.84 + 3.136 = 7.976W`
4. **Energy:** `7.976W × 1.13 PUE × 730h / 1000 = 6.579 kWh/month`
5. **Carbon:** `6.579 × 384.5 = 2,529.8g CO2e/month`

### Worked Example: Azure Standard_D2s_v3 in eastus at 50% utilisation

Standard_D2s_v3 can run on any of 6 documented chip generations depending on physical host placement — Haswell used per the higher-max-watts convention.

1. **CPU power:** `W_cpu = 3.71 + (11.19 - 3.71) × 0.50 = 7.45W`
2. **Memory power:** `W_mem = 8GB × 0.392 = 3.136W`
3. **Total:** `W = 7.45 + 3.136 = 10.586W`
4. **Energy:** `10.586W × 1.125 PUE × 730h / 1000 = 8.694 kWh/month`
5. **Carbon:** `8.694 × 380.0 = 3,303.6g CO2e/month`

### Worked Example: GCP n2-standard-2 in us-central1 at 50% utilisation

n2-standard-2 (<96 vCPU) can run on Cascade Lake or Ice Lake — Cascade Lake used per the higher-max-watts convention.

1. **CPU power:** `W_cpu = 1.38 + (8.13 - 1.38) × 0.50 = 4.76W`
2. **Memory power:** `W_mem = 8GB × 0.392 = 3.136W`
3. **Total:** `W = 4.76 + 3.136 = 7.891W`
4. **Energy:** `7.891W × 1.10 PUE × 730h / 1000 = 6.336 kWh/month`
5. **Carbon:** `6.336 × 340.0 = 2,154.4g CO2e/month`

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

GPU-accelerated instances (AWS `g5.xlarge`/`p4d.24xlarge`/`p5.48xlarge`, Azure `Standard_NC4as_T4_v3`/`Standard_NC8as_T4_v3`/`Standard_NC16as_T4_v3`/`Standard_NC64as_T4_v3`) are detected through the same `aws_instance`/`azurerm_linux_virtual_machine`/`azurerm_windows_virtual_machine` extraction path as any other instance — no special-casing is required, since `instance_type`/`size` is a free-form ledger lookup key, not an allowlist.

### What is covered

Scope 2 (operational) carbon, using the GPU's published TDP as the power ceiling:

| Instance | Provider | GPUs | TDP per GPU | Total GPU power | Source |
|---|---|---|---|---|---|
| `g5.xlarge` | AWS | 1× NVIDIA A10G | 300W | 300W | AWS/NVIDIA A10G datasheet |
| `p4d.24xlarge` | AWS | 8× NVIDIA A100 40GB | 400W | 3,200W | NVIDIA A100 datasheet |
| `p5.48xlarge` | AWS | 8× NVIDIA H100 80GB | 700W | 5,600W | NVIDIA H100 datasheet |
| `Standard_NC4as_T4_v3` | Azure | 1× NVIDIA T4 | 70W | 70W | NVIDIA T4 datasheet, Microsoft Learn (NCasT4_v3 series) |
| `Standard_NC8as_T4_v3` | Azure | 1× NVIDIA T4 | 70W | 70W | NVIDIA T4 datasheet, Microsoft Learn (NCasT4_v3 series) |
| `Standard_NC16as_T4_v3` | Azure | 1× NVIDIA T4 | 70W | 70W | NVIDIA T4 datasheet, Microsoft Learn (NCasT4_v3 series) |
| `Standard_NC64as_T4_v3` | Azure | 4× NVIDIA T4 | 70W | 280W | NVIDIA T4 datasheet, Microsoft Learn (NCasT4_v3 series) |
| `Standard_ND96amsr_A100_v4` | Azure | 8× NVIDIA A100 80GB | 400W | 3,200W | NVIDIA A100 datasheet, Microsoft Learn (NDm_A100_v4 series) |
| `Standard_ND96isr_H100_v5` | Azure | 8× NVIDIA H100 80GB | 700W | 5,600W | NVIDIA H100 datasheet, Microsoft Learn (ND-H100-v5 series) |

Idle power is modelled at ~12% of TDP, sourced from published idle-draw figures for H100/A100 (NVIDIA forum and vendor reporting indicate idle draw under 100W on a 700W-TDP H100). This is a GPU-specific ratio, deliberately not reused from the ~30% idle/max ratio applied to CPU instances elsewhere in this ledger — GPUs idle proportionally lower than CPUs as a hardware characteristic, and forcing the CPU convention onto GPU entries would overstate idle draw. The same ratio is applied to the Azure T4 entries for consistency, since no Azure-specific idle-draw figure exists separately from the GPU itself (the underlying silicon is identical to GCP Workbench's T4 attachment, already in this ledger).

### What is NOT covered (explicit gap, not a measured zero)

**Embodied (Scope 3) carbon is reported as `0` for all GPU instances.** This ledger's existing embodied-carbon model is calibrated to a generic CPU server (CCF's Dell R740 baseline, ~1,200kg CO2e/server, prorated per vCPU). A GPU server's manufacturing footprint is a fundamentally different hardware class — substantially higher per unit, dominated by the GPU dies themselves rather than CPU silicon — and no equivalent public CCF-style GPU baseline exists yet to cite honestly. Rather than apply the CPU baseline (which would understate embodied carbon) or guess a multiplier without a real source, GreenOps CLI reports `0` and marks the resource `LOW_ASSUMED_DEFAULT` confidence with an explicit `unsupportedReason`. The markdown PR comment surfaces this distinctly, per-resource, in a dedicated "🤖 AI Infrastructure Carbon Impact" section (separate from the general resource table) — so it cannot be mistaken for "no embodied carbon."

**Pricing and instance coverage is currently scoped to one region per provider: AWS `us-east-1`, Azure `eastus`.** GPU instance availability and pricing vary meaningfully by region and were not uniformly verifiable across all regions already covered for CPU instances; rather than publish a guessed regional spread, only the region with the clearest, most consistently-cited public pricing was added per provider. Other regions will report `unsupported_region` for these instance types until verified and added.

**GCP A2/A3/G2 GPU families are not yet in the ledger.** This is a scoping limit, not a technical one — the same `aws_instance`-style extraction-by-resource-type pattern applies equally to `google_compute_instance`; closing this gap is a `factors.json` data addition, not new extraction logic.

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

> [!note] Corrected ([#24](https://github.com/omrdev1/greenops-cli/issues/24)) — collapsed to a single verified figure, per-region breakdown removed
> Earlier versions of this ledger listed a distinct WUE per region, cited generically to each provider's sustainability report. A reader correctly pointed out that AWS's own 2023 Sustainability Report publishes exactly one number: a fleet-wide global average, not a per-region breakdown — the earlier per-region table had no traceable source. Rather than keep implying regional granularity that was never real, WUE is now applied as a single uniform figure across all regions for a given provider.
>
> **AWS: 0.18 L/kWh** (2023 fleet-wide average, a 5% YoY improvement from 2022's ~0.19 and a 28% improvement from 2021). Source: [AWS Water Stewardship](https://sustainability.aboutamazon.com/natural-resources/water).
>
> Azure and GCP regional figures below have the same unresolved-sourcing problem and have not yet been re-verified against a real single fleet-wide figure for those providers — treat them as carried over from the prior table, not yet corrected.

### WUE Values

| Provider | WUE (L/kWh) | Basis |
|---|---|---|
| AWS | 0.18 | Verified: single fleet-wide 2023 figure, applied uniformly to all regions |
| Azure | *carried over, unverified* | Not yet re-sourced — see note above |
| GCP | *carried over, unverified* | Not yet re-sourced — see note above |

---

## Recommendation Engine

GreenOps evaluates one strategy per resource:

**Region shift:** Move to the lowest grid-intensity region within the same provider that has pricing data for this instance. Only recommended if CO2e reduction exceeds 15% of baseline.

**Scoring:**

```
score = (|co2e_delta| / baseline_co2e) × 0.60
      + (|cost_delta| / baseline_cost) × 0.40
```

Carbon reduction is weighted at 60%, cost at 40%, both normalised to percentage-of-baseline.

> [!warning] ARM upgrade recommendations removed ([#25](https://github.com/omrdev1/greenops-cli/issues/25))
> Earlier versions of this engine recommended switching x86_64 instances to ARM64 equivalents (AWS Graviton, Azure Ampere Dpsv5, GCP T2A) as a carbon/cost-saving strategy. Removed because no AWS Graviton generation, Azure Ampere Altra instance, or GCP T2A instance has real, independently-sourced power data anywhere — not in the archived CCF repo, not in the current `ccf-coefficients` repo. CCF's own current source code substitutes AMD EPYC 2nd Gen wattage for every Graviton generation, with the comment *"we don't know the values for the Graviton chips so assume they are the same spec as AMD EPYC Gen 2"* (`ccfcoef/aws/coefficients.py`) — and no Ampere Altra entry exists in CCF's wattage data for Azure or GCP at all. Recommending an ARM switch on that basis would mean estimating a saving this ledger cannot actually stand behind. All ARM instance types have been removed from `factors.json` (see [AWS/Azure/GCP Instance Coverage](#cloud-provider-coverage)) rather than left in with unsupported numbers. If real Graviton/Ampere Altra power data becomes available from a citable source, both the ledger entries and this recommendation strategy can be restored.

---

## Data Sources

| Data | Source | Version |
|---|---|---|
| AWS instance TDP | `ccf-coefficients` per-architecture wattage + AWS's own documented chip mapping per family | current (2026-09) |
| Azure instance TDP | `ccf-coefficients` per-architecture wattage + Azure's own documented chip mapping per family | current (2026-09) |
| GCP instance TDP | `ccf-coefficients` per-architecture wattage + GCP's own documented chip mapping per family | current (2026-09) |
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
| AWS | 29 (26 general-purpose + 3 GPU) | r6i, c6i, m6i (Intel v3), all Graviton generations (removed v2.1.0, no real source — see [Known Limitations](#known-limitations)), GCP-equivalent GPU generations |
| Azure | 19 (13 general-purpose + 6 GPU) | Standard_M series, Standard_L series, Azure ML compute, Ampere Altra Dpsv5 (removed v2.1.0, no real source) |
| GCP | 11 + Vertex AI Workbench (T4 only) | n1 series (legacy), m2/m3 memory-optimised, A2/A3 GPU families, Vertex AI prediction endpoints, T2A/Ampere Altra (removed v2.1.0, no real source) |

GPU instances (AWS `g5.xlarge`/`p4d.24xlarge`/`p5.48xlarge`, Azure `Standard_NC4as_T4_v3`/`Standard_NC8as_T4_v3`/`Standard_NC16as_T4_v3`/`Standard_NC64as_T4_v3`/`Standard_ND96amsr_A100_v4`/`Standard_ND96isr_H100_v5`) and managed AI services (AWS SageMaker, GCP Vertex AI Workbench) are in the ledger as of v0.10.0 through v0.13.3, Scope 2 only — see [GPU Instances](#gpu-instances-scope-2-only) and [Managed AI Services](#managed-ai-services) above. Azure ML and GCP Vertex AI prediction endpoints remain unsupported. Kubernetes node groups (EKS, AKS, GKE) resolve to the standard instance entries above; node count multiplies the output, see Kubernetes Node Groups above.

All gaps are tracked as open issues. Coverage PRs are the fastest to merge.

---

## Known Limitations

- **AWS/Azure/GCP CPU power figures re-derived from `ccf-coefficients` (CCF's current, actively-maintained repo), v2.1.0 — resolves [#25](https://github.com/omrdev1/greenops-cli/issues/25).** The original comparison in #25 was built against `cloud-carbon-coefficients`, since confirmed archived by CCF themselves ("Archived — see ccf-coefficients"). The real, current CCF data computes wattage at the CPU-architecture level, not per-instance-type — every x86/AMD instance in this ledger has been re-mapped to its real documented chip architecture (per-family table below) and its power figures recomputed from that architecture's real min/max-watts-per-thread × vCPU count.
  | Family | Documented chip(s) | Deterministic? | Architecture used |
  |---|---|---|---|
  | AWS t3a, m5a | AMD EPYC 7000 series | Yes | EPYC 1st Gen |
  | AWS c5a | AMD EPYC 7002 series | Yes | EPYC 2nd Gen |
  | AWS t3, m5, r5, c5 | Skylake-SP or Cascade Lake ("either/or" per AWS docs) | No | Skylake (higher max-watts) |
  | AWS t2 | Not specified on AWS's current instance-type page (legacy family, predates the standardized doc template) | Unconfirmed | Haswell (best-effort, legacy secondary sources only — weakest-sourced mapping in this ledger) |
  | Azure Standard_B, Standard_D*_v3 | Haswell, Broadwell, Skylake, Cascade Lake, Ice Lake, or Emerald Rapids, depending on physical host | No | Haswell (higher max-watts) |
  | Azure Standard_D*_v4 | Emerald Rapids, Sapphire Rapids, Ice Lake, or Cascade Lake | No | Emerald Rapids (higher max-watts) |
  | Azure Standard_F*_v2 | Emerald Rapids, Ice Lake, Cascade Lake, or Skylake | No | Emerald Rapids (higher max-watts) |
  | Azure Standard_E*_v3 | Ice Lake, Cascade Lake, Skylake, or Broadwell | No | Skylake (higher max-watts) |
  | GCP c2-standard-* | Cascade Lake ("Intel Xeon Gold 6253CL") | Yes | Cascade Lake |
  | GCP n2-standard-* (<96 vCPU) | Cascade Lake or Ice Lake | No | Cascade Lake (higher max-watts) |
  | GCP n2d-standard-*, t2d-standard-* | AMD EPYC Milan (Rome retired per current GCP docs) | Yes | EPYC 3rd Gen |
  | GCP e2-standard-* | Broadwell, Skylake, or EPYC Milan; CPU platform "is selected for you," no override | No | Skylake (higher max-watts) |

  **All ARM instance types removed, not re-derived — no real source exists.** AWS Graviton (all generations, `t4g.*`/`m6g.*`/`m7g.*`/`c6g.*`/`c7g.*`/`r6g.*`), Azure `Standard_D*ps_v5` (Ampere Altra), and GCP `t2a-standard-*` (Ampere Altra) have been removed from this ledger entirely rather than shipped with unsourced numbers. CCF's own current source code substitutes AMD EPYC 2nd Gen wattage for every Graviton generation, stating directly in a code comment: *"we don't know the values for the Graviton chips so assume they are the same spec as AMD EPYC Gen 2 but listed separately"* (`ccfcoef/aws/coefficients.py`). No Ampere Altra entry exists in CCF's coefficient data for any provider. The ARM-upgrade recommendation strategy has been removed accordingly (see [Recommendation Engine](#recommendation-engine)) — this is a real coverage regression, not a silent one, flagged in this release's notes. If a real, citable Graviton or Ampere Altra power source becomes available, both the ledger entries and the recommendation strategy can be restored.
- **Partial GPU and managed AI/ML compute model.** AWS GPU instances (`g5.xlarge`, `p4d.24xlarge`, `p5.48xlarge`), Azure GPU instances (`Standard_NC4as_T4_v3`, `Standard_NC8as_T4_v3`, `Standard_NC16as_T4_v3`, `Standard_NC64as_T4_v3`, `Standard_ND96amsr_A100_v4`, `Standard_ND96isr_H100_v5`), AWS SageMaker endpoint configs, and GCP Vertex AI Workbench (NVIDIA T4 only) are modeled, Scope 2 only — see [GPU Instances](#gpu-instances-scope-2-only) and [Managed AI Services](#managed-ai-services) above. Azure ML, GCP Vertex AI prediction endpoints (the model-serving compute itself), and GPU embodied (Scope 3) carbon anywhere in the stack remain unmodeled. This is the largest open gap as of this writing.
- **Scope 2 only for region recommendations.** Embodied carbon does not change when shifting regions, so it is correctly excluded from the region-shift scoring.
- **Annual average grid intensity.** Real-time marginal emissions are not used. Annual averages are more stable and reproducible, consistent with CCF methodology. **Source under active re-verification** ([#24](https://github.com/omrdev1/greenops-cli/issues/24)): `factors.json` records the source as "electricity-maps-2024-avg" with no logged query date or exact zone mapping. A real discrepancy was confirmed for `us-east-1`: the ledger's 384.5 figure is suspiciously close to the 2024 US *national* average (384, per Ember), not a PJM-specific figure — the likely root cause is a national-average value being substituted for a regional grid-zone value somewhere upstream. Not yet corrected in the ledger, since no single PJM figure could be verified to high confidence from a reachable, current-year source (candidates ranged from 403 to ~535 depending on source and year). Treat all current grid intensity values as indicative, not audited, until re-derived from a live ElectricityMaps export or EPA eGRID pull.
- **WUE at data centre level.** Water figures cover direct data centre cooling withdrawal only. **AWS figure corrected and verified** ([#24](https://github.com/omrdev1/greenops-cli/issues/24)): AWS's per-region WUE table had no traceable source (the cited AWS 2023 Sustainability Report publishes only one fleet-wide figure) and has been replaced with that real figure (0.18 L/kWh), applied uniformly — see the Water Consumption section above. **Azure and GCP WUE values are still the original, unverified per-region figures** and have not yet been re-sourced.
- **Azure and GCP coverage is smaller than AWS.** AWS has 50 instance types (47 general-purpose + 3 GPU); Azure has 19 (16 general-purpose + 3 GPU); GCP has 15 plus Vertex AI Workbench. Enterprise-scale instance families (M-series, X-series, A2 High Memory) are not yet in the ledger.
- **Provider alias regions.** Multi-aliased provider configs may not resolve correctly. Standard single-provider configs are fully supported.
- **Node group autoscaling is reported at minimum size.** EKS, AKS, and GKE node groups with autoscaling enabled report the minimum configured node count, not the desired or current count. Actual emissions at any given time may be higher if the autoscaler has scaled up.

---

## Licence

The methodology, coefficients, and source code are MIT-licensed. Every assertion in `engine.test.ts` includes a commented math trace derivable from this document and `factors.json`.
