/**
 * Latency benchmark for verify() against the real OpenAI API.
 *
 * Run with: npm run bench
 * Requires: OPENAI_API_KEY set in environment (or .env.local loaded externally)
 * Requires: __tests__/fixtures/test-label-clean.jpg — a real JPEG label image
 *
 * Skips silently when OPENAI_API_KEY is absent so CI never fails.
 * Hard requirement: p95 ≤ 5,000ms (PRD §5).
 *
 * A 3s inter-run delay is applied between calls to avoid TPM exhaustion on Tier 1.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { verify } from '@/lib/verify';
import { buildSystemPrompt } from '@/lib/prompt';
import type { ApplicationFields } from '@/types';

// ─── Config ───────────────────────────────────────────────────────────────────

const RUNS = 20;
const P95_LIMIT_MS = 5_000;
const INTER_RUN_DELAY_MS = 3_000; // 3s between runs; vision calls are token-heavy
const TIMEOUT_MS = RUNS * (15_000 + INTER_RUN_DELAY_MS);

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FIXTURE_PATH = path.join(__dirname, 'fixtures/test-label-clean.jpg');

if (!fs.existsSync(FIXTURE_PATH)) {
  throw new Error(
    'Test fixture not found: __tests__/fixtures/test-label-clean.jpg' +
    ' — copy a real JPEG label image there before running the benchmark'
  );
}

const imageBuffer = fs.readFileSync(FIXTURE_PATH);
const imageMimeType = 'image/jpeg';

const fields: ApplicationFields = {
  beverage_type: 'distilled_spirits',
  is_import: false,
  brand_name: 'Old Tom Distillery',
  class_type: 'Kentucky Straight Bourbon Whiskey',
  abv: '45% Alc./Vol.',
  net_contents: '750 mL',
  bottler_name: 'Old Tom Distilling Co.',
  bottler_address: '123 Bourbon St, Louisville, KY 40202',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sortedAsc.length) - 1;
  return sortedAsc[Math.max(0, Math.min(idx, sortedAsc.length - 1))];
}

function formatMs(ms: number): string {
  return `${ms.toLocaleString()}ms`;
}

// ─── Benchmark ────────────────────────────────────────────────────────────────

describe('Latency Benchmark — verify() single label', () => {
  it(
    `p95 ≤ 5,000ms over 20 real API calls`,
    async () => {
      if (!process.env.OPENAI_API_KEY) {
        console.log('\n  [bench] OPENAI_API_KEY not set — skipping latency benchmark.\n');
        return;
      }

      const systemPrompt = buildSystemPrompt(fields.beverage_type);
      const base64Bytes = Math.ceil(imageBuffer.length * 4 / 3);

      console.log(`\n  [bench] Diagnostic info:`);
      console.log(`    model            : ${process.env.OPENAI_MODEL ?? 'gpt-4o'}`);
      console.log(`    timeout_ms       : ${process.env.OPENAI_TIMEOUT_MS ?? '15000 (default)'}`);
      console.log(`    max_tokens       : ${process.env.OPENAI_MAX_TOKENS ?? '2500 (default)'}`);
      console.log(`    system prompt    : ${systemPrompt.length.toLocaleString()} chars`);
      console.log(`    image file       : ${imageBuffer.length.toLocaleString()} bytes (${(imageBuffer.length / 1024).toFixed(1)} KB)`);
      console.log(`    image base64     : ${base64Bytes.toLocaleString()} bytes (${(base64Bytes / 1024).toFixed(1)} KB)`);
      console.log(`\n  [bench] Starting ${RUNS} runs against ${process.env.OPENAI_MODEL ?? 'gpt-4o'}…`);

      const times: number[] = [];
      const errors: string[] = [];

      for (let i = 0; i < RUNS; i++) {
        const start = Date.now();
        try {
          await verify(fields, [imageBuffer], [imageMimeType]);
          const elapsed = Date.now() - start;
          times.push(elapsed);
          const status = elapsed <= P95_LIMIT_MS ? '✓' : '!';
          console.log(`  [bench] run ${String(i + 1).padStart(2, '0')}/${RUNS}  ${formatMs(elapsed).padStart(7)}  ${status}`);
        } catch (err) {
          const elapsed = Date.now() - start;
          const msg = err instanceof Error ? err.message : String(err);
          const name = err instanceof Error ? err.name : 'UnknownError';
          const status = err instanceof Error && 'status' in err ? ` [HTTP ${(err as Record<string, unknown>)['status']}]` : '';
          errors.push(`Run ${i + 1}: ${name}${status}: ${msg}`);
          console.log(`  [bench] run ${String(i + 1).padStart(2, '0')}/${RUNS}  ${formatMs(elapsed).padStart(7)}  ✗ ${name}${status}: ${msg}`);
        }
        await new Promise((resolve) => setTimeout(resolve, INTER_RUN_DELAY_MS));
      }

      if (times.length === 0) {
        throw new Error(`All ${RUNS} runs failed. First error: ${errors[0]}`);
      }

      const sorted = [...times].sort((a, b) => a - b);
      const p50 = percentile(sorted, 50);
      const p95 = percentile(sorted, 95);
      const p99 = percentile(sorted, 99);
      const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
      const min = sorted[0];
      const max = sorted[sorted.length - 1];
      const successRate = `${times.length}/${RUNS}`;

      console.log('\n  ── Latency Results ──────────────────────────');
      console.log(`     Successful runs : ${successRate}`);
      console.log(`     p50             : ${formatMs(p50)}`);
      console.log(`     p95             : ${formatMs(p95)}  ${p95 <= P95_LIMIT_MS ? '✓ PASS' : '✗ FAIL — exceeds limit'}`);
      console.log(`     p99             : ${formatMs(p99)}`);
      console.log(`     avg             : ${formatMs(avg)}`);
      console.log(`     min             : ${formatMs(min)}`);
      console.log(`     max             : ${formatMs(max)}`);
      console.log('  ─────────────────────────────────────────────\n');

      if (errors.length > 0) {
        console.warn(`  [bench] ${errors.length} run(s) errored:\n${errors.map((e) => `    ${e}`).join('\n')}`);
      }

      expect(
        p95,
        `p95 latency (${formatMs(p95)}) exceeds the ${formatMs(P95_LIMIT_MS)} hard limit`
      ).toBeLessThanOrEqual(P95_LIMIT_MS);
    },
    TIMEOUT_MS
  );
});
