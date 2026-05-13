import { z } from 'zod';

export const ApplicationFieldsSchema = z.object({
  beverage_type: z.enum(['distilled_spirits', 'wine', 'malt_beverage']),
  is_import: z.boolean(),
  brand_name: z.string().min(1),
  class_type: z.string().min(1),
  abv: z.string().min(1),
  net_contents: z.string().min(1),
  bottler_name: z.string().min(1),
  bottler_address: z.string().min(1),
  country_of_origin: z.string().optional(),
}).refine(
  (data) => !data.is_import || (data.country_of_origin && data.country_of_origin.length > 0),
  { message: 'country_of_origin is required for imported products', path: ['country_of_origin'] }
);

export const FieldResultSchema = z.object({
  field: z.string(),
  status: z.enum(['pass', 'flag', 'unable_to_verify']),
  confidence: z.number().min(0).max(1),
  app_value: z.string(),
  label_value: z.string().optional(),
  note: z.string().optional(),
});

export const ComplianceChecksSchema = z.object({
  government_warning_present: z.boolean(),
  government_warning_verbatim: z.boolean(),
  government_warning_caps_bold: z.boolean(),
  government_warning_note: z.string().optional(),
  abv_format_compliant: z.boolean(),
  abv_format_note: z.string().optional(),
});

export const VerificationMetadataSchema = z.object({
  model_version: z.string(),
  ruleset_version: z.string(),
  timestamp: z.string(),
  verification_id: z.string().uuid(),
});

export const VerificationResponseSchema = z.object({
  overall_status: z.enum(['pass', 'flag_for_review']),
  fields: z.array(FieldResultSchema),
  compliance: ComplianceChecksSchema,
  metadata: VerificationMetadataSchema,
});

export const ErrorResponseSchema = z.object({
  error: z.string(),
  code: z.enum([
    'VALIDATION_ERROR',
    'INVALID_FILE_TYPE',
    'FILE_TOO_LARGE',
    'AI_UNAVAILABLE',
    'RESPONSE_INVALID',
    'TIMEOUT',
  ]),
  fields: z.array(z.string()).optional(),
});
