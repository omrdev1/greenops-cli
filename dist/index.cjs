#!/usr/bin/env node
"use strict";

// cli.ts
var import_node_util = require("node:util");

// factors.json
var factors_default = {
  metadata: {
    ledger_version: "1.1.0",
    updated_at: "2026-03-25T00:00:00Z",
    sources: {
      grid: "electricity-maps-2024-avg",
      hardware: "cloud-carbon-footprint-v3",
      pricing: "aws-public-pricing-api"
    },
    assumptions: {
      default_utilization: {
        value: 0.5,
        citation: "Cloud Carbon Footprint (CCF) standard assumed average utilization for general-purpose compute where no telemetry is available.",
        url: "https://www.cloudcarbonfootprint.org/docs/methodology/#utilization"
      }
    }
  },
  regions: {
    "us-east-1": {
      location: "US East (N. Virginia)",
      grid_intensity_gco2e_per_kwh: 384.5,
      pue: 1.13
    },
    "us-west-2": {
      location: "US West (Oregon)",
      grid_intensity_gco2e_per_kwh: 240.1,
      pue: 1.13
    },
    "eu-west-1": {
      location: "Europe (Ireland)",
      grid_intensity_gco2e_per_kwh: 334,
      pue: 1.13
    },
    "eu-central-1": {
      location: "Europe (Frankfurt)",
      grid_intensity_gco2e_per_kwh: 420.5,
      pue: 1.13
    },
    "ap-southeast-2": {
      location: "Asia Pacific (Sydney)",
      grid_intensity_gco2e_per_kwh: 650,
      pue: 1.13
    }
  },
  instances: {
    "t3.medium": {
      architecture: "x86_64",
      vcpus: 2,
      memory_gb: 4,
      power_watts: { idle: 3.4, max: 10.2 }
    },
    "t3.large": {
      architecture: "x86_64",
      vcpus: 2,
      memory_gb: 8,
      power_watts: { idle: 6.8, max: 20.4 }
    },
    "m5.large": {
      architecture: "x86_64",
      vcpus: 2,
      memory_gb: 8,
      power_watts: { idle: 6.8, max: 20.4 }
    },
    "m5.xlarge": {
      architecture: "x86_64",
      vcpus: 4,
      memory_gb: 16,
      power_watts: { idle: 13.6, max: 40.8 }
    },
    "c5.large": {
      architecture: "x86_64",
      vcpus: 2,
      memory_gb: 4,
      power_watts: { idle: 6.5, max: 22 }
    },
    "c5.xlarge": {
      architecture: "x86_64",
      vcpus: 4,
      memory_gb: 8,
      power_watts: { idle: 13, max: 44 }
    },
    "t4g.medium": {
      architecture: "arm64",
      vcpus: 2,
      memory_gb: 4,
      power_watts: { idle: 2.2, max: 6.8 }
    },
    "t4g.large": {
      architecture: "arm64",
      vcpus: 2,
      memory_gb: 8,
      power_watts: { idle: 4.4, max: 13.6 }
    },
    "m6g.large": {
      architecture: "arm64",
      vcpus: 2,
      memory_gb: 8,
      power_watts: { idle: 4.1, max: 13.2 }
    },
    "m6g.xlarge": {
      architecture: "arm64",
      vcpus: 4,
      memory_gb: 16,
      power_watts: { idle: 8.2, max: 26.4 }
    },
    "c6g.large": {
      architecture: "arm64",
      vcpus: 2,
      memory_gb: 4,
      power_watts: { idle: 3.9, max: 14.5 }
    },
    "c6g.xlarge": {
      architecture: "arm64",
      vcpus: 4,
      memory_gb: 8,
      power_watts: { idle: 7.8, max: 29 }
    }
  },
  pricing_usd_per_hour: {
    "us-east-1": {
      "t3.medium": 0.0416,
      "t3.large": 0.0832,
      "m5.large": 0.096,
      "m5.xlarge": 0.192,
      "c5.large": 0.085,
      "c5.xlarge": 0.17,
      "t4g.medium": 0.0336,
      "t4g.large": 0.0672,
      "m6g.large": 0.077,
      "m6g.xlarge": 0.154,
      "c6g.large": 0.068,
      "c6g.xlarge": 0.136
    },
    "us-west-2": {
      "t3.medium": 0.0416,
      "t3.large": 0.0832,
      "m5.large": 0.096,
      "m5.xlarge": 0.192,
      "c5.large": 0.085,
      "c5.xlarge": 0.17,
      "t4g.medium": 0.0336,
      "t4g.large": 0.0672,
      "m6g.large": 0.077,
      "m6g.xlarge": 0.154,
      "c6g.large": 0.068,
      "c6g.xlarge": 0.136
    },
    "eu-west-1": {
      "t3.medium": 0.0456,
      "t3.large": 0.0912,
      "m5.large": 0.107,
      "m5.xlarge": 0.214,
      "c5.large": 0.096,
      "c5.xlarge": 0.192,
      "t4g.medium": 0.0376,
      "t4g.large": 0.0752,
      "m6g.large": 0.086,
      "m6g.xlarge": 0.172,
      "c6g.large": 0.076,
      "c6g.xlarge": 0.152
    },
    "eu-central-1": {
      "t3.medium": 0.0496,
      "t3.large": 0.0992,
      "m5.large": 0.115,
      "m5.xlarge": 0.23,
      "c5.large": 0.102,
      "c5.xlarge": 0.204,
      "t4g.medium": 0.0416,
      "t4g.large": 0.0832,
      "m6g.large": 0.092,
      "m6g.xlarge": 0.184,
      "c6g.large": 0.082,
      "c6g.xlarge": 0.164
    },
    "ap-southeast-2": {
      "t3.medium": 0.0544,
      "t3.large": 0.1088,
      "m5.large": 0.134,
      "m5.xlarge": 0.268,
      "c5.large": 0.118,
      "c5.xlarge": 0.236,
      "t4g.medium": 0.0452,
      "t4g.large": 0.0904,
      "m6g.large": 0.107,
      "m6g.xlarge": 0.214,
      "c6g.large": 0.094,
      "c6g.xlarge": 0.188
    }
  }
};

