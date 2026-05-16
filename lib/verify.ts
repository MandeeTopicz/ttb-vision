import OpenAI from 'openai';
import { buildSystemPrompt, buildUserMessage } from '@/lib/prompt';
import { VerificationResponseSchema } from '@/lib/schemas';
import type { ApplicationFields, VerificationResponse, ErrorCode } from '@/types';

export class VerificationError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'VerificationError';
  }
}

function isRateLimitError(err: unknown): boolean {
  return (
    err instanceof Error &&
    typeof (err as unknown as Record<string, unknown>)['status'] === 'number' &&
    (err as unknown as Record<string, unknown>)['status'] === 429
  );
}

function isTimeoutError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === 'APIConnectionTimeoutError' ||
      err.name === 'AbortError' ||
      err.message.toLowerCase().includes('timeout') ||
      err.message.toLowerCase().includes('timed out'))
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function verify(
  fields: ApplicationFields,
  imageBuffers: Buffer[],
  mimeTypes: string[]
): Promise<VerificationResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new VerificationError('AI_UNAVAILABLE', 'OpenAI API key is not configured');
  }

  const model = process.env.OPENAI_MODEL ?? 'gpt-4o';
  const maxTokens = parseInt(process.env.OPENAI_MAX_TOKENS ?? '2500', 10);
  const timeoutMs = parseInt(process.env.OPENAI_TIMEOUT_MS ?? '15000', 10);

  const client = new OpenAI({ apiKey, maxRetries: 0, timeout: timeoutMs });
  const systemPrompt = buildSystemPrompt(fields.beverage_type);
  const userContent = buildUserMessage(fields, imageBuffers, mimeTypes);

  let lastError: unknown;

  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) {
      // exponential backoff: 1s, 2s, 4s
      await sleep(Math.pow(2, attempt - 1) * 1000);
    }

    try {
      const response = await client.chat.completions.create({
        model,
        max_tokens: maxTokens,
        temperature: 0, // deterministic output — same label must produce same result every run
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { role: 'user', content: userContent as any },
        ],
      });

      const raw = response.choices[0]?.message?.content ?? '';
      if (!raw) {
        throw new VerificationError('RESPONSE_INVALID', 'Empty response from AI');
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new VerificationError('RESPONSE_INVALID', 'AI returned a non-JSON response');
      }

      const result = VerificationResponseSchema.safeParse(parsed);
      if (!result.success) {
        console.error('[verify] Schema validation failed:', result.error.message);
        throw new VerificationError(
          'RESPONSE_INVALID',
          'AI response did not match the expected schema'
        );
      }

      return {
        ...result.data,
        metadata: {
          ...result.data.metadata,
          timestamp: new Date().toISOString(),
          verification_id: crypto.randomUUID(),
        },
      };
    } catch (err) {
      // VerificationErrors are terminal — do not retry
      if (err instanceof VerificationError) throw err;

      if (isTimeoutError(err)) {
        throw new VerificationError(
          'TIMEOUT',
          'AI response exceeded the time limit — please retry or proceed with manual review'
        );
      }

      // Rate limit (429): retry with backoff, up to 3 retries
      if (isRateLimitError(err) && attempt < 3) {
        lastError = err;
        continue;
      }

      console.error('[verify] OpenAI error:', err);
      throw new VerificationError(
        'AI_UNAVAILABLE',
        'AI service is currently unavailable — please retry or proceed with manual review'
      );
    }
  }

  // All retries exhausted on rate limit
  console.error('[verify] Rate limit retries exhausted:', lastError);
  throw new VerificationError(
    'AI_UNAVAILABLE',
    'AI service is temporarily rate limited — please retry in a moment or proceed with manual review'
  );
}
