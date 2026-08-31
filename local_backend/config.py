from __future__ import annotations

import os
import sys
from pathlib import Path

APP_NAME = "JOLI POLI Claw Closing"
APP_VERSION = "2.1.78"
DEFAULT_OUTLET = "JOLI POLI"


def application_root() -> Path:
    """Return the migration-project root, never the production app root."""
    return Path(__file__).resolve().parent.parent


ROOT_DIR = application_root()
BACKEND_DIR = Path(__file__).resolve().parent
LOCAL_DATA_ROOT = ROOT_DIR / "local_data"
RUNTIME_MODE = str(os.environ.get("CLAW_RUNTIME_MODE") or "").strip().casefold()
if RUNTIME_MODE != "local":
    raise RuntimeError("The local backend requires CLAW_RUNTIME_MODE=local.")
for _cloud_key in ("CLAW_SUPABASE_URL", "CLAW_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"):
    if os.environ.get(_cloud_key):
        raise RuntimeError("The local backend refuses cloud configuration.")
DATA_MODE = str(os.environ.get("CLAW_LOCAL_DATA_MODE") or "uat").strip().casefold() or "uat"
_configured_data_dir = Path(os.environ.get("CLAW_LOCAL_DATA_DIR") or (LOCAL_DATA_ROOT / DATA_MODE))
if not _configured_data_dir.is_absolute():
    _configured_data_dir = ROOT_DIR / _configured_data_dir
DATA_DIR = _configured_data_dir.resolve()
try:
    DATA_DIR.relative_to(LOCAL_DATA_ROOT.resolve())
except ValueError as exc:
    raise RuntimeError("CLAW_LOCAL_DATA_DIR must stay inside the project's local_data directory.") from exc
REPORTS_DIR = DATA_DIR / "reports"
BACKUP_DIR = DATA_DIR / "backups"
DATABASE_PATH = DATA_DIR / "claw_machine_database.xlsx"
WEB_DIR = ROOT_DIR / "web"
