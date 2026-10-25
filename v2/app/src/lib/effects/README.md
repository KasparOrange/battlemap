# effects

Empty for now. The effects runtime: a registry `effect id → factory`, instances anchored globally, to a region, a point or a token, drawn into the scene's slots (`fx.ground`, `fx.air`, `fx.screen`, a token's container), diffed against `MapPlay.effects` and `live.shots`, holding a render lease while they animate. See `docs/architecture.md` "effects runtime".
