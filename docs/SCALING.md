# TTB Vision — Production Scaling Plan

This document describes the path from the current Vercel prototype to a production-grade deployment on TTB's existing Azure infrastructure. Nothing in this document is implemented in the prototype. Every item is a documented future requirement.

---

## 0. Production Workflow

The prototype implements a three-party workflow using an in-memory queue. This section
describes what that workflow looks like in production.

### Vendor Authentication

**Prototype:** No authentication. Any user with the URL can access `/submit`.

**Production:** Vendors authenticate via TTB Online / Pay.gov SSO using their existing TTB
vendor accounts. No separate registration required. The `/submit` route enforces authentication
before displaying the form. Each submission is associated with the authenticated vendor's account.

### Agent Authentication

**Prototype:** No authentication. Any user with the URL can access `/queue` and `/queue/[id]`.

**Production:** Agents authenticate via Treasury Active Directory SSO. The `/queue` and
`/queue/[id]` routes are inaccessible without an active agent session. Agent identity is
recorded in every verification audit log.

### Submission Queue (Persistence)

**Prototype:** Server-side in-memory `Map`. Resets on restart. Does not persist across
Vercel serverless invocations.

**Production:** Azure SQL Database (FedRAMP authorized) on TTB's existing Azure infrastructure.
Every submission is stored as a database record with: submission ID, vendor identity, all
application fields, image blob storage references, status, submitted timestamp, and reviewed
timestamp. The queue survives server restarts, deployments, and horizontal scaling.

### Label Image Storage

**Prototype:** Base64-encoded images stored in the server-side Map alongside the submission record.

**Production:** Azure Blob Storage. Images are stored in a private container with access
controlled by the submission ID. Images are referenced by URL in the database record, not
embedded inline. Retention policy is applied per the applicable federal records schedule.

### COLA System Integration

**Prototype:** Vendor manually enters application fields in the submission form.

**Production (Year 1–2):** Vendor portal with manual entry as in the prototype, but backed
by Azure SQL and Azure Blob. No COLA integration yet. This is the first production milestone
and is achievable without IT changes to the COLA system.

**Production (Year 3+):** COLA API integration via webhook. When a vendor submits a COLA
application through the existing COLA system, a webhook fires to TTB Vision, which pulls
the structured application data automatically. The vendor's label image is the only upload
required — all other fields are populated from the COLA record. This eliminates duplicate
data entry entirely and is the path toward straight-through processing for clean labels.

### Agent Determination

**Production:** After the agent reviews AI findings and makes a determination, their
decision (APPROVED or REJECTED in TTB's internal workflow — not in TTB Vision's output
language) is recorded in the database and synced back to the COLA system. TTB Vision's
output language remains "No Issues Detected — Ready for Agent Sign-Off" and "Fields Flagged
— Agent Review Required" — the APPROVED/REJECTED determination lives in COLA, not in TTB Vision.

### Batch Submission (Large Importers)

**Production:** Large importers submit CSV + ZIP via an authenticated API endpoint rather
than the browser UI. API key authentication tied to their vendor account. Results are
delivered asynchronously via webhook or email notification. See §6 for the Azure Queue
architecture.

### Realistic Timeline

| Phase | Timeline | Scope |
|---|---|---|
| Prototype | Now | In-memory queue, Vercel, no auth, manual entry |
| Production v1 | Year 1–2 | Azure SQL + Blob, SSO auth, manual entry, FedRAMP |
| Production v2 | Year 3+ | COLA API integration, webhook-driven, straight-through processing |

---

## 1. AI Infrastructure

**Prototype:** OpenAI GPT-4o via the public OpenAI API (api.openai.com).

**Production:** Azure OpenAI Service on TTB's existing Azure infrastructure.

- **FedRAMP High authorization** — Azure OpenAI Service operates within FedRAMP High boundaries. Required for federal agency production use. The public OpenAI API does not hold a FedRAMP authorization.
- **Same model** — Azure OpenAI Service provides GPT-4o through Azure-managed deployments. The prompt, schema, and verification logic carry over without changes.
- **Data residency** — Azure OpenAI Service keeps prompts and completions within the Azure region. No data transits to OpenAI's shared infrastructure.
- **Model version pinning** — Azure OpenAI model deployments are pinned to a specific model version (e.g., `gpt-4o-2024-08-06`). This prevents silent behavior changes from model updates. Version changes require explicit redeployment and re-running the latency benchmark.
- **Fallback on outage** — Define a secondary Azure OpenAI deployment in a different Azure region. The application should surface a clear "AI service unavailable — proceed with manual review" banner rather than silently failing. No silent degradation.
- **Migration path** — The only required code change is swapping the OpenAI SDK base URL and credentials to point to the Azure endpoint. The prompt structure, Zod schemas, and retry logic are unchanged.

