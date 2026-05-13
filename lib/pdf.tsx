'use client';

import React from 'react';
import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer';
import type { VerificationResponse, FieldVerificationResult, BatchSummary, BatchLabelStatus } from '@/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const DISCLAIMER =
  'This result is a verification assist. Final compliance determination is the responsibility of the TTB compliance agent.';

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

function statusLabel(status: FieldVerificationResult['status']): string {
  if (status === 'pass') return 'PASS';
  if (status === 'flag') return 'FLAGGED';
  return 'UNABLE TO VERIFY';
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    paddingTop: 40,
    paddingBottom: 40,
    paddingLeft: 40,
    paddingRight: 40,
    color: '#111827',
  },

  // Header
  title: { fontSize: 14, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  subtitle: { fontSize: 9, color: '#6b7280', marginBottom: 16 },

  // Status banner
  bannerPass: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderStyle: 'solid',
    borderRadius: 4,
    padding: 8,
    marginBottom: 16,
  },
  bannerFlag: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderStyle: 'solid',
    borderRadius: 4,
    padding: 8,
    marginBottom: 16,
  },
  bannerPassText: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#166534' },
  bannerFlagText: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#92400e' },

  // Section headings
  sectionTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 6, marginTop: 12 },
  sectionSubtitle: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#6b7280',
    marginBottom: 4,
    marginTop: 8,
  },

  // Table
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f9fafb',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    borderBottomStyle: 'solid',
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    borderBottomStyle: 'solid',
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  tableRowAlt: { backgroundColor: '#f9fafb' },
  colField: { width: '18%' },
  colAppVal: { width: '28%' },
  colLabelVal: { width: '28%' },
  colStatus: { width: '16%' },
  colConf: { width: '10%' },
  headerCell: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#6b7280' },
  cell: { fontSize: 8, color: '#374151' },
  cellNote: { fontSize: 7, color: '#6b7280', marginTop: 2 },
  cellPass: { color: '#166534' },
  cellFlag: { color: '#b45309' },
  cellUnable: { color: '#c2410c' },

  // Compliance rows
  checkRow: { flexDirection: 'row', marginBottom: 4 },
  checkMark: { width: 12, fontSize: 8, fontFamily: 'Helvetica-Bold' },
  checkMarkPass: { color: '#166534' },
  checkMarkFail: { color: '#b45309' },
  checkLabel: { fontSize: 8, flex: 1, color: '#374151' },
  checkResult: { fontSize: 8, fontFamily: 'Helvetica-Bold' },
  checkResultPass: { color: '#166534' },
  checkResultFail: { color: '#b45309' },
  checkNote: { fontSize: 7, color: '#6b7280', marginLeft: 12, marginBottom: 4 },

  // Metadata + footer
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    borderBottomStyle: 'solid',
    marginVertical: 8,
  },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  metaItem: { fontSize: 8, color: '#6b7280', marginRight: 16, marginBottom: 2 },
  metaLabel: { fontFamily: 'Helvetica-Bold', color: '#6b7280' },
  disclaimerText: { fontSize: 7.5, color: '#6b7280' },
  disclaimerBold: { fontFamily: 'Helvetica-Bold' },
});

// ─── PDF Document ─────────────────────────────────────────────────────────────

function ComplianceCheckRow({
  label,
  pass,
  note,
}: {
  label: string;
  pass: boolean;
  note?: string;
}) {
  return (
    <>
      <View style={s.checkRow}>
        <Text style={[s.checkMark, pass ? s.checkMarkPass : s.checkMarkFail]}>
          {pass ? '✓' : '!'}
        </Text>
        <Text style={s.checkLabel}>{label}</Text>
        <Text style={[s.checkResult, pass ? s.checkResultPass : s.checkResultFail]}>
          {pass ? 'Pass' : 'Failed'}
        </Text>
      </View>
      {note && <Text style={s.checkNote}>{note}</Text>}
    </>
  );
}

