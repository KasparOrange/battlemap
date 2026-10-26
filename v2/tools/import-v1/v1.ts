/**
 * The shapes of what the old app (v1, the Flutter app at the repo root) sends and stores, as far
 * as the v1 import reads them. They are the JSON of `lib/model/session.dart` (`Session.toJson`),
 * `lib/model/map_library_entry.dart`, `lib/model/shared_map.dart`, `lib/model/raster_grid.dart`,
 * `lib/model/map_token.dart`, `lib/model/draw_stroke.dart`, `lib/model/dm_overlay.dart` and
 * `lib/model/template_disc.dart` — every field optional here, because games saved by older
 * builds miss the newer ones, and the importer must read them all.
 *
 * @see ../../../docs/sessions.md (v1's session format)
 * @see ../../../docs/relay-protocol.md (v1's `lib.listing`, map transfer, bot role)
 */

/** v1's picture grid (`RasterGrid.toJson`): picture pixels, short keys. */
export interface V1RasterGrid {
  /** Left edge of square (0, 0). */
  x: number;
  /** Top edge of square (0, 0). */
  y: number;
  /** Square width. */
  w: number;
  /** Square height. */
  h: number;
  /** Squares across. */
  cols: number;
  /** Squares down. */
  rows: number;
  /** Width of the picture the lengths refer to. */
  pw: number;
  /** Its height. */
  ph: number;
}

/** A map in the TV's library (`MapLibraryEntry.toJson`, as `lib.listing` lists it). */
export interface V1MapEntry {
  /** A uuid. */
  id: string;
  /** "Tower floor 2". */
  displayName: string;
  /** Size of the stored file. */
  fileSizeBytes?: number;
  /** Squares across (a `.dd2vtt`: the file's; a picture: its squares). */
  gridCols: number;
  /** Squares down. */
  gridRows: number;
  /** Doors in the file. */
  portalCount?: number;
  /** When it joined the library (ISO). */
  addedAt?: string;
  /** A PDF map (the TV renders page 1). */
  isPdf?: boolean;
  /** A picture map. */
  isImage?: boolean;
  /** A picture/PDF map's squares across (older entries). */
  pdfGridCols?: number | null;
  /** Its squares down. */
  pdfGridRows?: number | null;
  /** Where the file is on the old dev server (absolute URL; top-level uploads expire after 7 days). */
  vpsUrl?: string | null;
  /** The shared library entry it came from (12 hex), if any. */
  serverMapId?: string | null;
  /** Whether battlemap draws its grid (false = the picture has its own lines); null = yes. */
  drawGrid?: boolean | null;
  /** Where the squares lie on the picture (picture maps since 1.1.11). */
  rasterGrid?: V1RasterGrid | null;
  /** Whether the TV has a thumbnail for it. */
  thumbnailAvailable?: boolean;
}

/** A token (`MapToken.toJson`). */
export interface V1Token {
  /** Its id. */
  id: string;
  /** Short text ("3"). */
  label?: string;
  /** ARGB as 8 hex characters ("ffe53935"). */
  color?: string;
  /** Column. */
  gridX?: number;
  /** Row. */
  gridY?: number;
  /** On the map (missing before 1.1.12 = yes). */
  placed?: boolean;
  /** Hidden from the players. */
  hidden?: boolean;
  /** The DM's name. */
  name?: string;
  /** Digital mode (dropped by the import). */
  maxHp?: number;
  /** Digital mode (dropped). */
  currentHp?: number;
  /** Digital mode (dropped). */
  conditions?: string[];
}

/** A drawing (`DrawStroke.toJson`): points and width in world pixels. */
export interface V1Stroke {
  /** `[[x, y], …]` in world pixels (square k starts at k × pixels per square). */
  points?: number[][];
  /** ARGB as 8 hex characters. */
  color?: string;
  /** Width in world pixels. */
  width?: number;
}

