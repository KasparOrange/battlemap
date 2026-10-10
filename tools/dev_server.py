#!/usr/bin/env python3
"""Dev HTTP server with file upload, no-cache headers, and log receiver.

Endpoints:
  GET  /*           — serve static files from build/web/
  POST /upload      — upload a .dd2vtt file, returns {"filename": "..."}
  PUT  /upload/dm/<name> — DM-only layer picture, kept in uploads/dm/ (no cleanup)
  GET  /library     — the shared map library: {"maps": [entry, ...]}, newest first
  PUT  /library/<name>?meta=<json>[&format=webp|jpeg|png] — add a map to the shared
                    library (converted first when format is given), returns its entry
  GET  /fetch?url=<link> — download what a link points to (picture, PDF, .dd2vtt, or
                    the picture on a web page) into uploads/, returns {url, name, size, kind}
  PUT  /library/<id>/thumb — the map's thumbnail (PNG), made by the companion
  DELETE /library/<id> — remove a map from the shared library
  GET  /uploads/*   — serve uploaded files
  POST /*           — receive browser console logs (legacy)
  OPTIONS /*        — CORS preflight

BATTLEMAP_WEB_DIR overrides the served directory (default: the VPS checkout)
for a local bench — see docs/setup.md.
"""
from __future__ import annotations

import base64
import io
import ipaddress
import json
import os
import re
import socket
import threading
import time
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timezone
from html import unescape
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

try:  # conversion needs Pillow (VPS: apt install python3-pil); without it maps stay as they are
    from PIL import Image
    Image.MAX_IMAGE_PIXELS = None  # big battle maps are fine, the size limit is MAX_UPLOAD_SIZE
except ImportError:
    Image = None

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
# Formats a library upload can be stored as (?format=); see convert_picture()
STORE_FORMATS = {"webp", "jpeg", "png"}
WEBP_MAX_SIDE = 16383  # WebP's limit; bigger pictures are stored as JPEG instead
WEBP_LOSSLESS_MAX_PIXELS = 50_000_000  # above this only lossy WebP is tried (encode time)
FETCH_TIMEOUT = 30

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


def library_add(original_name: str, data: bytes, meta: dict, fmt: str | None = None) -> dict:
    """Stores a map file in the shared library and returns its entry.

    meta (from the companion) carries the display name, kind ("vtt" or
    "image"), the squares (gridCols/gridRows), hasOwnGrid and the raster grid;
    unknown keys are dropped. fmt ("webp", "jpeg", "png") converts the picture
    first (convert_map); the entry then has originalSize and a convertNote.
    A failed conversion stores the file as it came.
    """
    original_size, note = len(data), None
    if fmt in STORE_FORMATS:
        try:
            original_name, data, note = convert_map(original_name, data, fmt)
        except (ValueError, KeyError) as e:
            note = f"not converted: {e}"

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
    if fmt in STORE_FORMATS:
        entry.update({"originalSize": original_size, "convertNote": note})
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


def _encode(im, fmt: str, **kw) -> bytes:
    buf = io.BytesIO()
    im.save(buf, fmt, **kw)
    return buf.getvalue()


def convert_picture(data: bytes, fmt: str) -> tuple[bytes, str, str | None]:
    """Re-encodes a picture as fmt ("webp", "jpeg" or "png").

    Returns (bytes, extension, note). The pixels keep their size, so a picture
    grid (pixel positions) stays valid. WebP = lossy quality 90 (looks the same,
    measured 41-42 dB on painted maps) or lossless when that is no more than 1.5x
    the lossy size (line art: a third of the PNG); a picture over 16383 px a side
    becomes JPEG; when the WebP is bigger than the original, the original stays.
    JPEG = quality 90, transparency flattened onto black (the TV's background).
    Raises ValueError when the bytes are no picture or Pillow is missing.
    """
    if Image is None:
        raise ValueError("Pillow missing")
    try:
        im = Image.open(io.BytesIO(data))
        im.load()
    except Exception as e:
        raise ValueError(f"not a picture: {e}") from e
    alpha = im.mode in ("RGBA", "LA", "PA") or (im.mode == "P" and "transparency" in im.info)
    rgb = im.convert("RGBA" if alpha else "RGB")
    note = None
    if fmt == "webp" and max(rgb.size) > WEBP_MAX_SIDE:
        fmt, note = "jpeg", f"over {WEBP_MAX_SIDE} px, stored as JPEG"
    if fmt == "png":
        return _encode(rgb, "PNG", optimize=True), ".png", note
    if fmt == "jpeg":
        if alpha:
            flat = Image.new("RGB", rgb.size, (0, 0, 0))
            flat.paste(rgb, mask=rgb.getchannel("A"))
            rgb = flat
        return _encode(rgb, "JPEG", quality=90, optimize=True), ".jpg", note
    best = _encode(rgb, "WEBP", quality=90, method=4)
    if rgb.width * rgb.height <= WEBP_LOSSLESS_MAX_PIXELS:
        lossless = _encode(rgb, "WEBP", lossless=True, quality=80, method=4)
        if len(lossless) <= len(best) * 1.5:
            best, note = lossless, "lossless"
    if len(best) >= len(data) and sniff_kind(data)[1] in (".webp", ".jpg", ".png"):
        return data, sniff_kind(data)[1], "already smaller as it was"
    return best, ".webp", note


