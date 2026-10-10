#!/usr/bin/env python3
"""Tests for the dev server's shared map library (/library).

Starts dev_server's handler on a free port over a temporary web dir — no VPS,
no network. Usage: python3 tools/test_dev_server.py
"""
import base64
import io
import json
import os
import shutil
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.parse
import urllib.request

WEB = tempfile.mkdtemp(prefix="bm-devserver-")
os.environ["BATTLEMAP_WEB_DIR"] = WEB
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dev_server  # noqa: E402  (reads BATTLEMAP_WEB_DIR at import)
from http.server import ThreadingHTTPServer  # noqa: E402


class SharedLibraryTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.chdir(WEB)
        cls.srv = ThreadingHTTPServer(("127.0.0.1", 0), dev_server.DevHandler)
        cls.base = f"http://127.0.0.1:{cls.srv.server_address[1]}"
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        cls.srv.server_close()
        shutil.rmtree(WEB, ignore_errors=True)

    def req(self, method, path, data=None):
        r = urllib.request.Request(self.base + path, data=data, method=method)
        try:
            with urllib.request.urlopen(r) as resp:
                return resp.status, resp.read()
        except urllib.error.HTTPError as e:
            return e.code, b""

    def upload(self, name, data, meta):
        q = urllib.parse.quote(json.dumps(meta))
        status, body = self.req("PUT", f"/library/{urllib.parse.quote(name)}?meta={q}", data)
        self.assertEqual(status, 200)
        return json.loads(body)

    def test_upload_list_thumb_delete(self):
        e = self.upload("Tower floor 2.png", b"PNG",
                        {"name": "Tower floor 2", "kind": "image", "gridCols": 20,
                         "gridRows": 15, "hasOwnGrid": True, "evil": 1})
        self.assertEqual(e["name"], "Tower floor 2")
        self.assertEqual(e["gridCols"], 20)
        self.assertNotIn("evil", e)
        self.assertEqual(self.req("GET", e["url"])[1], b"PNG")
        maps = json.loads(self.req("GET", "/library")[1])["maps"]
        self.assertEqual(maps[0]["id"], e["id"])

        self.assertEqual(self.req("PUT", f"/library/{e['id']}/thumb", b"T")[0], 200)
        maps = json.loads(self.req("GET", "/library")[1])["maps"]
        self.assertEqual(self.req("GET", maps[0]["thumbUrl"])[1], b"T")

        self.assertEqual(self.req("DELETE", f"/library/{e['id']}")[0], 200)
        self.assertEqual(self.req("DELETE", f"/library/{e['id']}")[0], 404)
        ids = [m["id"] for m in json.loads(self.req("GET", "/library")[1])["maps"]]
        self.assertNotIn(e["id"], ids)
        self.assertFalse(os.path.exists(os.path.join(dev_server.LIBRARY_DIR, e["file"])))

    def test_vtt_defaults_newest_first(self):
        a = self.upload("Cave.dd2vtt", b"{}", {})
        b = self.upload("Inn.dd2vtt", b"{}", {})
        self.assertEqual((a["name"], a["kind"]), ("Cave", "vtt"))
        ids = [m["id"] for m in json.loads(self.req("GET", "/library")[1])["maps"]]
        self.assertLess(ids.index(b["id"]), ids.index(a["id"]))

    def test_bad_requests(self):
        self.assertEqual(self.req("PUT", "/library/x.png?meta=%5B1%5D", b"x")[0], 400)
        self.assertEqual(self.req("PUT", "/library/x.png", b"")[0], 400)
        self.assertEqual(self.req("PUT", "/library/nope/thumb", b"x")[0], 404)
        self.assertEqual(self.req("DELETE", "/uploads/whatever")[0], 404)

    def test_library_survives_upload_cleanup(self):
        e = self.upload("Old.dd2vtt", b"{}", {})
        path = os.path.join(dev_server.LIBRARY_DIR, e["file"])
        os.utime(path, (0, 0))  # ancient
        dev_server.cleanup_old_uploads()
        self.assertTrue(os.path.exists(path))


def _png(w, h, painted=False, alpha=False):
    """A test picture: line art (black lines on white) or noise ("painted")."""
    from PIL import Image, ImageDraw
    if painted:
        im = Image.frombytes("RGB", (w, h), os.urandom(w * h * 3))
    else:
        im = Image.new("RGB", (w, h), "white")
        d = ImageDraw.Draw(im)
        for x in range(0, w, 50):
            d.line([(x, 0), (x, h)], fill="black", width=2)
    if alpha:
        im = im.convert("RGBA")
        im.putpixel((0, 0), (0, 0, 0, 0))
    buf = io.BytesIO()
    im.save(buf, "PNG")
    return buf.getvalue()