/** A DM-only picture layer (`DmOverlay.toJson`). */
export interface V1Overlay {
  /** Its id. */
  id: string;
  /** The file's name. */
  name?: string;
  /** Where the picture is (absolute URL on the old dev server, `uploads/dm/` — kept). */
  url: string;
  /** Its eye. */
  visible?: boolean;
  /** 0–1. */
  opacity?: number;
}

/** One family of the template disc (`DiscShapeSet.toJson`). */
export interface V1DiscShapeSet {
  /** Drawn at all. */
  visible?: boolean;
  /** Sizes in feet. */
  sizes?: number[];
  /** ARGB as an int. */
  color?: number;
  /** `solid` or `dotted`. */
  line?: string;
  /** Labels on. */
  labels?: boolean;
}

/** The template disc (`TemplateDisc.toJson`). */
export interface V1Disc {
  /** On the map. */
  visible?: boolean;
  /** Middle, in squares. */
  x?: number;
  /** Middle, in squares. */
  y?: number;
  /** Degrees clockwise. */
  rotation?: number;
  /** Radius rings. */
  rings?: V1DiscShapeSet;
  /** Cubes. */
  cubes?: V1DiscShapeSet;
  /** Cones. */
  cones?: V1DiscShapeSet;
  /** `sharedBase` | `center`. */
  coneAnchor?: string;
  /** Cone opening angle. */
  coneDegrees?: number;
  /** The middle mark. */
  centerMark?: boolean;
  /** Compass marks. */
  markers?: number;
  /** The clear edge. */
  rim?: boolean;
  /** White tint 0–0.8. */
  tint?: number;
  /** Outline width in squares. */
  lineWidth?: number;
  /** Label height in squares. */
  labelSize?: number;
  /** `none` | `squareCenters` | `squareCorners`. */
  snap?: string;
}

/** How a map went on the table (`mapFit`, informational in v1). */
export interface V1MapFit {
  /** Map (world) pixels per square. */
  cellPx?: number;
  /** The TV's picture width it was computed for, in inches. */
  screenWidthInches?: number;
  /** Squares the TV set really showed. */
  tableCols?: number;
  /** Rows of them. */
  tableRows?: number;
  /** Whether battlemap drew grid lines. */
  drawGrid?: boolean;
}

/**
 * The per-map part of a session — the fields of `Session.perMapKeys`, at the session's top level
 * for the map on the table and in `parkedMaps[mapId]` for the others.
 */
export interface V1MapState {
  /** Revealed squares (`row × cols + col`). */
  revealedCells?: number[];
  /** Open door indices (file order). */
  openPortals?: number[];
  /** Grid lines on. */
  showGrid?: boolean;
  /** Fog on. */
  fogEnabled?: boolean;
  /** Wall debug view (dropped). */
  showWalls?: boolean;
  /** `table` | `fit` | `free`. */
  tvCameraMode?: string;
  /** First column of the table window (null = centred). */
  tableCol?: number | null;
  /** First row of the table window (null = centred). */
  tableRow?: number | null;
  /** How the map went on the table. */
  mapFit?: V1MapFit | null;
  /** Tokens. */
  tokenData?: V1Token[];
  /** Drawings. */
  strokeData?: V1Stroke[];
  /** A PDF map. */
  isPdfSession?: boolean;
  /** A picture map. */
  isImageSession?: boolean;
  /** The L-ruler is shown. */
  rulerVisible?: boolean;
  /** Ruler corner, squares. */
  rulerX?: number;
  /** Ruler corner, squares. */
  rulerY?: number;
  /** Degrees, 0/90/180/270. */
  rulerRotation?: number;
  /** The template disc. */
  templateDisc?: V1Disc | null;
  /** DM-only picture layers. */
  dmOverlayData?: V1Overlay[];
  /** World pixels. */
  cameraX?: number;
  /** World pixels. */
  cameraY?: number;
  /** Screen pixels per world pixel. */
  cameraZoom?: number;
  /** Radians (quarter turns). */
  cameraAngle?: number;
}

