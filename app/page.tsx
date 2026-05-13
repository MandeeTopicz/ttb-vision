import Link from 'next/link';
import { ChevronRight, Upload, ClipboardList, FileStack } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-4xl items-center px-4 py-3 sm:px-6">
          <div>
            <h1 className="text-base font-semibold tracking-tight text-foreground">TTB Vision</h1>
            <p className="text-xs text-muted-foreground">AI-Powered Label Verification</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <div className="flex flex-col items-center gap-4 text-center mb-14">
          <h2 className="text-2xl font-semibold text-foreground tracking-tight">
            TTB Label Verification
          </h2>
          <p className="max-w-xl text-sm text-muted-foreground leading-relaxed">
            AI-powered label verification assist for TTB compliance agents. Vendors submit label
            applications. Agents review submissions and trigger AI verification. Final compliance
            determination is always made by the human agent.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Vendor */}
          <Link
            href="/submit"
            className="group flex flex-col gap-4 rounded-lg border border-border bg-card px-6 py-6 transition-colors hover:border-ring hover:bg-muted/30"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center justify-center size-10 rounded-lg bg-muted">
                <Upload className="size-5 text-muted-foreground" aria-hidden />
              </div>
              <ChevronRight className="size-4 text-muted-foreground group-hover:text-foreground transition-colors" aria-hidden />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Vendor</p>
              <h3 className="text-sm font-semibold text-foreground">Submit Application</h3>
              <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                Submit your COLA application data and label images for TTB review.
              </p>
            </div>
          </Link>

          {/* Agent */}
          <Link
            href="/queue"
            className="group flex flex-col gap-4 rounded-lg border border-border bg-card px-6 py-6 transition-colors hover:border-ring hover:bg-muted/30"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center justify-center size-10 rounded-lg bg-muted">
                <ClipboardList className="size-5 text-muted-foreground" aria-hidden />
              </div>
              <ChevronRight className="size-4 text-muted-foreground group-hover:text-foreground transition-colors" aria-hidden />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Agent</p>
              <h3 className="text-sm font-semibold text-foreground">Agent Queue</h3>
              <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                Review pending submissions, trigger AI verification, and export compliance reports.
              </p>
            </div>
          </Link>

          {/* Batch / Importer */}
          <Link
            href="/batch"
            className="group flex flex-col gap-4 rounded-lg border border-border bg-card px-6 py-6 transition-colors hover:border-ring hover:bg-muted/30"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center justify-center size-10 rounded-lg bg-muted">
                <FileStack className="size-5 text-muted-foreground" aria-hidden />
              </div>
              <ChevronRight className="size-4 text-muted-foreground group-hover:text-foreground transition-colors" aria-hidden />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Importer</p>
              <h3 className="text-sm font-semibold text-foreground">Batch Verification</h3>
              <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                Submit a CSV manifest and ZIP of label images for bulk verification.
              </p>
            </div>
          </Link>
        </div>
      </main>
    </div>
  );
}
