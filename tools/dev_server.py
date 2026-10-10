#!/usr/bin/env python3
"""Dev HTTP server with file upload, no-cache headers, and log receiver.

Endpoints:
  GET  /*           — serve static files from build/web/
  POST /upload      — upload a .dd2vtt file, returns {"filename": "..."}
  PUT  /upload/dm/<name> — DM-only layer picture, kept in uploads/dm/ (no cleanup)
  GET  /library     — the shared map library: {"maps": [entry, ...]}, newest first
  PUT  /library/<name>?meta=<json> — add a map to the shared library, returns its entry
  PUT  /library/<id>/thumb — the map's thumbnail (PNG), made by the companion
  DELETE /library/<id> — remove a map from the shared library
  GET  /uploads/*   — serve uploaded files
  POST /*           — receive browser console logs (legacy)
  OPTIONS /*        — CORS preflight

BATTLEMAP_WEB_DIR overrides the served directory (default: the VPS checkout)
for a local bench — see docs/setup.md.
"""
from __future__ import annotations

import json
import os
import threading
import time
import urllib.parse
import uuid
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

WEB_DIR = os.environ.get("BATTLEMAP_WEB_DIR", "/home/kaspar/battlemap/build/web")
UPLOAD_DIR = os.path.join(WEB_DIR, "uploads")
# DM-only layer pictures (companion "Layers" tab). They belong to saved
# sessions, so cleanup_old_uploads() (top-level files only) never touches them.
DM_UPLOAD_DIR = os.path.join(UPLOAD_DIR, "dm")
# The shared map library (companion "Shared library"): maps kept for every
# game and every TV, outside the 7-day cleanup like dm/. index.json lists them.
LIBRARY_DIR = os.path.join(UPLOAD_DIR, "library")
LIBRARY_INDEX = os.path.join(LIBRARY_DIR, "index.json")
MAX_UPLOAD_SIZE = 200 * 1024 * 1024  # 200 MB
MAX_THUMB_SIZE = 2 * 1024 * 1024
UPLOAD_MAX_AGE_DAYS = 7
# Map metadata the companion may set (everything else is the server's)
LIBRARY_META_KEYS = {"name", "kind", "gridCols", "gridRows", "hasOwnGrid", "grid"}

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(DM_UPLOAD_DIR, exist_ok=True)
os.makedirs(LIBRARY_DIR, exist_ok=True)

# One request at a time edits index.json (the server is threaded)
library_lock = threading.Lock()


def library_load() -> list[dict]:
    """The shared library's entries (empty when there is no index yet)."""
    try:
        with open(LIBRARY_INDEX) as f:
            return json.load(f)["maps"]
    except FileNotFoundError:
        return []


def library_save(maps: list[dict]) -> None:
    """Writes index.json atomically (temp file + rename)."""
    tmp = LIBRARY_INDEX + ".tmp"
    with open(tmp, "w") as f:
        json.dump({"maps": maps}, f, indent=1)
    os.replace(tmp, LIBRARY_INDEX)


def library_add(original_name: str, data: bytes, meta: dict) -> dict:
    """Stores a map file in the shared library and returns its entry.

    meta (from the companion) carries the display name, kind ("vtt" or
    "image"), the squares (gridCols/gridRows), hasOwnGrid and the raster grid;
    unknown keys are dropped.
    """
    map_id = uuid.uuid4().hex[:12]
    ext = os.path.splitext(original_name)[1].lower() or ".dd2vtt"
    filename = f"{map_id}{ext}"
    with open(os.path.join(LIBRARY_DIR, filename), "wb") as f:
        f.write(data)
    entry = {k: v for k, v in meta.items() if k in LIBRARY_META_KEYS}
    entry.setdefault("name", os.path.splitext(original_name)[0])
    entry.setdefault("kind", "vtt" if ext in (".dd2vtt", ".uvtt") else "image")
    entry.update({
        "id": map_id,
        "file": filename,
        "url": f"/uploads/library/{filename}",
        "size": len(data),
        "addedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "thumbUrl": None,
    })
    with library_lock:
        maps = library_load()
        maps.insert(0, entry)
        library_save(maps)
    return entry


