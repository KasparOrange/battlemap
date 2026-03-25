#!/usr/bin/env python3
"""Dev HTTP server with file upload, no-cache headers, and log receiver.

Endpoints:
  GET  /*           — serve static files from build/web/
  POST /upload      — upload a .dd2vtt file, returns {"filename": "..."}
  GET  /uploads/*   — serve uploaded files
  POST /*           — receive browser console logs (legacy)
  OPTIONS /*        — CORS preflight
"""
import json
import os
import time
import uuid
from http.server import HTTPServer, SimpleHTTPRequestHandler

UPLOAD_DIR = "/home/kaspar/battlemap/build/web/uploads"
MAX_UPLOAD_SIZE = 200 * 1024 * 1024  # 200 MB
UPLOAD_MAX_AGE_DAYS = 7

os.makedirs(UPLOAD_DIR, exist_ok=True)


def cleanup_old_uploads():
    """Delete uploads older than UPLOAD_MAX_AGE_DAYS."""
    cutoff = time.time() - (UPLOAD_MAX_AGE_DAYS * 86400)
    removed = 0
    try:
        for name in os.listdir(UPLOAD_DIR):
            filepath = os.path.join(UPLOAD_DIR, name)
            if os.path.isfile(filepath) and os.path.getmtime(filepath) < cutoff:
                os.remove(filepath)
                removed += 1
    except Exception as e:
        print(f"Upload cleanup error: {e}")
    if removed:
        print(f"Cleaned up {removed} old upload(s) (>{UPLOAD_MAX_AGE_DAYS} days)")


class DevHandler(SimpleHTTPRequestHandler):
    def do_PUT(self):
        """Upload a map file. PUT /upload/<filename>"""
        if not self.path.startswith("/upload/"):
            self.send_error(404)
            return

        original_name = self.path[len("/upload/"):]
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            self.send_error(400, "Empty body")
            return

        if length > MAX_UPLOAD_SIZE:
            print(f"Upload rejected: {original_name} ({length} bytes exceeds {MAX_UPLOAD_SIZE} limit)")
            self.send_error(413, f"File too large (max {MAX_UPLOAD_SIZE // (1024*1024)} MB)")
            # Drain the body to avoid connection issues
            try:
                self.rfile.read(length)
            except Exception:
                pass
            return

        # Generate unique filename to avoid collisions
        ext = os.path.splitext(original_name)[1] or ".dd2vtt"
        filename = f"{uuid.uuid4().hex[:12]}{ext}"
        filepath = os.path.join(UPLOAD_DIR, filename)

        try:
            # Read and save
            data = self.rfile.read(length)
            with open(filepath, "wb") as f:
                f.write(data)

            print(f"Upload: {original_name} -> {filename} ({len(data)} bytes)")

            # Respond with the download URL
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({
                "filename": filename,
                "url": f"/uploads/{filename}",
                "size": len(data),
            }).encode())
        except Exception as e:
            print(f"Upload error: {original_name}: {e}")
            # Clean up partial file
            try:
                if os.path.exists(filepath):
                    os.remove(filepath)
            except Exception:
                pass
            self.send_error(500, "Upload failed")

    def do_POST(self):
        """Receive browser console logs (legacy endpoint)."""
        length = int(self.headers.get("Content-Length", 0))
        if length > MAX_UPLOAD_SIZE:
            self.send_error(413, "Payload too large")
            return
        self.rfile.read(length)  # drain body
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
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
    cleanup_old_uploads()
    server = HTTPServer(("0.0.0.0", 4242), DevHandler)
    print(f"Dev server on :4242 (uploads dir: {UPLOAD_DIR}, max upload: {MAX_UPLOAD_SIZE // (1024*1024)} MB)")
    server.serve_forever()