function SingleLabelPDFDocument({ result }: { result: VerificationResponse }) {
  const isPass = result.overall_status === 'pass';
  const bannerText = isPass
    ? 'No Issues Detected — Ready for Agent Sign-Off'
    : `Fields Flagged — Agent Review Required`;

  return (
    <Document title={`TTB Vision — ${result.metadata.verification_id}`} author="TTB Vision">
      <Page size="A4" style={s.page}>
        {/* Header */}
        <Text style={s.title}>TTB Vision</Text>
        <Text style={s.subtitle}>AI-Powered Label Verification Report</Text>

        {/* Overall Status */}
        <View style={isPass ? s.bannerPass : s.bannerFlag}>
          <Text style={isPass ? s.bannerPassText : s.bannerFlagText}>{bannerText}</Text>
        </View>

        {/* Field Verification Table */}
        <Text style={s.sectionTitle}>Field Verification</Text>
        <View style={s.tableHeader}>
          <Text style={[s.headerCell, s.colField]}>Field</Text>
          <Text style={[s.headerCell, s.colAppVal]}>Application Value</Text>
          <Text style={[s.headerCell, s.colLabelVal]}>Label Value</Text>
          <Text style={[s.headerCell, s.colStatus]}>Status</Text>
          <Text style={[s.headerCell, s.colConf]}>Conf.</Text>
        </View>
        {result.fields.map((f, i) => {
          const statusStyle =
            f.status === 'pass' ? s.cellPass : f.status === 'flag' ? s.cellFlag : s.cellUnable;
          return (
            <View key={f.field} style={[s.tableRow, i % 2 !== 0 ? s.tableRowAlt : {}]}>
              <View style={s.colField}>
                <Text style={s.cell}>{fieldLabel(f.field)}</Text>
              </View>
              <View style={s.colAppVal}>
                <Text style={s.cell}>{f.app_value}</Text>
              </View>
              <View style={s.colLabelVal}>
                <Text style={s.cell}>{f.label_value ?? '—'}</Text>
              </View>
              <View style={s.colStatus}>
                <Text style={[s.cell, statusStyle]}>{statusLabel(f.status)}</Text>
                {f.note && <Text style={s.cellNote}>{f.note}</Text>}
              </View>
              <View style={s.colConf}>
                <Text style={s.cell}>{Math.round(f.confidence * 100)}%</Text>
              </View>
            </View>
          );
        })}

        {/* Compliance Checks */}
        <Text style={s.sectionTitle}>TTB Compliance Checks</Text>
        <Text style={s.sectionSubtitle}>Government Warning (27 CFR Part 16)</Text>
        <ComplianceCheckRow
          label="Warning statement present"
          pass={result.compliance.government_warning_present}
        />
        <ComplianceCheckRow
          label="Exact statutory text (verbatim)"
          pass={result.compliance.government_warning_verbatim}
        />
        <ComplianceCheckRow
          label="'GOVERNMENT WARNING:' in ALL CAPS and bold"
          pass={result.compliance.government_warning_caps_bold}
          note={result.compliance.government_warning_note}
        />
        <Text style={s.sectionSubtitle}>Alcohol Content Format (27 CFR § 5.65)</Text>
        <ComplianceCheckRow
          label="ABV format compliant"
          pass={result.compliance.abv_format_compliant}
          note={result.compliance.abv_format_note}
        />

        {/* Metadata */}
        <View style={s.divider} />
        <View style={s.metaRow}>
          <Text style={s.metaItem}>
            <Text style={s.metaLabel}>Verification ID: </Text>
            {result.metadata.verification_id}
          </Text>
          <Text style={s.metaItem}>
            <Text style={s.metaLabel}>Timestamp: </Text>
            {new Date(result.metadata.timestamp).toLocaleString()}
          </Text>
          <Text style={s.metaItem}>
            <Text style={s.metaLabel}>Model: </Text>
            {result.metadata.model_version}
          </Text>
          <Text style={s.metaItem}>
            <Text style={s.metaLabel}>Ruleset: </Text>v{result.metadata.ruleset_version}
          </Text>
        </View>

        {/* Disclaimer */}
        <View style={s.divider} />
        <Text style={s.disclaimerText}>
          <Text style={s.disclaimerBold}>Disclaimer: </Text>
          {DISCLAIMER}
        </Text>
      </Page>
    </Document>
  );
}

// ─── Batch PDF Document ───────────────────────────────────────────────────────

const BATCH_STATUS_LABEL: Record<BatchLabelStatus, string> = {
  pass: 'PASS',
  flag_for_review: 'FLAGGED',
  failed: 'ERROR',
  image_not_found: 'NOT FOUND',
};

const BATCH_STATUS_COLOR: Record<BatchLabelStatus, string> = {
  pass: '#166534',
  flag_for_review: '#b45309',
  failed: '#b91c1c',
  image_not_found: '#c2410c',
};

