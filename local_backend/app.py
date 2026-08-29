from __future__ import annotations

import argparse
import base64
import binascii
import atexit
import hashlib
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import traceback
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
import webbrowser
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

import uvicorn
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from calculations import MachineInput, SalesInput, calculate_closing, to_decimal, to_int
from config import APP_NAME, APP_VERSION, BACKUP_DIR, DATA_DIR, DATA_MODE, DATABASE_PATH, DEFAULT_OUTLET, REPORTS_DIR, ROOT_DIR, WEB_DIR
from database import DatabaseLockedError, ExcelDatabase
from report_service import export_daily_closing, export_monthly_summary

HOST = "127.0.0.1"

UPDATE_DIR = ROOT_DIR / "updates"
UPDATE_CHANNEL_PATH = UPDATE_DIR / "update_channel.json"
UPDATE_PACKAGE_PATH = UPDATE_DIR / "ClawClosing_Update.zip"
MACHINE_IMAGE_DIR = DATABASE_PATH.parent / "machine_images"
BRAND_LOGO_PATH = WEB_DIR / "assets" / "brand-logo.png"
MACHINE_IMAGE_MAX_BYTES = 5 * 1024 * 1024
IMAGE_MIME_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
UPDATE_MAX_BYTES = 200 * 1024 * 1024
PROTECTED_UPDATE_PATHS = {"data", "backups", "reports", ".venv", "tests", "updates", ".webview", "__pycache__"}
desktop_process_id = 0

DEFAULT_MACHINE_TYPE_SETTINGS = [
    {"name": "Claw", "coins_per_play": 1},
    {"name": "Keychain", "coins_per_play": 1},
    {"name": "Roller", "coins_per_play": 3},
]


def _positive_number(value: Any, label: str) -> float:
    try:
        number = float(str(value).replace(",", "").strip())
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{label} must be a valid number.") from exc
    if number <= 0:
        raise ValueError(f"{label} must be greater than 0.")
    return number


def _machine_type_settings(value: Any) -> list[dict[str, Any]]:
    source = value
    if isinstance(value, str):
        try:
            source = json.loads(value)
        except json.JSONDecodeError:
            source = None
    if not isinstance(source, list):
        source = DEFAULT_MACHINE_TYPE_SETTINGS

    result: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in source:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        if not name or name.casefold() in seen:
            continue
        try:
            coins = int(item.get("coins_per_play") or 0)
        except (TypeError, ValueError):
            continue
        if coins <= 0:
            continue
        seen.add(name.casefold())
        result.append({"name": name, "coins_per_play": coins})
    return result or [dict(item) for item in DEFAULT_MACHINE_TYPE_SETTINGS]


def canonical_machine_type_name(value: Any, machine_id: str = "") -> str:
    text = str(value or "").strip()
    aliases = {
        "claw / plush": "Claw",
        "claw/plush": "Claw",
        "claw": "Claw",
        "keychain": "Keychain",
        "roller": "Roller",
    }
    if text:
        return aliases.get(text.casefold(), text)
    prefix = str(machine_id or "").split("-", 1)[0].upper()
    return {"CL": "Claw", "KC": "Keychain", "RL": "Roller"}.get(prefix, "")


def machine_type_rule(database: ExcelDatabase, machine_type: Any, machine_id: str = "") -> tuple[str, int] | None:
    requested = canonical_machine_type_name(machine_type, machine_id)
    if not requested:
        return None
    for item in application_settings(database).get("machine_types", []):
        name = str(item.get("name") or "").strip()
        if name.casefold() == requested.casefold():
            return name, int(item.get("coins_per_play") or 0)
    return None


def application_settings(database: ExcelDatabase) -> dict[str, Any]:
    return {
        "outlet": str(database.get_setting("Outlet", DEFAULT_OUTLET) or DEFAULT_OUTLET).strip() or DEFAULT_OUTLET,
        "exchange_rate_usd_khr": _positive_number(
            database.get_setting("Exchange_Rate_USD_KHR", 4100),
            "Exchange rate",
        ),
        "price_per_coin_usd": _positive_number(
            database.get_setting("Price_Per_Coin_USD", 0.3125),
            "Price per coin",
        ),
        "machine_types": _machine_type_settings(
            database.get_setting("Machine_Types_JSON", "")
        ),
    }

