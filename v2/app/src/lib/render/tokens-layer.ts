/**
 * Tokens: position markers under the miniatures. Each placed token is a small container — a
 * shadow, a disc in its colour, a light ring, its label (big, bold, outlined: readable at one
 * inch per square, the old app's were ~3 px) and its name on a pill above — all sprites from one
 * generated atlas plus bitmap text, so they batch into a draw call or two. The label and name
 * stay upright on screen whatever the camera's turn. The TV leaves hidden tokens out; the DM
 * sees them at 45 %. Each token has an `fx` child the effects runtime may fill (it moves and
 * hides with the token).
 */
import { BitmapText, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import type { Token } from '@battlemap/shared';
import { SQUARE } from './camera.ts';
import { FONT_LABEL, FONT_NAME, GLYPH_PX, installFonts } from './fonts.ts';
import { TOKEN_RADIUS } from './hit.ts';

/** Atlas cell size in px (one square drawn at this size). */
const CELL = 128;

/** Label height in squares. */
const LABEL_SQ = 0.46;

/** Name text height in squares. */
const NAME_SQ = 0.24;

const LABEL_STYLE = { fontFamily: FONT_LABEL, fontSize: GLYPH_PX };
const NAME_STYLE = { fontFamily: FONT_NAME, fontSize: GLYPH_PX };

/** The atlas's frames. */
interface Atlas {
  shadow: Texture;
  disc: Texture;
  ring: Texture;
  bytes: number;
  destroy(): void;
}

/** Draws the token atlas (shadow, white disc, ring) into one texture. */
function makeAtlas(): Atlas {
  const canvas = document.createElement('canvas');
  canvas.width = CELL * 3;
  canvas.height = CELL;
  const g = canvas.getContext('2d')!;
  const c = CELL / 2;
  const r = TOKEN_RADIUS * CELL;
  // shadow
  const grad = g.createRadialGradient(c, c + 4, r * 0.7, c, c + 4, r * 1.2);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, CELL, CELL);
  // disc (tinted per token)
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(CELL + c, c, r, 0, Math.PI * 2);
  g.fill();
  // ring
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.lineWidth = 5;
  g.beginPath();
  g.arc(CELL * 2 + c, c, r - 2.5, 0, Math.PI * 2);
  g.stroke();
  const base = Texture.from(canvas);
  base.source.label = 'token-atlas';
  const frame = (i: number) => new Texture({ source: base.source, frame: new Rectangle(i * CELL, 0, CELL, CELL) });
  return {
    shadow: frame(0),
    disc: frame(1),
    ring: frame(2),
    bytes: canvas.width * canvas.height * 4,
    destroy() {
      base.destroy(true);
    },
  };
}

/** One token on screen. */
interface TokenView {
  token: Token;
  root: Container;
  disc: Sprite;
  face: Container;
  label: BitmapText;
  name: BitmapText;
  pill: Graphics;
  fx: Container;
}

/** The tokens layer. */
export class TokensLayer {
  /** The container (the scene's tokens slot). */
  readonly container = new Container({ label: 'tokens' });
  private readonly views = new Map<string, TokenView>();
  private atlas: Atlas | null = null;
  private tokens: readonly Token[] | null = null;
  private faceRotation = 0;

  /**
   * @param parent - the scene's tokens slot
   * @param dm - the DM's view (hidden tokens drawn faded) or the players' (left out)
   */
  constructor(parent: Container, private readonly dm: boolean) {
    parent.addChild(this.container);
  }

  /** Texture bytes held (the atlas; the glyph pages are Pixi's, counted roughly). */
  get bytes(): number {
    return this.atlas ? this.atlas.bytes + 2 * 1024 * 1024 : 0;
  }

  /** Placed tokens on screen. */
  get count(): number {
    return this.views.size;
  }

  /**
   * The effects container of a shown token.
   *
   * @param id - the token's id
   * @returns its `fx` container, or null when it is not on screen
   */
  fxOf(id: string): Container | null {
    return this.views.get(id)?.fx ?? null;
  }