---

## 2. Authentication and Authorization

**Prototype:** No authentication. All users share the deployed URL.

**Production:** Agency SSO / Active Directory integration.

- **SSO integration** — All users authenticate via TTB's existing Active Directory federation. No separate user account management.
- **RBAC** — Three roles minimum:
  - `agent` — can submit verifications and view results; cannot modify rules
  - `supervisor` — can view all agent activity; can trigger re-verification
  - `admin` — can edit `ttb_rules.json` through the rules management UI (see §5); can manage users
- **Immutable audit logs** — Every verification is logged with: timestamp, agent identity, beverage type, verification ID, overall status, and ruleset version. Logs are write-once and cannot be modified after the fact. Required for compliance audit trails.
- **Determination audit record** — Every agent determination records: agent ID, agent name (from Treasury Active Directory), timestamp, determination outcome (Approved / Rejected / Resubmission Requested), and agent notes. This record is immutable once written. Agent identity is sourced from the Treasury Active Directory SSO session — no separate login. Required for federal compliance; the determination record is the authoritative case history entry filed against the COLA submission.
- **Session timeout** — Session lifetime and timeout thresholds per federal security requirements (NIST SP 800-53 AC-12).

---

## 3. Data Architecture

**Prototype:** Fully stateless. No data is written anywhere.

**Production:** Persistent storage for verification history, audit logs, and batch results.

- **Database:** Azure SQL or Azure Database for PostgreSQL (FedRAMP authorized). Stores verification records, batch summaries, and audit logs.
- **Blob storage:** Azure Blob Storage for uploaded label images associated with verification records, if retention is required by policy. Images must be stored encrypted and purged per the applicable records retention schedule.
- **Encryption at rest:** AES-256 for all stored data. Azure-managed keys minimum; customer-managed keys (CMK) for highest-sensitivity data.
- **Encryption in transit:** TLS 1.3 minimum on all connections. TLS 1.0 and 1.1 disabled.
- **PII handling:** Label images may contain handwritten annotations or producer information. A PII classification and handling policy must be established before production storage is enabled. The prototype's stateless approach eliminates this risk entirely — evaluate whether persistence is actually required before implementing it.

---

## 4. COLA System Integration

**Prototype:** Agent manually enters application field data from the COLA record.

**Production:** Direct integration with TTB's COLA system would eliminate manual entry entirely and reduce the risk of transcription errors.

- **Scope:** Out of scope for the prototype. This is the single largest efficiency gain available to the system — auto-populating all application fields from the COLA record means the agent only uploads the label image.
- **Path to automation:** With COLA integration, routine verifications (clean labels, no fuzzy matches) could proceed to sign-off with minimal agent interaction. This is the path toward high-volume automation.
- **Timeline:** Realistically years away, dependent on COLA system API availability and TTB IT assessment of integration complexity. Do not block prototype deployment on this.

---

## 5. Rules Management

**Prototype:** `config/ttb_rules.json` edited directly by developers.

**Production:** Authorized staff update rules through a controlled process.

- **Admin UI:** A web interface for authorized administrators to view and edit TTB rules without touching JSON or requiring a deployment. Changes are validated against the schema before saving.
- **Supervisor approval workflow:** Rule changes require supervisor review and approval before taking effect. No unilateral rule changes by any single user.
- **Change log:** Every rule change is automatically recorded: who changed it, what the previous value was, what the new value is, the CFR citation for the change, and the timestamp. This feeds into `CHANGELOG.md` automatically.
- **Federal Register monitoring:** Assign an authorized staff member to monitor the Federal Register for 27 CFR Part 4, 5, 7, and 16 notices. When a relevant notice is published, the rules update process is triggered before the effective date.
- **Historical versioning:** Each `ttb_rules.json` version is archived. A verification record references the exact ruleset version used, so past verifications can be reconstructed and audited even after rules change.

---

## 6. Batch Processing at Scale

**Prototype:** Sequential in-process processing via a Node.js `for` loop over CSV rows. Suitable for small batches.

**Production:** Decoupled, horizontally scalable batch processing.

