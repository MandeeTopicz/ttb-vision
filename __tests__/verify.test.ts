import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verify, VerificationError } from '@/lib/verify';
import type { ApplicationFields } from '@/types';

// --- Mock OpenAI ---
const mockCreate = vi.fn();

vi.mock('openai', () => {
  class FakeAPIError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.name = 'APIError';
      this.status = status;
    }
  }

  class FakeRateLimitError extends FakeAPIError {
    constructor() {
      super(429, 'Rate limit exceeded');
      this.name = 'RateLimitError';
    }
  }

  class FakeTimeoutError extends Error {
    constructor() {
      super('Request timed out');
      this.name = 'APIConnectionTimeoutError';
    }
  }

  // Must be a proper class (not an arrow fn) so `new OpenAI(...)` works in verify.ts
  class MockOpenAI {
    chat = {
      completions: {
        create: mockCreate,
      },
    };
  }

  return {
    default: Object.assign(MockOpenAI, {
      APIError: FakeAPIError,
      RateLimitError: FakeRateLimitError,
      APIConnectionTimeoutError: FakeTimeoutError,
    }),
  };
});

// --- Test fixtures ---

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

const imageBuffers = [Buffer.from('fake-image-data')];
const mimeTypes = ['image/jpeg'];

const validAIResponse = {
  overall_status: 'pass',
  fields: [
    {
      field: 'brand_name',
      status: 'pass',
      confidence: 0.98,
      app_value: 'Old Tom Distillery',
      label_value: 'Old Tom Distillery',
    },
    {
      field: 'class_type',
      status: 'pass',
      confidence: 0.97,
      app_value: 'Kentucky Straight Bourbon Whiskey',
      label_value: 'Kentucky Straight Bourbon Whiskey',
    },
    {
      field: 'abv',
      status: 'pass',
      confidence: 0.99,
      app_value: '45% Alc./Vol.',
      label_value: '45% Alc./Vol.',
    },
    {
      field: 'net_contents',
      status: 'pass',
      confidence: 0.99,
      app_value: '750 mL',
      label_value: '750 mL',
    },
    {
      field: 'bottler_name_address',
      status: 'pass',
      confidence: 0.96,
      app_value: 'Old Tom Distilling Co., 123 Bourbon St, Louisville, KY 40202',
      label_value: 'Old Tom Distilling Co., 123 Bourbon St, Louisville, KY 40202',
    },
  ],
  compliance: {
    government_warning_present: true,
    government_warning_verbatim: true,
    government_warning_caps_bold: true,
    abv_format_compliant: true,
  },
  metadata: {
    model_version: 'gpt-4o-2024-08-06',
    ruleset_version: '1.0.0',
    timestamp: '2026-05-12T10:00:00Z',
    verification_id: '550e8400-e29b-41d4-a716-446655440000',
  },
};

function makeOpenAIResponse(content: string) {
  return {
    choices: [{ message: { content } }],
  };
}

// --- Tests ---

