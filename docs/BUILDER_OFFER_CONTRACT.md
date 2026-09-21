# Builder Offer API & Socket Contract

Parallel path to residential `send-request-rentee` / `update-request-renter`.
Do **not** use those sockets for partial quantity Builder Offer accepts.

## Status machine

`draft` → `open` → `partially_fulfilled` → `fulfilled`  
Any open/partial may → `needs_adjustment` → (adjust) → `open`  
Any non-terminal → `cancelled` | `expired`

## HTTP (company, authenticated, approved company)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/company/builder-offers` | Create draft or submit (`submit: true`) |
| GET | `/api/company/builder-offers` | List offers for company |
| GET | `/api/company/builder-offers/:id` | Detail + progress + allocations |
| PATCH | `/api/company/builder-offers/:id` | Update draft / adjust open offer |
| POST | `/api/company/builder-offers/:id/submit` | Open + match + notify |
| POST | `/api/company/builder-offers/:id/adjust` | Increase prices / modify requirements |
| POST | `/api/company/builder-offers/:id/allow-counters` | Enable provider counteroffers |
| POST | `/api/company/builder-offers/:id/save-blanket` | Save schedule as company pricing plan |
| POST | `/api/company/builder-offers/quick-order` | Thin offer from approved blanket |
| GET | `/api/company/builder-offers/:id/recommendation` | Market heuristic recommendation |

## HTTP (provider / renter)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/builder-offers/portions` | Open portions eligible for this provider |
| POST | `/api/builder-offers/:id/accept` | Accept full available or selected qty |
| POST | `/api/builder-offers/:id/decline` | Decline portion |
| POST | `/api/builder-offers/:id/counter` | Submit counter (when allowed) |

## HTTP (admin)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/builder-offers` | List all |
| GET | `/api/admin/builder-offers/:id` | Detail + match snapshot |
| PATCH | `/api/admin/builder-offers/:id` | Force status / pause / cancel |
| POST | `/api/admin/builder-offers/:id/invite` | Manual invite provider |

## Accept body

```json
{
  "mode": "full_available" | "select_quantity",
  "selections": [{ "lineId": "...", "quantity": 25 }]
}
```

Capped at provider eligible qty and line `binsRemaining`.  
`single_provider` requires covering all remaining bin lines.

## Operator alerts (web + mobile push)

When portions are dispatched (`dispatchPortions` / admin invite):

1. Socket: `builder-offer:portion` to `user_{providerId}`
2. In-app notification row (`type: "offer"`)
3. **FCM push** via `sendNotification` using the operator’s `fcmtoken`

FCM `data` payload (all strings) for future mobile deep-link:

```json
{
  "kind": "builder_offer",
  "offerId": "...",
  "screen": "builder_offer_portion",
  "eligibleBins": "40",
  "yourAvailablePortion": "34000",
  "priority": "high"
}
```

Title: `LARGE BUILDER OFFER`  
Channel/sound: same as order alerts (`bins_order_alerts` / `order_alert`)

Company also receives FCM on portion accept and `needs_adjustment`.

## Fee rules

- Default rate: 15% (`PLATFORM_FEE_RATE`) on `feeEligible` lines only
- `pass_through` lines: fee $0
- Residential `computeSplit(price, addons)` unchanged
