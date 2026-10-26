/**
 * Video source providers for "Import from link".
 *
 * A provider recognises a URL, explains what it can do, and (only where a supported, authorised
 * mechanism exists) resolves it to a fetchable media URL. Nothing here scrapes provider web apps,
 * bypasses sign-in, extracts protected streams or stores user passwords.
 *
 *  - veo           Veo match pages (app.veo.co/matches/...). Veo offers no self-serve public API
 *                  (its Public API is a selected-partner programme). Supported path: the team
 *                  member/admin downloads the follow-cam MP4 in Veo and uploads it here, or shares
 *                  a direct HTTPS link to that exported file. A partner integration can be plugged
 *                  in via `VEO_PARTNER_API_BASE` once a contract exists; it is NOT configured.
 *  - direct_https  A direct HTTPS link to a video file the user is allowed to share. Hardened
 *                  against SSRF: https on port 443 only, no URL credentials, every redirect hop
 *                  re-validated, all resolved addresses must be public unicast.
 */

import { isIP } from 'node:net';

export type ProviderId = 'veo' | 'direct_https' | 'unsupported';

export type SourceStatus =
  | 'ready'                     // media URL validated; import can start
  | 'requires_export'           // provider page, not media: user must export/download first
  | 'partner_access_required'   // a provider integration exists in principle but is not configured
  | 'invalid'                   // malformed / disallowed URL
  | 'unreachable'               // network / HTTP failure
  | 'not_video'                 // reachable but not a video file
  | 'too_large';                // exceeds the plan's size limit

export type SourceInspection = {
  provider: ProviderId;
  status: SourceStatus;
  /** Machine-readable reason for the app to translate. */
  reason: string;
  /** Permitted metadata only (never credentials). */
  metadata: Record<string, string | number | null>;
  /** Final validated media URL (direct_https + ready only). Never returned to other users. */
  mediaUrl?: string;
  /** Actionable steps the app shows for requires_export / partner_access_required. */
  steps?: string[];
};

export const VEO_EXPORT_STEPS = [
  'Open the match in the Veo app (app.veo.co) with an account that belongs to the team or club.',
  'Choose Download → "Download full game" (follow-cam MP4). Panorama views cannot be downloaded from Veo.',
  'Upload the downloaded MP4 in PitchProof, or paste a direct HTTPS link to the exported file.',
];

const VEO_HOSTS = new Set(['app.veo.co', 'veo.co', 'www.veo.co']);
const VIDEO_TYPES = /^(video\/(mp4|quicktime|x-m4v|webm|x-matroska)|application\/octet-stream)$/i;
const MAX_REDIRECTS = 3;
const MAX_URL_LENGTH = 2048;

export function parseUrl(raw: string): URL | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_URL_LENGTH) return null;
  try {
    return new URL(raw.trim());
  } catch {
    return null;
  }
}

export function recognise(raw: string): ProviderId {
  const url = parseUrl(raw);
  if (!url) return 'unsupported';
  if (VEO_HOSTS.has(url.hostname.toLowerCase())) return 'veo';
  if (url.protocol === 'https:') return 'direct_https';
  return 'unsupported';
}

/** Veo match slug: "20260823-fc-pfaffikon-fc-dubendorf-...-v13121b4" -> date + title words. */
export function veoMetadata(url: URL): Record<string, string | number | null> {
  const match = /^\/matches\/([a-z0-9-]{3,200})\/?$/i.exec(url.pathname);
  if (!match) return { matchSlug: null, recordedOn: null, title: null };
  const slug = match[1];
  const date = /^(\d{4})(\d{2})(\d{2})-/.exec(slug);
  const words = slug.replace(/^\d{8}-/, '').replace(/-v[0-9a-f]{6,}$/i, '').split('-').filter(Boolean);
  return {
    matchSlug: slug,
    recordedOn: date ? `${date[1]}-${date[2]}-${date[3]}` : null,
    title: words.length ? words.join(' ') : null,
  };
}

// ----------------------------------------------------------------------------- SSRF guards

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

const BLOCKED_V4: Array<[string, number]> = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
];

