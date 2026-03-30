# feature ideas

ideas for future development, roughly sorted by gameplay impact.

## high impact, moderate effort

### pdf map support
load PDFs as an alternative to .dd2vtt files. many DMs only have PDF battlemaps. the app already has a PDF renderer (`pdfrx`). needs configurable grid overlay since PDFs have no embedded grid metadata. DM sets grid columns/rows at upload time.

**status:** in progress

### measure tool
tap two points on the map, see the distance in feet (5ft per grid square). essential for D&D combat — "can my character reach that goblin?" renders as a line between two grid positions with a distance label. could also show movement range as a highlighted area.

### area-of-effect templates
drop circle, cone, or line overlays on the map for spell effects. "fireball is a 20ft radius sphere." DM places the template origin, selects shape and size, players see the affected area on the TV. huge visual impact at the table.

shapes needed:
- circle (radius in feet) — fireball, moonbeam, spirit guardians
- cone (length + angle) — burning hands, cone of cold
- line (length + width) — lightning bolt, wall of fire
- square (side length) — cloud of kill, darkness

### room reveal (flood-fill fog)
tap inside a room to reveal all fog cells at once, bounded by walls. replaces tedious cell-by-cell painting. uses flood-fill algorithm starting from the tap point, stopping at wall boundaries from the .dd2vtt line-of-sight data.

## high impact, low effort

### token names and HP
tap a token to edit its name (e.g., "Goblin 3") and HP (e.g., 15/15). show a small HP bar under each token on the map. essential for combat tracking.

### condition markers
small colored icons on tokens: poisoned (green), stunned (yellow), concentrating (blue), prone (red), etc. toggle from a token context menu. visible on both TV and phone.

### initiative tracker
turn order widget on the companion phone. add combatants, roll initiative, track whose turn it is. highlight the active token on the map. can be a simple sorted list with tap-to-advance.

## medium impact, medium effort

### session thumbnails
capture a screenshot of the game canvas as a PNG thumbnail for the library browser. generated lazily when viewing the session list. makes the library look polished instead of plain text cards.

### multiple maps per session
switch between dungeon floors or areas without losing token/fog state per floor. each floor has its own map, fog, and token state. DM navigates between floors from the phone.

### undo stack
undo for all actions — not just drawing strokes, but also fog reveals, token moves, door toggles. a proper undo/redo stack with keyboard shortcut support. essential for "oops I revealed the wrong room."

### grid configuration after load
re-configure the grid (columns, rows, offset, rotation) after a map is loaded. useful when the grid doesn't align perfectly with the map image. drag handles to adjust grid position and size.

### token sizes
support for large (2x2), huge (3x3), and gargantuan (4x4) creature tokens. D&D monsters come in different sizes. currently all tokens are 1x1 grid squares.

## fun but lower priority

### ambient sound
play background music or sound effects from the TV speakers, controlled from the phone. atmosphere presets: dungeon, forest, tavern, combat. could use a simple audio player with a few bundled tracks or URL-based streaming.

### animated tokens
sprite sheet support for creature tokens. idle animations, attack animations, death animations. would make the table much more immersive but requires art assets.

### visual effects
GPU-powered effects on the Flame canvas:
- glow on light sources (from .dd2vtt light data)
- dynamic fog edges (soft gradient instead of hard cell boundaries)
- bloom on bright elements
- particle effects for spells

### line-of-sight from token
show what a specific token can "see" based on wall data. useful for stealth encounters. toggle per-token visibility from the companion.

### weather effects
rain, snow, fog particles overlaid on the map. purely visual atmosphere. controlled from a DM panel dropdown.

### custom token images
upload small images (PNG) to use as token art instead of colored circles. show creature portraits on the map. stored in the library alongside maps.

### map annotations
sticky notes on the map — DM-only or visible to all. useful for "trap here" or "door is locked (DC 15)". text labels anchored to grid positions.

### combat log
scrolling text log of actions: "Goblin 3 took 8 damage (12 → 4 HP)", "Fog revealed in room 2". shown on the companion phone. useful for tracking what happened.
