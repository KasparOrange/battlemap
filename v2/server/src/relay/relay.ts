/**
 * The relay: rooms of one TV and any number of companions, and the routing between them — the
 * server's whole part in a game. It reads only a message's `type`, `to` and `seq`, stamps
 * `from`, and passes everything else through untouched.
 *
 * - The first message on a socket must be `hello` (within `helloTimeoutMs`), else it is closed.
 * - One TV per room: a TV with another client id takes the slot and the old one gets
 *   `replaced` (it stops reconnecting); the same client reconnecting just replaces its dead
 *   socket. Companions: one slot per client id, any number of them.
 * - A companion's message goes to the room's TV (or back as `relay.undelivered`); a TV's goes
 *   to every companion, or to the one named in `to`.
 *
 * Independent of Bun's socket type (it takes a small `Conn`), so it is easy to read and test.
 *
 * @see ../../../docs/protocol.md "layers and routing"
 */
import { checkClientControl, checkRouting, parseJson, PROTOCOL_VERSION, type Hello, type Peer } from '@battlemap/shared';
import type { ServerLog } from '../log.ts';

/** One socket, as the relay sees it. */
export interface Conn {
  /** Unique per socket. */
  readonly id: number;
  /** The client's address (for the log). */
  readonly ip: string;
  /** Sends a text frame. */
  send(text: string): void;
  /** Closes the socket. */
  close(code: number, reason: string): void;
}

/** A socket that said hello. */
interface Member {
  conn: Conn;
  hello: Hello;
  joinedAt: number;
  messages: number;
}

/** A table: its TV and its companions. */
interface Room {
  id: string;
  tv: Member | null;
  companions: Map<string, Member>;
  createdAt: number;
}

/** A room as `GET /api/tables` lists it. */
export interface TableInfo {
  /** The room (table) id. */
  room: string;
  /** The TV's name. */
  tvName: string;
  /** Companions connected. */
  companions: number;
  /** When the TV joined (ISO). */
  since: string;
}

/** Close codes the relay uses. */
export const CLOSE = {
  /** The same client connected again; this socket is the old one. */
  superseded: 4000,
  /** Another TV took the room. */
  replaced: 4001,
  /** No hello in time. */
  noHello: 4002,
  /** The first message wasn't a valid hello. */
  badHello: 4003,
  /** Another protocol version. */
  protocol: 4004,
} as const;

/** The relay. */
export class Relay {
  private readonly rooms = new Map<string, Room>();
  private readonly members = new Map<number, { room: Room; member: Member }>();
  private readonly waiting = new Map<number, ReturnType<typeof setTimeout>>();

  /**
   * @param log - the logger (area `relay`)
   * @param build - the app build the server serves (for `welcome`)
   * @param helloTimeoutMs - how long a socket may stay silent before `hello`
   */
  constructor(private readonly log: ServerLog, private readonly build: () => string | null, private readonly helloTimeoutMs = 8_000) {}

  /**
   * A socket opened.
   *
   * @param conn - the socket
   */
  open(conn: Conn): void {
    this.waiting.set(conn.id, setTimeout(() => {
      this.log.warn('relay', 'No hello in time', { ip: conn.ip });
      conn.close(CLOSE.noHello, 'no hello');
    }, this.helloTimeoutMs));
  }

  /**
   * A text frame arrived.
   *
   * @param conn - the socket
   * @param text - the frame
   */
  message(conn: Conn, text: string): void {
    const json = parseJson(text);
    if (!json.ok || !json.value || typeof json.value !== 'object') {
      this.log.warn('relay', 'Unreadable frame', { ip: conn.ip, bytes: text.length });
      return;
    }
    const joined = this.members.get(conn.id);
    const type = (json.value as { type?: unknown }).type;
    if (!joined) {
      this.hello(conn, json.value);
      return;
    }
    if (type === 'ping') {
      const ping = checkClientControl(json.value);
      if (ping.ok && ping.value.type === 'ping') conn.send(JSON.stringify({ type: 'pong', t: ping.value.t, serverTime: Date.now() }));
      return;
    }
    if (type === 'hello') {
      this.log.warn('relay', 'Second hello ignored', { client: joined.member.hello.client });
      return;
    }
    this.route(joined.room, joined.member, json.value, text.length);
  }

  /**
   * A socket closed.
   *
   * @param conn - the socket
   * @param code - its close code
   */
  close(conn: Conn, code: number): void {
    const timer = this.waiting.get(conn.id);
    if (timer) clearTimeout(timer);
    this.waiting.delete(conn.id);
    const joined = this.members.get(conn.id);
    if (!joined) return;
    this.members.delete(conn.id);
    const { room, member } = joined;
    const h = member.hello;
    this.log.info('relay', 'Left', {
      room: room.id, role: h.role, client: h.client, name: h.name, closeCode: code,
      upS: Math.round((Date.now() - member.joinedAt) / 1000), messages: member.messages,
    });
    if (h.role === 'tv' && room.tv === member) room.tv = null;
    if (h.role === 'companion' && room.companions.get(h.client) === member) room.companions.delete(h.client);
    this.toRoom(room, { type: 'peer.left', client: h.client, role: h.role }, member);
    if (!room.tv && room.companions.size === 0) this.rooms.delete(room.id);
  }

  /**
   * Sends a message to every socket in every room (`server.build`).
   *
   * @param msg - the message
   */
  broadcastAll(msg: object): void {
    const text = JSON.stringify(msg);
    for (const { member } of this.members.values()) member.conn.send(text);
  }

