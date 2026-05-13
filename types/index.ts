// bottler_name and bottler_address are separate form inputs
// but verified as a single combined requirement per 27 CFR § 5.63
// AI returns one FieldVerificationResult with field: 'bottler_name_address'
// app_value = `${bottler_name}, ${bottler_address}`

export interface ApplicationFields {
  beverage_type: 'distilled_spirits' | 'wine' | 'malt_beverage';
  is_import: boolean;
  brand_name: string;
  class_type: string;
  abv: string;
  net_contents: string;
  bottler_name: string;
  bottler_address: string;
  country_of_origin?: string; // required when is_import = true
}

export interface FieldVerificationResult {
  field: string;
  status: 'pass' | 'flag' | 'unable_to_verify';
  confidence: number; // 0.0 – 1.0
  app_value: string;
  label_value?: string;
  note?: string;
}

export interface ComplianceChecks {
  government_warning_present: boolean;
  government_warning_verbatim: boolean;
  government_warning_caps_bold: boolean;
  government_warning_note?: string;
  abv_format_compliant: boolean;
  abv_format_note?: string;
}

export interface VerificationMetadata {
  model_version: string;
  ruleset_version: string;
  timestamp: string; // ISO 8601
  verification_id: string; // UUID v4
}

export interface VerificationResponse {
  overall_status: 'pass' | 'flag_for_review';
  fields: FieldVerificationResult[];
  compliance: ComplianceChecks;
  metadata: VerificationMetadata;
}

export interface ErrorResponse {
  error: string;
  code: ErrorCode;
  fields?: string[]; // which fields failed validation (VALIDATION_ERROR only)
}

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_FILE_TYPE'
  | 'FILE_TOO_LARGE'
  | 'AI_UNAVAILABLE'
  | 'RESPONSE_INVALID'
  | 'TIMEOUT';

// Submission queue types (three-party workflow)

export interface Submission {
  id:              string;        // UUID v4
  submitted_at:    string;        // ISO 8601
  status:          'pending' | 'reviewed';
  fields:          ApplicationFields;
  images:          string[];      // Vercel Blob public URLs
  image_mimetypes: string[];      // parallel array to images
}

export interface SubmissionListItem {
  id:            string;
  submitted_at:  string;
  status:        'pending' | 'reviewed';
  brand_name:    string;
  beverage_type: ApplicationFields['beverage_type'];
}

// Batch types

export interface BatchRow extends ApplicationFields {
  image_filename: string; // must match filename in zip (case-insensitive)
}

export const REQUIRED_CSV_COLUMNS = [
  'brand_name',
  'class_type',
  'abv',
  'net_contents',
  'bottler_name',
  'bottler_address',
  'beverage_type',
  'is_import',
  'image_filename',
] as const;

export type RequiredCsvColumn = (typeof REQUIRED_CSV_COLUMNS)[number];

export type BatchLabelStatus = 'pass' | 'flag_for_review' | 'failed' | 'image_not_found';

export interface BatchLabelResult {
  row: number;
  image_filename: string;
  brand_name: string;
  status: BatchLabelStatus;
  result?: VerificationResponse; // present if status is pass or flag_for_review
  error?: string; // present if status is failed
}

export interface BatchSummary {
  batch_id: string; // UUID v4
  total_submitted: number;
  total_verified: number;
  pass_count: number;
  flag_count: number;
  failed_count: number;
  not_found_count: number;
  started_at: string; // ISO 8601
  completed_at: string; // ISO 8601
  ruleset_version: string;
  model_version: string;
  results: BatchLabelResult[];
}

// SSE event payloads for batch streaming

export interface BatchProgressEvent extends BatchLabelResult {
  completed: number;
  total: number;
}
