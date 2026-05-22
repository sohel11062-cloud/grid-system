# THE GRID

Production-grade cyberpunk loyalty system for a fashion-tech brand, built with Next.js, Tailwind, Framer Motion, Three.js, secure serverless API routes, the official Wix Headless SDK, and Wix admin APIs.

## What This Build Includes

- Secure Wix Headless member sign-in using the official Wix SDK, Wix-managed login, and PKCE.
- Backend-only Wix API access for members, contacts, orders, and coupon creation.
- Loyalty ledger persisted in MongoDB with:
  - `₹1 spent = 1 Cred`
  - `+5000` Creds on first synced account creation
  - `+5000` Creds once per birthday year
- Dynamic tier engine:
  - `THE_GLITCH`
  - `NETRUNNER`
  - `SYS-ADMIN`
  - `THE_ARCHITECT`
  - `THE_SINGULARITY`
- Manual sync plus scheduled 24-hour sync via Vercel cron.
- Redemption flow with coupon generation and tracked coupon ledger.
- Persistent user, ledger, redemption, audit, admin-action, sync-job, and leaderboard-snapshot collections in MongoDB.
- Cached global leaderboard with pagination, rank movement, global stats, and fraud-hold filtering.
- Separate `/admin` owner console for Cred adjustments, campaigns, events, rank overrides, moderation, reconciliation, coupon review, redemption review, and audit visibility.
- Immersive 3D cyberpunk interface with a holographic scene, glass panels, and responsive dashboards.

## Architecture

- Frontend: Next.js App Router, Tailwind CSS, Framer Motion, and a lazy-loaded Three.js scene.
- Backend: Next.js serverless API routes under `src/app/api/*`.
- Server layer: all Wix SDK auth, admin API, session, database, and loyalty logic lives under `src/server/*`.
- Database: MongoDB Atlas recommended. Production persistence uses `users`, `ledgers`, `coupons`, `leaderboard_snapshots`, `redemptions`, `admin_actions`, `audit_logs`, and `sync_jobs`.

## Project Structure

```text
.
├── src
│   ├── app
│   │   ├── api
│   │   │   ├── auth
│   │   │   │   ├── exchange/route.ts
│   │   │   │   ├── login/route.ts
│   │   │   │   └── logout/route.ts
│   │   │   ├── cron/sync/route.ts
│   │   │   ├── dashboard/route.ts
│   │   │   ├── health/route.ts
│   │   │   ├── redeem/route.ts
│   │   │   └── sync/route.ts
│   │   ├── auth/callback/page.tsx
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components
│   │   ├── animated-counter.tsx
│   │   ├── grid-experience.tsx
│   │   └── hologram-scene.tsx
│   ├── lib
│   │   ├── grid.ts
│   │   └── utils.ts
│   └── server
│       ├── auth-service.ts
│       ├── coupon-service.ts
│       ├── env.ts
│       ├── errors.ts
│       ├── grid-service.ts
│       ├── http.ts
│       ├── require-session.ts
│       ├── security.ts
│       ├── session.ts
│       ├── storage/repository.ts
│       ├── wix-headless-client.ts
│       └── wix.ts
├── .env.example
├── next.config.mjs
├── package.json
├── postcss.config.mjs
├── README.md
├── tailwind.config.ts
├── tsconfig.json
└── vercel.json
```

## Wix Setup

Before running the app, configure Wix Headless and admin access:

1. Create a Wix Headless OAuth app for visitors and members.
2. Publish the connected Wix site. Wix-managed login pages require the site to be published.
3. Add this redirect URI in your Wix OAuth app:
   - `https://your-frontend-domain.com/auth/callback`
4. Leave the Wix OAuth app `Login URL` empty when using Wix-managed login.
5. Generate an API key with at least these permissions:
   - `Read Members`
   - `Read Contacts`
   - `Read Orders`
   - `Manage Coupons`
   - `View SEO Settings`
6. Copy your:
   - `Client ID`
   - `API key`
   - `Site ID`

## Environment Variables

Copy `.env.example` to `.env.local` and fill in the values.

### Core runtime

- `APP_URL`: public frontend URL. Used to generate the Wix callback URL.
- `NEXT_PUBLIC_API_BASE_URL`: optional. Leave blank for same-origin Vercel deploys. Set it if the frontend and API are split.
- `ALLOWED_ORIGIN`: frontend origin allowed to call the API cross-origin.
- `SESSION_SECRET`: 32+ character secret used to encrypt HttpOnly session cookies.
- `CRON_SECRET`: secret for the scheduled sync route.
- `ADMIN_EMAILS`: comma-separated Wix member emails that bootstrap as owner/admin.
- `ADMIN_MEMBER_IDS`: comma-separated Wix member IDs that bootstrap as owner/admin.

### Cookie strategy

- `COOKIE_DOMAIN`: optional. Use a parent domain like `.thegrid.com` if frontend and API run on sibling subdomains.
- `COOKIE_SAME_SITE`: `lax`, `strict`, or `none`.

### Wix variables

