import mongoose from "mongoose";
import Dumbster from "../models/Dumbster.js";
import OperatorGrowthProfile from "../models/OperatorGrowthProfile.js";
import Company from "../models/Company.js";
import {
  findNearbyDustbinProviders,
  resolveCompanyTopTier,
} from "./dustbinMatching.js";
import { computeSplitFromLines } from "./builderOfferFees.js";
import {
  commercialSizeToDumbsterSizes,
  normalizeCommercialSize,
} from "./commercialPricing.js";

function isPrimaryOfferLine(line) {
  return line?.lineType === "bin" || line?.lineType === "service_visit";
}

/**
 * Require inventory size to match the commercial line size.
 * Missing size on dumpster inventory = not eligible (do not treat as match-all).
 */
function inventoryMatchesLine(bin, line, serviceType) {
  const wanted = normalizeCommercialSize(line.size) || String(line.size || "");
  if (!wanted) return true;

  if (serviceType === "dumpster" || !serviceType) {
    const fromCommercial = normalizeCommercialSize(bin.commercialSize);
    if (fromCommercial) return fromCommercial === wanted;

    const raw =
      bin.size ||
      bin.dumbster?.size ||
      (typeof bin.dumbster === "object" && bin.dumbster?.size) ||
      "";
    const fromInventory = normalizeCommercialSize(raw);
    if (fromInventory) return fromInventory === wanted;

    // Fallback: allow if dumbster size enum is in the commercial→catalog map
    const allowed = commercialSizeToDumbsterSizes(wanted);
    const catalog = String(raw || "").trim();
    if (catalog && allowed.includes(catalog)) return true;

    // No resolvable size → cannot claim a sized dumpster line
    return false;
  }

  if (serviceType === "porta") {
    const portaKey = String(
      bin.commercialSize ||
        bin.size ||
        bin.portaPotty?.unit_type ||
        bin.portaPotty?.size ||
        "",
    );
    if (!portaKey) return true;
    return (
      portaKey === String(line.size) ||
      portaKey.toLowerCase().includes(String(line.size).toLowerCase())
    );
  }

  // junk / tree / service visits — size keys are catalog units; soft match
  const soft = String(
    bin.commercialSize || bin.size || bin.dumbster?.size || "",
  );
  if (!soft) return true;
  return (
    normalizeCommercialSize(soft) === wanted ||
    soft === String(line.size) ||
    soft.toLowerCase().includes(String(line.size).toLowerCase())
  );
}

/** Attach catalog size onto aggregated dustbin docs for size filtering. */
async function hydrateDustbinCatalogSizes(dustbins = []) {
  const dumbsterIds = [];
  for (const bin of dustbins) {
    const d = bin?.dumbster;
    if (d && typeof d !== "object") dumbsterIds.push(d);
    else if (d?._id && d.size == null) dumbsterIds.push(d._id);
  }

  const dumbsters = dumbsterIds.length
    ? await Dumbster.find({ _id: { $in: dumbsterIds } }).select("size").lean()
    : [];
  const dumbsterById = Object.fromEntries(
    dumbsters.map((d) => [String(d._id), d]),
  );

  for (const bin of dustbins) {
    const dId =
      bin.dumbster && typeof bin.dumbster === "object"
        ? String(bin.dumbster._id || "")
        : String(bin.dumbster || "");
    if (dId && dumbsterById[dId]) {
      bin.dumbster = dumbsterById[dId];
      if (!bin.size) bin.size = dumbsterById[dId].size;
    }
  }
  return dustbins;
}

/** Exclude inventory with an expired insurance/registration date. */
function isInsuranceCurrent(bin, now = new Date()) {
  const exp = bin?.insurance_expiry_date || bin?.expiry_date;
  if (!exp) return true;
  const d = new Date(exp);
  if (Number.isNaN(d.getTime())) return true;
  return d >= now;
}

/** Dumpster commercial work expects rolloff-style hauling when type is set. */
function hasHaulingCapability(bin, serviceType) {
  if (serviceType && serviceType !== "dumpster") return true;
  const t = String(bin?.type || "").toLowerCase();
  if (!t) return true;
  return t === "rolloff" || t === "trailor" || t === "trailer";
}