const sb = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    paddingTop: 40,
    paddingBottom: 40,
    paddingLeft: 40,
    paddingRight: 40,
    color: '#111827',
  },
  title: { fontSize: 14, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  subtitle: { fontSize: 9, color: '#6b7280', marginBottom: 12 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 },
  statBox: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderStyle: 'solid',
    borderRadius: 4,
    padding: 8,
    marginRight: 8,
    marginBottom: 8,
    minWidth: 80,
  },
  statValue: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: '#111827' },
  statLabel: { fontSize: 7.5, color: '#6b7280', marginTop: 2 },
  sectionTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 6, marginTop: 8 },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f9fafb',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    borderBottomStyle: 'solid',
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    borderBottomStyle: 'solid',
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  tableRowAlt: { backgroundColor: '#f9fafb' },
  bColRow: { width: '6%' },
  bColBrand: { width: '28%' },
  bColFile: { width: '26%' },
  bColStatus: { width: '14%' },
  bColNote: { width: '26%' },
  headerCell: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#6b7280' },
  cell: { fontSize: 8, color: '#374151' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  metaItem: { fontSize: 8, color: '#6b7280', marginRight: 16, marginBottom: 2 },
  metaLabel: { fontFamily: 'Helvetica-Bold', color: '#6b7280' },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    borderBottomStyle: 'solid',
    marginVertical: 8,
  },
  disclaimerText: { fontSize: 7.5, color: '#6b7280' },
  disclaimerBold: { fontFamily: 'Helvetica-Bold' },
});

