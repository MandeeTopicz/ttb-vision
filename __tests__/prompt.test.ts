import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, buildUserMessage } from '@/lib/prompt';
import { getRuleset, getRulesetVersion } from '@/lib/rules';
import type { ApplicationFields } from '@/types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const base: Omit<ApplicationFields, 'beverage_type'> = {
  is_import: false,
  brand_name: 'Test Brand',
  class_type: 'Test Class',
  abv: '5% Alc./Vol.',
  net_contents: '750 mL',
  bottler_name: 'Test Bottler Inc.',
  bottler_address: '1 Test St, City, ST 00000',
};

const tinyImage = Buffer.from('R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==', 'base64');

// ─── getRuleset ───────────────────────────────────────────────────────────────

describe('getRuleset()', () => {
  it('returns distilled_spirits ruleset with Part 5 citation', () => {
    const r = getRuleset('distilled_spirits');
    expect(r.citation).toContain('27 CFR Part 5');
    expect(r.mandatory_fields.length).toBeGreaterThan(0);
  });

  it('returns wine ruleset with Part 4 citation', () => {
    const r = getRuleset('wine');
    expect(r.citation).toContain('27 CFR Part 4');
  });

  it('returns malt_beverage ruleset with Part 7 citation', () => {
    const r = getRuleset('malt_beverage');
    expect(r.citation).toContain('27 CFR Part 7');
  });

  it('all three types include all six expected field keys', () => {
    const expected = ['brand_name', 'class_type', 'abv', 'net_contents', 'bottler_name_address', 'country_of_origin'];
    for (const type of ['distilled_spirits', 'wine', 'malt_beverage'] as const) {
      const keys = getRuleset(type).mandatory_fields.map((f) => f.field);
      for (const k of expected) {
        expect(keys, `${type} missing field "${k}"`).toContain(k);
      }
    }
  });

  it('country_of_origin is conditional on is_import for all three types', () => {
    for (const type of ['distilled_spirits', 'wine', 'malt_beverage'] as const) {
      const coField = getRuleset(type).mandatory_fields.find((f) => f.field === 'country_of_origin');
      expect(coField, `${type} missing country_of_origin field`).toBeDefined();
      expect(coField!.conditional).toBe('is_import');
    }
  });

  it('throws on an unknown beverage type', () => {
    expect(() => getRuleset('cider' as ApplicationFields['beverage_type'])).toThrow();
  });
});

// ─── buildSystemPrompt — type-specific content ────────────────────────────────

