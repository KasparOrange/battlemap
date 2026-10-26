/**
 * Pure logic of the Secrets tab (roadmap S9, docs/features.md "Secret doors and traps"): making
 * a secret from a tap, finding the secret under a tap, labels and numbering, the effects that
 * suit each kind, the one-shot a find or a spring plays, and the list's groups. No DOM, tested
 * under `bun test` (`secrets-logic.test.ts`).
 */
import type { Door, OneShot, Secret, SecretKind } from '@battlemap/shared';

/** What each kind is called in the lists ("Trap 2" when it has no name). */
export const KIND_WORDS: Record<SecretKind, string> = { door: 'Secret door', mark: 'Mark', trap: 'Trap' };

/** One effect a secret can play when it is found or sprung. */
export interface SecretEffect {
  /** The effect catalogue id (`assets/effects/index.json`). */
  id: string;
  /** What the DM picks. */
  label: string;
  /** A tint passed to the effect, or none. */
  color?: string;
}

/**
 * The effects that play well as a short one-shot on one square, per kind (the first is the
 * default for new secrets). Tints: the mark's gold, the trap's red — the colours of their glyphs.
 */
export const SECRET_EFFECTS: Record<SecretKind, readonly SecretEffect[]> = {
  door: [
    { id: 'dust-burst', label: 'Dust' },
    { id: 'shockwave-ring', label: 'Pulse', color: '#d8b25a' },
  ],
  mark: [
    { id: 'shockwave-ring', label: 'Gold pulse', color: '#d8b25a' },
    { id: 'glyph-of-warding', label: 'Glyph' },
  ],
  trap: [
    { id: 'shockwave-ring', label: 'Red pulse', color: '#d9473f' },
    { id: 'explosion-smoky', label: 'Explosion' },
    { id: 'poison-cloud', label: 'Poison cloud' },
    { id: 'dust-burst', label: 'Dust' },
    { id: 'glyph-of-warding', label: 'Glyph' },
  ],
};

/** How many squares across a kind's one-shot plays. */
const SHOT_SQUARES: Record<SecretKind, number> = { door: 2, mark: 2, trap: 3 };

/**
 * A new secret on a square (or one of the map's own doors).
 *
 * @param id - its new id
 * @param kind - door, mark or trap
 * @param col - its square's column
 * @param row - its square's row
 * @param door - the map door it makes secret (`kind` door only), or null
 * @param vertical - a drawn door's leaf runs top to bottom
 * @returns the secret, not found, with its kind's default effect
 */
export function makeSecret(id: string, kind: SecretKind, col: number, row: number, door: number | null = null, vertical = false): Secret {
  return { id, kind, name: '', note: '', col, row, door: kind === 'door' ? door : null, vertical, effect: SECRET_EFFECTS[kind][0]!.id, found: false };
}

/**
 * The square a map door sits on (its middle, nudged into the map) and whether it runs down.
 *
 * @param d - the door
 * @param cols - map width
 * @param rows - map height
 * @returns column, row, vertical
 */
export function doorSquare(d: Door, cols: number, rows: number): { col: number; row: number; vertical: boolean } {
  const mx = (d.a.x + d.b.x) / 2;
  const my = (d.a.y + d.b.y) / 2;
  const vertical = Math.abs(d.b.y - d.a.y) > Math.abs(d.b.x - d.a.x);
  // a door on a grid line: take the square to its right / below
  const col = Math.min(cols - 1, Math.max(0, Math.floor(mx + (vertical ? 0.01 : 0))));
  const row = Math.min(rows - 1, Math.max(0, Math.floor(my + (vertical ? 0 : 0.01))));
  return { col, row, vertical };
}

/**
 * The secret a tap hits: the one on a tapped map door, else one on the tapped square.
 *
 * @param secrets - the map's secrets
 * @param col - the tapped square's column
 * @param row - the tapped square's row
 * @param door - the map door under the tap, or null
 * @returns the secret, or null
 */
export function secretAt(secrets: readonly Secret[], col: number, row: number, door: number | null): Secret | null {
  if (door !== null) {
    const s = secrets.find((x) => x.door === door);
    if (s) return s;
  }
  return secrets.find((x) => x.col === col && x.row === row) ?? null;
}

/**
 * The name a secret shows: its own, else its kind and number among its kind ("Trap 2").
 *
 * @param s - the secret
 * @param all - the map's secrets (for the number)
 * @returns the label
 */
export function secretLabel(s: Secret, all: readonly Secret[]): string {
  const own = s.name.trim();
  if (own) return own;
  let n = 0;
  for (const x of all) {
    if (x.kind === s.kind) n++;
    if (x.id === s.id) break;
  }
  return `${KIND_WORDS[s.kind]} ${Math.max(1, n)}`;
}

/**
 * The line under a secret's name in the list: its note's first line, else what it is.
 *
 * @param s - the secret
 * @returns the line
 */
export function secretSub(s: Secret): string {
  const first = s.note.split('\n').find((l) => l.trim())?.trim();
  if (first) return first.length > 60 ? `${first.slice(0, 59)}…` : first;
  if (s.kind === 'door') return s.door !== null ? 'A door of the map' : 'Drawn on its square';
  return s.kind === 'trap' ? 'Springs with an effect' : 'Shows when found';
}

/**
 * The effect entry of a secret (its tint), or null for none / an unknown id.
 *
 * @param s - the secret
 * @returns the entry
 */
export function secretEffect(s: Pick<Secret, 'kind' | 'effect'>): SecretEffect | null {
  if (!s.effect) return null;
  return SECRET_EFFECTS[s.kind].find((e) => e.id === s.effect) ?? { id: s.effect, label: s.effect };
}

/**
 * The one-shot a find or a spring plays: the secret's effect over a few squares round its
 * square, as a square region (how the Effects tab anchors sheet and texture effects).
 *
 * @param s - the secret
 * @param id - a new id (every screen plays an id once)
 * @param now - the server's clock, epoch ms
 * @returns the shot, or null when the secret plays no effect
 */
export function secretShot(s: Secret, id: string, now: number): OneShot | null {
  const fx = secretEffect(s);
  if (!fx) return null;
  const half = SHOT_SQUARES[s.kind] / 2;
  const cx = s.col + 0.5;
  const cy = s.row + 0.5;
  const points = [
    { x: cx - half, y: cy - half },
    { x: cx + half, y: cy - half },
    { x: cx + half, y: cy + half },
    { x: cx - half, y: cy + half },
  ];
  return { id, effect: fx.id, anchor: { kind: 'region', points }, params: { shape: 'cube', ...(fx.color ? { color: fx.color } : {}) }, at: now };
}

/**
 * The list's two groups, each in the map's order.
 *
 * @param secrets - the map's secrets
 * @returns hidden (not found / not sprung) and found
 */
export function secretGroups(secrets: readonly Secret[]): { hidden: Secret[]; found: Secret[] } {
  return { hidden: secrets.filter((s) => !s.found), found: secrets.filter((s) => s.found) };
}

/**
 * The verb of a secret's one-tap button.
 *
 * @param s - the secret
 * @returns "Spring" for a hidden trap, "Found" for a hidden door or mark, "Hide again" once found
 */
export function foundVerb(s: Pick<Secret, 'kind' | 'found'>): string {
  if (s.found) return 'Hide again';
  return s.kind === 'trap' ? 'Spring' : 'Found';
}
