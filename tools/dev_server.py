#!/usr/bin/env python3
"""Dev HTTP server with no-cache headers and built-in browser log receiver."""
import json
import os
from datetime import datetime
from http.server import HTTPServer, SimpleHTTPRequestHandler

LOG_FILE = "/tmp/browser.log"

class DevHandler(SimpleHTTPRequestHandler):
    def do_POST(self):
        """Receive browser console logs at /log"""
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode()
        try:
            entries = json.loads(body)
            with open(LOG_FILE, "a") as f:
                for entry in entries:
                    ts = datetime.now().strftime("%H:%M:%S")
                    level = entry.get("level", "log").upper()
                    msg = entry.get("msg", "")
                    f.write(f"[{ts}] {level}: {msg}\n")
                    f.flush()
        except Exception as e:
            with open(LOG_FILE, "a") as f:
                f.write(f"[parse error] {e}: {body[:200]}\n")
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, format, *args):
        pass

if __name__ == "__main__":
    os.chdir("/home/kaspar/battlemap/build/web")
    server = HTTPServer(("0.0.0.0", 4242), DevHandler)
    print(f"Dev server on :4242 (no-cache + log receiver), writing logs to {LOG_FILE}")
    server.serve_forever()