function turnaroundLabel(offer) {
  const key = offer.exchangeTurnaround;
  if (!key) return "";
  if (key === "custom") return offer.exchangeTurnaroundCustom || "Custom";
  if (key === "same_day") return "Same-Day Exchanges";
  if (key === "within_24_hours") return "24-Hour Exchanges";
  if (key === "within_48_hours") return "48-Hour Exchanges";
  if (key === "scheduled_day") {
    const d = offer.exchangeTurnaroundDate
      ? new Date(offer.exchangeTurnaroundDate).toLocaleDateString()
      : "";
    return d ? `Scheduled Day · ${d}` : "Scheduled Day Exchanges";
  }
  return String(key).replace(/_/g, " ");
}

function exchangeModeLabel(offer) {
  if (offer.exchangeMode === "automatic") {
    return `Automatic Exchange Every ${offer.exchangeEveryDays || "—"} Days`;
  }
  if (offer.exchangeMode === "manual") {
    return "Manual — Request Pickup / Empty & Redeliver";
  }
  return "";
}

function buildUnitBreakdown(offer) {
  const map = new Map();
  for (const line of offer.lines || []) {
    if (!isPrimaryOfferLine(line)) continue;
    const qty = Number(line.quantityRemaining ?? line.quantity) || 0;
    if (qty <= 0) continue;
    const size = String(line.size || "");
    map.set(size, (map.get(size) || 0) + qty);
  }
  return [...map.entries()].map(([size, qty]) => ({ size, quantity: qty }));
}

function unitBreakdownLabel(breakdown, serviceType) {
  if (!breakdown.length) return "";
  return breakdown
    .map(({ size, quantity }) =>
      serviceType === "dumpster" || !serviceType
        ? `${quantity} × ${size}YD`
        : `${quantity} × ${size}`,
    )
    .join(", ");
}

function scheduleUnitPrices(offer) {
  const deliveryPrices = {};
  let exchangeUnitPrice = null;
  for (const row of offer.pricingSchedule || []) {
    if (
      row.lineType === "exchange_pull" &&
      Number(row.unitBuilderPrice) > 0
    ) {
      exchangeUnitPrice = Number(row.unitBuilderPrice);
    }
    if (
      row.size &&
      (row.lineType === "bin" || row.lineType === "service_visit") &&
      Number(row.unitBuilderPrice) > 0
    ) {
      deliveryPrices[String(row.size)] = Number(row.unitBuilderPrice);
    }
  }
  // Fallback: primary lines
  for (const line of offer.lines || []) {
    if (!isPrimaryOfferLine(line)) continue;
    const size = String(line.size || "");
    if (size && deliveryPrices[size] == null && Number(line.unitBuilderPrice) > 0) {
      deliveryPrices[size] = Number(line.unitBuilderPrice);
    }
  }
  return { deliveryPrices, exchangeUnitPrice };
}

function builderOfferingLabel(deliveryPrices, exchangeUnitPrice, serviceType) {
  const vals = Object.values(deliveryPrices || {});
  const delivery =
    vals.length === 1
      ? vals[0]
      : vals.length > 1
        ? Math.min(...vals) === Math.max(...vals)
          ? vals[0]
          : null
        : null;
  const parts = [];
  if (delivery != null) {
    parts.push(
      `$${Math.round(delivery)} Per ${
        serviceType === "dumpster" || !serviceType ? "Dumpster" : "Unit"
      }`,
    );
  } else if (vals.length) {
    parts.push(
      `$${Math.round(Math.min(...vals))}–$${Math.round(Math.max(...vals))} Per Delivery`,
    );
  }
  if (exchangeUnitPrice != null) {
    parts.push(`$${Math.round(exchangeUnitPrice)} Exchange`);
  }
  return parts.length ? `Builder Offering: ${parts.join(" / ")}` : "";
}

/**
 * Priority score for dispatch order (#16).
 * Higher = notify / prefer first. Acceptance among eligible is still first-claim.
 */