def convert_map(name: str, data: bytes, fmt: str) -> tuple[str, bytes, str | None]:
    """convert_picture() for a library upload: a picture is re-encoded, a
    .dd2vtt/.uvtt gets its embedded picture re-encoded (same pixels, so its
    grid, walls and doors still fit). Returns (new name, bytes, note)."""
    stem, ext = os.path.splitext(name)
    if ext.lower() in (".dd2vtt", ".uvtt"):
        doc = json.loads(data)
        picture, new_ext, note = convert_picture(base64.b64decode(doc["image"]), fmt)
        doc["image"] = base64.b64encode(picture).decode()
        return name, json.dumps(doc).encode(), note
    picture, new_ext, note = convert_picture(data, fmt)
    return stem + new_ext, picture, note


def sniff_kind(data: bytes) -> tuple[str | None, str | None]:
    """(kind, extension) from the file's first bytes: image/pdf/vtt, or (None, None)."""
    head = data[:16]
    if head.startswith(b"\x89PNG"):
        return "image", ".png"
    if head.startswith(b"\xff\xd8"):
        return "image", ".jpg"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image", ".webp"
    if head.startswith(b"%PDF"):
        return "pdf", ".pdf"
    start = data[:4096]
    if start.lstrip()[:1] == b"{" and (b'"image"' in start or b'"resolution"' in start):
        return "vtt", ".dd2vtt"
    return None, None


def _check_public(url: str) -> None:
    """Refuses links that are not http(s) or point into a private network
    (the server must not become a door to the VPS's own services)."""
    parts = urllib.parse.urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise ValueError("only http and https links")
    try:
        infos = socket.getaddrinfo(parts.hostname, parts.port or 443, proto=socket.IPPROTO_TCP)
    except socket.gaierror as e:
        raise ValueError(f"unknown host {parts.hostname}") from e
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if not ip.is_global:
            raise ValueError("that address is not on the internet")


