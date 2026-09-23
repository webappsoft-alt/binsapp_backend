import DumpsterPricingZone from "../models/DumpsterPricingZone.js";

/** Normalize free-text for case/space-insensitive matching. */
export function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function normalizeZip(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/\d{5}/);
  return match ? match[0] : raw.replace(/[^0-9A-Za-z]/g, "").slice(0, 10);
}

/**
 * Catalog size ↔ yard aliases so zone rates (10/15/20) can overlay
 * catalog rows (10-12 / 14-16 / 18-20) and vice versa.
 */
const SIZE_EQUIVALENCE = {
  "6-8": ["6-8", "6", "8", "6yd", "8yd"],
  "10-12": ["10-12", "10", "10yd", "10 yd", "12"],
  "14-16": ["14-16", "15", "14", "16", "15yd", "15 yd"],
  "18-20": ["18-20", "20", "18", "20yd", "20 yd"],
  "30": ["30", "30yd", "30 yd"],
  "40": ["40", "40yd", "40 yd"],
  "10": ["10", "10-12", "10yd", "10 yd"],
  "15": ["15", "14-16", "15yd", "15 yd"],
  "20": ["20", "18-20", "20yd", "20 yd"],
};

export function sizeKeysFor(size) {
  const key = normalizeText(size).replace(/\s+/g, "");
  const variants = SIZE_EQUIVALENCE[key] || SIZE_EQUIVALENCE[normalizeText(size)] || [String(size || "")];
  return new Set(variants.map((v) => normalizeText(v).replace(/\s+/g, "")));
}

export function sizesMatch(a, b) {
  if (!a || !b) return false;
  const setA = sizeKeysFor(a);
  const keyB = normalizeText(b).replace(/\s+/g, "");
  return setA.has(keyB) || [...sizeKeysFor(b)].some((k) => setA.has(k));
}

/** Default included tonnage by yard size (editable per zone rate). */
export const DEFAULT_INCLUDED_TONS = {
  "10": 1,
  "10-12": 1,
  "15": 1.5,
  "14-16": 1.5,
  "20": 2,
  "18-20": 2,
  "30": 3,
  "40": 4,
  "6-8": 1,
};

export function defaultIncludedTonsForSize(size) {
  const key = String(size || "").trim();
  if (DEFAULT_INCLUDED_TONS[key] != null) return DEFAULT_INCLUDED_TONS[key];
  for (const [alias, tons] of Object.entries(DEFAULT_INCLUDED_TONS)) {
    if (sizesMatch(alias, key)) return tons;
  }
  return 0;
}