@unittest.skipIf(dev_server.Image is None, "Pillow missing")
class ConvertTest(unittest.TestCase):
    def test_line_art_becomes_lossless_webp(self):
        data, ext, note = dev_server.convert_picture(_png(600, 400), "webp")
        self.assertEqual((ext, note), (".webp", "lossless"))
        self.assertEqual(dev_server.sniff_kind(data), ("image", ".webp"))

    def test_painted_becomes_lossy_webp_same_pixels(self):
        from PIL import Image
        src = _png(300, 200, painted=True)
        data, ext, note = dev_server.convert_picture(src, "webp")
        self.assertEqual(ext, ".webp")
        self.assertIsNone(note)
        self.assertEqual(Image.open(io.BytesIO(data)).size, (300, 200))

    def test_too_wide_for_webp_becomes_jpeg(self):
        data, ext, note = dev_server.convert_picture(_png(16384, 4), "webp")
        self.assertEqual(ext, ".jpg")
        self.assertIn("JPEG", note)

    def test_jpeg_flattens_transparency(self):
        data, ext, _ = dev_server.convert_picture(_png(50, 50, alpha=True), "jpeg")
        self.assertEqual(dev_server.sniff_kind(data), ("image", ".jpg"))

    def test_smaller_original_stays(self):
        tiny = _png(8, 8)
        data, ext, note = dev_server.convert_picture(tiny, "webp")
        if note == "already smaller as it was":
            self.assertEqual((data, ext), (tiny, ".png"))

    def test_not_a_picture(self):
        with self.assertRaises(ValueError):
            dev_server.convert_picture(b"nope", "webp")

    def test_vtt_embedded_picture(self):
        doc = {"resolution": {"map_size": {"x": 12, "y": 8}}, "portals": [1],
               "image": base64.b64encode(_png(600, 400)).decode()}
        name, data, note = dev_server.convert_map("Keep.dd2vtt", json.dumps(doc).encode(), "webp")
        out = json.loads(data)
        self.assertEqual(name, "Keep.dd2vtt")
        self.assertEqual(out["portals"], [1])
        self.assertEqual(dev_server.sniff_kind(base64.b64decode(out["image"]))[1], ".webp")

    def test_library_upload_with_format(self):
        t = SharedLibraryTest
        t.setUpClass()
        try:
            q = urllib.parse.quote(json.dumps({"kind": "image"}))
            r = urllib.request.Request(f"{t.base}/library/Inn.png?meta={q}&format=webp",
                                       data=_png(600, 400), method="PUT")
            with urllib.request.urlopen(r) as resp:
                e = json.loads(resp.read())
            self.assertTrue(e["file"].endswith(".webp"))
            self.assertEqual(e["name"], "Inn")
            self.assertLess(e["size"], e["originalSize"])
        finally:
            t.srv.shutdown()
            t.srv.server_close()


class FetchTest(unittest.TestCase):
    def test_share_links(self):
        self.assertEqual(
            dev_server.resolve_link("https://drive.google.com/file/d/1AbCdEfGhIjKlMn/view?usp=sharing"),
            "https://drive.google.com/uc?export=download&id=1AbCdEfGhIjKlMn")
        self.assertIn("dl=1", dev_server.resolve_link("https://www.dropbox.com/s/x/map.png?dl=0"))
        self.assertEqual(dev_server.resolve_link(" https://x.org/a.png "), "https://x.org/a.png")

    def test_private_addresses_refused(self):
        for url in ("http://127.0.0.1:9428/", "http://localhost/", "file:///etc/passwd",
                    "http://10.0.0.1/", "ftp://x.org/"):
            with self.assertRaises(ValueError, msg=url):
                dev_server._check_public(url)

    def test_picture_in_page(self):
        page = '<head><meta property="og:image" content="/maps/inn.jpg?a=1&amp;b=2"></head>'
        self.assertEqual(dev_server._picture_in_page(page, "https://x.org/post/1"),
                         "https://x.org/maps/inn.jpg?a=1&b=2")
        self.assertEqual(dev_server._picture_in_page('<img src="a.png">', "https://x.org/p/"),
                         "https://x.org/p/a.png")
        self.assertIsNone(dev_server._picture_in_page("<p>hi</p>", "https://x.org/"))

    def test_fetch_page_then_picture(self):
        png = b"\x89PNG\r\n\x1a\n" + b"0" * 32
        answers = {"https://x.org/post": (b'<meta property="og:image" content="https://x.org/i.png">',
                                          "text/html", "post"),
                   "https://x.org/i.png": (png, "image/png", "Tavern 30x40.png")}
        real = dev_server._download
        dev_server._download = lambda url: answers[url]
        try:
            r = dev_server.fetch_link("https://x.org/post")
        finally:
            dev_server._download = real
        self.assertEqual((r["name"], r["kind"], r["size"]), ("Tavern 30x40.png", "image", len(png)))
        with open(os.path.join(dev_server.UPLOAD_DIR, os.path.basename(r["url"])), "rb") as f:
            self.assertEqual(f.read(), png)

    def test_fetch_refuses_other_files(self):
        real = dev_server._download
        dev_server._download = lambda url: (b"hello", "text/plain", "x.txt")
        try:
            with self.assertRaises(ValueError):
                dev_server.fetch_link("https://x.org/x.txt")
        finally:
            dev_server._download = real

    def test_fetch_endpoint_reports_errors(self):
        t = SharedLibraryTest
        t.setUpClass()
        try:
            q = urllib.parse.quote("http://127.0.0.1/secret")
            with urllib.request.urlopen(f"{t.base}/fetch?url={q}") as resp:
                self.assertIn("error", json.loads(resp.read()))
        finally:
            t.srv.shutdown()
            t.srv.server_close()


if __name__ == "__main__":
    unittest.main()
