# Security Declarations

GreenOps enforces strict architectural boundaries. The core system operates fully offline, with an optional orchestration layer for dashboard aggregation.

## 1. The Core CLI Binary (Zero Network)
The `greenops-cli` binary (`dist/index.cjs`) is completely stateless. 
- It reads `plan.json` directly from the local filesystem.
- It makes **zero outbound network calls**.
- It contains **zero telemetry or analytics code**.

## 2. The Optional Action Upload
The GitHub Action (`action.yml`) provides an **opt-in telemetry step** to push footprint metrics to the GreenOps Dashboard via a transparent `curl` command.
- This step lives entirely in the shell wrapper, keeping the CLI binary isolated.
- It executes **only if an `api-key` is provided** as an Action input.
- If no key is provided, the Action makes no outbound calls. The security posture remains zero-network.

**Vulnerability Reporting:**
Please direct security disclosures to `security@greenops-cli.dev`.
