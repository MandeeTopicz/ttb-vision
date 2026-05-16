import type { EvalCase } from './types';
import type { ApplicationFields } from '@/types';

// Fields from the latency benchmark fixture — these represent the COLA application
// data for test-label-clean.jpg. Mismatch cases override one field with an obviously
// wrong value so the model MUST flag it regardless of what else appears on the label.
const BASE: ApplicationFields = {
  beverage_type: 'distilled_spirits',
  is_import: false,
  brand_name: 'Ridge Stone Distillery',
  class_type: 'Kentucky Straight Bourbon Whiskey',
  abv: '45% Alc./Vol.',
  net_contents: '750 mL',
  bottler_name: 'Ridge Stone Distilling Co.',
  bottler_address: '456 Barrel Lane, Louisville, KY 40201',
};

export const EVAL_CASES: EvalCase[] = [
  // ─── Mismatch cases ────────────────────────────────────────────────────────
  // Each case submits one obviously wrong value. The model must flag that field
  // regardless of what else appears on the label image.

  {
    id: 'ds_brand_mismatch',
    description: 'Brand name in COLA is clearly wrong — model must flag brand_name',
    fields: { ...BASE, brand_name: 'XXXXXXXX_INVALID_BRAND_9999' },
    imageFile: 'test-label-clean.jpg',
    assertions: {
      overall_status: 'flag_for_review',
      fields: [{ field: 'brand_name', status: 'flag', min_confidence: 0.85 }],
    },
  },

  {
    id: 'ds_abv_mismatch',
    description: 'ABV in COLA is clearly wrong (99%) — model must flag abv',
    fields: { ...BASE, abv: '99% Alc./Vol.' },
    imageFile: 'test-label-clean.jpg',
    assertions: {
      overall_status: 'flag_for_review',
      fields: [{ field: 'abv', status: 'flag', min_confidence: 0.85 }],
    },
  },

  {
    id: 'ds_net_contents_mismatch',
    description: 'Net contents in COLA is clearly wrong (5.00 L) — model must flag net_contents',
    fields: { ...BASE, net_contents: '5.00 L' },
    imageFile: 'test-label-clean.jpg',
    assertions: {
      overall_status: 'flag_for_review',
      fields: [{ field: 'net_contents', status: 'flag', min_confidence: 0.80 }],
    },
  },

  {
    id: 'ds_class_type_mismatch',
    description: 'Class/type in COLA is clearly wrong — model must flag class_type',
    fields: { ...BASE, class_type: 'Blended Scotch Whisky' },
    imageFile: 'test-label-clean.jpg',
    assertions: {
      overall_status: 'flag_for_review',
      fields: [{ field: 'class_type', status: 'flag' }],
    },
  },

  {
    id: 'ds_bottler_mismatch',
    description: 'Bottler name in COLA is clearly wrong — model must flag bottler_name_address',
    fields: { ...BASE, bottler_name: 'XXXXXXXX_WRONG_BOTTLER_9999' },
    imageFile: 'test-label-clean.jpg',
    assertions: {
      overall_status: 'flag_for_review',
      fields: [{ field: 'bottler_name_address', status: 'flag', min_confidence: 0.80 }],
    },
  },

  // ─── Regression baseline ───────────────────────────────────────────────────
  // No behavioral assertions — this case exists to capture a baseline response
  // from the model given the "correct" COLA fields. On future runs it detects
  // drift: if overall_status or any field status changes, the eval flags it.
  // Run `npm run eval:capture` once to write the baseline JSON to baselines/.

  {
    id: 'ds_baseline',
    description: 'Regression baseline — capture model output for clean label with matching fields',
    fields: { ...BASE },
    imageFile: 'test-label-clean.jpg',
    assertions: {},
  },
];
