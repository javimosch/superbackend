# Metrics & activity

## What it is

SaasBackend includes:

- A lightweight metrics/event tracking endpoint (`/api/metrics/*`) designed for product analytics.
- A per-user activity log API (`/api/activity-log`) designed for “user did X” auditing inside your product.

## Metrics

### Track an event

```
POST /api/metrics/track
```

Body:

```json
{ "action": "service_view", "meta": { "serviceId": "abc" } }
```

Notes:

- This endpoint supports anonymous usage via an anon cookie (`enbauges_anon_id`).
- If you include `Authorization: Bearer <token>`, the event is attributed to the user.

### Impact summary

```
GET /api/metrics/impact
```

Returns aggregate metrics for the current month.

## Activity log (JWT)

### List activity

```
GET /api/activity-log
Authorization: Bearer <token>
```

Optional query params:

- `category`
- `action`
- `limit`
- `offset`

### Create activity entry

```
POST /api/activity-log
Authorization: Bearer <token>
```

Body:

```json
{ "action": "custom_event", "category": "other", "description": "Something happened", "metadata": {} }
```

Valid categories:

- `auth`
- `billing`
- `content`
- `settings`
- `admin`
- `other`

## Troubleshooting

### Events not attributed to users

- Ensure you are passing a valid `Authorization: Bearer ...` header.
- If you want anonymous attribution continuity, pass `x-anon-id` or keep cookies enabled.