describe('buildSystemPrompt()', () => {
  it('distilled_spirits prompt includes 27 CFR Part 5 citation', () => {
    const p = buildSystemPrompt('distilled_spirits');
    expect(p).toContain('27 CFR Part 5');
  });

  it('wine prompt includes 27 CFR Part 4 citation', () => {
    const p = buildSystemPrompt('wine');
    expect(p).toContain('27 CFR Part 4');
  });

  it('malt_beverage prompt includes 27 CFR Part 7 citation', () => {
    const p = buildSystemPrompt('malt_beverage');
    expect(p).toContain('27 CFR Part 7');
  });

  it('wine prompt does not include 27 CFR Part 5 mandatory fields section', () => {
    const p = buildSystemPrompt('wine');
    // Part 5 field citations (§ 5.61–5.66) must not appear in the wine prompt
    expect(p).not.toContain('§ 5.61');
    expect(p).not.toContain('§ 5.62');
    expect(p).not.toContain('§ 5.65');
  });

  it('malt_beverage prompt does not include Part 4 or Part 5 field citations', () => {
    const p = buildSystemPrompt('malt_beverage');
    expect(p).not.toContain('§ 4.32');
    expect(p).not.toContain('§ 5.61');
  });

  it('all three prompts include the government warning (27 CFR Part 16)', () => {
    for (const type of ['distilled_spirits', 'wine', 'malt_beverage'] as const) {
      const p = buildSystemPrompt(type);
      expect(p, `${type} prompt missing Part 16 citation`).toContain('27 CFR Part 16');
    }
  });

  it('all three prompts include the exact statutory government warning text', () => {
    const exactText = 'GOVERNMENT WARNING:';
    for (const type of ['distilled_spirits', 'wine', 'malt_beverage'] as const) {
      const p = buildSystemPrompt(type);
      expect(p, `${type} prompt missing government warning text`).toContain(exactText);
    }
  });

  it('wine prompt does not include per-field CFR citations (stripped for token efficiency)', () => {
    const p = buildSystemPrompt('wine');
    expect(p).not.toContain('§ 4.36');
  });

  it('malt_beverage prompt does not include per-field CFR citations', () => {
    const p = buildSystemPrompt('malt_beverage');
    expect(p).not.toContain('§ 7.65');
  });

  it('distilled_spirits prompt does not include acceptable_formats (stripped for token efficiency)', () => {
    const p = buildSystemPrompt('distilled_spirits');
    expect(p).not.toContain('45% Alc./Vol.');
  });

  it('no prompt contains prohibited output language', () => {
    const prohibited = ['APPROVED', 'REJECTED', 'DENIED', 'ACCEPTED'];
    for (const type of ['distilled_spirits', 'wine', 'malt_beverage'] as const) {
      const p = buildSystemPrompt(type);
      for (const term of prohibited) {
        expect(p, `${type} prompt contains prohibited term "${term}"`).not.toContain(term);
      }
    }
  });

  it('all three prompts include the current ruleset version', () => {
    const version = getRulesetVersion();
    for (const type of ['distilled_spirits', 'wine', 'malt_beverage'] as const) {
      const p = buildSystemPrompt(type);
      expect(p, `${type} prompt missing ruleset version`).toContain(version);
    }
  });

  it('all three prompts instruct the model to return only JSON', () => {
    for (const type of ['distilled_spirits', 'wine', 'malt_beverage'] as const) {
      const p = buildSystemPrompt(type);
      expect(p).toContain('Return ONLY valid JSON');
    }
  });
});

// ─── buildUserMessage — field tagging per beverage type ───────────────────────