STANDALONE_UPDATE_HELPER_SOURCE = 'from __future__ import annotations\n\nimport argparse\nimport hashlib\nimport json\nimport os\nimport shutil\nimport subprocess\nimport tempfile\nimport time\nimport traceback\nimport zipfile\nfrom datetime import datetime\nfrom pathlib import Path\n\nPROTECTED = {"data", "backups", "reports", ".venv", "tests", "updates", ".webview", "__pycache__", ".git"}\n\n\ndef parse_args():\n    parser = argparse.ArgumentParser()\n    parser.add_argument("--root", required=True)\n    parser.add_argument("--package", required=True)\n    parser.add_argument("--server-pid", type=int, default=0)\n    parser.add_argument("--desktop-pid", type=int, default=0)\n    parser.add_argument("--expected-version", required=True)\n    parser.add_argument("--expected-size", type=int, required=True)\n    parser.add_argument("--expected-sha256", required=True)\n    parser.add_argument("--ready", required=True)\n    return parser.parse_args()\n\n\ndef log_path(root: Path) -> Path:\n    path = root / "backups" / "update-helper.log"\n    path.parent.mkdir(parents=True, exist_ok=True)\n    return path\n\n\ndef log(root: Path, message: str) -> None:\n    stamp = datetime.now().isoformat(timespec="seconds")\n    try:\n        with log_path(root).open("a", encoding="utf-8") as handle:\n            handle.write(f"[{stamp}] {message}\\n")\n    except OSError:\n        pass\n\n\ndef sha256_file(path: Path) -> str:\n    digest = hashlib.sha256()\n    with path.open("rb") as handle:\n        for chunk in iter(lambda: handle.read(1024 * 1024), b""):\n            digest.update(chunk)\n    return digest.hexdigest().lower()\n\n\ndef process_running(pid: int) -> bool:\n    if pid <= 0:\n        return False\n    if os.name == "nt":\n        # Never use os.kill(pid, 0) on Windows: Python maps non-CTRL\n        # signals to TerminateProcess, so a "probe" can kill the process.\n        import ctypes\n        PROCESS_QUERY_LIMITED_INFORMATION = 0x1000\n        SYNCHRONIZE = 0x00100000\n        WAIT_TIMEOUT = 0x00000102\n        kernel32 = ctypes.windll.kernel32\n        kernel32.OpenProcess.argtypes = [ctypes.c_uint32, ctypes.c_int, ctypes.c_uint32]\n        kernel32.OpenProcess.restype = ctypes.c_void_p\n        kernel32.WaitForSingleObject.argtypes = [ctypes.c_void_p, ctypes.c_uint32]\n        kernel32.WaitForSingleObject.restype = ctypes.c_uint32\n        kernel32.CloseHandle.argtypes = [ctypes.c_void_p]\n        kernel32.CloseHandle.restype = ctypes.c_int\n        handle = kernel32.OpenProcess(\n            PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE,\n            False,\n            int(pid),\n        )\n        if not handle:\n            return False\n        try:\n            return kernel32.WaitForSingleObject(handle, 0) == WAIT_TIMEOUT\n        finally:\n            kernel32.CloseHandle(handle)\n    try:\n        os.kill(pid, 0)\n    except (OSError, ProcessLookupError):\n        return False\n    except PermissionError:\n        return True\n    return True\n\n\ndef stop_pid(pid: int) -> None:\n    if pid <= 0 or pid == os.getpid():\n        return\n    if os.name == "nt":\n        subprocess.run(\n            ["taskkill", "/PID", str(pid), "/F"],\n            stdout=subprocess.DEVNULL,\n            stderr=subprocess.DEVNULL,\n            check=False,\n        )\n    else:\n        try:\n            os.kill(pid, 15)\n        except OSError:\n            return\n\n\ndef wait_stopped(pid: int, timeout: float = 10.0) -> bool:\n    deadline = time.monotonic() + timeout\n    while time.monotonic() < deadline:\n        if not process_running(pid):\n            return True\n        time.sleep(0.1)\n    return not process_running(pid)\n\n\ndef clear_database_lock(root: Path, server_pid: int, desktop_pid: int) -> None:\n    if process_running(server_pid) or process_running(desktop_pid):\n        raise RuntimeError("The old application processes are still running; refusing to clear the database lock.")\n    lock_path = root / "data" / "claw_machine_database.xlsx.lock"\n    deadline = time.monotonic() + 6.0\n    last_error = None\n    while lock_path.exists() and time.monotonic() < deadline:\n        try:\n            lock_path.unlink(missing_ok=True)\n            last_error = None\n        except OSError as exc:\n            last_error = exc\n        if lock_path.exists():\n            time.sleep(0.15)\n    if lock_path.exists():\n        raise RuntimeError(f"Could not clear the database lock after stopping the old app: {last_error or lock_path}")\n    time.sleep(0.8)\n\n\ndef verify_package(package: Path, version: str, expected_size: int, expected_sha: str) -> None:\n    if not package.exists():\n        raise FileNotFoundError(f"Update package not found: {package}")\n    actual_size = package.stat().st_size\n    if actual_size != expected_size:\n        raise RuntimeError(f"Update size mismatch: expected {expected_size}, got {actual_size}")\n    actual_sha = sha256_file(package)\n    if actual_sha != expected_sha.lower():\n        raise RuntimeError(f"Update checksum mismatch: expected {expected_sha}, got {actual_sha}")\n    with zipfile.ZipFile(package) as archive:\n        candidates = sorted(\n            (name for name in archive.namelist() if name.replace("\\\\", "/").endswith("version.json")),\n            key=lambda item: (item.count("/"), len(item)),\n        )\n        if not candidates:\n            raise RuntimeError("version.json is missing from the update package")\n        metadata = json.loads(archive.read(candidates[0]).decode("utf-8"))\n    actual_version = str(metadata.get("version") or "").strip()\n    if actual_version != version:\n        raise RuntimeError(f"Update version mismatch: expected {version}, got {actual_version}")\n\n\ndef safe_members(archive: zipfile.ZipFile):\n    selected = []\n    protected = {item.casefold() for item in PROTECTED}\n    for member in archive.infolist():\n        if member.is_dir():\n            continue\n        raw = member.filename.replace("\\\\", "/").lstrip("/")\n        parts = [part for part in raw.split("/") if part not in {"", "."}]\n        if not parts:\n            continue\n        if ".." in parts:\n            raise RuntimeError(f"Unsafe parent traversal in update package: {member.filename}")\n        if parts[0].casefold() in protected:\n            continue\n        if parts[-1].casefold() == "version.json":\n            continue\n        member.filename = "/".join(parts)\n        selected.append(member)\n    return selected\n\n\ndef restart_application(root: Path) -> None:\n    run_file = root / "Run_App.bat"\n    if not run_file.exists():\n        raise FileNotFoundError(f"Run_App.bat was not found: {run_file}")\n    if os.name == "nt":\n        os.startfile(str(run_file))\n    else:\n        subprocess.Popen([str(run_file)], cwd=str(root), start_new_session=True)\n\n\ndef apply_update(args) -> int:\n    root = Path(args.root).resolve()\n    package = Path(args.package).resolve()\n    ready = Path(args.ready).resolve()\n    try:\n        ready.parent.mkdir(parents=True, exist_ok=True)\n        ready.write_text(str(os.getpid()), encoding="utf-8")\n        log(root, f"Standalone helper started. helper_pid={os.getpid()} package={package}")\n        verify_package(package, args.expected_version, args.expected_size, args.expected_sha256)\n        log(root, f"Package verified. version={args.expected_version} size={args.expected_size} sha256={args.expected_sha256}")\n\n        # Let /api/update/apply return before stopping the running application.\n        time.sleep(1.2)\n        stop_pid(args.server_pid)\n        if not wait_stopped(args.server_pid):\n            raise RuntimeError(f"The old application server did not stop (PID {args.server_pid}).")\n        stop_pid(args.desktop_pid)\n        if not wait_stopped(args.desktop_pid):\n            raise RuntimeError(f"The old desktop process did not stop (PID {args.desktop_pid}).")\n        clear_database_lock(root, args.server_pid, args.desktop_pid)\n\n        backups = root / "backups"\n        backups.mkdir(parents=True, exist_ok=True)\n        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")\n        code_backup = backups / f"code-{stamp}"\n        staging = Path(tempfile.mkdtemp(prefix="claw-update-"))\n        copied = 0\n        protected = {item.casefold() for item in PROTECTED}\n        try:\n            with zipfile.ZipFile(package) as archive:\n                members = safe_members(archive)\n                archive.extractall(staging, members=members)\n\n            for source in sorted(staging.rglob("*")):\n                if not source.is_file():\n                    continue\n                relative = source.relative_to(staging)\n                destination = (root / relative).resolve()\n                try:\n                    destination.relative_to(root)\n                except ValueError as exc:\n                    raise RuntimeError(f"Unsafe destination path: {relative}") from exc\n                if relative.parts and relative.parts[0].casefold() in protected:\n                    continue\n                if destination.exists() and destination.is_file():\n                    backup_file = code_backup / relative\n                    backup_file.parent.mkdir(parents=True, exist_ok=True)\n                    shutil.copy2(destination, backup_file)\n                destination.parent.mkdir(parents=True, exist_ok=True)\n                shutil.copy2(source, destination)\n                copied += 1\n\n            if copied <= 0:\n                raise RuntimeError("The update package did not contain any applicable files")\n\n            (backups / "last-update.json").write_text(\n                json.dumps(\n                    {\n                        "updated_at": datetime.now().isoformat(timespec="seconds"),\n                        "version": args.expected_version,\n                        "package": str(package),\n                        "backup": str(code_backup),\n                        "copied_files": copied,\n                        "status": "success",\n                        "helper": "standalone-v219",\n                    },\n                    indent=2,\n                ),\n                encoding="utf-8",\n            )\n            log(root, f"Update files applied successfully. copied_files={copied} backup={code_backup}")\n        finally:\n            shutil.rmtree(staging, ignore_errors=True)\n\n        package.unlink(missing_ok=True)\n        package.with_suffix(".download").unlink(missing_ok=True)\n        ready.unlink(missing_ok=True)\n        restart_application(root)\n        log(root, "Application restart launched successfully.")\n        return 0\n    except Exception as exc:\n        log(root, f"Update failed: {exc}\\n{traceback.format_exc()}")\n        ready.unlink(missing_ok=True)\n        # Avoid creating a second app session. Restart only if the original\n        # server and desktop are both confirmed gone and the lock can be cleared.\n        try:\n            if not process_running(args.server_pid) and not process_running(args.desktop_pid):\n                clear_database_lock(root, args.server_pid, args.desktop_pid)\n                restart_application(root)\n                log(root, "Recovery restart launched after update failure.")\n            else:\n                log(root, "Recovery restart skipped because an original app process is still running.")\n        except Exception as restart_exc:\n            log(root, f"Recovery restart failed: {restart_exc}")\n        return 1\n\n\nif __name__ == "__main__":\n    raise SystemExit(apply_update(parse_args()))\n'


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().lower()


def version_tuple(value: Any) -> tuple[int, ...]:
    numbers = [int(part) for part in re.findall(r"\d+", str(value or ""))]
    return tuple(numbers or [0])


def is_newer_version(candidate: Any, current: Any = APP_VERSION) -> bool:
    left = list(version_tuple(candidate))
    right = list(version_tuple(current))
    width = max(len(left), len(right))
    left.extend([0] * (width - len(left)))
    right.extend([0] * (width - len(right)))
    return tuple(left) > tuple(right)


