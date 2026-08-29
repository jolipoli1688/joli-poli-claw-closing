# Supabase local draft boundary

Cloud Phase 2 permits local editing and static validation of these schema, RLS,
Storage, and Edge-function drafts. It does not authorize connecting to,
provisioning, migrating, deleting, or modifying any Supabase project.

- The two existing projects are explicitly not targets.
- A new dedicated staging project requires separate approval before any SQL runs.
- The active local backend and `local_data/` remain the UAT/fallback/regression baseline.
