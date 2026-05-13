# TTB Rules Changelog

This file tracks all changes to `config/ttb_rules.json`.

**Every change to `ttb_rules.json` must be recorded here** before the change is deployed. No exceptions. The entry must include the version, date, author, rule changed, previous value, new value, and the CFR citation that governs the changed rule.

When `ttb_rules.json` is updated:
1. Increment the `version` field in `ttb_rules.json` → `meta.version`
2. Update the `last_verified_date` field → `meta.last_verified_date`
3. Add an entry to this file following the format below
4. Redeploy the application

---

## v1.0.0 — 2025-05-12

**Author:** Engineering — sourced from eCFR 27 CFR Parts 4, 5, 7, 16  
**Type:** Initial release — all rulesets created

### What was added

All three beverage-type rulesets and the government warning were created from scratch against the eCFR as of 2025-05-12.

#### Government Warning (27 CFR Part 16)

| Field | Value |
|---|---|
| Citation | 27 CFR Part 16 — Alcoholic Beverage Health Warning Statement |
| Statutory basis | Alcoholic Beverage Labeling Act (ABLA) of 1988, 27 U.S.C. 215 |
| Applies to | All alcoholic beverages ≥ 0.5% ABV, domestic and imported |
| Exact text | `GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.` |

Formatting rules added (all sourced from 27 CFR Part 16):

| Rule | Citation |
|---|---|
| "GOVERNMENT WARNING:" must be ALL CAPS and bold | 27 CFR § 16.22(a)(2) |
| Remainder after "GOVERNMENT WARNING:" must NOT be bold | 27 CFR § 16.22(a)(2) |
| Must appear on a contrasting background | 27 CFR § 16.22(a)(1) |
| Must be readily legible under ordinary conditions | 27 CFR § 16.22(a)(1) |
| Must appear separate and apart from all other label information | 27 CFR § 16.21 |
| Must appear as a continuous statement; cannot be split across panels | 27 CFR § 16.22 |
| Font size minimums: 1 mm (≤ 237 mL), 2 mm (> 237 mL up to 3 L), 3 mm (> 3 L) | 27 CFR § 16.22(b) |

#### Distilled Spirits Ruleset (27 CFR Part 5)

Effective date: February 9, 2022 (T.D. TTB-176)

| Field | Citation | Conditional |
|---|---|---|
| brand_name | 27 CFR § 5.61 | No |
| class_type | 27 CFR § 5.62 | No |
| bottler_name_address | 27 CFR § 5.63 | No |
| abv | 27 CFR § 5.65 | No |
| net_contents | 27 CFR § 5.68 | No |
| country_of_origin | 27 CFR § 5.63 | Yes — required only when is_import = true |

#### Wine Ruleset (27 CFR Part 4)

| Field | Citation | Conditional |
|---|---|---|
| brand_name | 27 CFR § 4.32 | No |
| class_type | 27 CFR § 4.34 | No |
| bottler_name_address | 27 CFR § 4.35 | No |
| abv | 27 CFR § 4.36(a) | No |
| net_contents | 27 CFR § 4.36 | No |
| country_of_origin | 27 CFR § 4.35 | Yes — required only when is_import = true |

#### Malt Beverage Ruleset (27 CFR Part 7)

| Field | Citation | Conditional |
|---|---|---|
| brand_name | 27 CFR § 7.61 | No |
| class_type | 27 CFR § 7.62 | No |
| bottler_name_address | 27 CFR § 7.63 | No |
| net_contents | 27 CFR § 7.68 | No |
| country_of_origin | 27 CFR § 7.63 | Yes — required only when is_import = true |

Note: Alcohol content (ABV) is not a mandatory label field for malt beverages under 27 CFR Part 7 and is not included in the malt beverage ruleset.

---

## Future Entry Template

Copy and fill in this template for every subsequent change:

```
## v{NEW_VERSION} — {YYYY-MM-DD}

**Author:** {Name or team}
**Type:** {Rule update | New rule | Rule removed | Correction}

### Rule changed

**Beverage type:** {distilled_spirits | wine | malt_beverage | government_warning | all}  
**Field:** {field key from ttb_rules.json}  
**CFR citation governing this change:** {e.g., 27 CFR § 5.65}  
**Federal Register notice (if applicable):** {e.g., T.D. TTB-XXX, XX FR XXXXX (Month DD, YYYY)}

| | Previous value | New value |
|---|---|---|
| requirement | {old text} | {new text} |
| acceptable_formats | {old list} | {new list} |
| {other changed field} | {old} | {new} |

**Reason:** {Why the rule changed — Federal Register notice, correction, clarification, etc.}
```
