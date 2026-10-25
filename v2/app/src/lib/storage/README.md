# storage

Empty for now. IndexedDB (database `battlemap`): `games` (full game state), `settings` (the TV's calibration, remembered looks), `files` (picture and geometry blobs by content hash, a cache of the server's). Small preferences stay in localStorage (`config.ts`). See `docs/architecture.md` "persistence".
