/**
 * The Android shell's JavaScript bridge: `window.BattlemapShell` (only inside the shell) and the
 * `battlemapshell` events it dispatches on `window`. Implemented in
 * `shell/app/src/main/kotlin/app/battlemap/table/ShellBridge.kt`; explained in `docs/shell.md`.
 *
 * Detecting the shell: `window.BattlemapShell` exists, and the user agent ends with
 * `BattlemapShell/<version>`. In a plain browser neither is there — the app must work without.
 *
 * All methods are synchronous calls into Android (strings and booleans only); long jobs report
 * back through events. Methods that change the window (immersive, keep awake, reload) return at
 * once and take effect a moment later on Android's main thread.
 */

/** What `BattlemapShell.info()` returns (parsed from its JSON string). */
export interface ShellInfo {
  /** The shell's version name, e.g. "0.1.0". */
  shellVersion: string;
  /** The shell's Android version code (grows with every APK). */
  versionCode: number;
  /** A debug build (WebView remote debugging on). */
  debug: boolean;
  /** Always "app.battlemap.table". */
  applicationId: string;
  /** A TV device: Android TV / Google TV or Fire TV. */
  isTv: boolean;
  /** The mode to start in (also passed as `?mode=`). TV devices default to "tv". */
  startMode: 'tv' | 'companion';
  /** True when the mode was forced (`setStartMode`, adb `--es mode`), not detected. */
  startModeForced: boolean;
  /** A random id made on first start and kept (also passed as `?device=`). */
  deviceId: string;
  /** The developer URL the app is loaded from instead of the bundle, or null. */
  devUrl: string | null;
  /** The server URL handed to the app as `?server=`, or null (the app's own default). */
  serverUrl: string | null;
  /** Which web bundle is served on https://appassets.androidplatform.net/app/. */
  bundle:
    | { source: 'builtin'; version: string }
    | { source: 'downloaded'; version: string; unconfirmedLoads: number }
    | { source: 'none' };
  /** System bars hidden. */
  immersive: boolean;
  /** Screen kept on. */
  keepAwake: boolean;
  /** TV devices: the app starts into TV mode when the device boots (opt-in, `setStartOnBoot`). */
  startOnBoot: boolean;
  /** The box's stay-awake settings (TV-01): written at every TV-mode start once adb granted the permission. */
  stayAwake: StayAwakeStatus;
  /** The table on the LAN (hosting on this TV, its address and code). */
  lan: LanStatus;
  device: {
    manufacturer: string;
    model: string;
    /** The name the owner gave the device (Android's "Device name"), else its Bluetooth name, else manufacturer + model. */
    name: string;
    /** Android API level, e.g. 34. */
    sdk: number;
    /** Android version, e.g. "14". */
    android: string;
    isTv: boolean;
    isFireTv: boolean;
    webViewPackage: string;
    webViewVersion: string;
  };
  display: {
    /** The app window in physical pixels. */
    windowWidthPx: number;
    windowHeightPx: number;
    /** Android density (CSS px = physical px / density). */
    density: number;
    /** The display mode — on a TV box the output resolution (e.g. 3840 × 2160). */
    modeWidthPx: number;
    modeHeightPx: number;
    refreshRate: number;
  };
}

/** The box's stay-awake settings (see `StayAwake.kt`). */
export interface StayAwakeStatus {
  /** adb granted WRITE_SECURE_SETTINGS (`pm grant app.battlemap.table android.permission.WRITE_SECURE_SETTINGS`). */
  granted: boolean;
  /** Every setting has its stay-awake value. */
  ok: boolean;
  /** Current values, e.g. `{"secure attentive_timeout": -1}` (null = unset). */
  settings: Record<string, number | null>;
  /** The settings that don't have their stay-awake value. */
  wrong: string[];
  /** Written by this call (only from `applyStayAwake`). */
  applied?: string[];
}

/** The table this device hosts on the LAN (`BattlemapShell.lan()`, `lan` events; `Lan.kt`). */
export interface LanStatus {
  /** "Host the table on this TV" is on (TV mode; default on). */
  hosting: boolean;
  server: {
    running: boolean;
    /** 5930 */
    port: number;
    /** `http://127.0.0.1:5930` while running. */
    localUrl: string | null;
    /** The internet server it syncs with (the VPS). */
    upstream: string | null;
    /** Why it couldn't start. */
    error: string | null;
    startedAt: number;
    startMs: number;
    /** The shell process's resident memory in kB (WebView host + server). */
    rssKb: number;
  };
  /** This device's LAN IPv4 address, null without a network. */
  address: string | null;
  /** `http://<address>:5930` */
  url: string | null;
  /** The short code for `url` (4 characters on 192.168.x.y; `decodeLanCode` in config.ts). */
  code: string | null;
  /** The relay room this TV hosts. */
  tableId: string;
  tableName: string | null;
  /** Opens the box's own copy of the app as a companion of this table — put it in the QR code. */
  joinUrl: string | null;
  /** The mDNS name the table is announced under, null when not announced. */
  announced: string | null;
}

