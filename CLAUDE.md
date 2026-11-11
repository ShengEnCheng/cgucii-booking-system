# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A space booking system for Chang Gung University Innovation Incubation Center (長庚大學創新育成中心空間預約系統). Next.js **Pages Router** application with Google Calendar as the single source of truth for reservations. Deployed on **Vercel** (not Netlify — earlier docs were stale).

## Commands

```bash
npm ci            # install from lockfile
npm run dev       # dev server
npm run build     # production build (no credentials needed)
npm start         # production server
npm run lint      # ESLint (next lint)
npm run typecheck # tsc --noEmit
npm run test      # vitest run
npm run test:e2e  # Playwright (builds and starts a production server)
npx -y @lhci/cli@0.14 autorun  # Lighthouse CI (run npm run build first)
```

## Architecture

- **Frontend**: React 18 + TypeScript + Tailwind CSS, FullCalendar for the calendar view.
- **Backend**: Next.js API routes; each request talks to Google Calendar directly (no database).
- **Config persistence**: Vercel KV in production (`KV_REST_API_URL` set), otherwise `src/config/app-config.json` on disk.
- **Auth**: `/admin` and `/api/admin/*` are protected by HTTP Basic Auth in `src/middleware.ts` (`ADMIN_USERNAME` / `ADMIN_PASSWORD`). If unset, the middleware refuses access (fail-closed).

### Key modules

| Path | Role |
| --- | --- |
| `src/utils/configSchema.ts` | AppConfig type, defaults, normalization, disabled-space resolution. **Client-safe, no IO.** |
| `src/utils/appConfig.ts` | Server-only IO for the same config (KV or file) with 10s in-process cache and `degraded` reporting. |
| `src/utils/bookingRules.ts` | Business hours, duration limits, date/time validation, time option generation. Shared by client and server. |
| `src/utils/availabilityUtils.ts` | Space identity (`[SPACE:<id>]` marker) and overlap detection. |
| `src/utils/googleCalendarService.ts` | JWT caching, `events.list` with field masking and page cap, KV distributed lock with owner token. |
| `src/utils/sanitize.ts` | Input cleaning, HTML escaping, applicant extraction. |
| `src/utils/rateLimit.ts` | Fixed-window rate limiting; uses KV `INCR` when configured (shared across instances), otherwise per-instance memory. |
| `src/utils/bookingToken.ts` | HMAC-signed cancel tokens (eventId + spaceId + expiry), origin resolution for cancel URLs. |
| `src/utils/mailer.ts` | Booking/cancel notification email via Resend or a custom webhook. Never throws; booking succeeds even if mail fails. |

### Request flow

`submit-booking`: validate (server-side, config-driven) → reserve local lock → acquire KV lock → pre-check availability → insert event → post-check conflicts → rollback on any failure.

## Non-negotiable conventions

1. **Never use FullCalendar's `html` content**. Build event DOM with `textContent` (`domNodes`) — user input flows into calendar titles, so string-composed HTML is a stored-XSS hole.
2. **Public APIs must not leak PII.** `/api/calendar-events` returns only `id/title/start/end/color/location/applicant/spaceId`; the raw `description` (name, phone, email) must never be returned.
3. **Space identity is structural.** Write `[SPACE:<id>]` into the description and `extendedProperties.private.spaceId`; keyword matching is only a legacy fallback and must ignore free-text lines such as `用途：`.
4. **Disabled state is id-based.** Name-based legacy data is converted by `resolveDisabledSpaceIds()`; never compare against display names directly.
5. **Server never trusts the client** for: space identity, name/id of the room, colorId, capacity limits, business hours, required fields, or the target calendar (`googleCalendarId`).
6. **Sanitize before writing** to Google Calendar and keep field lengths bounded (`FIELD_LIMITS`).
7. **Read config through `readAppConfigMeta()`** when the caller must distinguish "configured empty" from "failed to read". Defaults must never disable rooms or change the calendar target.
8. **Rollback on partial failure**: if an event was inserted, any later error must attempt deletion.
9. All times are `Asia/Taipei` (`+08:00`). Never derive month/day boundaries from the server's local timezone — Vercel runs in UTC.

## Google Calendar Integration

- Service account credentials come from `GOOGLE_CREDENTIALS` (single-line JSON).
- Each space has a `colorId` used for visual differentiation.
- Events are created with `timeZone: 'Asia/Taipei'` and a description carrying booking metadata plus the space marker.
- `CALENDAR_ID` env var can be overridden by the value saved in the admin settings.

## CSP and SSR requirement

`src/middleware.ts` generates a per-request nonce and sets a nonce-based CSP. Next's Pages Router reads the nonce from the response's CSP header and applies it to its scripts; `src/pages/_document.tsx` forwards it. Consequences:

- Every page that should hydrate **must be server-rendered** (`getServerSideProps`). Adding a new static page will break its hydration under CSP.
- `pages/404` and `pages/500` cannot use `getServerSideProps` (Next restriction); their scripts are blocked by CSP, which is acceptable because those pages are static content only.
- `script-src` has no `'unsafe-inline'` in production. Never reintroduce it; fix the code instead.
- `style-src` still needs `'unsafe-inline'` because React `style` props and FullCalendar emit inline styles.

## Testing

`tests/` holds vitest unit tests for availability logic, booking rules, config normalization, sanitization, and rate limiting. CI (`.github/workflows/ci.yml`) runs lint → typecheck → test → build. When changing booking rules, space identity, cancel-token or mailer logic, add or update the corresponding test first. E2E (`npm run test:e2e`) runs against a production build and mocks backend APIs via `page.route()`.

## Security notes

- Never commit credentials. `.gitignore` covers `.env.local`, `credentials.json`, `service-account.json`, `google-credentials.json*`, `cgu-incubation-booking-*.json`.
- If a key was ever committed: rotate it in Google Cloud **first**, then purge history. History rewriting cannot undo an already-public key.
- `src/middleware.ts` sets the nonce-based CSP per document request; `next.config.js` sets the request-invariant headers (`X-Frame-Options`, `Referrer-Policy`, `X-Content-Type-Options`, `Permissions-Policy`).
