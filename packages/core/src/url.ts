/** URL parsing and building. */

export interface ParsedUrl {
  href: string;
  protocol: string;
  username: string;
  password: string;
  host: string;
  hostname: string;
  port: string;
  origin: string;
  pathname: string;
  search: string;
  hash: string;
  params: { key: string; value: string }[];
}

export function parseUrl(input: string): ParsedUrl | null {
  const text = input.trim();
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    // Already has a scheme but still invalid (e.g. "http://"): don't try to prefix another one.
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return null;
    try {
      url = new URL(`https://${text}`);
    } catch {
      return null;
    }
  }
  return {
    href: url.href,
    protocol: url.protocol,
    username: url.username,
    password: url.password,
    host: url.host,
    hostname: url.hostname,
    port: url.port,
    origin: url.origin,
    pathname: url.pathname,
    search: url.search,
    hash: url.hash,
    params: Array.from(url.searchParams, ([key, value]) => ({ key, value })),
  };
}

export function buildQuery(params: { key: string; value: string }[]): string {
  const sp = new URLSearchParams();
  for (const { key, value } of params) if (key) sp.append(key, value);
  return sp.toString();
}

export interface UtmParams {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
}

/** Append UTM parameters to a URL, preserving existing query parameters and hash. */
export function addUtm(url: string, utm: UtmParams): string {
  const parsed = new URL(url);
  const map: [string, string | undefined][] = [
    ["utm_source", utm.source],
    ["utm_medium", utm.medium],
    ["utm_campaign", utm.campaign],
    ["utm_term", utm.term],
    ["utm_content", utm.content],
  ];
  for (const [key, value] of map) if (value) parsed.searchParams.set(key, value);
  return parsed.toString();
}

const TRACKING = /^(utm_[a-z]+|fbclid|gclid|dclid|msclkid|mc_eid|mc_cid|igshid|yclid|_hsenc|_hsmi|ref_src|ref)$/i;

/** Remove common tracking parameters. */
export function stripTracking(url: string): string {
  const parsed = new URL(url);
  for (const key of Array.from(parsed.searchParams.keys())) if (TRACKING.test(key)) parsed.searchParams.delete(key);
  return parsed.toString();
}