export function isPublicAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) {
    const value = ipv4ToInt(ip);
    return !BLOCKED_V4.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (value & mask) === (ipv4ToInt(base) & mask);
    });
  }
  if (kind === 6) {
    const v = ip.toLowerCase();
    if (v === '::' || v === '::1') return false;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
    if (mapped) return isPublicAddress(mapped[1]);
    // fc00::/7 unique-local, fe80::/10 link-local, ff00::/8 multicast, 2001:db8::/32 documentation
    if (/^f[cd]/.test(v) || /^fe[89ab]/.test(v) || v.startsWith('ff') || v.startsWith('2001:db8')) return false;
    return true;
  }
  return false;
}

export type Resolver = (hostname: string) => Promise<string[]>;

export async function defaultResolver(hostname: string): Promise<string[]> {
  const { lookup } = await import('node:dns/promises');
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
}

/** Validates one hop. Returns a reason code when the URL must not be fetched. */
export async function checkFetchable(url: URL, resolve: Resolver = defaultResolver): Promise<string | null> {
  if (url.protocol !== 'https:') return 'https_required';
  if (url.username || url.password) return 'credentials_in_url';
  if (url.port && url.port !== '443') return 'port_not_allowed';
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return 'host_not_allowed';
  if (host === 'metadata.google.internal') return 'host_not_allowed';
  let addresses: string[];
  if (isIP(host)) addresses = [host];
  else {
    try {
      addresses = await resolve(host);
    } catch {
      return 'dns_failed';
    }
  }
  if (addresses.length === 0) return 'dns_failed';
  if (!addresses.every(isPublicAddress)) return 'private_address';
  return null;
}

export type HeadResult = { status: number; headers: Record<string, string> };
export type HeadFetcher = (url: string) => Promise<HeadResult>;

export async function defaultHead(url: string): Promise<HeadResult> {
  const response = await fetch(url, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(10_000) });
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  return { status: response.status, headers };
}

export type InspectOptions = {
  maxBytes: number;
  resolve?: Resolver;
  head?: HeadFetcher;
  env?: NodeJS.ProcessEnv;
};

export async function inspectSource(raw: string, options: InspectOptions): Promise<SourceInspection> {
  const provider = recognise(raw);
  const url = parseUrl(raw);
  if (!url || provider === 'unsupported') {
    return { provider: 'unsupported', status: 'invalid', reason: 'unsupported_url', metadata: {} };
  }
  if (provider === 'veo') {
    const metadata = veoMetadata(url);
    if (!metadata.matchSlug) return { provider, status: 'invalid', reason: 'veo_not_a_match_link', metadata };
    const partner = (options.env ?? process.env).VEO_PARTNER_API_BASE?.trim();
    return partner
      ? { provider, status: 'partner_access_required', reason: 'veo_partner_authorisation_required', metadata, steps: VEO_EXPORT_STEPS }
      : { provider, status: 'requires_export', reason: 'veo_no_public_api', metadata, steps: VEO_EXPORT_STEPS };
  }
  const resolve = options.resolve ?? defaultResolver;
  const head = options.head ?? defaultHead;
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const blocked = await checkFetchable(current, resolve);
    if (blocked) return { provider, status: 'invalid', reason: blocked, metadata: {} };
    let response: HeadResult;
    try {
      response = await head(current.toString());
    } catch {
      return { provider, status: 'unreachable', reason: 'network_error', metadata: {} };
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.location;
      const next = location ? parseUrl(new URL(location, current).toString()) : null;
      if (!next) return { provider, status: 'unreachable', reason: 'bad_redirect', metadata: {} };
      current = next;
      continue;
    }
    if (response.status !== 200) {
      return { provider, status: 'unreachable', reason: `http_${response.status}`, metadata: {} };
    }
    const type = (response.headers['content-type'] ?? '').split(';')[0].trim();
    const length = Number(response.headers['content-length'] ?? NaN);
    const metadata = { contentType: type || null, bytes: Number.isFinite(length) ? length : null, host: current.hostname };
    if (!VIDEO_TYPES.test(type)) return { provider, status: 'not_video', reason: 'content_type', metadata };
    if (!Number.isFinite(length)) return { provider, status: 'invalid', reason: 'size_unknown', metadata };
    if (length > options.maxBytes) return { provider, status: 'too_large', reason: 'plan_size_limit', metadata };
    return { provider, status: 'ready', reason: 'ok', metadata, mediaUrl: current.toString() };
  }
  return { provider, status: 'unreachable', reason: 'too_many_redirects', metadata: {} };
}
