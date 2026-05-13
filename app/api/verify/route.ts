import type { NextRequest } from 'next/server';
import { ApplicationFieldsSchema } from '@/lib/schemas';
import { verify, VerificationError } from '@/lib/verify';
import type { ErrorResponse } from '@/types';

// Prototype: JPEG and PNG supported via base64 vision.
// PDF requires server-side rendering (future work — see APPROACH_AND_ASSUMPTIONS.md).
const ACCEPTED_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png']);
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_FILES = 3;

const HTTP_STATUS: Record<string, number> = {
  VALIDATION_ERROR: 400,
  INVALID_FILE_TYPE: 400,
  FILE_TOO_LARGE: 400,
  AI_UNAVAILABLE: 503,
  RESPONSE_INVALID: 500,
  TIMEOUT: 504,
};

function errorJson(body: ErrorResponse, status: number): Response {
  return Response.json(body, { status });
}

export async function POST(request: NextRequest): Promise<Response> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorJson({ error: 'Could not parse form data', code: 'VALIDATION_ERROR' }, 400);
  }

  // --- Validate application fields ---
  const fieldsRaw = formData.get('fields');
  if (!fieldsRaw || typeof fieldsRaw !== 'string') {
    return errorJson(
      { error: 'Missing required field: fields (JSON string)', code: 'VALIDATION_ERROR', fields: ['fields'] },
      400
    );
  }

  let fieldsParsed: unknown;
  try {
    fieldsParsed = JSON.parse(fieldsRaw);
  } catch {
    return errorJson(
      { error: 'The "fields" value must be a valid JSON string', code: 'VALIDATION_ERROR', fields: ['fields'] },
      400
    );
  }

  const fieldsResult = ApplicationFieldsSchema.safeParse(fieldsParsed);
  if (!fieldsResult.success) {
    const invalid = fieldsResult.error.issues.map((i) => i.path.join('.') || i.message);
    return errorJson(
      { error: 'Invalid or missing application fields', code: 'VALIDATION_ERROR', fields: invalid },
      400
    );
  }
  const fields = fieldsResult.data;

  // --- Validate uploaded images ---
  const imageEntries = formData.getAll('images');

  if (imageEntries.length === 0) {
    return errorJson(
      { error: 'At least one label image is required', code: 'VALIDATION_ERROR', fields: ['images'] },
      400
    );
  }

  if (imageEntries.length > MAX_FILES) {
    return errorJson(
      { error: `A maximum of ${MAX_FILES} images may be uploaded per verification`, code: 'VALIDATION_ERROR', fields: ['images'] },
      400
    );
  }

  const imageBuffers: Buffer[] = [];
  const mimeTypes: string[] = [];

  for (const entry of imageEntries) {
    if (!(entry instanceof File)) {
      return errorJson(
        { error: 'Each image entry must be a file upload', code: 'VALIDATION_ERROR', fields: ['images'] },
        400
      );
    }

    if (!ACCEPTED_MIME_TYPES.has(entry.type)) {
      return errorJson(
        {
          error: `Unsupported file type: "${entry.type || entry.name}". Accepted formats: JPEG, PNG. PDF support requires image conversion — please upload as JPEG or PNG for this prototype.`,
          code: 'INVALID_FILE_TYPE',
        },
        400
      );
    }

    if (entry.size > MAX_FILE_BYTES) {
      return errorJson(
        {
          error: `"${entry.name}" is ${(entry.size / 1024 / 1024).toFixed(1)} MB. Maximum file size is 10 MB.`,
          code: 'FILE_TOO_LARGE',
        },
        400
      );
    }

    const buf = Buffer.from(await entry.arrayBuffer());
    imageBuffers.push(buf);
    mimeTypes.push(entry.type);
  }

  // --- Run verification ---
  try {
    const result = await verify(fields, imageBuffers, mimeTypes);
    return Response.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof VerificationError) {
      return errorJson(
        { error: err.message, code: err.code },
        HTTP_STATUS[err.code] ?? 500
      );
    }
    console.error('[api/verify] Unexpected error:', err);
    return errorJson(
      {
        error: 'An unexpected error occurred. Please retry or proceed with manual review.',
        code: 'AI_UNAVAILABLE',
      },
      503
    );
  }
}
