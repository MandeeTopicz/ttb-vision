'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { VerificationForm } from '@/components/VerificationForm';
import { Separator } from '@/components/ui/separator';

type Phase =
  | { phase: 'form' }
  | { phase: 'loading' }
  | { phase: 'confirmed'; id: string }
  | { phase: 'error'; message: string };

export default function SubmitPage() {
  const [state, setState] = useState<Phase>({ phase: 'form' });

  const handleSubmit = useCallback(async (formData: FormData) => {
    setState({ phase: 'loading' });
    try {
      const res = await fetch('/api/submissions', { method: 'POST', body: formData });
      const data = await res.json() as { id?: string; error?: string };
      if (!res.ok) {
        setState({ phase: 'error', message: data.error ?? 'Submission failed. Please try again.' });
      } else {
        setState({ phase: 'confirmed', id: data.id! });
      }
    } catch {
      setState({ phase: 'error', message: 'Unable to reach the server. Please check your connection and try again.' });
    }
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
          <div>
            <h1 className="text-base font-semibold tracking-tight text-foreground">TTB Vision</h1>
            <p className="text-xs text-muted-foreground">Label Application Submission</p>
          </div>
          <nav className="flex items-center gap-4" aria-label="Main navigation">
            <Link href="/queue" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Agent Queue
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        {state.phase === 'confirmed' ? (
          <div className="flex flex-col items-center gap-6 py-16 text-center">
            <CheckCircle2 className="size-14 text-green-600" aria-hidden />
            <div>
              <h2 className="text-xl font-semibold text-foreground">Your application has been received.</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                A TTB compliance agent will review your label submission. You will be contacted
                if additional information is needed.
              </p>
            </div>
            <p className="text-xs text-muted-foreground font-mono">Reference ID: {state.id}</p>
            <button
              onClick={() => setState({ phase: 'form' })}
              className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors"
            >
              Submit another application
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Submit Label Application</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Enter your COLA application fields and upload your label image(s). A TTB compliance
                agent will review your submission. You will not receive AI verification results —
                your submission will be reviewed by a human agent.
              </p>
            </div>
            <Separator />

            {state.phase === 'error' && (
              <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3">
                <AlertCircle className="size-4 shrink-0 mt-0.5 text-destructive" aria-hidden />
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium text-destructive">Submission Failed</p>
                  <p className="text-sm text-muted-foreground">{state.message}</p>
                </div>
              </div>
            )}

            <VerificationForm
              onSubmit={handleSubmit}
              loading={state.phase === 'loading'}
              hasExistingResult={false}
              submitLabel="Submit Application"
            />
          </div>
        )}
      </main>
    </div>
  );
}
