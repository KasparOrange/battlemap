# render

The table renderer (PixiJS v8, WebGL2): `pixi.ts` bootstraps one non-ticking application per screen, `scheduler.ts` renders on demand. The scene (map tiles, fog shader, tokens, view profiles, layer order) comes next — `docs/architecture.md` "rendering".
