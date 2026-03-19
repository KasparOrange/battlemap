#!/usr/bin/env python3
"""Tiny HTTP server that receives browser console logs via POST and writes them to a file."""
import json
from http.server import HTTPServer, BaseHTTPRequestHandler
from datetime import datetime

LOG_FILE = "/tmp/browser.log"

class LogHandler(BaseHTTPRequestHandler):
    def do_POST(self):
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

    def log_message(self, format, *args):
        pass  # suppress request logs

if __name__ == "__main__":
    server = HTTPServer(("0.0.0.0", 4243), LogHandler)
    print(f"Log server listening on :4243, writing to {LOG_FILE}")
    server.serve_forever()
