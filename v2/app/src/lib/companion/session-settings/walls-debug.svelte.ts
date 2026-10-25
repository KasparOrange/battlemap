/**
 * "Show walls" — this tablet draws the map's walls over its own view, to check why a Room or
 * Circle reveal stops where it does (parity SE-07). A view setting of this device, never on the
 * TV, kept in localStorage. The game screen hands it to its table view
 * (`TableView.setWallsShown(wallsDebug.on)`).
 */
const KEY = 'bm.companion.showWalls';

class WallsDebug {
  /** Whether this tablet shows the walls. */
  on = $state(read());

  /**
   * Switches it and remembers it.
   *
   * @param on - shown or not
   */
  set(on: boolean): void {
    this.on = on;
    try {
      localStorage.setItem(KEY, on ? '1' : '0');
    } catch {
      /* not kept then */
    }
  }
}

/** Reads the remembered value (off by default). */
function read(): boolean {
  try {
    return globalThis.localStorage?.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** The one switch of this device. */
export const wallsDebug = new WallsDebug();
