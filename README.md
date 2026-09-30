# SidFast

Self-hosted, revenue-first web analytics — a small DataFast-style tool you and
your friends can run yourselves.

- **Privacy-friendly** — no third-party requests, data stays in your SQLite file
- **Revenue attribution** — payments are tied back to the visit (source, campaign, referrer)
- **Goals & funnels** — signups, checkouts, custom events
- **UTM breakdowns** — source / medium / campaign with revenue attached
- **Live visitors** — 5-minute realtime feed
- **Google Search Console** — organic queries and positions beside your traffic
- **Billing** — free + $12/mo Pro, Stripe and four alternative checkout providers
- **Shared dashboards** — read-only public link per site
- **Teams** — invite friends by email with viewer / editor roles
- **Light & dark theme**

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3000, create an account, then **Add website** (the
"seed with sample data" checkbox fills the dashboard so you can see it working).

```bash
npm run build && npm start   # production
npm run typecheck            # tsc --noEmit
```

The database is a single file at `data/sidfast.db` (WAL mode). Point it
somewhere else with `SIDFAST_DB=my.db`.

Copy `.env.example` to `.env.local` — every variable is optional, so the app
runs with none of them. Set them as you switch features on.

## Deploying (Vercel or anything Node-shaped)

1. **Database.** The Vercel filesystem is read-only and ephemeral, so create a
   Turso database and set `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`. The schema
   creates itself on first request. Locally, leave both unset and SQLite is used.
2. **URL.** Set `APP_URL` to your real origin (used in emails, OAuth redirects
   and the billing return URLs).
3. `vercel deploy` (or connect the repo in the dashboard), then add the env vars.

## Adding the tracking script

```html
<script defer src="https://your-host/t.js?site=s_your_token"></script>
```

The snippet is shown on each site's **Settings** tab. It:

- assigns a first-party visitor id (1 year) and a sliding 30-minute session id
- records pageviews, including SPA route changes (`pushState` / `popstate`)
- sends referrer, UTM params, screen size; browser/OS/device/country are
  derived server-side from the request
- ignores bots
- ships via `navigator.sendBeacon` (no CORS preflight) with a `fetch` fallback

## Goals

```js
sidfast("goal", "signup");
sidfast("goal", { name: "newsletter", list: "weekly" });
```

## Revenue

Client side (after a successful checkout):

```js
sidfast("payment", { amount: 49, currency: "USD", email: "a@b.com" });
```

Server side (recommended — works even if the tracker is blocked):

```bash
curl -X POST https://your-host/api/sites/SITE_ID/payments \
  -H 'Content-Type: application/json' \
  -d '{"key":"s_your_token","amount":49,"email":"a@b.com","goal":"purchase"}'
```

Payments are attributed to the visitor's **first touch** (UTM / referrer) and
**last touch**, so the Revenue tab can show which channel actually earns money.

## Plans & billing

| | Free | Pro |
| --- | --- | --- |
| Websites | 3 | unlimited |
| Data retention | 12 months | 5 years |
| Price | $0 | $12 / month |

Plan limits are enforced in `POST /api/sites` (402 over the limit) and by
clamping every stats query to the plan's retention window.

**Stripe** (recommended — self-serve checkout + customer portal):

1. Create a Product with a recurring $12/mo Price; put the price id in
   `STRIPE_PRO_PRICE_ID` and the secret key in `STRIPE_SECRET_KEY`.
2. Add an endpoint for `https://your-host/api/stripe/webhook` with events
   `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`,
   `customer.deleted`; put its signing secret in `STRIPE_WEBHOOK_SECRET`.
3. The **Upgrade** button in the dashboard header opens hosted Checkout;
   **Manage billing** opens the Stripe customer portal.

**Other providers** — same idea, one endpoint each, all of them verify a
signature before touching the database:

