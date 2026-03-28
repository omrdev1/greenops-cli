#!/usr/bin/env node
"use strict";

// cli.ts
var import_node_util = require("node:util");

// factors.json
var factors_default = {
  metadata: {
    ledger_version: "2.0.0",
    updated_at: "2026-03-28T00:00:00Z",
    sources: {
      grid: "electricity-maps-2024-avg",
      hardware: "cloud-carbon-footprint-v3",
      pricing_aws: "aws-public-pricing-api-2026-q1",
      pricing_azure: "azure-public-pricing-api-2026-q1",
      pricing_gcp: "gcp-public-pricing-api-2026-q1",
      embodied: "cloud-carbon-footprint-v3-dell-r740-baseline",
      water: "aws-sustainability-report-2023-wue"
    },
    assumptions: {
      default_utilization: {
        value: 0.5,
        citation: "Cloud Carbon Footprint (CCF) standard assumed average utilization for general-purpose compute where no telemetry is available.",
        url: "https://www.cloudcarbonfootprint.org/docs/methodology/#utilization"
      }
    }
  },
  aws: {
    regions: {
      "us-east-1": {
        location: "US East (N. Virginia)",
        grid_intensity_gco2e_per_kwh: 384.5,
        pue: 1.13,
        water_intensity_litres_per_kwh: 0.46
      },
      "us-east-2": {
        location: "US East (Ohio)",
        grid_intensity_gco2e_per_kwh: 410,
        pue: 1.13,
        water_intensity_litres_per_kwh: 0.52
      },
      "us-west-1": {
        location: "US West (N. California)",
        grid_intensity_gco2e_per_kwh: 220,
        pue: 1.13,
        water_intensity_litres_per_kwh: 0.38
      },
      "us-west-2": {
        location: "US West (Oregon)",
        grid_intensity_gco2e_per_kwh: 240.1,
        pue: 1.13,
        water_intensity_litres_per_kwh: 0.18
      },
      "eu-west-1": {
        location: "Europe (Ireland)",
        grid_intensity_gco2e_per_kwh: 334,
        pue: 1.13,
        water_intensity_litres_per_kwh: 0.22
      },
      "eu-west-2": {
        location: "Europe (London)",
        grid_intensity_gco2e_per_kwh: 268,
        pue: 1.13,
        water_intensity_litres_per_kwh: 0.25
      },
      "eu-central-1": {
        location: "Europe (Frankfurt)",
        grid_intensity_gco2e_per_kwh: 420.5,
        pue: 1.13,
        water_intensity_litres_per_kwh: 0.28
      },
      "eu-north-1": {
        location: "Europe (Stockholm)",
        grid_intensity_gco2e_per_kwh: 8.8,
        pue: 1.13,
        water_intensity_litres_per_kwh: 0.1
      },
      "ap-southeast-1": {
        location: "Asia Pacific (Singapore)",
        grid_intensity_gco2e_per_kwh: 408,
        pue: 1.13,
        water_intensity_litres_per_kwh: 0.58
      },
      "ap-southeast-2": {
        location: "Asia Pacific (Sydney)",
        grid_intensity_gco2e_per_kwh: 650,
        pue: 1.13,
        water_intensity_litres_per_kwh: 0.45
      },
      "ap-northeast-1": {
        location: "Asia Pacific (Tokyo)",
        grid_intensity_gco2e_per_kwh: 506,
        pue: 1.13,
        water_intensity_litres_per_kwh: 0.5
      },
      "ap-south-1": {
        location: "Asia Pacific (Mumbai)",
        grid_intensity_gco2e_per_kwh: 723,
        pue: 1.13,
        water_intensity_litres_per_kwh: 0.72
      },
      "ca-central-1": {
        location: "Canada (Central)",
        grid_intensity_gco2e_per_kwh: 130,
        pue: 1.13,
        water_intensity_litres_per_kwh: 0.2
      },
      "sa-east-1": {
        location: "South America (S\xE3o Paulo)",
        grid_intensity_gco2e_per_kwh: 74,
        pue: 1.13,
        water_intensity_litres_per_kwh: 0.35
      }
    },
    instances: {
      "t3.micro": {
        architecture: "x86_64",
        vcpus: 2,
        memory_gb: 1,
        power_watts: {
          idle: 1.4,
          max: 5
        },
        embodied_co2e_grams_per_month: 1041.7
      },
      "t3.small": {
        architecture: "x86_64",
        vcpus: 2,
        memory_gb: 2,
        power_watts: {
          idle: 2,
          max: 7
        },
        embodied_co2e_grams_per_month: 1041.7
      },
      "t3.medium": {
        architecture: "x86_64",
        vcpus: 2,
        memory_gb: 4,
        power_watts: {
          idle: 3.4,
          max: 10.2
        },
        embodied_co2e_grams_per_month: 1041.7
      },
      "t3.large": {
        architecture: "x86_64",
        vcpus: 2,
        memory_gb: 8,
        power_watts: {
          idle: 6.8,
          max: 20.4
        },
        embodied_co2e_grams_per_month: 1041.7
      },
      "t3.xlarge": {
        architecture: "x86_64",
        vcpus: 4,
        memory_gb: 16,
        power_watts: {
          idle: 13.6,
          max: 40.8
        },
        embodied_co2e_grams_per_month: 2083.3
      },
      "t3a.medium": {
        architecture: "x86_64",
        vcpus: 2,
        memory_gb: 4,
        power_watts: {
          idle: 3.2,
          max: 9.8
        },
        embodied_co2e_grams_per_month: 1041.7
      },
      "t3a.large": {
        architecture: "x86_64",
        vcpus: 2,
        memory_gb: 8,
        power_watts: {
          idle: 6.4,
          max: 19.6
        },
        embodied_co2e_grams_per_month: 1041.7
      },
      "m5.large": {
        architecture: "x86_64",
        vcpus: 2,
        memory_gb: 8,
        power_watts: {
          idle: 6.8,
          max: 20.4
        },
        embodied_co2e_grams_per_month: 1041.7
      },
      "m5.xlarge": {
        architecture: "x86_64",
        vcpus: 4,
        memory_gb: 16,
        power_watts: {
          idle: 13.6,
          max: 40.8
        },
        embodied_co2e_grams_per_month: 2083.3
      },
      "m5.2xlarge": {
        architecture: "x86_64",
        vcpus: 8,
        memory_gb: 32,
        power_watts: {
          idle: 27.2,
          max: 81.6
        },
        embodied_co2e_grams_per_month: 4166.7
      },
      "m5a.large": {
        architecture: "x86_64",
        vcpus: 2,
        memory_gb: 8,
        power_watts: {
          idle: 6.5,
          max: 19.5
        },
        embodied_co2e_grams_per_month: 1041.7
      },
      "m5a.xlarge": {
        architecture: "x86_64",
        vcpus: 4,
        memory_gb: 16,
        power_watts: {
          idle: 13,
          max: 39
        },
        embodied_co2e_grams_per_month: 2083.3
      },
      "c5.large": {
        architecture: "x86_64",
        vcpus: 2,
        memory_gb: 4,
        power_watts: {
          idle: 6.5,
          max: 22
        },
        embodied_co2e_grams_per_month: 1041.7
      },
      "c5.xlarge": {
        architecture: "x86_64",
        vcpus: 4,
        memory_gb: 8,
        power_watts: {
          idle: 13,
          max: 44
        },
        embodied_co2e_grams_per_month: 2083.3
      },
      "c5.2xlarge": {
        architecture: "x86_64",
        vcpus: 8,
        memory_gb: 16,
        power_watts: {
          idle: 26,
          max: 88
        },
        embodied_co2e_grams_per_month: 4166.7
      },
      "c5a.large": {
        architecture: "x86_64",
        vcpus: 2,
        memory_gb: 4,
        power_watts: {
          idle: 6.2,
          max: 21
        },
        embodied_co2e_grams_per_month: 1041.7
      },
      "c5a.xlarge": {
        architecture: "x86_64",
        vcpus: 4,
        memory_gb: 8,
        power_watts: {
          idle: 12.4,
          max: 42
        },
        embodied_co2e_grams_per_month: 2083.3
      },
      "r5.large": {
        architecture: "x86_64",
        vcpus: 2,
        memory_gb: 16,
        power_watts: {
          idle: 8,
          max: 24
        },
        embodied_co2e_grams_per_month: 1041.7
      },
      "r5.xlarge": {
        architecture: "x86_64",
        vcpus: 4,
        memory_gb: 32,
        power_watts: {
          idle: 16,
          max: 48
        },
        embodied_co2e_grams_per_month: 2083.3
      },
      "t4g.micro": {
        architecture: "arm64",
        vcpus: 2,
        memory_gb: 1,
        power_watts: {
          idle: 0.9,
          max: 3.2
        },
        embodied_co2e_grams_per_month: 833.3
      },
      "t4g.small": {
        architecture: "arm64",
        vcpus: 2,
        memory_gb: 2,
        power_watts: {
          idle: 1.4,
          max: 4.5
        },
        embodied_co2e_grams_per_month: 833.3
      },
      "t4g.medium": {
        architecture: "arm64",
        vcpus: 2,
        memory_gb: 4,
        power_watts: {
          idle: 2.2,
          max: 6.8
        },
        embodied_co2e_grams_per_month: 833.3
      },
      "t4g.large": {
        architecture: "arm64",
        vcpus: 2,
        memory_gb: 8,
        power_watts: {
          idle: 4.4,
          max: 13.6
        },
        embodied_co2e_grams_per_month: 833.3
      },
      "t4g.xlarge": {
        architecture: "arm64",
        vcpus: 4,
        memory_gb: 16,
        power_watts: {
          idle: 8.8,
          max: 27.2
        },
        embodied_co2e_grams_per_month: 1666.7
      },
      "m6g.medium": {
        architecture: "arm64",
        vcpus: 1,
        memory_gb: 4,
        power_watts: {
          idle: 2.1,
          max: 6.6
        },
        embodied_co2e_grams_per_month: 416.7
      },
      "m6g.large": {
        architecture: "arm64",
        vcpus: 2,
        memory_gb: 8,
        power_watts: {
          idle: 4.1,
          max: 13.2
        },
        embodied_co2e_grams_per_month: 833.3
      },
      "m6g.xlarge": {
        architecture: "arm64",
        vcpus: 4,
        memory_gb: 16,
        power_watts: {
          idle: 8.2,
          max: 26.4
        },
        embodied_co2e_grams_per_month: 1666.7
      },
      "m6g.2xlarge": {
        architecture: "arm64",
        vcpus: 8,
        memory_gb: 32,
        power_watts: {
          idle: 16.4,
          max: 52.8
        },
        embodied_co2e_grams_per_month: 3333.3
      },
      "m7g.medium": {
        architecture: "arm64",
        vcpus: 1,
        memory_gb: 4,
        power_watts: {
          idle: 1.8,
          max: 5.8
        },
        embodied_co2e_grams_per_month: 416.7
      },
      "m7g.large": {
        architecture: "arm64",
        vcpus: 2,
        memory_gb: 8,
        power_watts: {
          idle: 3.6,
          max: 11.6
        },
        embodied_co2e_grams_per_month: 833.3
      },
      "m7g.xlarge": {
        architecture: "arm64",
        vcpus: 4,
        memory_gb: 16,
        power_watts: {
          idle: 7.2,
          max: 23.2
        },
        embodied_co2e_grams_per_month: 1666.7
      },
      "m7g.2xlarge": {
        architecture: "arm64",
        vcpus: 8,
        memory_gb: 32,
        power_watts: {
          idle: 14.4,
          max: 46.4
        },
        embodied_co2e_grams_per_month: 3333.3
      },
      "c6g.medium": {
        architecture: "arm64",
        vcpus: 1,
        memory_gb: 2,
        power_watts: {
          idle: 2,
          max: 7.3
        },
        embodied_co2e_grams_per_month: 416.7
      },
      "c6g.large": {
        architecture: "arm64",
        vcpus: 2,
        memory_gb: 4,
        power_watts: {
          idle: 3.9,
          max: 14.5
        },
        embodied_co2e_grams_per_month: 833.3
      },
      "c6g.xlarge": {
        architecture: "arm64",
        vcpus: 4,
        memory_gb: 8,
        power_watts: {
          idle: 7.8,
          max: 29
        },
        embodied_co2e_grams_per_month: 1666.7
      },
      "c6g.2xlarge": {
        architecture: "arm64",
        vcpus: 8,
        memory_gb: 16,
        power_watts: {
          idle: 15.6,
          max: 58
        },
        embodied_co2e_grams_per_month: 3333.3
      },
      "c7g.large": {
        architecture: "arm64",
        vcpus: 2,
        memory_gb: 4,
        power_watts: {
          idle: 3.5,
          max: 13
        },
        embodied_co2e_grams_per_month: 833.3
      },
      "c7g.xlarge": {
        architecture: "arm64",
        vcpus: 4,
        memory_gb: 8,
        power_watts: {
          idle: 7,
          max: 26
        },
        embodied_co2e_grams_per_month: 1666.7
      },
      "r6g.large": {
        architecture: "arm64",
        vcpus: 2,
        memory_gb: 16,
        power_watts: {
          idle: 4.8,
          max: 15
        },
        embodied_co2e_grams_per_month: 833.3
      },
      "r6g.xlarge": {
        architecture: "arm64",
        vcpus: 4,
        memory_gb: 32,
        power_watts: {
          idle: 9.6,
          max: 30
        },
        embodied_co2e_grams_per_month: 1666.7
      }
    },
    pricing_usd_per_hour: {
      "us-east-1": {
        "t3.micro": 0.0104,
        "t3.small": 0.0208,
        "t3.medium": 0.0416,
        "t3.large": 0.0832,
        "t3.xlarge": 0.1664,
        "t3a.medium": 0.0376,
        "t3a.large": 0.0752,
        "m5.large": 0.096,
        "m5.xlarge": 0.192,
        "m5.2xlarge": 0.384,
        "m5a.large": 0.086,
        "m5a.xlarge": 0.172,
        "c5.large": 0.085,
        "c5.xlarge": 0.17,
        "c5.2xlarge": 0.34,
        "c5a.large": 0.077,
        "c5a.xlarge": 0.154,
        "r5.large": 0.126,
        "r5.xlarge": 0.252,
        "t4g.micro": 84e-4,
        "t4g.small": 0.0168,
        "t4g.medium": 0.0336,
        "t4g.large": 0.0672,
        "t4g.xlarge": 0.1344,
        "m6g.medium": 0.0385,
        "m6g.large": 0.077,
        "m6g.xlarge": 0.154,
        "m6g.2xlarge": 0.308,
        "m7g.medium": 0.0408,
        "m7g.large": 0.0816,
        "m7g.xlarge": 0.1632,
        "m7g.2xlarge": 0.3264,
        "c6g.medium": 0.034,
        "c6g.large": 0.068,
        "c6g.xlarge": 0.136,
        "c6g.2xlarge": 0.272,
        "c7g.large": 0.0725,
        "c7g.xlarge": 0.145,
        "r6g.large": 0.1008,
        "r6g.xlarge": 0.2016
      },
      "us-east-2": {
        "t3.micro": 0.0104,
        "t3.small": 0.0208,
        "t3.medium": 0.0416,
        "t3.large": 0.0832,
        "t3.xlarge": 0.1664,
        "t3a.medium": 0.0376,
        "t3a.large": 0.0752,
        "m5.large": 0.096,
        "m5.xlarge": 0.192,
        "m5.2xlarge": 0.384,
        "m5a.large": 0.086,
        "m5a.xlarge": 0.172,
        "c5.large": 0.085,
        "c5.xlarge": 0.17,
        "c5.2xlarge": 0.34,
        "c5a.large": 0.077,
        "c5a.xlarge": 0.154,
        "r5.large": 0.126,
        "r5.xlarge": 0.252,
        "t4g.micro": 84e-4,
        "t4g.small": 0.0168,
        "t4g.medium": 0.0336,
        "t4g.large": 0.0672,
        "t4g.xlarge": 0.1344,
        "m6g.medium": 0.0385,
        "m6g.large": 0.077,
        "m6g.xlarge": 0.154,
        "m6g.2xlarge": 0.308,
        "m7g.medium": 0.0408,
        "m7g.large": 0.0816,
        "m7g.xlarge": 0.1632,
        "m7g.2xlarge": 0.3264,
        "c6g.medium": 0.034,
        "c6g.large": 0.068,
        "c6g.xlarge": 0.136,
        "c6g.2xlarge": 0.272,
        "c7g.large": 0.0725,
        "c7g.xlarge": 0.145,
        "r6g.large": 0.1008,
        "r6g.xlarge": 0.2016
      },
      "us-west-1": {
        "t3.micro": 0.0116,
        "t3.small": 0.0232,
        "t3.medium": 0.0464,
        "t3.large": 0.0928,
        "t3.xlarge": 0.1856,
        "m5.large": 0.107,
        "m5.xlarge": 0.214,
        "m5.2xlarge": 0.428,
        "c5.large": 0.096,
        "c5.xlarge": 0.192,
        "c5.2xlarge": 0.384,
        "t4g.medium": 0.0376,
        "t4g.large": 0.0752,
        "t4g.xlarge": 0.1504,
        "m6g.large": 0.086,
        "m6g.xlarge": 0.172,
        "m6g.2xlarge": 0.344,
        "m7g.large": 0.0912,
        "m7g.xlarge": 0.1824,
        "c6g.large": 0.076,
        "c6g.xlarge": 0.152,
        "r6g.large": 0.1127,
        "r6g.xlarge": 0.2254
      },
      "us-west-2": {
        "t3.micro": 0.0104,
        "t3.small": 0.0208,
        "t3.medium": 0.0416,
        "t3.large": 0.0832,
        "t3.xlarge": 0.1664,
        "t3a.medium": 0.0376,
        "t3a.large": 0.0752,
        "m5.large": 0.096,
        "m5.xlarge": 0.192,
        "m5.2xlarge": 0.384,
        "m5a.large": 0.086,
        "m5a.xlarge": 0.172,
        "c5.large": 0.085,
        "c5.xlarge": 0.17,
        "c5.2xlarge": 0.34,
        "c5a.large": 0.077,
        "c5a.xlarge": 0.154,
        "r5.large": 0.126,
        "r5.xlarge": 0.252,
        "t4g.micro": 84e-4,
        "t4g.small": 0.0168,
        "t4g.medium": 0.0336,
        "t4g.large": 0.0672,
        "t4g.xlarge": 0.1344,
        "m6g.medium": 0.0385,
        "m6g.large": 0.077,
        "m6g.xlarge": 0.154,
        "m6g.2xlarge": 0.308,
        "m7g.medium": 0.0408,
        "m7g.large": 0.0816,
        "m7g.xlarge": 0.1632,
        "m7g.2xlarge": 0.3264,
        "c6g.medium": 0.034,
        "c6g.large": 0.068,
        "c6g.xlarge": 0.136,
        "c6g.2xlarge": 0.272,
        "c7g.large": 0.0725,
        "c7g.xlarge": 0.145,
        "r6g.large": 0.1008,
        "r6g.xlarge": 0.2016
      },
      "eu-west-1": {
        "t3.micro": 0.0116,
        "t3.small": 0.0232,
        "t3.medium": 0.0456,
        "t3.large": 0.0912,
        "t3.xlarge": 0.1824,
        "t3a.medium": 0.0416,
        "t3a.large": 0.0832,
        "m5.large": 0.107,
        "m5.xlarge": 0.214,
        "m5.2xlarge": 0.428,
        "m5a.large": 0.096,
        "m5a.xlarge": 0.192,
        "c5.large": 0.096,
        "c5.xlarge": 0.192,
        "c5.2xlarge": 0.384,
        "c5a.large": 0.087,
        "c5a.xlarge": 0.174,
        "r5.large": 0.141,
        "r5.xlarge": 0.282,
        "t4g.micro": 94e-4,
        "t4g.small": 0.0188,
        "t4g.medium": 0.0376,
        "t4g.large": 0.0752,
        "t4g.xlarge": 0.1504,
        "m6g.medium": 0.043,
        "m6g.large": 0.086,
        "m6g.xlarge": 0.172,
        "m6g.2xlarge": 0.344,
        "m7g.medium": 0.0456,
        "m7g.large": 0.0912,
        "m7g.xlarge": 0.1824,
        "m7g.2xlarge": 0.3648,
        "c6g.medium": 0.038,
        "c6g.large": 0.076,
        "c6g.xlarge": 0.152,
        "c6g.2xlarge": 0.304,
        "c7g.large": 0.0812,
        "c7g.xlarge": 0.1624,
        "r6g.large": 0.1127,
        "r6g.xlarge": 0.2254
      },
      "eu-west-2": {
        "t3.micro": 0.0126,
        "t3.small": 0.0252,
        "t3.medium": 0.0504,
        "t3.large": 0.1008,
        "t3.xlarge": 0.2016,
        "m5.large": 0.1178,
        "m5.xlarge": 0.2356,
        "m5.2xlarge": 0.4712,
        "c5.large": 0.1054,
        "c5.xlarge": 0.2108,
        "c5.2xlarge": 0.4216,
        "t4g.medium": 0.0414,
        "t4g.large": 0.0828,
        "t4g.xlarge": 0.1656,
        "m6g.large": 0.0945,
        "m6g.xlarge": 0.189,
        "m6g.2xlarge": 0.378,
        "m7g.large": 0.1001,
        "m7g.xlarge": 0.2002,
        "c6g.large": 0.0836,
        "c6g.xlarge": 0.1672,
        "r6g.large": 0.124,
        "r6g.xlarge": 0.248
      },
      "eu-central-1": {
        "t3.micro": 0.012,
        "t3.small": 0.024,
        "t3.medium": 0.0496,
        "t3.large": 0.0992,
        "t3.xlarge": 0.1984,
        "t3a.medium": 0.0448,
        "t3a.large": 0.0896,
        "m5.large": 0.115,
        "m5.xlarge": 0.23,
        "m5.2xlarge": 0.46,
        "m5a.large": 0.103,
        "m5a.xlarge": 0.206,
        "c5.large": 0.102,
        "c5.xlarge": 0.204,
        "c5.2xlarge": 0.408,
        "r5.large": 0.151,
        "r5.xlarge": 0.302,
        "t4g.micro": 0.01,
        "t4g.small": 0.02,
        "t4g.medium": 0.0416,
        "t4g.large": 0.0832,
        "t4g.xlarge": 0.1664,
        "m6g.medium": 0.046,
        "m6g.large": 0.092,
        "m6g.xlarge": 0.184,
        "m6g.2xlarge": 0.368,
        "m7g.medium": 0.0488,
        "m7g.large": 0.0976,
        "m7g.xlarge": 0.1952,
        "m7g.2xlarge": 0.3904,
        "c6g.medium": 0.041,
        "c6g.large": 0.082,
        "c6g.xlarge": 0.164,
        "c6g.2xlarge": 0.328,
        "c7g.large": 0.0875,
        "c7g.xlarge": 0.175,
        "r6g.large": 0.121,
        "r6g.xlarge": 0.242
      },
      "eu-north-1": {
        "t3.micro": 0.0108,
        "t3.small": 0.0216,
        "t3.medium": 0.0432,
        "t3.large": 0.0864,
        "t3.xlarge": 0.1728,
        "m5.large": 0.1,
        "m5.xlarge": 0.2,
        "m5.2xlarge": 0.4,
        "c5.large": 0.089,
        "c5.xlarge": 0.178,
        "c5.2xlarge": 0.356,
        "t4g.medium": 0.0362,
        "t4g.large": 0.0724,
        "t4g.xlarge": 0.1448,
        "m6g.large": 0.08,
        "m6g.xlarge": 0.16,
        "m6g.2xlarge": 0.32,
        "m7g.large": 0.0848,
        "m7g.xlarge": 0.1696,
        "c6g.large": 0.0712,
        "c6g.xlarge": 0.1424,
        "r6g.large": 0.1054,
        "r6g.xlarge": 0.2108
      },
      "ap-southeast-1": {
        "t3.micro": 0.0132,
        "t3.small": 0.0264,
        "t3.medium": 0.0528,
        "t3.large": 0.1056,
        "t3.xlarge": 0.2112,
        "m5.large": 0.124,
        "m5.xlarge": 0.248,
        "m5.2xlarge": 0.496,
        "c5.large": 0.107,
        "c5.xlarge": 0.214,
        "c5.2xlarge": 0.428,
        "t4g.medium": 0.0438,
        "t4g.large": 0.0876,
        "t4g.xlarge": 0.1752,
        "m6g.large": 0.0992,
        "m6g.xlarge": 0.1984,
        "m6g.2xlarge": 0.3968,
        "m7g.large": 0.1051,
        "m7g.xlarge": 0.2102,
        "c6g.large": 0.086,
        "c6g.xlarge": 0.172,
        "r6g.large": 0.1307,
        "r6g.xlarge": 0.2614
      },
      "ap-southeast-2": {
        "t3.micro": 0.0136,
        "t3.small": 0.0272,
        "t3.medium": 0.0544,
        "t3.large": 0.1088,
        "t3.xlarge": 0.2176,
        "t3a.medium": 0.0492,
        "t3a.large": 0.0984,
        "m5.large": 0.134,
        "m5.xlarge": 0.268,
        "m5.2xlarge": 0.536,
        "m5a.large": 0.12,
        "m5a.xlarge": 0.24,
        "c5.large": 0.118,
        "c5.xlarge": 0.236,
        "c5.2xlarge": 0.472,
        "r5.large": 0.176,
        "r5.xlarge": 0.352,
        "t4g.micro": 0.0113,
        "t4g.small": 0.0226,
        "t4g.medium": 0.0452,
        "t4g.large": 0.0904,
        "t4g.xlarge": 0.1808,
        "m6g.medium": 0.0535,
        "m6g.large": 0.107,
        "m6g.xlarge": 0.214,
        "m6g.2xlarge": 0.428,
        "m7g.medium": 0.0567,
        "m7g.large": 0.1134,
        "m7g.xlarge": 0.2268,
        "m7g.2xlarge": 0.4536,
        "c6g.medium": 0.047,
        "c6g.large": 0.094,
        "c6g.xlarge": 0.188,
        "c6g.2xlarge": 0.376,
        "c7g.large": 0.1002,
        "c7g.xlarge": 0.2004,
        "r6g.large": 0.1411,
        "r6g.xlarge": 0.2822
      },
      "ap-northeast-1": {
        "t3.micro": 0.014,
        "t3.small": 0.028,
        "t3.medium": 0.056,
        "t3.large": 0.112,
        "t3.xlarge": 0.224,
        "t3a.medium": 0.0504,
        "t3a.large": 0.1008,
        "m5.large": 0.128,
        "m5.xlarge": 0.256,
        "m5.2xlarge": 0.512,
        "m5a.large": 0.115,
        "m5a.xlarge": 0.23,
        "c5.large": 0.114,
        "c5.xlarge": 0.228,
        "c5.2xlarge": 0.456,
        "r5.large": 0.169,
        "r5.xlarge": 0.338,
        "t4g.micro": 0.0116,
        "t4g.small": 0.0232,
        "t4g.medium": 0.0464,
        "t4g.large": 0.0928,
        "t4g.xlarge": 0.1856,
        "m6g.medium": 0.0549,
        "m6g.large": 0.1098,
        "m6g.xlarge": 0.2196,
        "m6g.2xlarge": 0.4392,
        "m7g.medium": 0.0582,
        "m7g.large": 0.1164,
        "m7g.xlarge": 0.2328,
        "m7g.2xlarge": 0.4656,
        "c6g.medium": 0.0482,
        "c6g.large": 0.0964,
        "c6g.xlarge": 0.1928,
        "c6g.2xlarge": 0.3856,
        "c7g.large": 0.1028,
        "c7g.xlarge": 0.2056,
        "r6g.large": 0.1448,
        "r6g.xlarge": 0.2896
      },
      "ap-south-1": {
        "t3.micro": 0.0114,
        "t3.small": 0.0228,
        "t3.medium": 0.0456,
        "t3.large": 0.0912,
        "t3.xlarge": 0.1824,
        "t3a.medium": 0.041,
        "t3a.large": 0.082,
        "m5.large": 0.106,
        "m5.xlarge": 0.212,
        "m5.2xlarge": 0.424,
        "c5.large": 0.094,
        "c5.xlarge": 0.188,
        "c5.2xlarge": 0.376,
        "r5.large": 0.1396,
        "r5.xlarge": 0.2792,
        "t4g.micro": 95e-4,
        "t4g.small": 0.019,
        "t4g.medium": 0.038,
        "t4g.large": 0.076,
        "t4g.xlarge": 0.152,
        "m6g.medium": 0.0454,
        "m6g.large": 0.0908,
        "m6g.xlarge": 0.1816,
        "m6g.2xlarge": 0.3632,
        "m7g.medium": 0.0481,
        "m7g.large": 0.0962,
        "m7g.xlarge": 0.1924,
        "m7g.2xlarge": 0.3848,
        "c6g.medium": 0.0399,
        "c6g.large": 0.0798,
        "c6g.xlarge": 0.1596,
        "c6g.2xlarge": 0.3192,
        "r6g.large": 0.1197,
        "r6g.xlarge": 0.2394
      },
      "ca-central-1": {
        "t3.micro": 0.0116,
        "t3.small": 0.0232,
        "t3.medium": 0.0464,
        "t3.large": 0.0928,
        "t3.xlarge": 0.1856,
        "t3a.medium": 0.0418,
        "t3a.large": 0.0836,
        "m5.large": 0.107,
        "m5.xlarge": 0.214,
        "m5.2xlarge": 0.428,
        "m5a.large": 0.096,
        "m5a.xlarge": 0.192,
        "c5.large": 0.095,
        "c5.xlarge": 0.19,
        "c5.2xlarge": 0.38,
        "r5.large": 0.141,
        "r5.xlarge": 0.282,
        "t4g.micro": 96e-4,
        "t4g.small": 0.0192,
        "t4g.medium": 0.0386,
        "t4g.large": 0.0772,
        "t4g.xlarge": 0.1544,
        "m6g.medium": 0.0462,
        "m6g.large": 0.0924,
        "m6g.xlarge": 0.1848,
        "m6g.2xlarge": 0.3696,
        "m7g.medium": 0.049,
        "m7g.large": 0.098,
        "m7g.xlarge": 0.196,
        "m7g.2xlarge": 0.392,
        "c6g.medium": 0.0408,
        "c6g.large": 0.0816,
        "c6g.xlarge": 0.1632,
        "c6g.2xlarge": 0.3264,
        "c7g.large": 0.087,
        "c7g.xlarge": 0.174,
        "r6g.large": 0.1218,
        "r6g.xlarge": 0.2436
      },
      "sa-east-1": {
        "t3.micro": 0.0168,
        "t3.small": 0.0336,
        "t3.medium": 0.0672,
        "t3.large": 0.1344,
        "t3.xlarge": 0.2688,
        "m5.large": 0.162,
        "m5.xlarge": 0.324,
        "m5.2xlarge": 0.648,
        "c5.large": 0.144,
        "c5.xlarge": 0.288,
        "c5.2xlarge": 0.576,
        "t4g.medium": 0.056,
        "t4g.large": 0.112,
        "t4g.xlarge": 0.224,
        "m6g.large": 0.1296,
        "m6g.xlarge": 0.2592,
        "m6g.2xlarge": 0.5184,
        "m7g.large": 0.1374,
        "m7g.xlarge": 0.2748,
        "c6g.large": 0.1152,
        "c6g.xlarge": 0.2304,
        "r6g.large": 0.1706,
        "r6g.xlarge": 0.3412
      }
    }
  },
  azure: {
    regions: {
      eastus: {
        location: "East US (Virginia)",
        grid_intensity_gco2e_per_kwh: 380,
        pue: 1.125,
        water_intensity_litres_per_kwh: 0.43
      },
      eastus2: {
        location: "East US 2 (Virginia)",
        grid_intensity_gco2e_per_kwh: 380,
        pue: 1.125,
        water_intensity_litres_per_kwh: 0.43
      },
      westus: {
        location: "West US (California)",
        grid_intensity_gco2e_per_kwh: 200,
        pue: 1.125,
        water_intensity_litres_per_kwh: 0.35
      },
      westus2: {
        location: "West US 2 (Washington)",
        grid_intensity_gco2e_per_kwh: 235,
        pue: 1.125,
        water_intensity_litres_per_kwh: 0.18
      },
      westus3: {
        location: "West US 3 (Arizona)",
        grid_intensity_gco2e_per_kwh: 350,
        pue: 1.125,
        water_intensity_litres_per_kwh: 0.55
      },
      northeurope: {
        location: "North Europe (Ireland)",
        grid_intensity_gco2e_per_kwh: 334,
        pue: 1.125,
        water_intensity_litres_per_kwh: 0.22
      },
      westeurope: {
        location: "West Europe (Netherlands)",
        grid_intensity_gco2e_per_kwh: 270,
        pue: 1.125,
        water_intensity_litres_per_kwh: 0.2
      },
      uksouth: {
        location: "UK South (London)",
        grid_intensity_gco2e_per_kwh: 268,
        pue: 1.125,
        water_intensity_litres_per_kwh: 0.25
      },
      ukwest: {
        location: "UK West (Cardiff)",
        grid_intensity_gco2e_per_kwh: 268,
        pue: 1.125,
        water_intensity_litres_per_kwh: 0.25
      },
      swedencentral: {
        location: "Sweden Central",
        grid_intensity_gco2e_per_kwh: 8.8,
        pue: 1.125,
        water_intensity_litres_per_kwh: 0.1
      },
      germanywestcentral: {
        location: "Germany West Central",
        grid_intensity_gco2e_per_kwh: 420.5,
        pue: 1.125,
        water_intensity_litres_per_kwh: 0.28
      },
      southeastasia: {
        location: "Southeast Asia (Singapore)",
        grid_intensity_gco2e_per_kwh: 408,
        pue: 1.125,
        water_intensity_litres_per_kwh: 0.58
      },
      australiaeast: {
        location: "Australia East (NSW)",
        grid_intensity_gco2e_per_kwh: 650,
        pue: 1.125,
        water_intensity_litres_per_kwh: 0.45
      },
      japaneast: {
        location: "Japan East (Tokyo)",
        grid_intensity_gco2e_per_kwh: 506,
        pue: 1.125,
        water_intensity_litres_per_kwh: 0.5
      },
      centralindia: {
        location: "Central India (Pune)",
        grid_intensity_gco2e_per_kwh: 723,
        pue: 1.125,
        water_intensity_litres_per_kwh: 0.72
      },
      canadacentral: {
        location: "Canada Central (Toronto)",
        grid_intensity_gco2e_per_kwh: 130,
        pue: 1.125,
        water_intensity_litres_per_kwh: 0.2
      },
      brazilsouth: {
        location: "Brazil South (Sao Paulo)",
        grid_intensity_gco2e_per_kwh: 74,
        pue: 1.125,
        water_intensity_litres_per_kwh: 0.35
      }
    },
    instances: {
      Standard_B2s: {
        architecture: "x86_64",
        vcpus: 2,
        memory_gb: 4,
        power_watts: {
          idle: 1.5,
          max: 5.5
        },
        embodied_co2e_grams_per_month: 1041.7
      },
      Standard_B2ms: {
        architecture: "x86_64",
        vcpus: 2,
        memory_gb: 8,
        power_watts: {
          idle: 3,
          max: 11
        },
        embodied_co2e_grams_per_month: 1041.7
      },
      Standard_B4ms: {
        architecture: "x86_64",
        vcpus: 4,
        memory_gb: 16,
        power_watts: {
          idle: 6,
          max: 22
        },
        embodied_co2e_grams_per_month: 2083.3
      },
      Standard_D2s_v3: {
        architecture: "x86_64",
        vcpus: 2,
        memory_gb: 8,
        power_watts: {
          idle: 6.8,
          max: 20.4
        },
        embodied_co2e_grams_per_month: 1041.7
      },
      Standard_D4s_v3: {
        architecture: "x86_64",
        vcpus: 4,
        memory_gb: 16,
        power_watts: {
          idle: 13.6,
          max: 40.8
        },
        embodied_co2e_grams_per_month: 2083.3
      },
      Standard_D8s_v3: {
        architecture: "x86_64",
        vcpus: 8,
        memory_gb: 32,
        power_watts: {
          idle: 27.2,
          max: 81.6
        },
        embodied_co2e_grams_per_month: 4166.6
      },
      Standard_D2s_v4: {
        architecture: "x86_64",
        vcpus: 2,
        memory_gb: 8,
        power_watts: {
          idle: 6.5,
          max: 19.5
        },
        embodied_co2e_grams_per_month: 1041.7
      },
      Standard_D4s_v4: {
        architecture: "x86_64",
        vcpus: 4,
        memory_gb: 16,
        power_watts: {
          idle: 13,
          max: 39
        },
        embodied_co2e_grams_per_month: 2083.3
      },
      Standard_D2ps_v5: {
        architecture: "arm64",
        vcpus: 2,
        memory_gb: 8,
        power_watts: {
          idle: 4.1,
          max: 13.2
        },
        embodied_co2e_grams_per_month: 833.3
      },
      Standard_D4ps_v5: {
        architecture: "arm64",
        vcpus: 4,
        memory_gb: 16,
        power_watts: {
          idle: 8.2,
          max: 26.4
        },
        embodied_co2e_grams_per_month: 1666.7
      },
      Standard_D8ps_v5: {
        architecture: "arm64",
        vcpus: 8,
        memory_gb: 32,
        power_watts: {
          idle: 16.4,
          max: 52.8
        },
        embodied_co2e_grams_per_month: 3333.3
      },
      Standard_F2s_v2: {
        architecture: "x86_64",
        vcpus: 2,
        memory_gb: 4,
        power_watts: {
          idle: 6.5,
          max: 22
        },
        embodied_co2e_grams_per_month: 1041.7
      },
      Standard_F4s_v2: {
        architecture: "x86_64",
        vcpus: 4,
        memory_gb: 8,
        power_watts: {
          idle: 13,
          max: 44
        },
        embodied_co2e_grams_per_month: 2083.3
      },
      Standard_F8s_v2: {
        architecture: "x86_64",
        vcpus: 8,
        memory_gb: 16,
        power_watts: {
          idle: 26,
          max: 88
        },
        embodied_co2e_grams_per_month: 4166.6
      },
      Standard_E2s_v3: {
        architecture: "x86_64",
        vcpus: 2,
        memory_gb: 16,
        power_watts: {
          idle: 8,
          max: 24
        },
        embodied_co2e_grams_per_month: 1041.7
      },
      Standard_E4s_v3: {
        architecture: "x86_64",
        vcpus: 4,
        memory_gb: 32,
        power_watts: {
          idle: 16,
          max: 48
        },
        embodied_co2e_grams_per_month: 2083.3
      }
    },
    pricing_usd_per_hour: {
      eastus: {
        Standard_B2s: 0.041,
        Standard_B2ms: 0.081,
        Standard_B4ms: 0.162,
        Standard_D2s_v3: 0.096,
        Standard_D4s_v3: 0.192,
        Standard_D8s_v3: 0.384,
        Standard_D2s_v4: 0.091,
        Standard_D4s_v4: 0.182,
        Standard_D2ps_v5: 0.077,
        Standard_D4ps_v5: 0.154,
        Standard_D8ps_v5: 0.308,
        Standard_F2s_v2: 0.085,
        Standard_F4s_v2: 0.17,
        Standard_F8s_v2: 0.34,
        Standard_E2s_v3: 0.126,
        Standard_E4s_v3: 0.252
      },
      eastus2: {
        Standard_B2s: 0.041,
        Standard_B2ms: 0.081,
        Standard_B4ms: 0.162,
        Standard_D2s_v3: 0.096,
        Standard_D4s_v3: 0.192,
        Standard_D8s_v3: 0.384,
        Standard_D2s_v4: 0.091,
        Standard_D4s_v4: 0.182,
        Standard_D2ps_v5: 0.077,
        Standard_D4ps_v5: 0.154,
        Standard_D8ps_v5: 0.308,
        Standard_F2s_v2: 0.085,
        Standard_F4s_v2: 0.17,
        Standard_F8s_v2: 0.34,
        Standard_E2s_v3: 0.126,
        Standard_E4s_v3: 0.252
      },
      westus2: {
        Standard_B2s: 0.041,
        Standard_B2ms: 0.081,
        Standard_B4ms: 0.162,
        Standard_D2s_v3: 0.096,
        Standard_D4s_v3: 0.192,
        Standard_D8s_v3: 0.384,
        Standard_D2s_v4: 0.091,
        Standard_D4s_v4: 0.182,
        Standard_D2ps_v5: 0.077,
        Standard_D4ps_v5: 0.154,
        Standard_D8ps_v5: 0.308,
        Standard_F2s_v2: 0.085,
        Standard_F4s_v2: 0.17,
        Standard_F8s_v2: 0.34,
        Standard_E2s_v3: 0.126,
        Standard_E4s_v3: 0.252
      },
      northeurope: {
        Standard_B2s: 0.044,
        Standard_B2ms: 0.087,
        Standard_B4ms: 0.174,
        Standard_D2s_v3: 0.104,
        Standard_D4s_v3: 0.208,
        Standard_D8s_v3: 0.416,
        Standard_D2s_v4: 0.098,
        Standard_D4s_v4: 0.196,
        Standard_D2ps_v5: 0.083,
        Standard_D4ps_v5: 0.166,
        Standard_D8ps_v5: 0.332,
        Standard_F2s_v2: 0.091,
        Standard_F4s_v2: 0.183,
        Standard_F8s_v2: 0.366,
        Standard_E2s_v3: 0.136,
        Standard_E4s_v3: 0.271
      },
      westeurope: {
        Standard_B2s: 0.044,
        Standard_B2ms: 0.087,
        Standard_B4ms: 0.174,
        Standard_D2s_v3: 0.104,
        Standard_D4s_v3: 0.208,
        Standard_D8s_v3: 0.416,
        Standard_D2s_v4: 0.098,
        Standard_D4s_v4: 0.196,
        Standard_D2ps_v5: 0.083,
        Standard_D4ps_v5: 0.166,
        Standard_D8ps_v5: 0.332,
        Standard_F2s_v2: 0.091,
        Standard_F4s_v2: 0.183,
        Standard_F8s_v2: 0.366,
        Standard_E2s_v3: 0.136,
        Standard_E4s_v3: 0.271
      },
      uksouth: {
        Standard_B2s: 0.046,
        Standard_B2ms: 0.091,
        Standard_B4ms: 0.183,
        Standard_D2s_v3: 0.109,
        Standard_D4s_v3: 0.218,
        Standard_D8s_v3: 0.436,
        Standard_D2s_v4: 0.103,
        Standard_D4s_v4: 0.206,
        Standard_D2ps_v5: 0.087,
        Standard_D4ps_v5: 0.174,
        Standard_D8ps_v5: 0.348,
        Standard_F2s_v2: 0.095,
        Standard_F4s_v2: 0.191,
        Standard_F8s_v2: 0.382,
        Standard_E2s_v3: 0.143,
        Standard_E4s_v3: 0.285
      },
      swedencentral: {
        Standard_B2s: 0.042,
        Standard_B2ms: 0.083,
        Standard_B4ms: 0.166,
        Standard_D2s_v3: 0.099,
        Standard_D4s_v3: 0.198,
        Standard_D8s_v3: 0.397,
        Standard_D2s_v4: 0.094,
        Standard_D4s_v4: 0.187,
        Standard_D2ps_v5: 0.079,
        Standard_D4ps_v5: 0.159,
        Standard_D8ps_v5: 0.317,
        Standard_F2s_v2: 0.087,
        Standard_F4s_v2: 0.174,
        Standard_F8s_v2: 0.348,
        Standard_E2s_v3: 0.13,
        Standard_E4s_v3: 0.259
      },
      southeastasia: {
        Standard_B2s: 0.048,
        Standard_B2ms: 0.096,
        Standard_B4ms: 0.192,
        Standard_D2s_v3: 0.114,
        Standard_D4s_v3: 0.229,
        Standard_D8s_v3: 0.458,
        Standard_D2s_v4: 0.108,
        Standard_D4s_v4: 0.217,
        Standard_D2ps_v5: 0.092,
        Standard_D4ps_v5: 0.184,
        Standard_D8ps_v5: 0.368,
        Standard_F2s_v2: 0.1,
        Standard_F4s_v2: 0.2,
        Standard_F8s_v2: 0.4,
        Standard_E2s_v3: 0.15,
        Standard_E4s_v3: 0.301
      },
      australiaeast: {
        Standard_B2s: 0.052,
        Standard_B2ms: 0.104,
        Standard_B4ms: 0.208,
        Standard_D2s_v3: 0.124,
        Standard_D4s_v3: 0.248,
        Standard_D8s_v3: 0.496,
        Standard_D2s_v4: 0.117,
        Standard_D4s_v4: 0.234,
        Standard_D2ps_v5: 0.099,
        Standard_D4ps_v5: 0.199,
        Standard_D8ps_v5: 0.397,
        Standard_F2s_v2: 0.108,
        Standard_F4s_v2: 0.217,
        Standard_F8s_v2: 0.433,
        Standard_E2s_v3: 0.162,
        Standard_E4s_v3: 0.325
      },
      japaneast: {
        Standard_B2s: 0.051,
        Standard_B2ms: 0.102,
        Standard_B4ms: 0.204,
        Standard_D2s_v3: 0.121,
        Standard_D4s_v3: 0.242,
        Standard_D8s_v3: 0.484,
        Standard_D2s_v4: 0.115,
        Standard_D4s_v4: 0.229,
        Standard_D2ps_v5: 0.097,
        Standard_D4ps_v5: 0.194,
        Standard_D8ps_v5: 0.388,
        Standard_F2s_v2: 0.105,
        Standard_F4s_v2: 0.211,
        Standard_F8s_v2: 0.422,
        Standard_E2s_v3: 0.158,
        Standard_E4s_v3: 0.317
      },
      centralindia: {
        Standard_B2s: 0.043,
        Standard_B2ms: 0.086,
        Standard_B4ms: 0.171,
        Standard_D2s_v3: 0.102,
        Standard_D4s_v3: 0.203,
        Standard_D8s_v3: 0.406,
        Standard_D2s_v4: 0.096,
        Standard_D4s_v4: 0.192,
        Standard_D2ps_v5: 0.081,
        Standard_D4ps_v5: 0.162,
        Standard_D8ps_v5: 0.325,
        Standard_F2s_v2: 0.089,
        Standard_F4s_v2: 0.178,
        Standard_F8s_v2: 0.356,
        Standard_E2s_v3: 0.133,
        Standard_E4s_v3: 0.266
      },
      canadacentral: {
        Standard_B2s: 0.043,
        Standard_B2ms: 0.086,
        Standard_B4ms: 0.171,
        Standard_D2s_v3: 0.101,
        Standard_D4s_v3: 0.202,
        Standard_D8s_v3: 0.404,
        Standard_D2s_v4: 0.096,
        Standard_D4s_v4: 0.191,
        Standard_D2ps_v5: 0.081,
        Standard_D4ps_v5: 0.162,
        Standard_D8ps_v5: 0.323,
        Standard_F2s_v2: 0.088,
        Standard_F4s_v2: 0.177,
        Standard_F8s_v2: 0.354,
        Standard_E2s_v3: 0.132,
        Standard_E4s_v3: 0.264
      },
      brazilsouth: {
        Standard_B2s: 0.059,
        Standard_B2ms: 0.118,
        Standard_B4ms: 0.237,
        Standard_D2s_v3: 0.141,
        Standard_D4s_v3: 0.281,
        Standard_D8s_v3: 0.562,
        Standard_D2s_v4: 0.133,
        Standard_D4s_v4: 0.266,
        Standard_D2ps_v5: 0.113,
        Standard_D4ps_v5: 0.225,
        Standard_D8ps_v5: 0.45,
        Standard_F2s_v2: 0.123,
        Standard_F4s_v2: 0.246,
        Standard_F8s_v2: 0.492,
        Standard_E2s_v3: 0.184,
        Standard_E4s_v3: 0.368
      }
    }
  },
  gcp: {
    regions: {
      "us-central1": {
        location: "Iowa",
        grid_intensity_gco2e_per_kwh: 340,
        pue: 1.1,
        water_intensity_litres_per_kwh: 0.4
      },
      "us-east1": {
        location: "South Carolina",
        grid_intensity_gco2e_per_kwh: 380,
        pue: 1.1,
        water_intensity_litres_per_kwh: 0.43
      },
      "us-east4": {
        location: "Virginia",
        grid_intensity_gco2e_per_kwh: 380,
        pue: 1.1,
        water_intensity_litres_per_kwh: 0.43
      },
      "us-west1": {
        location: "Oregon",
        grid_intensity_gco2e_per_kwh: 200,
        pue: 1.1,
        water_intensity_litres_per_kwh: 0.18
      },
      "us-west2": {
        location: "Los Angeles",
        grid_intensity_gco2e_per_kwh: 220,
        pue: 1.1,
        water_intensity_litres_per_kwh: 0.35
      },
      "europe-west1": {
        location: "Belgium",
        grid_intensity_gco2e_per_kwh: 144,
        pue: 1.1,
        water_intensity_litres_per_kwh: 0.2
      },
      "europe-west2": {
        location: "London",
        grid_intensity_gco2e_per_kwh: 268,
        pue: 1.1,
        water_intensity_litres_per_kwh: 0.25
      },
      "europe-west4": {
        location: "Netherlands",
        grid_intensity_gco2e_per_kwh: 270,
        pue: 1.1,
        water_intensity_litres_per_kwh: 0.2
      },
      "europe-north1": {
        location: "Finland",
        grid_intensity_gco2e_per_kwh: 18,
        pue: 1.1,
        water_intensity_litres_per_kwh: 0.12
      },
      "asia-southeast1": {
        location: "Singapore",
        grid_intensity_gco2e_per_kwh: 408,
        pue: 1.1,
        water_intensity_litres_per_kwh: 0.58
      },
      "asia-east1": {
        location: "Taiwan",
        grid_intensity_gco2e_per_kwh: 486,
        pue: 1.1,
        water_intensity_litres_per_kwh: 0.45
      },
      "asia-northeast1": {
        location: "Tokyo",
        grid_intensity_gco2e_per_kwh: 506,
        pue: 1.1,
        water_intensity_litres_per_kwh: 0.5
      },
      "asia-south1": {
        location: "Mumbai",
        grid_intensity_gco2e_per_kwh: 723,
        pue: 1.1,
        water_intensity_litres_per_kwh: 0.72
      },
      "northamerica-northeast1": {
        location: "Montreal",
        grid_intensity_gco2e_per_kwh: 28,
        pue: 1.1,
        water_intensity_litres_per_kwh: 0.2
      },
      "southamerica-east1": {
        location: "Sao Paulo",
        grid_intensity_gco2e_per_kwh: 74,
        pue: 1.1,
        water_intensity_litres_per_kwh: 0.35
      }
    },
    instances: {
      "n2-standard-2": {
        architecture: "x86_64",
        vcpus: 2,
        memory_gb: 8,
        power_watts: {
          idle: 6.8,
          max: 20.4
        },
        embodied_co2e_grams_per_month: 1041.7
      },
      "n2-standard-4": {
        architecture: "x86_64",
        vcpus: 4,
        memory_gb: 16,
        power_watts: {
          idle: 13.6,
          max: 40.8
        },
        embodied_co2e_grams_per_month: 2083.3
      },
      "n2-standard-8": {
        architecture: "x86_64",
        vcpus: 8,
        memory_gb: 32,
        power_watts: {
          idle: 27.2,
          max: 81.6
        },
        embodied_co2e_grams_per_month: 4166.7
      },
      "n2d-standard-2": {
        architecture: "x86_64",
        vcpus: 2,
        memory_gb: 8,
        power_watts: {
          idle: 6.5,
          max: 19.5
        },
        embodied_co2e_grams_per_month: 1041.7
      },
      "n2d-standard-4": {
        architecture: "x86_64",
        vcpus: 4,
        memory_gb: 16,
        power_watts: {
          idle: 13,
          max: 39
        },
        embodied_co2e_grams_per_month: 2083.3
      },
      "t2a-standard-1": {
        architecture: "arm64",
        vcpus: 1,
        memory_gb: 4,
        power_watts: {
          idle: 2.1,
          max: 6.6
        },
        embodied_co2e_grams_per_month: 416.7
      },
      "t2a-standard-2": {
        architecture: "arm64",
        vcpus: 2,
        memory_gb: 8,
        power_watts: {
          idle: 4.1,
          max: 13.2
        },
        embodied_co2e_grams_per_month: 833.3
      },
      "t2a-standard-4": {
        architecture: "arm64",
        vcpus: 4,
        memory_gb: 16,
        power_watts: {
          idle: 8.2,
          max: 26.4
        },
        embodied_co2e_grams_per_month: 1666.7
      },
      "t2a-standard-8": {
        architecture: "arm64",
        vcpus: 8,
        memory_gb: 32,
        power_watts: {
          idle: 16.4,
          max: 52.8
        },
        embodied_co2e_grams_per_month: 3333.3
      },
      "c2-standard-4": {
        architecture: "x86_64",
        vcpus: 4,
        memory_gb: 16,
        power_watts: {
          idle: 13,
          max: 44
        },
        embodied_co2e_grams_per_month: 2083.3
      },
      "c2-standard-8": {
        architecture: "x86_64",
        vcpus: 8,
        memory_gb: 32,
        power_watts: {
          idle: 26,
          max: 88
        },
        embodied_co2e_grams_per_month: 4166.7
      },
      "e2-standard-2": {
        architecture: "x86_64",
        vcpus: 2,
        memory_gb: 8,
        power_watts: {
          idle: 3.4,
          max: 10.2
        },
        embodied_co2e_grams_per_month: 1041.7
      },
      "e2-standard-4": {
        architecture: "x86_64",
        vcpus: 4,
        memory_gb: 16,
        power_watts: {
          idle: 6.8,
          max: 20.4
        },
        embodied_co2e_grams_per_month: 2083.3
      },
      "t2d-standard-1": {
        architecture: "x86_64",
        vcpus: 1,
        memory_gb: 4,
        power_watts: {
          idle: 1.7,
          max: 5.1
        },
        embodied_co2e_grams_per_month: 520.8
      },
      "t2d-standard-2": {
        architecture: "x86_64",
        vcpus: 2,
        memory_gb: 8,
        power_watts: {
          idle: 3.4,
          max: 10.2
        },
        embodied_co2e_grams_per_month: 1041.7
      }
    },
    pricing_usd_per_hour: {
      "us-central1": {
        "n2-standard-2": 0.097,
        "n2-standard-4": 0.194,
        "n2-standard-8": 0.388,
        "n2d-standard-2": 0.086,
        "n2d-standard-4": 0.172,
        "t2a-standard-1": 0.038,
        "t2a-standard-2": 0.076,
        "t2a-standard-4": 0.152,
        "t2a-standard-8": 0.304,
        "c2-standard-4": 0.2,
        "c2-standard-8": 0.4,
        "e2-standard-2": 0.067,
        "e2-standard-4": 0.134,
        "t2d-standard-1": 0.037,
        "t2d-standard-2": 0.074
      },
      "us-east1": {
        "n2-standard-2": 0.097,
        "n2-standard-4": 0.194,
        "n2-standard-8": 0.388,
        "n2d-standard-2": 0.086,
        "n2d-standard-4": 0.172,
        "t2a-standard-1": 0.038,
        "t2a-standard-2": 0.076,
        "t2a-standard-4": 0.152,
        "t2a-standard-8": 0.304,
        "c2-standard-4": 0.2,
        "c2-standard-8": 0.4,
        "e2-standard-2": 0.067,
        "e2-standard-4": 0.134,
        "t2d-standard-1": 0.037,
        "t2d-standard-2": 0.074
      },
      "us-east4": {
        "n2-standard-2": 0.104,
        "n2-standard-4": 0.208,
        "n2-standard-8": 0.416,
        "n2d-standard-2": 0.092,
        "n2d-standard-4": 0.185,
        "t2a-standard-1": 0.041,
        "t2a-standard-2": 0.082,
        "t2a-standard-4": 0.163,
        "t2a-standard-8": 0.326,
        "c2-standard-4": 0.214,
        "c2-standard-8": 0.428,
        "e2-standard-2": 0.072,
        "e2-standard-4": 0.144,
        "t2d-standard-1": 0.04,
        "t2d-standard-2": 0.079
      },
      "us-west1": {
        "n2-standard-2": 0.097,
        "n2-standard-4": 0.194,
        "n2-standard-8": 0.388,
        "n2d-standard-2": 0.086,
        "n2d-standard-4": 0.172,
        "t2a-standard-1": 0.038,
        "t2a-standard-2": 0.076,
        "t2a-standard-4": 0.152,
        "t2a-standard-8": 0.304,
        "c2-standard-4": 0.2,
        "c2-standard-8": 0.4,
        "e2-standard-2": 0.067,
        "e2-standard-4": 0.134,
        "t2d-standard-1": 0.037,
        "t2d-standard-2": 0.074
      },
      "europe-west1": {
        "n2-standard-2": 0.108,
        "n2-standard-4": 0.216,
        "n2-standard-8": 0.432,
        "n2d-standard-2": 0.096,
        "n2d-standard-4": 0.192,
        "t2a-standard-1": 0.042,
        "t2a-standard-2": 0.085,
        "t2a-standard-4": 0.169,
        "t2a-standard-8": 0.339,
        "c2-standard-4": 0.222,
        "c2-standard-8": 0.445,
        "e2-standard-2": 0.075,
        "e2-standard-4": 0.15,
        "t2d-standard-1": 0.044,
        "t2d-standard-2": 0.087
      },
      "europe-west2": {
        "n2-standard-2": 0.116,
        "n2-standard-4": 0.231,
        "n2-standard-8": 0.462,
        "n2d-standard-2": 0.103,
        "n2d-standard-4": 0.205,
        "t2a-standard-1": 0.045,
        "t2a-standard-2": 0.091,
        "t2a-standard-4": 0.181,
        "t2a-standard-8": 0.362,
        "c2-standard-4": 0.238,
        "c2-standard-8": 0.475,
        "e2-standard-2": 0.08,
        "e2-standard-4": 0.16,
        "t2d-standard-1": 0.047,
        "t2d-standard-2": 0.093
      },
      "europe-north1": {
        "n2-standard-2": 0.108,
        "n2-standard-4": 0.216,
        "n2-standard-8": 0.432,
        "n2d-standard-2": 0.096,
        "n2d-standard-4": 0.192,
        "t2a-standard-1": 0.042,
        "t2a-standard-2": 0.085,
        "t2a-standard-4": 0.169,
        "t2a-standard-8": 0.339,
        "c2-standard-4": 0.222,
        "c2-standard-8": 0.445,
        "e2-standard-2": 0.075,
        "e2-standard-4": 0.15,
        "t2d-standard-1": 0.044,
        "t2d-standard-2": 0.087
      },
      "asia-southeast1": {
        "n2-standard-2": 0.117,
        "n2-standard-4": 0.234,
        "n2-standard-8": 0.469,
        "n2d-standard-2": 0.104,
        "n2d-standard-4": 0.208,
        "t2a-standard-1": 0.046,
        "t2a-standard-2": 0.092,
        "t2a-standard-4": 0.184,
        "t2a-standard-8": 0.368,
        "c2-standard-4": 0.241,
        "c2-standard-8": 0.482,
        "e2-standard-2": 0.081,
        "e2-standard-4": 0.162,
        "t2d-standard-1": 0.048,
        "t2d-standard-2": 0.095
      },
      "asia-northeast1": {
        "n2-standard-2": 0.126,
        "n2-standard-4": 0.252,
        "n2-standard-8": 0.504,
        "n2d-standard-2": 0.112,
        "n2d-standard-4": 0.223,
        "t2a-standard-1": 0.049,
        "t2a-standard-2": 0.099,
        "t2a-standard-4": 0.197,
        "t2a-standard-8": 0.395,
        "c2-standard-4": 0.259,
        "c2-standard-8": 0.517,
        "e2-standard-2": 0.087,
        "e2-standard-4": 0.174,
        "t2d-standard-1": 0.051,
        "t2d-standard-2": 0.102
      },
      "asia-south1": {
        "n2-standard-2": 0.102,
        "n2-standard-4": 0.204,
        "n2-standard-8": 0.407,
        "n2d-standard-2": 0.091,
        "n2d-standard-4": 0.181,
        "t2a-standard-1": 0.04,
        "t2a-standard-2": 0.08,
        "t2a-standard-4": 0.159,
        "t2a-standard-8": 0.319,
        "c2-standard-4": 0.209,
        "c2-standard-8": 0.419,
        "e2-standard-2": 0.07,
        "e2-standard-4": 0.14,
        "t2d-standard-1": 0.039,
        "t2d-standard-2": 0.078
      },
      "northamerica-northeast1": {
        "n2-standard-2": 0.104,
        "n2-standard-4": 0.208,
        "n2-standard-8": 0.416,
        "n2d-standard-2": 0.092,
        "n2d-standard-4": 0.185,
        "t2a-standard-1": 0.041,
        "t2a-standard-2": 0.082,
        "t2a-standard-4": 0.163,
        "t2a-standard-8": 0.326,
        "c2-standard-4": 0.214,
        "c2-standard-8": 0.428,
        "e2-standard-2": 0.072,
        "e2-standard-4": 0.144,
        "t2d-standard-1": 0.04,
        "t2d-standard-2": 0.079
      },
      "southamerica-east1": {
        "n2-standard-2": 0.138,
        "n2-standard-4": 0.276,
        "n2-standard-8": 0.552,
        "n2d-standard-2": 0.123,
        "n2d-standard-4": 0.245,
        "t2a-standard-1": 0.054,
        "t2a-standard-2": 0.108,
        "t2a-standard-4": 0.216,
        "t2a-standard-8": 0.431,
        "c2-standard-4": 0.283,
        "c2-standard-8": 0.566,
        "e2-standard-2": 0.095,
        "e2-standard-4": 0.19,
        "t2d-standard-1": 0.053,
        "t2d-standard-2": 0.105
      }
    }
  }
};

