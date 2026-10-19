# Maintainer notes

Operational details for people who run the official toolwright.com deployment or cut releases.

## Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | build | Canonical URL for metadata, sitemap and Open Graph (default `https://toolwright.com`) |
| `NEXT_PUBLIC_REPO_URL` | build | Link target for the GitHub buttons |
| `DATABASE_URL` | runtime | Postgres connection string for the request board. If unset, an in-memory store is used and the UI shows a demo-mode notice. |

`NEXT_PUBLIC_*` values are inlined at build time.

## Database

- Schema lives in `packages/db/src/schema.ts`; SQL migrations are generated into `packages/db/drizzle/` and **committed**.
- Create a migration: `npm run db:generate`. Apply: `DATABASE_URL=… npm run db:migrate`.
- Review the generated SQL before committing. CI applies every migration to an in-process Postgres (PGlite) in the test suite.
- Use a pooled connection string on serverless platforms. The app opens one connection per instance (`max: 1`, `prepare: false` for pooler compatibility).

### Moderating the request board

There is no admin UI by design (no accounts to protect). Use SQL:

```sql
-- change a status
update tool_requests set status = 'planned' where id = '…';
-- remove spam (votes cascade)
delete from tool_requests where id = '…';
-- see what's popular
select r.title, count(v.*) as votes
from tool_requests r left join tool_request_votes v on v.request_id = r.id
group by r.id order by votes desc limit 20;
```

## Hosting requirements

The site is a standard Next.js app: static pages plus two small Node route handlers. Any host that supports Next.js 16 works. Requirements to preserve the privacy model:

- Serve the headers from `next.config.ts` unmodified (especially `Content-Security-Policy`). If a proxy or CDN adds scripts (analytics, "email obfuscation", bot-challenge widgets), that breaks the CSP and the promise. Disable such features or update the policy deliberately and document it on the privacy page.
- Do not add third-party analytics. If aggregate stats are ever wanted, use a cookieless, first-party approach and update `/privacy` first.
- `/sw.js` must be served with `Cache-Control: no-cache` (already configured) so service-worker updates roll out.

## Releasing

1. Make sure `main` is green: lint, typecheck, unit tests, e2e (including accessibility).
2. `npm run docs:tools` and commit if `docs/tools.md` changed.
3. Bump `CACHE_VERSION` in `apps/web/public/sw.js` **only** if the caching strategy changed (build assets are content-hashed, so normal releases don't need it).
4. Tag the release (`vX.Y.Z`) and publish release notes grouped as *New tools · Improvements · Fixes*.
5. After deploy, spot-check: `/`, a tool page, `/requests`, `/sitemap.xml`, and the response headers (`curl -I https://toolwright.com/`).

## Dependency hygiene

- Review updates monthly. Prefer small, widely-used libraries. Current runtime dependencies of note: `pdf-lib` (PDF), `qrcode`, `marked` + `dompurify` (Markdown), `diff`, `js-yaml`, `papaparse`, `sql-formatter`, `cronstrue`, `exifr`, `fflate`, `@scure/bip39` (passphrase word list), `cmdk`, `zod`, `drizzle-orm`, `postgres`.
- Anything that handles untrusted input (`marked`, `dompurify`, `js-yaml`, `pdf-lib`, `exifr`) deserves prompt security updates.
- `npm audit` runs against the lockfile; investigate anything reachable from user input.

## Monitoring ideas

The app intentionally has no telemetry. For uptime, a simple external check on `/` and `/api/requests` is enough. Build-time and bundle-size regressions can be watched with `next build` output in CI.
