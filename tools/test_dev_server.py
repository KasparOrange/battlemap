#!/usr/bin/env python3
"""Tests for the dev server's shared map library (/library).

Starts dev_server's handler on a free port over a temporary web dir — no VPS,
no network. Usage: python3 tools/test_dev_server.py
"""
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


if __name__ == "__main__":
    unittest.main()
