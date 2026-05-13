import { kv } from '@vercel/kv';
import type { Submission } from '@/types';

// Submissions expire after 24 hours — appropriate for prototype scope.
// Production uses Azure SQL (see docs/SCALING.md §3).
const TTL_SECONDS = 86400;

const key = (id: string) => `submission:${id}`;

export async function getSubmission(id: string): Promise<Submission | null> {
  return kv.get<Submission>(key(id));
}

export async function setSubmission(submission: Submission): Promise<void> {
  await kv.set(key(submission.id), submission, { ex: TTL_SECONDS });
}

export async function getAllSubmissions(): Promise<Submission[]> {
  const keys = await kv.keys('submission:*');
  if (keys.length === 0) return [];
  const values = await kv.mget<(Submission | null)[]>(...keys);
  return values.filter((v): v is Submission => v !== null);
}
