import type { ApplicationFields, VerificationResponse } from '@/types';

export interface FieldAssertion {
  field: string;
  status: 'pass' | 'flag' | 'unable_to_verify';
  min_confidence?: number;
  note_contains?: string;
}

export interface EvalCase {
  id: string;
  description: string;
  fields: ApplicationFields;
  imageFile: string; // relative to __tests__/fixtures/
  assertions: {
    overall_status?: 'pass' | 'flag_for_review';
    fields?: FieldAssertion[];
    compliance?: Partial<{
      government_warning_present: boolean;
      government_warning_verbatim: boolean;
      government_warning_caps_bold: boolean;
      abv_format_compliant: boolean;
    }>;
  };
}

export interface EvalCaseResult {
  caseId: string;
  description: string;
  passed: boolean;
  failures: string[];
  calibrationIssues: string[];
  regressionDiffs: string[];
  response: VerificationResponse;
  durationMs: number;
}