/** A table found on the LAN by mDNS (`tables` events, `lanTables()`). */
export interface LanTable {
  /** The mDNS service name (the TV's name). */
  service: string;
  /** The relay room, null for an announcement without it. */
  table: string | null;
  name: string;
  host: string;
  port: number;
  /** `http://<host>:<port>` — the table server's base URL. */
  url: string;
}

/** One shell log line (from `takeLogs()` or a `log` event). */
export interface ShellLogLine {
  /** Unix time in ms. */
  t: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  msg: string;
}

/** `window.BattlemapShell`. */
export interface BattlemapShell {
  /** Shell, device, mode and bundle facts as a JSON string — parse into {@link ShellInfo}. */
  info(): string;
  /**
   * The app has booted. Call once per page load: it confirms a downloaded bundle as good —
   * a bundle loaded 3 times without `ready()` is dropped for the built-in one.
   */
  ready(): void;
  /**
   * Returns the shell's buffered log lines (JSON array of {@link ShellLogLine}) and switches to
   * live `log` events. Forward them to the app's logger (MwLog, `src=shell`).
   */
  takeLogs(): string;
  /** Keep the screen on (TV mode starts with it on, companion with it off). */
  setKeepAwake(on: boolean): void;
  /** Hide (true) or show (false) the system bars. Both modes start immersive. */
  setImmersive(on: boolean): void;
  /** Open an http(s)/mailto URL outside the app. False when nothing on the device can. */
  openExternal(url: string): boolean;
  /** Download an APK and start the system install (`apk` events). */
  installApk(url: string): void;
  /** Download a bundle zip (the app's dist) and make it active on the next `reload()` (`bundle` events). */
  updateBundle(url: string, version: string): void;
  /** Drop downloaded bundles, go back to the one built into the APK, reload. */
  useBuiltinBundle(): void;
  /** Reload the start page (the app with its start parameters). */
  reload(): void;
  /** Load the app from a dev server from now on ("" = bundle again). Release builds: LAN hosts only. */
  setDevUrl(url: string): void;
  /** Server URL passed as `?server=` from the next load on ("" = app default). */
  setServerUrl(url: string): void;
  /** Force the start mode ("tv", "companion") or detect it again ("auto"). Next start. */
  setStartMode(mode: 'tv' | 'companion' | 'auto'): void;
  /** TV devices: start into TV mode when the device boots (after a power cut). Opt-in. */
  setStartOnBoot(on: boolean): void;
  /** Write the box's stay-awake settings now; returns {@link StayAwakeStatus} as JSON. */
  applyStayAwake(): string;
  /** The LAN table: JSON {@link LanStatus}. */
  lan(): string;
  /** TV mode: host the table on this device (default on) or not; the page reloads onto the right server. */
  setHostTable(on: boolean): void;
  /** TV mode: the table id and name to announce on the LAN. */
  announceTable(tableId: string, name: string): void;
  /** Companion: look for tables on the LAN (`tables` events) or stop. */
  discoverTables(on: boolean): void;
  /** The tables found so far: JSON array of {@link LanTable}. */
  lanTables(): string;
  /** Start saving a file into the device's Downloads; returns its id. Use `saveFile()` in `app/src/lib/shell.ts`. */
  saveBegin(name: string, mime: string): number;
  /** Append a base64 chunk (≤ 512 kB of bytes); false = stop. */
  saveChunk(id: number, base64: string): boolean;
  /** Finish the file (a `download` event says where it went). */
  saveEnd(id: number): boolean;
  /** Drop an unfinished file. */
  saveAbort(id: number): void;
}

/** `detail` of a `battlemapshell` event, by `type`. */
export type ShellEvent =
  /** Back was pressed. Call `preventDefault()` on the event if the app handled it; otherwise
   *  the shell goes back in history or leaves the app (answer within 500 ms). */
  | { type: 'back' }
  | { type: 'log'; line: ShellLogLine }
  | {
      type: 'apk';
      state: 'downloading' | 'installing' | 'waiting-for-user' | 'done' | 'failed';
      received?: number;
      /** -1 when unknown. */
      total?: number;
      error?: string;
    }
  | {
      type: 'bundle';
      state: 'downloading' | 'ready' | 'failed';
      received?: number;
      total?: number;
      version?: string;
      error?: string;
    }
  /** Android asked to free memory — only real pressure is sent: 10 (running low), 15 (critical),
   *  60/80 (in the background, about to be killed). The "UI hidden" level is not. */
  | { type: 'memory'; level: number }
  /** Hosting started, stopped or failed; the announcement changed. */
  | ({ type: 'lan' } & LanStatus)
  /** The LAN tables found changed (the whole list). */
  | { type: 'tables'; tables: LanTable[] }
  /** A file saved into Downloads (`saveFile`, or a `<a download href=blob:…>` click). */
  | {
      type: 'download';
      id: number;
      state: 'started' | 'saved' | 'failed';
      name: string;
      bytes?: number;
      /** Where it went, e.g. "Downloads/game.battlemap". */
      where?: string;
      error?: string;
    };

declare global {
  interface Window {
    BattlemapShell?: BattlemapShell;
  }
  interface WindowEventMap {
    battlemapshell: CustomEvent<ShellEvent>;
  }
}