def update_channel() -> dict[str, Any]:
    UPDATE_DIR.mkdir(parents=True, exist_ok=True)
    defaults = {"github_repo": "", "manifest_url": "", "auto_check": True}
    if not UPDATE_CHANNEL_PATH.exists():
        return defaults
    try:
        loaded = json.loads(UPDATE_CHANNEL_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return defaults
    if isinstance(loaded, dict):
        defaults.update({key: loaded.get(key, value) for key, value in defaults.items()})
    return defaults


def save_update_channel(payload: dict[str, Any]) -> dict[str, Any]:
    github_repo = str(payload.get("github_repo") or "").strip().strip("/")
    manifest_url = str(payload.get("manifest_url") or "").strip()
    if github_repo and not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", github_repo):
        raise ValueError("GitHub repository must use owner/repository format.")
    if manifest_url and urllib.parse.urlparse(manifest_url).scheme not in {"http", "https"}:
        raise ValueError("Manifest URL must begin with http:// or https://.")
    result = {
        "github_repo": github_repo,
        "manifest_url": manifest_url,
        "auto_check": bool(payload.get("auto_check", True)),
    }
    UPDATE_DIR.mkdir(parents=True, exist_ok=True)
    temp = UPDATE_CHANNEL_PATH.with_suffix(".tmp")
    temp.write_text(json.dumps(result, indent=2), encoding="utf-8")
    os.replace(temp, UPDATE_CHANNEL_PATH)
    return result


def http_json(url: str) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "Cache-Control": "no-cache",
            "Connection": "close",
            "User-Agent": f"JOLI-POLI-Claw-Closing/{APP_VERSION}",
        },
    )
    timeouts = (12, 20, 30)
    last_error: Exception | None = None
    for attempt, timeout_seconds in enumerate(timeouts, start=1):
        try:
            with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
                data = json.loads(response.read().decode("utf-8"))
            if not isinstance(data, dict):
                raise ValueError("The update source returned an invalid response.")
            return data
        except urllib.error.HTTPError as exc:
            last_error = exc
            if exc.code < 500 or attempt >= len(timeouts):
                raise
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last_error = exc
            if attempt >= len(timeouts):
                raise
        time.sleep(0.6 * attempt)
    if last_error is not None:
        raise last_error
    raise RuntimeError("The update source could not be reached.")


def inspect_update_package(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(path)
    try:
        with zipfile.ZipFile(path) as archive:
            candidates = sorted(
                (name for name in archive.namelist() if name.replace("\\", "/").endswith("version.json")),
                key=lambda item: (item.count("/"), len(item)),
            )
            if not candidates:
                raise ValueError("The update package does not contain version.json.")
            metadata = json.loads(archive.read(candidates[0]).decode("utf-8"))
    except (zipfile.BadZipFile, KeyError, json.JSONDecodeError) as exc:
        raise ValueError("The update ZIP is invalid.") from exc
    version = str(metadata.get("version") or "").strip()
    if not version:
        raise ValueError("The update package version is missing.")
    notes = metadata.get("release_notes") or metadata.get("notes") or []
    if isinstance(notes, str):
        notes = [line.strip(" -*") for line in notes.splitlines() if line.strip()]
    return {
        "version": version,
        "release_notes": list(notes)[:20] if isinstance(notes, list) else [],
        "sha256": str(metadata.get("sha256") or "").strip().lower(),
        "size": path.stat().st_size,
    }


def remote_update_info() -> dict[str, Any] | None:
    channel = update_channel()
    manifest_url = str(channel.get("manifest_url") or "").strip()
    github_repo = str(channel.get("github_repo") or "").strip()
    if manifest_url:
        data = http_json(manifest_url)
        download_url = urllib.parse.urljoin(manifest_url, str(data.get("download_url") or ""))
        if not download_url:
            raise ValueError("The update manifest does not include download_url.")
        notes = data.get("release_notes") or data.get("notes") or []
        if isinstance(notes, str):
            notes = [line.strip(" -*") for line in notes.splitlines() if line.strip()]
        return {
            "source": "manifest",
            "version": str(data.get("version") or "").strip(),
            "download_url": download_url,
            "release_notes": list(notes)[:20] if isinstance(notes, list) else [],
            "sha256": str(data.get("sha256") or "").strip().lower(),
            "size": int(data.get("size") or 0),
            "source_label": manifest_url,
        }
    if github_repo:
        release = http_json(f"https://api.github.com/repos/{github_repo}/releases/latest")
        assets = release.get("assets") or []
        asset = next(
            (item for item in assets if str(item.get("name") or "").casefold() == "clawclosing_update.zip".casefold()),
            None,
        )
        if not asset:
            raise ValueError("The latest GitHub release has no ClawClosing_Update.zip asset.")
        body = str(release.get("body") or "")
        notes = [line.strip(" -*") for line in body.splitlines() if line.strip() and not line.lstrip().startswith("#")]
        return {
            "source": "github",
            "version": str(release.get("tag_name") or release.get("name") or "").lstrip("vV").strip(),
            "download_url": str(asset.get("browser_download_url") or ""),
            "release_notes": notes[:20],
            "sha256": "",
            "size": int(asset.get("size") or 0),
            "source_label": github_repo,
        }
    return None


def update_status() -> dict[str, Any]:
    channel = update_channel()
    configured = bool(channel.get("github_repo") or channel.get("manifest_url"))
    if UPDATE_PACKAGE_PATH.exists():
        try:
            info = inspect_update_package(UPDATE_PACKAGE_PATH)
            return {
                **info,
                "current_version": APP_VERSION,
                "available": is_newer_version(info["version"]),
                "downloaded": True,
                "configured": configured,
                "source": "local",
                "source_label": str(UPDATE_PACKAGE_PATH),
                "error": "",
            }
        except Exception as exc:
            return {
                "current_version": APP_VERSION,
                "available": False,
                "downloaded": False,
                "configured": configured,
                "source": "local",
                "source_label": str(UPDATE_PACKAGE_PATH),
                "error": str(exc),
            }
    if not configured:
        return {
            "current_version": APP_VERSION,
            "version": APP_VERSION,
            "available": False,
            "downloaded": False,
            "configured": False,
            "source": "none",
            "source_label": "",
            "release_notes": [],
            "size": 0,
            "error": "",
        }
    try:
        info = remote_update_info()
        if info is None:
            raise ValueError("The update source is not configured.")
        version = str(info.get("version") or "")
        if not version:
            raise ValueError("The update source did not provide a version.")
        return {
            **info,
            "current_version": APP_VERSION,
            "available": is_newer_version(version),
            "downloaded": False,
            "configured": True,
            "error": "",
        }
    except Exception as exc:
        return {
            "current_version": APP_VERSION,
            "version": APP_VERSION,
            "available": False,
            "downloaded": False,
            "configured": True,
            "source": "remote",
            "source_label": str(channel.get("github_repo") or channel.get("manifest_url") or ""),
            "release_notes": [],
            "size": 0,
            "error": str(exc),
        }


def download_update_package(info: dict[str, Any]) -> dict[str, Any]:
    url = str(info.get("download_url") or "").strip()
    if not url:
        raise ValueError("The update download URL is unavailable.")
    UPDATE_DIR.mkdir(parents=True, exist_ok=True)
    temp_path = UPDATE_PACKAGE_PATH.with_suffix(".download")
    digest = hashlib.sha256()
    received = 0
    request = urllib.request.Request(url, headers={"User-Agent": f"JOLI-POLI-Claw-Closing/{APP_VERSION}"})
    try:
        with urllib.request.urlopen(request, timeout=45) as response, temp_path.open("wb") as target:
            declared = int(response.headers.get("Content-Length") or 0)
            if declared > UPDATE_MAX_BYTES:
                raise ValueError("The update package is larger than the allowed limit.")
            while True:
                chunk = response.read(1024 * 256)
                if not chunk:
                    break
                received += len(chunk)
                if received > UPDATE_MAX_BYTES:
                    raise ValueError("The update package is larger than the allowed limit.")
                digest.update(chunk)
                target.write(chunk)
        expected = str(info.get("sha256") or "").strip().lower()
        if expected and digest.hexdigest().lower() != expected:
            raise ValueError("The downloaded update failed its security checksum.")
        os.replace(temp_path, UPDATE_PACKAGE_PATH)
        package = inspect_update_package(UPDATE_PACKAGE_PATH)
        if package["version"] != str(info.get("version") or package["version"]):
            raise ValueError("The downloaded update version does not match the update source.")
        return package
    finally:
        temp_path.unlink(missing_ok=True)


def process_running(pid: int) -> bool:
    if pid <= 0:
        return False
    if os.name == "nt":
        import ctypes

        PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
        SYNCHRONIZE = 0x00100000
        WAIT_TIMEOUT = 0x00000102
        kernel32 = ctypes.windll.kernel32
        kernel32.OpenProcess.argtypes = [ctypes.c_uint32, ctypes.c_int, ctypes.c_uint32]
        kernel32.OpenProcess.restype = ctypes.c_void_p
        kernel32.WaitForSingleObject.argtypes = [ctypes.c_void_p, ctypes.c_uint32]
        kernel32.WaitForSingleObject.restype = ctypes.c_uint32
        kernel32.CloseHandle.argtypes = [ctypes.c_void_p]
        kernel32.CloseHandle.restype = ctypes.c_int
        handle = kernel32.OpenProcess(
            PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE,
            False,
            int(pid),
        )
        if not handle:
            return False
        try:
            return kernel32.WaitForSingleObject(handle, 0) == WAIT_TIMEOUT
        finally:
            kernel32.CloseHandle(handle)
    try:
        os.kill(pid, 0)
    except (ProcessLookupError, OSError):
        return False
    except PermissionError:
        return True
    return True


def stop_process(pid: int) -> None:
    if pid <= 0 or pid == os.getpid():
        return
    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/PID", str(pid), "/F"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
    else:
        try:
            os.kill(pid, 15)
        except OSError:
            pass


def wait_process_stopped(pid: int, timeout: float = 10.0) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if not process_running(pid):
            return True
        time.sleep(0.1)
    return not process_running(pid)


def clear_update_database_lock(root: Path, server_pid: int, desktop_pid: int) -> None:
    if process_running(server_pid) or process_running(desktop_pid):
        raise RuntimeError("The old application processes are still running; refusing to clear the database lock.")
    lock_path = root / "data" / "claw_machine_database.xlsx.lock"
    deadline = time.monotonic() + 6.0
    last_error: Exception | None = None
    while lock_path.exists() and time.monotonic() < deadline:
        try:
            lock_path.unlink(missing_ok=True)
            last_error = None
        except OSError as exc:
            last_error = exc
        if lock_path.exists():
            time.sleep(0.15)
    if lock_path.exists():
        raise RuntimeError(f"Could not clear the database lock after stopping the old app: {last_error or lock_path}")
    time.sleep(0.8)


def safe_update_members(archive: zipfile.ZipFile) -> list[zipfile.ZipInfo]:
    selected: list[zipfile.ZipInfo] = []
    for member in archive.infolist():
        if member.is_dir():
            continue
        name = member.filename.replace("\\", "/").lstrip("/")
        parts = [part for part in name.split("/") if part not in {"", "."}]
        if not parts or ".." in parts:
            raise ValueError("The update package contains an unsafe file path.")
        if parts[0].casefold() in {item.casefold() for item in PROTECTED_UPDATE_PATHS}:
            continue
        if parts[-1].casefold() == "version.json":
            continue
        member.filename = "/".join(parts)
        selected.append(member)
    return selected


def update_helper_log_path(root: Path) -> Path:
    backups = root / "backups"
    backups.mkdir(parents=True, exist_ok=True)
    return backups / "update-helper.log"


def append_update_helper_log(root: Path, message: str) -> None:
    timestamp = datetime.now().isoformat(timespec="seconds")
    try:
        with update_helper_log_path(root).open("a", encoding="utf-8") as log:
            log.write(f"[{timestamp}] {message}\n")
    except OSError:
        pass


def start_application(root: Path) -> None:
    run_file = root / "Run_App.bat"
    if not run_file.exists():
        raise FileNotFoundError(f"Run_App.bat was not found: {run_file}")
    if os.name == "nt":
        os.startfile(str(run_file))
    else:
        subprocess.Popen([str(run_file)], cwd=str(root), start_new_session=True)


def apply_update_package(root: Path, package_path: Path, server_pid: int, desktop_pid: int) -> int:
    append_update_helper_log(
        root,
        f"Starting update helper. package={package_path} server_pid={server_pid} desktop_pid={desktop_pid}",
    )
    try:
        # Give the API response enough time to return, then stop both app processes.
        time.sleep(0.8)
        stop_process(server_pid)
        if not wait_process_stopped(server_pid):
            raise RuntimeError(f"The old application server did not stop (PID {server_pid}).")
        stop_process(desktop_pid)
        if not wait_process_stopped(desktop_pid):
            raise RuntimeError(f"The old desktop process did not stop (PID {desktop_pid}).")

        if not package_path.exists():
            raise FileNotFoundError(f"The update package is missing: {package_path}")

        clear_update_database_lock(root, server_pid, desktop_pid)

        backups = root / "backups"
        backups.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        code_backup = backups / f"code-{stamp}"
        staging = Path(tempfile.mkdtemp(prefix="claw-update-"))

        try:
            with zipfile.ZipFile(package_path) as archive:
                members = safe_update_members(archive)
                archive.extractall(staging, members=members)

            copied = 0
            for source in sorted(staging.rglob("*")):
                if not source.is_file():
                    continue
                relative = source.relative_to(staging)
                destination = root / relative
                if destination.exists() and destination.is_file():
                    backup_file = code_backup / relative
                    backup_file.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(destination, backup_file)
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, destination)
                copied += 1

            if copied == 0:
                raise RuntimeError("The update package did not contain any applicable files.")

            applied = {
                "updated_at": datetime.now().isoformat(timespec="seconds"),
                "package": str(package_path),
                "backup": str(code_backup),
                "copied_files": copied,
                "status": "success",
            }
            (backups / "last-update.json").write_text(
                json.dumps(applied, indent=2),
                encoding="utf-8",
            )
            package_path.unlink(missing_ok=True)
            append_update_helper_log(root, f"Update files applied successfully. copied_files={copied}")
        finally:
            shutil.rmtree(staging, ignore_errors=True)

        start_application(root)
        append_update_helper_log(root, "Application restart command launched successfully.")
        return 0
    except Exception as exc:
        append_update_helper_log(root, f"Update failed: {exc}\n{traceback.format_exc()}")
        # Never leave the user with a permanently closed app after a failed update.
        try:
            start_application(root)
            append_update_helper_log(root, "Recovery restart command launched after update failure.")
        except Exception as restart_exc:
            append_update_helper_log(root, f"Recovery restart failed: {restart_exc}")
        return 1


