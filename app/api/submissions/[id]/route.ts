import type { NextRequest } from 'next/server';
import submissions from '@/lib/store';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await context.params;
  const submission = submissions.get(id);
  if (!submission) {
    return Response.json({ error: 'Submission not found', code: 'NOT_FOUND' }, { status: 404 });
  }
  return Response.json(submission);
}

export async function PATCH(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await context.params;
  const submission = submissions.get(id);
  if (!submission) {
    return Response.json({ error: 'Submission not found', code: 'NOT_FOUND' }, { status: 404 });
  }
  submissions.set(id, { ...submission, status: 'reviewed' });
  return Response.json({ id, status: 'reviewed' });
}