export function scoreProviderPriority({
  commercialEligible = false,
  docsCurrent = true,
  tier = 1,
  avgRating = 0,
  onTimeRate = 0,
  acceptanceRate = 0,
  minDistanceMeters = null,
  eligibleBins = 0,
  binsRemaining = 0,
}) {
  let score = 0;
  if (commercialEligible) score += 40;
  if (docsCurrent) score += 15;
  else score -= 25;
  score += Math.min(25, Number(tier) * 5);
  score += Math.min(20, Number(avgRating) * 4);
  score += Math.min(15, Number(onTimeRate) / 5);
  score += Math.min(10, Number(acceptanceRate) / 10);
  if (minDistanceMeters != null && Number.isFinite(minDistanceMeters)) {
    const miles = minDistanceMeters / 1609.34;
    score += Math.max(0, 30 - miles); // closer = higher
  }
  if (binsRemaining > 0 && eligibleBins >= binsRemaining) {
    score += 20; // can cover full remaining
  } else {
    score += Math.min(10, eligibleBins);
  }
  return Math.round(score * 10) / 10;
}

/**
 * Score eligible inventory per provider for an open Builder Offer.
 * Filters: service area + distance, size, quantity/dates, insurance current,
 * hauling type, provider status, commercial growth gate (soft), performance tier.
 * Does not notify providers with 0 eligible bins.
 */
