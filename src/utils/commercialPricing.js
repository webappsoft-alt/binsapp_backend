import Company from "../models/Company.js";
import CommercialGlobalPricing from "../models/CommercialGlobalPricing.js";
import Dumbster from "../models/Dumbster.js";
import JobSite from "../models/JobSites.js";
import { BadRequestError, NotFoundError } from "./apiError.js";

export const COMMERCIAL_SIZES = ["10", "15", "20", "30", "40"];

/** Map commercial size labels onto Dumbster.size enum values. */
export function commercialSizeToDumbsterSizes(size) {
  const key = String(size || "").replace(/\D/g, "");
  if (key === "10") return ["10-12", "10"];
  if (key === "15") return ["14-16", "15"];
  if (key === "20") return ["18-20", "20"];
  if (key === "30") return ["30"];
  if (key === "40") return ["40"];
  return [String(size)];
}

export function normalizeCommercialSize(size) {
  if (size == null) return null;
  const raw = String(size).trim();
  if (COMMERCIAL_SIZES.includes(raw)) return raw;
  if (raw === "18-20" || raw.startsWith("18") || raw.includes("20")) return "20";
  if (raw === "14-16" || raw.startsWith("14") || raw.includes("15")) return "15";
  if (raw.includes("10") && !raw.includes("100")) return "10";
  if (raw.includes("30")) return "30";
  if (raw.includes("40")) return "40";
  const digits = raw.replace(/\D/g, "");
  if (COMMERCIAL_SIZES.includes(digits)) return digits;
  return null;
}

function emptyRateCard() {
  return {
    threeDayPrice: 0,
    sevenDayPrice: 0,
    fourteenDayPrice: 0,
    thirtyDayPrice: 0,
    enableFourteenDay: false,
    enableThirtyDay: false,
    perDiemRate: 0,
    includedTons: 0,
    overagePerTon: 0,
    overageEnforced: false,
  };
}

/**
 * Derive 14-day / 30-day package prices from 3-day and 7-day anchors.
 * Prefers 7-day (longer known package) with progressive volume discount;
 * falls back to 3-day daily when 7-day is missing.
 */
export function deriveExtendedPackagePrices(threeDayPrice, sevenDayPrice) {
  const three = Number(threeDayPrice) || 0;
  const seven = Number(sevenDayPrice) || 0;

  let fourteen = 0;
  let thirty = 0;

  if (seven > 0) {
    // 14d ≈ 2× weekly with ~5% package discount
    fourteen = seven * (14 / 7) * 0.95;
    // 30d ≈ linear 30/7 weeks with ~12% package discount
    thirty = seven * (30 / 7) * 0.88;
  } else if (three > 0) {
    const daily = three / 3;
    fourteen = daily * 14 * 0.9;
    thirty = daily * 30 * 0.82;
  }

  const round2 = (n) => Math.round(n * 100) / 100;
  return {
    fourteenDayPrice: round2(fourteen),
    thirtyDayPrice: round2(thirty),
    enableFourteenDay: fourteen > 0,
    enableThirtyDay: thirty > 0,
  };
}

/** Fill missing 14/30 prices from 3/7 without overwriting admin-set values. */
export function fillDerivedPackagePrices(card = {}) {
  const derived = deriveExtendedPackagePrices(
    card.threeDayPrice,
    card.sevenDayPrice,
  );
  const has14 = Number(card.fourteenDayPrice) > 0;
  const has30 = Number(card.thirtyDayPrice) > 0;
  return {
    ...card,
    fourteenDayPrice: has14
      ? Number(card.fourteenDayPrice)
      : derived.fourteenDayPrice,
    thirtyDayPrice: has30
      ? Number(card.thirtyDayPrice)
      : derived.thirtyDayPrice,
    enableFourteenDay: has14
      ? card.enableFourteenDay !== false
      : derived.enableFourteenDay,
    enableThirtyDay: has30
      ? card.enableThirtyDay !== false
      : derived.enableThirtyDay,
  };
}

