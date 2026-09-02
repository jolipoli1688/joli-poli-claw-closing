"""Serve the accepted UI in CLOUD staging mode without changing LOCAL mode.

The canonical cloud command injects only browser-safe configuration. No values
are written to disk and this launcher never starts or imports the local backend.
"""
from __future__ import annotations

import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
REF = "fbvzqdqjqcbjopuinknw"
RUNTIME_MODE = "cloud-staging"
CLOUD_SCRIPTS = (
    '<script src="./cloud-runtime.js?v=2.1.78-cloud-runtime-2"></script>'
    '<script src="./cloud-api-adapter.js?v=2.1.78-cloud-routing-3"></script>'
    '<script src="./claw-api.js?v=2.1.78-cloud-runtime-2"></script>'
    '<script src="./cloud-profile.js?v=2.1.78-cloud-runtime-2"></script>'
    '<script src="./cloud-user-management.js?v=2.1.78-cloud-runtime-2"></script>'
)


def cloud_configuration_error() -> bytes:
    return b"<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>JOLI POLI Claw Closing</title></head><body><main><h1>Opening Claw Closing</h1><p>Cloud configuration is unavailable.</p></main></body></html>"


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB), **kwargs)

    def do_GET(self):
        if self.path.split("?", 1)[0] not in {"/", "/index.html"}:
            return super().do_GET()
        url = os.environ.get("CLAW_SUPABASE_URL", "").rstrip("/")
        key = os.environ.get("CLAW_SUPABASE_PUBLISHABLE_KEY", "")
        if os.environ.get("CLAW_RUNTIME_MODE") != RUNTIME_MODE or not url or not key or url != f"https://{REF}.supabase.co":
            body = cloud_configuration_error()
            self.send_response(503)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        config = {"mode": RUNTIME_MODE, "projectRef": REF, "supabaseUrl": url, "publishableKey": key, "apiBaseUrl": f"{url}/functions/v1/claw-api"}
        html = (WEB / "index.html").read_text(encoding="utf-8")
        cloud_bootstrap = (
            f'window.__CLAW_RUNTIME_MODE__={json.dumps(RUNTIME_MODE)};'
            f'</script><script>window.__CLAW_CLOUD_CONFIG__={json.dumps(config, separators=(",", ":"))};'
        )
        html = html.replace('window.__CLAW_RUNTIME_MODE__="local";', cloud_bootstrap)
        if 'window.__CLAW_RUNTIME_MODE__="cloud-staging";' not in html:
            raise RuntimeError("Cloud runtime mode was not injected.")
        html = html.replace('<script src="./claw-api.js?v=2.1.78-local-uat-1"></script>', CLOUD_SCRIPTS)
        if "cloud-api-adapter.js" not in html:
            raise RuntimeError("Cloud runtime scripts were not injected.")
        body = html.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        # Staging is a developer launcher. Never retain stale runtime/profile
        # assets after a local update; LOCAL mode is served separately.
        if self.path.split("?", 1)[0].endswith((".js", ".css")):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    ThreadingHTTPServer(("localhost", 3001), Handler).serve_forever()
