'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Loader2, AlertCircle, PlayCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ResultsPanel } from '@/components/ResultsPanel';
import { ReportExport } from '@/components/ReportExport';
import type { Submission, VerificationResponse, ErrorResponse, ErrorCode } from '@/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  beverage_type:    'Beverage Type',
  is_import:        'Origin',
  brand_name:       'Brand Name',
  class_type:       'Class / Type',
  abv:              'Alcohol Content (ABV)',
  net_contents:     'Net Contents',
  bottler_name:     'Bottler / Producer Name',
  bottler_address:  'Bottler / Producer Address',
  country_of_origin:'Country of Origin',
};

const BEVERAGE_LABEL: Record<string, string> = {
  distilled_spirits: 'Distilled Spirits',
  wine: 'Wine',
  malt_beverage: 'Malt Beverage',
};

const ERROR_GUIDANCE: Record<ErrorCode, string> = {
  VALIDATION_ERROR: 'Submission data failed validation.',
  INVALID_FILE_TYPE: 'Unsupported file format in submission.',
  FILE_TOO_LARGE: 'An image in this submission exceeds the 10 MB limit.',
  AI_UNAVAILABLE: 'The AI verification service is currently unavailable. Please retry or proceed with manual review.',
  RESPONSE_INVALID: 'The verification could not be completed due to an unexpected AI response. Please retry.',
  TIMEOUT: 'The verification timed out. Please retry — if the problem persists, proceed with manual review.',
};

async function blobUrlToFile(url: string, mimeType: string, index: number): Promise<File> {
  const res = await fetch(url);
  const blob = await res.blob();
  const ext = mimeType === 'image/png' ? 'png' : 'jpg';
  return new File([blob], `label-${index + 1}.${ext}`, { type: mimeType });
}

