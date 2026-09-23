/**
 * Lightweight self-check for dumpster zone pricing resolution.
 * Usage: node scripts/test-dumpster-zone-pricing.js
 */
import {
  scoreZoneMatch,
  applyZonePricingToDumpster,
  sizesMatch,
  pickPackagePrice,
  rateFromDumpsterFallback,
} from "../src/utils/dumpsterZonePricing.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const orlandoZone = {
  _id: "zone-orlando",
  state: "Florida",
  stateCode: "FL",
  market: "Orlando Metro",
  zone: "Orlando Metro",
  geo: {
    center: { type: "Point", coordinates: [-81.3792, 28.5383] },
    radiusMiles: 45,
  },
  rates: [
    {
      size: "18-20",
      sizeLabel: "20 YD",
      materialType: "standard",
      oneDayPrice: 470,
      threeDayPrice: 485,
      sevenDayPrice: 499,
      includedTons: 2,
      overagePerTon: 0,
      extraDay: 75,
    },
  ],
};

const tampaZone = {
  ...orlandoZone,
  _id: "zone-tampa",
  market: "Tampa Bay",
  zone: "Tampa Bay",
  geo: {
    center: { type: "Point", coordinates: [-82.4572, 27.9506] },
    radiusMiles: 45,
  },
  rates: [
    {
      size: "18-20",
      sizeLabel: "20 YD",
      materialType: "standard",
      oneDayPrice: 470,
      threeDayPrice: 485,
      sevenDayPrice: 499,
      includedTons: 2,
      overagePerTon: 0,
      extraDay: 70,
    },
    {
      size: "10-12",
      sizeLabel: "10 YD",
      materialType: "standard",
      oneDayPrice: 330,
      threeDayPrice: 340,
      sevenDayPrice: 349,
      includedTons: 1,
      overagePerTon: 0,
      extraDay: 50,
    },
  ],
};

const catalog20 = {
  _id: "d20",
  size: "18-20",
  price: 250,
  three_days_price: 300,
  seven_days_price: 350,
  tons: 2,
  overagePerTon: 85,
  per_dim_rate: 40,
  day_price_km: 40,
};

// 1) Size aliases
assert(sizesMatch("18-20", "20"), "18-20 should match 20");
assert(sizesMatch("10-12", "10"), "10-12 should match 10");
assert(sizesMatch("14-16", "15"), "14-16 should match 15");

// 2) Zone match by city ≈ market name
assert(
  scoreZoneMatch(orlandoZone, { city: "Orlando", state: "Florida" }) > 0,
  "Orlando city should match Orlando Metro market",
);
assert(
  scoreZoneMatch(tampaZone, { city: "Tampa", state: "Florida" }) >
    scoreZoneMatch(orlandoZone, { city: "Tampa", state: "Florida" }),
  "Tampa should prefer Tampa Bay market",
);

// 3) Different states don't match Florida zones when state provided
assert(
  scoreZoneMatch(orlandoZone, {
    city: "Orlando",
    state: "Texas",
    stateCode: "TX",
  }) === 0,
  "Texas should not match Florida zone",
);

// 4) Geo radius match
assert(
  scoreZoneMatch(orlandoZone, {
    stateCode: "FL",
    lat: 28.54,
    lng: -81.38,
  }) > 0,
  "Lat/lng near Orlando center should match",
);

// 5) Inside zone → zone price (no duplicate tonnage / extra-day keys)
const pricedOrlando = applyZonePricingToDumpster(catalog20, orlandoZone);
assert(pricedOrlando.pricingSource === "zone", "should use zone pricing");
assert(pricedOrlando.seven_days_price === 499, "Orlando 20YD 7-day should be 499");
assert(pricedOrlando.price === 470, "Orlando 20YD 1-day should be 470");
assert(pricedOrlando.pricingZone.market === "Orlando Metro", "market meta required");
assert(pricedOrlando.tons === 2, "tons should be set");
assert(
  pricedOrlando.overagePerTon === 85,
  "overage always from dumpster catalog",
);
assert(
  pricedOrlando.includedTons === undefined,
  "includedTons must not duplicate tons",
);
assert(
  pricedOrlando.extraDay === undefined,
  "extraDay must not duplicate per_dim_rate",
);
assert(pricedOrlando.per_dim_rate === 75, "extra day via per_dim_rate");
assert(pricedOrlando.day_price_km === 75, "day_price_km mirrors per_dim_rate");

// Zone includedTons must NOT override dumpster tons
const zoneWithDifferentTons = {
  ...orlandoZone,
  rates: [{ ...orlandoZone.rates[0], includedTons: 99, overagePerTon: 1 }],
};
const pricedTons = applyZonePricingToDumpster(catalog20, zoneWithDifferentTons);
assert(pricedTons.tons === 2, "zone includedTons ignored — dumpster tons win");
assert(pricedTons.overagePerTon === 85, "zone overage ignored — dumpster wins");

// Global Rate source
const globalZone = { ...orlandoZone, isGlobal: true, market: "Global Rate" };
const pricedGlobal = applyZonePricingToDumpster(catalog20, globalZone);
assert(pricedGlobal.pricingSource === "global", "isGlobal → pricingSource global");
assert(pricedGlobal.pricingZone.isGlobal === true, "pricingZone.isGlobal flag");

// 6) Outside all zones → fallback
const pricedFallback = applyZonePricingToDumpster(catalog20, null);
assert(pricedFallback.pricingSource === "fallback", "null zone → fallback");
assert(pricedFallback.price === 250, "fallback keeps catalog price");

// 7) Different zone different price (Tampa 10YD)
const catalog10 = { ...catalog20, _id: "d10", size: "10-12", price: 200 };
const pricedTampa10 = applyZonePricingToDumpster(catalog10, tampaZone);
assert(pricedTampa10.seven_days_price === 349, "Tampa 10YD 7-day = 349");

// 8) Package pick + exchange semantics (new order = full package again)
const pkg = pickPackagePrice(pricedOrlando, 7);
assert(pkg.total === 499, "7-day package total 499");
const exchange = pickPackagePrice(pricedOrlando, 7);
assert(exchange.total === 499, "exchange is a new full charge");

// 9) Fallback helper
const fb = rateFromDumpsterFallback(catalog20);
assert(fb.pricingSource === "fallback", "fallback helper marks source");

console.log("All dumpster zone pricing checks passed.");
