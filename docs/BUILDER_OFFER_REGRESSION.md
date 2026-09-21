# Builder Offer regression notes

## Must remain unchanged
- Residential `send-request-rentee` / `update-request-renter` accept (all-or-nothing)
- `computeSplit(price, addons)` signature and 15% base behavior
- Single-site commercial `POST /company/quote` + reorder flow

## Builder Offer path
- HTTP under `/api/company/builder-offers` and `/api/builder-offers`
- Sockets `builder-offer:*` only
- Fee lines via `computeSplitFromLines` / `feeEligible`

## Automated checks
```bash
node src/modules/builderOffer/__tests__/economics.test.js
```
(from binsAppbackend)

```bash
node lib/builderOffers/economics.regression.test.js
```
(from binsweb)

## Manual checks before release
1. Residential dumpster book → provider accept → complete
2. Commercial single-site reorder still works
3. Create multi-jobsite offer → providers see LARGE BUILDER OFFER → partial accept → progress updates
4. Single-provider preference rejects partial select
5. Pass-through line shows $0 platform fee
6. Admin `/commercial-portal/offers` shows fulfillment %