| Provider | Endpoint | Env var | Signature |
| --- | --- | --- | --- |
| Polar | `POST /api/webhooks/polar` | `POLAR_WEBHOOK_SECRET` | `webhook-id` / `webhook-timestamp` / `webhook-signature` |
| Dodo | `POST /api/webhooks/dodo` | `DODO_WEBHOOK_SECRET` | same as Polar |
| Lemon Squeezy | `POST /api/webhooks/lemonsqueezy` | `LEMONSQUEEZY_WEBHOOK_SECRET` | `x-signature` (hex HMAC) |
| Razorpay | `POST /api/webhooks/razorpay` | `RAZORPAY_WEBHOOK_SECRET` | `x-razorpay-signature` (hex HMAC) |

They resolve the account by the `user_id` metadata you pass at checkout time,
falling back to the customer email. Unknown accounts are logged and ignored.

## Email

Transactional mail goes through **Resend**: set `RESEND_API_KEY` and
`RESEND_FROM`. Without a key everything still works — the welcome mail is
skipped and password-reset links are printed to the server log instead.

- welcome mail on signup
- password reset (`Forgot password?` → `/reset?token=…`, valid 60 minutes,
  single use, revokes all existing sessions)

## Google Search Console

Set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` and register
`{APP_URL}/api/integrations/google/callback` as an authorized redirect URI in
the Google Cloud console (consent screen + **Web Search Console API** enabled).
Then open a site's **SEO** tab and connect. Read-only scope, tokens are stored
per user + site and refreshed automatically; the chosen property
(`sc-domain:…` first, then URL variants) is cached on the integration row.

## Sharing & teams

- **Share link** (`/share/:id`) — public read-only dashboard, per site
- **Team** (Settings tab) — invite any existing account as `viewer` or `editor`

## API surface

| Route | Purpose |
| --- | --- |
| `POST /api/collect` | ingestion (JSON, `text/plain` beacon, or query-string GET) |
| `POST /api/sites/:id/payments` | server-side revenue, auth = site token |
| `GET /api/sites/:id/stats?from&to` | full dashboard payload |
| `GET /api/sites/:id/stats?view=realtime` | 5-minute live feed |
| `GET /api/share/:shareId` | public read-only payload |
| `GET /api/sites/:id/seo?from&to` | Google Search Console clicks/queries |
| `POST /api/auth/signup \| login \| logout` | email + password sessions |
| `POST /api/auth/forgot \| reset` | password reset (email or logged link) |
| `POST /api/stripe/checkout \| portal \| sync` | billing for signed-in users |
| `POST /api/stripe/webhook` | Stripe events |
| `POST /api/webhooks/:provider` | Polar / Lemon Squeezy / Razorpay / Dodo |

## Security

- **Passwords** — scrypt (`N=32768, r=8, p=1`, ~32 MiB per guess) with a
  per-password salt and a constant-time compare; parameters are stored with the
  hash so they can be raised later. Login runs a dummy verification for unknown
  addresses so response timing cannot be used to enumerate accounts.
- **Session & reset tokens** — 32 random bytes; only `sha256:<digest>` is
  stored, so a leaked database yields no replayable credentials. Existing
  plaintext rows are re-hashed automatically at boot.
- **OAuth tokens** (Google) — AES-256-GCM with a key derived from `APP_SECRET`.
- **Rate limiting** — database-backed fixed windows on login / signup /
  forgot / reset, per IP and per email, answered with `429` + `Retry-After`.
- **Headers** — CSP, `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy`, COOP/CORP, plus HSTS in production.
- **Cookies** — `httpOnly`, `SameSite=Lax`, `Secure` whenever the origin is
  https.
- **Webhooks** — every provider signature is verified before a row is written.
- **Repo hygiene** — `.env`, `.env.*`, `data/`, `*.db` and key files are
  gitignored; only `.env.example` (a template) is committed.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind v4 · better-sqlite3 (or Turso
via libsql) · Stripe · hand-rolled SVG charts (no chart dependency).

```
src/lib        db schema, auth, plans, billing, ingestion, stats, demo seeder
src/app        routes + API handlers
src/components dashboard, charts, landing page, billing, SEO panel
public/t.js    the tracking script
```
