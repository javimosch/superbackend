# Billing & subscriptions

## What it is

SaasBackend integrates with Stripe to:

- Create Checkout sessions for subscriptions or one-time payments
- Redirect users to the Billing Portal
- Reconcile subscription state
- Process Stripe webhooks to update local user state

This doc explains the request/response flow for a typical subscription.

## Prerequisites

- `STRIPE_SECRET_KEY` configured (env var or encrypted global setting)
- `STRIPE_WEBHOOK_SECRET` configured (env var)
- `PUBLIC_URL` configured for redirect URLs

## JWT requirement

Billing endpoints require a logged-in user.

```
Authorization: Bearer <access_token>
```

## Endpoints

### Create Checkout session

```
POST /api/billing/create-checkout-session
```

Body:

```json
{ "priceId": "price_...", "billingMode": "subscription" }
```

Notes:

- `billingMode` can be `subscription` (default) or `payment`.
- The backend sets `metadata.userId` on the session to link events back to the user.

### Create Billing Portal session

```
POST /api/billing/create-portal-session
```

Returns a URL that you should redirect the user to.

### Reconcile subscription

```
POST /api/billing/reconcile-subscription
```

Useful if you want to “pull” state after a redirect back from Stripe.

## Webhook endpoint

Stripe should be configured to POST to:

```
POST /api/stripe/webhook
```

The webhook handler processes events such as:

- `checkout.session.completed`
- `customer.subscription.created/updated/deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

## Plan mapping

How Stripe prices map to your app’s plan label is documented in:

- `docs/features/stripe-pricing-management.md`

## Troubleshooting

### Checkout session created but plan doesn’t update

- Webhooks are asynchronous: allow a few seconds.
- Ensure `STRIPE_WEBHOOK_SECRET` matches the endpoint configuration.
- Check webhook ingestion and failures via:
  - `docs/features/stripe-webhook-improvements.md`
  - `docs/features/webhook-testing-guide.md`
