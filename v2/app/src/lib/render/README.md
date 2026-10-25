# render

The table renderer (PixiJS v8, WebGL2). The seam is `index.ts`: `createTableView(host, { profile: 'players' | 'dm', log, files, effects })` → update, cameras, hit tests, `dropTextures`. `scene.ts` builds the layers in order (map, fx.ground, grid, drawings, tokens, fog, doors, fx.air, DM layers, tools, players' frame; screen space: table mask + calibration, fx.screen); pure maths (cameras, decode/tile planning, fog texels, hit tests) has tests in `render-logic.test.ts`; the bench scenes are in `bench-scenes.ts`. How it is built and what it costs: `docs/render.md`.
