import type { CheckLevel, CheckSpec } from "../config/types.js";

export type CheckStatus = "pass" | "fail" | "unknown";

export interface ValidationResult {
  ruleId: string;
  level: CheckLevel;
  type: CheckSpec["type"];
  status: CheckStatus;
  path?: string;
  actual: string | boolean | null;
  expected: string | boolean;
  reason: string;
}

export interface ValidationReport {
  results: ValidationResult[];
  profileWarnings?: string[];
}
