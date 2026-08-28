# Cloud Architecture Target

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

## Current Windows app during migration

The desktop app keeps using its local Excel database and its existing software-update channel. The new web backend is developed separately until migration/pilot approval.