- **Azure Queue Storage:** Batch jobs are submitted to a queue. Each label becomes an individual queue message. The submission API returns immediately with a batch ID; the client polls for status or receives push notifications.
- **Azure Functions workers:** Stateless workers pull messages from the queue and process labels in parallel. Worker count scales horizontally with queue depth.
- **Decoupled submission from processing:** The submitting agent does not hold an open HTTP connection while processing runs. Processing continues even if the browser is closed.
- **Auto-scaling:** Azure Functions scale during TTB peak application periods (e.g., seasonal beverage submissions, new product launches) without manual intervention.
- **SLA commitments:** Define and document a processing time SLA before production use — e.g., "batches of 50 labels completed within 10 minutes." Agents should receive an estimated completion time before a batch starts.
- **Processing estimates:** Before a large batch starts, estimate completion time based on row count and current queue depth. Display the estimate to the agent.

---

## 7. Monitoring and Observability

**Prototype:** Server-side `console.error` logging only.

**Production:** Full observability stack.

- **Azure Application Insights:** Distributed tracing for every verification request. End-to-end latency from form submit to result rendered.
- **p95 latency alerting:** Alert operations if p95 response time exceeds 5,000 ms over any 5-minute window. This is the hard latency requirement (see `APPROACH_AND_ASSUMPTIONS.md § Latency Design`).
- **Confidence score drift monitoring:** Track average confidence scores per beverage type over time. A sustained drop in average confidence may indicate a model update or a change in label image quality.
- **Error rate dashboards:** Track `RESPONSE_INVALID`, `AI_UNAVAILABLE`, `TIMEOUT`, and `VALIDATION_ERROR` rates separately. Sudden increases in any category indicate a specific failure mode to investigate.
- **Cost projections:** GPT-4o token consumption per verification is predictable from prompt size. Model monthly cost projections for the expected verification volume before production launch and revisit quarterly.

---

## 8. Security Hardening

**Prototype:** Bundle analyzer for API key verification, XML prompt injection protection, input validation.

**Production:** Full security hardening before any production deployment.

- **Web Application Firewall (WAF):** Azure Application Gateway WAF in front of the application. Protects against common web exploits independent of application-level controls.
- **Penetration testing:** External penetration test required before production launch. Minimum scope: authentication bypass, prompt injection, file upload vulnerabilities, authorization escalation.
- **TLS 1.3 minimum:** Enforce TLS 1.3 on all inbound and outbound connections. Disable TLS 1.0 and 1.1 at the load balancer level.
- **Dependency vulnerability scanning:** Add `npm audit` (or equivalent) to the CI/CD pipeline. Block deployments on high-severity vulnerabilities. Review and update dependencies on a defined schedule.
- **Annual security review:** Scheduled annual security review covering dependency posture, access control configuration, audit log completeness, and penetration test findings remediation.

---

## 9. Accessibility and Section 508

**Prototype:** `shadcn/ui` provides a strong accessibility baseline via Radix UI ARIA attributes and keyboard navigation. No formal audit performed.

**Production:** Full compliance audit required before any production deployment.

- **WCAG 2.1 AA:** Formal audit against Web Content Accessibility Guidelines 2.1 Level AA. Cover all interactive components: form fields, dropdowns, file upload, results table, batch progress, PDF export.
- **Section 508:** Federal agencies are required to meet Section 508 of the Rehabilitation Act. A formal Section 508 audit by a qualified accessibility specialist is required before production use.
- **Keyboard navigation:** All features must be fully operable by keyboard. Tab order must be logical. Focus management after async operations (results appearing, batch updates) must be explicit.
- **Screen reader testing:** Test with JAWS and NVDA (Windows) and VoiceOver (macOS). All dynamic content updates must use appropriate ARIA live regions.
- **Known gaps in prototype:** The elapsed timer during verification uses `tabular-nums` display only. The confidence bar uses `role="meter"` but has not been tested with assistive technology. The batch progress table updates live — ARIA live region behavior should be verified.

---

## 10. Disaster Recovery

**Prototype:** Vercel handles deployment availability. No documented recovery procedure.

**Production:** Defined and tested disaster recovery plan.

- **RTO/RPO:** Define Recovery Time Objective and Recovery Point Objective based on operational requirements. Document and test against these targets quarterly.
- **Outage communication:** The application must display a system status banner when the AI service is unavailable. The banner directs agents to proceed with manual review. No silent degradation under any failure mode.
- **No silent degradation:** If any dependency (Azure OpenAI, Azure SQL, Azure Blob) is unavailable, the application surfaces a clear, actionable message. The application never returns a partial result or an empty response without explanation.
- **Backup procedures:** Database backups on a defined schedule. Backup restoration tested quarterly — untested backups do not count as a recovery procedure.
- **Runbook:** Maintain an operations runbook covering: how to restart the application, how to roll back a deployment, how to disable the AI service and enter manual-review mode, and how to restore from backup.
