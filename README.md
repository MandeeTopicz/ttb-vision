# TTB Vision

AI-powered alcohol label verification assistant for TTB compliance agents.

**Live app:** https://ttb-vision.vercel.app

---

## What it does

TTB Vision cross-references COLA application field data against uploaded label images and independently checks TTB regulatory compliance. It is a **verification assist only** — the tool surfaces matches, mismatches, and compliance issues so a human TTB compliance agent can make the final determination efficiently. It never auto-approves or auto-rejects.

---

## Workflows

TTB Vision implements a three-party workflow that mirrors the real TTB label submission process.

| Party | Route | What happens |
|---|---|---|
| **Vendor** | `/submit` | Fills out COLA application fields and uploads label image(s). Receives a confirmation ID. Never sees AI results. |
| **Queue** | (server) | Submission is held in Vercel KV. AI verification does not run automatically — it waits for the agent. |
| **Agent** | `/queue` → `/queue/[id]` | Opens the submission, reviews vendor data and label images side by side, clicks **Run Verification** to trigger the AI call, reviews results, records a final determination (Approved / Rejected / Resubmission Requested), and exports a PDF or plain text report. |
| **Importer** | `/batch` | Uploads a CSV manifest and ZIP of label images for bulk verification. Results stream back in real time via SSE. |

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript — strict mode throughout |
| Styling | Tailwind CSS + shadcn/ui (Radix primitives) |
| AI | OpenAI GPT-4o via server-side API route only |
| Schema validation | Zod — every AI response validated before render |
| PDF generation | @react-pdf/renderer (client-side) |
| Queue storage | Vercel KV (Redis), 24-hour TTL |
| Image storage | Vercel Blob |
| Deployment | Vercel |

---

## Setup

```bash
git clone https://github.com/MandeeTopicz/ttb-vision.git
cd ttb-vision
npm install

cp .env.local.example .env.local
# Add your OPENAI_API_KEY to .env.local

# Enable Vercel KV and Vercel Blob in your Vercel project dashboard under Storage,
# then pull all storage environment variables:
vercel env pull .env.local

npm run dev        # http://localhost:3000
npm test           # unit tests
npm run bench      # latency benchmark (requires OPENAI_API_KEY)
```

### Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `OPENAI_API_KEY` | Yes | — | OpenAI API key. Server-side only. |
| `OPENAI_MODEL` | No | `gpt-4o` | Model identifier |
| `OPENAI_MAX_TOKENS` | No | `2000` | Max tokens per completion |
| `OPENAI_TIMEOUT_MS` | No | `15000` | Per-request timeout in milliseconds |
| `KV_URL` / `KV_REST_API_*` | Yes | — | Vercel KV credentials (pulled via `vercel env pull`) |
| `BLOB_READ_WRITE_TOKEN` | Yes | — | Vercel Blob credentials (pulled via `vercel env pull`) |

---

## AI approach

- **Model:** GPT-4o with vision. Each verification sends the system prompt (TTB rules + field instructions), all vendor-supplied field values wrapped in XML tags, and up to 3 base64-encoded label images in a single API call.
- **Rules:** Loaded at runtime from `config/ttb_rules.json` — three beverage-type rulesets (27 CFR Parts 4, 5, 7) plus government warning (27 CFR Part 16). Rules have CFR citations and are editable without code changes.
- **Response validation:** Every GPT-4o response is validated against a Zod schema before any data reaches the UI. Partial or malformed results are never rendered.
- **Fuzzy matching:** Case differences, punctuation differences, and abbreviations are always flagged — never auto-passed. The agent decides.
- **Prompt injection protection:** All vendor-supplied field values are XML-escaped before inclusion in the user message. Data and instructions are structurally separated across system prompt and user message.
- **Output language:** "No Issues Detected — Ready for Agent Sign-Off" (pass) and "X Fields Flagged — Agent Review Required" (flag). APPROVED and REJECTED are prohibited — the tool is a verification assist, not a compliance determination engine.

---

## Latency

GPT-4o vision calls return in approximately 11–14 seconds on OpenAI Tier 1 with real-world label images. Hard requirement: **p95 ≤ 20,000 ms**.

Benchmark results (2026-05-16, 20 runs, compressed fixture):

```
p50  3,964ms  |  p95  4,933ms ✓  |  p99  4,983ms
```

Run the benchmark yourself: `npm run bench` (requires a label image at `__tests__/fixtures/test-label-clean.jpg`).

---

## Batch processing

Upload a CSV manifest and a ZIP of label images at `/batch`. The server validates the CSV pre-flight (all rows checked before any API call), extracts the ZIP, and streams results via SSE as each label is verified. Results appear in the table in real time.

**CSV format:** `brand_name`, `class_type`, `abv`, `net_contents`, `bottler_name`, `bottler_address`, `beverage_type`, `is_import`, `image_filename` (+ `country_of_origin` when `is_import=true`).

**ZIP size limit:** 4 MB on this Vercel deployment (Vercel 4.5 MB serverless cap). Compress images to under 500 KB each before zipping.

---

## Prototype limitations

- **No authentication.** Any user with the URL can access all routes. Production requires Treasury Active Directory SSO.
- **24-hour submission TTL.** Submissions in the queue expire after 24 hours. Production uses Azure SQL with no TTL and a full audit trail.
- **4 MB ZIP cap.** Vercel serverless body size limit. Production uses Azure Blob Storage + Azure Functions with no size constraint.
- **OpenAI Tier 1 rate limits.** Large batches (200–300+ labels) require OpenAI Tier 2 or higher.

---

## Documentation

| Document | Contents |
|---|---|
| [`docs/README.md`](docs/README.md) | Full API reference, observability/logging schema, detailed setup notes |
| [`docs/APPROACH_AND_ASSUMPTIONS.md`](docs/APPROACH_AND_ASSUMPTIONS.md) | Architecture decisions, AI design, edge case handling, all assumptions |
| [`docs/SCALING.md`](docs/SCALING.md) | Production path to Azure (FedRAMP, SSO, Azure SQL, Azure OpenAI Service) |
| [`docs/COMPLIANCE_NOTES.md`](docs/COMPLIANCE_NOTES.md) | Data handling, CFR citations, tool-purpose boundaries |
| [`docs/CHANGELOG.md`](docs/CHANGELOG.md) | TTB rules version history |