function BatchPDFDocument({ summary }: { summary: BatchSummary }) {
  return (
    <Document title={`TTB Vision Batch — ${summary.batch_id}`} author="TTB Vision">
      <Page size="A4" style={sb.page}>
        {/* Header */}
        <Text style={sb.title}>TTB Vision — Batch Verification Report</Text>
        <Text style={sb.subtitle}>AI-Powered Label Verification</Text>

        {/* Summary stats */}
        <Text style={sb.sectionTitle}>Batch Summary</Text>
        <View style={sb.statsRow}>
          {[
            { label: 'Submitted', value: summary.total_submitted },
            { label: 'Verified', value: summary.total_verified },
            { label: 'Pass', value: summary.pass_count },
            { label: 'Flagged', value: summary.flag_count },
            { label: 'Failed', value: summary.failed_count },
            { label: 'Not Found', value: summary.not_found_count },
          ].map(({ label, value }) => (
            <View key={label} style={sb.statBox}>
              <Text style={sb.statValue}>{value}</Text>
              <Text style={sb.statLabel}>{label}</Text>
            </View>
          ))}
        </View>

        {/* Results table */}
        <Text style={sb.sectionTitle}>Results</Text>
        <View style={sb.tableHeader}>
          <Text style={[sb.headerCell, sb.bColRow]}>#</Text>
          <Text style={[sb.headerCell, sb.bColBrand]}>Brand Name</Text>
          <Text style={[sb.headerCell, sb.bColFile]}>Image File</Text>
          <Text style={[sb.headerCell, sb.bColStatus]}>Status</Text>
          <Text style={[sb.headerCell, sb.bColNote]}>Note / Error</Text>
        </View>
        {summary.results.map((r, i) => {
          const statusColor = BATCH_STATUS_COLOR[r.status];
          const note = r.error ?? (r.result?.fields.filter((f) => f.status === 'flag').map((f) => f.field).join(', ') || undefined);
          return (
            <View key={`${r.row}-${r.image_filename}`} style={[sb.tableRow, i % 2 !== 0 ? sb.tableRowAlt : {}]}>
              <Text style={[sb.cell, sb.bColRow]}>{r.row}</Text>
              <Text style={[sb.cell, sb.bColBrand]}>{r.brand_name}</Text>
              <Text style={[sb.cell, sb.bColFile]}>{r.image_filename}</Text>
              <Text style={[sb.cell, sb.bColStatus, { color: statusColor }]}>
                {BATCH_STATUS_LABEL[r.status]}
              </Text>
              <Text style={[sb.cell, sb.bColNote, { color: '#6b7280' }]}>{note ?? ''}</Text>
            </View>
          );
        })}

        {/* Metadata */}
        <View style={sb.divider} />
        <View style={sb.metaRow}>
          <Text style={sb.metaItem}><Text style={sb.metaLabel}>Batch ID: </Text>{summary.batch_id}</Text>
          <Text style={sb.metaItem}><Text style={sb.metaLabel}>Started: </Text>{new Date(summary.started_at).toLocaleString()}</Text>
          <Text style={sb.metaItem}><Text style={sb.metaLabel}>Completed: </Text>{new Date(summary.completed_at).toLocaleString()}</Text>
          <Text style={sb.metaItem}><Text style={sb.metaLabel}>Model: </Text>{summary.model_version}</Text>
          <Text style={sb.metaItem}><Text style={sb.metaLabel}>Ruleset: </Text>v{summary.ruleset_version}</Text>
        </View>

        {/* Disclaimer */}
        <View style={sb.divider} />
        <Text style={sb.disclaimerText}>
          <Text style={sb.disclaimerBold}>Disclaimer: </Text>
          {DISCLAIMER}
        </Text>
      </Page>
    </Document>
  );
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export async function generatePDFBlob(result: VerificationResponse): Promise<Blob> {
  return pdf(<SingleLabelPDFDocument result={result} />).toBlob();
}

export function generatePlainText(result: VerificationResponse): string {
  const sep = '─'.repeat(60);
  const lines: string[] = [];

  lines.push('TTB VISION — LABEL VERIFICATION REPORT');
  lines.push(sep);
  lines.push('');

  const statusText =
    result.overall_status === 'pass'
      ? 'No Issues Detected — Ready for Agent Sign-Off'
      : 'Fields Flagged — Agent Review Required';
  lines.push(`OVERALL STATUS: ${statusText}`);
  lines.push('');

  lines.push('FIELD VERIFICATION');
  lines.push(sep);
  for (const f of result.fields) {
    lines.push(`Field:             ${fieldLabel(f.field)}`);
    lines.push(`Application Value: ${f.app_value}`);
    lines.push(`Label Value:       ${f.label_value ?? '—'}`);
    lines.push(`Status:            ${statusLabel(f.status)}`);
    lines.push(`Confidence:        ${Math.round(f.confidence * 100)}%`);
    if (f.note) lines.push(`Note:              ${f.note}`);
    lines.push('');
  }

  lines.push('TTB COMPLIANCE CHECKS');
  lines.push(sep);
  lines.push('Government Warning (27 CFR Part 16)');
  lines.push(`  Warning statement present:           ${result.compliance.government_warning_present ? 'Pass' : 'Failed'}`);
  lines.push(`  Exact statutory text:                ${result.compliance.government_warning_verbatim ? 'Pass' : 'Failed'}`);
  lines.push(`  'GOVERNMENT WARNING:' caps/bold:     ${result.compliance.government_warning_caps_bold ? 'Pass' : 'Failed'}`);
  if (result.compliance.government_warning_note) {
    lines.push(`  Note: ${result.compliance.government_warning_note}`);
  }
  lines.push('');
  lines.push('Alcohol Content Format (27 CFR § 5.65)');
  lines.push(`  ABV format compliant:                ${result.compliance.abv_format_compliant ? 'Pass' : 'Failed'}`);
  if (result.compliance.abv_format_note) {
    lines.push(`  Note: ${result.compliance.abv_format_note}`);
  }
  lines.push('');

  lines.push(sep);
  lines.push(`Verification ID: ${result.metadata.verification_id}`);
  lines.push(`Timestamp:       ${new Date(result.metadata.timestamp).toLocaleString()}`);
  lines.push(`Model:           ${result.metadata.model_version}`);
  lines.push(`Ruleset:         v${result.metadata.ruleset_version}`);
  lines.push('');

  lines.push(sep);
  lines.push(`DISCLAIMER: ${DISCLAIMER}`);

  return lines.join('\n');
}

export async function generateBatchPDFBlob(summary: BatchSummary): Promise<Blob> {
  return pdf(<BatchPDFDocument summary={summary} />).toBlob();
}

export function generateBatchPlainText(summary: BatchSummary): string {
  const sep = '─'.repeat(60);
  const lines: string[] = [];

  lines.push('TTB VISION — BATCH VERIFICATION REPORT');
  lines.push(sep);
  lines.push('');
  lines.push(`Batch ID:    ${summary.batch_id}`);
  lines.push(`Started:     ${new Date(summary.started_at).toLocaleString()}`);
  lines.push(`Completed:   ${new Date(summary.completed_at).toLocaleString()}`);
  lines.push(`Model:       ${summary.model_version}`);
  lines.push(`Ruleset:     v${summary.ruleset_version}`);
  lines.push('');

  lines.push('SUMMARY');
  lines.push(sep);
  lines.push(`Submitted:   ${summary.total_submitted}`);
  lines.push(`Verified:    ${summary.total_verified}`);
  lines.push(`Pass:        ${summary.pass_count}`);
  lines.push(`Flagged:     ${summary.flag_count}`);
  lines.push(`Failed:      ${summary.failed_count}`);
  lines.push(`Not Found:   ${summary.not_found_count}`);
  lines.push('');

  lines.push('RESULTS');
  lines.push(sep);
  for (const r of summary.results) {
    lines.push(`Row ${r.row}  ${BATCH_STATUS_LABEL[r.status].padEnd(10)}  ${r.brand_name}  (${r.image_filename})`);
    if (r.error) lines.push(`       Error: ${r.error}`);
    if (r.result) {
      const flagged = r.result.fields.filter((f) => f.status === 'flag');
      if (flagged.length > 0) {
        lines.push(`       Flagged fields: ${flagged.map((f) => fieldLabel(f.field)).join(', ')}`);
      }
    }
  }
  lines.push('');

  lines.push(sep);
  lines.push(`DISCLAIMER: ${DISCLAIMER}`);

  return lines.join('\n');
}
