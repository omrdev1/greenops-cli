# Contributing to GreenOps CLI

Thank you for contributing. Coverage extensions — new instance types, regions, or a second cloud provider — are the fastest PRs to merge.

---

## Table of Contents

1. [Local Setup](#local-setup)
2. [Running Tests](#running-tests)
3. [Working with Fixtures](#working-with-fixtures)
4. [Adding Instance Types](#adding-instance-types)
5. [Adding a New Region](#adding-a-new-region)
6. [Adding a New Cloud Provider](#adding-a-new-cloud-provider)
7. [Commit Convention](#commit-convention)
8. [Code of Conduct](#code-of-conduct)

---

## Local Setup

**Requirements:** Node.js ≥ 20 and npm.

```bash
git clone https://github.com/omrdev1/greenops-cli.git
cd greenops-cli
npm ci
```

Build the CLI:
```bash
npm run build
node dist/index.cjs --version
node dist/index.cjs --coverage
```

Typecheck:
```bash
npx tsc --noEmit
```

---

## Running Tests

```bash
# Full test suite (102 tests across engine, extractor, formatters, policy, serverless)
npm test

# Run a single test file
npx tsx --test engine.test.ts
```

The test runner is the Node.js native test runner (no Jest, no Vitest). Tests use `node:assert` and `node:test`.

**Verify the build matches committed dist:**
```bash
npm run build
git diff --exit-code dist/index.cjs   # must be clean
```

The CI release pipeline enforces this check — a stale or manually-patched bundle will fail.

---

## Working with Fixtures

The `fixtures/` directory contains synthetic Terraform plan JSON files used for E2E testing and local development. All fixtures are fully synthetic — no real account IDs, ARNs, or IP addresses.

| File | Provider | Purpose |
|---|---|---|
| `tfplan.e2e.json` | AWS | E2E CI fixture — 2 instances, produces recommendations |
| `tfplan.azure.e2e.json` | Azure | E2E CI fixture — tests Azure extraction |
| `tfplan.gcp.e2e.json` | GCP | E2E CI fixture — tests GCP extraction |
| `tfplan.saas-demo.json` | AWS | Larger 10-resource demo (web + API + DB + workers) for manual testing |

**Run all three E2E fixtures locally:**
```bash
npm run build

# AWS
node dist/index.cjs diff fixtures/tfplan.e2e.json --format table

# Azure
node dist/index.cjs diff fixtures/tfplan.azure.e2e.json --format table

# GCP
node dist/index.cjs diff fixtures/tfplan.gcp.e2e.json --format table

# Larger AWS demo (useful for testing recommendation output)
node dist/index.cjs diff fixtures/tfplan.saas-demo.json --format table
```

**Run the markdown formatter (simulates the GitHub PR comment):**
```bash
node dist/index.cjs diff fixtures/tfplan.e2e.json --format markdown --show-upgrade-prompt=false
```

---

## Adding Instance Types

All compute factors live in [`factors.json`](./factors.json). Each provider has an `instances` object.

**Step 1 — Find power data**

Source idle and max TDP from the [Cloud Carbon Footprint coefficients spreadsheet](https://www.cloudcarbonfootprint.org/docs/methodology). For ARM instances apply the 0.80 embodied multiplier.

**Step 2 — Add to `factors.json`**

```json
// AWS example — add under aws.instances
"m7g.large": {
  "architecture": "arm64",
  "vcpus": 2,
  "memory_gb": 8,
  "power_watts": { "idle": 3.05, "max": 7.66 },
  "embodied_co2e_grams_per_month": 14221
}
```

Embodied formula (documented in METHODOLOGY.md):
```
embodied_g/month = (1,200,000g / 35,040h / 48 vCPUs) × vcpus × 730h × arm_discount
```

**Step 3 — Add pricing** under `aws.pricing_usd_per_hour` for each region where the instance is available. Prices from the [AWS pricing page](https://aws.amazon.com/ec2/pricing/on-demand/).

**Step 4 — Add a test case** in `engine.test.ts` with a math trace comment:
```ts
it('m7g.large in eu-west-1 — ARM64 baseline', () => {
  // idle=3.05W, max=7.66W, util=0.50, mem=8GB
  // cpu_watts = 3.05 + (7.66-3.05)*0.50 = 5.355W
  // mem_watts = 8 * 0.392 = 3.136W
  // total_w   = 8.491W
  // energy    = 8.491 * 1.13 * 730 / 1000 = 7.013 kWh
  // co2e      = 7.013 * 233 = 1634g
  const result = calculateBaseline({ resourceId: 'x', instanceType: 'm7g.large', region: 'eu-west-1', provider: 'aws' });
  assert.ok(Math.abs(result.totalCo2eGramsPerMonth - 1634) < 50);
});
```

**Step 5 — Verify:**
```bash
npm run build && node dist/index.cjs --coverage
npm test
```

The same pattern applies to Azure (`azure.instances`) and GCP (`gcp.instances`) — the field names are identical.

---

## Adding a New Region

**Step 1 — Find grid intensity**

Use [Electricity Maps](https://www.electricitymaps.com) annual average CO2 intensity (gCO2e/kWh) for the grid zone corresponding to the data centre region.

**Step 2 — Find WUE (water intensity)**

From the provider's annual sustainability report:
- AWS: [AWS Sustainability Report](https://sustainability.aboutamazon.com)
- Azure: [Microsoft Sustainability Report](https://aka.ms/SustainabilityReport)
- GCP: [Google Environmental Report](https://sustainability.google)

**Step 3 — Add to `factors.json`** under the provider's `regions` object:
```json
// AWS example
"ap-northeast-1": {
  "location": "Asia Pacific (Tokyo)",
  "grid_intensity_gco2e_per_kwh": 463,
  "pue": 1.13,
  "water_intensity_litres_per_kwh": 0.18
}
```

PUE values: AWS 1.13, Azure 1.125, GCP 1.10 (provider-wide averages — per-region data is not publicly disclosed).

**Step 4 — Add pricing** for all existing instances in that region under `pricing_usd_per_hour`.

**Step 5 — Verify:**
```bash
npm run build && node dist/index.cjs --coverage
```

The new region should appear in the count.

---

## Adding a New Cloud Provider

Adding a fourth provider (e.g. Oracle Cloud, Alibaba Cloud) requires changes across four files:

### 1. `types.ts`
Add the new provider to the `CloudProvider` union:
```ts
export type CloudProvider = 'aws' | 'azure' | 'gcp' | 'oci';
```

### 2. `factors.json`
Add a top-level provider block following the same schema as `aws`, `azure`, `gcp`:
```json
{
  "oci": {
    "regions": { ... },
    "instances": { ... },
    "pricing_usd_per_hour": { ... }
  }
}
```

### 3. `extractor.ts`

Add to `SUPPORTED_TYPES`:
```ts
oci: ['oci_core_instance'],
```

Add a `detectProvider` branch:
```ts
if (resourceType.startsWith('oci_')) return 'oci';
```

Add region resolution logic (follow the `resolveAwsRegion` / `resolveAzureRegion` pattern).

Add instance type extraction logic (follow `extractAwsInstanceType` / `extractGcpInstanceType` pattern).

### 4. `engine.ts`

Add to `ARM_UPGRADE_MAP`:
```ts
oci: {
  'VM.Standard.E4.Flex': 'VM.Standard.A1.Flex',
}
```

### 5. Tests

Add test cases in `extractor.test.ts` (plan extraction), `engine.test.ts` (CO2e calculation), and add an E2E fixture in `fixtures/tfplan.oci.e2e.json`.

### 6. `.github/workflows/greenops-e2e.yml`

Add a step for the new fixture.

---

## Commit Convention

This repo uses [Conventional Commits](https://www.conventionalcommits.org):

```
feat: add m7g.xlarge to AWS eu-west-1
fix: correct r6g embodied CO2e calculation
chore: bump to v0.9.0
docs: update METHODOLOGY.md water intensity sources
test: add extractor test for known_after_apply instance_type
```

**Types:** `feat`, `fix`, `docs`, `test`, `chore`, `refactor`, `perf`

Commit messages that touch `factors.json` should name the specific instance type or region added.

---

## Code of Conduct

This project follows the [Contributor Covenant v2.1](./CODE_OF_CONDUCT.md). By participating, you agree to uphold this code. Please report unacceptable behaviour to `security@getgreenops.com`.
