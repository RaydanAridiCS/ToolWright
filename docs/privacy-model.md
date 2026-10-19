# Privacy model

> **Tools never send your input anywhere.** This document explains how that is enforced, how to verify it, and the precise limits of the claim.

## The guarantee

1. Every tool runs in the visitor's browser. Text, files and settings are processed by JavaScript on their device.
2. Pages can only connect to their **own origin**. The browser blocks any attempt to contact another server.
3. The site contains no analytics, advertising, fingerprinting or other third-party scripts, fonts or embeds.
4. There are no accounts, and the site sets no cookies.

## Enforcement

### Content Security Policy

Set for every response in `apps/web/next.config.ts`:

```
default-src 'self';
script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
media-src 'self' blob: data:;
font-src 'self' data:;
connect-src 'self';
worker-src 'self' blob:;
manifest-src 'self';
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
upgrade-insecure-requests
```

`connect-src 'self'` blocks `fetch`, XHR, WebSocket and beacons to other origins; `img-src` / `font-src` / `script-src` block third-party images, fonts and scripts; `form-action` stops forms from posting elsewhere; `frame-ancestors 'none'` plus `X-Frame-Options: DENY` prevent clickjacking. (`'unsafe-inline'` is required by Next.js's small inline bootstrap scripts; nonce-based CSP is a possible future hardening.)

Other headers: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` disabling camera, microphone, geolocation, payment and USB, and `Cross-Origin-Opener-Policy: same-origin`.

### Code conventions

- Tools do not call `fetch`. The only `fetch` calls in the codebase are in `apps/web/src/lib/request-client.ts` (request board) and the service worker.
- `packages/core` is free of DOM and network APIs.
- Shareable state lives in the URL **fragment** (`#s=…`). Browsers never include fragments in HTTP requests or `Referer` headers.
- Tools handling secrets (JWTs, passwords, API keys, Wi-Fi passwords) keep that data in component state, not the URL.
- User-supplied HTML (Markdown preview) is sanitized with DOMPurify before insertion; SVG output is generated from controlled values; SVG input is rendered via `<img>`, which cannot run scripts.

### Automated verification (`e2e/privacy.spec.ts`)

- Security headers exist on pages and tool pages.
- The browser actually **blocks** a cross-origin `fetch` (a `securitypolicyviolation` event is observed).
- Visiting **every tool page** produces **zero** requests to other origins.
- A unique canary string typed into several tools never appears in any request URL or body.
- The URL hash is not sent on reload; no cookies are set.
- File workflows (merge PDF, compress image) make no external requests and no non-GET requests.

## Verify it yourself in 60 seconds

1. Open any tool, then your browser's developer tools → **Network** tab; clear it.
2. Use the tool with some data or a file. No request carries your input.
3. Optional: switch to airplane mode after the page loads. Opened tools keep working.

## What is stored on the visitor's device

All in `localStorage`, never transmitted:

| Key | Purpose |
| --- | --- |
| `tw-theme` | Light / dark / system |
| `tw-favorites`, `tw-recents` | Starred and recently used tools |
| `tw-token` | Random anonymous code for the request board (created on first use) |
| Service worker cache | Site files for offline use |

## What reaches the server

| Data | When | Notes |
| --- | --- | --- |
| Standard HTTP request metadata | Every page load | Handled by the hosting platform's normal logs (may include IP, user agent). Contains no tool input. |
| Request-board submissions | Only when a visitor submits or votes | Title/description the visitor typed + SHA-256 hash of their anonymous token (`creator_hash`, `voter_hash`). No email, name or IP stored by the app. |

Hashes are domain-separated (`toolwright:creator:<token>` vs `toolwright:voter:<token>`) so a creator hash can't be linked to a voter hash.

## Limits of the claim (be honest in docs and UI copy)

- A compromised device, malicious browser extension, or a hostile browser can read anything on the page. No website can prevent that.
- Share links contain the shared input. They are opt-in and visible in the address bar.
- The hosting provider can see ordinary access logs. The app does not add tracking to them.
- Browser-provided crypto (`crypto.subtle`, `getRandomValues`) is trusted. We do not implement our own CSPRNG; MD5 and CRC are implemented locally because Web Crypto does not provide them.
- ROT13, Caesar and Morse are not security. They are labelled as such.
- Metadata removal covers the formats and segments documented in `packages/core/src/image-meta.ts` (JPEG APPn/COM, PNG text/EXIF/time, WebP EXIF/XMP). Re-encoding (e.g. through the compressor) removes metadata as a side effect.

## Reporting a problem

If you find a request that carries user input, a missing header, or copy that overstates the model, treat it as a high-priority bug. See [SECURITY.md](../SECURITY.md).
