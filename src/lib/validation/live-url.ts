import { lookup } from "node:dns/promises";
import net from "node:net";

/**
 * Live-URL mode: DemoForge screenshots a team's already-running site instead of
 * installing and starting their repo. The URL is fetched by our headless browser,
 * so it must not be usable to reach this machine or its private network (SSRF).
 *
 * Blocked by default: localhost, loopback, link-local (incl. cloud metadata
 * 169.254.169.254), private ranges, CGNAT, multicast/reserved, IPv6 equivalents.
 * Set DEMOFORGE_ALLOW_PRIVATE_URLS=1 to allow private-network addresses (e.g. a
 * team's laptop on the venue Wi-Fi) when DemoForge runs on your own machine.
 */

export interface LiveUrl {
  /** Normalised URL (no credentials, no fragment). */
  url: string;
  origin: string;
  /** Path to start from, e.g. "/" or "/app". */
  path: string;
}

const allowPrivate = () => process.env.DEMOFORGE_ALLOW_PRIVATE_URLS === "1";

export function parseLiveUrl(input: string): LiveUrl {
  let s = input.trim();
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw new Error("The live site URL doesn't look like a URL.");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("The live site URL must start with http:// or https://.");
  if (u.username || u.password) throw new Error("Live site URLs with credentials are not allowed.");
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) throw new Error("The live site URL has no host.");
  if (!allowPrivate()) {
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal"))
      throw new Error("That address is on a local network. Use the team's public deployed URL (e.g. a vercel.app or netlify.app link).");
    if (net.isIP(host) && isBlockedIp(host))
      throw new Error("That address is on a local or private network. Use the team's public deployed URL.");
  }
  u.hash = "";
  const path = u.pathname || "/";
  return { url: u.toString(), origin: u.origin, path };
}

/** Resolves the hostname and rejects it if any address is private (DNS can point anywhere). */
export async function assertPublicLiveUrl(live: LiveUrl): Promise<void> {
  if (allowPrivate()) return;
  const host = new URL(live.url).hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host)) return; // already checked in parseLiveUrl
  let addrs: { address: string }[];
  try {
    addrs = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new Error(`Couldn't find ${host}. Check the live site URL.`);
  }
  if (!addrs.length || addrs.some((a) => isBlockedIp(a.address)))
    throw new Error("That address points to a local or private network. Use the team's public deployed URL.");
}

export function isBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) return blockedV4(ip);
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return blockedV4(mapped[1]);
    // URL parsing rewrites ::ffff:127.0.0.1 as ::ffff:7f00:1, so decode the hex form too.
    const hex = v.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hex) {
      const hi = parseInt(hex[1], 16);
      const lo = parseInt(hex[2], 16);
      return blockedV4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    return (
      v === "::" ||
      v === "::1" ||
      /^fe[89ab]/.test(v) || // link-local fe80::/10
      /^f[cd]/.test(v) || // unique local fc00::/7
      /^ff/.test(v) || // multicast
      v.startsWith("64:ff9b:") || // NAT64
      v.startsWith("2001:db8:") // documentation
    );
  }
  return true;
}

function blockedV4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local / cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multicast + reserved
  );
}
