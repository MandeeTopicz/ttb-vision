# TTB Vision — Claude Code Context

This file is the persistent context for Claude Code. Read this at the start of every session.
The full source of truth is `TTBVision_PRD_v1.0.docx` in the repo root. This file is a
condensed operational reference. When this file and the PRD conflict, the PRD wins.

---

## Project

**Name:** TTB Vision
**Purpose:** AI-powered alcohol label verification assistant for TTB compliance agents.
Cross-references COLA application field data against uploaded label images and independently
checks TTB regulatory compliance. Verification assist only — never auto-approves or rejects.
Final determination is always made by the human agent.

**Repo:** https://github.com/MandeeTopicz/ttb-vision
**Deploy:** Vercel

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript — strict mode throughout |
| Styling | Tailwind CSS + shadcn/ui (Radix + Nova preset) |
| AI Provider | OpenAI GPT-4o via server-side API route ONLY |
| Schema Validation | Zod — every AI response validated before render |
| PDF Generation | @react-pdf/renderer (client-side) |
| Rules Storage | config/ttb_rules.json |
| Deployment | Vercel |

---

## Folder Structure

```
ttb-vision/
├── app/
│   ├── page.tsx                    # Single label verification UI
│   ├── batch/page.tsx              # Batch verification UI
│   ├── api/
│   │   ├── verify/route.ts         # Single label API route
│   │   └── batch/route.ts          # Batch processing API route
│   └── layout.tsx
├── components/
│   ├── VerificationForm.tsx        # Single label input form
│   ├── ResultsPanel.tsx            # Verification results display
│   ├── BatchUpload.tsx             # CSV + zip upload interface
│   ├── BatchResults.tsx            # Live batch results table
│   ├── ReportExport.tsx            # PDF + plain text export
│   └── ui/                         # shadcn/ui components
├── lib/
│   ├── verify.ts                   # Core verification logic
│   ├── prompt.ts                   # Prompt construction
│   ├── rules.ts                    # Rule loading + ruleset selection
│   ├── schemas.ts                  # Zod schemas for all AI responses
│   ├── csv.ts                      # CSV parsing + validation
│   └── pdf.ts                      # Report PDF generation
├── config/
│   └── ttb_rules.json              # TTB ruleset — single source of truth for rules
├── types/
│   └── index.ts                    # Shared TypeScript types
├── __tests__/
│   ├── verify.test.ts
│   ├── schemas.test.ts
│   └── latency.bench.ts            # Latency benchmark — p95 must be ≤ 20,000ms
├── docs/
│   ├── README.md
│   ├── APPROACH_AND_ASSUMPTIONS.md
│   ├── SCALING.md
│   ├── COMPLIANCE_NOTES.md
│   └── CHANGELOG.md
├── .env.local.example
├── CLAUDE.md                       # This file
└── next.config.ts
```

---

## Build Order — Follow Phases Strictly

Complete and test each phase before starting the next. Do not skip ahead.

| Phase | Name | Key Deliverables |
|---|---|---|
| 1 | Foundation | Folder structure, ttb_rules.json full distilled spirits ruleset, Zod schemas in lib/schemas.ts, shared types in types/index.ts |
| 2 | Core Verify API | POST /api/verify route, prompt construction from ttb_rules.json, GPT-4o integration, Zod response validation, all error codes handled |
| 3 | Single Label UI | VerificationForm, image upload, all form fields with validation, submit flow, loading state with elapsed time, ResultsPanel with per-field display, overall status banner |
| 4 | Report Export | ReportExport component, PDF via @react-pdf/renderer, plain text copy, agent disclaimer in every report |
| 5 | Latency Benchmark | latency.bench.ts against real API, p50/p95/p99 documented, p95 ≤ 20,000ms confirmed |
| 6 | Wine & Malt Rules | Add wine and malt_beverage rulesets to ttb_rules.json, validate single label flow for all three beverage types |
| 7 | Batch Processing | POST /api/batch with SSE streaming, CSV parser with pre-flight validation, zip extraction, BatchUpload, BatchResults live table, batch report export |
| 8 | Security Hardening | Bundle analyzer, prompt injection test, full security checklist |
| 9 | Documentation | All 5 docs, latency results in README, deploy to Vercel |

---

## Non-Negotiables — Never Violate These

- **API key server-side only.** OPENAI_API_KEY lives in the Next.js API route only. Never
  import it in any client component. Never expose it in the bundle. Verify with bundle
  analyzer before deploy.

- **Fully stateless.** No label images, application data, or PII are persisted anywhere.
  No database. No localStorage. No sessionStorage. No cookies containing application data.
  Every verification is fire-and-forget.

- **Zod on every AI response.** Every response from GPT-4o is validated against the Zod
  schema in lib/schemas.ts before any data is rendered. If validation fails, throw an error.
  Never render partial results.

- **Fuzzy matches always flagged.** Case differences, punctuation differences, abbreviations
  — all flagged with a note. Never auto-passed. The agent decides.

- **Output language.** Never use APPROVED or REJECTED anywhere in the UI or reports.
  Use: "No Issues Detected — Ready for Agent Sign-Off" (pass) and
  "X Fields Flagged — Agent Review Required" (flag).

