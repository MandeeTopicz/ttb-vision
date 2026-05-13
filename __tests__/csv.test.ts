import { describe, it, expect } from 'vitest';
import { parseCsv } from '@/lib/csv';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const HEADER =
  'brand_name,class_type,abv,net_contents,bottler_name,bottler_address,beverage_type,is_import,image_filename,country_of_origin';

function row(overrides: Record<string, string> = {}): string {
  const defaults: Record<string, string> = {
    brand_name: 'Test Brand',
    class_type: 'Kentucky Straight Bourbon Whiskey',
    abv: '45% Alc./Vol.',
    net_contents: '750 mL',
    bottler_name: 'Test Bottler Inc.',
    bottler_address: '1 Test St, Louisville, KY 40202',
    beverage_type: 'distilled_spirits',
    is_import: 'false',
    image_filename: 'label.jpg',
    country_of_origin: '',
  };
  const merged = { ...defaults, ...overrides };
  return Object.values(merged)
    .map((v) => (v.includes(',') ? `"${v}"` : v))
    .join(',');
}

// ─── Happy path ───────────────────────────────────────────────────────────────

describe('parseCsv() — valid input', () => {
  it('parses a single domestic distilled spirits row', () => {
    const csv = `${HEADER}\n${row()}`;
    const { rows, errors } = parseCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0].brand_name).toBe('Test Brand');
    expect(rows[0].beverage_type).toBe('distilled_spirits');
    expect(rows[0].is_import).toBe(false);
  });

  it('parses a wine import row with country_of_origin', () => {
    const csv = `${HEADER}\n${row({ beverage_type: 'wine', is_import: 'true', country_of_origin: 'France', image_filename: 'wine.png' })}`;
    const { rows, errors } = parseCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows[0].beverage_type).toBe('wine');
    expect(rows[0].is_import).toBe(true);
    expect(rows[0].country_of_origin).toBe('France');
  });

  it('parses a malt_beverage domestic row', () => {
    const csv = `${HEADER}\n${row({ beverage_type: 'malt_beverage' })}`;
    const { rows, errors } = parseCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows[0].beverage_type).toBe('malt_beverage');
  });

  it('parses multiple rows', () => {
    const csv = `${HEADER}\n${row()}\n${row({ brand_name: 'Brand B', image_filename: 'b.jpg' })}`;
    const { rows, errors } = parseCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(2);
  });

  it('handles quoted fields that contain commas', () => {
    const csv = `${HEADER}\n${row({ bottler_address: '1 Test St, Louisville, KY 40202' })}`;
    const { rows, errors } = parseCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows[0].bottler_address).toBe('1 Test St, Louisville, KY 40202');
  });

  it('handles CRLF line endings', () => {
    const csv = `${HEADER}\r\n${row()}\r\n${row({ brand_name: 'Brand B', image_filename: 'b.jpg' })}`;
    const { rows, errors } = parseCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(2);
  });

  it('ignores blank lines', () => {
    const csv = `${HEADER}\n\n${row()}\n\n`;
    const { rows, errors } = parseCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
  });

  it('is_import false: country_of_origin not attached to row even if present in CSV', () => {
    const csv = `${HEADER}\n${row({ is_import: 'false', country_of_origin: 'Scotland' })}`;
    const { rows } = parseCsv(csv);
    expect(rows[0].country_of_origin).toBeUndefined();
  });

  it('accepts .jpeg extension on image_filename', () => {
    const csv = `${HEADER}\n${row({ image_filename: 'label.jpeg' })}`;
    const { rows, errors } = parseCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows[0].image_filename).toBe('label.jpeg');
  });

  it('accepts .png extension on image_filename', () => {
    const csv = `${HEADER}\n${row({ image_filename: 'label.png' })}`;
    const { rows, errors } = parseCsv(csv);
    expect(errors).toHaveLength(0);
  });
});

// ─── Structural errors ────────────────────────────────────────────────────────

describe('parseCsv() — structural errors', () => {
  it('returns error for empty input', () => {
    const { rows, errors } = parseCsv('');
    expect(rows).toHaveLength(0);
    expect(errors).toContain('CSV file is empty');
  });

  it('returns error for whitespace-only input', () => {
    const { rows, errors } = parseCsv('   \n  \n  ');
    expect(rows).toHaveLength(0);
    expect(errors).toContain('CSV file is empty');
  });

  it('returns error listing missing required columns', () => {
    const { rows, errors } = parseCsv('brand_name,class_type\nFoo,Bar');
    expect(rows).toHaveLength(0);
    expect(errors[0]).toContain('Missing required columns');
    expect(errors[0]).toContain('abv');
    expect(errors[0]).toContain('image_filename');
  });

  it('returns a single error when all required columns are missing', () => {
    const { errors } = parseCsv('some_other_col\nvalue');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Missing required columns');
  });
});

// ─── Row-level errors ─────────────────────────────────────────────────────────

describe('parseCsv() — row-level validation errors', () => {
  it('flags invalid beverage_type', () => {
    const csv = `${HEADER}\n${row({ beverage_type: 'cider' })}`;
    const { rows, errors } = parseCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors[0]).toContain('Row 2');
    expect(errors[0]).toContain('beverage_type');
  });

  it('flags invalid is_import value', () => {
    const csv = `${HEADER}\n${row({ is_import: 'yes' })}`;
    const { rows, errors } = parseCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors[0]).toContain('is_import');
  });

  it('flags missing brand_name', () => {
    const csv = `${HEADER}\n${row({ brand_name: '' })}`;
    const { rows, errors } = parseCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors[0]).toContain('brand_name');
  });

  it('flags missing image_filename', () => {
    const csv = `${HEADER}\n${row({ image_filename: '' })}`;
    const { rows, errors } = parseCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors[0]).toContain('image_filename');
  });

  it('flags unsupported image extension', () => {
    const csv = `${HEADER}\n${row({ image_filename: 'label.pdf' })}`;
    const { rows, errors } = parseCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors[0]).toContain('label.pdf');
  });

  it('flags import row missing country_of_origin', () => {
    const csv = `${HEADER}\n${row({ is_import: 'true', country_of_origin: '' })}`;
    const { rows, errors } = parseCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors[0]).toContain('country_of_origin');
  });

  it('skips invalid rows but collects valid ones', () => {
    const csv = [
      HEADER,
      row(),                                              // valid
      row({ brand_name: '', image_filename: 'b.jpg' }),  // invalid
      row({ brand_name: 'C', image_filename: 'c.jpg' }), // valid
    ].join('\n');
    const { rows, errors } = parseCsv(csv);
    expect(rows).toHaveLength(2);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Row 3');
  });

  it('row error message includes the correct 1-based row number', () => {
    const csv = [HEADER, row(), row(), row({ beverage_type: 'bad' })].join('\n');
    const { errors } = parseCsv(csv);
    expect(errors[0]).toContain('Row 4');
  });

  it('accumulates multiple errors within a single row', () => {
    const csv = `${HEADER}\n${row({ brand_name: '', beverage_type: 'cider' })}`;
    const { errors } = parseCsv(csv);
    expect(errors[0]).toContain('brand_name');
    expect(errors[0]).toContain('beverage_type');
  });
});
