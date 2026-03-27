import { PlanAnalysisResult } from '../types.js';

export interface JsonEnvelope {
  schemaVersion: string;
  result: PlanAnalysisResult;
}

export function formatJson(result: PlanAnalysisResult): string {
  const envelope: JsonEnvelope = {
    // schemaVersion tracks the ledger version so downstream consumers
    // can version-gate parsing logic as the methodology evolves.
    schemaVersion: result.ledgerVersion,
    result
  };
  return JSON.stringify(envelope);
}
