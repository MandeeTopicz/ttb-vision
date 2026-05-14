import type { NextRequest } from 'next/server';
import { unzipSync } from 'fflate';
import { parseCsv } from '@/lib/csv';
import { verify, VerificationError } from '@/lib/verify';
import { getRulesetVersion } from '@/lib/rules';
import { logger } from '@/lib/logger';
import type { BatchProgressEvent, BatchSummary, BatchLabelResult, ErrorResponse } from '@/types';

// No application-level batch row cap — size is bounded only by OpenAI tier rate limits.
// Processing 200–300+ labels requires OpenAI Tier 2 or higher (≥100 RPM).
// See docs/README.md § Batch Processing for tier guidance.
const MAX_ZIP_BYTES = 50 * 1024 * 1024; // 50 MB
const ACCEPTED_IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png']);

const encoder = new TextEncoder();

function sseData(payload: Record<string, unknown>): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

function jsonError(body: ErrorResponse, status: number): Response {
  return Response.json(body, { status });
}

export async function POST(request: NextRequest): Promise<Response> {
  // ── Parse multipart ──
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError({ error: 'Could not parse form data', code: 'VALIDATION_ERROR' }, 400);
  }

  const csvFile = formData.get('csv');
  const zipFile = formData.get('images');

  if (!(csvFile instanceof File)) {
    return jsonError({ error: 'A CSV manifest file is required (field name: csv)', code: 'VALIDATION_ERROR' }, 400);
  }
  if (!(zipFile instanceof File)) {
    return jsonError({ error: 'A ZIP archive of label images is required (field name: images)', code: 'VALIDATION_ERROR' }, 400);
  }
  if (!zipFile.name.toLowerCase().endsWith('.zip')) {
    return jsonError({ error: 'The images file must be a ZIP archive (.zip)', code: 'INVALID_FILE_TYPE' }, 400);
  }
  if (zipFile.size > MAX_ZIP_BYTES) {
    return jsonError({
      error: `ZIP file is ${(zipFile.size / 1024 / 1024).toFixed(1)} MB. Maximum allowed is ${MAX_ZIP_BYTES / 1024 / 1024} MB.`,
      code: 'FILE_TOO_LARGE',
    }, 400);
  }

  // ── Parse and validate CSV ──
  const csvText = await csvFile.text();
  const { rows, errors: csvErrors } = parseCsv(csvText);

  if (csvErrors.length > 0) {
    return jsonError({
      error: 'CSV pre-flight validation failed. Fix the errors below and resubmit.',
      code: 'VALIDATION_ERROR',
      fields: csvErrors,
    }, 400);
  }

  if (rows.length === 0) {
    return jsonError({ error: 'CSV file contains no data rows.', code: 'VALIDATION_ERROR' }, 400);
  }

  // ── Extract ZIP ──
  let unzipped: Record<string, Uint8Array>;
  try {
    const zipBuffer = new Uint8Array(await zipFile.arrayBuffer());
    unzipped = unzipSync(zipBuffer);
  } catch {
    return jsonError({
      error: 'Could not extract the ZIP archive. Verify it is a valid .zip file.',
      code: 'INVALID_FILE_TYPE',
    }, 400);
  }

  // Build case-insensitive filename → image data map (strip directory prefixes)
  const imageMap = new Map<string, { data: Uint8Array; ext: string }>();
  for (const [path, data] of Object.entries(unzipped)) {
    const basename = path.split('/').pop();
    if (!basename) continue;
    const ext = basename.split('.').pop()?.toLowerCase() ?? '';
    if (!ACCEPTED_IMAGE_EXTS.has(ext)) continue;
    imageMap.set(basename.toLowerCase(), { data, ext });
  }

  // ── Stream SSE ──
  const batchId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const modelVersion = process.env.OPENAI_MODEL ?? 'gpt-4o';
  const rulesetVersion = getRulesetVersion();

  logger.info('batch.start', { batch_id: batchId, row_count: rows.length });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const results: BatchLabelResult[] = [];
      let passCount = 0;
      let flagCount = 0;
      let failedCount = 0;
      let notFoundCount = 0;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2; // 1-indexed + header offset

        // Resolve image (case-insensitive)
        const imageEntry = imageMap.get(row.image_filename.toLowerCase());

        if (!imageEntry) {
          notFoundCount++;
          const labelResult: BatchLabelResult = {
            row: rowNum,
            image_filename: row.image_filename,
            brand_name: row.brand_name,
            status: 'image_not_found',
            error: `"${row.image_filename}" was not found in the ZIP archive`,
          };
          results.push(labelResult);
          const event: BatchProgressEvent = { ...labelResult, completed: i + 1, total: rows.length };
          controller.enqueue(sseData({ type: 'progress', ...event }));
          continue;
        }

        // Determine MIME type from extension
        const mimeType = imageEntry.ext === 'png' ? 'image/png' : 'image/jpeg';
        const imageBuffer = Buffer.from(imageEntry.data);

        // Strip image_filename before passing to verify
        const { image_filename, ...applicationFields } = row;

        try {
          const verifyResult = await verify(applicationFields, [imageBuffer], [mimeType]);
          const status = verifyResult.overall_status === 'pass' ? 'pass' : 'flag_for_review';
          if (status === 'pass') passCount++;
          else flagCount++;

          logger.info('batch.label.complete', {
            batch_id: batchId,
            row: rowNum,
            brand_name: row.brand_name,
            status,
            verification_id: verifyResult.metadata.verification_id,
          });

          const labelResult: BatchLabelResult = {
            row: rowNum,
            image_filename,
            brand_name: row.brand_name,
            status,
            result: verifyResult,
          };
          results.push(labelResult);
          const event: BatchProgressEvent = { ...labelResult, completed: i + 1, total: rows.length };
          controller.enqueue(sseData({ type: 'progress', ...event }));
        } catch (err) {
          failedCount++;
          const message =
            err instanceof VerificationError
              ? err.message
              : 'An unexpected error occurred during verification';
          logger.error('batch.label.failed', {
            batch_id: batchId,
            row: rowNum,
            brand_name: row.brand_name,
            error: message,
          });
          const labelResult: BatchLabelResult = {
            row: rowNum,
            image_filename,
            brand_name: row.brand_name,
            status: 'failed',
            error: message,
          };
          results.push(labelResult);
          const event: BatchProgressEvent = { ...labelResult, completed: i + 1, total: rows.length };
          controller.enqueue(sseData({ type: 'progress', ...event }));
        }
      }

      const summary: BatchSummary = {
        batch_id: batchId,
        total_submitted: rows.length,
        total_verified: passCount + flagCount,
        pass_count: passCount,
        flag_count: flagCount,
        failed_count: failedCount,
        not_found_count: notFoundCount,
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        ruleset_version: rulesetVersion,
        model_version: modelVersion,
        results,
      };

      logger.info('batch.complete', {
        batch_id: batchId,
        total_submitted: rows.length,
        pass_count: passCount,
        flag_count: flagCount,
        failed_count: failedCount,
        not_found_count: notFoundCount,
      });

      controller.enqueue(sseData({ type: 'complete', ...summary }));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
