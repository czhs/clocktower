// Security response headers (v2.3, sec-web: WEB-2/3/4). Used by app.ts on every response.
//
// - CSP: same-origin everything; LiveKit is allowed for the configured LIVEKIT_URL host (WEB-4: no
//   `*.livekit.cloud`). For a LiveKit Cloud URL the regional fail-over hosts
//   (`*.production.livekit.cloud`) are allowed too, so voice survives a region outage (see
//   livekitOrigins). Non-cloud URLs: exact host only.
// - COOP same-origin (no opener handle for other sites: XS-Leaks / tab-nabbing) and CORP
//   same-origin (no cross-site embedding of /api JSON, art, audio), except the public link-preview
//   images, which chat apps / social sites may hot-link from their own origin (WEB-3).
// - Permissions-Policy denies every powerful feature except the microphone for ourselves (voice).
//   No COEP: it would add nothing here and risks LiveKit/fonts.
// - No upgrade-insecure-requests / HSTS on http origins: the local Docker preview and dev run on
//   http://localhost.
import type { RequestHandler } from 'express';

export interface SecurityHeaderOptions {
  /** APP_PUBLIC_ORIGIN; https enables HSTS. */
  publicOrigin: string;
  /** LIVEKIT_URL ('' = voice not configured). */
  livekitUrl: string;
  /** WEB-2: enforce Trusted Types (no DOM HTML/script sinks). (v2.3 sec-ops) a getter = live admin setting 'web.trustedTypes'. */
  trustedTypes?: boolean | (() => boolean);
}

/** Origins (ws + http flavours) of the configured LiveKit server, or [] when unset/invalid. */
export function livekitOrigins(livekitUrl: string): string[] {
  if (!livekitUrl) return [];
  let u: URL;
  try {
    u = new URL(livekitUrl);
  } catch {
    return [];
  }
  const secure = u.protocol === 'wss:' || u.protocol === 'https:';
  if (!secure && u.protocol !== 'ws:' && u.protocol !== 'http:') return [];
  // host only (no path/query/userinfo); a CSP host-source must not contain ';' ',' or spaces
  if (!/^[A-Za-z0-9.-]+(:\d+)?$/.test(u.host) && !/^\[[0-9a-fA-F:]+\](:\d+)?$/.test(u.host)) return [];
  const exact = [`${secure ? 'wss' : 'ws'}://${u.host}`, `${secure ? 'https' : 'http'}://${u.host}`];
  // LiveKit Cloud: livekit-client 2.22 always enables region fail-over for *.livekit.cloud URLs (no
  // option to turn it off) and reconnects to `<project>.<region>.production.livekit.cloud`. CSP
  // wildcards only cover a whole leftmost label, so the project-scoped regional pattern cannot be
  // expressed; the regional zone is allowed as a whole (accepted residual of WEB-4, mitigated by
  // Trusted Types + no HTML sinks: an attacker first needs script execution).
  if (secure && u.hostname.toLowerCase().endsWith('.livekit.cloud')) exact.push('wss://*.production.livekit.cloud', 'https://*.production.livekit.cloud');
  return exact;
}

export function contentSecurityPolicy(opts: SecurityHeaderOptions): string {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self'",
    ["connect-src 'self'", ...livekitOrigins(opts.livekitUrl)].join(' '),
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...((typeof opts.trustedTypes === 'function' ? opts.trustedTypes() : opts.trustedTypes) ? ["require-trusted-types-for 'script'", "trusted-types 'none'"] : []),
  ].join('; ');
}

export const PERMISSIONS_POLICY = [
  'microphone=(self)',
  'camera=()',
  'geolocation=()',
  'payment=()',
  'usb=()',
  'serial=()',
  'hid=()',
  'bluetooth=()',
  'midi=()',
  'display-capture=()',
  'screen-wake-lock=()',
  'idle-detection=()',
  'local-fonts=()',
  'publickey-credentials-get=()',
  'publickey-credentials-create=()',
  'otp-credentials=()',
  'identity-credentials-get=()',
  'browsing-topics=()',
  'attribution-reporting=()',
  'accelerometer=()',
  'gyroscope=()',
  'magnetometer=()',
  'xr-spatial-tracking=()',
].join(', ');

/** Public images that link previews (Open Graph / Twitter cards) and icon fetchers may embed. */
const CROSS_ORIGIN_OK = /^\/(og-image\.jpg|favicon\.png|landing\/emblem-\d+\.png)$/;

export function securityHeaders(opts: SecurityHeaderOptions): RequestHandler {
  // Both CSP variants are built once; a live Trusted Types setting picks one per response.
  const cspOn = contentSecurityPolicy({ ...opts, trustedTypes: true });
  const cspOff = contentSecurityPolicy({ ...opts, trustedTypes: false });
  const tt = opts.trustedTypes;
  const csp = () => ((typeof tt === 'function' ? safeGet(tt) : tt) ? cspOn : cspOff);
  const hsts = opts.publicOrigin.startsWith('https://');
  return (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', csp());
    res.setHeader('Permissions-Policy', PERMISSIONS_POLICY);
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', CROSS_ORIGIN_OK.test(req.path) ? 'cross-origin' : 'same-origin');
    if (hsts) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    next();
  };
}

/** A failing getter keeps the protection ON (fail closed). */
function safeGet(fn: () => boolean): boolean {
  try {
    return fn() !== false;
  } catch {
    return true;
  }
}