class _CheckedRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        _check_public(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


_opener = urllib.request.build_opener(_CheckedRedirects)


def resolve_link(url: str) -> str:
    """Turns a share link into a direct download: Google Drive (file/d/<id>,
    open?id=) and Dropbox (dl=0)."""
    url = url.strip()
    m = re.search(r"drive\.google\.com/(?:file/d/|open\?id=|uc\?(?:.*&)?id=)([\w-]{10,})", url)
    if m:
        return f"https://drive.google.com/uc?export=download&id={m.group(1)}"
    if "dropbox.com" in url:
        parts = urllib.parse.urlsplit(url)
        q = dict(urllib.parse.parse_qsl(parts.query))
        q["dl"] = "1"
        return urllib.parse.urlunsplit(parts._replace(query=urllib.parse.urlencode(q)))
    return url


def _download(url: str) -> tuple[bytes, str, str]:
    """GET url (public addresses only, MAX_UPLOAD_SIZE) -> (bytes, content type, file name)."""
    _check_public(url)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 battlemap"})
    with _opener.open(req, timeout=FETCH_TIMEOUT) as resp:
        data = resp.read(MAX_UPLOAD_SIZE + 1)
        if len(data) > MAX_UPLOAD_SIZE:
            raise ValueError(f"over {MAX_UPLOAD_SIZE // (1024 * 1024)} MB")
        ctype = resp.headers.get_content_type()
        disp = resp.headers.get("Content-Disposition", "")
        m = re.search(r"filename\*=UTF-8''([^;]+)", disp) or re.search(r'filename="?([^";]+)', disp)
        name = urllib.parse.unquote(m.group(1)) if m else \
            urllib.parse.unquote(os.path.basename(urllib.parse.urlsplit(resp.geturl()).path))
        return data, ctype, name


def _picture_in_page(html: str, base: str) -> str | None:
    """The page's main picture: og:image / twitter:image, a Google Drive
    "can't scan for viruses" confirm form, else the first <img>."""
    form = re.search(r'<form[^>]+action="([^"]*download[^"]*)"(.*?)</form>', html, re.S)
    if form:
        fields = dict(re.findall(r'name="([^"]+)"\s+value="([^"]*)"', form.group(2)))
        return unescape(form.group(1)) + "?" + urllib.parse.urlencode(fields)
    for pattern in (r'<meta[^>]+(?:property|name)="(?:og:image|twitter:image)(?::src)?"[^>]+content="([^"]+)"',
                    r'<meta[^>]+content="([^"]+)"[^>]+(?:property|name)="(?:og:image|twitter:image)"',
                    r'<link[^>]+rel="image_src"[^>]+href="([^"]+)"',
                    r'<img[^>]+src="([^"]+)"'):
        m = re.search(pattern, html, re.I)
        if m:
            return urllib.parse.urljoin(base, unescape(m.group(1)))
    return None


def fetch_link(url: str) -> dict:
    """Downloads what url points to into uploads/ (7-day cleanup) and returns
    {url, name, size, kind}: a picture, a PDF or a .dd2vtt as is, a web page's
    main picture, any other picture Pillow reads (GIF, AVIF, TIFF, …) as PNG.
    Raises ValueError with a reason the companion shows."""
    link = resolve_link(url)
    data, ctype, name = _download(link)
    kind, ext = sniff_kind(data)
    if kind is None and ctype in ("text/html", "application/xhtml+xml"):
        picture = _picture_in_page(data[:2_000_000].decode("utf-8", "replace"), link)
        if picture is None:
            raise ValueError("no picture found on that page")
        data, ctype, name = _download(picture)
        kind, ext = sniff_kind(data)
    if kind is None and Image is not None:
        try:
            data, ext, _ = convert_picture(data, "png")
            kind = "image"
        except ValueError:
            pass
    if kind is None:
        raise ValueError(f"not a map file ({ctype})")
    stem = os.path.splitext(name)[0].strip() or "map"
    if os.path.splitext(name)[1].lower() == ".uvtt" and kind == "vtt":
        ext = ".uvtt"
    filename = f"{uuid.uuid4().hex[:12]}{ext}"
    with open(os.path.join(UPLOAD_DIR, filename), "wb") as f:
        f.write(data)
    return {"url": f"/uploads/{filename}", "name": stem + ext, "size": len(data), "kind": kind}


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
        url = urllib.parse.urlsplit(self.path)
        if url.path.rstrip("/") == "/library":
            with library_lock:
                self.send_json({"maps": library_load()})
            return
        if url.path.rstrip("/") == "/fetch":
            # Failures answer 200 with {"error"} so the companion can show why
            link = urllib.parse.parse_qs(url.query).get("url", [""])[0]
            try:
                self.send_json(fetch_link(link))
                print(f"Fetch: {link}")
            except Exception as e:
                print(f"Fetch failed: {link}: {e}")
                self.send_json({"error": str(e) if isinstance(e, ValueError) else
                                f"couldn't download: {e}"})
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
        query = urllib.parse.parse_qs(url.query)
        fmt = query.get("format", [None])[0]
        try:
            meta = json.loads(query.get("meta", ["{}"])[0])
            if not isinstance(meta, dict):
                raise ValueError("meta is not an object")
        except ValueError as e:
            self.send_error(400, f"Bad meta: {e}")
            return
        data = self.read_body(MAX_UPLOAD_SIZE)
        if data is None:
            return
        try:
            entry = library_add(name, data, meta, fmt)
        except Exception as e:
            print(f"Library upload error: {name}: {e}")
            self.send_error(500, "Upload failed")
            return
        print(f"Library: {name} -> {entry['file']} ({len(data)} -> {entry['size']} bytes)")
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
