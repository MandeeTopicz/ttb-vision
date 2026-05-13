# TTB Vision — Compliance Notes

This document records data handling practices, regulatory citations, provider decisions, and tool-purpose boundaries for TTB Vision. It is intended for program managers, legal reviewers, and security assessors.

---

## Data Handling

TTB Vision is **fully stateless**. No application data is persisted at any point in the verification lifecycle.

- **Label images** — uploaded for the duration of a single request and held in memory only. Never written to disk, database, cache, or blob storage. The image buffer is garbage-collected when the request completes.
- **Application field data** — provided by the agent in the request body. Passed to the AI prompt as part of that request and not retained after the response is returned.
- **Verification results** — held in React state in the agent's browser session only. Cleared when the agent navigates away or starts a new verification. Never sent to any server after the initial response.
- **Browser storage** — no application data is written to `localStorage`, `sessionStorage`, cookies, or the browser cache. The agent's session is entirely ephemeral.
- **No database** — the prototype has no database of any kind. There is no verification history, no user record, and no stored configuration beyond `config/ttb_rules.json` (which contains only regulatory rules, not agent or label data).

In the event of a network error or server crash mid-verification, no partial data is retained on the server.

---

## AI Provider

### Prototype

**Provider:** OpenAI  
**Model:** GPT-4o (configurable via `OPENAI_MODEL` environment variable)  
**API endpoint:** `api.openai.com` (public OpenAI API)

The OpenAI API key is held exclusively in the Next.js server environment. It is never included in the client-side JavaScript bundle. This is verified before every deployment using `ANALYZE=true npm run build` (the `@next/bundle-analyzer` integration in `next.config.ts`).

### Excluded Provider

**Anthropic is excluded as an AI provider for TTB Vision.** This exclusion applies to both the prototype and all future deployments, including production. The exclusion is based on government policy regarding data-handling providers and is not subject to reconsideration at the application level.

No Anthropic SDK, no Claude models, and no Anthropic API endpoints are used or planned for use in this system.

### Production Path

**Provider:** Azure OpenAI Service  
**Infrastructure:** TTB's existing Azure infrastructure (FedRAMP High authorized)  
**Model:** GPT-4o via Azure-managed deployment  

Azure OpenAI Service operates within FedRAMP High boundaries, satisfies federal data residency requirements, and keeps all prompts and completions within the Azure region. The public OpenAI API does not hold a FedRAMP authorization and is not suitable for production federal use.

The migration from the public OpenAI API to Azure OpenAI Service requires only a credential and base-URL change. The prompt structure, Zod response schemas, and all application logic are unchanged.

See `docs/SCALING.md §1` for the complete Azure production plan.

---

## CFR Citations Implemented

Every regulatory check in TTB Vision is implemented with its governing CFR citation. The following citations are active in the current codebase:

### Government Warning Statement

| Citation | Requirement |
|---|---|
| 27 CFR Part 16 | Government warning statement required on all alcoholic beverages ≥ 0.5% ABV |
| 27 U.S.C. 215 | Alcoholic Beverage Labeling Act (ABLA) of 1988 — statutory basis |
| 27 CFR § 16.21 | Warning must appear separate and apart from all other label information |
| 27 CFR § 16.22 | Warning must appear as a continuous statement (not split across panels) |
| 27 CFR § 16.22(a)(1) | Must appear on a contrasting background; must be readily legible |
| 27 CFR § 16.22(a)(2) | "GOVERNMENT WARNING:" must be ALL CAPS and bold; remainder must NOT be bold |
| 27 CFR § 16.22(b) | Font size minimums: 1 mm (≤ 237 mL), 2 mm (> 237 mL–3 L), 3 mm (> 3 L) |

### Distilled Spirits

| Citation | Requirement Checked |
|---|---|
| 27 CFR Part 5 | Mandatory label requirements for distilled spirits |
| 27 CFR § 5.61 | Brand name — must appear on label; must not be misleading |
| 27 CFR § 5.62 | Class and type designation — must conform to standards of identity |
| 27 CFR § 5.63 | Bottler or producer name and address |
| 27 CFR § 5.65 | Alcohol content — percentage of ABV mandatory; proof optional same FOV; proof-only non-compliant |
| 27 CFR § 5.68 | Net contents |

### Wine

| Citation | Requirement Checked |
|---|---|
| 27 CFR Part 4 | Mandatory label requirements for wine |
| 27 CFR § 4.32 | Brand name |
| 27 CFR § 4.34 | Class and type designation |
| 27 CFR § 4.35 | Bottler or producer name and address |
| 27 CFR § 4.36 | Net contents |
| 27 CFR § 4.36(a) | Alcohol content — percentage of ABV |

### Malt Beverages

| Citation | Requirement Checked |
|---|---|
| 27 CFR Part 7 | Mandatory label requirements for malt beverages |
| 27 CFR § 7.61 | Brand name |
| 27 CFR § 7.62 | Class and type designation |
| 27 CFR § 7.63 | Bottler or packer name and address |
| 27 CFR § 7.68 | Net contents |

### Country of Origin

Country of origin is checked only when `is_import` is `true` in the application fields. The CFR citation is beverage-type-specific and is listed in `config/ttb_rules.json` per rule entry. The check is never applied to domestic products.

---

## Tool Purpose

TTB Vision is a **verification assist**. It is not a compliance determination engine.

The system compares application field data against uploaded label images and checks TTB regulatory requirements. It surfaces matches, mismatches, and potential compliance issues so that a human TTB compliance agent can make the final determination efficiently.

**What TTB Vision does:**
- Identifies whether label fields visually match COLA application data
- Checks whether the government warning statement is present, verbatim, and correctly formatted
- Checks whether the ABV is formatted in compliance with 27 CFR § 5.65
- Flags all discrepancies and potential issues for agent review
- Assigns confidence scores indicating the reliability of each finding
- Generates exportable reports with full metadata and agent disclaimers

**What TTB Vision does not do:**
- Issue legal compliance determinations
- Approve or reject COLA applications
- Make final decisions on whether a label is compliant or non-compliant
- Replace the Certificate of Label Approval (COLA) process or the COLA IT system
- Override the judgment of a TTB compliance agent
- Process labels without human review of the results

---

## Output Language Policy

The terms **APPROVED** and **REJECTED** are prohibited throughout the application and in all exported reports. Using these terms would imply that the software is making a legal compliance determination, which it is not authorized to do.

Correct terminology:

| Condition | Required Language |
|---|---|
| All fields pass, all compliance checks pass | "No Issues Detected — Ready for Agent Sign-Off" |
| Any field flagged or any compliance check failed | "X Fields Flagged — Agent Review Required" |
| Image quality prevents verification of one or more fields | "Image Quality Insufficient for X Fields — Manual Review Required" |

---

## Agent Disclaimer

The following disclaimer appears on every exported report, in both PDF and plain text format. It is not optional and cannot be removed:

> **Disclaimer:** This result is a verification assist. Final compliance determination is the responsibility of the TTB compliance agent.

This disclaimer is also displayed in the `ResultsPanel` UI below every verification result. It is sourced from a constant in `lib/pdf.tsx` and is not configurable at runtime.
