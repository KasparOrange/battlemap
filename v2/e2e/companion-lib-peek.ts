/**
 * Test helper for the companion-lib flows: reads the TV's real state by joining its table as
 * an extra companion over a raw WebSocket and asking for a snapshot (`sync.request`). No page,
 * no prediction — exactly what the TV holds.
 */

/** What a snapshot carries, loosely typed for assertions. */
export interface PeekState {
  table: { widthInches: number; overscanPercent: number; pattern: { on: boolean; pivot: string } };
  game: null | {
    name: string;
    activeMapId: string;
    mapOrder: string[];
    maps: Record<string, {
      info: { name: string; grid: { cols: number; rows: number; cellW: number }; drawGrid: boolean };
      ruler: { visible: boolean };
      disc: { visible: boolean; markers: number };
      layers: { id: string; name: string; file: { hash: string } }[];
    }>;
  };
  live: { measure: unknown };
}

/**
 * The TV's state now.
 *
 * @param serverPort - the server's port
 * @param table - the table (room) id
 * @returns the state from a fresh snapshot
 */
export function peekTv(serverPort: number, table: string): Promise<PeekState> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${serverPort}/ws`);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('no snapshot within 8 s'));
    }, 8000);
    const client = `peek${Math.random().toString(36).slice(2, 10)}`;
    ws.onopen = () => ws.send(JSON.stringify({ type: 'hello', protocol: 1, role: 'companion', room: table, client, name: 'e2e peek', build: 'e2e' }));
    ws.onmessage = (e) => {
      const msg = JSON.parse(String(e.data)) as { type: string; state?: PeekState };
      if (msg.type === 'welcome') ws.send(JSON.stringify({ type: 'sync.request', sent: Date.now() }));
      if (msg.type === 'sync.snapshot' && msg.state) {
        clearTimeout(timer);
        ws.close();
        resolve(msg.state);
      }
    };
    ws.onerror = () => reject(new Error('socket error'));
  });
}

/** The map on the table of a peeked state. */
export function activeMap(s: PeekState) {
  if (!s.game) throw new Error('no game open on the TV');
  return s.game.maps[s.game.activeMapId]!;
}
