import { PlanAnalysisResult } from '../types.js';

export interface JsonEnvelope {
  schemaVersion: string;
  result: PlanAnalysisResult;
}

export function formatJson(result: PlanAnalysisResult): string {
  const envelope: JsonEnvelope = {
    schemaVersion: "1.0.0",
    result
  };
  return JSON.stringify(envelope);
}
