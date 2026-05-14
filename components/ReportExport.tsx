'use client';

import { useState } from 'react';
import { Download, Clipboard, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  generatePDFBlob,
  generatePlainText,
  generateBatchPDFBlob,
  generateBatchPlainText,
} from '@/lib/pdf';
import type { VerificationResponse, BatchSummary } from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SingleProps {
  mode: 'single';
  result: VerificationResponse;
  agentDetermination?: 'approved' | 'rejected' | null;
  onExport?: () => void;
}

interface BatchProps {
  mode: 'batch';
  summary: BatchSummary;
  onExport?: () => void;
}

type Props = SingleProps | BatchProps;

// ─── Component ───────────────────────────────────────────────────────────────

export function ReportExport(props: Props) {
  const [pdfLoading, setPdfLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleDownloadPDF() {
    setPdfLoading(true);
    try {
      const blob =
        props.mode === 'single'
          ? await generatePDFBlob(props.result, props.agentDetermination)
          : await generateBatchPDFBlob(props.summary);

      const filename =
        props.mode === 'single'
          ? `ttb-vision-${props.result.metadata.verification_id}.pdf`
          : `ttb-vision-batch-${props.summary.batch_id}.pdf`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      props.onExport?.();
    } finally {
      setPdfLoading(false);
    }
  }

  async function handleCopyText() {
    const text =
      props.mode === 'single'
        ? generatePlainText(props.result, props.agentDetermination)
        : generateBatchPlainText(props.summary);

    await navigator.clipboard.writeText(text);
    props.onExport?.();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleDownloadPDF}
        disabled={pdfLoading}
        aria-label="Download PDF report"
      >
        {pdfLoading ? (
          <Loader2 className="size-3.5 mr-1.5 animate-spin" aria-hidden />
        ) : (
          <Download className="size-3.5 mr-1.5" aria-hidden />
        )}
        {pdfLoading ? 'Generating…' : 'Download PDF'}
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={handleCopyText}
        aria-label="Copy plain text report to clipboard"
      >
        {copied ? (
          <Check className="size-3.5 mr-1.5 text-green-600" aria-hidden />
        ) : (
          <Clipboard className="size-3.5 mr-1.5" aria-hidden />
        )}
        {copied ? 'Copied!' : 'Copy Report'}
      </Button>
    </div>
  );
}
