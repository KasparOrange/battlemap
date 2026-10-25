/**
 * The tab registry of the companion's game screen — how a tool tab plugs in.
 *
 * Tabs are modes (design.md "the tool tabs"): being on a tab is what a finger on the map does.
 * A tab is one folder under `companion/tabs/<id>/` with a `tab.ts` whose default export is a
 * {@link TabDef}; the game screen finds every such file by itself (`import.meta.glob`), so a new
 * tab needs no edit anywhere else:
 *
 * ```ts
 * // companion/tabs/measure/tab.ts
 * import type { TabDef } from '../../game/tabs.ts';
 * import MeasurePanel from './MeasurePanel.svelte';
 * import { measureTool } from './tool.ts';
 * export default { id: 'measure', label: 'Measure', title: 'Measure', icon: 'measure',
 *   group: 'modes', order: 40, panel: MeasurePanel, tool: measureTool } satisfies TabDef;
 * ```
 *
 * A tab without a `tool` (View, Layers, Settings) gives the map the Tokens tab's behaviour.
 * The template disc and the ruler are draggable in every tab and doors toggle on a tap — the
 * input layer does that before it asks the tab's tool (architecture.md "input").
 */
import type { Component } from 'svelte';
import type { Camera, Command, FileRef, Game, MapGeometry, MapPlay, Point, RootState } from '@battlemap/shared';
import type { AppConfig } from '../../config.ts';
import type { CompanionSession } from '../../state/sessions.svelte.ts';
import type { Hit } from '../../render/hit.ts';
import type { IconName } from '../../ui/icons.ts';

/** The two groups of the rail, set apart by a hairline: modes first, panels below. */
export type TabGroup = 'modes' | 'panels';

/** Order numbers of the built-in tabs, so others can slot in between. */
export const TAB_ORDER = { tokens: 10, fog: 20, draw: 30, measure: 40, layers: 50, view: 60, settings: 70 } as const;

/** One tool tab. */
export interface TabDef {
  /** Unique id (`fog`), also the folder name. */
  id: string;
  /** One word under the icon in the rail / tab bar. */
  label: string;
  /** The panel's heading ("Fog of war"). */
  title: string;
  /** The rail icon (filled when chosen). */
  icon: IconName;
  /** Modes (a finger on the map does something new) or panels (look and set up). */
  group: TabGroup;
  /** Position in the rail, ascending ({@link TAB_ORDER}). */
  order: number;
  /** The panel body (scrolls). */
  panel: Component<TabPanelProps>;
  /** A pinned commit row at the panel's foot (primary last), shown while {@link hasFooter} says so. */
  footer?: Component<TabPanelProps>;
  /** Whether the footer shows now (default: whenever `footer` is set). */
  hasFooter?: (ctx: GameContext) => boolean;
  /** What a finger on the map does while this tab is chosen; absent = the Tokens behaviour. */
  tool?: (ctx: GameContext) => MapTool;
  /**
   * A DM-only layer drawn over the map while this tab is chosen (an aim, a preview). It fills the
   * map view (same size and origin as its host, so `render/camera.ts`'s `squaresToScreen` with
   * `ctx.camera.get()` places things) and lets pointer events through to the map.
   */
  overlay?: Component<TabPanelProps>;
  /** Whether a tap on a door toggles it in this tab (default true; Draw says false). */
  doors?: boolean;
  /** Called when the DM leaves this tab (cancel an armed placement, end a live circle). */
  onLeave?: (ctx: GameContext) => void;
}

/** Props every tab panel and footer component gets. */
export interface TabPanelProps {
  /** The game screen's context. */
  ctx: GameContext;
}

/**
 * What a finger on the map does in a tab. All points are in map squares (fractional, (0, 0) the
 * map's top-left corner). The input layer calls at most one of `tap` / `begin` per gesture, and
 * only for a one-finger gesture: a second finger before 8 px of travel makes it a camera
 * gesture, a second finger later ends the drag (`end`, one undo step) and the camera takes over.
 */
export interface MapTool {
  /**
   * Whether the tool wants this touch before doors are checked (the Tokens tool claims a touch
   * on a token). Called on the first finger down.
   */
  claims?: (at: Point) => boolean;
  /** A tap: the finger came up within 8 px of where it went down. */
  tap?: (at: Point) => void;
  /**
   * A drag starts: the finger moved 8 px. `from` is where it went down.
   *
   * @returns the drag, or null when the tool has no drag here (the touch then pans the view)
   */
  begin?: (from: Point, now: Point) => ToolDrag | null;
}

