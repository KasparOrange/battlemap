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
 * - Hardening (lessons of the old `tools/vtt_relay.py`): a socket silent for `zombieMs` (the
 *   app pings every 15 s) is closed as a zombie; each socket has a token-bucket rate limit
 *   (dropped messages are logged, a `sync.cmd` comes back as `relay.undelivered` with reason
 *   `rate-limited`, a flood closes the socket); a consumer that can't keep up is closed; caps on
 *   rooms, companions per room and sockets waiting for hello per address. A client can't send
 *   server message types (no forged `welcome` or `replaced`).
 * - Logs: joins, leaves (close code, time up, messages), takeovers, refusals, zombies, rate
 *   drops, undelivered messages, and once a minute a traffic summary per room.
 *
 * Independent of Bun's socket type (it takes a small `Conn`), so it is easy to read and test.
 *
 * @see ../../../docs/protocol.md "layers and routing"
 */
import { checkClientControl, checkRouting, parseJson, PROTOCOL_VERSION, SERVER_MESSAGE_TYPES, type Hello, type Peer } from '@battlemap/shared';
import { RELAY_LIMITS, type RelayLimits } from '../config.ts';
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
  /** Bytes queued to send but not yet sent (0 when unknown). */
  buffered?(): number;
}

/** A socket that said hello. */
interface Member {
  conn: Conn;
  hello: Hello;
  joinedAt: number;
  messages: number;
  /** When the last frame (any, pings too) arrived. */
  lastDataAt: number;
  /** Rate limit: tokens left and when they were last refilled. */
  tokens: number;
  refilledAt: number;
  /** Messages dropped for the rate in the current minute, and when that minute began. */
  rateDropped: number;
  rateWindowAt: number;
}

/** Messages and bytes a room's members sent since the last summary. */
interface Traffic {
  tvMessages: number;
  tvBytes: number;
  companionMessages: number;
  companionBytes: number;
  undelivered: number;
  rateDropped: number;
}

/** A table: its TV and its companions. */
interface Room {
  id: string;
  tv: Member | null;
  companions: Map<string, Member>;
  createdAt: number;
  traffic: Traffic;
}

/** A traffic counter at zero. */
function noTraffic(): Traffic {
  return { tvMessages: 0, tvBytes: 0, companionMessages: 0, companionBytes: 0, undelivered: 0, rateDropped: 0 };
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
  /** Silent too long (no ping). */
  zombie: 4005,
  /** Sent far more than the rate limit. */
  rate: 4006,
  /** Couldn't keep up with what it was sent. */
  slow: 4007,
  /** A cap was reached (rooms, companions in a room, sockets waiting from one address). */
  full: 4008,
} as const;

/** The relay. */
export class Relay {
  private readonly rooms = new Map<string, Room>();
  private readonly members = new Map<number, { room: Room; member: Member }>();
  private readonly waiting = new Map<number, { timer: ReturnType<typeof setTimeout>; ip: string }>();
  private readonly waitingByIp = new Map<string, number>();
  private readonly sweeper: ReturnType<typeof setInterval> | null;
  private lastSummaryAt = Date.now();

  /**
   * @param log - the logger (area `relay`)
   * @param build - the app build the server serves (for `welcome`)
   * @param helloTimeoutMs - how long a socket may stay silent before `hello`
   * @param limits - zombie, rate and size limits (default: production's)
   */
  constructor(private readonly log: ServerLog, private readonly build: () => string | null, private readonly helloTimeoutMs = 8_000, private readonly limits: RelayLimits = RELAY_LIMITS) {
    this.sweeper = limits.sweepMs > 0 ? setInterval(() => this.sweep(), limits.sweepMs) : null;
  }

  /** Stops the relay's timers (the server closes the sockets). */
  stop(): void {
    if (this.sweeper) clearInterval(this.sweeper);
    for (const w of this.waiting.values()) clearTimeout(w.timer);
  }

