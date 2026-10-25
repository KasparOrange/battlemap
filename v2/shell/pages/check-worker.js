// Worker for the shell page's "worker" check: proves a worker script loads from the
// asset-loader origin and can fetch from it too. Posts {ok, detail} back.
fetch('index.html')
  .then((r) => r.text())
  .then((text) => postMessage({ ok: text.includes('battlemap shell'), detail: `worker fetched ${text.length} bytes` }))
  .catch((err) => postMessage({ ok: false, detail: String(err) }));
