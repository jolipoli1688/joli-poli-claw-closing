"""Static-only guard for cloud drafts; does not contact Supabase or Docker."""
from __future__ import annotations
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SQL = ROOT / "supabase" / "migrations" / "20260829_000005_cloud_phase2_hardening.sql"
required = (
    "cash_transactions", "adjustment_usd", "manual_coins_used", "image_object_key_snapshot",
    "finalize_daily_closing", "coin_variance <> 0", "revoke all on all functions in schema private",
    "drop policy if exists machine_style_images_insert", "private.has_store_access",
)
forbidden = ("grant execute on all functions in schema private to authenticated", "public=true")
text = SQL.read_text(encoding="utf-8").lower()
missing = [item for item in required if item not in text]
present = [item for item in forbidden if item in text]
if text.count("$$") % 2:
    raise SystemExit("unbalanced SQL dollar quotes")
if missing or present:
    raise SystemExit(f"cloud draft validation failed; missing={missing}; forbidden={present}")
print("PASS - cloud draft static validation; no network or database access attempted.")