  /**
   * A socket opened.
   *
   * @param conn - the socket
   */
  open(conn: Conn): void {
    const fromIp = (this.waitingByIp.get(conn.ip) ?? 0) + 1;
    if (fromIp > this.limits.waitingPerIp) {
      this.log.warn('relay', 'Too many sockets waiting from one address', { ip: conn.ip, waiting: fromIp - 1 });
      conn.close(CLOSE.full, 'too many sockets');
      return;
    }
    this.waitingByIp.set(conn.ip, fromIp);
    const timer = setTimeout(() => {
      this.log.warn('relay', 'No hello in time', { ip: conn.ip, ms: this.helloTimeoutMs });
      conn.close(CLOSE.noHello, 'no hello');
    }, this.helloTimeoutMs);
    this.waiting.set(conn.id, { timer, ip: conn.ip });
  }

  /** A socket stops waiting for its hello (it said it, or closed). */
  private doneWaiting(conn: Conn): void {
    const w = this.waiting.get(conn.id);
    if (!w) return;
    clearTimeout(w.timer);
    this.waiting.delete(conn.id);
    const n = (this.waitingByIp.get(w.ip) ?? 1) - 1;
    if (n <= 0) this.waitingByIp.delete(w.ip);
    else this.waitingByIp.set(w.ip, n);
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
    joined.member.lastDataAt = Date.now();
    if (type === 'ping') {
      const ping = checkClientControl(json.value);
      if (ping.ok && ping.value.type === 'ping') conn.send(JSON.stringify({ type: 'pong', t: ping.value.t, serverTime: Date.now() }));
      return;
    }
    if (type === 'hello') {
      this.log.warn('relay', 'Second hello ignored', { client: joined.member.hello.client });
      return;
    }
    if (typeof type === 'string' && SERVER_MESSAGE_TYPES.has(type)) {
      this.log.warn('relay', 'Client sent a server message, dropped', { client: joined.member.hello.client, type });
      return;
    }
    if (!this.withinRate(joined.room, joined.member, json.value)) return;
    this.route(joined.room, joined.member, json.value, text.length);
  }

