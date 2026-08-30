"""Serve the accepted UI in CLOUD staging mode without changing LOCAL mode.

Set CLAW_SUPABASE_URL and CLAW_SUPABASE_PUBLISHABLE_KEY in the invoking shell.
Only browser-safe configuration is injected into the response; no values are
written to disk and this launcher never starts the local Excel backend.
"""
from __future__ import annotations

import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
REF = "fbvzqdqjqcbjopuinknw"


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB), **kwargs)

    def do_GET(self):
        if self.path.split("?", 1)[0] not in {"/", "/index.html"}:
            return super().do_GET()
        url = os.environ.get("CLAW_SUPABASE_URL", "").rstrip("/")
        key = os.environ.get("CLAW_SUPABASE_PUBLISHABLE_KEY", "")
        if not url or not key or url != f"https://{REF}.supabase.co":
            self.send_error(500, "Set CLAW_SUPABASE_URL and CLAW_SUPABASE_PUBLISHABLE_KEY for the approved staging project.")
            return
        config = {"mode": "cloud", "projectRef": REF, "supabaseUrl": url, "publishableKey": key, "apiBaseUrl": f"{url}/functions/v1/claw-api"}
        html = (WEB / "index.html").read_text(encoding="utf-8")
        html = html.replace("</head>", f"<script>window.__CLAW_CLOUD_CONFIG__={json.dumps(config, separators=(',', ':'))};</script></head>")
        body = html.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 4175), Handler).serve_forever()