// package.json
var package_default = {
  name: "greenops-cli",
  version: "0.2.1",
  description: "Analyzes Terraform plans for carbon and cost impact.",
  main: "dist/index.cjs",
  bin: {
    "greenops-cli": "dist/index.cjs"
  },
  type: "module",
  engines: {
    node: ">=20"
  },
  scripts: {
    test: "tsx --test './*.test.ts' './formatters/*.test.ts'",
    typecheck: "tsc --noEmit",
    build: 'esbuild cli.ts --bundle --platform=node --target=node20 --outfile=dist/index.cjs --format=cjs --banner:js="#!/usr/bin/env node"',
    prepack: "npm run build"
  },
  devDependencies: {
    "@types/node": "^20.0.0",
    esbuild: "^0.20.0",
    typescript: "^5.0.0",
    tsx: "^4.0.0"
  }
};

// extractor.ts
var import_node_fs = require("node:fs");
function isKnownAfterApply(change, fieldPath) {
  if (!change)
    return true;
  if (change.after_unknown?.[fieldPath] === true)
    return true;
  if (change.after?.[fieldPath] === null || change.after?.[fieldPath] === void 0)
    return true;
  return false;
}
function resolveRegion(change) {
  if (change?.after?.arn && typeof change.after.arn === "string") {
    const parts = change.after.arn.split(":");
    if (parts.length >= 4 && parts[3])
      return parts[3];
  }
  if (change?.after?.availability_zone && typeof change.after.availability_zone === "string") {
    const azMatch = change.after.availability_zone.match(/^([a-z]{2}-[a-z]+-\d+)/);
    if (azMatch)
      return azMatch[1];
  }
  if (change?.after?.region && typeof change.after.region === "string") {
    return change.after.region;
  }
  if (change?.before?.region && typeof change.before.region === "string") {
    return change.before.region;
  }
  return null;
}
function extractResourceInputs(planFilePath) {
  const result2 = { resources: [], skipped: [], unsupportedTypes: [] };
  let raw;
  try {
    raw = (0, import_node_fs.readFileSync)(planFilePath, "utf8");
  } catch (err) {
    result2.error = `Failed to read plan file: ${err instanceof Error ? err.message : String(err)}`;
    return result2;
  }
  let plan;
  try {
    plan = JSON.parse(raw);
  } catch (err) {
    result2.error = `File is not valid JSON: ${err instanceof Error ? err.message : String(err)}`;
    return result2;
  }
  if (!plan || typeof plan !== "object" || !Array.isArray(plan.resource_changes)) {
    result2.error = "Invalid Terraform plan format: missing resource_changes array.";
    return result2;
  }
  const typedPlan = plan;
  for (const rawRes of typedPlan.resource_changes) {
    const res = rawRes;
    const actions = res.change?.actions;
    if (!Array.isArray(actions) || !actions.includes("create") && !actions.includes("update")) {
      continue;
    }
    const SUPPORTED_TYPES = ["aws_instance", "aws_db_instance"];
    const COMPUTE_RELEVANT_TYPES = ["aws_launch_template", "aws_autoscaling_group", "aws_ecs_service", "aws_eks_node_group", "aws_lambda_function"];
    if (!SUPPORTED_TYPES.includes(res.type)) {
      if (COMPUTE_RELEVANT_TYPES.includes(res.type) && !result2.unsupportedTypes.includes(res.type)) {
        result2.unsupportedTypes.push(res.type);
      }
      continue;
    }
    const isDb = res.type === "aws_db_instance";
    const typeField = isDb ? "instance_class" : "instance_type";
    if (isKnownAfterApply(res.change, typeField)) {
      result2.skipped.push({ resourceId: res.address, reason: "known_after_apply" });
      continue;
    }
    let instanceType = res.change.after[typeField];
    if (typeof res.change.after[typeField] !== "string") {
      result2.skipped.push({ resourceId: res.address, reason: "known_after_apply" });
      continue;
    }
    if (isDb && instanceType.startsWith("db.")) {
      instanceType = instanceType.replace(/^db\./, "");
      if (!instanceType.includes(".")) {
        result2.skipped.push({ resourceId: res.address, reason: "unsupported_instance" });
        continue;
      }
    }
    const region = resolveRegion(res.change);
    if (!region) {
      result2.skipped.push({ resourceId: res.address, reason: "known_after_apply" });
      continue;
    }
    result2.resources.push({
      resourceId: res.address,
      // Correctly applies nested addresses as the ID (e.g. module.compute.aws_instance.api)
      instanceType,
      region
    });
  }
  return result2;
}

