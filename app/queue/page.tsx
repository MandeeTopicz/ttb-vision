'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ChevronRight, RefreshCw, Inbox, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { SubmissionListItem } from '@/types';

const BEVERAGE_LABEL: Record<string, string> = {
  distilled_spirits: 'Distilled Spirits',
  wine: 'Wine',
  malt_beverage: 'Malt Beverage',
};

function AiOutcomeBadge({ outcome }: { outcome: SubmissionListItem['verification_outcome'] }) {
  if (outcome === 'pass') {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-green-50 text-green-700 border border-green-200">
        Pass
      </span>
    );
  }
  if (outcome === 'flag_for_review') {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
        Flagged
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground border border-border">
      Pending
    </span>
  );
}

function DeterminationBadge({ determination, hasNotes }: {
  determination: SubmissionListItem['agent_determination'];
  hasNotes: boolean;
}) {
  const noteIcon = hasNotes ? (
    <FileText className="size-3 ml-1 opacity-60" aria-label="Has agent notes" />
  ) : null;

  if (determination === 'approved') {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-green-50 text-green-700 border border-green-200">
        Approved{noteIcon}
      </span>
    );
  }
  if (determination === 'rejected') {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-red-50 text-red-700 border border-red-200">
        Rejected{noteIcon}
      </span>
    );
  }
  if (determination === 'resubmission_requested') {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
        Resubmission Requested{noteIcon}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground border border-border">
      Awaiting Decision
    </span>
  );
}

export default function QueuePage() {
  const [submissions, setSubmissions] = useState<SubmissionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/submissions');
      if (!res.ok) throw new Error('Failed to load queue');
      const data = await res.json() as SubmissionListItem[];
      setSubmissions(data);
    } catch {
      setError('Could not load the submission queue. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  const pendingCount = submissions.filter((s) => s.status === 'pending').length;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <div>
            <h1 className="text-base font-semibold tracking-tight text-foreground">TTB Vision</h1>
            <p className="text-xs text-muted-foreground">Agent Review Queue</p>
          </div>
          <nav className="flex items-center gap-4" aria-label="Main navigation">
            <Link href="/submit" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Submit Application
            </Link>
            <Link href="/batch" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Batch Verification
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Pending Submissions</h2>
            {!loading && !error && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {pendingCount} pending · {submissions.length} total
              </p>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={fetchQueue} disabled={loading} aria-label="Refresh queue">
            <RefreshCw className={cn('size-3.5 mr-1.5', loading && 'animate-spin')} aria-hidden />
            Refresh
          </Button>
        </div>

        {error && (
          <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {!loading && !error && submissions.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/20 px-6 py-16 text-center">
            <Inbox className="size-8 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">No submissions yet.</p>
          </div>
        )}

        {!error && submissions.length > 0 && (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="border-b border-border">
                  <th scope="col" className="px-4 py-2.5 text-left font-medium text-muted-foreground">Brand Name</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium text-muted-foreground hidden sm:table-cell">Beverage Type</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium text-muted-foreground hidden md:table-cell">Submitted</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium text-muted-foreground">AI Outcome</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium text-muted-foreground hidden sm:table-cell">Agent Determination</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium text-muted-foreground sr-only">Review</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((s, i) => (
                  <tr
                    key={s.id}
                    className={cn(
                      'border-b border-border last:border-0',
                      i % 2 === 0 ? 'bg-background' : 'bg-muted/20'
                    )}
                  >
                    <td className="px-4 py-3 font-medium text-foreground">{s.brand_name}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                      {BEVERAGE_LABEL[s.beverage_type] ?? s.beverage_type}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell tabular-nums">
                      {new Date(s.submitted_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <AiOutcomeBadge outcome={s.verification_outcome} />
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <DeterminationBadge
                        determination={s.agent_determination}
                        hasNotes={!!s.agent_notes}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/queue/${s.id}`}
                        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Review
                        <ChevronRight className="size-3.5" aria-hidden />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