describe('verify()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = 'sk-test-key';
    process.env.OPENAI_MODEL = 'gpt-4o';
    process.env.OPENAI_MAX_TOKENS = '2000';
    process.env.OPENAI_TIMEOUT_MS = '15000';
  });

  it('returns VerificationResponse on a valid AI response', async () => {
    mockCreate.mockResolvedValueOnce(makeOpenAIResponse(JSON.stringify(validAIResponse)));

    const result = await verify(fields, imageBuffers, mimeTypes);

    expect(result.overall_status).toBe('pass');
    expect(result.fields).toHaveLength(5);
    expect(result.metadata.ruleset_version).toBe('1.0.0');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('throws RESPONSE_INVALID when AI returns malformed JSON', async () => {
    mockCreate.mockResolvedValueOnce(makeOpenAIResponse('not valid json {{{'));

    await expect(verify(fields, imageBuffers, mimeTypes)).rejects.toMatchObject({
      code: 'RESPONSE_INVALID',
    });
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('throws RESPONSE_INVALID when AI response fails Zod schema', async () => {
    const invalid = {
      ...validAIResponse,
      overall_status: 'APPROVED', // not a valid enum value
    };
    mockCreate.mockResolvedValueOnce(makeOpenAIResponse(JSON.stringify(invalid)));

    await expect(verify(fields, imageBuffers, mimeTypes)).rejects.toMatchObject({
      code: 'RESPONSE_INVALID',
    });
  });

  it('throws RESPONSE_INVALID on an empty AI response', async () => {
    mockCreate.mockResolvedValueOnce(makeOpenAIResponse(''));

    await expect(verify(fields, imageBuffers, mimeTypes)).rejects.toMatchObject({
      code: 'RESPONSE_INVALID',
    });
  });

  it('throws TIMEOUT when AI response times out', async () => {
    const timeoutError = new Error('Request timed out');
    timeoutError.name = 'APIConnectionTimeoutError';
    mockCreate.mockRejectedValueOnce(timeoutError);

    await expect(verify(fields, imageBuffers, mimeTypes)).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('throws AI_UNAVAILABLE when OpenAI returns a non-429 API error', async () => {
    const apiError = new Error('Service unavailable');
    Object.assign(apiError, { status: 503 });
    mockCreate.mockRejectedValueOnce(apiError);

    await expect(verify(fields, imageBuffers, mimeTypes)).rejects.toMatchObject({
      code: 'AI_UNAVAILABLE',
    });
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('throws AI_UNAVAILABLE when OPENAI_API_KEY is not set', async () => {
    delete process.env.OPENAI_API_KEY;

    await expect(verify(fields, imageBuffers, mimeTypes)).rejects.toMatchObject({
      code: 'AI_UNAVAILABLE',
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('retries on 429 and succeeds on the next attempt', async () => {
    const rateLimitError = new Error('Rate limit exceeded');
    Object.assign(rateLimitError, { status: 429 });

    mockCreate
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValueOnce(makeOpenAIResponse(JSON.stringify(validAIResponse)));

    const result = await verify(fields, imageBuffers, mimeTypes);

    expect(result.overall_status).toBe('pass');
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('throws AI_UNAVAILABLE after exhausting all 429 retries', async () => {
    // Use fake timers so the 1s+2s+4s backoff delays don't cause a real 7s wait
    vi.useFakeTimers();
    try {
      const rateLimitError = new Error('Rate limit exceeded');
      Object.assign(rateLimitError, { status: 429 });
      mockCreate.mockRejectedValue(rateLimitError);

      const promise = verify(fields, imageBuffers, mimeTypes);
      // Capture rejection immediately to avoid unhandled-rejection warning
      // during the timer advancement window
      const settled = promise.then(
        (v) => ({ ok: true as const, value: v }),
        (e) => ({ ok: false as const, error: e })
      );

      // Advance through all scheduled sleep() timers recursively
      await vi.runAllTimersAsync();

      const result = await settled;
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatchObject({ code: 'AI_UNAVAILABLE' });
      }
      // 1 initial + 3 retries = 4 total attempts
      expect(mockCreate).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not retry on RESPONSE_INVALID errors', async () => {
    mockCreate.mockResolvedValue(makeOpenAIResponse('not json'));

    await expect(verify(fields, imageBuffers, mimeTypes)).rejects.toMatchObject({
      code: 'RESPONSE_INVALID',
    });
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('passes system prompt and user content to OpenAI', async () => {
    mockCreate.mockResolvedValueOnce(makeOpenAIResponse(JSON.stringify(validAIResponse)));

    await verify(fields, imageBuffers, mimeTypes);

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.messages).toHaveLength(2);
    expect(callArgs.messages[0].role).toBe('system');
    expect(callArgs.messages[1].role).toBe('user');
    // System prompt must not contain field values
    expect(callArgs.messages[0].content).not.toContain('Old Tom Distillery');
    // User message must contain XML-tagged field data
    expect(Array.isArray(callArgs.messages[1].content)).toBe(true);
    const textPart = callArgs.messages[1].content[0];
    expect(textPart.text).toContain('<brand_name>Old Tom Distillery</brand_name>');
    expect(textPart.text).toContain('<bottler_name_address>Old Tom Distilling Co., 123 Bourbon St, Louisville, KY 40202</bottler_name_address>');
  });

  it('includes base64 image in the user message', async () => {
    mockCreate.mockResolvedValueOnce(makeOpenAIResponse(JSON.stringify(validAIResponse)));

    await verify(fields, imageBuffers, mimeTypes);

    const userContent = mockCreate.mock.calls[0][0].messages[1].content;
    const imagePart = userContent.find((p: { type: string }) => p.type === 'image_url');
    expect(imagePart).toBeDefined();
    expect(imagePart.image_url.url).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('is a VerificationError with the correct shape', async () => {
    mockCreate.mockResolvedValueOnce(makeOpenAIResponse('not json'));

    try {
      await verify(fields, imageBuffers, mimeTypes);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(VerificationError);
      expect((err as VerificationError).code).toBe('RESPONSE_INVALID');
      expect((err as VerificationError).message).toBeTruthy();
    }
  });
});
