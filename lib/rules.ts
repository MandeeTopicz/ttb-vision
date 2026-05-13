import rulesData from '@/config/ttb_rules.json';
import type { ApplicationFields } from '@/types';

type BeverageType = ApplicationFields['beverage_type'];

type MandatoryField = {
  field: string;
  label: string;
  citation: string;
  requirement: string;
  conditional: string | null;
  conditional_note?: string;
  fuzzy_match_policy?: string;
  acceptable_formats?: string[];
  non_compliant_formats?: string[];
  match_logic?: string;
};

type BeverageRuleset = {
  citation: string;
  effective_date: string;
  mandatory_fields: MandatoryField[];
};

export function getRuleset(beverageType: BeverageType): BeverageRuleset {
  const ruleset = (rulesData.beverage_types as Record<string, BeverageRuleset>)[beverageType];
  if (!ruleset) {
    throw new Error(`Unknown beverage type: ${beverageType}`);
  }
  return ruleset;
}

export function getGovernmentWarning() {
  return rulesData.government_warning;
}

export function getVerificationPolicy() {
  return rulesData.verification_policy;
}

export function getRulesetVersion(): string {
  return rulesData.meta.version;
}