def launch_update_helper(package_path: Path) -> None:
    current_runtime = runtime
    server_pid = os.getpid()
    root = ROOT_DIR.resolve()
    log_path = update_helper_log_path(root)
    UPDATE_DIR.mkdir(parents=True, exist_ok=True)

    package = inspect_update_package(package_path)
    expected_version = str(package.get("version") or "").strip()
    expected_size = package_path.stat().st_size
    expected_sha256 = file_sha256(package_path)

    helper_path = UPDATE_DIR / "_claw_update_helper.py"
    ready_path = UPDATE_DIR / f".update-helper-{server_pid}.ready"
    ready_path.unlink(missing_ok=True)
    helper_path.write_text(STANDALONE_UPDATE_HELPER_SOURCE, encoding="utf-8")

    helper_python = Path(sys.executable)
    if os.name == "nt" and helper_python.name.casefold() == "pythonw.exe":
        console_python = helper_python.with_name("python.exe")
        if console_python.exists():
            helper_python = console_python

    helper_command = [
        str(helper_python),
        str(helper_path),
        "--root",
        str(root),
        "--package",
        str(package_path.resolve()),
        "--server-pid",
        str(server_pid),
        "--desktop-pid",
        str(desktop_process_id),
        "--expected-version",
        expected_version,
        "--expected-size",
        str(expected_size),
        "--expected-sha256",
        expected_sha256,
        "--ready",
        str(ready_path),
    ]

    append_update_helper_log(
        root,
        f"Launching standalone update helper. version={expected_version} size={expected_size} sha256={expected_sha256}",
    )

    if os.name == "nt":
        # Launch the helper directly instead of routing through cmd.exe START.
        # START has special quote/title parsing and breaks when the app lives
        # under a Windows path containing spaces (for example D:\Python File\...).
        # A detached Python child survives the server process and can safely
        # stop the app, apply the package, and restart Run_App.bat.
        creationflags = (
            getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
            | getattr(subprocess, "DETACHED_PROCESS", 0)
        )
        subprocess.Popen(
            helper_command,
            cwd=str(root),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=creationflags,
            close_fds=True,
        )
    else:
        subprocess.Popen(
            helper_command,
            cwd=str(root),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )

    # Confirm the independent helper is alive before returning success to the UI.
    deadline = time.monotonic() + 4.0
    while time.monotonic() < deadline:
        if ready_path.exists():
            break
        time.sleep(0.08)
    else:
        details = ""
        try:
            details = log_path.read_text(encoding="utf-8")[-3000:]
        except OSError:
            pass
        raise RuntimeError(
            "The automatic update helper could not start. "
            + (f"Details: {details}" if details else f"See {log_path}.")
        )

    if current_runtime and current_runtime.server is not None:
        threading.Timer(
            0.7,
            setattr,
            args=(current_runtime.server, "should_exit", True),
        ).start()

