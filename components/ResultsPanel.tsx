'use client';

import { CheckCircle, AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import type { VerificationResponse, FieldVerificationResult } from '@/types';

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: FieldVerificationResult['status'] }) {
  if (status === 'pass') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
        <CheckCircle className="size-3 shrink-0" aria-hidden />
        PASS
      </span>
    );
  }
  if (status === 'flag') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
        <AlertTriangle className="size-3 shrink-0" aria-hidden />
        FLAGGED
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700">
      <AlertCircle className="size-3 shrink-0" aria-hidden />
      UNABLE TO VERIFY
    </span>
  );
}

function ConfidenceBar({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const barColor =
    confidence >= 0.9
      ? 'bg-green-500'
      : confidence >= 0.7
      ? 'bg-blue-500'
      : confidence >= 0.5
      ? 'bg-amber-500'
      : 'bg-red-400';

  return (
    <div className="flex items-center gap-2">
      <div
        role="meter"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Confidence: ${pct}%`}
        className="relative h-1.5 w-20 rounded-full bg-muted overflow-hidden"
      >
        <div
          className={cn('h-full rounded-full', barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground w-8">{pct}%</span>
    </div>
  );
}

function CheckRow({ label, pass, note }: { label: string; pass: boolean; note?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-2 text-sm">
        {pass ? (
          <CheckCircle className="size-4 shrink-0 text-green-600" aria-hidden />
        ) : (
          <AlertTriangle className="size-4 shrink-0 text-amber-600" aria-hidden />
        )}
        <span className={cn(pass ? 'text-foreground' : 'font-medium text-amber-700')}>{label}</span>
        <span className={cn('text-xs', pass ? 'text-green-700' : 'text-amber-700')}>
          {pass ? 'Pass' : 'Failed'}
        </span>
      </div>
      {note && <p className="ml-6 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  brand_name: 'Brand Name',
  class_type: 'Class / Type',
  abv: 'Alcohol Content (ABV)',
  net_contents: 'Net Contents',
  bottler_name_address: 'Bottler Name & Address',
  country_of_origin: 'Country of Origin',
};

function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

type BannerType = 'pass' | 'flag' | 'unable';

function computeBanner(result: VerificationResponse): { type: BannerType; text: string } {
  if (result.overall_status === 'pass') {
    return { type: 'pass', text: 'No Issues Detected — Ready for Agent Sign-Off' };
  }

  const flagCount = result.fields.filter((f) => f.status === 'flag').length;
  const unableCount = result.fields.filter((f) => f.status === 'unable_to_verify').length;
  const complianceFailed =
    !result.compliance.government_warning_present ||
    !result.compliance.government_warning_verbatim ||
    !result.compliance.government_warning_caps_bold ||
    !result.compliance.abv_format_compliant;

  if (unableCount > 0 && flagCount === 0 && !complianceFailed) {
    return {
      type: 'unable',
      text: `Image Quality Insufficient for ${unableCount} Field${unableCount !== 1 ? 's' : ''} — Manual Review Required`,
    };
  }

  const reviewCount = flagCount + (complianceFailed ? 1 : 0);
  return {
    type: 'flag',
    text: `${reviewCount} Field${reviewCount !== 1 ? 's' : ''} Flagged — Agent Review Required`,
  };
}

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  result: VerificationResponse;
  exportSlot?: React.ReactNode; // Phase 4 will pass ReportExport here
}

export function ResultsPanel({ result, exportSlot }: Props) {
  const banner = computeBanner(result);

  const bannerStyles: Record<BannerType, { wrapper: string; icon: React.ReactNode }> = {
    pass: {
      wrapper: 'bg-green-50 border border-green-200 text-green-800',
      icon: <CheckCircle className="size-5 shrink-0" aria-hidden />,
    },
    flag: {
      wrapper: 'bg-amber-50 border border-amber-200 text-amber-800',
      icon: <AlertTriangle className="size-5 shrink-0" aria-hidden />,
    },
    unable: {
      wrapper: 'bg-orange-50 border border-orange-200 text-orange-800',
      icon: <AlertCircle className="size-5 shrink-0" aria-hidden />,
    },
  };

  const { wrapper, icon } = bannerStyles[banner.type];

  return (
    <section aria-label="Verification Results" className="flex flex-col gap-6">
      {/* Overall Status Banner */}
      <div
        role="status"
        aria-live="polite"
        className={cn('flex items-center gap-3 rounded-lg px-4 py-3 font-medium', wrapper)}
      >
        {icon}
        <span>{banner.text}</span>
      </div>

      {/* Per-Field Results */}
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">Field Verification</h2>
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="border-b border-border">
                <th scope="col" className="px-3 py-2 text-left font-medium text-muted-foreground">Field</th>
                <th scope="col" className="px-3 py-2 text-left font-medium text-muted-foreground">Application Value</th>
                <th scope="col" className="px-3 py-2 text-left font-medium text-muted-foreground hidden sm:table-cell">Label Value</th>
                <th scope="col" className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                <th scope="col" className="px-3 py-2 text-left font-medium text-muted-foreground hidden md:table-cell">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {result.fields.map((field, i) => (
                <tr
                  key={field.field}
                  className={cn(
                    'border-b border-border last:border-0 align-top',
                    i % 2 === 0 ? 'bg-background' : 'bg-muted/20'
                  )}
                >
                  <td className="px-3 py-2.5 font-medium text-foreground whitespace-nowrap">
                    {fieldLabel(field.field)}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground max-w-[180px]">
                    <span className="break-words">{field.app_value}</span>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground max-w-[180px] hidden sm:table-cell">
                    <span className="break-words">{field.label_value ?? '—'}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-col gap-1">
                      <StatusBadge status={field.status} />
                      {field.note && (
                        <p className="text-xs text-muted-foreground mt-1">{field.note}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 hidden md:table-cell">
                    <ConfidenceBar confidence={field.confidence} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Compliance Checks */}
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-foreground">TTB Compliance Checks</h2>
        <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Government Warning (27 CFR Part 16)</p>
            <CheckRow
              label="Warning statement present"
              pass={result.compliance.government_warning_present}
            />
            <CheckRow
              label="Exact statutory text (verbatim)"
              pass={result.compliance.government_warning_verbatim}
            />
            <CheckRow
              label="'GOVERNMENT WARNING:' in ALL CAPS and bold"
              pass={result.compliance.government_warning_caps_bold}
              note={result.compliance.government_warning_note}
            />
          </div>
          <Separator />
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Alcohol Content Format (27 CFR § 5.65)</p>
            <CheckRow
              label="ABV format compliant"
              pass={result.compliance.abv_format_compliant}
              note={result.compliance.abv_format_note}
            />
          </div>
        </div>
      </div>

      {/* Export slot (populated in Phase 4) */}
      {exportSlot}

      {/* Metadata + Disclaimer */}
      <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 flex flex-col gap-2 text-xs text-muted-foreground">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span><span className="font-medium">Verification ID:</span> {result.metadata.verification_id}</span>
          <span><span className="font-medium">Timestamp:</span> {new Date(result.metadata.timestamp).toLocaleString()}</span>
          <span><span className="font-medium">Model:</span> {result.metadata.model_version}</span>
          <span><span className="font-medium">Ruleset:</span> v{result.metadata.ruleset_version}</span>
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
    </section>
  );
}
