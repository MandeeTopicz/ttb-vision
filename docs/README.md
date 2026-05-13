# TTB Vision — Documentation

AI-powered alcohol label verification assistant for TTB compliance agents.

---

## Contents

- [Overview](#overview)
- [Getting Started](#getting-started)
- [Batch Processing](#batch-processing)
- [Latency Benchmark Results](#latency-benchmark-results)
- [Environment Variables](#environment-variables)

---

## Overview

TTB Vision cross-references COLA application field data against uploaded label images and
independently checks TTB regulatory compliance. It is a **verification assist only** — it
never auto-approves or auto-rejects. Final compliance determination is always made by the
human TTB compliance agent.

Supported beverage types: Distilled Spirits (27 CFR Part 5), Wine (27 CFR Part 4),
Malt Beverages (27 CFR Part 7).

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

### How it works

1. Prepare a CSV manifest with one row per label and a ZIP archive of all label images.
2. Upload both files on the Batch Verification page (`/batch`).
3. The server validates the CSV pre-flight, extracts the ZIP, and streams results back
   via Server-Sent Events (SSE) as each label is verified in real time.
4. Download a PDF report or copy plain text when the batch completes.

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

**Recommendation:** Upgrade to **OpenAI Tier 2 or higher** before running batches of
200+ labels. On Tier 1, the application will still complete the batch but may experience
retry delays on 429 rate-limit responses (the verify service retries automatically with
exponential backoff).

To check your current tier: [platform.openai.com/settings/organization/limits](https://platform.openai.com/settings/organization/limits)

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
