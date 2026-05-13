'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Loader2, AlertCircle, ChevronRight } from 'lucide-react';
import { VerificationForm } from '@/components/VerificationForm';
import { ResultsPanel } from '@/components/ResultsPanel';
import { ReportExport } from '@/components/ReportExport';
import { Separator } from '@/components/ui/separator';
import type { VerificationResponse, ErrorResponse, ErrorCode } from '@/types';

// ─── Error message map ────────────────────────────────────────────────────────

const ERROR_GUIDANCE: Record<ErrorCode, string> = {
  VALIDATION_ERROR: 'One or more fields failed validation. Check your entries and try again.',
  INVALID_FILE_TYPE: 'Unsupported file format. Please upload JPEG or PNG images.',
  FILE_TOO_LARGE: 'One or more files exceed the 10 MB limit. Please reduce file size and retry.',
  AI_UNAVAILABLE: 'The AI verification service is currently unavailable. Please proceed with manual review or retry in a moment.',
  RESPONSE_INVALID: 'The verification could not be completed due to an unexpected AI response. Please retry.',
  TIMEOUT: 'The verification timed out. Please retry — if the problem persists, proceed with manual review.',
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function Home() {
  const [result, setResult] = useState<VerificationResponse | null>(null);
  const [error, setError] = useState<ErrorResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [exported, setExported] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Elapsed timer ──
  useEffect(() => {
    if (loading) {
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [loading]);

  // ── beforeunload guard ──
  useEffect(() => {
    const needsGuard = loading || (result !== null && !exported);
    if (!needsGuard) return;

    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [loading, result, exported]);

  // ── Submit handler ──
  const handleSubmit = useCallback(async (formData: FormData) => {
    setResult(null);
    setError(null);
    setLoading(true);
    setElapsed(0);
    setExported(false);

    try {
      const res = await fetch('/api/verify', { method: 'POST', body: formData });
      const data = await res.json() as VerificationResponse | ErrorResponse;

      if (!res.ok) {
        setError(data as ErrorResponse);
      } else {
        setResult(data as VerificationResponse);
        // Move focus to results after render
        setTimeout(() => resultsRef.current?.focus(), 50);
      }
    } catch {
      setError({
        error: 'Unable to reach the verification service. Please check your connection and retry.',
        code: 'AI_UNAVAILABLE',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">
      {/* Top navigation bar */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <div>
            <h1 className="text-base font-semibold tracking-tight text-foreground">TTB Vision</h1>
            <p className="text-xs text-muted-foreground">AI-Powered Label Verification</p>
          </div>
          <nav aria-label="Main navigation">
            <Link
              href="/batch"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Batch Verification
              <ChevronRight className="size-3.5" aria-hidden />
            </Link>
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_1.2fr]">

          {/* Left: Form */}
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Single Label Verification</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Enter the COLA application fields and upload the label image to verify.
                Government warning is checked automatically against statutory text.
              </p>
            </div>
            <Separator />
            <VerificationForm
              onSubmit={handleSubmit}
              loading={loading}
              hasExistingResult={result !== null}
            />
          </div>

          {/* Right: Loading / Error / Results */}
          <div
            ref={resultsRef}
            tabIndex={-1}
            className="outline-none"
            aria-live="polite"
            aria-atomic="false"
          >
            {loading && (
              <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border bg-card px-6 py-12 text-center">
                <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden />
                <p className="text-sm font-medium text-foreground">Verifying label…</p>
                <p className="text-xs text-muted-foreground tabular-nums">{elapsed}s elapsed</p>
              </div>
            )}

            {!loading && error && (
              <div
                role="alert"
                className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-4"
              >
                <div className="flex items-start gap-2">
                  <AlertCircle className="size-4 shrink-0 mt-0.5 text-destructive" aria-hidden />
                  <div className="flex flex-col gap-1">
                    <p className="text-sm font-medium text-destructive">Verification Failed</p>
                    <p className="text-sm text-muted-foreground">
                      {ERROR_GUIDANCE[error.code] ?? error.error}
                    </p>
                    {error.fields && error.fields.length > 0 && (
                      <ul className="mt-1 list-disc list-inside text-xs text-muted-foreground">
                        {error.fields.map((f) => <li key={f}>{f}</li>)}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            )}

            {!loading && result && (
              <ResultsPanel
                result={result}
                exportSlot={
                  <ReportExport mode="single" result={result} onExport={() => setExported(true)} />
                }
              />
            )}

            {!loading && !error && !result && (
              <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  Verification results will appear here after submission.
                </p>
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}
