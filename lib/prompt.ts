import { getRuleset, getGovernmentWarning, getRulesetVersion } from '@/lib/rules';
import type { ApplicationFields } from '@/types';

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

function buildGovernmentWarningText(): string {
  const gw = getGovernmentWarning();
  const fr = gw.formatting_rules;
  return `GOVERNMENT WARNING REQUIREMENT (${gw.citation}):
Exact statutory text that MUST appear verbatim on every label:
"${gw.exact_text}"

Formatting requirements:
- ${fr.government_warning_label_caps_bold.requirement} (${fr.government_warning_label_caps_bold.citation})
- ${fr.remainder_not_bold.requirement} (${fr.remainder_not_bold.citation})
- ${fr.contrasting_background.requirement} (${fr.contrasting_background.citation})
- ${fr.separate_and_apart.requirement} (${fr.separate_and_apart.citation})
- ${fr.continuous_statement.requirement} (${fr.continuous_statement.citation})`;
}

function buildMandatoryFieldsText(beverageType: ApplicationFields['beverage_type']): string {
  const ruleset = getRuleset(beverageType);
  const lines: string[] = [`MANDATORY FIELDS (${ruleset.citation}):`];

  for (const f of ruleset.mandatory_fields) {
    const cond = f.conditional ? ' [CONDITIONAL: only required when is_import = true]' : '';
    lines.push(`\n- ${f.label} | field key: "${f.field}" | ${f.citation}${cond}`);
    lines.push(`  Requirement: ${f.requirement}`);
    if ('match_logic' in f && f.match_logic) {
      lines.push(`  Match logic: ${f.match_logic}`);
    }
    if ('fuzzy_match_policy' in f && f.fuzzy_match_policy) {
      lines.push(`  Fuzzy match policy: ${f.fuzzy_match_policy}`);
    }
    if ('acceptable_formats' in f && Array.isArray(f.acceptable_formats) && f.acceptable_formats.length > 0) {
      lines.push(`  Acceptable formats: ${(f.acceptable_formats as string[]).join(' | ')}`);
    }
    if ('non_compliant_formats' in f && Array.isArray(f.non_compliant_formats) && f.non_compliant_formats.length > 0) {
      lines.push(`  Non-compliant formats: ${(f.non_compliant_formats as string[]).join(' | ')}`);
    }
  }

  return lines.join('\n');
}

export function buildSystemPrompt(beverageType: ApplicationFields['beverage_type']): string {
  const rulesetVersion = getRulesetVersion();

  return `## ROLE
You are a TTB label compliance verification assistant. Your only job is to compare the provided application field data against the label image(s) and return a structured JSON result. You are not an approver or rejector — you identify matches, mismatches, and compliance issues so a human TTB compliance agent can make the final determination.

## TTB RULES
Ruleset version: ${rulesetVersion}

${buildGovernmentWarningText()}

${buildMandatoryFieldsText(beverageType)}

## GLOBAL POLICIES

FUZZY MATCH POLICY: All fuzzy matches MUST be flagged — never auto-passed. This includes case differences, punctuation differences, abbreviations, and spacing differences. Set status to "flag" and describe the specific discrepancy in the note. The human agent makes the final determination. This is a compliance tool — auto-passing any variant creates legal liability.

CONFIDENCE SCORING:
- 0.90–1.00: Field clearly readable, unambiguous match or mismatch
- 0.70–0.89: Field readable with minor uncertainty (glare, angle, partial shadow)
- 0.50–0.69: Field partially obscured or ambiguous — use status "flag"
- 0.00–0.49: Field cannot be reliably read — use status "unable_to_verify"

STATUS DEFINITIONS:
- "pass": Field on label matches application value within acceptable parameters AND meets TTB requirements
- "flag": Discrepancy detected between label and application, OR a TTB compliance issue detected — agent review required. NOTE: "flag" means something is wrong with the label content. Use a descriptive note.
- "unable_to_verify": Image quality insufficient to reliably verify this field. This is an IMAGE problem, not a label compliance problem. Use this when the field cannot be read due to blur, glare, or obstruction. Use a note describing the image issue.

## OUTPUT INSTRUCTIONS
Return ONLY valid JSON. No markdown code fences. No prose. No explanation outside the JSON object. If you include anything other than a valid JSON object, the entire verification will fail.

Required JSON structure (every key is required unless marked optional):
{
  "overall_status": "pass" or "flag_for_review",
  "fields": [
    {
      "field": "<field key from the mandatory fields list above>",
      "status": "pass" | "flag" | "unable_to_verify",
      "confidence": <number from 0.0 to 1.0>,
      "app_value": "<exact value from application data>",
      "label_value": "<what you read on the label — omit only if field is completely unreadable>",
      "note": "<required when status is flag or unable_to_verify; describe the specific discrepancy or image issue>"
    }
  ],
  "compliance": {
    "government_warning_present": <boolean — is the government warning statement present on the label?>,
    "government_warning_verbatim": <boolean — does it match the EXACT statutory text character for character?>,
    "government_warning_caps_bold": <boolean — does "GOVERNMENT WARNING:" appear in ALL CAPS and bold?>,
    "government_warning_note": "<optional string — describe any formatting issue found>",
    "abv_format_compliant": <boolean — is the ABV format compliant with the rules above?>,
    "abv_format_note": "<optional string — describe any format issue>"
  },
  "metadata": {
    "model_version": "<your exact model identifier, e.g. gpt-4o-2024-08-06>",
    "ruleset_version": "${rulesetVersion}",
    "timestamp": "<current UTC datetime in ISO 8601 format>",
    "verification_id": "<generate a new UUID v4>"
  }
}

IMPORTANT RULES FOR THE fields ARRAY:
1. Include one entry for EVERY mandatory field for this beverage type.
2. For conditional fields (is_import = true): include them if is_import is true in the application data; omit if false.
3. For "bottler_name_address": the app_value is the combined name and address from the application data. Verify both appear on the label.
4. For overall_status: set to "flag_for_review" if ANY field has status "flag" or "unable_to_verify", OR if ANY compliance check fails. Set to "pass" ONLY if ALL fields are "pass" AND ALL compliance checks pass.`;
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
