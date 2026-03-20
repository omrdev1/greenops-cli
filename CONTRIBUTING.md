# Contributing to GreenOps

## Adding New Instances
1. Find the TDP bounds (idle and max watts) in the [Cloud Carbon Footprint coefficients](https://www.cloudcarbonfootprint.org/docs/methodology).
2. Add the instance mapping to `factors.json`. 
3. Verify the math by adding a test case in `engine.test.ts`.

## Adding a New AWS Region
1. Find the Grid Intensity averages from Electricity Maps datasets.
2. Add the region structure and pricing matrix to `factors.json`.
3. Run `npm run build && node dist/index.cjs --coverage` to confirm the region appears in the supported matrix.

## Running Tests Locally
1. Clone the repository. You need Node 20 installed.
2. Run `npm ci`.
3. Run `npm test` to execute the test suite via the Node native test runner.
