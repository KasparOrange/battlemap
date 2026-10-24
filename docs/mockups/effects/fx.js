// shared: an fps meter in the corner (frames presented by requestAnimationFrame, 1 s window)
export function fpsMeter(el) {
  let n = 0, t0 = performance.now();
  (function tick(t) { n++; if (t - t0 >= 1000) { el.textContent = `${Math.round(n * 1000 / (t - t0))} fps`; n = 0; t0 = t; } requestAnimationFrame(tick); })(t0);
}
export function toggles(bar, names, state, onChange) {
  for (const k of names) {
    const b = document.createElement("button"); b.textContent = k; b.className = state[k] ? "on" : "";
    b.onclick = () => { state[k] = !state[k]; b.className = state[k] ? "on" : ""; onChange?.(); };
    bar.append(b);
  }
}
// Cost score, Nutri-Score style: A cheap … E expensive, against the Xiaomi TV box at 1080p.
const GRADE = { A: "#038141", B: "#85bb2f", C: "#e5b400", D: "#ee8100", E: "#e63e11" };
export function score(s, note) {
  const el = document.createElement("div"); el.className = "score";
  for (const [label, g] of [["Graphics", s.gpu], ["Memory", s.mem], ["Processor", s.cpu]]) {
    const name = document.createElement("span"); name.textContent = label;
    const row = document.createElement("span"); row.className = "row";
    for (const k of "ABCDE") { const b = document.createElement("span"); b.className = "l" + (k === g ? " on" : ""); b.style.background = GRADE[k]; b.textContent = k; row.append(b); }
    el.append(name, row);
  }
  if (note) { const n = document.createElement("span"); n.className = "note"; n.textContent = note; el.append(n); }
  document.body.append(el);
}