export async function matchBuilderOfferPortions(offer, { onlineOnly = true } = {}) {
  const companyId = offer.company?._id || offer.company;
  let companyDoc = null;
  if (
    offer.company &&
    typeof offer.company === "object" &&
    (offer.company.companyName || offer.company.legalBusinessName)
  ) {
    companyDoc = offer.company;
  } else if (companyId) {
    try {
      companyDoc = await Company.findById(companyId)
        .select(
          "companyName legalBusinessName email phone logo address city state zip primaryContact",
        )
        .lean();
    } catch {
      companyDoc = null;
    }
  }
  const companyInfo = companyDoc
    ? {
        _id: String(companyDoc._id || companyId),
        companyName:
          companyDoc.companyName || companyDoc.legalBusinessName || "",
        legalBusinessName:
          companyDoc.legalBusinessName || companyDoc.companyName || "",
        email: companyDoc.email || "",
        phone: companyDoc.phone || "",
        logo: companyDoc.logo || "",
        address: companyDoc.address || "",
        city: companyDoc.city || "",
        state: companyDoc.state || "",
        zip: companyDoc.zip || "",
        primaryContact: companyDoc.primaryContact || null,
      }
    : null;

  const serviceType = offer.serviceType || "dumpster";
  const tierMeta = await resolveCompanyTopTier(companyId);
  const openBinLines = (offer.lines || []).filter(
    (line) =>
      isPrimaryOfferLine(line) &&
      Number(line.quantityRemaining) > 0 &&
      line.status !== "cancelled" &&
      line.status !== "fulfilled",
  );

  const { deliveryPrices, exchangeUnitPrice } = scheduleUnitPrices(offer);
  const unitBreakdown = buildUnitBreakdown(offer);
  const now = new Date();

  /** @type {Map<string, any>} */
  const byProvider = new Map();

  for (const line of openBinLines) {
    const coords = line.location?.coordinates || line.placementGeo?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;
    const [longitude, latitude] = coords;
    const start = new Date(line.deliveryDate);
    const end = new Date(start);
    end.setDate(
      end.getDate() + Number(line.rentalDays || offer.rentalPeriodDays || 30),
    );

    const remaining = Number(line.quantityRemaining) || 0;
    const { providers, dustbins: rawDustbins } = await findNearbyDustbinProviders({
      serviceQuery: {},
      start_date: start,
      end_date: end,
      quantity: 1,
      latitude,
      longitude,
      companyId,
      topTier: tierMeta.topTier,
      // Fan out to all capable tiers — do not drop lower bands for commercial.
      cascade: false,
      onlineOnly,
    });
    const dustbins = await hydrateDustbinCatalogSizes(rawDustbins || []);

    const capacityByOwner = new Map();
    const distanceByOwner = new Map();

    for (const bin of dustbins || []) {
      const ownerId = bin.user?._id?.toString() || bin.user?.toString();
      if (!ownerId) continue;
      if (!inventoryMatchesLine(bin, line, serviceType)) continue;
      if (!isInsuranceCurrent(bin, now)) continue;
      if (!hasHaulingCapability(bin, serviceType)) continue;

      const qty = Math.max(
        0,
        Number(bin.quantity || 1) -
          (Array.isArray(bin.bookings)
            ? bin.bookings
                .filter((b) => {
                  if (!b?.startDate || !b?.endDate) return false;
                  return (
                    new Date(b.startDate) <= end && new Date(b.endDate) >= start
                  );
                })
                .reduce((sum, b) => sum + (Number(b.quantity) || 1), 0)
            : 0),
      );
      if (qty <= 0) continue;
      const prev = capacityByOwner.get(ownerId) || 0;
      capacityByOwner.set(ownerId, prev + qty);

      const dist = Number(bin.distanceInMeters);
      if (Number.isFinite(dist)) {
        const prevDist = distanceByOwner.get(ownerId);
        if (prevDist == null || dist < prevDist) {
          distanceByOwner.set(ownerId, dist);
        }
      }
    }

    for (const provider of providers || []) {
      const providerId = provider.userId;
      const capacity = capacityByOwner.get(providerId) || 0;
      if (capacity <= 0) continue;
      const eligibleForLine = Math.min(remaining, capacity);

      if (!byProvider.has(providerId)) {
        byProvider.set(providerId, {
          providerId,
          fcmtoken: provider.fcmtoken,
          email: provider.email,
          tier: provider.operatorTier || 1,
          eligibleBins: 0,
          locations: new Set(),
          sizes: new Set(),
          lineEligibilities: [],
          payoutLines: [],
          minDistanceMeters: distanceByOwner.get(providerId) ?? null,
        });
      }
      const entry = byProvider.get(providerId);
      entry.eligibleBins += eligibleForLine;
      const d = distanceByOwner.get(providerId);
      if (
        d != null &&
        (entry.minDistanceMeters == null || d < entry.minDistanceMeters)
      ) {
        entry.minDistanceMeters = d;
      }
      if (line.city) entry.locations.add(line.city);
      if (line.state) entry.locations.add(line.state);
      entry.sizes.add(String(line.size));
      entry.lineEligibilities.push({
        lineId: line._id.toString(),
        size: line.size,
        jobsiteId: line.jobsite?.toString?.() || String(line.jobsite),
        siteName: line.siteName,
        city: line.city,
        state: line.state || "",
        quantityRemaining: remaining,
        eligibleQuantity: eligibleForLine,
        unitBuilderPrice: line.unitBuilderPrice,
        feeEligible: line.feeEligible !== false,
        deliveryDate: line.deliveryDate,
        deliveryWindow: line.deliveryWindow || offer.deliveryWindow || "",
        rentalDays: line.rentalDays,
        placementInstructions: line.placementInstructions || "",
        projectName: line.projectName || "",
        jobNumber: line.jobNumber || "",
        poNumber: line.poNumber || "",
        siteContactName: line.siteContactName || "",
        siteContactPhone: line.siteContactPhone || "",
      });
      entry.payoutLines.push({
        amount: eligibleForLine * Number(line.unitBuilderPrice || 0),
        feeEligible: line.feeEligible !== false,
      });
    }
  }

  const providerIds = [...byProvider.keys()];
  const growthProfiles = providerIds.length
    ? await OperatorGrowthProfile.find({ operator: { $in: providerIds } })
        .select("operator qualityGate")
        .lean()
    : [];
  const growthByOperator = Object.fromEntries(
    growthProfiles.map((g) => [String(g.operator), g]),
  );

  const portions = [];
  for (const entry of byProvider.values()) {
    if (entry.eligibleBins <= 0) continue;

    const growth = growthByOperator[String(entry.providerId)];
    const gate = growth?.qualityGate || {};
    const commercialEligible = Boolean(gate.commercialEligible);
    // Prefer docsCurrent when known; missing/false only affects ranking, not eligibility
    const docsCurrent = gate.docsCurrent === true;

    const split = computeSplitFromLines(entry.payoutLines);
    const locationLabel =
      Array.from(entry.locations).filter(Boolean).join(", ") ||
      offer.regionLabel ||
      "";

    const priorityScore = scoreProviderPriority({
      commercialEligible,
      docsCurrent,
      tier: entry.tier,
      avgRating: gate.rating || 0,
      onTimeRate: gate.onTimeRate || 0,
      acceptanceRate: 0,
      minDistanceMeters: entry.minDistanceMeters,
      eligibleBins: entry.eligibleBins,
      binsRemaining: Number(offer.binsRemaining) || 0,
    });

    portions.push({
      kind: "builder_offer",
      offerId: offer._id.toString(),
      company: companyInfo,
      companyName:
        companyInfo?.companyName || companyInfo?.legalBusinessName || "",
      title: offer.title,
      regionLabel: offer.regionLabel,
      serviceType: offer.serviceType || "dumpster",
      commercialOpportunity: true,
      builderContractValue: offer.builderTotal,
      totalProviderPayoutPool: offer.providerPayoutTotal,
      jobsitesCount: new Set(
        (offer.lines || [])
          .filter((l) => isPrimaryOfferLine(l))
          .map((l) => String(l.jobsite)),
      ).size,
      binsRequested: offer.binsRequested,
      binsRemaining: offer.binsRemaining,
      rentalPeriodDays: offer.rentalPeriodDays,
      fulfillmentPreference: offer.fulfillmentPreference,
      allowCounteroffers: Boolean(offer.allowCounteroffers),
      material: offer.material,
      materialOther: offer.materialOther,
      includedTonnage: offer.includedTonnage,
      additionalTonnageRate: offer.additionalTonnageRate,
      additionalDayRate: offer.additionalDayRate,
      exchangeMode: offer.exchangeMode,
      exchangeEveryDays: offer.exchangeEveryDays,
      exchangeTurnaround: offer.exchangeTurnaround,
      exchangeTurnaroundCustom: offer.exchangeTurnaroundCustom,
      exchangeTurnaroundDate: offer.exchangeTurnaroundDate,
      exchangeRequirements: offer.exchangeRequirements || "",
      advanceNotice: offer.advanceNotice,
      deliveryWindow: offer.deliveryWindow || "",
      finalPickupMode: offer.finalPickupMode,
      finalPickupDate: offer.finalPickupDate,
      authorizedPickupName: offer.authorizedPickupName || "",
      authorizedPickupPhone: offer.authorizedPickupPhone || "",
      placementContactPhone: offer.placementContactPhone || "",
      eachServiceIsSeparateOrder: offer.eachServiceIsSeparateOrder !== false,
      unitBreakdown,
      unitBreakdownLabel: unitBreakdownLabel(unitBreakdown, serviceType),
      locationSummary: locationLabel,
      turnaroundLabel: turnaroundLabel(offer),
      exchangeModeLabel: exchangeModeLabel(offer),
      deliveryUnitPrices: deliveryPrices,
      exchangeUnitPrice,
      builderOfferingLabel: builderOfferingLabel(
        deliveryPrices,
        exchangeUnitPrice,
        serviceType,
      ),
      providerId: entry.providerId,
      fcmtoken: entry.fcmtoken,
      email: entry.email,
      eligibleBins: entry.eligibleBins,
      locations: Array.from(entry.locations),
      sizesRequired: Array.from(entry.sizes),
      minDistanceMeters: entry.minDistanceMeters,
      commercialEligible,
      docsCurrent,
      priorityScore,
      yourAvailablePortion: split.providerPayoutTotal,
      yourBuilderPortion: split.builderTotal,
      yourPlatformFee: split.platformFeeTotal,
      lineEligibilities: entry.lineEligibilities,
      singleProviderMustCoverAll:
        offer.fulfillmentPreference === "single_provider",
      canAcceptPartial: offer.fulfillmentPreference === "multiple_providers",
    });
  }

  // single_provider: only providers who can cover all remaining bins
  let result = portions;
  if (offer.fulfillmentPreference === "single_provider") {
    const need = Number(offer.binsRemaining) || 0;
    result = portions.filter((p) => p.eligibleBins >= need);
  }

  // #16: higher priority first (performance, proximity, commercial eligibility…)
  result.sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));

  return result;
}

