#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

DEFAULT_VERSION = "2.1.78"
PROTECTED_DIRS = {"data","backups","reports",".venv","tests","updates",".webview","__pycache__",".git"}
BLOCKED_EXTENSIONS = {".xlsx",".xls",".xlsm",".db",".sqlite",".sqlite3",".zip",".key",".pem",".pfx",".p12"}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--expected-version", default=DEFAULT_VERSION)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    dest = root / "legacy" / f"windows-v{args.expected_version}"
    manifest_path = dest / "_IMPORT_MANIFEST.json"
    if not manifest_path.is_file():
        print(f"FAIL - manifest not found: {manifest_path}", file=sys.stderr)
        return 1
    manifest = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
    errors: list[str] = []
    if manifest.get("actual_version") != args.expected_version:
        errors.append(f"version {manifest.get('actual_version')} != {args.expected_version}")
    for entry in manifest.get("files", []):
        path = dest / Path(entry["path"])
        if not path.is_file():
            errors.append(f"missing: {entry['path']}")
            continue
        if path.stat().st_size != entry["size"]:
            errors.append(f"size changed: {entry['path']}")
            continue
        if sha256(path) != entry["sha256"]:
            errors.append(f"hash changed: {entry['path']}")
    for path in dest.rglob("*"):
        if path.is_dir() and path.name.lower() in PROTECTED_DIRS:
            errors.append(f"protected directory present: {path.relative_to(dest)}")
        if path.is_file() and path.suffix.lower() in BLOCKED_EXTENSIONS:
            errors.append(f"blocked file present: {path.relative_to(dest)}")
    if errors:
        print("FAIL - imported baseline validation:", file=sys.stderr)
        for error in errors:
            print(f" - {error}", file=sys.stderr)
        return 1
    print(f"PASS - imported v{args.expected_version} baseline matches its manifest and contains no protected data files.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