function rateCardFromDumbster(dumpster) {
  if (!dumpster) return emptyRateCard();
  const threeDayPrice =
    Number(dumpster.company_three_days_price) ||
    Number(dumpster.three_days_price) ||
    0;
  const sevenDayPrice =
    Number(dumpster.company_seven_days_price) ||
    Number(dumpster.seven_days_price) ||
    0;
  const derived = deriveExtendedPackagePrices(threeDayPrice, sevenDayPrice);
  const fourteen =
    Number(dumpster.company_fourteen_days_price) > 0
      ? Number(dumpster.company_fourteen_days_price)
      : derived.fourteenDayPrice;
  const thirty =
    Number(dumpster.company_thirty_days_price) > 0
      ? Number(dumpster.company_thirty_days_price)
      : derived.thirtyDayPrice;
  return {
    threeDayPrice,
    sevenDayPrice,
    fourteenDayPrice: fourteen,
    thirtyDayPrice: thirty,
    enableFourteenDay:
      dumpster.company_enable_fourteen_day != null
        ? Boolean(dumpster.company_enable_fourteen_day)
        : derived.enableFourteenDay,
    enableThirtyDay:
      dumpster.company_enable_thirty_day != null
        ? Boolean(dumpster.company_enable_thirty_day)
        : derived.enableThirtyDay,
    perDiemRate:
      Number(dumpster.company_per_dim_rate) ||
      Number(dumpster.per_dim_rate) ||
      Number(dumpster.day_price_km) ||
      0,
    includedTons: Number(dumpster.tons) || 0,
    overagePerTon: Number(dumpster.overagePerTon) || 0,
    overageEnforced:
      dumpster.company_overage_enforced != null
        ? Boolean(dumpster.company_overage_enforced)
        : true,
  };
}

/** True when a rate card has usable commercial prices. */
export function rateCardHasPricing(card) {
  if (!card) return false;
  return (
    Number(card.threeDayPrice) > 0 ||
    Number(card.sevenDayPrice) > 0 ||
    Number(card.fourteenDayPrice) > 0 ||
    Number(card.thirtyDayPrice) > 0 ||
    Number(card.perDiemRate) > 0
  );
}

/** Build blanket rate cards from active dumpster catalog (seed only). */
export async function buildDefaultCommercialRateCardsFromDumpsters() {
  const dumpsters = await Dumbster.find({ status: "active" })
    .sort({ updatedAt: -1 })
    .lean();

  const bySize = {};
  for (const d of dumpsters) {
    const size = normalizeCommercialSize(d.size);
    if (!size || bySize[size]) continue;
    bySize[size] = d;
  }

  return COMMERCIAL_SIZES.map((size) => ({
    size,
    ...rateCardFromDumbster(bySize[size]),
  }));
}

/**
 * Ensure singleton Global Commercial Pricing exists.
 * Seeds once from dumpster company_* / base catalog (does not keep syncing).
 */
export async function ensureGlobalCommercialPricing() {
  let doc = await CommercialGlobalPricing.findOne({ key: "default" });
  if (doc && Array.isArray(doc.rateCards) && doc.rateCards.length) {
    return doc;
  }

  const seeded = await buildDefaultCommercialRateCardsFromDumpsters();
  if (doc) {
    doc.rateCards = seeded.map((c) => fillDerivedPackagePrices(c));
    await doc.save();
    return doc;
  }

  doc = await CommercialGlobalPricing.create({
    key: "default",
    rateCards: seeded.map((c) => fillDerivedPackagePrices(c)),
  });
  return doc;
}

export async function getGlobalCommercialPricing() {
  const doc = await ensureGlobalCommercialPricing();
  return typeof doc.toObject === "function" ? doc.toObject() : doc;
}