/**
 * Recompute remaining capacity for a specific provider against current offer lines.
 */
export async function getProviderEligibleSelections(offer, providerId) {
  const portions = await matchBuilderOfferPortions(offer, { onlineOnly: false });
  return portions.find((p) => p.providerId === String(providerId)) || null;
}

export function summarizeOfferProgress(offer) {
  const binLines = (offer.lines || []).filter(
    (l) => l.lineType === "bin" || l.lineType === "service_visit",
  );
  const binsRequested = binLines.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
  const binsCommitted = binLines.reduce(
    (s, l) => s + (Number(l.quantityCommitted) || 0),
    0,
  );
  const binsRemaining = Math.max(0, binsRequested - binsCommitted);
  const fulfillmentPct =
    binsRequested > 0
      ? Math.round((binsCommitted / binsRequested) * 1000) / 10
      : 0;
  return { binsRequested, binsCommitted, binsRemaining, fulfillmentPct };
}

export function recomputeOfferEconomics(offer) {
  const feeLines = (offer.lines || []).map((line) => {
    const qty = Number(line.quantity) || 0;
    const isPrimary =
      line.lineType === "bin" || line.lineType === "service_visit";
    const amount = isPrimary
      ? (Number(line.unitBuilderPrice) || 0) * qty
      : Number(line.lineBuilderTotal) ||
        (Number(line.unitBuilderPrice) || 0) * qty;
    return {
      amount,
      feeEligible: line.feeEligible !== false,
    };
  });
  return computeSplitFromLines(feeLines);
}