function haversineMiles(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function stateMatches(zone, state, stateCode) {
  const zoneState = normalizeText(zone.state);
  const zoneCode = normalizeText(zone.stateCode);
  const incomingState = normalizeText(state);
  const incomingCode = normalizeText(stateCode || state);

  if (!incomingState && !incomingCode) return true; // unknown state → don't reject on state alone
  if (zoneCode && incomingCode && zoneCode === incomingCode) return true;
  if (zoneState && incomingState && zoneState === incomingState) return true;
  if (zoneCode && incomingState && zoneCode === incomingState) return true;
  if (zoneState && incomingCode && zoneState === incomingCode) return true;
  // If caller provided a state and zone has one, require a match
  if ((incomingState || incomingCode) && (zoneState || zoneCode)) return false;
  return true;
}

/**
 * Score how well a market matches a location. Higher = better.
 * 0 = no match.
 *
 * Matching uses state + city≈market name + optional geo radius.
 * No separate cities/zips/counties matcher lists.
 */
export function scoreZoneMatch(zone, location = {}) {
  const {
    city = "",
    state = "",
    stateCode = "",
    lat = null,
    lng = null,
  } = location;

  if (!stateMatches(zone, state, stateCode)) return 0;

  let score = 0;
  const cityNorm = normalizeText(city);
  const marketNorm = normalizeText(zone.market || zone.zone);

  if (cityNorm && marketNorm) {
    if (cityNorm === marketNorm) {
      score += 80;
    } else if (marketNorm.includes(cityNorm) || cityNorm.includes(marketNorm)) {
      // e.g. city "Orlando" ↔ market "Orlando Metro"
      score += 55;
    } else {
      // Token overlap: "Fort Myers" vs "Fort Myers / Lee County"
      const cityTokens = cityNorm.split(/[^a-z0-9]+/).filter((t) => t.length > 2);
      const marketTokens = new Set(
        marketNorm.split(/[^a-z0-9]+/).filter((t) => t.length > 2),
      );
      const overlap = cityTokens.filter((t) => marketTokens.has(t)).length;
      if (overlap > 0) score += Math.min(50, overlap * 20);
    }
  }

  const coords = zone.geo?.center?.coordinates;
  const radius = Number(zone.geo?.radiusMiles);
  const hasGeo =
    Array.isArray(coords) &&
    coords.length === 2 &&
    Number.isFinite(Number(lat)) &&
    Number.isFinite(Number(lng)) &&
    Number.isFinite(radius) &&
    radius > 0;

  if (hasGeo) {
    const [zLng, zLat] = coords;
    const dist = haversineMiles(
      Number(lat),
      Number(lng),
      Number(zLat),
      Number(zLng),
    );
    if (dist <= radius) {
      score += Math.max(10, Math.round(50 - (dist / radius) * 40));
    }
  }

  // Need at least a city≈market hit or geo hit to count as a match
  return score;
}

/**
 * Find the best active geographic pricing zone for a location.
 * Skips the Global Rate row (isGlobal) — that is only used as fallback.
 * Returns null when nothing matches.
 */
export async function findMatchingPricingZone(location = {}) {
  const zones = await DumpsterPricingZone.find({
    status: "active",
    isGlobal: { $ne: true },
  }).lean();
  if (!zones.length) return null;

  let best = null;
  let bestScore = 0;
  for (const zone of zones) {
    const score = scoreZoneMatch(zone, location);
    if (score > bestScore) {
      bestScore = score;
      best = zone;
    }
  }
  return bestScore > 0 ? best : null;
}

/** Platform-wide Global Rate zone (Market Pricing). */
export async function getGlobalPricingZone() {
  const zone = await DumpsterPricingZone.findOne({
    isGlobal: true,
    status: "active",
  }).lean();
  return zone || null;
}

export function findRateForSize(zone, size, materialType = "standard") {
  if (!zone?.rates?.length || !size) return null;
  const material = normalizeText(materialType || "standard");

  const byMaterial = zone.rates.filter(
    (r) => sizesMatch(r.size, size) && normalizeText(r.materialType || "standard") === material,
  );
  if (byMaterial.length) return byMaterial[0];

  // Fall back to any matching size with "standard" or first size match
  const bySize = zone.rates.filter((r) => sizesMatch(r.size, size));
  if (!bySize.length) return null;
  return (
    bySize.find((r) => normalizeText(r.materialType || "standard") === "standard") ||
    bySize[0]
  );
}

/**
 * Build fallback rate fields from a catalog Dumbster document.
 * Tons + overage always live on the dumpster; prices / extra-day may come from zones.
 */
export function rateFromDumpsterFallback(dumpster = {}) {
  return {
    oneDayPrice: Number(dumpster.price) || 0,
    threeDayPrice: Number(dumpster.three_days_price) || 0,
    sevenDayPrice: Number(dumpster.seven_days_price) || 0,
    includedTons:
      Number(dumpster.tons) || defaultIncludedTonsForSize(dumpster.size) || 0,
    overagePerTon: Number(dumpster.overagePerTon) || 0,
    extraDay:
      Number(dumpster.per_dim_rate) ||
      Number(dumpster.day_price_km) ||
      0,
    providerPayout: null,
    binsAppFee: null,
    materialType: "standard",
    size: dumpster.size,
    pricingSource: "fallback",
  };
}

/**
 * Overlay zone pricing onto a dumpster catalog document.
 * Always returns a new object; never mutates the input.
 *
 * Canonical fields (no duplicates):
 * - price / three_days_price / seven_days_price  ← zone (or dumpster fallback)
 * - tons / overagePerTon                        ← always from dumpster
 * - per_dim_rate + day_price_km (extra-day)     ← zone extraDay, else dumpster
 * - providerPayout, binsAppFee, pricingSource, pricingZone
 */
export function applyZonePricingToDumpster(dumpster, zone, { materialType = "standard" } = {}) {
  if (!dumpster) return dumpster;

  const fallback = rateFromDumpsterFallback(dumpster);
  const rate = zone ? findRateForSize(zone, dumpster.size, materialType) : null;

  // Drop overlapping / stale keys so the response has one name per concept
  const {
    includedTons: _omitIncludedTons,
    extraDay: _omitExtraDay,
    overagePerTon: _omitOverage,
    providerPayout: _omitPayout,
    binsAppFee: _omitFee,
    materialType: _omitMaterial,
    pricingSource: _omitSource,
    pricingZone: _omitZone,
    ...base
  } = dumpster;

  // Tons + overage always from create-dumpster catalog
  const catalogTons = fallback.includedTons;
  const catalogOverage = fallback.overagePerTon;

  const applyFields = ({
    oneDay,
    threeDay,
    sevenDay,
    tons,
    extraDayRate,
    overagePerTon,
    providerPayout,
    binsAppFee,
    material,
    source,
    pricingZone,
  }) => {
    const threeSaved = Math.max(0, Math.round(oneDay * 3 - threeDay));
    const sevenSaved = Math.max(0, Math.round(oneDay * 7 - sevenDay));
    return {
      ...base,
      price: oneDay,
      three_days_price: threeDay,
      seven_days_price: sevenDay,
      three_days_saved: threeSaved,
      seven_days_saved: sevenSaved,
      tons,
      overagePerTon,
      weight: `${tons} ton${Number(tons) === 1 ? "" : "s"} included`,
      per_dim_rate: extraDayRate,
      day_price_km: extraDayRate,
      providerPayout,
      binsAppFee,
      materialType: material,
      pricingSource: source,
      pricingZone,
    };
  };

  if (!rate) {
    return applyFields({
      oneDay: fallback.oneDayPrice,
      threeDay: fallback.threeDayPrice,
      sevenDay: fallback.sevenDayPrice,
      tons: catalogTons,
      extraDayRate: fallback.extraDay,
      overagePerTon: catalogOverage,
      providerPayout: fallback.providerPayout,
      binsAppFee: fallback.binsAppFee,
      material: fallback.materialType,
      source: "fallback",
      pricingZone: null,
    });
  }

  const oneDay = Number(rate.oneDayPrice) || 0;
  const threeDay = Number(rate.threeDayPrice) || 0;
  const sevenDay = Number(rate.sevenDayPrice) || 0;
  const extraDayRate =
    Number(rate.extraDay) ||
    Number(dumpster.per_dim_rate) ||
    Number(dumpster.day_price_km) ||
    0;

  const source = zone.isGlobal ? "global" : "zone";

  return applyFields({
    oneDay,
    threeDay,
    sevenDay,
    tons: catalogTons,
    extraDayRate,
    overagePerTon: catalogOverage,
    providerPayout:
      rate.providerPayout == null ? null : Number(rate.providerPayout),
    binsAppFee: rate.binsAppFee == null ? null : Number(rate.binsAppFee),
    material: rate.materialType || materialType || "standard",
    source,
    pricingZone: {
      id: zone._id,
      state: zone.state,
      stateCode: zone.stateCode || "",
      market: zone.market,
      isGlobal: Boolean(zone.isGlobal),
    },
  });
}

/**
 * Resolve applicable pricing for a list of dumpsters at a location.
 * Geo market match → Global Rate → dumpster catalog prices.
 * Same market rates apply for residential and commercial nearby.
 */
export async function resolveDumpsterPricingForLocation(
  dumpsters,
  location = {},
  { materialType = "standard" } = {},
) {
  if (!Array.isArray(dumpsters) || dumpsters.length === 0) return [];

  const geoZone = await findMatchingPricingZone(location);
  const zone = geoZone || (await getGlobalPricingZone());
  return dumpsters.map((d) =>
    applyZonePricingToDumpster(d, zone, { materialType }),
  );
}

/**
 * Pick package price for a rental period (1 / 3 / 7 day rules).
 * 1-Day = up to 1 day, 3-Day = up to 3, 7-Day = up to 7.
 * Extra days beyond the selected package use extraDay / per_dim_rate.
 */
export function pickPackagePrice(pricedDumpster, numDays = 1) {
  const days = Math.max(1, Number(numDays) || 1);
  const one = Number(pricedDumpster.price) || 0;
  const three = Number(pricedDumpster.three_days_price) || 0;
  const seven = Number(pricedDumpster.seven_days_price) || 0;
  const extraDay =
    Number(pricedDumpster.extraDay) ||
    Number(pricedDumpster.per_dim_rate) ||
    Number(pricedDumpster.day_price_km) ||
    0;

  if (days <= 1) {
    return { packageDays: 1, basePrice: one, extraDays: 0, total: one };
  }
  if (days <= 3) {
    const packagePrice = three || one;
    const packageDays = three ? 3 : 1;
    const extraDays = Math.max(0, days - packageDays);
    return {
      packageDays,
      basePrice: packagePrice,
      extraDays,
      total: packagePrice + extraDays * extraDay,
    };
  }
  if (days <= 7) {
    const packagePrice = seven || three || one;
    const packageDays = seven ? 7 : three ? 3 : 1;
    const extraDays = Math.max(0, days - packageDays);
    return {
      packageDays,
      basePrice: packagePrice,
      extraDays,
      total: packagePrice + extraDays * extraDay,
    };
  }

  // Beyond 7 days: start from 7-day package + extra days
  const packagePrice = seven || three || one;
  const packageDays = seven ? 7 : three ? 3 : 1;
  const extraDays = Math.max(0, days - packageDays);
  return {
    packageDays,
    basePrice: packagePrice,
    extraDays,
    total: packagePrice + extraDays * extraDay,
  };
}
