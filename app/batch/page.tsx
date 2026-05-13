'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ChevronLeft, AlertCircle } from 'lucide-react';
import { BatchUpload } from '@/components/BatchUpload';
import { BatchResults } from '@/components/BatchResults';
import { Separator } from '@/components/ui/separator';
import type { BatchLabelResult, BatchSummary, ErrorResponse } from '@/types';

// ─── State machine ────────────────────────────────────────────────────────────

type BatchPhase =
  | { phase: 'idle' }
  | { phase: 'processing'; results: BatchLabelResult[]; completed: number; total: number }
  | { phase: 'complete'; summary: BatchSummary }
  | { phase: 'error'; message: string; fields?: string[] };

// ─── SSE line parser ──────────────────────────────────────────────────────────

function parseSseChunk(buffer: string): { events: unknown[]; remaining: string } {
  const events: unknown[] = [];
  const blocks = buffer.split('\n\n');
  const remaining = blocks.pop() ?? '';

  for (const block of blocks) {
    for (const line of block.split('\n')) {
      if (line.startsWith('data: ')) {
        try {
          events.push(JSON.parse(line.slice(6)));
        } catch {
          // malformed line — skip
        }
      }
    }
  }

  return { events, remaining };
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function BatchPage() {
  const [state, setState] = useState<BatchPhase>({ phase: 'idle' });
  const abortRef = useRef<AbortController | null>(null);

  // Beforeunload guard while processing
  useEffect(() => {
    if (state.phase !== 'processing') return;

    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [state.phase]);

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  async function handleSubmit(formData: FormData) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState({ phase: 'processing', results: [], completed: 0, total: 0 });

    let res: Response;
    try {
      res = await fetch('/api/batch', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setState({
        phase: 'error',
        message: 'Unable to reach the verification service. Please check your connection and retry.',
      });
      return;
    }

    // Pre-flight errors (4xx) return JSON, not SSE
    if (!res.ok) {
      const data = (await res.json()) as ErrorResponse;
      setState({
        phase: 'error',
        message: data.error,
        fields: data.fields,
      });
      return;
    }

    // Stream SSE
    const reader = res.body?.getReader();
    if (!reader) {
      setState({ phase: 'error', message: 'No response stream received.' });
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const { events, remaining } = parseSseChunk(buffer);
        buffer = remaining;

        for (const raw of events) {
          const event = raw as Record<string, unknown>;

          if (event.type === 'progress') {
            const labelResult: BatchLabelResult = {
              row: event.row as number,
              image_filename: event.image_filename as string,
              brand_name: event.brand_name as string,
              status: event.status as BatchLabelResult['status'],
              result: event.result as BatchLabelResult['result'],
              error: event.error as string | undefined,
            };
            setState((prev) =>
              prev.phase === 'processing'
                ? {
                    phase: 'processing',
                    results: [...prev.results, labelResult],
                    completed: event.completed as number,
                    total: event.total as number,
                  }
                : prev
            );
          } else if (event.type === 'complete') {
            const summary: BatchSummary = {
              batch_id: event.batch_id as string,
              total_submitted: event.total_submitted as number,
              total_verified: event.total_verified as number,
              pass_count: event.pass_count as number,
              flag_count: event.flag_count as number,
              failed_count: event.failed_count as number,
              not_found_count: event.not_found_count as number,
              started_at: event.started_at as string,
              completed_at: event.completed_at as string,
              ruleset_version: event.ruleset_version as string,
              model_version: event.model_version as string,
              results: event.results as BatchLabelResult[],
            };
            setState({ phase: 'complete', summary });
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setState({
        phase: 'error',
        message: 'The connection was interrupted. Please retry.',
      });
    }
  }

  function handleReset() {
    abortRef.current?.abort();
    setState({ phase: 'idle' });
  }

  const isProcessing = state.phase === 'processing';

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <div>
            <h1 className="text-base font-semibold tracking-tight text-foreground">TTB Vision</h1>
            <p className="text-xs text-muted-foreground">AI-Powered Label Verification</p>
          </div>
          <nav aria-label="Main navigation">
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="size-3.5" aria-hidden />
              Single Verification
            </Link>
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-6">

          {/* Page heading */}
          <div>
            <h2 className="text-lg font-semibold text-foreground">Batch Verification</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload a CSV manifest and a ZIP of label images to verify multiple labels in a single
              run. Results stream in real time as each label is processed.
            </p>
          </div>

          <Separator />

          {/* Error state */}
          {state.phase === 'error' && (
            <div role="alert" className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="size-4 shrink-0 mt-0.5 text-destructive" aria-hidden />
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium text-destructive">Batch Failed</p>
                  <p className="text-sm text-muted-foreground">{state.message}</p>
                  {state.fields && state.fields.length > 0 && (
                    <ul className="mt-1 list-disc list-inside text-xs text-muted-foreground">
                      {state.fields.map((f, i) => <li key={i}>{f}</li>)}
                    </ul>
                  )}
                </div>
              </div>
              <button
                onClick={handleReset}
                className="self-start text-xs text-muted-foreground underline hover:text-foreground"
              >
                Try again
              </button>
            </div>
          )}

          {/* Upload form (idle + error) */}
          {(state.phase === 'idle' || state.phase === 'error') && (
            <BatchUpload onSubmit={handleSubmit} loading={isProcessing} />
          )}

          {/* Live results (processing + complete) */}
          {(state.phase === 'processing' || state.phase === 'complete') && (
            <div className="flex flex-col gap-4">
              <BatchResults
                results={state.phase === 'processing' ? state.results : state.summary.results}
                completed={state.phase === 'processing' ? state.completed : state.summary.total_submitted}
                total={state.phase === 'processing' ? state.total : state.summary.total_submitted}
                summary={state.phase === 'complete' ? state.summary : undefined}
              />
              {state.phase === 'complete' && (
                <button
                  onClick={handleReset}
                  className="self-start text-xs text-muted-foreground underline hover:text-foreground"
                >
                  Start a new batch
                </button>
              )}
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
