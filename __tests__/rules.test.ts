import { describe, it, expect } from 'vitest';
import { getRuleset, getGovernmentWarning, getVerificationPolicy, getRulesetVersion } from '@/lib/rules';
import type { ApplicationFields } from '@/types';

// ─── getRulesetVersion ────────────────────────────────────────────────────────

describe('getRulesetVersion()', () => {
  it('returns a semver string', () => {
    expect(getRulesetVersion()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('matches the expected current version from ttb_rules.json', () => {
    expect(getRulesetVersion()).toBe('1.0.0');
  });
});

// ─── getGovernmentWarning ─────────────────────────────────────────────────────

describe('getGovernmentWarning()', () => {
  it('returns the 27 CFR Part 16 citation', () => {
    const gw = getGovernmentWarning();
    expect(gw.citation).toContain('27 CFR Part 16');
  });

  it('exact_text opens with GOVERNMENT WARNING:', () => {
    const gw = getGovernmentWarning();
    expect(gw.exact_text).toMatch(/^GOVERNMENT WARNING:/);
  });

  it('exact_text includes both statutory warning clauses', () => {
    const gw = getGovernmentWarning();
    expect(gw.exact_text).toContain('birth defects');
    expect(gw.exact_text).toContain('drive a car');
  });

  it('exact_text includes the Surgeon General reference', () => {
    const gw = getGovernmentWarning();
    expect(gw.exact_text).toContain('Surgeon General');
  });

  it('government_warning_label_caps_bold requires ALL CAPS and bold at § 16.22(a)(2)', () => {
    const rule = getGovernmentWarning().formatting_rules.government_warning_label_caps_bold;
    expect(rule.requirement).toContain('ALL CAPS');
    expect(rule.requirement).toContain('bold');
    expect(rule.citation).toContain('§ 16.22');
  });

  it('case_requirement_note references 27 CFR Part 16 as the regulatory basis', () => {
    const note = (getGovernmentWarning().formatting_rules as { case_requirement_note: string }).case_requirement_note;
    expect(note).toContain('27 CFR Part 16');
  });
});

// ─── getRuleset — CFR citations ───────────────────────────────────────────────

describe('getRuleset() — CFR citations per beverage type', () => {
  it('distilled_spirits citation is 27 CFR Part 5', () => {
    expect(getRuleset('distilled_spirits').citation).toContain('27 CFR Part 5');
  });

  it('wine citation is 27 CFR Part 4', () => {
    expect(getRuleset('wine').citation).toContain('27 CFR Part 4');
  });

  it('malt_beverage citation is 27 CFR Part 7', () => {
    expect(getRuleset('malt_beverage').citation).toContain('27 CFR Part 7');
  });

  it('throws for an unrecognized beverage type', () => {
    expect(() => getRuleset('cider' as ApplicationFields['beverage_type'])).toThrow(/Unknown beverage type/);
  });
});

// ─── getRuleset — country_of_origin conditional ───────────────────────────────

describe('getRuleset() — country_of_origin conditional', () => {
  it('all three beverage types include country_of_origin conditioned on is_import', () => {
    for (const type of ['distilled_spirits', 'wine', 'malt_beverage'] as const) {
      const ruleset = getRuleset(type);
      const field = ruleset.mandatory_fields.find((f) => f.field === 'country_of_origin');
      expect(field, `${type}: missing country_of_origin field entry`).toBeDefined();
      expect(field!.conditional, `${type}: country_of_origin must be conditional on is_import`).toBe('is_import');
    }
  });

  it('all three beverage types have country_of_origin as the only conditional field', () => {
    for (const type of ['distilled_spirits', 'wine', 'malt_beverage'] as const) {
      const conditionals = getRuleset(type).mandatory_fields.filter((f) => f.conditional !== null);
      expect(conditionals, `${type}: expected exactly one conditional field`).toHaveLength(1);
      expect(conditionals[0].field).toBe('country_of_origin');
    }
  });
});

// ─── getVerificationPolicy ────────────────────────────────────────────────────

describe('getVerificationPolicy()', () => {
  it('returns a case_sensitivity_policy object', () => {
    const policy = getVerificationPolicy();
    expect(policy.case_sensitivity_policy).toBeDefined();
  });

  it('brand_name, class_type, bottler_name_address are case-insensitive fields', () => {
    const ci = getVerificationPolicy().case_sensitivity_policy.case_insensitive_fields as string[];
    expect(ci).toContain('brand_name');
    expect(ci).toContain('class_type');
    expect(ci).toContain('bottler_name_address');
  });

  it('government_warning_label is a case-sensitive field', () => {
    const cs = getVerificationPolicy().case_sensitivity_policy.case_sensitive_fields as string[];
    expect(cs).toContain('government_warning_label');
  });

  it('prohibited output terms include APPROVED and REJECTED', () => {
    const prohibited = getVerificationPolicy().output_language.prohibited_terms as string[];
    expect(prohibited).toContain('APPROVED');
    expect(prohibited).toContain('REJECTED');
  });

  it('required_disclaimer includes agent responsibility language', () => {
    const disclaimer = getVerificationPolicy().output_language.required_disclaimer as string;
    expect(disclaimer).toContain('TTB compliance agent');
  });
});