def show_native_error(title: str, message: str) -> None:
    if os.name == "nt":
        try:
            import ctypes

            ctypes.windll.user32.MessageBoxW(0, message, title, 0x10)
            return
        except Exception:
            pass
    print(f"{title}: {message}", file=sys.stderr)


def open_folder(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)
    if os.name == "nt":
        os.startfile(path)  # type: ignore[attr-defined]
    elif sys.platform == "darwin":
        subprocess.Popen(["open", str(path)])
    else:
        subprocess.Popen(["xdg-open", str(path)])


def serialise(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): serialise(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [serialise(item) for item in value]
    if isinstance(value, datetime):
        return value.isoformat(timespec="seconds")
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value


def normalise_barcodes(value: Any) -> list[str]:
    if isinstance(value, list):
        raw_values = value
    else:
        text = str(value or "").strip()
        if not text:
            raw_values = []
        else:
            try:
                loaded = json.loads(text)
            except json.JSONDecodeError:
                loaded = None
            raw_values = loaded if isinstance(loaded, list) else re.split(r"[\r\n,;|]+", text)

    result: list[str] = []
    seen: set[str] = set()
    for item in raw_values:
        code = str(item or "").strip()
        if not code:
            continue
        if len(code) > 100:
            raise ValueError("Each barcode must be 100 characters or fewer.")
        key = code.casefold()
        if key in seen:
            continue
        seen.add(key)
        result.append(code)
        if len(result) > 30:
            raise ValueError("A machine can contain up to 30 barcode codes.")
    return result


def infer_machine_type(machine_id: str, existing_type: str = "") -> str:
    if existing_type:
        return canonical_machine_type_name(existing_type, machine_id)
    prefix = machine_id.split("-", 1)[0].upper()
    return {
        "CL": "Claw",
        "KC": "Keychain",
        "RL": "Roller",
        "BB": "Blind Box",
    }.get(prefix, "Other")


def machine_image_url(file_name: Any) -> str:
    safe_name = Path(str(file_name or "")).name
    if not safe_name:
        return ""
    return f"/api/machine-images/{urllib.parse.quote(safe_name)}"


def machine_view(record: dict[str, Any]) -> dict[str, Any]:
    result = dict(record)
    result["Machine_Type"] = canonical_machine_type_name(result.get("Machine_Type"), str(result.get("Machine_ID") or ""))
    result["Barcodes"] = normalise_barcodes(result.get("Barcodes_JSON"))
    result["Image_URL"] = machine_image_url(result.get("Image_File"))
    return result


def remove_machine_image(file_name: Any) -> None:
    safe_name = Path(str(file_name or "")).name
    if not safe_name:
        return
    try:
        (MACHINE_IMAGE_DIR / safe_name).unlink(missing_ok=True)
    except OSError:
        pass


def save_machine_image(machine_id: str, image_data: Any, existing_file: Any = "") -> str:
    value = str(image_data or "").strip()
    if not value:
        return Path(str(existing_file or "")).name

    match = re.fullmatch(
        r"data:(image/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)",
        value,
        flags=re.IGNORECASE,
    )
    if not match:
        raise ValueError("Upload a JPG, PNG, or WEBP machine image.")

    mime_type = match.group(1).lower()
    extension = IMAGE_MIME_EXTENSIONS.get(mime_type)
    if not extension:
        raise ValueError("Unsupported machine image format.")

    try:
        payload = base64.b64decode(re.sub(r"\s+", "", match.group(2)), validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("The uploaded machine image is invalid.") from exc

    if not payload or len(payload) > MACHINE_IMAGE_MAX_BYTES:
        raise ValueError("Machine images must be between 1 byte and 5 MB.")

    valid_signature = (
        mime_type == "image/jpeg" and payload.startswith(b"\xff\xd8\xff")
    ) or (
        mime_type == "image/png" and payload.startswith(b"\x89PNG\r\n\x1a\n")
    ) or (
        mime_type == "image/webp"
        and len(payload) >= 12
        and payload[:4] == b"RIFF"
        and payload[8:12] == b"WEBP"
    )
    if not valid_signature:
        raise ValueError("The uploaded file does not match its image format.")

    safe_machine_id = re.sub(r"[^A-Za-z0-9_.-]+", "-", machine_id).strip("-") or "machine"
    digest = hashlib.sha256(payload).hexdigest()[:12]
    file_name = f"{safe_machine_id}-{digest}{extension}"

    MACHINE_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    destination = MACHINE_IMAGE_DIR / file_name
    temp = destination.with_suffix(destination.suffix + ".tmp")
    temp.write_bytes(payload)
    os.replace(temp, destination)

    previous = Path(str(existing_file or "")).name
    if previous and previous != file_name:
        remove_machine_image(previous)
    return file_name


def parse_iso_date(value: Any) -> date:
    text = str(value or "").strip()
    for pattern in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(text, pattern).date()
        except ValueError:
            continue
    raise ValueError("Use a valid report date.")


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((HOST, 0))
        return int(sock.getsockname()[1])


def health_url(port: int) -> str:
    return f"http://{HOST}:{port}/api/health"


def server_log_path() -> Path:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    return BACKUP_DIR / "local-server.log"


def read_log_tail(path: Path, max_chars: int = 4000) -> str:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""
    return text[-max_chars:].strip()


def make_sales(payload: dict[str, Any]) -> SalesInput:
    return SalesInput(
        cash_sales=to_decimal(payload.get("cash_sales")),
        cash_transactions=to_int(payload.get("cash_transactions")),
        aba_sales=to_decimal(payload.get("aba_sales")),
        aba_transactions=to_int(payload.get("aba_transactions")),
        adjustment=to_decimal(payload.get("adjustment")),
        beginning_coins=to_int(payload.get("beginning_coins")),
        coins_added=to_int(payload.get("coins_added")),
        final_coins=to_int(payload.get("final_coins")),
    )


def make_machines(payload: list[dict[str, Any]]) -> list[MachineInput]:
    machines: list[MachineInput] = []
    for row in payload:
        machines.append(
            MachineInput(
                machine_id=str(row.get("machine_id") or "").strip(),
                machine_name=str(row.get("machine_name") or "").strip(),
                machine_type=str(row.get("machine_type") or "").strip(),
                capacity=to_int(row.get("capacity")),
                begin_prize=to_int(row.get("begin_prize")),
                refill_prize=to_int(row.get("refill_prize")),
                final_prize=to_int(row.get("final_prize")),
                begin_coin_meter=to_int(row.get("begin_coin_meter")),
                final_coin_meter=to_int(row.get("final_coin_meter")),
                status=str(row.get("status") or "Working"),
                notes=str(row.get("notes") or "").strip(),
            )
        )
    return machines


class Runtime:
    def __init__(self) -> None:
        self.db = ExcelDatabase(DATABASE_PATH, BACKUP_DIR)
        self.db.acquire_application_lock()
        self.db.migrate_branding(APP_NAME, DEFAULT_OUTLET)
        self.server: uvicorn.Server | None = None
        self.lock = threading.RLock()
        self.closed = False

    def close(self) -> None:
        with self.lock:
            if self.closed:
                return
            self.closed = True
            if self.server is not None:
                self.server.should_exit = True
            self.db.release_application_lock()


runtime: Runtime | None = None
api = FastAPI(title=APP_NAME, version=APP_VERSION, docs_url=None, redoc_url=None)


def db() -> ExcelDatabase:
    if runtime is None:
        raise RuntimeError("Application runtime has not started.")
    return runtime.db


@api.exception_handler(ValueError)
async def value_error_handler(_request, exc: ValueError):
    from fastapi.responses import JSONResponse

    return JSONResponse(status_code=400, content={"detail": str(exc)})


@api.get("/api/health")
def health() -> dict[str, Any]:
    return {"ok": True, "version": APP_VERSION, "data_mode": DATA_MODE}


@api.get("/api/runtime")
def runtime_info() -> dict[str, Any]:
    """Expose a safe relative data identity for local UAT/test verification."""
    return {
        "mode": DATA_MODE,
        "data_directory": str(DATA_DIR.relative_to(ROOT_DIR)).replace("\\", "/"),
        "workbook": str(DATABASE_PATH.relative_to(ROOT_DIR)).replace("\\", "/"),
        "image_directory": str(MACHINE_IMAGE_DIR.relative_to(ROOT_DIR)).replace("\\", "/"),
    }


@api.get("/api/bootstrap")
def bootstrap() -> dict[str, Any]:
    database = db()
    return serialise(
        {
            "app": {"name": APP_NAME, "version": APP_VERSION},
            "settings": {
                "outlet": database.get_setting("Outlet", DEFAULT_OUTLET),
                "currency": database.get_setting("Currency", "USD"),
                "variance_tolerance": to_int(database.get_setting("Variance_Tolerance", 0)),
                **application_settings(database),
            },
            "dashboard": database.dashboard_summary(),
            "recent_closings": database.list_closings(12),
            "machines": [
                machine_view(item)
                for item in database.list_machines(active_only=False)
            ],
        }
    )


@api.get("/api/settings")
def get_application_settings() -> dict[str, Any]:
    return serialise({"settings": application_settings(db())})


# v2.1.65 - Settings remains view-only until the administrator password is verified.
SETTINGS_EDIT_PASSWORD_SHA256 = "016a1d83ca442cc97092e9230f4f532ac76d1c97d35cb8dd1c88628d4931d0df"

def _settings_edit_password_ok(value: Any) -> bool:
    supplied = str(value or "")
    return hashlib.sha256(supplied.encode("utf-8")).hexdigest() == SETTINGS_EDIT_PASSWORD_SHA256

@api.post("/api/settings/unlock")
def unlock_application_settings(payload: dict[str, Any]) -> dict[str, Any]:
    if not _settings_edit_password_ok(payload.get("password")):
        raise ValueError("Incorrect Settings password.")
    return {"ok": True}


@api.post("/api/settings")
def save_application_settings(payload: dict[str, Any]) -> dict[str, Any]:
    database = db()
    updates: dict[str, tuple[Any, str]] = {}

    protected_edit = any(key in payload for key in ("exchange_rate_usd_khr", "price_per_coin_usd", "machine_types"))
    if protected_edit and not _settings_edit_password_ok(payload.get("_edit_password")):
        raise ValueError("Settings password is required before editing.")

    if "outlet" in payload:
        outlet = str(payload.get("outlet") or "").strip()
        if not outlet:
            raise ValueError("Outlet is required.")
        if len(outlet) > 100:
            raise ValueError("Outlet must be 100 characters or fewer.")
        updates["Outlet"] = (outlet, "Default outlet used for new closings")

    if "exchange_rate_usd_khr" in payload or "price_per_coin_usd" in payload:
        if "exchange_rate_usd_khr" not in payload or "price_per_coin_usd" not in payload:
            raise ValueError("Exchange rate and Price / Coin must be saved together.")
        exchange_rate = _positive_number(payload.get("exchange_rate_usd_khr"), "Exchange rate")
        price_per_coin = _positive_number(payload.get("price_per_coin_usd"), "Price per coin")
        updates["Exchange_Rate_USD_KHR"] = (exchange_rate, "KHR received for 1 USD")
        updates["Price_Per_Coin_USD"] = (price_per_coin, "USD selling price for 1 coin")

    if "machine_types" in payload:
        source_types = payload.get("machine_types")
        if not isinstance(source_types, list) or not source_types:
            raise ValueError("Add at least one machine type.")
        machine_types: list[dict[str, Any]] = []
        seen: set[str] = set()
        for item in source_types:
            if not isinstance(item, dict):
                raise ValueError("Each machine type must include a name and coins per play.")
            name = str(item.get("name") or "").strip()
            if not name:
                raise ValueError("Machine type name is required.")
            if name.casefold() in seen:
                raise ValueError(f"Duplicate machine type: {name}")
            raw_coins = item.get("coins_per_play")
            try:
                coins_number = float(raw_coins)
                coins = int(coins_number)
            except (TypeError, ValueError) as exc:
                raise ValueError(f"{name}: Coins per play must be a whole number.") from exc
            if coins_number != coins or coins <= 0:
                raise ValueError(f"{name}: Coins per play must be a whole number greater than 0.")
            seen.add(name.casefold())
            machine_types.append({"name": name, "coins_per_play": coins})
        updates["Machine_Types_JSON"] = (
            json.dumps(machine_types, ensure_ascii=False, separators=(",", ":")),
            "Configured machine types and coins required per play",
        )

    if not updates:
        raise ValueError("No settings were provided to save.")
    database.set_settings(updates)
    return serialise({"ok": True, "settings": application_settings(database)})


@api.get("/api/dashboard")
def dashboard() -> dict[str, Any]:
    database = db()
    return serialise(
        {
            "summary": database.dashboard_summary(),
            "recent_closings": database.list_closings(10),
        }
    )


@api.get("/api/machines")
def list_machines(active_only: bool = False) -> list[dict[str, Any]]:
    return serialise(
        [machine_view(item) for item in db().list_machines(active_only=active_only)]
    )


@api.get("/api/machine-images/{file_name}")
def machine_image(file_name: str) -> FileResponse:
    safe_name = Path(file_name).name
    if not safe_name or safe_name != file_name:
        raise HTTPException(status_code=404, detail="Machine image was not found.")
    path = MACHINE_IMAGE_DIR / safe_name
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="Machine image was not found.")
    return FileResponse(
        path,
        headers={"Cache-Control": "no-store"},
    )


@api.post("/api/machines")
def save_machine(payload: dict[str, Any]) -> dict[str, Any]:
    database = db()
    machine_id = str(payload.get("machine_id") or "").strip().upper()
    if not machine_id:
        raise ValueError("Machine ID is required.")

    existing = next(
        (
            item
            for item in database.list_machines(active_only=False)
            if str(item.get("Machine_ID") or "").upper() == machine_id
        ),
        {},
    )
    existing_image = str(existing.get("Image_File") or "")

    if bool(payload.get("remove_image")):
        remove_machine_image(existing_image)
        image_file = ""
    else:
        image_file = save_machine_image(
            machine_id,
            payload.get("image_data"),
            existing_image,
        )

    barcodes_source = (
        payload.get("barcodes")
        if "barcodes" in payload
        else existing.get("Barcodes_JSON")
    )
    barcodes = normalise_barcodes(barcodes_source)
    existing_type = canonical_machine_type_name(existing.get("Machine_Type"), machine_id)
    requested_type = canonical_machine_type_name(payload.get("machine_type") or existing_type, machine_id)
    if not requested_type:
        raise ValueError("Machine Type is required.")
    configured = application_settings(database).get("machine_types", [])
    configured_match = next(
        (str(item.get("name") or "").strip() for item in configured if str(item.get("name") or "").strip().casefold() == requested_type.casefold()),
        "",
    )
    if configured_match:
        machine_type = configured_match
    elif existing and requested_type.casefold() == existing_type.casefold():
        # Preserve a legacy type on an existing machine until staff adds it in Settings.
        machine_type = requested_type
    else:
        raise ValueError("Choose a Machine Type configured in Settings.")

    requested_name = str(payload.get("machine_name") or "").strip()
    machine_name = str(existing.get("Machine_Name") or "").strip() if existing else ""
    machine_name = machine_name or requested_name or machine_type

    record = {
        "Machine_ID": machine_id,
        "Machine_Name": machine_name,
        "Machine_Type": machine_type,
        "Capacity": to_int(payload.get("capacity")),
        "Prize_Category": str(payload.get("prize_category") or ""),
        "Active": bool(payload.get("active", True)),
        "Sort_Order": to_int(payload.get("sort_order"), 1),
        "Notes": str(payload.get("notes") or "").strip(),
        "Barcodes_JSON": json.dumps(barcodes, ensure_ascii=False),
        "Image_File": image_file,
    }
    database.upsert_machine(record, str(payload.get("user_name") or "Administrator"))
    return {"ok": True, "machine": serialise(machine_view(record))}


@api.get("/api/closings")
def list_closings(limit: int = Query(default=500, ge=1, le=5000)) -> list[dict[str, Any]]:
    return serialise(db().list_closings(limit))


@api.get("/api/closings/{closing_id}")
def get_closing(closing_id: str) -> dict[str, Any]:
    try:
        header, machines = db().get_closing(closing_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return serialise({"header": header, "machines": machines})


@api.get("/api/new-closing")
def new_closing(report_date: str) -> dict[str, Any]:
    requested_date = parse_iso_date(report_date)
    database = db()
    machines = database.list_machines(active_only=True)
    states = database.previous_machine_states(
        [str(item.get("Machine_ID") or "") for item in machines],
        requested_date,
    )
    rows: list[dict[str, Any]] = []
    for machine in machines:
        machine_id = str(machine.get("Machine_ID") or "")
        previous = states.get(machine_id, {})
        begin_prize = to_int(previous.get("Final_Prize"), to_int(machine.get("Capacity"), 0))
        begin_meter = to_int(previous.get("Final_Coin_Meter"), 0)
        rows.append(
            {
                "machine_id": machine_id,
                "machine_name": machine.get("Machine_Name"),
                "machine_type": canonical_machine_type_name(machine.get("Machine_Type"), machine_id),
                "barcodes": normalise_barcodes(machine.get("Barcodes_JSON")),
                "image_url": machine_image_url(machine.get("Image_File")),
                "capacity": to_int(machine.get("Capacity")),
                "begin_prize": begin_prize,
                "refill_prize": 0,
                "final_prize": begin_prize,
                "begin_coin_meter": begin_meter,
                "final_coin_meter": begin_meter,
                "status": "Working",
                "notes": "",
            }
        )
    return serialise(
        {
            "report_date": requested_date.isoformat(),
            "outlet": database.get_setting("Outlet", DEFAULT_OUTLET),
            "machines": rows,
        }
    )


@api.post("/api/calculate")
def calculate(payload: dict[str, Any]) -> dict[str, Any]:
    sales = make_sales(dict(payload.get("sales") or {}))
    machines = make_machines(list(payload.get("machines") or []))
    tolerance = to_int(db().get_setting("Variance_Tolerance", 0))
    result = calculate_closing(sales, machines, tolerance)
    return serialise(
        {
            "summary": result.as_record(),
            "machines": [item.as_record() for item in result.machines],
        }
    )


@api.post("/api/closings/save")
def save_closing(payload: dict[str, Any]) -> dict[str, Any]:
    database = db()
    report_date_value = parse_iso_date(payload.get("report_date"))
    workflow_status = str(payload.get("workflow_status") or "Draft").strip().title()
    if workflow_status not in {"Draft", "Finalized"}:
        raise ValueError("Workflow status must be Draft or Finalized.")
    closed_by = str(payload.get("closed_by") or "").strip()
    verified_by = str(payload.get("verified_by") or "").strip()
    if not closed_by:
        raise ValueError("Closed By is required.")
    if workflow_status == "Finalized" and not verified_by:
        raise ValueError("Verified By is required before finalizing.")

    sales = make_sales(dict(payload.get("sales") or {}))
    machines = make_machines(list(payload.get("machines") or []))
    tolerance = to_int(database.get_setting("Variance_Tolerance", 0))
    result = calculate_closing(sales, machines, tolerance)
    if workflow_status == "Finalized" and result.coin_variance != 0:
        raise ValueError(
            "The closing cannot be finalized until the coin variance is zero. "
            f"Current variance: {result.coin_variance:+,} coins."
        )

    closing_id = str(payload.get("closing_id") or "").strip()
    if not closing_id:
        closing_id = database.next_closing_id(report_date_value)

    header = {
        "Closing_ID": closing_id,
        "Report_Date": report_date_value.isoformat(),
        "Outlet": str(payload.get("outlet") or database.get_setting("Outlet", DEFAULT_OUTLET)).strip(),
        "Cash_Sales": float(sales.cash_sales),
        "Cash_Transactions": sales.cash_transactions,
        "ABA_Sales": float(sales.aba_sales),
        "ABA_Transactions": sales.aba_transactions,
        "Adjustment": float(sales.adjustment),
        "Beginning_Coins": sales.beginning_coins,
        "Coins_Added": sales.coins_added,
        "Final_Coins": sales.final_coins,
        "Coins_Dispensed": result.coins_dispensed,
        "Total_Sales": float(result.total_sales),
        "Total_Transactions": result.total_transactions,
        "Average_Sale_Value_Per_Coin": float(result.average_sale_value_per_coin),
        "Machine_Coins_Used": result.machine_coins_used,
        "Coin_Variance": result.coin_variance,
        "Total_Prizes_Won": result.total_prizes_won,
        "Average_Coins_Per_Prize": float(result.average_coins_per_prize),
        "Average_Revenue_Per_Prize": float(result.average_revenue_per_prize),
        "Closing_Status": result.closing_status,
        "Workflow_Status": workflow_status,
        "Closed_By": closed_by,
        "Verified_By": verified_by,
        "Notes": str(payload.get("notes") or "").strip(),
    }
    machine_records: list[dict[str, Any]] = []
    for item in result.machines:
        rule = machine_type_rule(database, item.machine_type, item.machine_id)
        play_rule_coins = int(rule[1]) if rule else 0
        win_rate = None
        if play_rule_coins > 0 and item.prizes_won > 0:
            win_rate = float(item.coins_used) / float(play_rule_coins) / float(item.prizes_won)
        machine_records.append(
            {
                "Machine_ID": item.machine_id,
                "Machine_Name": item.machine_name,
                "Machine_Type": canonical_machine_type_name(item.machine_type, item.machine_id),
                "Capacity": item.capacity,
                "Begin_Prize": item.begin_prize,
                "Refill_Prize": item.refill_prize,
                "Available_Prize": item.available_prize,
                "Final_Prize": item.final_prize,
                "Prizes_Won": item.prizes_won,
                "Refill_Needed": item.refill_needed,
                "Begin_Coin_Meter": item.begin_coin_meter,
                "Final_Coin_Meter": item.final_coin_meter,
                "Coins_Used": item.coins_used,
                "Coins_Per_Prize": float(item.coins_per_prize),
                "Play_Rule_Coins": play_rule_coins or None,
                "Win_Rate": win_rate,
                "Allocated_Sales": float(item.allocated_sales),
                "Average_Revenue_Per_Prize": float(item.avg_revenue_per_prize),
                "Machine_Status": item.status,
                "Notes": item.notes,
            }
        )
    database.save_closing(header, machine_records, closed_by)

    report_path: Path | None = None
    if workflow_status == "Finalized":
        saved_header, saved_machines = database.get_closing(closing_id)
        report_path = REPORTS_DIR / f"{closing_id}.xlsx"
        export_daily_closing(saved_header, saved_machines, report_path)

    return serialise(
        {
            "ok": True,
            "closing_id": closing_id,
            "workflow_status": workflow_status,
            "result": result.as_record(),
            "report_path": str(report_path) if report_path else None,
        }
    )


@api.post("/api/reports/daily/{closing_id}")
def export_daily(closing_id: str) -> dict[str, Any]:
    try:
        header, machines = db().get_closing(closing_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    destination = REPORTS_DIR / f"{closing_id}.xlsx"
    export_daily_closing(header, machines, destination)
    return {"ok": True, "path": str(destination)}


@api.get("/api/reports/summary")
def report_summary(month: str) -> dict[str, Any]:
    try:
        datetime.strptime(month, "%Y-%m")
    except ValueError as exc:
        raise ValueError("Month must use YYYY-MM format.") from exc
    closings = db().monthly_closings(month)
    return serialise(
        {
            "month": month,
            "closings": len(closings),
            "total_sales": sum(float(row.get("Total_Sales") or 0) for row in closings),
            "coins": sum(int(row.get("Machine_Coins_Used") or 0) for row in closings),
            "prizes": sum(int(row.get("Total_Prizes_Won") or 0) for row in closings),
        }
    )


@api.post("/api/reports/monthly")
def export_monthly(payload: dict[str, Any]) -> dict[str, Any]:
    month = str(payload.get("month") or "").strip()
    try:
        datetime.strptime(month, "%Y-%m")
    except ValueError as exc:
        raise ValueError("Month must use YYYY-MM format.") from exc
    database = db()
    closings = database.monthly_closings(month)
    if not closings:
        raise ValueError(f"No finalized closings were found for {month}.")
    machines = database.monthly_machine_rows(month)
    destination = REPORTS_DIR / f"Monthly_Claw_Report_{month}.xlsx"
    export_monthly_summary(month, closings, machines, destination)
    return {"ok": True, "path": str(destination)}


@api.post("/api/open-folder")
def open_folder_endpoint(payload: dict[str, Any]) -> dict[str, Any]:
    target = str(payload.get("target") or "reports").lower()
    paths = {
        "reports": REPORTS_DIR,
        "database": DATABASE_PATH.parent,
        "backups": BACKUP_DIR,
    }
    if target not in paths:
        raise ValueError("Unknown folder target.")
    open_folder(paths[target])
    return {"ok": True}


@api.get("/api/update/status")
def get_update_status() -> dict[str, Any]:
    return {"enabled": False, "available": False, "reason": "Software updates are disabled in the local-only migration app."}


@api.get("/api/update/config")
def get_update_config() -> dict[str, Any]:
    return {"enabled": False}


@api.post("/api/update/config")
def set_update_config(payload: dict[str, Any]) -> dict[str, Any]:
    raise ValueError("Software updates are disabled in the local-only migration app.")


@api.post("/api/update/download")
def download_update() -> dict[str, Any]:
    raise ValueError("Software updates are disabled in the local-only migration app.")


@api.post("/api/update/apply")
def apply_update() -> dict[str, Any]:
    raise ValueError("Software updates are disabled in the local-only migration app.")


@api.post("/api/shutdown")
def shutdown() -> dict[str, Any]:
    current_runtime = runtime
    if current_runtime and current_runtime.server is not None:
        threading.Timer(0.2, setattr, args=(current_runtime.server, "should_exit", True)).start()
    return {"ok": True}


@api.get("/brand-logo")
def brand_logo() -> FileResponse:
    if not BRAND_LOGO_PATH.exists() or not BRAND_LOGO_PATH.is_file():
        raise HTTPException(status_code=404, detail="Brand logo not found.")
    return FileResponse(BRAND_LOGO_PATH, media_type="image/png", headers={"Cache-Control": "no-cache"})


@api.get("/")
def index() -> FileResponse:
    return FileResponse(WEB_DIR / "index.html", headers={"Cache-Control": "no-store"})


@api.get("/claw-api.js")
def claw_api_script() -> FileResponse:
    return FileResponse(
        WEB_DIR / "claw-api.js",
        media_type="application/javascript",
        headers={"Cache-Control": "no-store"},
    )


api.mount("/assets", StaticFiles(directory=WEB_DIR / "assets"), name="assets")


def run_server_process(port: int, parent_desktop_pid: int = 0) -> int:
    global runtime, desktop_process_id
    desktop_process_id = parent_desktop_pid
    try:
        runtime = Runtime()
    except DatabaseLockedError as exc:
        print(f"Database In Use: {exc}", file=sys.stderr, flush=True)
        return 2
    except Exception as exc:
        print(f"Cannot initialize application runtime: {exc}", file=sys.stderr, flush=True)
        return 3

    atexit.register(runtime.close)
    configuration = uvicorn.Config(
        api,
        host=HOST,
        port=port,
        log_level="warning",
        access_log=False,
        lifespan="off",
    )
    server = uvicorn.Server(configuration)
    runtime.server = server
    try:
        server.run()
    except Exception as exc:
        print(f"Local server failed: {exc}", file=sys.stderr, flush=True)
        return 4
    finally:
        runtime.close()
    return 0


def start_server_process(port: int) -> tuple[subprocess.Popen, Any]:
    log_path = server_log_path()
    log_handle = log_path.open("w", encoding="utf-8")
    command = [sys.executable, str(Path(__file__).resolve()), "--server", "--port", str(port), "--desktop-pid", str(os.getpid())]
    creation_flags = 0
    if os.name == "nt":
        creation_flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    process = subprocess.Popen(
        command,
        cwd=str(ROOT_DIR),
        stdout=log_handle,
        stderr=subprocess.STDOUT,
        stdin=subprocess.DEVNULL,
        creationflags=creation_flags,
    )
    return process, log_handle


def wait_for_server(process: subprocess.Popen, port: int, timeout_seconds: float = 35.0) -> None:
    deadline = time.monotonic() + timeout_seconds
    url = health_url(port)
    last_error = ""
    while time.monotonic() < deadline:
        return_code = process.poll()
        if return_code is not None:
            details = read_log_tail(server_log_path())
            message = f"The local application server stopped during startup (exit code {return_code})."
            if details:
                message += f"\n\nDetails:\n{details}"
            raise RuntimeError(message)
        try:
            with urllib.request.urlopen(url, timeout=0.6) as response:
                if response.status == 200:
                    return
        except (OSError, urllib.error.URLError, TimeoutError) as exc:
            last_error = str(exc)
        time.sleep(0.12)
    details = read_log_tail(server_log_path())
    message = "The local application server did not start in time."
    if last_error:
        message += f"\n\nLast connection error: {last_error}"
    if details:
        message += f"\n\nServer log:\n{details}"
    raise RuntimeError(message)


def request_server_shutdown(port: int) -> None:
    request = urllib.request.Request(
        f"http://{HOST}:{port}/api/shutdown",
        data=b"{}",
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        urllib.request.urlopen(request, timeout=1.5).read()
    except Exception:
        pass


def stop_server_process(process: subprocess.Popen | None, port: int) -> None:
    if process is None:
        return
    if process.poll() is not None:
        return
    request_server_shutdown(port)
    try:
        process.wait(timeout=4)
        return
    except subprocess.TimeoutExpired:
        pass
    process.terminate()
    try:
        process.wait(timeout=3)
    except subprocess.TimeoutExpired:
        process.kill()


def desktop_main() -> int:
    port = find_free_port()
    process: subprocess.Popen | None = None
    log_handle = None
    try:
        process, log_handle = start_server_process(port)
        wait_for_server(process, port)
    except Exception as exc:
        stop_server_process(process, port)
        if log_handle is not None:
            log_handle.close()
        show_native_error("Cannot Start Application", str(exc))
        return 1

    url = f"http://{HOST}:{port}"
    try:
        import webview

        window = webview.create_window(
            f"{APP_NAME}  v{APP_VERSION}",
            url,
            width=1580,
            height=940,
            min_size=(1180, 720),
            maximized=True,
            background_color="#F7F8FA",
            text_select=True,
        )
        webview.start(debug=False, private_mode=False, storage_path=str(ROOT_DIR / ".webview"))
    except Exception as exc:
        webbrowser.open(url)
        show_native_error(
            "Desktop Window Unavailable",
            "The application opened in your browser because the embedded desktop window "
            f"could not start. Details: {exc}",
        )
        try:
            while process.poll() is None:
                time.sleep(0.5)
        except KeyboardInterrupt:
            pass
    finally:
        stop_server_process(process, port)
        if log_handle is not None:
            log_handle.close()
    return 0


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--server", action="store_true")
    parser.add_argument("--port", type=int, default=0)
    parser.add_argument("--desktop-pid", type=int, default=0)
    parser.add_argument("--apply-update", action="store_true")
    parser.add_argument("--root", default="")
    parser.add_argument("--package", default="")
    parser.add_argument("--server-pid", type=int, default=0)
    return parser.parse_args()


def main() -> int:
    arguments = parse_arguments()
    if arguments.apply_update:
        if not arguments.root or not arguments.package:
            return 2
        return apply_update_package(
            Path(arguments.root).resolve(),
            Path(arguments.package).resolve(),
            arguments.server_pid,
            arguments.desktop_pid,
        )
    if arguments.server:
        if arguments.port <= 0:
            print("A valid --port is required in server mode.", file=sys.stderr)
            return 2
        return run_server_process(arguments.port, arguments.desktop_pid)
    return desktop_main()



# Install the v2.1.7 product-level database and API extensions before runtime starts.
from product_support import install_v217

install_v217(globals())

if __name__ == "__main__":
    raise SystemExit(main())
