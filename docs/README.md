# TTB Vision — Documentation

AI-powered alcohol label verification assistant for TTB compliance agents.

---

## Contents

- [Workflow](#workflow)
- [Routes](#routes)
- [Getting Started](#getting-started)
- [Batch Processing](#batch-processing)
- [Prototype Limitations](#prototype-limitations)
- [Latency Benchmark Results](#latency-benchmark-results)
- [Environment Variables](#environment-variables)

---

## Workflow

TTB Vision implements a three-party workflow that mirrors the real TTB label submission process.

### Party 1 — Vendor (submits)

The vendor navigates to `/submit`, fills out their COLA application fields, and uploads their
label image(s). On submit, they see a confirmation message and a reference ID. They never see
AI verification results, pass/fail status, or any compliance findings.

### Party 2 — Queue (holds)

The submission is received and held in the server-side queue. AI verification does **not** run
automatically on submission. The submission sits in `pending` status until an agent reviews it.

### Party 3 — Agent (reviews and triggers)

The agent navigates to `/queue` and sees a table of pending and reviewed submissions. They select
a submission to open `/queue/[id]`, where they see the vendor's submitted data and label image
side by side. The agent clicks **Run Verification** — this is when the AI call fires. Only the
agent sees the AI results. The vendor has no route or view that shows AI output at any point.
After verification runs, the submission status updates to `reviewed`. The agent can export a
PDF or plain text report.

---

## Routes

| Route | Party | Purpose |
|---|---|---|
| `/` | All | Landing page — links to the three entry points |
| `/submit` | Vendor | Submit COLA application fields and label images |
| `/queue` | Agent | List of all pending and reviewed submissions |
| `/queue/[id]` | Agent | Review submission, run AI verification, export report |
| `/batch` | Importer | Submit CSV + ZIP for bulk label verification |

---

## Getting Started

```bash
cp .env.local.example .env.local
# Add your OPENAI_API_KEY to .env.local

npm install
npm run dev        # http://localhost:3000
npm test           # unit tests
npm run bench      # latency benchmark (requires OPENAI_API_KEY)
```

---

## Batch Processing

Large importers can use the batch flow at `/batch`. Upload a CSV manifest and a ZIP of label
images. The server validates the CSV pre-flight, extracts the ZIP, and streams results back
via Server-Sent Events (SSE) as each label is verified in real time.

### CSV format

Required columns (order-independent, case-insensitive headers):

| Column | Type | Notes |
|---|---|---|
| `brand_name` | string | Required |
| `class_type` | string | Required |
| `abv` | string | Required |
| `net_contents` | string | Required |
| `bottler_name` | string | Required |
| `bottler_address` | string | Required |
| `beverage_type` | enum | `distilled_spirits`, `wine`, or `malt_beverage` |
| `is_import` | boolean | `true` or `false` |
| `image_filename` | string | Must match a file in the ZIP (case-insensitive) |
| `country_of_origin` | string | Required when `is_import` is `true` |

### Batch size and OpenAI tier requirements

There is no application-level cap on batch size. Batch throughput is bounded only by your
OpenAI account's rate limits:

| OpenAI Tier | RPM | Practical batch guidance |
|---|---|---|
| Tier 1 | 500 RPM | Up to ~50 labels before throttling becomes likely |
| **Tier 2** | **5,000 RPM** | **Recommended for 200–300+ label batches** |
| Tier 3+ | 10,000+ RPM | Large-scale batch runs |

---

## Prototype Limitations

### In-memory submission queue

The submission queue (`/queue`) is stored in a server-side in-memory `Map`. This means:

- **Submissions persist only within the lifetime of the server process.** They are lost on
  any server restart, deployment, or crash.
- **On Vercel's serverless infrastructure, the Map does not persist across function
  invocations.** Each API request may be handled by a different serverless instance with its
  own empty Map. This means the queue will not work reliably on the Vercel deployment without
  a real database.
- **For local development**, run `npm run dev` or `npm start`. Submissions persist for the
  lifetime of that Node.js process.

The production path for the queue is Azure SQL Database (FedRAMP authorized) on TTB's existing
Azure infrastructure. See `docs/SCALING.md §3` for the complete production data architecture.

### No authentication

The prototype has no authentication. Any user who has the URL can access any route, including
the agent queue. Production requires SSO/Active Directory integration. See `docs/SCALING.md §2`.

---

## Latency Benchmark Results

*To be populated after running `npm run bench` against the production API.*

Run the benchmark and record results here before deploying to Vercel:

```bash
OPENAI_API_KEY=sk-... npm run bench
```

Expected output format:

```
── Latency Results ──────────────────────────
  Runs: 20
  p50:  ????ms
  p95:  ????ms  ✓ PASS   (must be ≤ 5000ms)
  p99:  ????ms
  avg:  ????ms
  min:  ????ms
  max:  ????ms
─────────────────────────────────────────────
```

**Hard requirement:** p95 ≤ 5,000 ms. Do not deploy if this threshold is not met.

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `OPENAI_API_KEY` | Yes | — | OpenAI API key. **Server-side only. Never expose to client.** |
| `OPENAI_MODEL` | No | `gpt-4o` | Model identifier |
| `OPENAI_MAX_TOKENS` | No | `2000` | Max tokens per completion |
| `OPENAI_TIMEOUT_MS` | No | `15000` | Per-request timeout in milliseconds |
