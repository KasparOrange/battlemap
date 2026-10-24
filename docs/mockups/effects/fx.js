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
