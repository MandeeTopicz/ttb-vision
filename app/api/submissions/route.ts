import type { NextRequest } from 'next/server';
import { put } from '@vercel/blob';
import { ApplicationFieldsSchema } from '@/lib/schemas';
import { getAllSubmissions, setSubmission } from '@/lib/store';
import type { SubmissionListItem } from '@/types';

const ACCEPTED_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png']);
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 3;

export async function GET(): Promise<Response> {
  const all = await getAllSubmissions();
  const list: SubmissionListItem[] = all
    .sort((a, b) => b.submitted_at.localeCompare(a.submitted_at))
    .map((s) => ({
      id: s.id,
      submitted_at: s.submitted_at,
      status: s.status,
      brand_name: s.fields.brand_name,
      beverage_type: s.fields.beverage_type,
      verification_outcome: s.verification_outcome ?? null,
      agent_determination: s.agent_determination ?? null,
      agent_notes: s.agent_notes ?? null,
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

  const id = crypto.randomUUID();
  const image_urls: string[] = [];
  const image_mimetypes: string[] = [];

  for (let i = 0; i < imageEntries.length; i++) {
    const entry = imageEntries[i];
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

    const ext = entry.type === 'image/png' ? 'png' : 'jpg';
    let url: string;
    try {
      ({ url } = await put(`submissions/${id}/image-${i + 1}.${ext}`, entry, {
        access: 'public',
        contentType: entry.type,
      }));
    } catch (err) {
      console.error('[api/submissions] Blob upload failed:', err);
      return Response.json(
        { error: 'Image storage is unavailable. Please try again or contact support.', code: 'AI_UNAVAILABLE' },
        { status: 503 }
      );
    }
    image_urls.push(url);
    image_mimetypes.push(entry.type);
  }

  const submitted_at = new Date().toISOString();

  try {
    await setSubmission({
      id,
      submitted_at,
      status: 'pending',
      fields: fieldsResult.data,
      images: image_urls,
      image_mimetypes,
    });
  } catch (err) {
    console.error('[api/submissions] KV write failed:', err);
    return Response.json(
      { error: 'Submission queue is unavailable. Please try again or contact support.', code: 'AI_UNAVAILABLE' },
      { status: 503 }
    );
  }

  return Response.json({ id, submitted_at, status: 'pending' }, { status: 201 });
}
