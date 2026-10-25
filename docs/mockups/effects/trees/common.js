// Shared by the tree demos: the painted crowns (trees.json, made by prepare.py), one wind for the
// whole map, and the stage — a map backdrop, where the trees stand, their shadows and labels.
// Click a tree to see it alone, click again for all of them.
import { fpsMeter, toggles } from "../fx.js";

export const load = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });

export async function loadTrees(names, withSheets = false) {
  const all = await fetch(new URL("trees.json", import.meta.url)).then((r) => r.json());
  const trees = all.filter((t) => names.includes(t.name)).sort((a, b) => names.indexOf(a.name) - names.indexOf(b.name));
  await Promise.all(trees.map(async (t) => {
    t.img = await load(new URL(t.still, import.meta.url));
    if (withSheets) t.sheetImg = await load(new URL(t.sheet.file, import.meta.url));
    if (t.parts) t.labels = await load(new URL(t.parts.file, import.meta.url));
  }));
  return trees;
}

// ---- the wind: a breeze, gusts that roll across the map along the wind's direction
export const wind = { gusts: true, strong: false, angle: 0.33 };
export const windDir = () => [Math.cos(wind.angle), Math.sin(wind.angle)];
export const hash = (n) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
const noise1 = (x) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hash(i) * (1 - u) + hash(i + 1) * u; };
/** Wind strength at a point of the stage (fractions 0..1): a gust reaches downwind trees later. */
export function windAt(t, fx, fy) {
  const [dx, dy] = windDir(), along = fx * dx + fy * dy * 0.56;
  const base = wind.strong ? 1.0 : 0.45;
  return base * (wind.gusts ? 0.5 + 1.0 * noise1((t - along * 2.5) * 0.4) : 0.8);
}

// ---- where the trees stand (fractions of the stage; size = crown height ÷ stage height)
const SPOTS = {
  1: { at: [[0.5, 0.45]], size: 0.74 },
  3: { at: [[0.19, 0.43], [0.5, 0.47], [0.81, 0.43]], size: 0.46 },
  5: { at: [[0.17, 0.27], [0.5, 0.25], [0.83, 0.28], [0.33, 0.63], [0.67, 0.62]], size: 0.32 },
};

/**
 * The page: bar of toggles, fps, caption, backdrop, a shadow canvas and the moving canvas.
 * `draw(t, placed)` runs every frame; `placed` = [{tree, fx, fy, x, y, w, h, s}] in device px.
 */
export function stage({ trees, gl = false, toggles: names = {}, wind: hasWind = true, caption, label, draw }) {
  document.body.insertAdjacentHTML("beforeend", `<div class="tstage"><canvas class="shadow"></canvas><canvas class="anim"></canvas></div><div class="bar" id="bar"></div><div class="fps" id="fps"></div><div class="cap">${caption}</div>`);
  const css = document.createElement("style");
  css.textContent = `.bar,.fps,.cap,.score{z-index:1}
  .tstage{position:absolute;inset:0;z-index:0;background:#2c3524 url(media/keep.jpg) 30% 60% / cover}
  .tstage canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
  .bar .arrow{display:inline-grid;place-items:center;width:24px;height:22px;background:#000a;border-radius:6px;color:#fff;font-size:15px}`;
  document.head.append(css);
  fpsMeter(document.getElementById("fps"));
  const bar = document.getElementById("bar"), state = { ...names };
  if (hasWind) {
    Object.assign(state, { Gusts: wind.gusts, "Strong wind": wind.strong });
    toggles(bar, ["Gusts", "Strong wind", ...Object.keys(names)], state, () => { wind.gusts = state.Gusts; wind.strong = state["Strong wind"]; });
    const turn = document.createElement("button"); turn.textContent = "Turn wind";
    const arrow = document.createElement("span"); arrow.className = "arrow"; arrow.textContent = "→";
    const show = () => { arrow.style.transform = `rotate(${wind.angle}rad)`; };
    turn.onclick = () => { wind.angle += Math.PI / 2; show(); }; show();
    bar.append(turn, arrow);
  } else toggles(bar, Object.keys(names), state);

  const root = document.querySelector(".tstage"), shadow = root.querySelector(".shadow"), anim = root.querySelector(".anim");
  const ctx = gl ? anim.getContext("webgl", { premultipliedAlpha: true, alpha: true }) : anim.getContext("2d");
  let W = 0, H = 0, solo = -1, placed = [];
  function layout() {
    const list = solo >= 0 ? [trees[solo]] : trees, spots = SPOTS[list.length] ?? SPOTS[5];
    placed = list.map((tree, i) => {
      const [fx, fy] = spots.at[i], h = H * spots.size, s = h / tree.h, w = tree.w * s;
      return { tree, fx, fy, x: fx * W - w / 2, y: fy * H - h / 2, w, h, s };
    });
    const g = shadow.getContext("2d"), dpr = devicePixelRatio || 1;
    g.clearRect(0, 0, W, H);
    for (const p of placed) {
      g.save(); g.filter = `blur(${Math.round(p.h * 0.025)}px) brightness(0)`; g.globalAlpha = 0.5;
      g.drawImage(p.tree.img, p.x + p.w * 0.07, p.y + p.h * 0.08, p.w, p.h); g.restore();
      const text = label(p.tree);
      g.font = `${Math.round(11 * dpr)}px ui-monospace, monospace`; g.textAlign = "center";
      const tw = g.measureText(text).width + 12 * dpr, ty = p.y + p.h + 4 * dpr;
      g.fillStyle = "#000b"; g.fillRect(p.x + p.w / 2 - tw / 2, ty, tw, 17 * dpr);
      g.fillStyle = "#cfc"; g.fillText(text, p.x + p.w / 2, ty + 12.5 * dpr);
    }
  }
  function fit() {
    const dpr = devicePixelRatio || 1, w = Math.round(root.clientWidth * dpr), h = Math.round(root.clientHeight * dpr);
    if (w === W && h === H) return;
    W = shadow.width = anim.width = w; H = shadow.height = anim.height = h; layout();
  }
  anim.addEventListener("click", (e) => {
    if (solo >= 0) solo = -1;
    else {
      const dpr = devicePixelRatio || 1, x = e.offsetX * dpr, y = e.offsetY * dpr;
      let best = 0, bd = Infinity;
      placed.forEach((p, i) => { const d = Math.hypot(x - (p.x + p.w / 2), y - (p.y + p.h / 2)); if (d < bd) { bd = d; best = i; } });
      solo = best;
    }
    layout();
  });
  const t0 = performance.now();
  (function frame(now) { fit(); draw((now - t0) / 1000, placed, ctx, { W, H, state }); requestAnimationFrame(frame); })(t0);
  return state;
}

export const mb = (bytes) => `${(bytes / 1048576).toFixed(bytes < 1048576 ? 2 : 1)} MB`;
