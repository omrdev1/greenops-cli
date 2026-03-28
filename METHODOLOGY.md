# GreenOps Methodology Ledger v2.0.0

**Methodology transparency is the only defence against greenwashing.**

All maths in GreenOps is open, auditable, and reproducible from `factors.json`. This document defines the exact formulas, assumptions, and data sources used in every calculation.

---

## Cloud Provider Coverage

| Provider | Regions | Instances | Status |
|---|---|---|---|
| AWS | 14 | 40 | ✅ Full coverage |
| Azure | 17 | 16 | ✅ Full coverage |
| GCP | 15 | 15 | ✅ Full coverage |

Run `greenops-cli --coverage` to see the full instance and region list per provider.

---

## Emission Scopes Covered

| Scope | What it measures | GreenOps status |
|---|---|---|
| Scope 2 — Operational | CPU power draw × grid carbon intensity | ✅ Tracked |
| Scope 3 — Embodied | Hardware manufacturing lifecycle | ✅ Tracked |
| Water consumption | Data centre cooling water withdrawal | ✅ Tracked |
| Scope 3 — Supply chain | Software, logistics, employee travel | ❌ Out of scope |
| Scope 1 — Direct | On-site combustion | ❌ Not applicable (cloud) |

---

## Scope 2: Operational Emissions

### Power Model

GreenOps uses the **linear interpolation model** from the Cloud Carbon Footprint (CCF) methodology:

```
W_effective = W_idle + (W_max - W_idle) × utilization
```

Where:
- `W_idle` = idle TDP (watts) from `factors.json`
- `W_max` = maximum TDP (watts) from `factors.json`
- `utilization` = CPU utilisation fraction (default: 0.50, matching CCF baseline)

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

### Worked Example — AWS m5.large in us-east-1 at 50% utilisation

1. **Power:** `W = 6.8 + (20.4 - 6.8) × 0.50 = 13.6W`
2. **Energy:** `13.6W × 1.13 PUE × 730h / 1000 = 11.219 kWh/month`
3. **Carbon:** `11.219 × 384.5 = 4,313.6g CO2e/month`

### Worked Example — Azure Standard_D2s_v3 in eastus at 50% utilisation

1. **Power:** `W = 6.8 + (20.4 - 6.8) × 0.50 = 13.6W`
2. **Energy:** `13.6W × 1.125 PUE × 730h / 1000 = 11.178 kWh/month`
3. **Carbon:** `11.178 × 380.0 = 4,244.2g CO2e/month`

### Worked Example — GCP n2-standard-2 in us-central1 at 50% utilisation

1. **Power:** `W = 6.8 + (20.4 - 6.8) × 0.50 = 13.6W`
2. **Energy:** `13.6W × 1.10 PUE × 730h / 1000 = 10.921 kWh/month`
3. **Carbon:** `10.921 × 340.0 = 3,713.1g CO2e/month`

---

## Scope 3: Embodied Emissions

Embodied carbon covers the manufacturing, transport, and end-of-life disposal of server hardware — prorated to the fraction of a physical server this instance type occupies.

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

The ARM discount applies equally to AWS Graviton, Azure Ampere (Dps-series), and GCP T2A instances — all use Arm Neoverse cores with comparable manufacturing profiles.

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

**Strategy 1 — ARM upgrade:** Switch x86_64 → ARM64 (same vCPU/RAM class). Only recommended if both CO2e and cost decrease. Supported across all three providers.

**Strategy 2 — Region shift:** Move to the lowest grid-intensity region within the same provider that has pricing data for this instance. Only recommended if CO2e reduction exceeds 15% of baseline.

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

## Known Limitations

- **CPU-only power model.** Memory power draw is tracked in `factors.json` (`memory_gb`) but not yet included in calculations.
- **Scope 2 only for region recommendations.** Embodied carbon does not change when shifting regions, so it is correctly excluded from the region-shift scoring.
- **Annual average grid intensity.** Real-time marginal emissions are not used. Annual averages are more stable and reproducible, consistent with CCF methodology.
- **WUE at data centre level.** Water figures cover direct data centre cooling withdrawal only.
- **Azure and GCP coverage is initial.** AWS has 40 instance types; Azure and GCP each have 15–16. Enterprise-scale instance families (M-series, X-series, A2 High Memory) are not yet in the ledger.
- **Provider alias regions.** Multi-aliased provider configs may not resolve correctly. Standard single-provider configs are fully supported.

---

## Licence

The methodology, coefficients, and source code are MIT-licensed. Every assertion in `engine.test.ts` includes a commented math trace derivable from this document and `factors.json`.
