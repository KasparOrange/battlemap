/**
 * The DM layers' master eye (parity LY-03): this device only, never sent, on at start. The
 * game screen's renderer hook reads `layersLocal.show` to draw or skip every DM layer.
 */
class LayersLocal {
  /** Whether this tablet draws its DM layers at all. */
  show = $state(true);
}

/** The one switch of this tablet. */
export const layersLocal = new LayersLocal();
