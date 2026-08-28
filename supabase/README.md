# Supabase Web Backend Draft

These files are for the **new web application**, not the Windows updater.

Do not apply them to the existing production updater project unless the user explicitly selects that project for web business data after review.

Suggested application order in a development project:
1. `20260828_000001_initial_schema.sql`
2. `20260828_000002_rls.sql`
3. `20260828_000003_finalize_closing.sql`
4. `20260828_000004_image_storage.sql`

The schema is a migration target and must be reconciled against the imported v2.1.78 Python/Excel model before production use.
