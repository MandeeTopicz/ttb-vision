import { describe, it, expect } from 'vitest';
import {
  ApplicationFieldsSchema,
  FieldResultSchema,
  VerificationResponseSchema,
  ErrorResponseSchema,
} from '@/lib/schemas';
import type { BatchSummary, BatchLabelResult } from '@/types';

// --- ApplicationFieldsSchema ---

describe('ApplicationFieldsSchema', () => {
  const valid = {
    beverage_type: 'distilled_spirits',
    is_import: false,
    brand_name: 'Old Tom Distillery',
    class_type: 'Kentucky Straight Bourbon Whiskey',
    abv: '45% Alc./Vol.',
    net_contents: '750 mL',
    bottler_name: 'Old Tom Distilling Co.',
    bottler_address: '123 Bourbon St, Louisville, KY 40202',
  };

  it('accepts a valid domestic distilled spirits record', () => {
    expect(ApplicationFieldsSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts a valid import with country_of_origin', () => {
    const result = ApplicationFieldsSchema.safeParse({
      ...valid,
      is_import: true,
      country_of_origin: 'Scotland',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an import missing country_of_origin', () => {
    const result = ApplicationFieldsSchema.safeParse({ ...valid, is_import: true });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('country_of_origin');
    }
  });

  it('rejects an unknown beverage_type', () => {
    const result = ApplicationFieldsSchema.safeParse({ ...valid, beverage_type: 'beer' });
    expect(result.success).toBe(false);
  });

  it('rejects a missing required field', () => {
    const { brand_name, ...without } = valid;
    const result = ApplicationFieldsSchema.safeParse(without);
    expect(result.success).toBe(false);
  });

  it('rejects an empty string on a required field', () => {
    const result = ApplicationFieldsSchema.safeParse({ ...valid, brand_name: '' });
    expect(result.success).toBe(false);
  });

  it('accepts all three beverage types', () => {
    for (const type of ['distilled_spirits', 'wine', 'malt_beverage'] as const) {
      expect(ApplicationFieldsSchema.safeParse({ ...valid, beverage_type: type }).success).toBe(true);
    }
  });
});

// --- FieldResultSchema ---

describe('FieldResultSchema', () => {
  const valid = {
    field: 'brand_name',
    status: 'pass',
    confidence: 0.95,
    app_value: 'Old Tom Distillery',
    label_value: 'Old Tom Distillery',
  };

  it('accepts a valid pass result', () => {
    expect(FieldResultSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts a flag result with a note', () => {
    const result = FieldResultSchema.safeParse({
      ...valid,
      status: 'flag',
      note: 'Case difference: label shows "OLD TOM DISTILLERY"',
    });
    expect(result.success).toBe(true);
  });

  it('accepts an unable_to_verify result without label_value', () => {
    const { label_value, ...without } = valid;
    const result = FieldResultSchema.safeParse({ ...without, status: 'unable_to_verify', confidence: 0.2 });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid status value', () => {
    const result = FieldResultSchema.safeParse({ ...valid, status: 'approved' });
    expect(result.success).toBe(false);
  });

  it('rejects confidence above 1.0', () => {
    const result = FieldResultSchema.safeParse({ ...valid, confidence: 1.1 });
    expect(result.success).toBe(false);
  });

  it('rejects confidence below 0.0', () => {
    const result = FieldResultSchema.safeParse({ ...valid, confidence: -0.1 });
    expect(result.success).toBe(false);
  });

  it('rejects a missing field name', () => {
    const { field, ...without } = valid;
    const result = FieldResultSchema.safeParse(without);
    expect(result.success).toBe(false);
  });
});

// --- VerificationResponseSchema ---

describe('VerificationResponseSchema', () => {
  const validResponse = {
    overall_status: 'pass',
    fields: [
      {
        field: 'brand_name',
        status: 'pass',
        confidence: 0.98,
        app_value: 'Old Tom Distillery',
        label_value: 'Old Tom Distillery',
      },
    ],
    compliance: {
      government_warning_present: true,
      government_warning_verbatim: true,
      government_warning_caps_bold: true,
      abv_format_compliant: true,
    },
    metadata: {
      model_version: 'gpt-4o-2024-08-06',
      ruleset_version: '1.0.0',
      timestamp: '2026-05-12T10:00:00Z',
      verification_id: '550e8400-e29b-41d4-a716-446655440000',
    },
  };

  it('accepts a valid pass response', () => {
    expect(VerificationResponseSchema.safeParse(validResponse).success).toBe(true);
  });

  it('accepts flag_for_review with notes', () => {
    const result = VerificationResponseSchema.safeParse({
      ...validResponse,
      overall_status: 'flag_for_review',
      fields: [
        {
          ...validResponse.fields[0],
          status: 'flag',
          confidence: 0.92,
          note: 'Case difference detected',
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid overall_status', () => {
    const result = VerificationResponseSchema.safeParse({
      ...validResponse,
      overall_status: 'approved',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-UUID verification_id', () => {
    const result = VerificationResponseSchema.safeParse({
      ...validResponse,
      metadata: { ...validResponse.metadata, verification_id: 'not-a-uuid' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing compliance block', () => {
    const { compliance, ...without } = validResponse;
    const result = VerificationResponseSchema.safeParse(without);
    expect(result.success).toBe(false);
  });

  it('rejects missing metadata block', () => {
    const { metadata, ...without } = validResponse;
    const result = VerificationResponseSchema.safeParse(without);
    expect(result.success).toBe(false);
  });

  it('rejects an invalid field result inside fields array', () => {
    const result = VerificationResponseSchema.safeParse({
      ...validResponse,
      fields: [{ ...validResponse.fields[0], status: 'unknown' }],
    });
    expect(result.success).toBe(false);
  });
});

// --- ErrorResponseSchema ---

describe('ErrorResponseSchema', () => {
  it('accepts a valid error response', () => {
    const result = ErrorResponseSchema.safeParse({
      error: 'AI service is unavailable',
      code: 'AI_UNAVAILABLE',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a validation error with fields list', () => {
    const result = ErrorResponseSchema.safeParse({
      error: 'Missing required fields',
      code: 'VALIDATION_ERROR',
      fields: ['brand_name', 'abv'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown error code', () => {
    const result = ErrorResponseSchema.safeParse({
      error: 'Something went wrong',
      code: 'UNKNOWN_CODE',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing error message', () => {
    const result = ErrorResponseSchema.safeParse({ code: 'TIMEOUT' });
    expect(result.success).toBe(false);
  });
});

// --- VerificationResponseSchema — additional edge cases ---

describe('VerificationResponseSchema — edge cases', () => {
  const validResponse = {
    overall_status: 'pass',
    fields: [
      {
        field: 'brand_name',
        status: 'pass',
        confidence: 0.98,
        app_value: 'Old Tom Distillery',
        label_value: 'Old Tom Distillery',
      },
    ],
    compliance: {
      government_warning_present: true,
      government_warning_verbatim: true,
      government_warning_caps_bold: true,
      abv_format_compliant: true,
    },
    metadata: {
      model_version: 'gpt-4o-2024-08-06',
      ruleset_version: '1.0.0',
      timestamp: '2026-05-13T10:00:00Z',
      verification_id: '550e8400-e29b-41d4-a716-446655440000',
    },
  };

  it('rejects a missing fields array', () => {
    const { fields, ...without } = validResponse;
    const result = VerificationResponseSchema.safeParse(without);
    expect(result.success).toBe(false);
  });

  it('accepts an empty fields array (schema does not enforce non-empty)', () => {
    const result = VerificationResponseSchema.safeParse({ ...validResponse, fields: [] });
    expect(result.success).toBe(true);
  });
});

// --- BatchSummary / BatchLabelResult — TypeScript shape checks ---
// BatchSummary and BatchLabelResult are TypeScript interfaces only (no Zod schema).
// These tests verify the shape is constructable without TypeScript errors.

describe('BatchSummary type shape', () => {
  it('a valid BatchSummary object satisfies the interface', () => {
    const result: BatchLabelResult = {
      row: 1,
      image_filename: 'label_001.jpg',
      brand_name: 'Test Brand',
      status: 'pass',
    };
    const summary: BatchSummary = {
      batch_id: '550e8400-e29b-41d4-a716-446655440001',
      total_submitted: 1,
      total_verified: 1,
      pass_count: 1,
      flag_count: 0,
      failed_count: 0,
      not_found_count: 0,
      started_at: '2026-05-13T10:00:00Z',
      completed_at: '2026-05-13T10:01:00Z',
      ruleset_version: '1.0.0',
      model_version: 'gpt-4o-2024-08-06',
      results: [result],
    };
    expect(summary.total_submitted).toBe(1);
    expect(summary.results[0].status).toBe('pass');
  });

  it('BatchLabelResult status includes all four valid values', () => {
    const statuses: Array<BatchLabelResult['status']> = ['pass', 'flag_for_review', 'failed', 'image_not_found'];
    expect(statuses).toHaveLength(4);
    for (const s of statuses) {
      const r: BatchLabelResult = { row: 1, image_filename: 'f.jpg', brand_name: 'B', status: s };
      expect(r.status).toBe(s);
    }
  });
});