// engine.ts
var HOURS_PER_MONTH = 730;
var GRAMS_PER_KWH_TO_KWH_FACTOR = 1e3;
function resolveUtilization(input, ledger) {
  if (input.avgUtilization !== void 0 && (input.avgUtilization < 0 || input.avgUtilization > 1)) {
    throw new RangeError(`avgUtilization must be between 0 and 1, got ${input.avgUtilization}`);
  }
  if (input.hoursPerMonth !== void 0 && input.hoursPerMonth <= 0) {
    throw new RangeError(`hoursPerMonth must be positive, got ${input.hoursPerMonth}`);
  }
  return input.avgUtilization ?? ledger.metadata.assumptions.default_utilization.value;
}
function linearInterpolationWatts(idle, max, utilization) {
  return idle + (max - idle) * utilization;
}
function wattsToCarbon(watts, hours, pue, gridIntensityGco2ePerKwh) {
  const energyKwh = watts * pue * hours / GRAMS_PER_KWH_TO_KWH_FACTOR;
  return energyKwh * gridIntensityGco2ePerKwh;
}
var ARM_UPGRADE_MAP = {
  m5: "m6g",
  c5: "c6g",
  t3: "t4g",
  // Extended families — entries are safe no-ops if targets aren't in factors.json
  r5: "r6g",
  m5a: "m6g",
  c5a: "c6g",
  r5a: "r6g"
};
function getArmAlternative(instanceType, ledger) {
  const [family, size] = instanceType.split(".");
  if (!family || !size)
    return null;
  const armFamily = ARM_UPGRADE_MAP[family];
  if (!armFamily)
    return null;
  const candidate = `${armFamily}.${size}`;
  return ledger.instances[candidate] ? candidate : null;
}
function getCleanerRegion(currentRegion, instanceType, ledger) {
  const regions = Object.entries(ledger.regions).filter(([regionId]) => {
    if (regionId === currentRegion)
      return false;
    return !!ledger.pricing_usd_per_hour[regionId]?.[instanceType];
  }).sort(([, a], [, b]) => a.grid_intensity_gco2e_per_kwh - b.grid_intensity_gco2e_per_kwh);
  if (regions.length === 0)
    return null;
  const [cleanestRegionId, cleanestRegion] = regions[0];
  const currentIntensity = ledger.regions[currentRegion]?.grid_intensity_gco2e_per_kwh ?? Infinity;
  if (cleanestRegion.grid_intensity_gco2e_per_kwh >= currentIntensity * 0.9)
    return null;
  return cleanestRegionId;
}
function calculateBaseline(input, ledger = factors_default) {
  const hours = input.hoursPerMonth ?? HOURS_PER_MONTH;
  const utilization = resolveUtilization(input, ledger);
  const regionData = ledger.regions[input.region];
  if (!regionData) {
    return {
      totalCo2eGramsPerMonth: 0,
      totalCostUsdPerMonth: 0,
      confidence: "LOW_ASSUMED_DEFAULT",
      scope: "SCOPE_2_OPERATIONAL",
      unsupportedReason: `Region "${input.region}" is not present in the open methodology ledger v${ledger.metadata.ledger_version}.`,
      assumptionsApplied: {
        utilizationApplied: utilization,
        gridIntensityApplied: 0,
        powerModelUsed: "LINEAR_INTERPOLATION"
      }
    };
  }
  const instanceData = ledger.instances[input.instanceType];
  if (!instanceData) {
    return {
      totalCo2eGramsPerMonth: 0,
      totalCostUsdPerMonth: 0,
      confidence: "LOW_ASSUMED_DEFAULT",
      scope: "SCOPE_2_OPERATIONAL",
      unsupportedReason: `Instance type "${input.instanceType}" is not present in the open methodology ledger v${ledger.metadata.ledger_version}.`,
      assumptionsApplied: {
        utilizationApplied: utilization,
        gridIntensityApplied: regionData.grid_intensity_gco2e_per_kwh,
        powerModelUsed: "LINEAR_INTERPOLATION"
      }
    };
  }
  const pricePerHour = ledger.pricing_usd_per_hour[input.region]?.[input.instanceType];
  if (pricePerHour === void 0) {
    return {
      totalCo2eGramsPerMonth: 0,
      totalCostUsdPerMonth: 0,
      confidence: "LOW_ASSUMED_DEFAULT",
      scope: "SCOPE_2_OPERATIONAL",
      unsupportedReason: `No pricing data for "${input.instanceType}" in "${input.region}" in the open methodology ledger v${ledger.metadata.ledger_version}.`,
      assumptionsApplied: {
        utilizationApplied: utilization,
        gridIntensityApplied: regionData.grid_intensity_gco2e_per_kwh,
        powerModelUsed: "LINEAR_INTERPOLATION"
      }
    };
  }
  const powerModel = "LINEAR_INTERPOLATION";
  const effectiveWatts = linearInterpolationWatts(
    instanceData.power_watts.idle,
    instanceData.power_watts.max,
    utilization
  );
  const totalCo2eGramsPerMonth = wattsToCarbon(
    effectiveWatts,
    hours,
    regionData.pue,
    regionData.grid_intensity_gco2e_per_kwh
  );
  const totalCostUsdPerMonth = pricePerHour * hours;
  const confidence = input.avgUtilization !== void 0 ? "MEDIUM" : "HIGH";
  return {
    totalCo2eGramsPerMonth,
    totalCostUsdPerMonth,
    confidence,
    scope: "SCOPE_2_OPERATIONAL",
    assumptionsApplied: {
      utilizationApplied: utilization,
      gridIntensityApplied: regionData.grid_intensity_gco2e_per_kwh,
      powerModelUsed: powerModel
    }
  };
}
function generateRecommendation(input, baseline, ledger = factors_default) {
  if (baseline.confidence === "LOW_ASSUMED_DEFAULT")
    return null;
  const candidates = [];
  const armAlternative = getArmAlternative(input.instanceType, ledger);
  if (armAlternative) {
    const armEstimate = calculateBaseline(
      { ...input, instanceType: armAlternative },
      ledger
    );
    if (armEstimate.confidence !== "LOW_ASSUMED_DEFAULT") {
      const co2Delta = armEstimate.totalCo2eGramsPerMonth - baseline.totalCo2eGramsPerMonth;
      const costDelta = armEstimate.totalCostUsdPerMonth - baseline.totalCostUsdPerMonth;
      if (co2Delta < 0 && costDelta < 0) {
        candidates.push({
          suggestedInstanceType: armAlternative,
          co2eDeltaGramsPerMonth: co2Delta,
          costDeltaUsdPerMonth: costDelta,
          rationale: `Switching from ${input.instanceType} (x86_64) to ${armAlternative} (ARM64) provides identical vCPU and memory at lower power draw, reducing carbon by ${Math.abs(Math.round(co2Delta))}g CO2e/month and cost by $${Math.abs(costDelta).toFixed(2)}/month.`
        });
      }
    }
  }
  const cleanerRegion = getCleanerRegion(input.region, input.instanceType, ledger);
  if (cleanerRegion) {
    const regionEstimate = calculateBaseline(
      { ...input, region: cleanerRegion },
      ledger
    );
    if (regionEstimate.confidence !== "LOW_ASSUMED_DEFAULT") {
      const co2Delta = regionEstimate.totalCo2eGramsPerMonth - baseline.totalCo2eGramsPerMonth;
      const costDelta = regionEstimate.totalCostUsdPerMonth - baseline.totalCostUsdPerMonth;
      const co2ReductionPct = baseline.totalCo2eGramsPerMonth > 0 ? Math.abs(co2Delta) / baseline.totalCo2eGramsPerMonth : 0;
      if (co2Delta < 0 && co2ReductionPct > 0.15) {
        const regionName = ledger.regions[cleanerRegion]?.location ?? cleanerRegion;
        const costNote = costDelta > 0 ? ` (note: cost increases by $${costDelta.toFixed(2)}/month)` : ` saving $${Math.abs(costDelta).toFixed(2)}/month`;
        candidates.push({
          suggestedRegion: cleanerRegion,
          co2eDeltaGramsPerMonth: co2Delta,
          costDeltaUsdPerMonth: costDelta,
          rationale: `Moving ${input.instanceType} from ${input.region} to ${regionName} (${cleanerRegion}) reduces grid carbon intensity from ${ledger.regions[input.region]?.grid_intensity_gco2e_per_kwh}g to ${ledger.regions[cleanerRegion]?.grid_intensity_gco2e_per_kwh}g CO2e/kWh, saving ${Math.abs(Math.round(co2Delta))}g CO2e/month${costNote}.`
        });
      }
    }
  }
  if (candidates.length === 0)
    return null;
  const scored = candidates.map((rec) => {
    const co2Pct = baseline.totalCo2eGramsPerMonth > 0 ? Math.abs(rec.co2eDeltaGramsPerMonth) / baseline.totalCo2eGramsPerMonth : 0;
    const costPct = baseline.totalCostUsdPerMonth > 0 ? Math.abs(rec.costDeltaUsdPerMonth) / baseline.totalCostUsdPerMonth : 0;
    return { rec, score: co2Pct * 0.6 + costPct * 0.4 };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].rec;
}
function analysePlan(resources, skipped, planFile2, ledger = factors_default) {
  const analysedResources = resources.map((input) => {
    const baseline = calculateBaseline(input, ledger);
    const recommendation = generateRecommendation(input, baseline, ledger);
    return { input, baseline, recommendation };
  });
  const totals = analysedResources.reduce(
    (acc, { baseline, recommendation }) => {
      acc.currentCo2eGramsPerMonth += baseline.totalCo2eGramsPerMonth;
      acc.currentCostUsdPerMonth += baseline.totalCostUsdPerMonth;
      if (recommendation) {
        acc.potentialCo2eSavingGramsPerMonth += Math.abs(
          recommendation.co2eDeltaGramsPerMonth
        );
        acc.potentialCostSavingUsdPerMonth += Math.abs(
          recommendation.costDeltaUsdPerMonth
        );
      }
      return acc;
    },
    {
      currentCo2eGramsPerMonth: 0,
      currentCostUsdPerMonth: 0,
      potentialCo2eSavingGramsPerMonth: 0,
      potentialCostSavingUsdPerMonth: 0
    }
  );
  return {
    analysedAt: (/* @__PURE__ */ new Date()).toISOString(),
    ledgerVersion: ledger.metadata.ledger_version,
    planFile: planFile2,
    resources: analysedResources,
    skipped,
    totals
  };
}

// formatters/util.ts
function formatDelta(grams) {
  const sign = grams < 0 ? "-" : "+";
  const kg = Math.abs(grams) / 1e3;
  return `${sign}${kg.toFixed(2)}kg`;
}
function formatCostDelta(usd) {
  const sign = usd < 0 ? "-" : "+";
  return `${sign}$${Math.abs(usd).toFixed(2)}`;
}
function formatGrams(grams) {
  return `${(grams / 1e3).toFixed(2)}kg`;
}

// formatters/markdown.ts
function formatMarkdown(result2, options = {}) {
  const METHODOLOGY_URL = options.repositoryUrl || "https://github.com/omrdev1/greenops-cli/blob/main/METHODOLOGY.md";
  const recsCount = result2.resources.filter((r) => r.recommendation).length;
  let out = `## \u{1F331} GreenOps Infrastructure Impact

`;
  out += `> **Total Current Footprint:** ${formatGrams(result2.totals.currentCo2eGramsPerMonth)} CO2e/month | **$${result2.totals.currentCostUsdPerMonth.toFixed(2)}**/month
`;
  if (recsCount > 0) {
    const pct = result2.totals.currentCo2eGramsPerMonth > 0 ? (result2.totals.potentialCo2eSavingGramsPerMonth / result2.totals.currentCo2eGramsPerMonth * 100).toFixed(1) : "0.0";
    out += `> **Potential Savings:** -${formatGrams(result2.totals.potentialCo2eSavingGramsPerMonth)} CO2e/month (${pct}%) | -$${result2.totals.potentialCostSavingUsdPerMonth.toFixed(2)}/month
`;
    out += `> \u{1F4A1} Found **${recsCount}** optimization ${recsCount === 1 ? "recommendation" : "recommendations"}.

`;
  } else {
    out += `> \u2705 **Already optimally configured!** No upgrades recommended.

`;
  }
  out += `### Resource Breakdown

`;
  out += `| Resource | Type | Region | CO2e/month | Cost/month | Action |
`;
  out += `|---|---|---|---|---|---|
`;
  for (const r of result2.resources) {
    const action = r.recommendation ? `\u{1F4A1} [View Recommendation](#recommendations)` : `\u2705 No change needed`;
    out += `| \`${r.input.resourceId}\` | \`${r.input.instanceType}\` | \`${r.input.region}\` | ${formatGrams(r.baseline.totalCo2eGramsPerMonth)} | $${r.baseline.totalCostUsdPerMonth.toFixed(2)} | ${action} |
`;
  }
  out += `
`;
  if (result2.skipped.length > 0) {
    out += `<details><summary>\u26A0\uFE0F <b>${result2.skipped.length} Skipped Resources</b></summary>

`;
    out += `The following resources were skipped from calculation (usually due to runtime abstractions). The actual footprint may be higher.

`;
    out += `| Resource | Reason |
|---|---|
`;
    for (const s of result2.skipped) {
      out += `| \`${s.resourceId}\` | \`${s.reason}\` |
`;
    }
    out += `
</details>

`;
  }
  if (recsCount > 0) {
    out += `### Recommendations

`;
    for (const r of result2.resources) {
      if (r.recommendation) {
        out += `#### \`${r.input.resourceId}\`
`;
        out += `- **Current:** \`${r.input.instanceType}\` in \`${r.input.region}\`
`;
        const sugRegion = r.recommendation.suggestedRegion || r.input.region;
        const sugInst = r.recommendation.suggestedInstanceType || r.input.instanceType;
        out += `- **Suggested:** \`${sugInst}\` in \`${sugRegion}\`
`;
        out += `- **Impact:** ${formatDelta(r.recommendation.co2eDeltaGramsPerMonth)} CO2e/month | ${formatCostDelta(r.recommendation.costDeltaUsdPerMonth)}/month
`;
        out += `- **Rationale:** ${r.recommendation.rationale}

`;
      }
    }
  }
  out += `---
`;
  out += `*Emissions calculated using the Open GreenOps Methodology Ledger (v${result2.ledgerVersion}). Scope 2 operational emissions only \u2014 embodied carbon and water are not tracked. Math is MIT-licensed and auditable. Analysed at ${result2.analysedAt}. [Learn more](${METHODOLOGY_URL}).*
`;
  if (result2.skipped.length > 0) {
    out += `
> \u26A0\uFE0F **Coverage note:** This analysis covers \`aws_instance\` and \`aws_db_instance\` resources only. Compute managed via launch templates, ASGs, ECS, EKS, or Lambda is not yet supported and may not be reflected above.
`;
  }
  if (options.showUpgradePrompt) {
    out += `
> \u{1F3E2} **Managing green-ops across dozens of repositories?** [Upgrade to GreenOps Dashboard](https://greenops-cli.dev/upgrade) to aggregate CI/CD carbon data natively.
`;
  }
  return out;
}

// formatters/table.ts
function truncate(str, len) {
  const visible = str.replace(/\x1b\[[0-9;]*m/g, "");
  if (visible.length > len)
    return visible.substring(0, len - 3) + "...";
  return visible + " ".repeat(len - visible.length);
}
function formatTable(result2) {
  let out = `
\x1B[1m\u{1F331} GreenOps Infrastructure Impact\x1B[0m

`;
  if (result2.resources.length === 0 && result2.skipped.length === 0) {
    return out + `No compatible infrastructure detected.
`;
  }
  out += `\u250C${"\u2500".repeat(40)}\u252C${"\u2500".repeat(15)}\u252C${"\u2500".repeat(15)}\u252C${"\u2500".repeat(15)}\u252C${"\u2500".repeat(15)}\u2510
`;
  out += `\u2502 ${truncate("Resource", 38)} \u2502 ${truncate("Instance", 13)} \u2502 ${truncate("Region", 13)} \u2502 ${truncate("CO2e/mo", 13)} \u2502 ${truncate("Action", 13)} \u2502
`;
  out += `\u251C${"\u2500".repeat(40)}\u253C${"\u2500".repeat(15)}\u253C${"\u2500".repeat(15)}\u253C${"\u2500".repeat(15)}\u253C${"\u2500".repeat(15)}\u2524
`;
  for (const r of result2.resources) {
    const c = formatGrams(r.baseline.totalCo2eGramsPerMonth);
    const action = r.recommendation ? `\x1B[33mUPGRADE\x1B[0m` : `\x1B[32mOK\x1B[0m`;
    out += `\u2502 ${truncate(r.input.resourceId, 38)} \u2502 ${truncate(r.input.instanceType, 13)} \u2502 ${truncate(r.input.region, 13)} \u2502 ${truncate(c, 13)} \u2502 ${truncate(action, 13)} \u2502
`;
  }
  for (const s of result2.skipped) {
    out += `\u2502 \x1B[90m${truncate(s.resourceId, 38)}\x1B[0m \u2502 \x1B[90m${truncate("---", 13)}\x1B[0m \u2502 \x1B[90m${truncate("---", 13)}\x1B[0m \u2502 \x1B[90m${truncate("---", 13)}\x1B[0m \u2502 \x1B[33m${truncate("\u26A0 SKIPPED", 13)}\x1B[0m \u2502
`;
  }
  out += `\u2514${"\u2500".repeat(40)}\u2534${"\u2500".repeat(15)}\u2534${"\u2500".repeat(15)}\u2534${"\u2500".repeat(15)}\u2534${"\u2500".repeat(15)}\u2518

`;
  out += `Current: ${formatGrams(result2.totals.currentCo2eGramsPerMonth)} | $${result2.totals.currentCostUsdPerMonth.toFixed(2)}
`;
  if (result2.totals.potentialCo2eSavingGramsPerMonth > 0) {
    out += `\x1B[32mSavings: ${formatDelta(-result2.totals.potentialCo2eSavingGramsPerMonth)} | ${formatCostDelta(-result2.totals.potentialCostSavingUsdPerMonth)}\x1B[0m
`;
  }
  if (result2.skipped.length > 0) {
    out += `
\x1B[90mNote: ${result2.skipped.length} resource(s) were skipped due to runtime abstractions.\x1B[0m
`;
  }
  return out;
}

// formatters/json.ts
function formatJson(result2) {
  const envelope = {
    // schemaVersion tracks the ledger version so downstream consumers
    // can version-gate parsing logic as the methodology evolves.
    schemaVersion: result2.ledgerVersion,
    result: result2
  };
  return JSON.stringify(envelope);
}

// cli.ts
var { positionals, values } = (0, import_node_util.parseArgs)({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    format: { type: "string", default: "markdown" },
    coverage: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
    version: { type: "boolean", default: false },
    "show-upgrade-prompt": { type: "string", default: "true" }
  }
});
if (values.version) {
  console.log(package_default.version);
  process.exit(0);
}
if (values.help) {
  console.log(`GreenOps CLI v${package_default.version}
Usage: greenops-cli diff <plan.json> [--format markdown|table|json]
       greenops-cli --coverage [--format json]
       greenops-cli --version`);
  process.exit(0);
}
if (values.coverage) {
  const rawFs = Object.assign({}, factors_default);
  if (values.format === "json") {
    console.log(JSON.stringify({ regions: Object.keys(rawFs.regions), instances: Object.keys(rawFs.instances) }, null, 2));
  } else {
    console.log(`Supported Regions: ${Object.keys(rawFs.regions).join(", ")}`);
    console.log(`Supported Instances: ${Object.keys(rawFs.instances).join(", ")}`);
  }
  process.exit(0);
}
var command = positionals[0];
var planFile = positionals[1];
if (command !== "diff" || !planFile) {
  console.error("Error: Missing 'diff' command or plan file parameter.");
  process.exit(1);
}
var extracted = extractResourceInputs(planFile);
if (extracted.error) {
  console.error(`Extraction Error: ${extracted.error}`);
  process.exit(1);
}
var result = analysePlan(extracted.resources, extracted.skipped, planFile);
var showUpgradePrompt = values["show-upgrade-prompt"] === "true";
if (values.format === "table") {
  console.log(formatTable(result));
} else if (values.format === "json") {
  console.log(formatJson(result));
} else {
  console.log(formatMarkdown(result, { showUpgradePrompt }));
}
process.exit(0);