  /**
   * A socket closed.
   *
   * @param conn - the socket
   * @param code - its close code
   */
  close(conn: Conn, code: number): void {
    this.doneWaiting(conn);
    const joined = this.members.get(conn.id);
    if (!joined) return;
    this.members.delete(conn.id);
    const { room, member } = joined;
    const h = member.hello;
    this.log.info('relay', 'Left', {
      room: room.id, role: h.role, client: h.client, name: h.name, closeCode: code,
      upS: Math.round((Date.now() - member.joinedAt) / 1000), messages: member.messages,
      lastDataAgoMs: Date.now() - member.lastDataAt,
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
  stats(): { rooms: number; tvs: number; companions: number; members: number; waiting: number } {
    let tvs = 0;
    let companions = 0;
    for (const room of this.rooms.values()) {
      if (room.tv) tvs++;
      companions += room.companions.size;
    }
    return { rooms: this.rooms.size, tvs, companions, members: this.members.size, waiting: this.waiting.size };
  }

  // ── hardening ────────────────────────────────────────────────────────────────────────────

  /**
   * One pass of the housekeeping: closes zombies and consumers that can't keep up, and once a
   * minute logs each room's traffic. Runs every `sweepMs`; tests call it directly.
   *
   * @param now - the current time
   */
  sweep(now = Date.now()): void {
    for (const { room, member } of [...this.members.values()]) {
      const silentMs = now - member.lastDataAt;
      if (silentMs > this.limits.zombieMs) {
        this.log.warn('relay', 'Closing a silent socket (zombie)', { room: room.id, role: member.hello.role, client: member.hello.client, silentS: Math.round(silentMs / 1000) });
        member.conn.close(CLOSE.zombie, 'zombie');
        continue;
      }
      const buffered = member.conn.buffered?.() ?? 0;
      if (buffered > this.limits.maxBufferedBytes) {
        this.log.warn('relay', 'Closing a socket that cannot keep up', { room: room.id, role: member.hello.role, client: member.hello.client, bufferedMb: Math.round(buffered / 1048576) });
        member.conn.close(CLOSE.slow, 'too slow');
      }
    }
    if (now - this.lastSummaryAt >= 60_000) {
      const secs = Math.round((now - this.lastSummaryAt) / 1000);
      this.lastSummaryAt = now;
      for (const room of this.rooms.values()) {
        const t = room.traffic;
        if (t.tvMessages + t.companionMessages + t.undelivered + t.rateDropped === 0) continue;
        this.log.info('relay', 'Traffic', { room: room.id, secs, companions: room.companions.size, tv: room.tv !== null, ...t });
        room.traffic = noTraffic();
      }
    }
  }

  /** Spends a token for a message; false (and the drop handled) when the socket is over its rate. */
  private withinRate(room: Room, m: Member, value: unknown): boolean {
    const now = Date.now();
    m.tokens = Math.min(this.limits.rateBurst, m.tokens + ((now - m.refilledAt) / 1000) * this.limits.ratePerS);
    m.refilledAt = now;
    if (m.tokens >= 1) {
      m.tokens -= 1;
      return true;
    }
    if (now - m.rateWindowAt > 60_000) {
      m.rateWindowAt = now;
      m.rateDropped = 0;
    }
    m.rateDropped++;
    room.traffic.rateDropped++;
    const type = String((value as { type?: unknown }).type ?? '?');
    if (m.rateDropped === 1) this.log.warn('relay', 'Over the rate limit, dropping', { room: room.id, role: m.hello.role, client: m.hello.client, type, ratePerS: this.limits.ratePerS });
    const seq = (value as { seq?: unknown }).seq;
    if (type === 'sync.cmd' && typeof seq === 'number') m.conn.send(JSON.stringify({ type: 'relay.undelivered', msgType: type, seq, reason: 'rate-limited' }));
    if (m.rateDropped > this.limits.rateCloseAfter) {
      this.log.warn('relay', 'Closing a flooding socket', { room: room.id, role: m.hello.role, client: m.hello.client, dropped: m.rateDropped });
      m.conn.close(CLOSE.rate, 'rate limit');
    }
    return false;
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
    let room = this.rooms.get(hello.room);
    if (!room && this.rooms.size >= this.limits.maxRooms) {
      this.refuse(conn, CLOSE.full, `the server is full (${this.limits.maxRooms} tables)`);
      return;
    }
    const old = hello.role === 'tv' ? room?.tv ?? null : room?.companions.get(hello.client) ?? null;
    if (room && hello.role === 'companion' && !old && room.companions.size >= this.limits.companionsPerRoom) {
      this.refuse(conn, CLOSE.full, `this table has ${this.limits.companionsPerRoom} companions already`);
      return;
    }
    this.doneWaiting(conn);
    if (!room) {
      room = { id: hello.room, tv: null, companions: new Map(), createdAt: Date.now(), traffic: noTraffic() };
      this.rooms.set(room.id, room);
    }
    const now = Date.now();
    const member: Member = { conn, hello, joinedAt: now, messages: 0, lastDataAt: now, tokens: this.limits.rateBurst, refilledAt: now, rateDropped: 0, rateWindowAt: now };
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
    this.doneWaiting(conn);
    this.log.warn('relay', 'Refused a socket', { ip: conn.ip, reason, code });
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
    this.log.count('relay', 'Messages', { role: from.hello.role, type: msg.type }, { bytes });
    if (from.hello.role === 'companion') {
      room.traffic.companionMessages++;
      room.traffic.companionBytes += bytes;
      if (room.tv) room.tv.conn.send(text);
      else this.undelivered(room, from, msg.type, msg.seq, 'no-tv');
      return;
    }
    room.traffic.tvMessages++;
    room.traffic.tvBytes += bytes;
    if (msg.to) {
      const target = room.companions.get(msg.to);
      if (target) target.conn.send(text);
      else this.undelivered(room, from, msg.type, msg.seq, 'no-such-client');
      return;
    }
    for (const c of room.companions.values()) c.conn.send(text);
  }

  private undelivered(room: Room, from: Member, msgType: string, seq: number | undefined, reason: string): void {
    room.traffic.undelivered++;
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
