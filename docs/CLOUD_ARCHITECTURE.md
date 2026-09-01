# Cloud Architecture

> Updated direction: this architecture is active for staging only on **JOLI POLI Claw Staging** (`fbvzqdqjqcbjopuinknw`, `ap-southeast-1`). It supersedes the prior local-only direction while retaining LOCAL mode as the accepted parity baseline, fallback, and regression environment. Do not connect to another Supabase project or migrate real production data or images without separate authorization.

```text
Browser
  |
  +-- current JOLI POLI UI migrated from v2.1.78
  |
  +-- compatibility API / repositories
          |
          +-- Supabase Auth
          +-- PostgreSQL + RLS
          +-- Storage (active machine/style images)
          +-- RPC / Edge Function for privileged workflows
```

## Data principles

- Relational report rows, not copied PDFs/large JSON blobs.
- One current image reference per machine/style; history does not duplicate image objects.
- Store isolation enforced by RLS.
- Settings needed for historical formulas are snapshotted at closing time.
- Finalization is authoritative server-side calculation + state transition.
- Start Shift owns a real, idempotent server-side draft for the authorized store and report date. Cloud refresh resolves only that exact `draft` record for Continue Shift; finalized and voided records are never resumed.
- Active-draft saves update the existing machine/product rows so refill events remain an append-only ledger rather than being recreated by autosave.

## Current Windows app during migration

The desktop app keeps using its local Excel database and its existing software-update channel. The new web backend is developed separately until migration/pilot approval.