export async function updateGlobalCommercialPricing(
  rateCards = [],
  negotiatedRotationTerms = undefined,
) {
  const normalized = COMMERCIAL_SIZES.map((size) => {
    const found = (rateCards || []).find(
      (c) => normalizeCommercialSize(c.size) === size,
    );
    const filled = fillDerivedPackagePrices({
      size,
      ...(found || emptyRateCard()),
    });
    return {
      ...filled,
      enableFourteenDay:
        found?.enableFourteenDay != null
          ? Boolean(found.enableFourteenDay)
          : filled.enableFourteenDay,
      enableThirtyDay:
        found?.enableThirtyDay != null
          ? Boolean(found.enableThirtyDay)
          : filled.enableThirtyDay,
      overageEnforced:
        found?.overageEnforced != null
          ? Boolean(found.overageEnforced)
          : filled.overageEnforced !== false,
    };
  });

  const $set = { rateCards: normalized };
  if (negotiatedRotationTerms !== undefined) {
    const raw = negotiatedRotationTerms || {};
    $set.negotiatedRotationTerms = {
      enabled: Boolean(raw.enabled),
      includedDaysPerRotation:
        raw.includedDaysPerRotation == null || raw.includedDaysPerRotation === ""
          ? null
          : Number(raw.includedDaysPerRotation),
      includedTonsPerRotation:
        raw.includedTonsPerRotation == null || raw.includedTonsPerRotation === ""
          ? null
          : Number(raw.includedTonsPerRotation),
      overagePerTon:
        raw.overagePerTon == null || raw.overagePerTon === ""
          ? null
          : Number(raw.overagePerTon),
      extraDay:
        raw.extraDay == null || raw.extraDay === ""
          ? null
          : Number(raw.extraDay),
      sizes: COMMERCIAL_SIZES.map((size) => {
        const row = (raw.sizes || []).find(
          (s) => normalizeCommercialSize(s.size) === size,
        );
        return {
          size,
          initialDelivery:
            row?.initialDelivery == null || row.initialDelivery === ""
              ? null
              : Number(row.initialDelivery),
          emptyAndRedeliver:
            row?.emptyAndRedeliver == null || row.emptyAndRedeliver === ""
              ? null
              : Number(row.emptyAndRedeliver),
        };
      }),
    };
  }

  const doc = await CommercialGlobalPricing.findOneAndUpdate(
    { key: "default" },
    { $set },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  return typeof doc.toObject === "function" ? doc.toObject() : doc;
}

/** Preferred commercial defaults: Global config (not dumpster create). */
export async function buildDefaultCommercialRateCards() {
  const global = await ensureGlobalCommercialPricing();
  const cards = global?.rateCards || [];
  if (cards.some((c) => rateCardHasPricing(c))) {
    return COMMERCIAL_SIZES.map((size) => {
      const found = cards.find(
        (c) => normalizeCommercialSize(c.size) === size,
      );
      return fillDerivedPackagePrices({
        size,
        ...(found || emptyRateCard()),
      });
    });
  }
  return buildDefaultCommercialRateCardsFromDumpsters();
}

export function rateCardsNeedDerivedFill(cards = []) {
  return (cards || []).some((c) => {
    const hasBase =
      Number(c?.threeDayPrice) > 0 || Number(c?.sevenDayPrice) > 0;
    const missingExt =
      !(Number(c?.fourteenDayPrice) > 0) || !(Number(c?.thirtyDayPrice) > 0);
    return hasBase && missingExt;
  });
}

function pickPackage(card, numDays) {
  const days = Math.max(1, Number(numDays) || 1);
  const candidates = [];
  if (Number(card.threeDayPrice) > 0) {
    candidates.push({ packageDays: 3, price: Number(card.threeDayPrice) });
  }
  if (Number(card.sevenDayPrice) > 0) {
    candidates.push({ packageDays: 7, price: Number(card.sevenDayPrice) });
  }
  if (card.enableFourteenDay && Number(card.fourteenDayPrice) > 0) {
    candidates.push({ packageDays: 14, price: Number(card.fourteenDayPrice) });
  }
  if (card.enableThirtyDay && Number(card.thirtyDayPrice) > 0) {
    candidates.push({ packageDays: 30, price: Number(card.thirtyDayPrice) });
  }
  if (candidates.length === 0) {
    return { packageDays: days, price: 0, extraDays: 0, perDiemCharge: 0 };
  }

  // Prefer the largest package that fits; otherwise closest smaller + per-diem.
  const fitting = candidates
    .filter((c) => c.packageDays <= days)
    .sort((a, b) => b.packageDays - a.packageDays);
  const chosen = fitting[0] || candidates.sort((a, b) => a.packageDays - b.packageDays)[0];
  const extraDays = Math.max(0, days - chosen.packageDays);
  const perDiemRate = Number(card.perDiemRate) || 0;
  const perDiemCharge = extraDays * perDiemRate;
  return {
    packageDays: chosen.packageDays,
    price: chosen.price,
    extraDays,
    perDiemCharge,
    perDiemRate,
  };
}

function regionMatches(region, { zip, regionName, coordinates }) {
  if (!region) return false;
  if (regionName && region.name && region.name.toLowerCase() === String(regionName).toLowerCase()) {
    return true;
  }
  if (zip && Array.isArray(region.zips) && region.zips.length) {
    const normalized = String(zip).trim();
    if (region.zips.map((z) => String(z).trim()).includes(normalized)) {
      return true;
    }
  }
  if (
    coordinates?.length === 2 &&
    region.geo?.coordinates?.length === 2 &&
    Array.isArray(region.geo.coordinates)
  ) {
    // Point match is intentionally loose — zip/name is preferred.
    return false;
  }
  return false;
}

function resolveRateCardFromPlan(plan, { size, zip, regionName, coordinates }) {
  if (!plan || !plan.planType) return null;
  const commercialSize = normalizeCommercialSize(size);
  if (!commercialSize) return null;

  if (plan.planType === "blanket") {
    const card = (plan.rateCards || []).find(
      (c) => normalizeCommercialSize(c.size) === commercialSize,
    );
    return card ? { card, region: null, source: "plan_blanket" } : null;
  }

  const regions = plan.regions || [];
  let matchedRegion =
    regions.find((r) => regionMatches(r, { zip, regionName, coordinates })) ||
    null;
  if (!matchedRegion && regions.length === 1) {
    matchedRegion = regions[0];
  }
  if (!matchedRegion) return null;

  const card = (matchedRegion.rateCards || []).find(
    (c) => normalizeCommercialSize(c.size) === commercialSize,
  );
  return card
    ? { card, region: matchedRegion, source: "plan_regional" }
    : null;
}

/**
 * Authoritative commercial quote.
 * Priority: negotiated flat fees → company pricingPlan → Market Pricing zone
 * → Global Commercial → dumpster company_* / catalog.
 * When negotiatedRotationTerms.enabled, prefers Initial Delivery / Empty & Redeliver fees.
 */
export async function quoteCommercialDumpster({
  companyId,
  jobSiteId,
  size,
  numDays,
  quantity,
  dumbsterId,
  zip,
  regionName,
  location,
  rotationType = "initial",
} = {}) {
  if (!companyId) {
    throw new BadRequestError("companyId is required for a commercial quote");
  }

  const company = await Company.findById(companyId).lean();
  if (!company) throw new NotFoundError("Company not found");

  let jobSite = null;
  if (jobSiteId) {
    jobSite = await JobSite.findOne({
      _id: jobSiteId,
      company: companyId,
      status: { $ne: "deleted" },
    }).lean();
    if (!jobSite) throw new NotFoundError("Job site not found for this company");
  }

  // Prefer explicit size / job-site default, then the selected catalog dumpster.
  // Booking UIs often send only `dumbsterId` (e.g. 40yd) without a separate
  // commercial `size` field — that must still quote successfully.
  let dumpster = null;
  if (dumbsterId) {
    dumpster = await Dumbster.findById(dumbsterId).lean();
  }

  const resolvedSize =
    normalizeCommercialSize(size) ||
    normalizeCommercialSize(jobSite?.defaultSize) ||
    normalizeCommercialSize(dumpster?.size) ||
    null;

  if (!resolvedSize) {
    throw new BadRequestError("A commercial dumpster size (20/30/40) is required");
  }

  if (!dumpster) {
    const sizeEnums = commercialSizeToDumbsterSizes(resolvedSize);
    dumpster = await Dumbster.findOne({
      size: { $in: sizeEnums },
      status: "active",
    })
      .sort({ updatedAt: -1 })
      .lean();
  }

  const terms =
    company.negotiatedRotationTerms?.enabled
      ? company.negotiatedRotationTerms
      : null;
  let termsEnabled = Boolean(terms?.enabled);

  // Company negotiate off → Global Commercial negotiated defaults
  let globalNegotiated = null;
  if (!termsEnabled) {
    try {
      const globalDoc = await ensureGlobalCommercialPricing();
      if (globalDoc?.negotiatedRotationTerms?.enabled) {
        globalNegotiated = globalDoc.negotiatedRotationTerms;
        termsEnabled = true;
      }
    } catch {
      /* optional */
    }
  }

  // Still off → this dumpster's company_negotiated_* keys
  let dumpsterNegotiated = null;
  if (!termsEnabled && dumpster?.company_negotiated_enabled) {
    dumpsterNegotiated = {
      enabled: true,
      includedDaysPerRotation: dumpster.company_included_days_per_rotation,
      includedTonsPerRotation: dumpster.company_included_tons_per_rotation,
      overagePerTon: dumpster.company_negotiated_overage_per_ton,
      extraDay: dumpster.company_negotiated_extra_day,
      sizes: [
        {
          size: resolvedSize,
          initialDelivery: dumpster.company_initial_delivery,
          emptyAndRedeliver: dumpster.company_empty_and_redeliver,
        },
      ],
    };
    termsEnabled = true;
  }

  const activeTerms = terms || globalNegotiated || dumpsterNegotiated;
  const sizeTerms = termsEnabled
    ? (activeTerms.sizes || []).find((s) => String(s.size) === String(resolvedSize))
    : null;

  const negotiatedDays =
    termsEnabled && activeTerms?.includedDaysPerRotation != null
      ? Number(activeTerms.includedDaysPerRotation)
      : null;

  const days = Math.max(
    1,
    Number(numDays) ||
      negotiatedDays ||
      Number(jobSite?.num_days) ||
      3,
  );
  const qty = Math.max(
    1,
    Number(quantity) || Number(jobSite?.quantity) || 1,
  );
  const resolvedZip = zip || jobSite?.zip || company.zip || "";
  const coordinates =
    location?.coordinates ||
    jobSite?.location?.coordinates ||
    company.location?.coordinates ||
    null;

  let resolved = resolveRateCardFromPlan(company.pricingPlan, {
    size: resolvedSize,
    zip: resolvedZip,
    regionName,
    coordinates,
  });

  // Company plan only counts as override when that size actually has prices
  if (resolved && !rateCardHasPricing(resolved.card)) {
    resolved = null;
  }

  // No company override → Market Pricing zone (same rates residential & commercial)
  if (!resolved) {
    try {
      const {
        findMatchingPricingZone,
        getGlobalPricingZone,
        findRateForSize,
      } = await import("./dumpsterZonePricing.js");

      const coords = Array.isArray(coordinates) ? coordinates : null;
      const loc = {
        zip: resolvedZip,
        state: company.state || "",
        stateCode: company.state || "",
        city: company.city || jobSite?.city || "",
        lng: coords?.[0] != null ? Number(coords[0]) : null,
        lat: coords?.[1] != null ? Number(coords[1]) : null,
      };
      const geoZone = await findMatchingPricingZone(loc);
      const zone = geoZone || (await getGlobalPricingZone());
      if (zone) {
        const sizeEnums = commercialSizeToDumbsterSizes(resolvedSize);
        let zoneRate = null;
        for (const sz of sizeEnums) {
          zoneRate = findRateForSize(zone, sz);
          if (zoneRate) break;
        }
        if (
          zoneRate &&
          (Number(zoneRate.threeDayPrice) > 0 ||
            Number(zoneRate.sevenDayPrice) > 0 ||
            Number(zoneRate.oneDayPrice) > 0)
        ) {
          const three =
            Number(zoneRate.threeDayPrice) ||
            Number(zoneRate.oneDayPrice) ||
            0;
          const seven =
            Number(zoneRate.sevenDayPrice) ||
            Number(zoneRate.threeDayPrice) ||
            0;
          resolved = {
            card: fillDerivedPackagePrices({
              size: resolvedSize,
              threeDayPrice: three,
              sevenDayPrice: seven,
              perDiemRate: Number(zoneRate.extraDay) || 0,
              includedTons:
                Number(zoneRate.includedTons) ||
                Number(dumpster?.tons) ||
                0,
              overagePerTon:
                Number(zoneRate.overagePerTon) ||
                Number(dumpster?.overagePerTon) ||
                0,
              overageEnforced: true,
            }),
            region: null,
            source: zone.isGlobal ? "market_global" : "market_zone",
            market: {
              id: zone._id,
              state: zone.state,
              market: zone.market,
              isGlobal: Boolean(zone.isGlobal),
            },
          };
        }
      }
    } catch (err) {
      // Market pricing optional — fall through to commercial global / dumpster
      console.error("commercial market zone resolve failed:", err?.message || err);
    }
  }

  // Still nothing → Global Commercial Pricing (synced from dumpster commercial rates)
  if (!resolved) {
    const globalDoc = await ensureGlobalCommercialPricing();
    const globalCard = (globalDoc.rateCards || []).find(
      (c) => normalizeCommercialSize(c.size) === resolvedSize,
    );
    if (rateCardHasPricing(globalCard)) {
      resolved = {
        card: { size: resolvedSize, ...fillDerivedPackagePrices(globalCard) },
        region: null,
        source: "commercial_global",
      };
    }
  }

  // Last resort: dumpster company_* / base catalog
  if (!resolved) {
    const fallbackCard = rateCardFromDumbster(dumpster);
    resolved = {
      card: { size: resolvedSize, ...fallbackCard },
      region: null,
      source: "dumbster_global",
    };
  }

  const isEmptyRedeliver =
    rotationType === "empty_redeliver" ||
    rotationType === "swap" ||
    rotationType === "exchange";

  let negotiatedFlat = null;
  if (termsEnabled && sizeTerms) {
    if (isEmptyRedeliver && sizeTerms.emptyAndRedeliver != null) {
      negotiatedFlat = Number(sizeTerms.emptyAndRedeliver);
    } else if (!isEmptyRedeliver && sizeTerms.initialDelivery != null) {
      negotiatedFlat = Number(sizeTerms.initialDelivery);
    }
  }

  let unitPackagePrice;
  let unitPerDiemCharge;
  let packageQuote;
  let quoteSource = resolved.source;

  if (negotiatedFlat != null && !Number.isNaN(negotiatedFlat)) {
    const includedDays = negotiatedDays || days;
    const extraDayRate =
      activeTerms?.extraDay != null
        ? Number(activeTerms.extraDay)
        : Number(resolved.card.perDiemRate) || 0;
    const extraDays = Math.max(0, days - includedDays);
    unitPackagePrice = negotiatedFlat;
    unitPerDiemCharge = extraDays * extraDayRate;
    packageQuote = {
      packageDays: includedDays,
      price: negotiatedFlat,
      extraDays,
      perDiemCharge: unitPerDiemCharge,
    };
    quoteSource = isEmptyRedeliver
      ? "negotiated_empty_redeliver"
      : "negotiated_initial_delivery";
  } else {
    packageQuote = pickPackage(resolved.card, days);
    unitPackagePrice = packageQuote.price;
    unitPerDiemCharge = packageQuote.perDiemCharge;
    // Negotiated extra-day rate can still override per-diem when set
    if (termsEnabled && activeTerms?.extraDay != null) {
      const extraDays = packageQuote.extraDays || 0;
      unitPerDiemCharge = extraDays * Number(activeTerms.extraDay);
      packageQuote = { ...packageQuote, perDiemCharge: unitPerDiemCharge };
    }
  }

  const unitTotal = unitPackagePrice + unitPerDiemCharge;
  const total = Math.round(unitTotal * qty * 100) / 100;

  const includedTons =
    termsEnabled && activeTerms?.includedTonsPerRotation != null
      ? Number(activeTerms.includedTonsPerRotation)
      : Number(resolved.card.includedTons) || 0;
  const overagePerTon =
    termsEnabled && activeTerms?.overagePerTon != null
      ? Number(activeTerms.overagePerTon)
      : Number(resolved.card.overagePerTon) || 0;
  const perDiemRate =
    termsEnabled && activeTerms?.extraDay != null
      ? Number(activeTerms.extraDay)
      : Number(resolved.card.perDiemRate) || 0;

  return {
    companyId: company._id.toString(),
    jobSiteId: jobSite?._id?.toString() || null,
    size: resolvedSize,
    numDays: days,
    quantity: qty,
    rotationType: isEmptyRedeliver ? "empty_redeliver" : "initial",
    planType: company.pricingPlan?.planType || null,
    region: resolved.region
      ? { name: resolved.region.name, zips: resolved.region.zips || [] }
      : null,
    source: quoteSource,
    market: resolved.market || null,
    negotiatedTermsApplied: Boolean(
      negotiatedFlat != null ||
        (termsEnabled &&
          (activeTerms?.extraDay != null ||
            activeTerms?.overagePerTon != null ||
            activeTerms?.includedTonsPerRotation != null)),
    ),
    dumbsterId: dumpster?._id?.toString() || null,
    breakdown: {
      packageDays: packageQuote.packageDays,
      packagePrice: unitPackagePrice,
      extraDays: packageQuote.extraDays,
      perDiemRate,
      perDiemCharge: unitPerDiemCharge,
      quantity: qty,
      unitTotal,
      total,
    },
    tonnage: {
      includedTons,
      overagePerTon,
      overageEnforced: Boolean(resolved.card.overageEnforced),
    },
    paymentMethod: company.paymentMethod || "card",
    invoiceTerms: company.invoiceTerms || { netDays: 30, creditLimit: 0 },
    price: total,
  };
}

export function computeOverageCharge({
  actualWeight,
  includedTons,
  overagePerTon,
  overageEnforced,
}) {
  const actual = Number(actualWeight) || 0;
  const included = Number(includedTons) || 0;
  const rate = Number(overagePerTon) || 0;
  const overageTons = Math.max(0, actual - included);
  const amount = overageTons * rate;
  return {
    overageTons,
    amount,
    billed: Boolean(overageEnforced) && amount > 0,
    mayApply: !overageEnforced && overageTons > 0,
  };
}

export function isCommercialOrder(order) {
  if (!order) return false;
  return Boolean(order.company);
}
