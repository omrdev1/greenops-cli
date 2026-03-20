# MIT License Transparency
**Methodology transparency is the only defense against greenwashing.**

## Core Mathematical Formulation
GreenOps utilizes a linear interpolation power model matching standard CCF methodologies. For any general-purpose compute instantiation, we map power scaling between hardware bounds:
`W = W_idle + (W_max - W_idle) * u`
*(Where `u` represents utilisation, `W_idle` represents dormant wattage, and `W_max` represents TDP boundaries).*

## Worked Mathematical Example
For an `m5.large` instance hosted in `us-east-1` at `50%` utilisation:
1. **Power Modeling:** `Idle = 6.8W` and `Max = 20.4W`.
   *Effective Watts* = `6.8 + (20.4 - 6.8) * 0.5 = 13.6W`
2. **PUE Evaluation:** Region defaults mapped to `1.13`.
   *Total Draw* = `13.6W * 1.13 = 15.368W`
3. **Monthly Cycle Output:**
   *Energy* = `15.368W * 730 hours / 1000 = 11.21864 kWh/month`
4. **Grid Carbon Factor:** `us-east-1` maps to `384.5 gCO2e/kWh`.
   *Total Carbon* = `11.21864 * 384.5 = 4313.57g CO2e/month`.

## Open Sourcing our Citations
- **CCF Methodology:** [Cloud Carbon Footprint Specs](https://www.cloudcarbonfootprint.org/docs/methodology) dictates the standardized instance boundaries and baseline coefficients.
- **Utilisation:** Assumed at 50% identically matching the CCF bare-metal fallback baseline.
- **Grid Intensity:** Captured from Electricity Maps. (Caveat: Our factors map annual averages to prioritize consistency, deferring real-time margin evaluations).
- **PUE Defaults:** Hardware-level cooling and data-center routing overhead defaults.
