'use client';

import { CheckCircle, AlertTriangle, AlertCircle, Loader2, Info } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { ReportExport } from '@/components/ReportExport';
import { cn } from '@/lib/utils';
import type { BatchLabelResult, BatchSummary, BatchLabelStatus } from '@/types';

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: BatchLabelStatus }) {
  if (status === 'pass') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
        <CheckCircle className="size-3 shrink-0" aria-hidden />
        PASS
      </span>
    );
  }
  if (status === 'flag_for_review') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
        <AlertTriangle className="size-3 shrink-0" aria-hidden />
        FLAGGED
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
        <AlertCircle className="size-3 shrink-0" aria-hidden />
        ERROR
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700">
      <AlertCircle className="size-3 shrink-0" aria-hidden />
      NOT FOUND
    </span>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: number; highlight?: 'pass' | 'flag' | 'error' }) {
  const valueColor =
    highlight === 'pass' ? 'text-green-700' :
    highlight === 'flag' ? 'text-amber-700' :
    highlight === 'error' ? 'text-red-700' :
    'text-foreground';

  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-border bg-card px-4 py-3">
      <span className={cn('text-xl font-bold tabular-nums', valueColor)}>{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  results: BatchLabelResult[];
  completed: number;
  total: number;
  summary?: BatchSummary;
}

export function BatchResults({ results, completed, total, summary }: Props) {
  const isComplete = summary !== undefined;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <section aria-label="Batch Verification Results" className="flex flex-col gap-6">
      {/* Progress header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-foreground">
            {isComplete
              ? `Complete — ${total} label${total !== 1 ? 's' : ''} processed`
              : `Verifying… ${completed} of ${total}`}
          </span>
          <span className="tabular-nums text-muted-foreground">{progress}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${progress}% complete`}
            className={cn(
              'h-full rounded-full transition-all duration-300',
              isComplete ? 'bg-green-500' : 'bg-primary'
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Summary stats (visible once complete) */}
      {isComplete && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          <StatCard label="Submitted" value={summary.total_submitted} />
          <StatCard label="Verified" value={summary.total_verified} />
          <StatCard label="Pass" value={summary.pass_count} highlight="pass" />
          <StatCard label="Flagged" value={summary.flag_count} highlight="flag" />
          <StatCard label="Failed" value={summary.failed_count} highlight="error" />
          <StatCard label="Not Found" value={summary.not_found_count} highlight="error" />
        </div>
      )}

      {/* Live results table */}
      {results.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-foreground">
            Results
            {!isComplete && (
              <Loader2 className="inline-block ml-2 size-3.5 animate-spin text-muted-foreground" aria-hidden />
            )}
          </h2>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="border-b border-border">
                  <th scope="col" className="px-3 py-2 text-left font-medium text-muted-foreground w-10">#</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium text-muted-foreground">Brand Name</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium text-muted-foreground hidden sm:table-cell">Image File</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium text-muted-foreground hidden md:table-cell">Note</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => {
                  const note =
                    r.error ??
                    (r.result?.fields
                      .filter((f) => f.status === 'flag')
                      .map((f) => f.note ?? f.field)
                      .join('; ') || undefined);

                  return (
                    <tr
                      key={`${r.row}-${r.image_filename}`}
                      className={cn(
                        'border-b border-border last:border-0 align-top',
                        i % 2 === 0 ? 'bg-background' : 'bg-muted/20'
                      )}
                    >
                      <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{r.row}</td>
                      <td className="px-3 py-2.5 font-medium text-foreground max-w-[160px]">
                        <span className="break-words">{r.brand_name}</span>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground max-w-[140px] hidden sm:table-cell">
                        <span className="break-words text-xs">{r.image_filename}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[200px] hidden md:table-cell">
                        {note ?? '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Export + disclaimer (complete only) */}
      {isComplete && (
        <>
          <ReportExport mode="batch" summary={summary} />

          <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 flex flex-col gap-2 text-xs text-muted-foreground">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span><span className="font-medium">Batch ID:</span> {summary.batch_id}</span>
              <span><span className="font-medium">Started:</span> {new Date(summary.started_at).toLocaleString()}</span>
              <span><span className="font-medium">Model:</span> {summary.model_version}</span>
              <span><span className="font-medium">Ruleset:</span> v{summary.ruleset_version}</span>
            </div>
            <Separator />
            <div className="flex items-start gap-1.5">
              <Info className="size-3.5 shrink-0 mt-0.5" aria-hidden />
              <p>
                <strong>Disclaimer:</strong> This result is a verification assist. Final compliance
                determination is the responsibility of the TTB compliance agent.
              </p>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
