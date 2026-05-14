import type { NextRequest } from 'next/server';
import { getSubmission, setSubmission } from '@/lib/store';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await context.params;
  const submission = await getSubmission(id);
  if (!submission) {
    return Response.json({ error: 'Submission not found', code: 'NOT_FOUND' }, { status: 404 });
  }
  return Response.json(submission);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await context.params;
  const submission = await getSubmission(id);
  if (!submission) {
    return Response.json({ error: 'Submission not found', code: 'NOT_FOUND' }, { status: 404 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // No body — fall through to default reviewed update
  }

  // Operation B: agent records final determination
  if ('agent_determination' in body) {
    const det = body.agent_determination;
    if (det !== 'approved' && det !== 'rejected') {
      return Response.json(
        { error: 'agent_determination must be "approved" or "rejected"', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }
    await setSubmission({ ...submission, agent_determination: det });
    return Response.json({ id, agent_determination: det });
  }

  // Operation A: system marks reviewed after verification runs
  const outcome = body.verification_outcome;
  const verificationOutcome: 'pass' | 'flag_for_review' | undefined =
    outcome === 'pass' || outcome === 'flag_for_review' ? outcome : undefined;
  const updated = {
    ...submission,
    status: 'reviewed' as const,
    ...(verificationOutcome !== undefined ? { verification_outcome: verificationOutcome } : {}),
  };
  await setSubmission(updated);
  return Response.json({ id, status: 'reviewed', verification_outcome: updated.verification_outcome ?? null });
}
