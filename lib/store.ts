import type { Submission } from '@/types';

// Server-side in-memory submission queue.
// Persists across requests within the same Node.js server process.
// Resets on server restart and does not persist across Vercel serverless
// function instances — use Azure SQL for production (see docs/SCALING.md §3).
const submissions = new Map<string, Submission>();

export default submissions;