// ─── Field display ────────────────────────────────────────────────────────────

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 border-b border-border last:border-0">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground break-words">{value}</span>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AgentReviewPage() {
  const { id } = useParams<{ id: string }>();

  const [submission, setSubmission] = useState<Submission | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetchLoading, setFetchLoading] = useState(true);

  const [result, setResult] = useState<VerificationResponse | null>(null);
  const [verifyError, setVerifyError] = useState<ErrorResponse | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [exported, setExported] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // ── Fetch submission ──
  useEffect(() => {
    if (!id) return;
    fetch(`/api/submissions/${id}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json() as { error?: string };
          setFetchError(data.error ?? 'Submission not found.');
        } else {
          const data = await res.json() as Submission;
          setSubmission(data);
        }
      })
      .catch(() => setFetchError('Could not load submission. Please go back and try again.'))
      .finally(() => setFetchLoading(false));
  }, [id]);

  // ── Elapsed timer ──
  useEffect(() => {
    if (verifyLoading) {
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [verifyLoading]);

  // ── Run verification ──
  const handleRunVerification = useCallback(async () => {
    if (!submission) return;
    setVerifyLoading(true);
    setVerifyError(null);
    setResult(null);
    setElapsed(0);
    setExported(false);

    try {
      const formData = new FormData();
      formData.append('fields', JSON.stringify(submission.fields));
      const files = await Promise.all(
        submission.images.map((url, i) => blobUrlToFile(url, submission.image_mimetypes[i], i))
      );
      files.forEach((file) => formData.append('images', file));

      const res = await fetch('/api/verify', { method: 'POST', body: formData });
      const data = await res.json() as VerificationResponse | ErrorResponse;

      if (!res.ok) {
        setVerifyError(data as ErrorResponse);
      } else {
        setResult(data as VerificationResponse);
        // Mark reviewed
        await fetch(`/api/submissions/${id}`, { method: 'PATCH' });
        setSubmission((prev) => prev ? { ...prev, status: 'reviewed' } : prev);
        setTimeout(() => resultsRef.current?.focus(), 50);
      }
    } catch {
      setVerifyError({ error: 'Unable to reach the verification service.', code: 'AI_UNAVAILABLE' });
    } finally {
      setVerifyLoading(false);
    }
  }, [submission, id]);

  // ── Unload guard ──
  useEffect(() => {
    const needsGuard = verifyLoading || (result !== null && !exported);
    if (!needsGuard) return;
    function handleBeforeUnload(e: BeforeUnloadEvent) { e.preventDefault(); }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [verifyLoading, result, exported]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <div>
            <h1 className="text-base font-semibold tracking-tight text-foreground">TTB Vision</h1>
            <p className="text-xs text-muted-foreground">Agent Review</p>
          </div>
          <nav aria-label="Main navigation">
            <Link
              href="/queue"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="size-3.5" aria-hidden />
              Back to Queue
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">

        {fetchLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
          </div>
        )}

        {fetchError && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3">
            <AlertCircle className="size-4 shrink-0 mt-0.5 text-destructive" />
            <p className="text-sm text-destructive">{fetchError}</p>
          </div>
        )}

        {submission && (
          <div className="flex flex-col gap-8">

            {/* Submission metadata */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted-foreground">
              <span><span className="font-medium">Submission ID:</span> {submission.id}</span>
              <span><span className="font-medium">Submitted:</span> {new Date(submission.submitted_at).toLocaleString()}</span>
              <span>
                <span className="font-medium">Status:</span>{' '}
                <span className={submission.status === 'pending' ? 'text-amber-700 font-medium' : 'text-green-700 font-medium'}>
                  {submission.status === 'pending' ? 'Pending' : 'Reviewed'}
                </span>
              </span>
            </div>

            <Separator />

            {/* Two-panel: fields + image */}
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">

              {/* Left: vendor-submitted fields */}
              <div className="flex flex-col gap-3">
                <h2 className="text-sm font-semibold text-foreground">Submitted Application Data</h2>
                <div className="rounded-lg border border-border bg-card px-4 py-1">
                  <FieldRow label={FIELD_LABELS.beverage_type} value={BEVERAGE_LABEL[submission.fields.beverage_type] ?? submission.fields.beverage_type} />
                  <FieldRow label={FIELD_LABELS.is_import} value={submission.fields.is_import ? 'Import' : 'Domestic'} />
                  <FieldRow label={FIELD_LABELS.brand_name} value={submission.fields.brand_name} />
                  <FieldRow label={FIELD_LABELS.class_type} value={submission.fields.class_type} />
                  <FieldRow label={FIELD_LABELS.abv} value={submission.fields.abv} />
                  <FieldRow label={FIELD_LABELS.net_contents} value={submission.fields.net_contents} />
                  <FieldRow label={FIELD_LABELS.bottler_name} value={submission.fields.bottler_name} />
                  <FieldRow label={FIELD_LABELS.bottler_address} value={submission.fields.bottler_address} />
                  {submission.fields.country_of_origin && (
                    <FieldRow label={FIELD_LABELS.country_of_origin} value={submission.fields.country_of_origin} />
                  )}
                </div>
              </div>

              {/* Right: label images */}
              <div className="flex flex-col gap-3">
                <h2 className="text-sm font-semibold text-foreground">
                  Label Image{submission.images.length > 1 ? 's' : ''} ({submission.images.length})
                </h2>
                <div className="flex flex-col gap-3">
                  {submission.images.map((url, i) => (
                    <div key={i} className="rounded-lg border border-border overflow-hidden bg-muted/20">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={`Label image ${i + 1}`}
                        className="w-full object-contain max-h-80"
                      />
                      {submission.images.length > 1 && (
                        <p className="px-3 py-1.5 text-xs text-muted-foreground border-t border-border">
                          Image {i + 1} of {submission.images.length}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <Separator />

            {/* Run Verification */}
            {!result && (
              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">AI Verification</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Review the submitted data and images above, then run AI verification to check
                    the label against TTB regulatory requirements. Results are visible to agents only.
                  </p>
                </div>

                {verifyError && (
                  <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3">
                    <AlertCircle className="size-4 shrink-0 mt-0.5 text-destructive" aria-hidden />
                    <div className="flex flex-col gap-1">
                      <p className="text-sm font-medium text-destructive">Verification Failed</p>
                      <p className="text-sm text-muted-foreground">
                        {ERROR_GUIDANCE[verifyError.code] ?? verifyError.error}
                      </p>
                    </div>
                  </div>
                )}

                {verifyLoading ? (
                  <div className="flex items-center gap-3">
                    <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
                    <span className="text-sm text-muted-foreground">Verifying… {elapsed}s</span>
                  </div>
                ) : (
                  <Button onClick={handleRunVerification} className="w-fit">
                    <PlayCircle className="size-4 mr-2" aria-hidden />
                    Run Verification
                  </Button>
                )}
              </div>
            )}

            {/* Results */}
            {result && (
              <div
                ref={resultsRef}
                tabIndex={-1}
                className="outline-none"
                aria-live="polite"
                aria-atomic="false"
              >
                <ResultsPanel
                  result={result}
                  exportSlot={
                    <ReportExport mode="single" result={result} onExport={() => setExported(true)} />
                  }
                />
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
