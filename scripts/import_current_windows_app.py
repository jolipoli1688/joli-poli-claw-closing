#!/usr/bin/env python3
"""Read-only source importer for the JOLI POLI Claw Closing web migration."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_SOURCE = Path(r"D:\Python File\Claw_Closing_App")
DEFAULT_VERSION = "2.1.78"
PROTECTED_DIRS = {
    "data",
    "backups",
    "reports",
    ".venv",
    "tests",
    "updates",
    ".webview",
    "__pycache__",
    ".git",
}
ROOT_EXTENSIONS = {
    ".py",
    ".json",
    ".md",
    ".txt",
    ".bat",
    ".cmd",
    ".ps1",
    ".ico",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".svg",
}
BLOCKED_FILENAMES = {
    "service_role.txt",
    "service-role.txt",
    "secrets.txt",
    "credentials.txt",
}
BLOCKED_EXTENSIONS_ANYWHERE = {
    ".env",
    ".key",
    ".pem",
    ".pfx",
    ".p12",
    ".xlsx",
    ".xls",
    ".xlsm",
    ".db",
    ".sqlite",
    ".sqlite3",
    ".zip",
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def fail(message: str, destination: Path | None = None, cleanup: bool = False) -> int:
    if cleanup and destination and destination.exists():
        shutil.rmtree(destination, ignore_errors=True)
    print(f"\nIMPORT STOPPED: {message}", file=sys.stderr)
    return 1


def should_skip_asset(path: Path) -> bool:
    if any(part.lower() in PROTECTED_DIRS for part in path.parts):
        return True
    if path.name.lower() in BLOCKED_FILENAMES:
        return True
    if path.suffix.lower() in BLOCKED_EXTENSIONS_ANYWHERE:
        return True
    return False


def copy_assets(source_assets: Path, destination_assets: Path) -> None:
    for source_path in source_assets.rglob("*"):
        relative = source_path.relative_to(source_assets)
        if should_skip_asset(relative):
            continue
        target = destination_assets / relative
        if source_path.is_dir():
            target.mkdir(parents=True, exist_ok=True)
        elif source_path.is_file():
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source_path, target)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default=str(DEFAULT_SOURCE))
    parser.add_argument("--expected-version", default=DEFAULT_VERSION)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    source = Path(args.source)
    expected = args.expected_version.strip()
    repo_root = Path(__file__).resolve().parent.parent
    destination = repo_root / "legacy" / f"windows-v{expected}"

    print("JOLI POLI Claw Closing - Web Migration Baseline Import")
    print(f"Source:      {source}")
    print(f"Expected:    v{expected}")
    print(f"Destination: {destination}")

    if not source.is_dir():
        return fail(f"Source application folder was not found: {source}")

    config_path = source / "config.py"
    if not config_path.is_file():
        return fail("config.py was not found in the source application.")

    config_text = config_path.read_text(encoding="utf-8", errors="replace")
    match = re.search(r"APP_VERSION\s*=\s*[\"']([^\"']+)[\"']", config_text)
    if not match:
        return fail("Could not read APP_VERSION from config.py.")
    actual = match.group(1).strip()
    if actual != expected:
        return fail(
            f"Installed source reports v{actual}, but this migration kit requires v{expected}. "
            "Update/confirm the Windows app first or explicitly build a migration kit for the actual version."
        )

    if destination.exists():
        if not args.force:
            return fail(
                "Destination already exists. Use --force only when intentionally recreating the local reference snapshot."
            )
        shutil.rmtree(destination)

    destination.mkdir(parents=True, exist_ok=False)

    try:
        # Deliberately copy only root-level source/reference files; never recurse through the app root.
        for item in source.iterdir():
            if not item.is_file():
                continue
            if item.name.lower() in BLOCKED_FILENAMES:
                continue
            if item.suffix.lower() in BLOCKED_EXTENSIONS_ANYWHERE:
                continue
            if item.suffix.lower() not in ROOT_EXTENSIONS:
                continue
            shutil.copy2(item, destination / item.name)

        source_assets = source / "assets"
        if source_assets.is_dir():
            copy_assets(source_assets, destination / "assets")

        # Fail closed if any protected directory or business database slipped through.
        for path in destination.rglob("*"):
            if path.is_dir() and path.name.lower() in PROTECTED_DIRS:
                return fail(f"Protected directory was copied: {path}", destination, True)
            if path.is_file() and path.suffix.lower() in BLOCKED_EXTENSIONS_ANYWHERE:
                return fail(f"Blocked file type was copied: {path}", destination, True)
            if path.is_file() and path.name.lower() == "claw_machine_database.xlsx":
                return fail("Live business workbook was copied.", destination, True)

        files = []
        for path in sorted((p for p in destination.rglob("*") if p.is_file()), key=lambda p: p.as_posix()):
            files.append(
                {
                    "path": path.relative_to(destination).as_posix(),
                    "size": path.stat().st_size,
                    "sha256": sha256(path),
                }
            )

        manifest = {
            "source_root": str(source),
            "expected_version": expected,
            "actual_version": actual,
            "imported_at_utc": datetime.now(timezone.utc).isoformat(),
            "protected_directories_excluded": sorted(PROTECTED_DIRS),
            "file_count": len(files),
            "files": files,
        }
        manifest_path = destination / "_IMPORT_MANIFEST.json"
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    except Exception as exc:
        return fail(str(exc), destination, True)

    print(f"\nPASS - v{actual} source imported read-only.")
    print(f"Files copied: {len(files)}")
    print(f"Manifest: {manifest_path}")
    print("Protected business-data/runtime folders were not copied.")
    print("Next: let Codex read CODEX_START_HERE.md and inventory the imported bridge/API.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
