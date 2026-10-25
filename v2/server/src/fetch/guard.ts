/**
 * The link fetch's door policy: only addresses on the public internet. The server must never
 * become a way into the VPS's own services (VictoriaLogs on 127.0.0.1, Docker's networks) or
 * anyone's LAN. The check runs on the addresses a name resolves to, inside the socket's own DNS
 * lookup — so the address checked is the address connected to (the old server resolved twice,
 * leaving a DNS-rebinding gap).
 */
import dns from 'node:dns';
import { isIP } from 'node:net';

/** A link the server refuses to fetch, with the reason for the app. */
export class Refused extends Error {}

/** IPv4 ranges that are not the public internet: [first octets as a number, prefix length]. */
const V4_BLOCKED: [string, number][] = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
];

/** An IPv4 address as a 32-bit number. */
function v4(ip: string): number {
  return ip.split('.').reduce((n, part) => n * 256 + Number(part), 0);
}

/** Whether an IPv4 address is public. */
function publicV4(ip: string): boolean {
  const n = v4(ip);
  return !V4_BLOCKED.some(([base, bits]) => {
    const size = 2 ** (32 - bits);
    return Math.floor(n / size) === Math.floor(v4(base) / size);
  });
}

/** An IPv6 address as eight 16-bit groups (with an embedded IPv4 tail expanded). */
function v6Groups(ip: string): number[] | null {
  let s = ip.toLowerCase().split('%')[0]!;
  const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (tail) {
    const n = v4(tail[1]!);
    s = s.slice(0, -tail[1]!.length) + `${Math.floor(n / 65536).toString(16)}:${(n % 65536).toString(16)}`;
  }
  const [head, rest] = s.split('::');
  const a = head ? head.split(':') : [];
  const b = rest !== undefined && rest !== '' ? rest.split(':') : [];
  const fill = s.includes('::') ? 8 - a.length - b.length : 0;
  const groups = [...a, ...Array(fill).fill('0'), ...b].map((g) => parseInt(g, 16));
  return groups.length === 8 && groups.every((g) => g >= 0 && g <= 0xffff) ? groups : null;
}

/**
 * Whether an address is on the public internet.
 *
 * IPv4: everything but the private, loopback, link-local, shared (CGNAT), documentation,
 * benchmark, multicast and reserved ranges. IPv6: only global unicast (2000::/3) outside the
 * documentation, Teredo and 6to4 ranges; IPv4-mapped and NAT64 addresses are judged by their
 * IPv4 part.
 *
 * @param ip - an IPv4 or IPv6 address
 * @returns true when the server may connect to it
 */
export function isPublicAddress(ip: string): boolean {
  const kind = isIP(ip.split('%')[0]!);
  if (kind === 4) return publicV4(ip);
  if (kind !== 6) return false;
  const g = v6Groups(ip);
  if (!g) return false;
  const embedded = () => `${g[6]! >> 8}.${g[6]! & 255}.${g[7]! >> 8}.${g[7]! & 255}`;
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return publicV4(embedded());
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return publicV4(embedded());
  if ((g[0]! & 0xe000) !== 0x2000) return false;
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false;
  if (g[0] === 0x2001 && g[1] === 0x0000) return false;
  if (g[0] === 0x2002) return false;
  return true;
}

/** What a resolver returns: the addresses of a name. */
export type Resolve = (host: string) => Promise<{ address: string; family: number }[]>;

/** The system resolver (every address of a name). */
export const systemResolve: Resolve = (host) =>
  new Promise((resolve, reject) => dns.lookup(host, { all: true }, (e, addrs) => (e ? reject(e) : resolve(addrs))));

/**
 * Resolves a host and refuses it unless every address is public.
 *
 * @param host - a name or a literal address
 * @param resolve - the resolver (tests pass their own)
 * @returns the addresses
 * @throws {Refused} for an unknown host or one with a non-public address
 */
export async function publicAddresses(host: string, resolve: Resolve = systemResolve): Promise<{ address: string; family: number }[]> {
  const bare = host.replace(/^\[|\]$/g, '');
  let addrs: { address: string; family: number }[];
  if (isIP(bare)) addrs = [{ address: bare, family: isIP(bare) }];
  else {
    try {
      addrs = await resolve(bare);
    } catch {
      throw new Refused(`unknown host ${bare}`);
    }
  }
  if (addrs.length === 0) throw new Refused(`unknown host ${bare}`);
  if (!addrs.every((a) => isPublicAddress(a.address))) throw new Refused('that address is not on the internet');
  return addrs;
}

/**
 * A `lookup` for `http.request` that only ever hands the socket checked public addresses.
 *
 * @param resolve - the resolver
 * @returns the lookup function
 */
export function guardedLookup(resolve: Resolve = systemResolve) {
  return (host: string, opts: { all?: boolean } | number, cb: (err: Error | null, address: string | { address: string; family: number }[], family?: number) => void): void => {
    publicAddresses(host, resolve).then(
      (addrs) => {
        if (typeof opts === 'object' && opts.all) cb(null, addrs);
        else cb(null, addrs[0]!.address, addrs[0]!.family);
      },
      (e: Error) => cb(e, ''),
    );
  };
}
