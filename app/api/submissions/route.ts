import type { NextRequest } from 'next/server';
import { ApplicationFieldsSchema } from '@/lib/schemas';
import submissions from '@/lib/store';
import type { SubmissionListItem } from '@/types';

const ACCEPTED_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png']);
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 3;

export async function GET(): Promise<Response> {
  const list: SubmissionListItem[] = Array.from(submissions.values())
    .sort((a, b) => b.submitted_at.localeCompare(a.submitted_at))
    .map((s) => ({
      id: s.id,
      submitted_at: s.submitted_at,
      status: s.status,
      brand_name: s.fields.brand_name,
      beverage_type: s.fields.beverage_type,
    }));
  return Response.json(list);
}

export async function POST(request: NextRequest): Promise<Response> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: 'Could not parse form data', code: 'VALIDATION_ERROR' }, { status: 400 });
  }

  const fieldsRaw = formData.get('fields');
  if (!fieldsRaw || typeof fieldsRaw !== 'string') {
    return Response.json(
      { error: 'Missing required field: fields (JSON string)', code: 'VALIDATION_ERROR', fields: ['fields'] },
      { status: 400 }
    );
  }

  let fieldsParsed: unknown;
  try {
    fieldsParsed = JSON.parse(fieldsRaw);
  } catch {
    return Response.json(
      { error: 'The "fields" value must be a valid JSON string', code: 'VALIDATION_ERROR', fields: ['fields'] },
      { status: 400 }
    );
  }

  const fieldsResult = ApplicationFieldsSchema.safeParse(fieldsParsed);
  if (!fieldsResult.success) {
    const invalid = fieldsResult.error.issues.map((i) => i.path.join('.') || i.message);
    return Response.json(
      { error: 'Invalid or missing application fields', code: 'VALIDATION_ERROR', fields: invalid },
      { status: 400 }
    );
  }

  const imageEntries = formData.getAll('images');

  if (imageEntries.length === 0) {
    return Response.json(
      { error: 'At least one label image is required', code: 'VALIDATION_ERROR', fields: ['images'] },
      { status: 400 }
    );
  }
  if (imageEntries.length > MAX_FILES) {
    return Response.json(
      { error: `A maximum of ${MAX_FILES} images may be uploaded`, code: 'VALIDATION_ERROR', fields: ['images'] },
      { status: 400 }
    );
  }

  const images: string[] = [];
  const image_mimetypes: string[] = [];

  for (const entry of imageEntries) {
    if (!(entry instanceof File)) {
      return Response.json(
        { error: 'Each image entry must be a file upload', code: 'VALIDATION_ERROR', fields: ['images'] },
        { status: 400 }
      );
    }
    if (!ACCEPTED_MIME_TYPES.has(entry.type)) {
      return Response.json(
        { error: `Unsupported file type: "${entry.type || entry.name}". Accepted: JPEG, PNG.`, code: 'INVALID_FILE_TYPE' },
        { status: 400 }
      );
    }
    if (entry.size > MAX_FILE_BYTES) {
      return Response.json(
        { error: `"${entry.name}" exceeds the 10 MB limit.`, code: 'FILE_TOO_LARGE' },
        { status: 400 }
      );
    }
    const buf = Buffer.from(await entry.arrayBuffer());
    images.push(buf.toString('base64'));
    image_mimetypes.push(entry.type);
  }

  const id = crypto.randomUUID();
  const submitted_at = new Date().toISOString();

  submissions.set(id, {
    id,
    submitted_at,
    status: 'pending',
    fields: fieldsResult.data,
    images,
    image_mimetypes,
  });

  return Response.json({ id, submitted_at, status: 'pending' }, { status: 201 });
}
