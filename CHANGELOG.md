# Changelog

All notable changes to this project are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.13.1] - 2026-06-26

### Added
- Azure GPU coverage completed: `Standard_NC64as_T4_v3` (4x NVIDIA T4) added to the ledger, `eastus` only, Scope 2 only. Completes the `NCasT4_v3` family alongside the single-GPU `NC4as`/`NC8as`/`NC16as_T4_v3` sizes added in v0.13.0.

## [0.13.0] - 2026-06-23

### Added
- Azure GPU instance support: `Standard_NC4as_T4_v3`, `Standard_NC8as_T4_v3`, `Standard_NC16as_T4_v3` (NVIDIA T4, Scope 2 only, `eastus` only).

## [0.12.0] - 2026-06-23

### Added
- Dedicated "AI Infrastructure Carbon Impact" section in PR comments, surfacing combined GPU/managed-AI Scope 2 carbon and cost ahead of the general resource table.

### Fixed
- Stale GPU/AI coverage claims in `METHODOLOGY.md` and `README.md` corrected to match shipped coverage.

## [0.11.0] - 2026-06-21

### Added
- Managed AI service detection: AWS SageMaker endpoint configurations and GCP Vertex AI Workbench (NVIDIA T4 only), Scope 2 only.

## [0.10.0] - 2026-06-21

### Added
- GPU instance support: AWS `g5.xlarge`, `p4d.24xlarge`, `p5.48xlarge` (Scope 2 only, real NVIDIA TDP-based power draw).

## [0.9.1] - 2026-06-21

### Fixed
- Dashboard upgrade-prompt link pointed at the production domain.

## [0.9.0] - 2026-06-21

### Added
- Kubernetes node group support: EKS, AKS, and GKE node groups resolve to their underlying instance types, with node count multiplying output.

### Fixed
- `.gitignore` was silently excluding committed test fixtures.

## [0.8.3] - 2026-05-20

### Fixed
- Inline-suggestions version reference in README.

## [0.8.2] - 2026-05-20

### Added
- AWS `t2` instance family (`t2.micro`, `t2.small`, `t2.medium`, `t2.large`) across all 14 supported regions.

## [0.8.1] - 2026-05-19

### Changed
- README updated to reflect Lambda/serverless as estimated (previously listed unsupported).

## [0.8.0] - 2026-05-18

### Added
- Serverless support: `aws_lambda_function`, `azurerm_function_app`, `google_cloud_run_service`.

## [0.7.1] - 2026-05-04

### Fixed
- Ingest URL updated to `getgreenops.com`.
- `.npmignore` excluded local worktree files from the published package.

## [0.7.0] - 2026-05-03

### Added
- Memory power draw included in Scope 2 calculations (CPU + memory watts, per CCF standard).
- AWS `c5.4xlarge`, `r5.2xlarge`, `r5.4xlarge` added to the ledger.

### Fixed
- Ingest payload shape corrected to match the dashboard API.
- Dead waitlist link replaced with a link to GitHub Discussions.
- Telemetry ingest URL pointed at the dashboard's production domain.

## [0.6.0] - 2026-03-28

### Added
- Scope 3 lifecycle CO2e policy checks.
- Suggestion-comment pagination.
- Address-based resource targeting.
- 403 error hints for GitHub token permission issues.

## [0.5.4] - 2026-03-28

### Fixed
- `dist/index.cjs` rebuilt to match v0.5.3 source.

## [0.5.3] - 2026-03-28

### Added
- Wider table-formatter columns; Azure and GCP end-to-end test fixtures for all three providers.

## [0.5.2] - 2026-03-28

### Fixed
- Unsupported-instance visibility in output.
- Suggestion generation made provider-aware.
- Water usage effectiveness (WUE) citation corrected.

## [0.5.1] - 2026-03-28

### Fixed
- npm package rebuilt after v0.5.0 partially registered; upgrade scripts excluded from the published tarball.

## [0.5.0] - 2026-03-28

### Added
- Multi-cloud support: AWS, Azure, and GCP in a single ledger.

## [0.4.0] - 2026-03-28

### Added
- Scope 3 embodied carbon and water consumption tracking.
- Policy engine and PR suggestion comments.
- 14-region ledger.
- Native binary build.

## [0.2.2] - 2026-03-27

### Added
- MIT license file.
- CODEOWNERS, PR template, and issue templates.

### Changed
- Package slimmed to 9 files / 13kb via `.npmignore`.
- README quickstart corrected to a real AWS-credentials pattern.

## [0.2.1] - 2026-03-25

### Added
- Full test suite, input validation, type safety pass.

### Fixed
- Division-by-zero guard in the calculation engine and extractor.
- API key masking, version sync, security documentation.

## [0.2.0] - 2026-03-20

Initial release.
