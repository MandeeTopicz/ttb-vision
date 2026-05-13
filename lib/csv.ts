import type { BatchRow } from '@/types';
import { REQUIRED_CSV_COLUMNS } from '@/types';

export interface CsvParseResult {
  rows: BatchRow[];
  errors: string[];
}

// ─── RFC 4180-compliant CSV line parser ───────────────────────────────────────

function parseLine(line: string): string[] {
  const fields: string[] = [];
  let i = 0;

  while (i <= line.length) {
    if (i === line.length) {
      // Trailing comma produced an empty field already; stop.
      break;
    }

    if (line[i] === '"') {
      // Quoted field
      let field = '';
      i++; // skip opening quote
      while (i < line.length) {
        if (line[i] === '"') {
          if (line[i + 1] === '"') {
            field += '"';
            i += 2;
          } else {
            i++; // skip closing quote
            break;
          }
        } else {
          field += line[i++];
        }
      }
      fields.push(field);
      if (i < line.length && line[i] === ',') i++;
    } else {
      // Unquoted field
      const end = line.indexOf(',', i);
      if (end === -1) {
        fields.push(line.slice(i));
        break;
      } else {
        fields.push(line.slice(i, end));
        i = end + 1;
        // Trailing comma → one more empty field
        if (i === line.length) {
          fields.push('');
          break;
        }
      }
    }
  }

  return fields;
}

// ─── Public API ───────────────────────────────────────────────────────────────

const VALID_BEVERAGE_TYPES = new Set(['distilled_spirits', 'wine', 'malt_beverage']);

export function parseCsv(content: string): CsvParseResult {
  const errors: string[] = [];
  const rows: BatchRow[] = [];

  const lines = content
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0);

  if (lines.length === 0) {
    return { rows: [], errors: ['CSV file is empty'] };
  }

  // Parse and normalise header
  const headers = parseLine(lines[0]).map((h) => h.trim().toLowerCase());

  // Pre-flight: all required columns must be present
  const missing = REQUIRED_CSV_COLUMNS.filter((col) => !headers.includes(col));
  if (missing.length > 0) {
    return { rows: [], errors: [`Missing required columns: ${missing.join(', ')}`] };
  }

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const rowNum = i + 1; // human-readable row number (1-indexed + header)
    const values = parseLine(lines[i]);

    const get = (col: string) => (values[headers.indexOf(col)] ?? '').trim();

    const rowErrors: string[] = [];

    // Validate beverage_type
    const beverageType = get('beverage_type');
    if (!VALID_BEVERAGE_TYPES.has(beverageType)) {
      rowErrors.push(`beverage_type "${beverageType}" must be distilled_spirits, wine, or malt_beverage`);
    }

    // Validate is_import
    const isImportRaw = get('is_import').toLowerCase();
    if (isImportRaw !== 'true' && isImportRaw !== 'false') {
      rowErrors.push(`is_import must be "true" or "false", got "${get('is_import')}"`);
    }
    const isImport = isImportRaw === 'true';

    // Validate required string fields
    const requiredStrings = [
      'brand_name', 'class_type', 'abv', 'net_contents',
      'bottler_name', 'bottler_address', 'image_filename',
    ] as const;
    for (const field of requiredStrings) {
      if (!get(field)) rowErrors.push(`"${field}" is required`);
    }

    // Validate image filename extension
    const imageFilename = get('image_filename');
    if (imageFilename) {
      const ext = imageFilename.split('.').pop()?.toLowerCase();
      if (!['jpg', 'jpeg', 'png'].includes(ext ?? '')) {
        rowErrors.push(`"${imageFilename}": image must be .jpg, .jpeg, or .png`);
      }
    }

    // Conditional: country_of_origin required for imports
    if (isImport && !get('country_of_origin')) {
      rowErrors.push('country_of_origin is required when is_import is true');
    }

    if (rowErrors.length > 0) {
      errors.push(`Row ${rowNum}: ${rowErrors.join('; ')}`);
      continue;
    }

    const countryOfOrigin = get('country_of_origin');
    rows.push({
      beverage_type: beverageType as BatchRow['beverage_type'],
      is_import: isImport,
      brand_name: get('brand_name'),
      class_type: get('class_type'),
      abv: get('abv'),
      net_contents: get('net_contents'),
      bottler_name: get('bottler_name'),
      bottler_address: get('bottler_address'),
      image_filename: imageFilename,
      ...(isImport && countryOfOrigin ? { country_of_origin: countryOfOrigin } : {}),
    });
  }

  return { rows, errors };
}