  /**
   * The rooms with a TV online.
   *
   * @returns one row per table, newest TV first
   */
  tables(): TableInfo[] {
    const out: TableInfo[] = [];
    for (const room of this.rooms.values()) {
      if (!room.tv) continue;
      out.push({ room: room.id, tvName: room.tv.hello.name, companions: room.companions.size, since: new Date(room.tv.joinedAt).toISOString() });
    }
    return out.sort((a, b) => b.since.localeCompare(a.since));
  }

  /**
   * Counts for `/health`.
   *
   * @returns rooms, sockets that said hello, sockets that haven't yet
   */
  stats(): { rooms: number; members: number; waiting: number } {
    return { rooms: this.rooms.size, members: this.members.size, waiting: this.waiting.size };
  }

  // ── joining ──────────────────────────────────────────────────────────────────────────────

  private hello(conn: Conn, value: unknown): void {
    const checked = checkClientControl(value);
    if (!checked.ok || checked.value.type !== 'hello') {
      this.refuse(conn, CLOSE.badHello, `say hello first (${checked.ok ? 'got ' + checked.value.type : checked.error})`);
      return;
    }
    const hello = checked.value;
    if (hello.protocol !== PROTOCOL_VERSION) {
      this.refuse(conn, CLOSE.protocol, `protocol ${hello.protocol} is not ${PROTOCOL_VERSION} — reload the app`);
      return;
    }
    const timer = this.waiting.get(conn.id);
    if (timer) clearTimeout(timer);
    this.waiting.delete(conn.id);

    let room = this.rooms.get(hello.room);
    if (!room) {
      room = { id: hello.room, tv: null, companions: new Map(), createdAt: Date.now() };
      this.rooms.set(room.id, room);
    }
    const member: Member = { conn, hello, joinedAt: Date.now(), messages: 0 };
    const old = hello.role === 'tv' ? room.tv : room.companions.get(hello.client) ?? null;
    if (old) this.supersede(room, old, hello);
    if (hello.role === 'tv') room.tv = member;
    else room.companions.set(hello.client, member);
    this.members.set(conn.id, { room, member });

    const peers: Peer[] = [...(room.tv && room.tv !== member ? [room.tv] : []), ...room.companions.values()]
      .filter((m) => m !== member)
      .map((m) => peerOf(m.hello));
    conn.send(JSON.stringify({ type: 'welcome', client: hello.client, room: room.id, role: hello.role, peers, build: this.build(), serverTime: Date.now() }));
    this.toRoom(room, { type: 'peer.joined', peer: peerOf(hello) }, member);
    this.log.info('relay', 'Joined', { room: room.id, role: hello.role, client: hello.client, name: hello.name, build: hello.build, ip: conn.ip, peers: peers.length });
  }

  /** An old member makes room for a new one with the same slot. */
  private supersede(room: Room, old: Member, hello: Hello): void {
    this.members.delete(old.conn.id);
    if (old.hello.client === hello.client) {
      this.log.info('relay', 'Same client again, old socket closed', { room: room.id, client: hello.client });
      old.conn.close(CLOSE.superseded, 'superseded');
      return;
    }
    this.log.warn('relay', 'TV replaced', { room: room.id, old: old.hello.client, oldName: old.hello.name, new: hello.client, newName: hello.name });
    old.conn.send(JSON.stringify({ type: 'replaced', by: hello.name }));
    old.conn.close(CLOSE.replaced, 'replaced');
    this.toRoom(room, { type: 'peer.left', client: old.hello.client, role: old.hello.role }, old);
  }

  private refuse(conn: Conn, code: number, reason: string): void {
    this.log.warn('relay', 'Refused a socket', { ip: conn.ip, reason });
    conn.send(JSON.stringify({ type: 'server.error', reason }));
    conn.close(code, reason.slice(0, 120));
  }

  // ── routing ──────────────────────────────────────────────────────────────────────────────

  private route(room: Room, from: Member, value: unknown, bytes: number): void {
    const env = checkRouting(value);
    if (!env.ok) {
      this.log.warn('relay', 'Unroutable message', { client: from.hello.client, error: env.error });
      return;
    }
    from.messages++;
    const msg = env.value;
    const text = JSON.stringify({ ...msg, from: from.hello.client });
    this.log.count('relay', 'Traffic', { room: room.id, role: from.hello.role, type: msg.type }, { bytes });
    if (from.hello.role === 'companion') {
      if (room.tv) room.tv.conn.send(text);
      else this.undelivered(from, msg.type, msg.seq, 'no-tv');
      return;
    }
    if (msg.to) {
      const target = room.companions.get(msg.to);
      if (target) target.conn.send(text);
      else this.undelivered(from, msg.type, msg.seq, 'no-such-client');
      return;
    }
    for (const c of room.companions.values()) c.conn.send(text);
  }

  private undelivered(from: Member, msgType: string, seq: number | undefined, reason: string): void {
    this.log.info('relay', 'Dropped while the other side was away', { client: from.hello.client, type: msgType, reason });
    from.conn.send(JSON.stringify({ type: 'relay.undelivered', msgType, ...(seq !== undefined ? { seq } : {}), reason }));
  }

  /** Sends a server message to everyone in a room except one member. */
  private toRoom(room: Room, msg: object, except: Member): void {
    const text = JSON.stringify(msg);
    if (room.tv && room.tv !== except) room.tv.conn.send(text);
    for (const c of room.companions.values()) if (c !== except) c.conn.send(text);
  }
}

/** The public face of a member. */
function peerOf(h: Hello): Peer {
  return { client: h.client, role: h.role, name: h.name };
}