// package.json
var package_default = {
  name: "greenops-cli",
  version: "0.5.2",
  description: "Carbon footprint linting for Terraform plans \u2014 AWS, Azure, and GCP. Analyses infrastructure changes for Scope 2, Scope 3, and water impact. Posts recommendations directly on GitHub PRs.",
  main: "dist/index.cjs",
  bin: {
    "greenops-cli": "dist/index.cjs"
  },
  type: "module",
  engines: {
    node: ">=20"
  },
  scripts: {
    test: "tsx --test ./*.test.ts ./formatters/*.test.ts",
    typecheck: "tsc --noEmit",
    build: 'esbuild cli.ts --bundle --platform=node --target=node20 --outfile=dist/index.cjs --format=cjs --banner:js="#!/usr/bin/env node"',
    prepack: "npm run build"
  },
  keywords: [
    "terraform",
    "carbon",
    "co2",
    "greenops",
    "cloud",
    "aws",
    "azure",
    "gcp",
    "multi-cloud",
    "sustainability",
    "devops",
    "ci",
    "github-actions",
    "infrastructure",
    "carbon-footprint",
    "green-cloud",
    "finops"
  ],
  author: "Grafikui Ltd",
  license: "MIT",
  repository: {
    type: "git",
    url: "https://github.com/omrdev1/greenops-cli.git"
  },
  homepage: "https://github.com/omrdev1/greenops-cli#readme",
  bugs: {
    url: "https://github.com/omrdev1/greenops-cli/issues"
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
var import_node_path = require("node:path");
var SUPPORTED_TYPES = {
  aws: ["aws_instance", "aws_db_instance"],
  azure: ["azurerm_linux_virtual_machine", "azurerm_windows_virtual_machine", "azurerm_virtual_machine"],
  gcp: ["google_compute_instance"]
};
var COMPUTE_RELEVANT_TYPES = [
  "aws_launch_template",
  "aws_autoscaling_group",
  "aws_ecs_service",
  "aws_eks_node_group",
  "aws_lambda_function",
  "azurerm_virtual_machine_scale_set",
  "azurerm_kubernetes_cluster",
  "azurerm_function_app",
  "google_compute_instance_template",
  "google_container_cluster",
  "google_cloudfunctions_function"
];
function detectProvider(resourceType) {
  if (resourceType.startsWith("aws_"))
    return "aws";
  if (resourceType.startsWith("azurerm_"))
    return "azure";
  if (resourceType.startsWith("google_"))
    return "gcp";
  return null;
}
function extractProviderRegions(plan) {
  const result2 = { aws: null, azure: null, gcp: null };
  const providerConfig = plan.configuration?.provider_config;
  if (!providerConfig)
    return result2;
  for (const [key, provider] of Object.entries(providerConfig)) {
    if (key === "aws" || key.startsWith("aws.")) {
      const alias = provider.expressions?.alias?.constant_value;
      if (alias && key !== "aws")
        continue;
      const region = provider.expressions?.region?.constant_value;
      if (region && !result2.aws)
        result2.aws = region;
    }
    if (key === "azurerm" || key.startsWith("azurerm.")) {
      const location = provider.expressions?.location?.constant_value;
      if (location && !result2.azure)
        result2.azure = location;
    }
    if (key === "google" || key.startsWith("google.")) {
      const region = provider.expressions?.region?.constant_value;
      if (region && !result2.gcp)
        result2.gcp = region;
    }
  }
  return result2;
}
function isKnownAfterApply(change, fieldPath) {
  if (!change)
    return true;
  if (change.after_unknown?.[fieldPath] === true)
    return true;
  if (change.after?.[fieldPath] === null || change.after?.[fieldPath] === void 0)
    return true;
  return false;
}
function resolveAwsRegion(change, providerRegion) {
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
  if (change?.after?.region && typeof change.after.region === "string")
    return change.after.region;
  if (change?.before?.region && typeof change.before.region === "string")
    return change.before.region;
  if (providerRegion)
    return providerRegion;
  return null;
}
function resolveAzureRegion(change, providerRegion) {
  const raw = change?.after?.location ?? change?.before?.location ?? providerRegion;
  if (!raw || typeof raw !== "string")
    return null;
  return raw.toLowerCase().replace(/\s+/g, "");
}
function resolveGcpRegion(change, providerRegion) {
  if (change?.after?.region && typeof change.after.region === "string")
    return change.after.region;
  if (change?.after?.zone && typeof change.after.zone === "string") {
    const zoneMatch = change.after.zone.match(/^([a-z]+-[a-z]+\d+)/);
    if (zoneMatch)
      return zoneMatch[1];
  }
  if (change?.before?.region && typeof change.before.region === "string")
    return change.before.region;
  if (providerRegion)
    return providerRegion;
  return null;
}
function extractAwsInstanceType(res, plannedValuesMap) {
  const isDb = res.type === "aws_db_instance";
  const typeField = isDb ? "instance_class" : "instance_type";
  if (isKnownAfterApply(res.change, typeField)) {
    const plannedType = plannedValuesMap.get(res.address)?.[typeField];
    if (typeof plannedType !== "string")
      return { instanceType: null, skipReason: "known_after_apply" };
    if (!res.change.after)
      res.change.after = {};
    res.change.after[typeField] = plannedType;
  }
  let instanceType = res.change?.after?.[typeField];
  if (typeof instanceType !== "string")
    return { instanceType: null, skipReason: "known_after_apply" };
  if (isDb && instanceType.startsWith("db.")) {
    instanceType = instanceType.replace(/^db\./, "");
    if (!instanceType.includes("."))
      return { instanceType: null, skipReason: "unsupported_instance" };
  }
  return { instanceType };
}
function extractAzureInstanceType(res) {
  const size = res.change?.after?.size ?? res.change?.before?.size;
  if (!size || typeof size !== "string")
    return { instanceType: null, skipReason: "known_after_apply" };
  return { instanceType: size };
}
function extractGcpInstanceType(res) {
  const machineType = res.change?.after?.machine_type ?? res.change?.before?.machine_type;
  if (!machineType || typeof machineType !== "string")
    return { instanceType: null, skipReason: "known_after_apply" };
  return { instanceType: machineType };
}
function extractResourceInputs(planFilePath) {
  const result2 = { resources: [], skipped: [], unsupportedTypes: [] };
  const resolvedPath = (0, import_node_path.isAbsolute)(planFilePath) ? planFilePath : (0, import_node_path.resolve)(process.cwd(), planFilePath);
  let raw;
  try {
    raw = (0, import_node_fs.readFileSync)(resolvedPath, "utf8");
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
  const providerRegions = extractProviderRegions(typedPlan);
  const plannedValuesMap = /* @__PURE__ */ new Map();
  for (const r of typedPlan.planned_values?.root_module?.resources ?? []) {
    if (r.address && r.values)
      plannedValuesMap.set(r.address, r.values);
  }
  const allSupportedTypes = Object.values(SUPPORTED_TYPES).flat();
  for (const rawRes of typedPlan.resource_changes) {
    const res = rawRes;
    const actions = res.change?.actions;
    if (!Array.isArray(actions) || !actions.includes("create") && !actions.includes("update")) {
      continue;
    }
    const provider = detectProvider(res.type);
    if (!allSupportedTypes.includes(res.type)) {
      if (COMPUTE_RELEVANT_TYPES.includes(res.type) && !result2.unsupportedTypes.includes(res.type)) {
        result2.unsupportedTypes.push(res.type);
      }
      continue;
    }
    if (!provider)
      continue;
    let instanceType = null;
    let skipReason;
    let region = null;
    if (provider === "aws") {
      const extracted2 = extractAwsInstanceType(res, plannedValuesMap);
      instanceType = extracted2.instanceType;
      skipReason = extracted2.skipReason;
      if (instanceType)
        region = resolveAwsRegion(res.change, providerRegions.aws);
    } else if (provider === "azure") {
      const extracted2 = extractAzureInstanceType(res);
      instanceType = extracted2.instanceType;
      skipReason = extracted2.skipReason;
      if (instanceType)
        region = resolveAzureRegion(res.change, providerRegions.azure);
    } else if (provider === "gcp") {
      const extracted2 = extractGcpInstanceType(res);
      instanceType = extracted2.instanceType;
      skipReason = extracted2.skipReason;
      if (instanceType)
        region = resolveGcpRegion(res.change, providerRegions.gcp);
    }
    if (!instanceType || skipReason) {
      result2.skipped.push({ resourceId: res.address, reason: skipReason ?? "known_after_apply" });
      continue;
    }
    if (!region) {
      result2.skipped.push({ resourceId: res.address, reason: "known_after_apply" });
      continue;
    }
    result2.resources.push({ resourceId: res.address, instanceType, region, provider });
  }
  return result2;
}

// engine.ts
var HOURS_PER_MONTH = 730;
var GRAMS_PER_KWH = 1e3;
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
function wattsToScope2Carbon(watts, hours, pue, gridIntensity) {
  return watts * pue * hours / GRAMS_PER_KWH * gridIntensity;
}
function wattsToWater(watts, hours, wue) {
  return watts * hours / GRAMS_PER_KWH * wue;
}
var ARM_UPGRADE_MAP = {
  aws: {
    t3: "t4g",
    t3a: "t4g",
    m5: "m6g",
    m5a: "m6g",
    c5: "c6g",
    c5a: "c6g",
    r5: "r6g",
    r5a: "r6g"
  },
  azure: {
    "Standard_D2s_v3": "Standard_D2ps_v5",
    "Standard_D4s_v3": "Standard_D4ps_v5",
    "Standard_D8s_v3": "Standard_D8ps_v5",
    "Standard_D2s_v4": "Standard_D2ps_v5",
    "Standard_D4s_v4": "Standard_D4ps_v5"
  },
  gcp: {
    n2: "t2a",
    n2d: "t2a",
    e2: "t2a"
  }
};
function getArmAlternative(instanceType, provider, ledger) {
  const providerLedger = ledger[provider];
  const map = ARM_UPGRADE_MAP[provider];
  if (provider === "azure") {
    const candidate2 = map[instanceType];
    return candidate2 && providerLedger.instances[candidate2] ? candidate2 : null;
  }
  const [family, size] = instanceType.split(".");
  if (!family || !size)
    return null;
  const armFamily = map[family];
  if (!armFamily)
    return null;
  const candidate = `${armFamily}.${size}`;
  return providerLedger.instances[candidate] ? candidate : null;
}
function getCleanerRegion(currentRegion, instanceType, provider, ledger) {
  const providerLedger = ledger[provider];
  const regions = Object.entries(providerLedger.regions).filter(([regionId]) => {
    if (regionId === currentRegion)
      return false;
    return !!providerLedger.pricing_usd_per_hour[regionId]?.[instanceType];
  }).sort(([, a], [, b]) => a.grid_intensity_gco2e_per_kwh - b.grid_intensity_gco2e_per_kwh);
  if (regions.length === 0)
    return null;
  const [cleanestRegionId, cleanestRegion] = regions[0];
  const currentIntensity = providerLedger.regions[currentRegion]?.grid_intensity_gco2e_per_kwh ?? Infinity;
  if (cleanestRegion.grid_intensity_gco2e_per_kwh >= currentIntensity * 0.9)
    return null;
  return cleanestRegionId;
}
function calculateBaseline(input, ledger = factors_default) {
  const provider = input.provider ?? "aws";
  const providerLedger = ledger[provider];
  const hours = input.hoursPerMonth ?? HOURS_PER_MONTH;
  const utilization = resolveUtilization(input, ledger);
  const zeroResult = (unsupportedReason, gridIntensity = 0, embodied = 0, waterIntensity = 0) => ({
    totalCo2eGramsPerMonth: 0,
    embodiedCo2eGramsPerMonth: 0,
    totalLifecycleCo2eGramsPerMonth: 0,
    waterLitresPerMonth: 0,
    totalCostUsdPerMonth: 0,
    confidence: "LOW_ASSUMED_DEFAULT",
    scope: "SCOPE_2_AND_3",
    unsupportedReason,
    assumptionsApplied: {
      utilizationApplied: utilization,
      gridIntensityApplied: gridIntensity,
      powerModelUsed: "LINEAR_INTERPOLATION",
      embodiedCo2ePerVcpuPerMonthApplied: embodied,
      waterIntensityLitresPerKwhApplied: waterIntensity
    }
  });
  const regionData = providerLedger.regions[input.region];
  if (!regionData) {
    return zeroResult(`Region "${input.region}" is not present in the ${provider.toUpperCase()} section of the Open GreenOps Methodology Ledger v${ledger.metadata.ledger_version}.`);
  }
  const instanceData = providerLedger.instances[input.instanceType];
  if (!instanceData) {
    return zeroResult(
      `Instance type "${input.instanceType}" is not present in the ${provider.toUpperCase()} section of the Open GreenOps Methodology Ledger v${ledger.metadata.ledger_version}.`,
      regionData.grid_intensity_gco2e_per_kwh,
      0,
      regionData.water_intensity_litres_per_kwh
    );
  }
  const pricePerHour = providerLedger.pricing_usd_per_hour[input.region]?.[input.instanceType];
  if (pricePerHour === void 0) {
    return zeroResult(
      `No pricing data for "${input.instanceType}" in "${input.region}" (${provider.toUpperCase()}).`,
      regionData.grid_intensity_gco2e_per_kwh,
      instanceData.embodied_co2e_grams_per_month,
      regionData.water_intensity_litres_per_kwh
    );
  }
  const powerModel = "LINEAR_INTERPOLATION";
  const effectiveWatts = linearInterpolationWatts(
    instanceData.power_watts.idle,
    instanceData.power_watts.max,
    utilization
  );
  const totalCo2eGramsPerMonth = wattsToScope2Carbon(
    effectiveWatts,
    hours,
    regionData.pue,
    regionData.grid_intensity_gco2e_per_kwh
  );
  const embodiedCo2eGramsPerMonth = instanceData.embodied_co2e_grams_per_month * (hours / HOURS_PER_MONTH);
  const waterLitresPerMonth = wattsToWater(effectiveWatts, hours, regionData.water_intensity_litres_per_kwh);
  const totalLifecycleCo2eGramsPerMonth = totalCo2eGramsPerMonth + embodiedCo2eGramsPerMonth;
  const totalCostUsdPerMonth = pricePerHour * hours;
  const confidence = input.avgUtilization !== void 0 ? "MEDIUM" : "HIGH";
  return {
    totalCo2eGramsPerMonth,
    embodiedCo2eGramsPerMonth,
    totalLifecycleCo2eGramsPerMonth,
    waterLitresPerMonth,
    totalCostUsdPerMonth,
    confidence,
    scope: "SCOPE_2_AND_3",
    assumptionsApplied: {
      utilizationApplied: utilization,
      gridIntensityApplied: regionData.grid_intensity_gco2e_per_kwh,
      powerModelUsed: powerModel,
      embodiedCo2ePerVcpuPerMonthApplied: instanceData.embodied_co2e_grams_per_month,
      waterIntensityLitresPerKwhApplied: regionData.water_intensity_litres_per_kwh
    }
  };
}
function generateRecommendation(input, baseline, ledger = factors_default) {
  if (baseline.confidence === "LOW_ASSUMED_DEFAULT")
    return null;
  const provider = input.provider ?? "aws";
  const providerLedger = ledger[provider];
  const candidates = [];
  const armAlternative = getArmAlternative(input.instanceType, provider, ledger);
  if (armAlternative) {
    const armEstimate = calculateBaseline({ ...input, instanceType: armAlternative }, ledger);
    if (armEstimate.confidence !== "LOW_ASSUMED_DEFAULT") {
      const co2Delta = armEstimate.totalCo2eGramsPerMonth - baseline.totalCo2eGramsPerMonth;
      const costDelta = armEstimate.totalCostUsdPerMonth - baseline.totalCostUsdPerMonth;
      const embodiedDelta = armEstimate.embodiedCo2eGramsPerMonth - baseline.embodiedCo2eGramsPerMonth;
      if (co2Delta < 0 && costDelta < 0) {
        const embodiedNote = embodiedDelta < 0 ? ` ARM also reduces embodied (Scope 3) carbon by ${Math.abs(Math.round(embodiedDelta))}g CO2e/month.` : "";
        candidates.push({
          suggestedInstanceType: armAlternative,
          co2eDeltaGramsPerMonth: co2Delta,
          costDeltaUsdPerMonth: costDelta,
          rationale: `Switching from ${input.instanceType} to ${armAlternative} (ARM) provides identical vCPU and memory at lower power draw, saving ${Math.abs(Math.round(co2Delta))}g CO2e/month and $${Math.abs(costDelta).toFixed(2)}/month.${embodiedNote}`
        });
      }
    }
  }
  const cleanerRegion = getCleanerRegion(input.region, input.instanceType, provider, ledger);
  if (cleanerRegion) {
    const regionEstimate = calculateBaseline({ ...input, region: cleanerRegion }, ledger);
    if (regionEstimate.confidence !== "LOW_ASSUMED_DEFAULT") {
      const co2Delta = regionEstimate.totalCo2eGramsPerMonth - baseline.totalCo2eGramsPerMonth;
      const costDelta = regionEstimate.totalCostUsdPerMonth - baseline.totalCostUsdPerMonth;
      const co2ReductionPct = baseline.totalCo2eGramsPerMonth > 0 ? Math.abs(co2Delta) / baseline.totalCo2eGramsPerMonth : 0;
      if (co2Delta < 0 && co2ReductionPct > 0.15) {
        const regionName = providerLedger.regions[cleanerRegion]?.location ?? cleanerRegion;
        const costNote = costDelta > 0 ? ` (note: cost increases by $${costDelta.toFixed(2)}/month)` : ` saving $${Math.abs(costDelta).toFixed(2)}/month`;
        const waterDelta = regionEstimate.waterLitresPerMonth - baseline.waterLitresPerMonth;
        const waterNote = waterDelta < -0.1 ? ` Water consumption also decreases by ${Math.abs(waterDelta).toFixed(1)}L/month.` : "";
        candidates.push({
          suggestedRegion: cleanerRegion,
          co2eDeltaGramsPerMonth: co2Delta,
          costDeltaUsdPerMonth: costDelta,
          rationale: `Moving ${input.instanceType} from ${input.region} to ${regionName} (${cleanerRegion}) reduces grid carbon intensity from ${providerLedger.regions[input.region]?.grid_intensity_gco2e_per_kwh}g to ${providerLedger.regions[cleanerRegion]?.grid_intensity_gco2e_per_kwh}g CO2e/kWh, saving ${Math.abs(Math.round(co2Delta))}g CO2e/month${costNote}.${waterNote}`
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
function analysePlan(resources, skipped, planFile2, ledger = factors_default, unsupportedTypes = []) {
  const analysedResources = resources.map((input) => {
    const baseline = calculateBaseline(input, ledger);
    const recommendation = generateRecommendation(input, baseline, ledger);
    return { input, baseline, recommendation };
  });
  const totals = analysedResources.reduce(
    (acc, { baseline, recommendation }) => {
      acc.currentCo2eGramsPerMonth += baseline.totalCo2eGramsPerMonth;
      acc.currentEmbodiedCo2eGramsPerMonth += baseline.embodiedCo2eGramsPerMonth;
      acc.currentLifecycleCo2eGramsPerMonth += baseline.totalLifecycleCo2eGramsPerMonth;
      acc.currentWaterLitresPerMonth += baseline.waterLitresPerMonth;
      acc.currentCostUsdPerMonth += baseline.totalCostUsdPerMonth;
      if (recommendation) {
        acc.potentialCo2eSavingGramsPerMonth += Math.abs(recommendation.co2eDeltaGramsPerMonth);
        acc.potentialCostSavingUsdPerMonth += Math.abs(recommendation.costDeltaUsdPerMonth);
      }
      return acc;
    },
    {
      currentCo2eGramsPerMonth: 0,
      currentEmbodiedCo2eGramsPerMonth: 0,
      currentLifecycleCo2eGramsPerMonth: 0,
      currentWaterLitresPerMonth: 0,
      currentCostUsdPerMonth: 0,
      potentialCo2eSavingGramsPerMonth: 0,
      potentialCostSavingUsdPerMonth: 0
    }
  );
  const providers = [...new Set(resources.map((r) => r.provider ?? "aws"))];
  return {
    analysedAt: (/* @__PURE__ */ new Date()).toISOString(),
    ledgerVersion: ledger.metadata.ledger_version,
    planFile: planFile2,
    providers: providers.length > 0 ? providers : ["aws"],
    resources: analysedResources,
    skipped,
    unsupportedTypes,
    totals
  };
}

// policy.ts
var import_node_fs2 = require("node:fs");
var import_node_path2 = require("node:path");
function parseMinimalYaml(content) {
  const result2 = {};
  const lines = content.split("\n");
  let currentSection = null;
  let currentObj = {};
  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, "").trimEnd();
    if (!line.trim())
      continue;
    const indent = line.match(/^(\s*)/)?.[1]?.length ?? 0;
    const trimmed = line.trim();
    if (indent === 0) {
      if (currentSection && Object.keys(currentObj).length > 0) {
        result2[currentSection] = { ...currentObj };
      }
      const colonIdx = trimmed.indexOf(":");
      if (colonIdx === -1)
        continue;
      const key = trimmed.slice(0, colonIdx).trim();
      const val = trimmed.slice(colonIdx + 1).trim();
      if (val === "" || val === null) {
        currentSection = key;
        currentObj = {};
      } else {
        currentSection = null;
        result2[key] = parseScalar(val);
      }
    } else {
      if (!currentSection)
        continue;
      const colonIdx = trimmed.indexOf(":");
      if (colonIdx === -1)
        continue;
      const key = trimmed.slice(0, colonIdx).trim();
      const val = trimmed.slice(colonIdx + 1).trim();
      if (val !== "") {
        currentObj[key] = parseScalar(val);
      }
    }
  }
  if (currentSection && Object.keys(currentObj).length > 0) {
    result2[currentSection] = { ...currentObj };
  }
  return result2;
}
function parseScalar(val) {
  if (val === "true")
    return true;
  if (val === "false")
    return false;
  if (val === "null" || val === "~")
    return null;
  const num = Number(val);
  if (!isNaN(num) && val !== "")
    return num;
  if (val.startsWith('"') && val.endsWith('"') || val.startsWith("'") && val.endsWith("'")) {
    return val.slice(1, -1);
  }
  return val;
}
function loadPolicy(repoRoot = process.cwd()) {
  const policyPath = (0, import_node_path2.resolve)(repoRoot, ".greenops.yml");
  if (!(0, import_node_fs2.existsSync)(policyPath))
    return null;
  let raw;
  try {
    raw = (0, import_node_fs2.readFileSync)(policyPath, "utf8");
  } catch (err) {
    throw new Error(`Failed to read .greenops.yml: ${err instanceof Error ? err.message : String(err)}`);
  }
  let parsed;
  try {
    parsed = parseMinimalYaml(raw);
  } catch (err) {
    throw new Error(`Failed to parse .greenops.yml: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (parsed.version !== void 0 && typeof parsed.version !== "number") {
    throw new Error(`.greenops.yml: "version" must be a number, got ${typeof parsed.version}`);
  }
  const policy = {
    version: typeof parsed.version === "number" ? parsed.version : 1,
    fail_on_violation: typeof parsed.fail_on_violation === "boolean" ? parsed.fail_on_violation : false
  };
  if (parsed.budgets && typeof parsed.budgets === "object") {
    const budgets = parsed.budgets;
    policy.budgets = {};
    const numericFields = [
      "max_pr_co2e_increase_kg",
      "max_pr_cost_increase_usd",
      "max_total_co2e_kg"
    ];
    for (const field of numericFields) {
      if (budgets[field] !== void 0) {
        if (typeof budgets[field] !== "number" || budgets[field] < 0) {
          throw new Error(`.greenops.yml: "budgets.${field}" must be a non-negative number`);
        }
        policy.budgets[field] = budgets[field];
      }
    }
  }
  return policy;
}
function evaluatePolicy(result2, policy) {
  if (!policy || !policy.budgets) {
    return { isCompliant: true, policy, violations: [], shouldBlock: false };
  }
  const violations = [];
  const { totals } = result2;
  const b = policy.budgets;
  if (b.max_pr_co2e_increase_kg !== void 0) {
    const actualKg = totals.currentCo2eGramsPerMonth / 1e3;
    if (actualKg > b.max_pr_co2e_increase_kg) {
      violations.push({
        constraint: "max_pr_co2e_increase_kg",
        actual: Math.round(actualKg * 100) / 100,
        limit: b.max_pr_co2e_increase_kg,
        unit: "kg CO2e/month",
        message: `This PR introduces ${actualKg.toFixed(2)}kg CO2e/month, exceeding the ${b.max_pr_co2e_increase_kg}kg limit defined in .greenops.yml.`
      });
    }
  }
  if (b.max_pr_cost_increase_usd !== void 0) {
    const actualUsd = totals.currentCostUsdPerMonth;
    if (actualUsd > b.max_pr_cost_increase_usd) {
      violations.push({
        constraint: "max_pr_cost_increase_usd",
        actual: Math.round(actualUsd * 100) / 100,
        limit: b.max_pr_cost_increase_usd,
        unit: "USD/month",
        message: `This PR introduces $${actualUsd.toFixed(2)}/month in infrastructure cost, exceeding the $${b.max_pr_cost_increase_usd} limit defined in .greenops.yml.`
      });
    }
  }
  if (b.max_total_co2e_kg !== void 0) {
    const actualKg = totals.currentCo2eGramsPerMonth / 1e3;
    if (actualKg > b.max_total_co2e_kg) {
      violations.push({
        constraint: "max_total_co2e_kg",
        actual: Math.round(actualKg * 100) / 100,
        limit: b.max_total_co2e_kg,
        unit: "kg CO2e/month",
        message: `Total analysed footprint is ${actualKg.toFixed(2)}kg CO2e/month, exceeding the ${b.max_total_co2e_kg}kg ceiling defined in .greenops.yml.`
      });
    }
  }
  const isCompliant = violations.length === 0;
  const shouldBlock = !isCompliant && (policy.fail_on_violation ?? false);
  return { isCompliant, policy, violations, shouldBlock };
}

// suggestions.ts
var GITHUB_API = "https://api.github.com";
var GREENOPS_MARKER = "<!-- greenops-suggestion -->";
async function githubRequest(method, path, token, body) {
  const response = await fetch(`${GITHUB_API}${path}`, {
    method,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "greenops-cli"
    },
    body: body ? JSON.stringify(body) : void 0
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`GitHub API ${method} ${path} \u2192 ${response.status}: ${text.slice(0, 200)}`);
  }
  if (response.status === 204)
    return {};
  return response.json();
}
async function getPRFiles(token, repoFullName, pullNumber) {
  return githubRequest(
    "GET",
    `/repos/${repoFullName}/pulls/${pullNumber}/files?per_page=100`,
    token
  );
}
function buildLineMap(patch) {
  const map = /* @__PURE__ */ new Map();
  let lineNum = 0;
  for (const line of patch.split("\n")) {
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      lineNum = parseInt(hunkMatch[1], 10) - 1;
      continue;
    }
    if (line.startsWith("-"))
      continue;
    lineNum++;
    const content = line.startsWith("+") ? line.slice(1) : line;
    map.set(content.trim(), lineNum);
  }
  return map;
}
function buildSuggestionBody(resourceId, recommendation, originalLine, attributeKey, newValue) {
  const indent = originalLine.match(/^(\s*)/)?.[1] ?? "";
  const suggestedLine = `${indent}${attributeKey} = "${newValue}"`;
  const changeDesc = recommendation.suggestedInstanceType ? `Switch \`${attributeKey}\` from \`${originalLine.trim().split('"')[1]}\` to \`${newValue}\`` : `Move \`${resourceId}\` to \`${newValue}\` for lower grid carbon intensity`;
  return [
    GREENOPS_MARKER,
    `### \u{1F331} GreenOps Recommendation \u2014 \`${resourceId}\``,
    "",
    changeDesc + ":",
    "",
    "```suggestion",
    suggestedLine,
    "```",
    "",
    `**Impact:** ${formatDelta(recommendation.co2eDeltaGramsPerMonth)} CO2e/month | ${formatCostDelta(recommendation.costDeltaUsdPerMonth)}/month`,
    "",
    `> ${recommendation.rationale}`
  ].join("\n");
}
function formatDelta(grams) {
  const kg = Math.abs(grams) / 1e3;
  const sign = grams < 0 ? "-" : "+";
  return kg >= 1 ? `${sign}${kg.toFixed(2)}kg` : `${sign}${Math.abs(Math.round(grams))}g`;
}
function formatCostDelta(usd) {
  const sign = usd < 0 ? "-" : "+";
  return `${sign}$${Math.abs(usd).toFixed(2)}`;
}
async function getExistingSuggestionComments(token, repoFullName, pullNumber) {
  const comments = await githubRequest(
    "GET",
    `/repos/${repoFullName}/pulls/${pullNumber}/comments?per_page=100`,
    token
  );
  return comments.filter((c) => c.body.includes(GREENOPS_MARKER));
}
async function postSuggestions(result2, ctx) {
  const output = { posted: 0, updated: 0, skipped: 0, warnings: [] };
  const resourcesWithRecs = result2.resources.filter((r) => r.recommendation !== null);
  if (resourcesWithRecs.length === 0)
    return output;
  let prFiles;
  let existingComments;
  try {
    [prFiles, existingComments] = await Promise.all([
      getPRFiles(ctx.token, ctx.repoFullName, ctx.pullNumber),
      getExistingSuggestionComments(ctx.token, ctx.repoFullName, ctx.pullNumber)
    ]);
  } catch (err) {
    output.warnings.push(`Could not fetch PR data: ${err instanceof Error ? err.message : String(err)}`);
    return output;
  }
  const tfFiles = prFiles.filter((f) => f.filename.endsWith(".tf") && f.patch);
  for (const { input, recommendation } of resourcesWithRecs) {
    if (!recommendation)
      continue;
    const provider = input.provider ?? "aws";
    const isDb = provider === "aws" && (input.resourceId.includes("aws_db_instance") || input.instanceType.startsWith("db."));
    const attributeKey = provider === "azure" ? "size" : provider === "gcp" ? "machine_type" : isDb ? "instance_class" : "instance_type";
    const currentValue = isDb ? `db.${input.instanceType}` : input.instanceType;
    const newValue = recommendation.suggestedInstanceType ? isDb ? `db.${recommendation.suggestedInstanceType}` : recommendation.suggestedInstanceType : input.instanceType;
    if (!recommendation.suggestedInstanceType) {
      output.skipped++;
      output.warnings.push(
        `[${input.resourceId}] Region-shift recommendation cannot be expressed as a single-line suggestion. See the GreenOps PR comment for details.`
      );
      continue;
    }
    const searchPattern = `${attributeKey} = "${currentValue}"`;
    let matched = false;
    for (const file of tfFiles) {
      if (!file.patch)
        continue;
      const lineMap = buildLineMap(file.patch);
      const lineNumber = lineMap.get(searchPattern);
      if (!lineNumber)
        continue;
      const originalLine = `  ${attributeKey} = "${currentValue}"`;
      const body = buildSuggestionBody(
        input.resourceId,
        recommendation,
        originalLine,
        attributeKey,
        newValue
      );
      const existing = existingComments.find(
        (c) => c.path === file.filename && c.line === lineNumber
      );
      try {
        if (existing) {
          await githubRequest(
            "PATCH",
            `/repos/${ctx.repoFullName}/pulls/comments/${existing.id}`,
            ctx.token,
            { body }
          );
          output.updated++;
        } else {
          await githubRequest(
            "POST",
            `/repos/${ctx.repoFullName}/pulls/${ctx.pullNumber}/comments`,
            ctx.token,
            {
              body,
              commit_id: ctx.commitSha,
              path: file.filename,
              line: lineNumber,
              side: "RIGHT"
            }
          );
          output.posted++;
        }
        matched = true;
        break;
      } catch (err) {
        output.warnings.push(
          `[${input.resourceId}] Failed to post suggestion on ${file.filename}:${lineNumber}: ${err instanceof Error ? err.message : String(err)}`
        );
        matched = true;
        output.skipped++;
        break;
      }
    }
    if (!matched) {
      output.skipped++;
      output.warnings.push(
        `[${input.resourceId}] Could not locate \`${searchPattern}\` in PR diff. Suggestion not posted \u2014 resource may be in a file not modified in this PR.`
      );
    }
  }
  return output;
}

// formatters/util.ts
function formatDelta2(grams) {
  const sign = grams < 0 ? "-" : "+";
  const kg = Math.abs(grams) / 1e3;
  return `${sign}${kg.toFixed(2)}kg`;
}
function formatCostDelta2(usd) {
  const sign = usd < 0 ? "-" : "+";
  return `${sign}$${Math.abs(usd).toFixed(2)}`;
}
function formatGrams(grams) {
  return `${(grams / 1e3).toFixed(2)}kg`;
}

// formatters/markdown.ts
function formatWater(litres) {
  if (litres >= 1e3)
    return `${(litres / 1e3).toFixed(2)}m\xB3`;
  return `${litres.toFixed(1)}L`;
}
function formatMarkdown(result2, options = {}) {
  const METHODOLOGY_URL = options.repositoryUrl || "https://github.com/omrdev1/greenops-cli/blob/main/METHODOLOGY.md";
  const analysedForCount = result2.resources.filter((r) => r.baseline.confidence !== "LOW_ASSUMED_DEFAULT");
  const recsCount = analysedForCount.filter((r) => r.recommendation).length;
  let out = `## \u{1F331} GreenOps Infrastructure Impact

`;
  const scope2 = formatGrams(result2.totals.currentCo2eGramsPerMonth);
  const scope3 = formatGrams(result2.totals.currentEmbodiedCo2eGramsPerMonth);
  const lifecycle = formatGrams(result2.totals.currentLifecycleCo2eGramsPerMonth);
  const water = formatWater(result2.totals.currentWaterLitresPerMonth);
  const cost = result2.totals.currentCostUsdPerMonth.toFixed(2);
  out += `> | Metric | Monthly Total |
`;
  out += `> |---|---|
`;
  out += `> | \u{1F50B} Scope 2 \u2014 Operational CO2e | **${scope2}** |
`;
  out += `> | \u{1F3ED} Scope 3 \u2014 Embodied CO2e | **${scope3}** |
`;
  out += `> | \u{1F30D} Total Lifecycle CO2e | **${lifecycle}** |
`;
  out += `> | \u{1F4A7} Water Consumption | **${water}** |
`;
  out += `> | \u{1F4B0} Infrastructure Cost | **$${cost}/month** |

`;
  if (recsCount > 0) {
    const pct = result2.totals.currentCo2eGramsPerMonth > 0 ? (result2.totals.potentialCo2eSavingGramsPerMonth / result2.totals.currentCo2eGramsPerMonth * 100).toFixed(1) : "0.0";
    out += `> **Potential Scope 2 Savings:** -${formatGrams(result2.totals.potentialCo2eSavingGramsPerMonth)} CO2e/month (${pct}%) | -$${result2.totals.potentialCostSavingUsdPerMonth.toFixed(2)}/month
`;
    out += `> \u{1F4A1} Found **${recsCount}** optimization ${recsCount === 1 ? "recommendation" : "recommendations"}.

`;
  } else {
    out += `> \u2705 **Already optimally configured.** No upgrades recommended.

`;
  }
  const analysed = result2.resources.filter((r) => r.baseline.confidence !== "LOW_ASSUMED_DEFAULT");
  const unsupportedResources = result2.resources.filter((r) => r.baseline.confidence === "LOW_ASSUMED_DEFAULT");
  out += `### Resource Breakdown

`;
  out += `| Resource | Type | Region | Scope 2 CO2e | Scope 3 CO2e | Water | Cost/mo | Action |
`;
  out += `|---|---|---|---|---|---|---|---|
`;
  for (const r of analysed) {
    const action = r.recommendation ? `\u{1F4A1} [View Recommendation](#recommendations)` : `\u2705 Optimal`;
    out += `| \`${r.input.resourceId}\` | \`${r.input.instanceType}\` | \`${r.input.region}\` | ${formatGrams(r.baseline.totalCo2eGramsPerMonth)} | ${formatGrams(r.baseline.embodiedCo2eGramsPerMonth)} | ${formatWater(r.baseline.waterLitresPerMonth)} | ${r.baseline.totalCostUsdPerMonth.toFixed(2)} | ${action} |
`;
  }
  out += `
`;
  const totalSkipped = result2.skipped.length + unsupportedResources.length;
  if (totalSkipped > 0) {
    out += `<details><summary>\u26A0\uFE0F <b>${totalSkipped} Skipped Resource${totalSkipped !== 1 ? "s" : ""}</b></summary>

`;
    out += `The following resources were excluded from analysis. The actual footprint may be higher.

`;
    out += `| Resource | Instance | Reason |
|---|---|---|
`;
    for (const s of result2.skipped) {
      out += `| \`${s.resourceId}\` | \u2014 | \`${s.reason}\` |
`;
    }
    for (const r of unsupportedResources) {
      const reason = r.baseline.unsupportedReason ?? "Instance type not in ledger";
      out += `| \`${r.input.resourceId}\` | \`${r.input.instanceType}\` | ${reason} |
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
        out += `- **Scope 2 Impact:** ${formatDelta2(r.recommendation.co2eDeltaGramsPerMonth)} CO2e/month | ${formatCostDelta2(r.recommendation.costDeltaUsdPerMonth)}/month
`;
        out += `- **Rationale:** ${r.recommendation.rationale}

`;
      }
    }
  }
  if (result2.unsupportedTypes.length > 0) {
    const typeList = result2.unsupportedTypes.map((t) => `\`${t}\``).join(", ");
    out += `> \u26A0\uFE0F **Coverage note:** The following compute-relevant types were detected but are not yet supported: ${typeList}. Their footprint is not reflected above.

`;
  }
  out += `---
`;
  out += `*Emissions calculated using the [Open GreenOps Methodology Ledger v${result2.ledgerVersion}](${METHODOLOGY_URL}). `;
  out += `Scope 2 (operational) and Scope 3 (embodied) emissions tracked. `;
  out += `Water consumption estimated from provider sustainability reports (AWS 2023, Microsoft 2023, Google 2023). `;
  out += `Math is MIT-licensed and auditable. Analysed at ${result2.analysedAt}.*
`;
  if (options.showUpgradePrompt) {
    out += `
> \u{1F3E2} **GreenOps Dashboard** \u2014 aggregate carbon data across all your repositories, set team budgets, and export ESG reports. [Join the waitlist](https://greenops-cli.dev) \xB7 Coming soon.
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
function formatWater2(litres) {
  if (litres >= 1e3)
    return `${(litres / 1e3).toFixed(1)}m\xB3`;
  return `${litres.toFixed(1)}L`;
}
function formatTable(result2) {
  let out = `
\x1B[1m\u{1F331} GreenOps Infrastructure Impact\x1B[0m

`;
  if (result2.resources.length === 0 && result2.skipped.length === 0) {
    return out + `No compatible infrastructure detected.
`;
  }
  out += `\u250C${"\u2500".repeat(38)}\u252C${"\u2500".repeat(13)}\u252C${"\u2500".repeat(13)}\u252C${"\u2500".repeat(11)}\u252C${"\u2500".repeat(11)}\u252C${"\u2500".repeat(9)}\u252C${"\u2500".repeat(13)}\u2510
`;
  out += `\u2502 ${truncate("Resource", 36)} \u2502 ${truncate("Instance", 11)} \u2502 ${truncate("Region", 11)} \u2502 ${truncate("Scope 2", 9)} \u2502 ${truncate("Scope 3", 9)} \u2502 ${truncate("Water", 7)} \u2502 ${truncate("Action", 11)} \u2502
`;
  out += `\u251C${"\u2500".repeat(38)}\u253C${"\u2500".repeat(13)}\u253C${"\u2500".repeat(13)}\u253C${"\u2500".repeat(11)}\u253C${"\u2500".repeat(11)}\u253C${"\u2500".repeat(9)}\u253C${"\u2500".repeat(13)}\u2524
`;
  const analysed = result2.resources.filter((r) => r.baseline.confidence !== "LOW_ASSUMED_DEFAULT");
  const unsupportedResources = result2.resources.filter((r) => r.baseline.confidence === "LOW_ASSUMED_DEFAULT");
  for (const r of analysed) {
    const scope2 = formatGrams(r.baseline.totalCo2eGramsPerMonth);
    const scope3 = formatGrams(r.baseline.embodiedCo2eGramsPerMonth);
    const water = formatWater2(r.baseline.waterLitresPerMonth);
    const action = r.recommendation ? `\x1B[33mUPGRADE\x1B[0m` : `\x1B[32mOK\x1B[0m`;
    out += `\u2502 ${truncate(r.input.resourceId, 36)} \u2502 ${truncate(r.input.instanceType, 11)} \u2502 ${truncate(r.input.region, 11)} \u2502 ${truncate(scope2, 9)} \u2502 ${truncate(scope3, 9)} \u2502 ${truncate(water, 7)} \u2502 ${truncate(action, 11)} \u2502
`;
  }
  for (const s of result2.skipped) {
    out += `\u2502 \x1B[90m${truncate(s.resourceId, 36)}\x1B[0m \u2502 \x1B[90m${truncate("---", 11)}\x1B[0m \u2502 \x1B[90m${truncate("---", 11)}\x1B[0m \u2502 \x1B[90m${truncate("---", 9)}\x1B[0m \u2502 \x1B[90m${truncate("---", 9)}\x1B[0m \u2502 \x1B[90m${truncate("---", 7)}\x1B[0m \u2502 \x1B[33m${truncate("\u26A0 SKIPPED", 11)}\x1B[0m \u2502
`;
  }
  for (const r of unsupportedResources) {
    out += `\u2502 \x1B[90m${truncate(r.input.resourceId, 36)}\x1B[0m \u2502 \x1B[90m${truncate(r.input.instanceType, 11)}\x1B[0m \u2502 \x1B[90m${truncate(r.input.region, 11)}\x1B[0m \u2502 \x1B[90m${truncate("---", 9)}\x1B[0m \u2502 \x1B[90m${truncate("---", 9)}\x1B[0m \u2502 \x1B[90m${truncate("---", 7)}\x1B[0m \u2502 \x1B[33m${truncate("\u26A0 UNKNOWN", 11)}\x1B[0m \u2502
`;
  }
  out += `\u2514${"\u2500".repeat(38)}\u2534${"\u2500".repeat(13)}\u2534${"\u2500".repeat(13)}\u2534${"\u2500".repeat(11)}\u2534${"\u2500".repeat(11)}\u2534${"\u2500".repeat(9)}\u2534${"\u2500".repeat(13)}\u2518

`;
  out += `Scope 2: ${formatGrams(result2.totals.currentCo2eGramsPerMonth)} | Scope 3: ${formatGrams(result2.totals.currentEmbodiedCo2eGramsPerMonth)} | Lifecycle: ${formatGrams(result2.totals.currentLifecycleCo2eGramsPerMonth)}
`;
  out += `Water: ${formatWater2(result2.totals.currentWaterLitresPerMonth)} | Cost: $${result2.totals.currentCostUsdPerMonth.toFixed(2)}/month
`;
  if (result2.totals.potentialCo2eSavingGramsPerMonth > 0) {
    out += `\x1B[32mScope 2 Savings: ${formatDelta2(-result2.totals.potentialCo2eSavingGramsPerMonth)} | ${formatCostDelta2(-result2.totals.potentialCostSavingUsdPerMonth)}\x1B[0m
`;
  }
  const totalSkipped = result2.skipped.length + unsupportedResources.length;
  if (totalSkipped > 0) {
    const skippedNote = result2.skipped.length > 0 ? `${result2.skipped.length} unresolvable at plan time` : "";
    const unknownNote = unsupportedResources.length > 0 ? `${unsupportedResources.length} instance type(s) not yet in ledger` : "";
    const parts = [skippedNote, unknownNote].filter(Boolean).join(", ");
    out += `
\x1B[90mNote: ${parts}. Actual footprint may be higher.\x1B[0m
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
    "show-upgrade-prompt": { type: "string", default: "true" },
    // Policy + suggestions flags (used by GitHub Action)
    "github-token": { type: "string" },
    "repo": { type: "string" },
    "pr-number": { type: "string" },
    "commit-sha": { type: "string" },
    "post-suggestions": { type: "boolean", default: false }
  }
});
if (values.version) {
  console.log(package_default.version);
  process.exit(0);
}
if (values.help) {
  console.log([
    `GreenOps CLI v${package_default.version}`,
    ``,
    `Usage:`,
    `  greenops-cli diff <plan.json> [options]`,
    `  greenops-cli --coverage [--format json]`,
    `  greenops-cli --version`,
    ``,
    `Options:`,
    `  --format          Output format: markdown (default), table, json`,
    `  --coverage        List supported regions and instance types`,
    `  --github-token    GitHub token for posting suggestion comments`,
    `  --repo            Repository full name (e.g. owner/repo)`,
    `  --pr-number       Pull request number`,
    `  --commit-sha      Head commit SHA for suggestion anchoring`,
    `  --post-suggestions  Post inline Terraform suggestion comments on the PR`,
    `  --show-upgrade-prompt  Show dashboard upsell (true/false, default: true)`,
    `  --version         Print version and exit`,
    `  --help            Print this help and exit`
  ].join("\n"));
  process.exit(0);
}
if (values.coverage) {
  const rawFs = factors_default;
  const awsRegions = Object.keys(rawFs.aws.regions);
  const azureRegions = Object.keys(rawFs.azure.regions);
  const gcpRegions = Object.keys(rawFs.gcp.regions);
  const awsInstances = Object.keys(rawFs.aws.instances);
  const azureInstances = Object.keys(rawFs.azure.instances);
  const gcpInstances = Object.keys(rawFs.gcp.instances);
  if (values.format === "json") {
    console.log(JSON.stringify({
      ledgerVersion: rawFs.metadata.ledger_version,
      providers: {
        aws: { regions: awsRegions, instances: awsInstances },
        azure: { regions: azureRegions, instances: azureInstances },
        gcp: { regions: gcpRegions, instances: gcpInstances }
      }
    }, null, 2));
  } else {
    console.log(`GreenOps Methodology Ledger v${rawFs.metadata.ledger_version}`);
    console.log(`AWS:   ${awsRegions.length} regions | ${awsInstances.length} instances`);
    console.log(`Azure: ${azureRegions.length} regions | ${azureInstances.length} instances`);
    console.log(`GCP:   ${gcpRegions.length} regions | ${gcpInstances.length} instances`);
  }
  process.exit(0);
}
var command = positionals[0];
var planFile = positionals[1];
if (command !== "diff" || !planFile) {
  console.error("Error: Missing 'diff' command or plan file parameter. Run --help for usage.");
  process.exit(1);
}
var extracted = extractResourceInputs(planFile);
if (extracted.error) {
  console.error(`Extraction Error: ${extracted.error}`);
  process.exit(1);
}
var result = analysePlan(extracted.resources, extracted.skipped, planFile, void 0, extracted.unsupportedTypes);
var showUpgradePrompt = values["show-upgrade-prompt"] === "true";
var policyExitCode = 0;
try {
  const policy = loadPolicy(process.cwd());
  if (policy) {
    const evaluation = evaluatePolicy(result, policy);
    if (!evaluation.isCompliant) {
      const violationLines = evaluation.violations.map(
        (v) => `\u26D4 Policy violation [${v.constraint}]: ${v.message}`
      ).join("\n");
      if (values.format === "json") {
        process.stderr.write(`
${violationLines}
`);
      } else {
        process.stdout.write(`
${violationLines}
`);
      }
      if (evaluation.shouldBlock) {
        policyExitCode = 1;
      }
    }
  }
} catch (err) {
  process.stderr.write(`[WARN] .greenops.yml parse error: ${err instanceof Error ? err.message : String(err)}
`);
}
if (values.format === "table") {
  console.log(formatTable(result));
} else if (values.format === "json") {
  console.log(formatJson(result));
} else {
  console.log(formatMarkdown(result, { showUpgradePrompt }));
}
if (values["post-suggestions"]) {
  const token = values["github-token"];
  const repo = values["repo"];
  const prNumber = values["pr-number"];
  const commitSha = values["commit-sha"];
  if (!token || !repo || !prNumber || !commitSha) {
    process.stderr.write(
      "[WARN] --post-suggestions requires --github-token, --repo, --pr-number, and --commit-sha. Skipping.\n"
    );
  } else {
    postSuggestions(result, {
      token,
      repoFullName: repo,
      pullNumber: parseInt(prNumber, 10),
      commitSha,
      planFilePath: planFile
    }).then((suggestionResult) => {
      if (suggestionResult.posted > 0 || suggestionResult.updated > 0) {
        process.stderr.write(
          `[GreenOps] Suggestions: ${suggestionResult.posted} posted, ${suggestionResult.updated} updated, ${suggestionResult.skipped} skipped
`
        );
      }
      for (const warn of suggestionResult.warnings) {
        process.stderr.write(`[WARN] ${warn}
`);
      }
    }).catch((err) => {
      process.stderr.write(
        `[WARN] GreenOps suggestion engine error: ${err instanceof Error ? err.message : String(err)}. Continuing.
`
      );
    });
  }
}
process.exit(policyExitCode);
