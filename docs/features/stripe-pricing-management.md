# Stripe pricing management

## Overview

This feature adds an admin UI and API to manage Stripe products/prices from this backend (without using the Stripe dashboard), while keeping existing production behavior **backward compatible**.

Admin UI:
- `/admin/stripe-pricing`

Admin API (basic auth):
- `/api/admin/stripe/*`

---

## Key concepts

### Plan key

A **plan key** is the value stored in `User.currentPlan`. It is now **free-text** (not an enum), so you can use any naming scheme, for example:

- `free`
- `pro`
- `starter_monthly`
- `team_annual`
- `lifetime`

### Catalog mapping

The Stripe pricing catalog is stored in MongoDB as `StripeCatalogItem` documents mapping:

- Stripe `price_...` → `planKey`

This is what lets webhooks translate Stripe subscriptions into your application-level plan label.

---

## Backward compatibility

Plan resolution is intentionally layered to avoid breaking existing deployments:

1. **Catalog mapping** (new)
   - If a `StripeCatalogItem` exists for the Stripe `priceId` and is `active: true`, the user’s `currentPlan` becomes `catalogItem.planKey`.
2. **Legacy env mapping** (existing)
   - `STRIPE_PRICE_ID_CREATOR` → `creator`
   - `STRIPE_PRICE_ID_PRO` → `pro`
3. **Fallback**
   - If a price is unknown, the code defaults to `creator` for active subscriptions (preserves previous behavior).

---

## Configuration

### Stripe secret key

Stripe can be configured in either of these ways:

- Environment variable:
  - `STRIPE_SECRET_KEY=sk_test_...` / `sk_live_...`

- Global settings (Admin UI → Global Settings):
  - Key: `STRIPE_SECRET_KEY`
  - Type: `encrypted`

Important:
- Encrypted global settings require `SAASBACKEND_ENCRYPTION_KEY` to be set so the backend can decrypt them.

### Optional legacy env vars

These are still supported (and recommended to keep during rollout):

- `STRIPE_PRICE_ID_CREATOR=price_...`
- `STRIPE_PRICE_ID_PRO=price_...`

---

## Data model

### `StripeCatalogItem`

Stored fields include:

- `stripeProductId`
- `stripePriceId` (unique)
- `planKey`
- `displayName`
- `billingType` (`subscription` | `one_time`)
- `currency`, `unitAmount`
- `interval`, `intervalCount`
- `active`

---

## Admin UI workflow

### Create a new price

Use the **Create New Price** form to create:

- A Stripe Product
- A Stripe Price
- A `StripeCatalogItem` mapping for it

### Import an existing price

If you already have prices in Stripe:

1. Open **Browse Stripe**
2. Copy the Stripe `price_...` ID
3. Import it and assign a `planKey`

---

## Env sync from catalog (optional)

Some host apps use environment variables such as `STRIPE_PRICE_...` to pass Stripe price
IDs into views or other services. To avoid manually copying `price_...` values from the
catalog into your `.env`, you can **sync env vars from the Stripe catalog in memory**.

### API

- `POST /api/admin/stripe/env/sync` (basic auth)

Behavior:

- Loads all active `StripeCatalogItem` documents.
- For each item, treats `planKey` as an environment variable name and sets:

  - `process.env[planKey] = stripePriceId`

- Returns a summary:

```json
{
  "applied": [
    { "envVar": "STRIPE_PRICE_ANNUAL_LAUNCH", "stripePriceId": "price_..." },
    { "envVar": "MY_APP_SUPER_PRICE_STANDARD", "stripePriceId": "price_..." }
  ],
  "totalActive": 4
}
```

This works with **any env var name**, as long as you choose your `planKey` to match the
desired environment variable (e.g. `planKey = STRIPE_PRICE_ANNUAL_LAUNCH` or
`planKey = MY_APP_SUPER_PRICE_STANDARD`). No per-mapping payload is required.

Important notes:

- This only updates `process.env` **in memory** for the running Node.js process. It does
  not modify `.env` files.
- Code that reads `process.env` on startup will not see updates unless you either:
  - call the endpoint **before** reading those vars, or
  - restart the process after syncing.

### Admin UI panel

The `/admin/stripe-pricing` page includes an **Env sync from catalog** panel where admins
can:

- Add any number of rows with:
  - **Env var name** (e.g. `STRIPE_PRICE_ANNUAL_LAUNCH`, `MY_APP_SUPER_PRICE_STANDARD`)
  - **Plan key** (e.g. `microexists_annual_launch`, `my_app_super_price_standard`)
- Click **Sync env from catalog** to POST those mappings to the API.

This allows hot updates of `process.env` without a deploy. Host apps can still use
their existing `process.env.MY_APP_...` lookups and let the catalog drive the actual
`price_...` IDs.

---

## FAQ

### What does “Deactivate” do?

Deactivating a catalog item:

- **Does not delete anything in Stripe**
- Sets `StripeCatalogItem.active = false`
- Prevents that Stripe `priceId` from resolving via catalog mapping

Effect on webhooks / plan assignment:

- If a webhook arrives for that Stripe `priceId`, the system will **not** use the deactivated catalog item.
- It will fall back to:
  - legacy env mappings (`STRIPE_PRICE_ID_CREATOR` / `STRIPE_PRICE_ID_PRO`), or
  - the fallback default (`creator`)

Practical use:

- Use **Deactivate** to stop using a price mapping without removing historical data.

### Does “Delete” delete the price/product in Stripe?

No. Delete only removes the local `StripeCatalogItem` record.

### Why is Stripe still “Not Configured” after I set `STRIPE_SECRET_KEY` in Global Settings?

Usually one of:

- `SAASBACKEND_ENCRYPTION_KEY` is missing/incorrect, so encrypted settings can’t be decrypted.
- The stored key doesn’t start with `sk_`.

### Can I use one-time prices?

Yes. Catalog items support `billingType: one_time` and they can be created/imported in the same UI. (Your broader billing flow still needs to decide how one-time purchases map to entitlements.)

---

## Files

- `src/models/StripeCatalogItem.js`
- `src/services/stripeHelper.service.js`
- `src/services/stripe.service.js`
- `src/controllers/stripeAdmin.controller.js`
- `src/routes/stripeAdmin.routes.js`
- `views/admin-stripe-pricing.ejs`
