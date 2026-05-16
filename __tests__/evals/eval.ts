/**
 * LLM output evals for TTB Vision.
 *
 * Run with: npm run eval
 * Capture baseline: npm run eval:capture
 * Requires: OPENAI_API_KEY set in .env.local
 * Skips silently when OPENAI_API_KEY is absent so CI never fails.
 *
 * Three layers of checks per case:
 *   1. Behavioral assertions — specific fields must have expected status/confidence
 *   2. Calibration invariants — confidence scores must be consistent with status
 *   3. Regression detection — output must match the captured baseline (if one exists)
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { verify } from '@/lib/verify';
import type { VerificationResponse } from '@/types';
import { EVAL_CASES } from './cases';
import type { EvalCase, EvalCaseResult } from './types';

const FIXTURE_DIR = path.join(__dirname, '../fixtures');
const BASELINE_DIR = path.join(__dirname, 'baselines');
const CAPTURE = process.env.EVAL_CAPTURE === 'true';
const INTER_CASE_DELAY_MS = 3_000;
const TIMEOUT_MS = EVAL_CASES.length * (30_000 + INTER_CASE_DELAY_MS) + 5_000;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Assertion runner ─────────────────────────────────────────────────────────

function runAssertions(
  response: VerificationResponse,
  evalCase: EvalCase
): { failures: string[]; calibrationIssues: string[]; regressionDiffs: string[] } {
  const failures: string[] = [];
  const calibrationIssues: string[] = [];
  const regressionDiffs: string[] = [];

  // 1. Overall status
  if (
    evalCase.assertions.overall_status &&
    response.overall_status !== evalCase.assertions.overall_status
  ) {
    failures.push(
      `overall_status: expected '${evalCase.assertions.overall_status}', got '${response.overall_status}'`
    );
  }

  // 2. Field-level assertions
  for (const fa of evalCase.assertions.fields ?? []) {
    const actual = response.fields.find((f) => f.field === fa.field);
    if (!actual) {
      failures.push(`field '${fa.field}' not present in response`);
      continue;
    }
    if (actual.status !== fa.status) {
      failures.push(
        `field '${fa.field}': expected status='${fa.status}', got '${actual.status}' (confidence=${actual.confidence.toFixed(2)}, label_value='${actual.label_value ?? ''}', note='${actual.note ?? ''}')`
      );
    }
    if (fa.min_confidence !== undefined && actual.confidence < fa.min_confidence) {
      failures.push(
        `field '${fa.field}': expected confidence >= ${fa.min_confidence}, got ${actual.confidence.toFixed(2)}`
      );
    }
    if (fa.note_contains) {
      const note = actual.note?.toLowerCase() ?? '';
      if (!note.includes(fa.note_contains.toLowerCase())) {
        failures.push(
          `field '${fa.field}': note expected to contain '${fa.note_contains}', got '${actual.note ?? '(none)'}'`
        );
      }
    }
  }

  // 3. Compliance assertions
  const { compliance } = response;
  for (const [key, expected] of Object.entries(evalCase.assertions.compliance ?? {})) {
    const actual = compliance[key as keyof typeof compliance];
    if (actual !== expected) {
      failures.push(`compliance.${key}: expected ${expected}, got ${actual}`);
    }
  }

  // 4. Calibration invariants — apply to every field in the response
  // Rule: confidence <0.50 ↔ status='unable_to_verify' (per ttb_rules.json thresholds)
  for (const f of response.fields) {
    if (f.status === 'unable_to_verify' && f.confidence >= 0.50) {
      calibrationIssues.push(
        `field '${f.field}': status='unable_to_verify' but confidence=${f.confidence.toFixed(2)} (must be <0.50)`
      );
    }
    if ((f.status === 'pass' || f.status === 'flag') && f.confidence < 0.50) {
      calibrationIssues.push(
        `field '${f.field}': status='${f.status}' but confidence=${f.confidence.toFixed(2)} (must be >=0.50)`
      );
    }
  }

  // 5. Structural consistency — overall_status must agree with field/compliance results
  const anyFieldFlagged = response.fields.some(
    (f) => f.status === 'flag' || f.status === 'unable_to_verify'
  );
  const anyComplianceFail =
    !compliance.government_warning_present ||
    !compliance.government_warning_verbatim ||
    !compliance.government_warning_caps_bold ||
    !compliance.abv_format_compliant;

  if (response.overall_status === 'pass' && (anyFieldFlagged || anyComplianceFail)) {
    calibrationIssues.push(
      `overall_status='pass' but ${anyFieldFlagged ? 'field(s) are flagged' : 'compliance check(s) failed'}`
    );
  }
  if (response.overall_status === 'flag_for_review' && !anyFieldFlagged && !anyComplianceFail) {
    calibrationIssues.push(
      `overall_status='flag_for_review' but no fields are flagged and all compliance checks pass`
    );
  }

  // 6. Regression detection — compare against saved baseline if one exists
  const baselinePath = path.join(BASELINE_DIR, `${evalCase.id}.json`);
  if (!CAPTURE && fs.existsSync(baselinePath)) {
    let baseline: VerificationResponse;
    try {
      baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf-8')) as VerificationResponse;
    } catch {
      regressionDiffs.push(`baseline file exists but could not be parsed: ${baselinePath}`);
      return { failures, calibrationIssues, regressionDiffs };
    }

    if (response.overall_status !== baseline.overall_status) {
      regressionDiffs.push(
        `overall_status drifted: baseline='${baseline.overall_status}', now='${response.overall_status}'`
      );
    }

    for (const baseField of baseline.fields) {
      const current = response.fields.find((f) => f.field === baseField.field);
      if (!current) {
        regressionDiffs.push(`field '${baseField.field}' present in baseline but missing from response`);
        continue;
      }
      if (current.status !== baseField.status) {
        regressionDiffs.push(
          `field '${baseField.field}' status drifted: baseline='${baseField.status}', now='${current.status}'`
        );
      }
    }

    for (const currentField of response.fields) {
      if (!baseline.fields.find((f) => f.field === currentField.field)) {
        regressionDiffs.push(`field '${currentField.field}' appeared in response but not in baseline`);
      }
    }
  }

  return { failures, calibrationIssues, regressionDiffs };
}

// ─── Report printer ───────────────────────────────────────────────────────────

function printReport(results: EvalCaseResult[]): void {
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;

  console.log('\n  ── LLM Eval Results ─────────────────────────────────────────');
  for (const r of results) {
    const icon = r.passed ? '✓' : '✗';
    console.log(`\n  ${icon} [${r.caseId}] ${r.description} (${r.durationMs.toLocaleString()}ms)`);

    // Field summary
    for (const f of r.response.fields) {
      const icon2 = f.status === 'pass' ? '✓' : f.status === 'flag' ? '⚑' : '?';
      const conf = f.confidence.toFixed(2);
      const note = f.note ? `  → ${f.note}` : '';
      console.log(`      ${icon2} ${f.field.padEnd(24)} status=${f.status.padEnd(18)} confidence=${conf}${note}`);
    }

    // Compliance summary
    const c = r.response.compliance;
    const warnOk = c.government_warning_present && c.government_warning_verbatim && c.government_warning_caps_bold;
    console.log(`      ${warnOk ? '✓' : '⚑'} government_warning               ${warnOk ? 'all checks pass' : 'FAIL'}`);
    console.log(`      ${c.abv_format_compliant ? '✓' : '⚑'} abv_format_compliant            ${c.abv_format_compliant ? 'pass' : 'FAIL'}`);

    if (r.failures.length > 0) {
      console.log(`\n    ASSERTION FAILURES:`);
      r.failures.forEach((f2) => console.log(`      ✗ ${f2}`));
    }
    if (r.calibrationIssues.length > 0) {
      console.log(`\n    CALIBRATION ISSUES:`);
      r.calibrationIssues.forEach((c2) => console.log(`      ⚠ ${c2}`));
    }
    if (r.regressionDiffs.length > 0) {
      console.log(`\n    REGRESSION DIFFS:`);
      r.regressionDiffs.forEach((d) => console.log(`      ⚠ ${d}`));
    }
  }

  console.log(`\n  ─────────────────────────────────────────────────────────────`);
  console.log(`  ${passed}/${total} cases passed`);
  if (CAPTURE) {
    console.log(`  Baselines written to __tests__/evals/baselines/ — commit these files.`);
  }
  console.log('');
}

// ─── Eval suite ───────────────────────────────────────────────────────────────

describe('LLM Evals — verify() output quality', () => {
  it(
    `all ${EVAL_CASES.length} eval cases pass`,
    async () => {
      if (!process.env.OPENAI_API_KEY) {
        console.log('\n  [eval] OPENAI_API_KEY not set — skipping LLM evals.\n');
        return;
      }

      if (!fs.existsSync(BASELINE_DIR)) {
        fs.mkdirSync(BASELINE_DIR, { recursive: true });
      }

      console.log(
        `\n  [eval] Running ${EVAL_CASES.length} cases against ${process.env.OPENAI_MODEL ?? 'gpt-4o'}${CAPTURE ? ' (CAPTURE MODE)' : ''}…`
      );

      const results: EvalCaseResult[] = [];

      for (let i = 0; i < EVAL_CASES.length; i++) {
        const evalCase = EVAL_CASES[i];
        const fixturePath = path.join(FIXTURE_DIR, evalCase.imageFile);

        if (!fs.existsSync(fixturePath)) {
          console.warn(`  [eval] Skipping '${evalCase.id}': fixture not found at ${fixturePath}`);
          continue;
        }

        const imageBuffer = fs.readFileSync(fixturePath);
        const mimeType = evalCase.imageFile.endsWith('.png') ? 'image/png' : 'image/jpeg';

        const start = Date.now();
        let response: VerificationResponse;

        try {
          response = await verify(evalCase.fields, [imageBuffer], [mimeType]);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          results.push({
            caseId: evalCase.id,
            description: evalCase.description,
            passed: false,
            failures: [`verify() threw: ${msg}`],
            calibrationIssues: [],
            regressionDiffs: [],
            response: null as unknown as VerificationResponse,
            durationMs: Date.now() - start,
          });
          console.log(`  [eval] ${i + 1}/${EVAL_CASES.length} ${evalCase.id} — ERROR: ${msg}`);
          if (i < EVAL_CASES.length - 1) await sleep(INTER_CASE_DELAY_MS);
          continue;
        }

        const durationMs = Date.now() - start;

        if (CAPTURE) {
          fs.writeFileSync(
            path.join(BASELINE_DIR, `${evalCase.id}.json`),
            JSON.stringify(response, null, 2)
          );
        }

        const { failures, calibrationIssues, regressionDiffs } = runAssertions(response, evalCase);
        const passed =
          failures.length === 0 && calibrationIssues.length === 0 && regressionDiffs.length === 0;

        results.push({
          caseId: evalCase.id,
          description: evalCase.description,
          passed,
          failures,
          calibrationIssues,
          regressionDiffs,
          response,
          durationMs,
        });

        const icon = passed ? '✓' : '✗';
        console.log(
          `  [eval] ${String(i + 1).padStart(2)}/${EVAL_CASES.length}  ${icon}  ${evalCase.id}  (${durationMs.toLocaleString()}ms)`
        );

        if (i < EVAL_CASES.length - 1) await sleep(INTER_CASE_DELAY_MS);
      }

      printReport(results);

      const allPassed = results.every((r) => r.passed);
      expect(
        allPassed,
        `${results.filter((r) => !r.passed).length} eval case(s) failed — see report above`
      ).toBe(true);
    },
    TIMEOUT_MS
  );
});
