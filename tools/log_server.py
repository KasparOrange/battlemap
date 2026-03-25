#!/usr/bin/env python3
"""Unified log server — receives structured logs from both TV (APK) and phone (web).

Both apps POST JSON arrays to this endpoint:
  [{"src": "tv"|"companion", "msg": "...", ...}]

Logs are written to /tmp/battlemap.log as JSONL (one JSON object per line).
Each line includes a server-side timestamp.

Endpoints:
  POST /*        — receive log entries
  GET  /health   — health check with log line count
  OPTIONS /*     — CORS preflight
"""
import json
import os
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler

LOG_FILE = "/tmp/battlemap.log"
MAX_LOG_SIZE = 50 * 1024 * 1024  # 50 MB
MAX_ROTATED = 3


def rotate_log():
    """Rotate log file if it exceeds MAX_LOG_SIZE. Keep up to MAX_ROTATED old files."""
    try:
        if not os.path.exists(LOG_FILE) or os.path.getsize(LOG_FILE) <= MAX_LOG_SIZE:
            return
        # Shift existing rotated files: .log.2 -> .log.3, .log.1 -> .log.2
        for i in range(MAX_ROTATED, 1, -1):
            src = f"{LOG_FILE}.{i - 1}"
            dst = f"{LOG_FILE}.{i}"
            if os.path.exists(src):
                if os.path.exists(dst):
                    os.remove(dst)
                os.rename(src, dst)
        # Current -> .log.1
        os.rename(LOG_FILE, f"{LOG_FILE}.1")
        print(f"[{datetime.now().strftime('%H:%M:%S')}] Log rotated (exceeded {MAX_LOG_SIZE // (1024*1024)} MB)")
    except Exception as e:
        print(f"Log rotation error: {e}")


def count_log_lines():
    """Count lines in the current log file."""
    try:
        if not os.path.exists(LOG_FILE):
            return 0
        with open(LOG_FILE, "r") as f:
            return sum(1 for _ in f)
    except Exception:
        return -1


class LogHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        """Health check endpoint."""
        if self.path == "/health":
            lines = count_log_lines()
            body = json.dumps({"status": "ok", "lines": lines}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_error(404)

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))

        # Handle empty bodies gracefully (common from browser empty POSTs)
        if length == 0:
            self.send_response(200)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            return

        body = self.rfile.read(length).decode()

        # Handle empty string body
        stripped = body.strip()
        if not stripped:
            self.send_response(200)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            return

        try:
            parsed = json.loads(stripped)

            # Normalize to list of entries
            if isinstance(parsed, dict):
                entries = [parsed]
            elif isinstance(parsed, list):
                entries = parsed
            else:
                # Non-list, non-dict payload (e.g. string, number, null)
                ts = datetime.now().strftime("%H:%M:%S")
                print(f"[{ts}] [     log] ignored non-object payload: {type(parsed).__name__}")
                self.send_response(200)
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                return

            rotate_log()

            with open(LOG_FILE, "a") as f:
                for entry in entries:
                    if not isinstance(entry, dict):
                        continue
                    ts = datetime.now().strftime("%H:%M:%S")
                    # Normalize: accept both 'source' and 'src'
                    src = entry.pop("source", None) or entry.get("src", "?")
                    entry["ts"] = ts
                    entry["src"] = src
                    line = json.dumps(entry, separators=(",", ":"))
                    f.write(line + "\n")
                    f.flush()
                    # Human-readable stdout for live monitoring
                    msg = entry.get("msg", "")
                    event = entry.get("event", "")
                    extra = f" [{event}]" if event else ""
                    print(f"[{ts}] [{src:>9s}]{extra} {msg}")
        except json.JSONDecodeError as e:
            ts = datetime.now().strftime("%H:%M:%S")
            print(f"[{ts}] [    error] JSON parse: {e}")
            err = {"ts": ts, "src": "error", "msg": f"parse: {e}: {body[:200]}"}
            try:
                with open(LOG_FILE, "a") as f:
                    f.write(json.dumps(err, separators=(",", ":")) + "\n")
            except Exception:
                pass
        except Exception as e:
            ts = datetime.now().strftime("%H:%M:%S")
            print(f"[{ts}] [    error] {e}")

        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def log_message(self, format, *args):
        pass

if __name__ == "__main__":
    server = HTTPServer(("0.0.0.0", 4243), LogHandler)
    print(f"Log server on :4243, writing JSONL to {LOG_FILE}")
    server.serve_forever()