- **Prompt injection protection.** All agent-supplied field values are wrapped in XML tags
  in the user message. The system prompt contains only rules and instructions. Data and
  instructions are structurally separated in every API call.

- **Graceful failure only.** If the OpenAI API is unavailable, return a friendly error
  directing the agent to manual review. Never show raw API error messages to the agent.
  Log errors server-side.

- **Agent disclaimer on every report.** Every exported report (PDF and plain text) must
  include: "This result is a verification assist. Final compliance determination is the
  responsibility of the TTB compliance agent."

---

## Key Data Schemas (Quick Reference)

Full schemas with Zod definitions are in `lib/schemas.ts`. Types are in `types/index.ts`.

### ApplicationFields
```typescript
interface ApplicationFields {
  beverage_type:   'distilled_spirits' | 'wine' | 'malt_beverage';
  is_import:       boolean;
  brand_name:      string;
  class_type:      string;
  abv:             string;
  net_contents:    string;
  bottler_name:      string;
  bottler_address: string;
  country_of_origin?: string; // required when is_import = true
}
```

### FieldVerificationResult
```typescript
interface FieldVerificationResult {
  field:        string;
  status:       'pass' | 'flag' | 'unable_to_verify';
  confidence:   number; // 0.0 – 1.0
  app_value:    string;
  label_value?: string;
  note?:        string;
}
```

### VerificationResponse
```typescript
interface VerificationResponse {
  overall_status: 'pass' | 'flag_for_review';
  fields:         FieldVerificationResult[];
  compliance: {
    government_warning_present:   boolean;
    government_warning_verbatim:  boolean;
    government_warning_caps_bold: boolean;
    government_warning_note?:     string;
    abv_format_compliant:         boolean;
    abv_format_note?:             string;
  };
  metadata: {
    model_version:   string;
    ruleset_version: string;
    timestamp:       string; // ISO 8601
    verification_id: string; // UUID v4
  };
}
```

---

## API Routes (Quick Reference)

### POST /api/verify
- Content-Type: multipart/form-data
- Body: `fields` (JSON string of ApplicationFields) + `images` (1–3 files)
- Response: VerificationResponse (200) or ErrorResponse (4xx/5xx)
- The API key is read from process.env.OPENAI_API_KEY — server-side only

### POST /api/batch
- Content-Type: multipart/form-data
- Body: `csv` (File) + `images` (zip File)
- Response: Server-Sent Events stream (text/event-stream)
- Events: `progress` (per label) | `complete` (BatchSummary) | `error` (ErrorResponse)

---

## Error Codes

| Code | HTTP | Meaning |
|---|---|---|
| VALIDATION_ERROR | 400 | Missing or invalid form fields |
| INVALID_FILE_TYPE | 400 | File is not JPEG, PNG, or PDF |
| FILE_TOO_LARGE | 400 | File exceeds 10MB |
| AI_UNAVAILABLE | 503 | OpenAI API unreachable |
| RESPONSE_INVALID | 500 | AI response failed Zod validation |
| TIMEOUT | 504 | AI response exceeded timeout |

---

## TTB Rules (Quick Reference)

Full rules are in `config/ttb_rules.json`. Rules are loaded at runtime — never hardcoded
in application logic.

- **Government Warning:** Exact statutory text from 27 CFR Part 16. "GOVERNMENT WARNING:"
  must be all-caps and bold. Remainder must NOT be bold. Checked on every label regardless
  of beverage type.

- **ABV (Distilled Spirits):** Per 27 CFR § 5.65, ABV % is mandatory. Proof is optional
  and only permitted if in the same field of vision as ABV. Proof-only = non-compliant.

- **Country of Origin:** Mandatory for imports only. Driven by `is_import` field.
  Not checked for domestic products.

- **Beverage Types:** Three rulesets — distilled_spirits (27 CFR Part 5),
  wine (27 CFR Part 4), malt_beverage (27 CFR Part 7).
  Ruleset selected per label based on `beverage_type` field. Never inferred by AI.

---

## Environment Variables

```
OPENAI_API_KEY=        # Required. Server-side only. Never expose to client.
OPENAI_MODEL=          # Default: gpt-4o
OPENAI_MAX_TOKENS=     # Default: 2000
OPENAI_TIMEOUT_MS=     # Default: 15000
```

---

## Latency Requirement

GPT-4o vision calls (image + system prompt) typically return in 11–14s. The benchmark
hard limit is p95 ≤ 20,000ms. Run the benchmark in `__tests__/latency.bench.ts` against
the real OpenAI API (not mocked) with 5 calls before deploy. Document results in README.

---

## Production Path (Not Prototype Scope)

Document in SCALING.md. Key points:
- AI: Azure OpenAI Service (FedRAMP High) on TTB's existing Azure infrastructure
- Auth: Agency SSO / Active Directory
- Data: Azure SQL or PostgreSQL (FedRAMP) for verification history
- Batch: Azure Queue Storage + Azure Functions
- Anthropic is excluded as a provider per government policy