  /**
   * Shows a map's tokens.
   *
   * @param tokens - the map's tokens (null: none)
   * @returns whether anything changed
   */
  set(tokens: readonly Token[] | null): boolean {
    if (tokens === this.tokens) return false;
    this.tokens = tokens;
    const keep = new Set<string>();
    let order = 0;
    for (const t of tokens ?? []) {
      if (!t.placed || (t.hidden && !this.dm)) continue;
      keep.add(t.id);
      let v = this.views.get(t.id);
      if (!v) {
        v = this.create(t);
        this.views.set(t.id, v);
        this.container.addChild(v.root);
      } else if (v.token !== t) {
        this.apply(v, t);
      }
      if (this.container.getChildIndex(v.root) !== order) this.container.setChildIndex(v.root, order);
      order++;
    }
    for (const [id, v] of this.views) {
      if (keep.has(id)) continue;
      v.root.destroy({ children: true });
      this.views.delete(id);
    }
    return true;
  }

  /**
   * Keeps labels upright on screen.
   *
   * @param rotation - the camera's turn in radians
   */
  setCameraRotation(rotation: number): void {
    if (rotation === this.faceRotation) return;
    this.faceRotation = rotation;
    for (const v of this.views.values()) v.face.rotation = -rotation;
  }

  private create(t: Token): TokenView {
    installFonts();
    this.atlas ??= makeAtlas();
    const a = this.atlas;
    const root = new Container({ label: `token ${t.id}` });
    const scale = SQUARE / CELL;
    const sprite = (tex: Texture) => {
      const s = new Sprite({ texture: tex, anchor: 0.5 });
      s.scale.set(scale);
      return s;
    };
    const shadow = sprite(a.shadow);
    const disc = sprite(a.disc);
    const ring = sprite(a.ring);
    const face = new Container({ label: 'face' });
    face.rotation = -this.faceRotation;
    const label = new BitmapText({ text: '', style: LABEL_STYLE, anchor: 0.5 });
    label.scale.set((LABEL_SQ * SQUARE) / GLYPH_PX);
    const pill = new Graphics();
    const name = new BitmapText({ text: '', style: NAME_STYLE, anchor: 0.5 });
    name.scale.set((NAME_SQ * SQUARE) / GLYPH_PX);
    face.addChild(label, pill, name);
    const fx = new Container({ label: 'fx' });
    root.addChild(shadow, disc, ring, face, fx);
    const v: TokenView = { token: t, root, disc, face, label, name, pill, fx };
    this.apply(v, t, true);
    return v;
  }

  private apply(v: TokenView, t: Token, first = false): void {
    const old = v.token;
    v.token = t;
    v.root.position.set((t.col + 0.5) * SQUARE, (t.row + 0.5) * SQUARE);
    v.root.alpha = t.hidden ? 0.45 : 1;
    if (first || old.color !== t.color) v.disc.tint = t.color;
    if (first || old.label !== t.label) v.label.text = t.label;
    if (first || old.name !== t.name) {
      v.name.text = t.name;
      v.pill.clear();
      v.name.visible = v.pill.visible = t.name.length > 0;
      if (t.name) {
        const w = v.name.width + NAME_SQ * SQUARE * 0.8;
        const h = NAME_SQ * SQUARE * 1.35;
        const y = -(TOKEN_RADIUS + 0.12) * SQUARE - h / 2;
        v.pill.roundRect(-w / 2, y - h / 2, w, h, h / 2).fill({ color: 0x000000, alpha: 0.67 });
        v.name.position.set(0, y);
      }
    }
  }

  /** Frees every token and the atlas. */
  destroy(): void {
    for (const v of this.views.values()) v.root.destroy({ children: true });
    this.views.clear();
    this.atlas?.destroy();
    this.atlas = null;
    this.container.destroy({ children: true });
  }
}