describe('buildUserMessage()', () => {
  it('wine domestic: XML tags contain all application fields', () => {
    const fields: ApplicationFields = { ...base, beverage_type: 'wine' };
    const content = buildUserMessage(fields, [tinyImage], ['image/jpeg']);
    const text = (content[0] as { type: 'text'; text: string }).text;

    expect(text).toContain('<beverage_type>wine</beverage_type>');
    expect(text).toContain('<is_import>false</is_import>');
    expect(text).toContain(`<brand_name>${base.brand_name}</brand_name>`);
    expect(text).toContain(`<class_type>${base.class_type}</class_type>`);
    expect(text).toContain(`<abv>${base.abv}</abv>`);
    expect(text).toContain(`<net_contents>${base.net_contents}</net_contents>`);
    expect(text).toContain(
      `<bottler_name_address>${base.bottler_name}, ${base.bottler_address}</bottler_name_address>`
    );
  });

  it('wine import: country_of_origin tag present', () => {
    const fields: ApplicationFields = { ...base, beverage_type: 'wine', is_import: true, country_of_origin: 'France' };
    const content = buildUserMessage(fields, [tinyImage], ['image/jpeg']);
    const text = (content[0] as { type: 'text'; text: string }).text;

    expect(text).toContain('<country_of_origin>France</country_of_origin>');
    expect(text).toContain('<is_import>true</is_import>');
  });

  it('wine domestic: country_of_origin tag absent', () => {
    const fields: ApplicationFields = { ...base, beverage_type: 'wine' };
    const content = buildUserMessage(fields, [tinyImage], ['image/jpeg']);
    const text = (content[0] as { type: 'text'; text: string }).text;

    expect(text).not.toContain('<country_of_origin>');
  });

  it('malt_beverage import: country_of_origin tag present', () => {
    const fields: ApplicationFields = { ...base, beverage_type: 'malt_beverage', is_import: true, country_of_origin: 'Germany' };
    const content = buildUserMessage(fields, [tinyImage], ['image/jpeg']);
    const text = (content[0] as { type: 'text'; text: string }).text;

    expect(text).toContain('<beverage_type>malt_beverage</beverage_type>');
    expect(text).toContain('<country_of_origin>Germany</country_of_origin>');
  });

  it('malt_beverage domestic: country_of_origin tag absent', () => {
    const fields: ApplicationFields = { ...base, beverage_type: 'malt_beverage' };
    const content = buildUserMessage(fields, [tinyImage], ['image/jpeg']);
    const text = (content[0] as { type: 'text'; text: string }).text;

    expect(text).not.toContain('<country_of_origin>');
  });

  it('bottler fields are combined into bottler_name_address for all three types', () => {
    const expected = `<bottler_name_address>${base.bottler_name}, ${base.bottler_address}</bottler_name_address>`;
    for (const type of ['distilled_spirits', 'wine', 'malt_beverage'] as const) {
      const fields: ApplicationFields = { ...base, beverage_type: type };
      const content = buildUserMessage(fields, [tinyImage], ['image/jpeg']);
      const text = (content[0] as { type: 'text'; text: string }).text;
      expect(text, `${type}: bottler fields not combined correctly`).toContain(expected);
    }
  });

  it('image is included as a base64 image_url part', () => {
    const fields: ApplicationFields = { ...base, beverage_type: 'wine' };
    const content = buildUserMessage(fields, [tinyImage], ['image/jpeg']);
    const imagePart = content.find((p): p is { type: 'image_url'; image_url: { url: string } } => p.type === 'image_url');
    expect(imagePart).toBeDefined();
    expect(imagePart!.image_url.url).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('multiple images produce multiple image_url parts', () => {
    const fields: ApplicationFields = { ...base, beverage_type: 'malt_beverage' };
    const content = buildUserMessage(fields, [tinyImage, tinyImage], ['image/jpeg', 'image/png']);
    const imageParts = content.filter((p) => p.type === 'image_url');
    expect(imageParts).toHaveLength(2);
  });

  it('system prompt contains no application field values (separation invariant)', () => {
    for (const type of ['distilled_spirits', 'wine', 'malt_beverage'] as const) {
      const sp = buildSystemPrompt(type);
      expect(sp).not.toContain('Test Brand');
      expect(sp).not.toContain('Test Bottler Inc.');
      expect(sp).not.toContain('1 Test St');
    }
  });

  it('XML-significant characters in field values are escaped in the user message', () => {
    const fields: ApplicationFields = {
      ...base,
      beverage_type: 'distilled_spirits',
      brand_name: 'Brands <Best> & Worst',
      class_type: 'Type "A"',
    };
    const content = buildUserMessage(fields, [tinyImage], ['image/jpeg']);
    const text = (content[0] as { type: 'text'; text: string }).text;

    // < and > must be escaped so they cannot break the XML structure
    expect(text).toContain('&lt;Best&gt;');
    // & must be escaped
    expect(text).toContain('&amp;');
    // Raw < or > must not appear inside an XML tag value
    expect(text).not.toContain('<Best>');
    expect(text).not.toContain('>Worst');
  });

  it('all three system prompts include the CASE SENSITIVITY POLICY instruction', () => {
    for (const type of ['distilled_spirits', 'wine', 'malt_beverage'] as const) {
      const p = buildSystemPrompt(type);
      expect(p, `${type} prompt missing CASE SENSITIVITY POLICY`).toContain('CASE SENSITIVITY POLICY');
      expect(p, `${type} prompt missing case-insensitive instruction for brand_name`).toContain('brand_name');
      expect(p, `${type} prompt must name the GOVERNMENT WARNING: as the case-sensitive exception`).toContain('GOVERNMENT WARNING:');
    }
  });
});
