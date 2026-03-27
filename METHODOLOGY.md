# GreenOps Methodology Ledger v1.3.0

**Methodology transparency is the only defence against greenwashing.**

All maths in GreenOps is open, auditable, and reproducible from `factors.json`. This document defines the exact formulas, assumptions, and data sources used in every calculation.

---

## Emission Scopes Covered

| Scope | What it measures | GreenOps status |
|---|---|---|
| Scope 2 — Operational | CPU power draw × grid carbon intensity | ✅ Tracked |
| Scope 3 — Embodied | Hardware manufacturing lifecycle | ✅ Tracked (v1.3.0) |
| Water consumption | Data centre cooling water withdrawal | ✅ Tracked (v1.3.0) |
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

Where:
- `PUE` = Power Usage Effectiveness (1.13 for AWS, from AWS sustainability reports)
- `hours_per_month` = 730 (365 days × 24h / 12 months)
- `grid_intensity_gco2e_per_kwh` = regional annual average from Electricity Maps 2024

### Worked Example — m5.large in us-east-1 at 50% utilisation

1. **Power:** `W = 6.8 + (20.4 - 6.8) × 0.50 = 13.6W`
2. **Energy:** `13.6W × 1.13 PUE × 730h / 1000 = 11.219 kWh/month`
3. **Carbon:** `11.219 × 384.5 = 4,313.6g CO2e/month = 4.31kg CO2e/month`

This is the exact value asserted in `engine.test.ts`.

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
| ARM architecture discount | 0.80 (20% lower) | Graviton smaller die + lower TDP |

### Per-vCPU rate

```
x86_64: (1,200,000 / 35,040 / 48) × 730 = 520.8g CO2e/vCPU/month
arm64:  520.8 × 0.80                     = 416.7g CO2e/vCPU/month
```

### Worked Example — m5.large (2 vCPU, x86_64)

```
embodied = 2 × 520.8 = 1,041.7g CO2e/month
```

### Worked Example — m6g.large (2 vCPU, ARM64)

```
embodied = 2 × 416.7 = 833.3g CO2e/month
```

ARM64 saves 208.4g CO2e/month in embodied carbon alone — before any operational savings.

---

## Water Consumption

Water is consumed by data centre cooling systems. GreenOps uses AWS's published **WUE (Water Usage Effectiveness)** metric, defined as litres of water withdrawn per kWh of IT load.

### Formula

```
energy_kwh_IT = W_effective × hours / 1000   (IT load, before PUE)
water_litres   = energy_kwh_IT × WUE_litres_per_kwh
```

Note: WUE is applied to IT load (before PUE multiplication), matching the AWS definition.

### Worked Example — m5.large in us-east-1

```
energy_IT = 13.6W × 730h / 1000 = 9.928 kWh/month
water      = 9.928 × 0.46       = 4.57 litres/month
```

### Regional WUE Values

| Region | Location | WUE (L/kWh) | Source |
|---|---|---|---|
| us-east-1 | N. Virginia | 0.46 | AWS 2023 Sustainability Report |
| us-east-2 | Ohio | 0.52 | AWS 2023 Sustainability Report |
| us-west-1 | N. California | 0.38 | AWS 2023 Sustainability Report |
| us-west-2 | Oregon | 0.18 | AWS 2023 Sustainability Report |
| eu-west-1 | Ireland | 0.22 | AWS 2023 Sustainability Report |
| eu-west-2 | London | 0.25 | AWS 2023 Sustainability Report |
| eu-central-1 | Frankfurt | 0.28 | AWS 2023 Sustainability Report |
| eu-north-1 | Stockholm | 0.10 | AWS 2023 Sustainability Report |
| ap-southeast-1 | Singapore | 0.58 | AWS 2023 Sustainability Report |
| ap-southeast-2 | Sydney | 0.45 | AWS 2023 Sustainability Report |
| ap-northeast-1 | Tokyo | 0.50 | AWS 2023 Sustainability Report |
| ap-south-1 | Mumbai | 0.72 | AWS 2023 Sustainability Report |
| ca-central-1 | Canada | 0.20 | AWS 2023 Sustainability Report |
| sa-east-1 | São Paulo | 0.35 | AWS 2023 Sustainability Report |

`eu-north-1` (Stockholm) has both the lowest grid carbon intensity (8.8 gCO2e/kWh) and the lowest WUE (0.10 L/kWh) of any supported region, making it the optimal target for both climate impact dimensions.

---

## Recommendation Engine

GreenOps evaluates two strategies per resource and selects the highest-scoring option:

**Strategy 1 — ARM upgrade:** Switch x86_64 → ARM64 (same vCPU/RAM class). Only recommended if both CO2e and cost decrease.

**Strategy 2 — Region shift:** Move to the lowest grid-intensity region that has pricing data for this instance. Only recommended if CO2e reduction exceeds 15% of baseline.

**Scoring (when both strategies qualify):**

```
score = (|co2e_delta| / baseline_co2e) × 0.60
      + (|cost_delta| / baseline_cost) × 0.40
```

Carbon reduction is weighted at 60%, cost at 40%, both normalised to percentage-of-baseline for fair comparison across instance sizes.

---

## Data Sources

| Data | Source | Version |
|---|---|---|
| Instance TDP (idle/max watts) | Cloud Carbon Footprint hardware coefficients | v3 |
| Embodied carbon per server | CCF DELL R740 baseline | v3 |
| Grid carbon intensity | Electricity Maps annual averages | 2024 |
| PUE | AWS sustainability reports | 2023 |
| WUE | AWS sustainability reports | 2023 |
| On-demand pricing | AWS public pricing API | Q1 2026 |

---

## Known Limitations

- **CPU-only power model.** Memory power draw is tracked in `factors.json` (`memory_gb`) but not yet included in calculations. This is a known underestimate, consistent with the CCF baseline approach.
- **Scope 2 only for region recommendations.** The recommendation engine uses Scope 2 operational emissions for scoring. Embodied carbon does not change when shifting regions, so it is correctly excluded from the region-shift calculation.
- **Annual average grid intensity.** Real-time marginal emissions are not used. Annual averages are more stable and reproducible, consistent with CCF methodology.
- **WUE at data centre level.** Water figures cover direct data centre cooling withdrawal only — not supply chain water or water embedded in hardware manufacturing.
- **Provider alias regions.** Terraform configurations using aliased providers (e.g. `provider "aws" { alias = "secondary" }`) may not resolve correctly. Standard single-provider configs are fully supported.

---

## Licence

The methodology, coefficients, and source code are MIT-licensed. The maths are fully reproducible: every assertion in `engine.test.ts` includes a commented math trace derivable from this document and `factors.json`.