/** A game's settings (`SessionSettings.toJson`). */
export interface V1Settings {
  /** Fog of war on. */
  fogOfWar?: boolean;
  /** "Players see changes: Preview first". */
  shadowMode?: boolean;
  /** Draw tab shown. */
  drawingTools?: boolean;
  /** Tokens (digital mode). */
  tokens?: boolean;
  /** Measure tab shown. */
  measureTool?: boolean;
  /** Ruler feature. */
  ruler?: boolean;
  /** Door taps. */
  doorToggles?: boolean;
  /** Digital mode (dropped). */
  hpBars?: boolean;
  /** Digital mode (dropped). */
  conditions?: boolean;
  /** Digital mode (dropped). */
  aoeTemplates?: boolean;
  /** Digital mode (dropped). */
  initiativeTracker?: boolean;
  /** Not built in v1 (dropped). */
  ambientSound?: boolean;
  /** Not built in v1 (dropped). */
  weatherEffects?: boolean;
  /** Torch glow from the map file. */
  lightAnimations?: boolean;
  /** `standard` | `soft` | `cloud` | `atmospheric`. */
  fogMode?: string;
  /** Fade revealed squares in. */
  fogAnimation?: boolean;
  /** Trim revealed edges, % of a square. */
  fogEdgeInset?: number;
  /** Effects play. */
  globalEffects?: boolean;
}

/** A game (`Session.toJson`), as `lib.listing` lists it. */
export interface V1Session extends V1MapState {
  /** A uuid. */
  id: string;
  /** The map on the table. */
  mapId: string;
  /** "Session 3 · Sat 10 Oct". */
  name: string;
  /** ISO time. */
  createdAt: string;
  /** ISO time. */
  lastModifiedAt?: string;
  /** Tool settings (local in v2, dropped). */
  brushRadius?: number;
  /** Tool setting (dropped). */
  revealMode?: boolean;
  /** Tool setting (dropped). */
  drawColorValue?: number;
  /** Tool setting (dropped). */
  drawWidth?: number;
  /** Tool setting (dropped). */
  interactionMode?: string;
  /** Every map of the game in the order it joined (missing before 2026-10-10 = `[mapId]`). */
  mapIds?: string[];
  /** The per-map state of every map but the one on the table. */
  parkedMaps?: Record<string, V1MapState>;
  /** The game's settings. */
  settings?: V1Settings | null;
}

/** v1's `lib.listing`: the TV's maps and games. */
export interface V1Listing {
  /** The TV's map library. */
  maps: V1MapEntry[];
  /** Its games. */
  sessions: V1Session[];
}

/** An entry of the old dev server's shared library (`GET /library`). */
export interface V1SharedMap {
  /** 12 hex. */
  id: string;
  /** Display name. */
  name: string;
  /** `vtt` or `image`. */
  kind?: string;
  /** Squares across. */
  gridCols?: number | null;
  /** Squares down. */
  gridRows?: number | null;
  /** The picture has its own grid lines. */
  hasOwnGrid?: boolean;
  /** A `V1RasterGrid`, when the squares were fitted by hand. */
  grid?: V1RasterGrid | null;
  /** `/uploads/library/<file>` (relative to the dev server). */
  url: string;
}

/**
 * The per-map state of `mapId` in a session: the top-level fields for the map on the table, the
 * parked copy for the others, or null when the session never had that map's state.
 *
 * @param s - the session
 * @param mapId - one of its maps
 * @returns the state, or null
 */
export function mapStateOf(s: V1Session, mapId: string): V1MapState | null {
  if (mapId === s.mapId) return s;
  return s.parkedMaps?.[mapId] ?? null;
}

/**
 * Every map of a session, the one on the table included, in the order they joined (v1's
 * `Session` constructor rule).
 *
 * @param s - the session
 * @returns the map ids
 */
export function mapIdsOf(s: V1Session): string[] {
  const ids = s.mapIds && s.mapIds.length > 0 ? [...s.mapIds] : [s.mapId];
  if (!ids.includes(s.mapId)) ids.push(s.mapId);
  return [...new Set(ids)];
}