- `WIX_CLIENT_ID`
- `WIX_API_KEY`
- `WIX_SITE_ID`
- `WIX_MEMBERS_ENDPOINT`
- `WIX_MEMBERS_QUERY_ENDPOINT`
- `WIX_CONTACTS_ENDPOINT`
- `WIX_ORDERS_SEARCH_ENDPOINT`
- `WIX_COUPONS_ENDPOINT`

### Persistence

- `MONGODB_URI`
- `MONGODB_DB_NAME`

### Loyalty tuning

- `GRID_CURRENCY`
- `GRID_COUPON_SCOPE_NAMESPACE`
- `SYNC_STALE_HOURS`
- `WELCOME_BONUS_CREDITS`
- `BIRTHDAY_BONUS_CREDITS`
- `LEADERBOARD_CACHE_TTL_MS`
- `LEADERBOARD_SNAPSHOT_SIZE`
- `REDEMPTION_IDEMPOTENCY_TTL_HOURS`
- `FRAUD_HOLD_SCORE`

## Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## API Routes

- `GET /api/auth/login`: starts Wix-managed login.
- `POST /api/auth/exchange`: exchanges callback code for a secure session.
- `POST /api/auth/logout`: clears the current session.
- `GET /api/dashboard`: returns the full dashboard payload for the signed-in member.
- `GET /api/leaderboard`: returns a cached paginated global leaderboard. Supports `page`, `pageSize`, and `refresh=true`.
- `POST /api/sync`: manually resyncs the current member from Wix.
- `POST /api/redeem`: redeems Creds and creates a coupon. Requires `Idempotency-Key`.
- `GET /admin`: separate admin dashboard.
- `GET /api/admin/overview`: admin control-plane data.
- `GET /api/admin/users`: paginated users.
- `POST /api/admin/users/:memberId/adjust`: idempotent manual Cred adjustment.
- `POST /api/admin/users/:memberId/rank`: idempotent rank override.
- `POST /api/admin/users/:memberId/moderation`: idempotent user moderation.
- `POST /api/admin/campaigns/bonus`: owner-only global bonus campaign.
- `POST /api/admin/events/seasonal`: owner-only seasonal event.
- `POST /api/admin/reconcile`: manual order reconciliation.
- `GET /api/admin/audit`, `/api/admin/redemptions`, `/api/admin/coupons`: admin review surfaces.
- `POST /api/admin/redemptions/:redemptionId/recover`: idempotent redemption recovery resolution.
- `GET /api/cron/sync`: scheduled full-member sync. Requires `Authorization: Bearer <CRON_SECRET>`.
- `GET /api/health`: health check.

## Deployment

### Recommended: Vercel single-project deploy

This codebase is best deployed as one Next.js app on Vercel:

1. Push the repo to GitHub.
2. Import the repo into Vercel.
3. Add all environment variables from `.env.example`.
4. Ensure `APP_URL` matches the deployed frontend URL.
5. Deploy.
6. Keep the `vercel.json` cron entry enabled so `/api/cron/sync` runs daily.

Why this is best:

- Same-origin cookies are simple and secure.
- Route handlers stay private.
- Cron is built in.
- Frontend and backend deploy together with less session friction.

### Netlify deploy

Netlify can host this app through its Next.js runtime:

1. Push to GitHub.
2. Create a Netlify site from the repo.
3. Use `npm run build`.
4. Add the same environment variables.
5. Recreate the daily sync with a scheduled function hit or external scheduler against `/api/cron/sync`.

### Static frontend on GitHub Pages plus separate backend

This repo can support a split deployment, but use a custom domain if you want secure cookie auth:

- Frontend example: `https://app.thegrid.com`
- API example: `https://api.thegrid.com`
- Set:
  - `APP_URL=https://app.thegrid.com`
  - `NEXT_PUBLIC_API_BASE_URL=https://api.thegrid.com`
  - `ALLOWED_ORIGIN=https://app.thegrid.com`
  - `COOKIE_DOMAIN=.thegrid.com`

Important:

- GitHub Pages on `*.github.io` is not ideal for secure shared cookies with a separate API domain.
- For real production auth, use a shared custom domain or keep the app same-origin on Vercel.

## Notes On Wix Integration

- Member login is handled through `@wix/sdk` with `createClient()` and `OAuthStrategy({ clientId: process.env.WIX_CLIENT_ID })`.
- The callback at `/auth/callback` exchanges the Wix code for member tokens through the SDK, then stores an encrypted HttpOnly session cookie.
- Admin data and coupon operations stay on backend API routes and use `WIX_API_KEY` with `wix-site-id`.
- Orders are searched using member, contact, or email identity.
- Coupon creation attempts to create a real Wix coupon and falls back to a tracked local coupon record if Wix coupon creation fails due permissions or store setup.

## Production Hardening Suggestions

- Add MongoDB transactions for redemptions if you expect high concurrent coupon usage.
- Add webhook ingestion for order and coupon events if you want near-real-time updates.
- Expand the coupon payload if your Wix store requires narrower coupon scope rules.
- Add analytics, audit logging, and rate limiting on auth and redeem endpoints.
