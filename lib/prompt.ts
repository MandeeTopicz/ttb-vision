import { getRuleset, getGovernmentWarning, getRulesetVersion } from '@/lib/rules';
import type { ApplicationFields } from '@/types';

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

function buildGovernmentWarningText(): string {
  const citation = getGovernmentWarning().citation.split('—')[0].trim(); // "27 CFR Part 16"
  return `GOVERNMENT WARNING (${citation}): Verify the exact statutory text is present verbatim on the label. "GOVERNMENT WARNING:" must appear in ALL CAPS and bold; the remainder must NOT be bold; the statement must appear separate from other label content.`;
}

function buildMandatoryFieldsText(beverageType: ApplicationFields['beverage_type']): string {
  const ruleset = getRuleset(beverageType);
  const section = ruleset.citation.split('—')[0].trim(); // e.g. "27 CFR Part 5"
  const lines: string[] = [`MANDATORY FIELDS (${section}):`];

  for (const f of ruleset.mandatory_fields) {
    const cond = f.conditional ? ' [import only — omit if is_import is false]' : '';
    lines.push(`- ${f.field}${cond}: ${f.requirement}`);
    if (f.fuzzy_match_policy) {
      lines.push(`  Match: ${f.fuzzy_match_policy}`);
    }
  }

  return lines.join('\n');
}

export function buildSystemPrompt(beverageType: ApplicationFields['beverage_type']): string {
  const rulesetVersion = getRulesetVersion();

  return `You are a TTB label compliance verification assistant. Compare application field data against the label image(s) and return structured JSON. You flag discrepancies — a human agent makes the final determination.

Ruleset: ${rulesetVersion} | Beverage type: ${beverageType}

${buildGovernmentWarningText()}

${buildMandatoryFieldsText(beverageType)}

CASE SENSITIVITY POLICY: brand_name, class_type, and bottler_name_address are case-insensitive — flag only punctuation, abbreviation, missing word, numeric, or spelling differences. GOVERNMENT WARNING: must be ALL CAPS bold — flag any case deviation.

FUZZY MATCH POLICY: Never auto-pass any variant. Flag all differences with a descriptive note. overall_status is "flag_for_review" if ANY field is "flag" or "unable_to_verify" OR any compliance check fails. Confidence: 0.90–1.00 clear; 0.70–0.89 minor uncertainty; 0.50–0.69 use "flag"; 0.00–0.49 use "unable_to_verify" (image quality issue, not compliance). Note is required when status is "flag" or "unable_to_verify".

Return ONLY valid JSON. No markdown. No prose:
{
  "overall_status": "pass" | "flag_for_review",
  "fields": [{"field": string, "status": "pass"|"flag"|"unable_to_verify", "confidence": 0–1, "app_value": string, "label_value": string, "note": string}],
  "compliance": {"government_warning_present": bool, "government_warning_verbatim": bool, "government_warning_caps_bold": bool, "government_warning_note": string, "abv_format_compliant": bool, "abv_format_note": string},
  "metadata": {"model_version": string, "ruleset_version": "${rulesetVersion}", "timestamp": "ISO8601", "verification_id": "UUIDv4"}
}

Include one fields entry per mandatory field for this beverage type. Omit country_of_origin when is_import is false. label_value may be omitted only if the field is completely unreadable. note is required when status is "flag" or "unable_to_verify".`;
}

// Escapes the five XML-significant characters in element content.
// Prevents agent-supplied field values from breaking the <application_data> block
// or injecting instructions into the user message.
function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildUserMessage(
  fields: ApplicationFields,
  imageBuffers: Buffer[],
  mimeTypes: string[]
): ContentPart[] {
  // bottler_name and bottler_address combined per 27 CFR § 5.63 / § 4.35 / § 7.63
  const bottlerCombined = xmlEscape(`${fields.bottler_name}, ${fields.bottler_address}`);

  let xmlData = `<application_data>
<beverage_type>${fields.beverage_type}</beverage_type>
<is_import>${fields.is_import}</is_import>
<brand_name>${xmlEscape(fields.brand_name)}</brand_name>
<class_type>${xmlEscape(fields.class_type)}</class_type>
<abv>${xmlEscape(fields.abv)}</abv>
<net_contents>${xmlEscape(fields.net_contents)}</net_contents>
<bottler_name_address>${bottlerCombined}</bottler_name_address>`;

  if (fields.is_import && fields.country_of_origin) {
    xmlData += `\n<country_of_origin>${xmlEscape(fields.country_of_origin)}</country_of_origin>`;
  }

  xmlData += `\n</application_data>`;

  const content: ContentPart[] = [
    {
      type: 'text',
      text: `${xmlData}\n\nVerify the label image(s) provided against these application fields and the TTB rules. Return ONLY the JSON response.`,
    },
  ];

  for (let i = 0; i < imageBuffers.length; i++) {
    const base64 = imageBuffers[i].toString('base64');
    content.push({
      type: 'image_url',
      image_url: { url: `data:${mimeTypes[i]};base64,${base64}` },
    });
  }

  return content;
}