/** A tool drag in progress. */
export interface ToolDrag {
  /** The finger moved (every pointer event; rate-limit what you send). */
  move(at: Point): void;
  /** The finger came up — commit (one undo step). */
  end(at: Point): void;
  /** A second finger landed or the gesture was lost — end without the last bit (a live stroke is dropped). */
  cancel(): void;
}

/**
 * The DM's own camera on the companion (never the TV's). The table view (`render/`) owns it —
 * it fits new maps, clamps and refits on a resize; this is the companion's handle on it.
 */
export interface DmCameraControl {
  /** The camera the view shows now (reactive), null before the view draws a map. */
  get(): Camera | null;
  /** Moves the camera (the view clamps it). */
  set(camera: Camera): void;
  /** Centres the view on a point in squares, keeping the zoom. */
  jumpTo(at: Point): void;
  /** Fits the whole map on the companion's screen. */
  fit(): void;
  /** Shows what the TV shows. */
  showTv(): void;
  /**
   * Listens to every change of the camera (gestures, fits, resizes).
   *
   * @returns a function that stops listening
   */
  onChange(fn: (camera: Camera) => void): () => void;
}

/**
 * The game screen's context, handed to every tab panel, footer and tool. Its fields are
 * reactive (Svelte runes) — read them in markup or `$derived` and they follow the state.
 */
export interface GameContext {
  /** The page's configuration (server URL for files). */
  readonly config: AppConfig;
  /** The session (connection, sync client, requests to the TV). */
  readonly session: CompanionSession;
  /** The predicted state (confirmed + pending). */
  readonly state: RootState;
  /** The open game. */
  readonly game: Game;
  /** The map on the table. */
  readonly map: MapPlay;
  /** The map's walls and doors once loaded (null for picture maps or while loading). */
  readonly geometry: MapGeometry | null;
  /** The phone layout (< 720 px) rather than the tablet one. */
  readonly phone: boolean;
  /** The chosen tab's id. */
  readonly tab: string;
  /** The token selected on the map or in the list, or null (drawn with a ring). */
  selectedToken: string | null;
  /** Whether this device draws the map's DM layers (the master eye, never synced). */
  showDmLayers: boolean;
  /** The DM camera. */
  readonly camera: DmCameraControl;
  /**
   * What lies under a map point, highest priority first (the renderer's one hit test, with the
   * grab room of the current zoom).
   *
   * @param at - a point in squares
   * @returns the hits (empty when nothing)
   */
  hitsAt(at: Point): Hit[];
  /**
   * Runs a function when the game screen closes (stop timers, listeners, following).
   *
   * @param fn - the clean-up
   */
  onDispose(fn: () => void): void;
  /**
   * Sends a command (predicted at once, logged).
   *
   * @returns false when it wasn't sent — a notice already says why
   */
  dispatch(cmd: Command): boolean;
  /** The server's clock, epoch ms — stamp one-shots with it so the TV ages them right (rv#16). */
  serverNow(): number;
  /** A new gesture id: every command of one stroke or drag carries the same one (one undo step). */
  newGesture(): string;
  /** Chooses a tab (opens the panel). */
  selectTab(id: string): void;
  /** The URL of a file on the server. */
  fileUrl(ref: FileRef): string;
}

/**
 * The registered tabs in rail order: modes first, then panels, each by `order`. Duplicate ids
 * keep the first.
 *
 * @param modules - the `tab.ts` modules (`import.meta.glob(…, { eager: true })`)
 * @returns the tabs
 */
export function collectTabs(modules: Record<string, { default?: TabDef }>): TabDef[] {
  const seen = new Set<string>();
  const tabs: TabDef[] = [];
  for (const mod of Object.values(modules)) {
    const def = mod.default;
    if (!def || seen.has(def.id)) continue;
    seen.add(def.id);
    tabs.push(def);
  }
  const rank = (t: TabDef) => (t.group === 'modes' ? 0 : 1);
  return tabs.sort((a, b) => rank(a) - rank(b) || a.order - b.order || a.id.localeCompare(b.id));
}

/** The tab a game starts on (Tokens, design.md: the leftmost, default tab). */
export const DEFAULT_TAB = 'tokens';