def library_set_thumb(map_id: str, png: bytes) -> dict | None:
    """Stores the thumbnail of map_id; returns the updated entry or None."""
    with library_lock:
        maps = library_load()
        entry = next((m for m in maps if m["id"] == map_id), None)
        if entry is None:
            return None
        name = f"{map_id}.thumb.png"
        with open(os.path.join(LIBRARY_DIR, name), "wb") as f:
            f.write(png)
        entry["thumbUrl"] = f"/uploads/library/{name}"
        library_save(maps)
        return entry


def library_delete(map_id: str) -> bool:
    """Removes map_id (file, thumbnail, index entry); False if unknown.

    TVs keep their own copies, so games already using the map go on.
    """
    with library_lock:
        maps = library_load()
        entry = next((m for m in maps if m["id"] == map_id), None)
        if entry is None:
            return False
        for name in (entry["file"], f"{map_id}.thumb.png"):
            try:
                os.remove(os.path.join(LIBRARY_DIR, name))
            except FileNotFoundError:
                pass
        library_save([m for m in maps if m["id"] != map_id])
        return True


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
    def send_json(self, obj, status: int = 200) -> None:
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_body(self, limit: int) -> bytes | None:
        """The request body, or None after answering 400/413."""
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            self.send_error(400, "Empty body")
            return None
        if length > limit:
            self.send_error(413, f"Too large (max {limit // (1024 * 1024)} MB)")
            try:
                self.rfile.read(length)  # drain, keeps the connection sane
            except Exception:
                pass
            return None
        return self.rfile.read(length)

    def do_GET(self):
        if urllib.parse.urlsplit(self.path).path.rstrip("/") == "/library":
            with library_lock:
                self.send_json({"maps": library_load()})
            return
        super().do_GET()

    def do_DELETE(self):
        parts = urllib.parse.urlsplit(self.path).path.strip("/").split("/")
        if len(parts) != 2 or parts[0] != "library":
            self.send_error(404)
            return
        if not library_delete(parts[1]):
            self.send_error(404, "No such map")
            return
        print(f"Library: deleted {parts[1]}")
        self.send_json({"deleted": parts[1]})

    def put_library(self) -> None:
        """PUT /library/<name>?meta=<json> or PUT /library/<id>/thumb."""
        url = urllib.parse.urlsplit(self.path)
        parts = url.path.strip("/").split("/")
        if len(parts) == 3 and parts[2] == "thumb":
            png = self.read_body(MAX_THUMB_SIZE)
            if png is None:
                return
            entry = library_set_thumb(parts[1], png)
            if entry is None:
                self.send_error(404, "No such map")
                return
            self.send_json(entry)
            return
        if len(parts) != 2:
            self.send_error(404)
            return
        name = urllib.parse.unquote(parts[1])
        try:
            meta = json.loads(urllib.parse.parse_qs(url.query).get("meta", ["{}"])[0])
            if not isinstance(meta, dict):
                raise ValueError("meta is not an object")
        except ValueError as e:
            self.send_error(400, f"Bad meta: {e}")
            return
        data = self.read_body(MAX_UPLOAD_SIZE)
        if data is None:
            return
        try:
            entry = library_add(name, data, meta)
        except Exception as e:
            print(f"Library upload error: {name}: {e}")
            self.send_error(500, "Upload failed")
            return
        print(f"Library: {name} -> {entry['file']} ({len(data)} bytes)")
        self.send_json(entry)

    def do_PUT(self):
        """Upload a map file. PUT /upload/<filename>, or the shared library."""
        if self.path.startswith("/library/"):
            self.put_library()
            return
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
        if original_name.startswith("dm/"):
            filename = f"dm/{filename}"  # DM layer: kept, see DM_UPLOAD_DIR
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
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
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
    os.chdir(WEB_DIR)
    cleanup_old_uploads()
    # One thread per connection: a single stalled client (a browser keep-alive, a dropped
    # download) hung the single-threaded server for everyone on 2026-10-10.
    server = ThreadingHTTPServer(("0.0.0.0", 4242), DevHandler)
    print(f"Dev server on :4242 (uploads dir: {UPLOAD_DIR}, max upload: {MAX_UPLOAD_SIZE // (1024*1024)} MB)")
    server.serve_forever()
