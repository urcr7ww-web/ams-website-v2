# AMS Website V2 — D1 Worker starter

## Important
This is a starter backend. Do not deploy until:
1. Move the existing `index.html` from the repository root into `public/index.html`.
2. Replace `REPLACE_WITH_YOUR_D1_DATABASE_ID` in `wrangler.jsonc` with the ID shown in Cloudflare D1 > mobile-service-db.
3. Confirm the exact columns/constraints in `phone_models`, `repair_pricing`, and `phone_inventory`.
4. Add `OWNER_API_KEY` as a Worker secret in Cloudflare. Never put it in `index.html` or commit it to GitHub.

## Routes
- GET `/api/health`
- GET `/api/phone-models`
- GET `/api/repair-pricing`
- POST `/api/owner/phone-models` (requires `X-Owner-Key`)
- POST `/api/owner/repair-pricing` (requires `X-Owner-Key`)
- POST `/api/owner/inventory` (requires `X-Owner-Key`)

`POST /api/repair-requests` intentionally returns 501 until we inspect the existing `bookings` table. No existing customer or booking data is modified.

## Deployment
Use Cloudflare Workers with a Git-connected build. The Worker entry point is `src/index.js`; static site assets are served from `public/`.