export function deriveOfferStatus(offer) {
  if (["cancelled", "expired", "draft"].includes(offer.status)) {
    return offer.status;
  }
  const { binsRemaining, binsCommitted, binsRequested } =
    summarizeOfferProgress(offer);
  if (binsRequested > 0 && binsRemaining === 0) return "fulfilled";
  if (binsCommitted > 0 && binsRemaining > 0) {
    if (offer.status === "needs_adjustment") return "needs_adjustment";
    return "partially_fulfilled";
  }
  if (offer.status === "needs_adjustment") return "needs_adjustment";
  return "open";
}

export function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

/** Heuristic market recommendation from historical accept events. */
export function computeOfferRecommendation({
  offer,
  acceptEvents = [],
  rejectEvents = [],
}) {
  const current = Number(offer.builderTotal) || 0;
  const accepted = acceptEvents.length;
  const rejected = rejectEvents.length;
  const total = accepted + rejected;
  let estimatedFulfillmentPct = Number(offer.fulfillmentPct) || 0;

  if (total >= 3) {
    estimatedFulfillmentPct = Math.round((accepted / total) * 100);
  } else if (offer.binsRequested > 0) {
    estimatedFulfillmentPct = Math.round(
      ((Number(offer.binsCommitted) || 0) / offer.binsRequested) * 100,
    );
  }

  let recommendedTotal = current;
  let confidence = "low";
  if (estimatedFulfillmentPct < 70 && current > 0) {
    recommendedTotal = Math.round(current * 1.125 * 100) / 100;
    confidence = total >= 5 ? "high" : "medium";
  } else if (estimatedFulfillmentPct >= 85) {
    confidence = "high";
  }

  return {
    yourOffer: current,
    estimatedFulfillmentPct,
    recommendedOffer: recommendedTotal,
    estimatedFulfillmentAtRecommended:
      recommendedTotal > current
        ? "HIGH"
        : estimatedFulfillmentPct >= 70
          ? "HIGH"
          : "MEDIUM",
    confidence,
    sampleSize: total,
  };
}
