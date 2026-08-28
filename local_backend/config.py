from __future__ import annotations

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
DATA_DIR = ROOT_DIR / "local_data"
REPORTS_DIR = DATA_DIR / "reports"
BACKUP_DIR = DATA_DIR / "backups"
DATABASE_PATH = DATA_DIR / "claw_machine_database.xlsx"
WEB_DIR = ROOT_DIR / "web"
