import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "../../utils/apiError.js";
import Company from "../../models/Company.js";
import JobSites from "../../models/JobSites.js";
import Order from "../../models/Order.js";
import User from "../../models/User.js";
import BuilderOffer from "../../models/BuilderOffer.js";
import BuilderOfferAllocation from "../../models/BuilderOfferAllocation.js";
import BuilderOfferCounter from "../../models/BuilderOfferCounter.js";
import BuilderOfferEvent from "../../models/BuilderOfferEvent.js";
import { computeSplitFromLines, createOffSessionHold } from "../../utils/paymentHold.js";
import {
  BUILDER_OFFER_SOCKET_EVENTS,
  BUILDER_OFFER_STUCK_HOURS,
  BUILDER_OFFER_EXPIRE_DAYS,
  LINE_TYPE_FEE_ELIGIBLE,
  unitKeysForService,
} from "../../constants/builderOffer.js";
import {
  computeOfferRecommendation,
  deriveOfferStatus,
  getProviderEligibleSelections,
  matchBuilderOfferPortions,
  recomputeOfferEconomics,
  summarizeOfferProgress,
} from "../../utils/builderOfferMatcher.js";
import { io } from "../../socket/socket.js";
import { sendNotification } from "../../utils/notifications.js";
import { notifyCommercialParties } from "../../utils/commercialNotify.js";
import { generateOTP } from "../../utils/Generator.js";
import Dustbin from "../../models/Dustbin.js";
import BillingRecord from "../../models/BillingRecord.js";
import logger from "../../config/logger.js";
import {
  commercialSizeToDumbsterSizes,
  normalizeCommercialSize,
} from "../../utils/commercialPricing.js";

function seasonOf(date = new Date()) {
  const m = date.getMonth();
  if (m < 2 || m === 11) return "winter";
  if (m < 5) return "spring";
  if (m < 8) return "summer";
  return "fall";
}

async function recordEvent({
  offer,
  actor,
  actorRole = "system",
  type,
  payload = {},
  extra = {},
}) {
  const firstBin = (offer.lines || []).find(
    (l) => l.lineType === "bin" || l.lineType === "service_visit",
  );
  await BuilderOfferEvent.create({
    offer: offer._id,
    company: offer.company,
    actor: actor || null,
    actorRole,
    type,
    payload,
    zip: firstBin?.zip || "",
    size: firstBin?.size || "",
    quantity: offer.binsRequested,
    rentalDays: offer.rentalPeriodDays,
    material: offer.material || "",
    tonnage: offer.includedTonnage,
    unitPrice: firstBin?.unitBuilderPrice ?? null,
    season: seasonOf(),
    ...extra,
  });
}

function emitToUser(userId, event, data) {
  if (!io || !userId) return;
  io.to(`user_${userId.toString()}`).emit(event, data);
}

function formatUsd(n) {
  const v = Number(n) || 0;
  return `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function defaultExpiresAt(from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() + BUILDER_OFFER_EXPIRE_DAYS);
  return d;
}

/**
 * Soft inventory hold: book provider dustbin capacity for accepted qty/dates
 * and attach dustbin to child order when possible.
 */
async function holdInventoryForAllocationLine({
  providerId,
  line,
  quantity,
  offer,
  orderId,
}) {
  const start = new Date(line.deliveryDate);
  const end = new Date(start);
  end.setDate(end.getDate() + Number(line.rentalDays || offer.rentalPeriodDays || 30));
  const sizeNeedle = String(line.size || "").replace(/\D/g, "");
  const wanted = normalizeCommercialSize(line.size) || sizeNeedle;
  const allowedCatalog = commercialSizeToDumbsterSizes(wanted);

  const candidates = await Dustbin.find({
    user: providerId,
    verify: true,
    status: "active",
  })
    .populate("dumbster", "size")
    .limit(40)
    .exec();

  let remaining = Number(quantity) || 0;
  const holds = [];
  for (const bin of candidates) {
    if (remaining <= 0) break;
    const commercialSize = bin.commercialSize
      ? normalizeCommercialSize(bin.commercialSize)
      : null;
    const catalogSize = String(bin.dumbster?.size || bin.size || "").trim();
    const normalizedCatalog = normalizeCommercialSize(catalogSize);
    const sizeOk =
      !wanted ||
      commercialSize === wanted ||
      normalizedCatalog === wanted ||
      (catalogSize && allowedCatalog.includes(catalogSize));
    if (!sizeOk) continue;

    const booked = (bin.bookings || [])
      .filter((b) => {
        if (!b?.startDate || !b?.endDate) return false;
        return new Date(b.startDate) <= end && new Date(b.endDate) >= start;
      })
      .reduce((sum, b) => sum + (Number(b.quantity) || 1), 0);
    const free = Math.max(0, Number(bin.quantity || 1) - booked);
    if (free <= 0) continue;
    const take = Math.min(free, remaining);
    bin.bookings = bin.bookings || [];
    bin.bookings.push({
      startDate: start,
      endDate: end,
      quantity: take,
      order: orderId || null,
      source: "builder_offer",
    });
    if (typeof bin.availableQuantity === "number") {
      bin.availableQuantity = Math.max(0, Number(bin.availableQuantity) - take);
    }
    await bin.save();
    holds.push({
      dustbinId: bin._id,
      quantity: take,
      startDate: start,
      endDate: end,
      orderId: orderId || null,
    });
    remaining -= take;
  }
  return holds;
}

async function releaseInventoryHolds(holds = []) {
  for (const hold of holds) {
    if (!hold?.dustbinId) continue;
    const bin = await Dustbin.findById(hold.dustbinId);
    if (!bin) continue;
    const startMs = hold.startDate ? new Date(hold.startDate).getTime() : null;
    const endMs = hold.endDate ? new Date(hold.endDate).getTime() : null;
    bin.bookings = (bin.bookings || []).filter((b) => {
      if (hold.orderId && b.order && String(b.order) === String(hold.orderId)) {
        return false;
      }
      if (
        b.source === "builder_offer" &&
        startMs &&
        endMs &&
        new Date(b.startDate).getTime() === startMs &&
        new Date(b.endDate).getTime() === endMs &&
        Number(b.quantity) === Number(hold.quantity)
      ) {
        return false;
      }
      return true;
    });
    if (typeof bin.availableQuantity === "number") {
      bin.availableQuantity =
        Number(bin.availableQuantity) + (Number(hold.quantity) || 0);
    }
    await bin.save();
  }
}

/**
 * Settle builder money for one allocation: invoice AR or card hold.
 * One BillingRecord per allocation with per-size line items.
 */
function resolveOfferLine(offer, lineId) {
  if (!offer?.lines || lineId == null) return null;
  if (typeof offer.lines.id === "function") {
    return offer.lines.id(lineId) || null;
  }
  return (
    (offer.lines || []).find((l) => String(l._id) === String(lineId)) || null
  );
}

function buildFulfillmentBreakdown(offer) {
  const binLines = (offer.lines || []).filter((l) => {
    const t = l.lineType || "bin";
    return t === "bin" || t === "service_visit";
  });
  const byJobsiteMap = new Map();
  const bySizeMap = new Map();

  for (const line of binLines) {
    const qty = Number(line.quantity) || 0;
    const remaining = Number(line.quantityRemaining) || 0;
    const committed =
      line.quantityCommitted != null
        ? Number(line.quantityCommitted) || 0
        : Math.max(0, qty - remaining);
    const siteKey = String(line.jobsite || line.siteName || line.city || "unknown");
    const siteLabel = line.siteName || line.city || "Jobsite";
    if (!byJobsiteMap.has(siteKey)) {
      byJobsiteMap.set(siteKey, {
        jobsiteId: line.jobsite ? String(line.jobsite) : null,
        siteName: siteLabel,
        city: line.city || "",
        state: line.state || "",
        requested: 0,
        committed: 0,
        remaining: 0,
        sizes: [],
      });
    }
    const site = byJobsiteMap.get(siteKey);
    site.requested += qty;
    site.committed += committed;
    site.remaining += remaining;
    site.sizes.push({
      size: line.size,
      lineId: line._id ? String(line._id) : null,
      requested: qty,
      committed,
      remaining,
      fulfillmentPct: qty > 0 ? Math.round((committed / qty) * 100) : 0,
    });

    const sizeKey = String(line.size || "?");
    if (!bySizeMap.has(sizeKey)) {
      bySizeMap.set(sizeKey, {
        size: line.size,
        requested: 0,
        committed: 0,
        remaining: 0,
      });
    }
    const sizeRow = bySizeMap.get(sizeKey);
    sizeRow.requested += qty;
    sizeRow.committed += committed;
    sizeRow.remaining += remaining;
  }

  const byJobsite = [...byJobsiteMap.values()].map((s) => ({
    ...s,
    fulfillmentPct:
      s.requested > 0 ? Math.round((s.committed / s.requested) * 100) : 0,
  }));
  const bySize = [...bySizeMap.values()].map((s) => ({
    ...s,
    fulfillmentPct:
      s.requested > 0 ? Math.round((s.committed / s.requested) * 100) : 0,
  }));
  const openLines = binLines.filter(
    (l) => (Number(l.quantityRemaining) || 0) > 0,
  ).length;
  const fullyFulfilledLines = binLines.length - openLines;

  return {
    byJobsite,
    bySize,
    lineCount: binLines.length,
    openLines,
    fullyFulfilledLines,
  };
}

function serializeAllocationForDto(allocation) {
  if (!allocation) return allocation;
  const provider = allocation.provider;
  const providerObj =
    provider && typeof provider === "object" && !Array.isArray(provider)
      ? provider
      : null;
  const lines = (allocation.lines || []).map((al) => ({
    ...al,
    lineId: al.lineId,
  }));
  return {
    ...allocation,
    provider: providerObj
      ? {
          id: providerObj._id || providerObj.id,
          name: providerObj.name || providerObj.comp_name || "",
          email: providerObj.email || "",
          phone: providerObj.phone || "",
        }
      : provider,
    providerName:
      providerObj?.name ||
      providerObj?.comp_name ||
      allocation.providerName ||
      "",
    providerEmail: providerObj?.email || allocation.providerEmail || "",
    providerPhone: providerObj?.phone || allocation.providerPhone || "",
    lines,
  };
}

async function enrichLastMatchSnapshot(snapshot) {
  if (!snapshot?.portions?.length) return snapshot;
  const needsLookup = snapshot.portions.some(
    (p) => !p.providerName && !p.providerEmail && p.providerId,
  );
  if (!needsLookup) return snapshot;
  const ids = [
    ...new Set(
      snapshot.portions
        .map((p) => p.providerId)
        .filter(Boolean)
        .map(String),
    ),
  ];
  if (!ids.length) return snapshot;
  const users = await User.find({ _id: { $in: ids } })
    .select("name email phone comp_name")
    .lean();
  const byId = Object.fromEntries(users.map((u) => [String(u._id), u]));
  return {
    ...snapshot,
    portions: snapshot.portions.map((p) => {
      const u = byId[String(p.providerId)];
      if (!u) return p;
      return {
        ...p,
        providerName: p.providerName || u.name || u.comp_name || "",
        providerEmail: p.providerEmail || u.email || "",
        providerPhone: p.providerPhone || u.phone || "",
      };
    }),
  };
}

/**
 * Settle builder money for one allocation: invoice AR or card hold.
 * One BillingRecord per allocation with per-size line items.
 */
async function settleAllocationBilling({
  company,
  offer,
  allocation,
  ordersByLineIndex,
}) {
  const paymentMethod = company.paymentMethod || "invoice";
  allocation.paymentMethod = paymentMethod;

  if (paymentMethod === "card") {
    const owner = await User.findById(company.user).select("cus_id").lean();
    if (!owner?.cus_id) {
      throw new BadRequestError(
        "Company is set to card payment but has no Stripe customer on file",
      );
    }
    const hold = await createOffSessionHold({
      customerId: owner.cus_id,
      amountDollars: allocation.builderPortion,
      metadata: {
        source: "builder_offer",
        builderOfferId: offer._id.toString(),
        allocationId: allocation._id.toString(),
        companyId: company._id.toString(),
      },
    });
    if (!hold.success) {
      throw new BadRequestError(
        hold.message || "Unable to authorize card hold for builder offer portion",
      );
    }
    allocation.paymentHoldId = hold.paymentId;
  }

  const netDays = Number(company.invoiceTerms?.netDays) || 30;
  const dueDate = new Date();
  dueDate.setUTCDate(dueDate.getUTCDate() + netDays);

  const provider = await User.findById(allocation.provider)
    .select("name email phone comp_name")
    .lean();

  const jobsitesById = new Map();
  const lineItems = allocation.lines.map((al, i) => {
    const offerLine = resolveOfferLine(offer, al.lineId);
    const jobsiteId = offerLine?.jobsite ? String(offerLine.jobsite) : null;
    const siteName = offerLine?.siteName || "";
    const city = offerLine?.city || "";
    const state = offerLine?.state || "";
    if (jobsiteId) {
      jobsitesById.set(jobsiteId, {
        id: jobsiteId,
        siteName,
        city,
        state,
      });
    } else if (siteName) {
      const key = `name:${siteName}`;
      if (!jobsitesById.has(key)) {
        jobsitesById.set(key, {
          id: null,
          siteName,
          city,
          state,
        });
      }
    }
    return {
      type: "builder_offer",
      description: `Builder Offer ${offer.title || offer._id} · ${al.size}-yard × ${al.quantity}${siteName ? ` · ${siteName}` : ""}`,
      amount: Number(al.lineBuilderTotal) || 0,
      order: ordersByLineIndex[i]?._id || null,
      metadata: {
        source: "builder_offer",
        builderOfferId: offer._id.toString(),
        allocationId: allocation._id.toString(),
        lineId: al.lineId ? String(al.lineId) : null,
        size: al.size,
        quantity: al.quantity,
        unitBuilderPrice: al.unitBuilderPrice,
        feeEligible: al.feeEligible,
        platformFee: al.platformFee,
        providerPayout: al.providerPayout,
        jobsiteId,
        siteName,
        city,
        state,
        address: offerLine?.address || "",
        deliveryDate: offerLine?.deliveryDate || null,
        deliveryWindow: offerLine?.deliveryWindow || offer.deliveryWindow || "",
        rentalDays: offerLine?.rentalDays || offer.rentalPeriodDays || null,
        placementInstructions: offerLine?.placementInstructions || "",
        projectName: offerLine?.projectName || "",
        jobNumber: offerLine?.jobNumber || "",
        poNumber: offerLine?.poNumber || "",
        siteContactName: offerLine?.siteContactName || "",
        siteContactPhone: offerLine?.siteContactPhone || "",
      },
      createdAt: new Date(),
    };
  });

  const invoiceNumber = `INV-${generateOTP(8, { alphabet: true, numeric: true })}`;
  const firstOrderId = ordersByLineIndex.find(Boolean)?._id || null;
  const billingRecord = await BillingRecord.create({
    company: company._id,
    user: company.user,
    order: firstOrderId,
    invoiceNumber,
    status: "open",
    amount: allocation.builderPortion,
    dueDate,
    lineItems,
    metadata: {
      source: "builder_offer",
      builderOfferId: offer._id.toString(),
      allocationId: allocation._id.toString(),
      paymentMethod,
      paymentHoldId: allocation.paymentHoldId || null,
      offerTitle: offer.title || "",
      serviceType: offer.serviceType || "dumpster",
      binsAccepted: allocation.binsAccepted,
      platformFee: allocation.platformFee,
      providerPayout: allocation.providerPayout,
      providerId: allocation.provider ? String(allocation.provider) : null,
      providerName: provider?.name || provider?.comp_name || "",
      providerEmail: provider?.email || "",
      providerPhone: provider?.phone || "",
      jobsites: [...jobsitesById.values()],
      commercialTerms: {
        rentalPeriodDays: offer.rentalPeriodDays,
        advanceNotice: offer.advanceNotice,
        deliveryWindow: offer.deliveryWindow,
        exchangeMode: offer.exchangeMode,
        exchangeEveryDays: offer.exchangeEveryDays,
        exchangeTurnaround: offer.exchangeTurnaround,
        exchangeTurnaroundCustom: offer.exchangeTurnaroundCustom,
        exchangeTurnaroundDate: offer.exchangeTurnaroundDate,
        finalPickupMode: offer.finalPickupMode,
        finalPickupDate: offer.finalPickupDate,
        authorizedPickupName: offer.authorizedPickupName || "",
        authorizedPickupPhone: offer.authorizedPickupPhone || "",
        includedTonnage: offer.includedTonnage,
        additionalTonnageRate: offer.additionalTonnageRate,
        additionalDayRate: offer.additionalDayRate,
        material: offer.material,
        materialOther: offer.materialOther,
        eachServiceIsSeparateOrder: offer.eachServiceIsSeparateOrder !== false,
      },
      pricingSchedule: Array.isArray(offer.pricingSchedule)
        ? offer.pricingSchedule
        : [],
    },
  });

  for (const order of uniqueOrders(ordersByLineIndex)) {
    order.billingRecord = billingRecord._id;
    if (allocation.paymentHoldId) {
      order.paymentId = allocation.paymentHoldId;
      order.payment_type = "stripe";
    } else {
      order.payment_type = "invoice";
    }
    await order.save();
  }

  allocation.billingRecord = billingRecord._id;

  try {
    await notifyCommercialParties({
      actorId: company.user,
      customer: { _id: company.user, email: company.accountsPayableEmail },
      type: "invoice_created",
      title: "Builder offer invoice created",
      description: `Invoice ${invoiceNumber} for $${Number(allocation.builderPortion).toFixed(2)} was created for ${offer.title || "Builder Offer"}.`,
      orderId: firstOrderId?.toString?.() || firstOrderId,
      metadata: {
        action: "invoice_created",
        kind: "builder_offer",
        offerId: offer._id.toString(),
        invoiceId: billingRecord._id.toString(),
        invoiceNumber,
        screen: "builder_offer_detail",
      },
    });
  } catch (err) {
    logger.error("builder_offer.invoice_notify_failed", { error: err?.message });
  }

  return billingRecord;
}

/**
 * Socket + in-app notification + FCM push for a provider portion.
 * Mobile can deep-link later using metadata.kind / metadata.offerId.
 */
async function notifyProviderPortion({
  offer,
  portion,
  companyUserId,
}) {
  const providerId = portion.providerId;
  emitToUser(providerId, BUILDER_OFFER_SOCKET_EVENTS.portion, portion);

  let fcmtoken = portion.fcmtoken || "";
  let email = portion.email || "";
  if (!fcmtoken) {
    const provider = await User.findById(providerId)
      .select("fcmtoken email")
      .lean();
    fcmtoken = provider?.fcmtoken || "";
    email = email || provider?.email || "";
  }

  const region = offer.regionLabel || offer.title || "Commercial Opportunity";
  const title = "Commercial Opportunity";
  const units =
    portion.unitBreakdownLabel ||
    `up to ${portion.eligibleBins} units`;
  const offering =
    portion.builderOfferingLabel ||
    `Your available portion ${formatUsd(portion.yourAvailablePortion)}`;
  const description = [
    units,
    region,
    portion.material || null,
    portion.includedTonnage != null
      ? `${portion.includedTonnage} Tons Included`
      : null,
    portion.rentalPeriodDays
      ? `${portion.rentalPeriodDays}-Day Rental`
      : null,
    portion.turnaroundLabel || null,
    portion.exchangeModeLabel || null,
    offering,
  ]
    .filter(Boolean)
    .join(" · ");

  try {
    await sendNotification({
      user: (companyUserId || providerId).toString(),
      to_id: providerId.toString(),
      title,
      description,
      type: "offer",
      fcmtoken,
      email: "",
      isImportant: true,
      channelId: "bins_order_alerts",
      sound: "order_alert",
      metadata: {
        kind: "builder_offer",
        offerId: offer._id.toString(),
        screen: "builder_offer_portion",
        eligibleBins: String(portion.eligibleBins ?? 0),
        yourAvailablePortion: String(portion.yourAvailablePortion ?? 0),
        builderContractValue: String(portion.builderContractValue ?? 0),
        totalProviderPayoutPool: String(portion.totalProviderPayoutPool ?? 0),
        fulfillmentPreference: String(offer.fulfillmentPreference || ""),
        allowCounteroffers: String(Boolean(offer.allowCounteroffers)),
        priorityScore: String(portion.priorityScore ?? 0),
        priority: "high",
      },
    });
  } catch (err) {
    logger.error("builder_offer.portion_push_failed", {
      offerId: offer._id?.toString(),
      providerId: String(providerId),
      error: err?.message,
    });
  }
}

async function notifyCompanyOfferEvent({
  companyUserId,
  offer,
  title,
  description,
  eventKey,
}) {
  if (!companyUserId) return;
  const companyUser = await User.findById(companyUserId)
    .select("fcmtoken email")
    .lean();
  try {
    await sendNotification({
      user: companyUserId.toString(),
      to_id: companyUserId.toString(),
      title,
      description,
      type: "company",
      fcmtoken: companyUser?.fcmtoken || "",
      email: "",
      isImportant: true,
      metadata: {
        kind: "builder_offer",
        offerId: offer._id.toString(),
        screen: "builder_offer_detail",
        event: eventKey,
        fulfillmentPct: String(offer.fulfillmentPct ?? 0),
        binsRemaining: String(offer.binsRemaining ?? 0),
      },
    });
  } catch (err) {
    logger.error("builder_offer.company_push_failed", {
      offerId: offer._id?.toString(),
      error: err?.message,
    });
  }
}

async function emitToAdmins(event, data) {
  if (!io) return;
  const admins = await User.find({ type: "admin" }).select("_id").lean();
  for (const admin of admins) {
    emitToUser(admin._id, event, data);
  }
}

async function requireApprovedCompany(userId) {
  const company = await Company.findOne({ user: userId });
  if (!company) throw new NotFoundError("Company not found");
  if (company.status !== "approved") {
    throw new ForbiddenError("Company must be approved to use Builder Offers");
  }
  return company;
}

/** Soft company lookup for read-only list endpoints (no 403 while pending). */
async function getCompanyForUser(userId) {
  const company = await Company.findOne({ user: userId });
  if (!company) throw new NotFoundError("Company not found");
  return company;
}

function buildPricingMap(schedule = []) {
  const map = new Map();
  for (const item of schedule) {
    const key =
      item.key ||
      (item.size ? `bin_${item.size}` : item.lineType || "unknown");
    map.set(key, item);
    if (item.size) map.set(`size_${item.size}`, item);
  }
  return map;
}

async function hydrateLinesFromPayload(company, body) {
  const schedule = body.pricingSchedule || [];
  const priceMap = buildPricingMap(schedule);
  const linesIn = Array.isArray(body.lines) ? body.lines : [];
  if (!linesIn.length) throw new BadRequestError("At least one line is required");

  const serviceType = body.serviceType || "dumpster";
  const allowedSizes = new Set(unitKeysForService(serviceType));
  const primaryLineTypes = new Set(["bin", "service_visit"]);

  const lines = [];
  for (const raw of linesIn) {
    const lineType = raw.lineType || (serviceType === "dumpster" ? "bin" : "service_visit");
    const feeEligible =
      raw.feeEligible != null
        ? Boolean(raw.feeEligible)
        : LINE_TYPE_FEE_ELIGIBLE[lineType] !== false;

    if (primaryLineTypes.has(lineType) || lineType === "bin") {
      const jobsite = await JobSites.findOne({
        _id: raw.jobsiteId,
        company: company._id,
        status: { $ne: "deleted" },
      });
      if (!jobsite) {
        throw new BadRequestError(`Jobsite not found: ${raw.jobsiteId}`);
      }
      const size = String(raw.size);
      if (!allowedSizes.has(size)) {
        throw new BadRequestError(
          `Invalid unit "${size}" for serviceType ${serviceType}`,
        );
      }
      const qty = Math.max(1, Number(raw.quantity) || 1);
      const schedulePrice =
        priceMap.get(`size_${size}`)?.unitBuilderPrice ??
        priceMap.get(`bin_${size}`)?.unitBuilderPrice ??
        priceMap.get(`${lineType}_${size}`)?.unitBuilderPrice;
      const unitBuilderPrice = Number(
        raw.unitBuilderPrice ?? schedulePrice ?? 0,
      );
      if (unitBuilderPrice <= 0) {
        throw new BadRequestError(`Missing unit price for ${size} line`);
      }
      const rentalDays = Math.max(
        1,
        Number(raw.rentalDays || body.rentalPeriodDays || 30),
      );
      const deliveryDate = new Date(raw.deliveryDate);
      if (Number.isNaN(deliveryDate.getTime())) {
        throw new BadRequestError("Invalid deliveryDate on line");
      }

      const material =
        raw.material != null ? String(raw.material) : body.material || "";
      const materialOther =
        raw.materialOther != null
          ? String(raw.materialOther)
          : body.materialOther || "";

      lines.push({
        jobsite: jobsite._id,
        siteName: jobsite.siteName || "",
        projectName:
          raw.projectName ||
          jobsite.projectName ||
          jobsite.communityName ||
          "",
        jobNumber: raw.jobNumber || jobsite.jobNumber || "",
        poNumber: raw.poNumber || jobsite.poNumber || "",
        costCode: raw.costCode || jobsite.costCode || "",
        billingReference:
          raw.billingReference || jobsite.billingReference || "",
        communityName:
          raw.communityName || jobsite.communityName || "",
        division: raw.division || jobsite.division || "",
        authorizedUsers:
          raw.authorizedUsers || jobsite.authorizedUsers || "",
        serviceInstructions:
          raw.serviceInstructions ||
          jobsite.serviceInstructions ||
          jobsite.instructions ||
          "",
        gateAccessInstructions:
          raw.gateAccessInstructions ||
          jobsite.gateAccessInstructions ||
          "",
        deliveryRestrictions:
          raw.deliveryRestrictions ||
          jobsite.deliveryRestrictions ||
          "",
        hoursAllowedOnsite:
          raw.hoursAllowedOnsite || jobsite.hoursAllowedOnsite || "",
        materialRestrictions:
          raw.materialRestrictions ||
          jobsite.materialRestrictions ||
          "",
        address: jobsite.address || "",
        city: jobsite.city || "",
        state: jobsite.state || "",
        zip: jobsite.zip || company.zip || "",
        location: jobsite.location,
        size,
        quantity: qty,
        quantityCommitted: 0,
        quantityRemaining: qty,
        deliveryDate,
        deliveryWindow:
          raw.deliveryWindow || body.deliveryWindow || "",
        rentalDays,
        unitBuilderPrice,
        lineBuilderTotal: unitBuilderPrice * qty,
        lineType: lineType === "service_visit" ? "service_visit" : "bin",
        feeEligible,
        material,
        materialOther,
        materialPhotoUrl:
          raw.materialPhotoUrl || body.materialPhotoUrl || "",
        placementContactPhone:
          raw.placementContactPhone ||
          body.placementContactPhone ||
          "",
        placementInstructions:
          raw.placementInstructions ||
          jobsite.placementInstructions ||
          jobsite.instructions ||
          "",
        placementPhotoUrl:
          raw.placementPhotoUrl ||
          jobsite.placementPhotoUrl ||
          jobsite.dropoff_image ||
          "",
        placementLabel:
          raw.placementLabel || jobsite.placementLocation || "",
        placementGeo: raw.placementGeo || jobsite.placementGeo || undefined,
        siteContactName:
          raw.siteContactName || jobsite.siteContactName || "",
        siteContactPhone:
          raw.siteContactPhone || jobsite.siteContactPhone || "",
        status: "open",
      });
    } else {
      const qty = Math.max(1, Number(raw.quantity) || 1);
      const unitBuilderPrice = Number(raw.unitBuilderPrice || 0);
      const lineBuilderTotal =
        Number(raw.lineBuilderTotal) || unitBuilderPrice * qty;
      let jobsite = null;
      if (raw.jobsiteId) {
        jobsite = await JobSites.findOne({
          _id: raw.jobsiteId,
          company: company._id,
        });
      }
      if (!jobsite) {
        jobsite = await JobSites.findOne({
          company: company._id,
          status: { $ne: "deleted" },
        });
      }
      if (!jobsite) throw new BadRequestError("Jobsite required for ancillary lines");

      const fallbackSize = unitKeysForService(serviceType)[0] || "20";
      lines.push({
        jobsite: jobsite._id,
        siteName: jobsite.siteName || "",
        address: jobsite.address || "",
        city: jobsite.city || "",
        state: jobsite.state || "",
        zip: jobsite.zip || "",
        location: jobsite.location,
        size: allowedSizes.has(String(raw.size))
          ? String(raw.size)
          : fallbackSize,
        quantity: qty,
        quantityCommitted: 0,
        quantityRemaining: 0,
        deliveryDate: raw.deliveryDate
          ? new Date(raw.deliveryDate)
          : new Date(),
        rentalDays: Number(raw.rentalDays || body.rentalPeriodDays || 30),
        unitBuilderPrice,
        lineBuilderTotal,
        lineType,
        feeEligible,
        status: "open",
      });
    }
  }

  return lines;
}

function applyTotals(offerDoc) {
  const progress = summarizeOfferProgress(offerDoc);
  const economics = recomputeOfferEconomics(offerDoc);
  offerDoc.binsRequested = progress.binsRequested;
  offerDoc.binsCommitted = progress.binsCommitted;
  offerDoc.binsRemaining = progress.binsRemaining;
  offerDoc.fulfillmentPct = progress.fulfillmentPct;
  offerDoc.builderTotal = economics.builderTotal;
  offerDoc.platformFeeTotal = economics.platformFeeTotal;
  offerDoc.providerPayoutTotal = economics.providerPayoutTotal;
  offerDoc.passThroughTotal = economics.passThroughTotal;
  offerDoc.status = deriveOfferStatus(offerDoc);
  return offerDoc;
}

function publicOfferDto(offer, { allocations = [], counters = [], recommendation = null, invoices = [] } = {}) {
  const fulfillmentBreakdown = buildFulfillmentBreakdown(offer);
  return {
    id: offer._id,
    kind: "builder_offer",
    title: offer.title,
    regionLabel: offer.regionLabel,
    status: offer.status,
    fulfillmentPreference: offer.fulfillmentPreference,
    serviceType: offer.serviceType,
    rentalPeriodDays: offer.rentalPeriodDays,
    material: offer.material,
    materialOther: offer.materialOther,
    materialPhotoUrl: offer.materialPhotoUrl,
    includedTonnage: offer.includedTonnage,
    additionalTonnageRate: offer.additionalTonnageRate,
    additionalDayRate: offer.additionalDayRate,
    exchangeRequirements: offer.exchangeRequirements,
    estimatedRecurringVolume: offer.estimatedRecurringVolume,
    advanceNotice: offer.advanceNotice,
    deliveryWindow: offer.deliveryWindow,
    exchangeMode: offer.exchangeMode,
    exchangeEveryDays: offer.exchangeEveryDays,
    exchangeTurnaround: offer.exchangeTurnaround,
    exchangeTurnaroundCustom: offer.exchangeTurnaroundCustom,
    exchangeTurnaroundDate: offer.exchangeTurnaroundDate,
    finalPickupMode: offer.finalPickupMode,
    finalPickupDate: offer.finalPickupDate,
    authorizedPickupName: offer.authorizedPickupName || "",
    authorizedPickupPhone: offer.authorizedPickupPhone || "",
    placementContactPhone: offer.placementContactPhone,
    eachServiceIsSeparateOrder: offer.eachServiceIsSeparateOrder !== false,
    pricingSchedule: offer.pricingSchedule,
    lines: offer.lines,
    builderTotal: offer.builderTotal,
    platformFeeTotal: offer.platformFeeTotal,
    providerPayoutTotal: offer.providerPayoutTotal,
    passThroughTotal: offer.passThroughTotal,
    binsRequested: offer.binsRequested,
    binsCommitted: offer.binsCommitted,
    binsRemaining: offer.binsRemaining,
    fulfillmentPct: offer.fulfillmentPct,
    fulfillmentBreakdown,
    allowCounteroffers: offer.allowCounteroffers,
    needsAdjustmentReason: offer.needsAdjustmentReason,
    sourceBlanketPlanId: offer.sourceBlanketPlanId,
    savedAsBlanketAt: offer.savedAsBlanketAt,
    expiresAt: offer.expiresAt,
    company: offer.company,
    createdAt: offer.createdAt,
    updatedAt: offer.updatedAt,
    allocations: (allocations || []).map(serializeAllocationForDto),
    counters,
    invoices,
    recommendation,
    lastMatchSnapshot: offer.lastMatchSnapshot,
  };
}

export async function createOffer(userId, body = {}) {
  const company = await requireApprovedCompany(userId);

  const lines = await hydrateLinesFromPayload(company, body);
  const offer = new BuilderOffer({
    company: company._id,
    createdBy: userId,
    title: body.title || `${company.companyName} Builder Offer`,
    regionLabel: body.regionLabel || "",
    status: "draft",
    fulfillmentPreference:
      body.fulfillmentPreference || "multiple_providers",
    serviceType: body.serviceType || "dumpster",
    rentalPeriodDays: Number(body.rentalPeriodDays) || 30,
    material: body.material || "",
    materialOther: body.materialOther || "",
    materialPhotoUrl: body.materialPhotoUrl || "",
    includedTonnage:
      body.includedTonnage != null ? Number(body.includedTonnage) : null,
    additionalTonnageRate:
      body.additionalTonnageRate != null
        ? Number(body.additionalTonnageRate)
        : null,
    additionalDayRate:
      body.additionalDayRate != null ? Number(body.additionalDayRate) : null,
    exchangeRequirements: body.exchangeRequirements || "",
    estimatedRecurringVolume: body.estimatedRecurringVolume || "",
    advanceNotice: body.advanceNotice || null,
    deliveryWindow: body.deliveryWindow || "",
    exchangeMode: body.exchangeMode || "manual",
    exchangeEveryDays:
      body.exchangeEveryDays != null ? Number(body.exchangeEveryDays) : null,
    exchangeTurnaround: body.exchangeTurnaround || null,
    exchangeTurnaroundCustom: body.exchangeTurnaroundCustom || "",
    exchangeTurnaroundDate: body.exchangeTurnaroundDate
      ? new Date(body.exchangeTurnaroundDate)
      : null,
    finalPickupMode: body.finalPickupMode || "manual",
    finalPickupDate: body.finalPickupDate
      ? new Date(body.finalPickupDate)
      : null,
    authorizedPickupName: body.authorizedPickupName || "",
    authorizedPickupPhone: body.authorizedPickupPhone || "",
    placementContactPhone: body.placementContactPhone || "",
    eachServiceIsSeparateOrder: body.eachServiceIsSeparateOrder !== false,
    pricingSchedule: body.pricingSchedule || [],
    lines,
    sourceBlanketPlanId: body.sourceBlanketPlanId || null,
    expiresAt: body.expiresAt
      ? new Date(body.expiresAt)
      : defaultExpiresAt(),
  });
  applyTotals(offer);
  await offer.save();
  await recordEvent({
    offer,
    actor: userId,
    actorRole: "company",
    type: "created",
    payload: { builderTotal: offer.builderTotal },
  });

  if (body.submit) {
    return submitOffer(userId, offer._id);
  }
  return publicOfferDto(offer);
}

export async function listCompanyOffers(userId, { status, page = 1, limit = 20 } = {}) {
  const company = await getCompanyForUser(userId);
  // Pending / rejected companies can open the portal without 403s.
  if (company.status !== "approved") {
    return {
      data: [],
      pagination: {
        page: Number(page) || 1,
        limit: Number(limit) || 20,
        total: 0,
      },
    };
  }
  const query = { company: company._id };
  if (status) query.status = status;
  const skip = (Math.max(1, Number(page)) - 1) * Math.max(1, Number(limit));
  const [rows, total] = await Promise.all([
    BuilderOffer.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Math.max(1, Number(limit)))
      .lean(),
    BuilderOffer.countDocuments(query),
  ]);

  const offerIds = rows.map((r) => r._id);
  const offerIdStrs = offerIds.map(String);
  const [allocations, invoices] = offerIds.length
    ? await Promise.all([
        BuilderOfferAllocation.find({
          offer: { $in: offerIds },
          status: { $ne: "cancelled" },
        })
          .populate("provider", "name email phone comp_name")
          .lean(),
        BillingRecord.find({
          "metadata.builderOfferId": { $in: offerIdStrs },
        })
          .select(
            "amount status paidAmount metadata invoiceNumber dueDate createdAt",
          )
          .lean(),
      ])
    : [[], []];

  const allocByOffer = new Map();
  for (const a of allocations) {
    const key = String(a.offer);
    if (!allocByOffer.has(key)) allocByOffer.set(key, []);
    allocByOffer.get(key).push(a);
  }
  const invByOffer = new Map();
  for (const inv of invoices) {
    const key = String(inv.metadata?.builderOfferId || "");
    if (!key) continue;
    if (!invByOffer.has(key)) invByOffer.set(key, []);
    invByOffer.get(key).push(inv);
  }

  const data = rows.map((o) => {
    const dto = publicOfferDto(o);
    const oid = String(o._id);
    const offerAllocs = (allocByOffer.get(oid) || []).map(
      serializeAllocationForDto,
    );
    const offerInvs = invByOffer.get(oid) || [];
    const pendingInvs = offerInvs.filter((inv) =>
      ["open", "due", "partial"].includes(String(inv.status || "open")),
    );
    const paidInvs = offerInvs.filter((inv) => inv.status === "paid");
    const providers = offerAllocs.map((a) => ({
      id: a.provider?.id || a.provider,
      name:
        a.providerName ||
        a.provider?.name ||
        a.provider?.email ||
        "Provider",
      email: a.providerEmail || a.provider?.email || "",
      phone: a.providerPhone || a.provider?.phone || "",
      binsAccepted: a.binsAccepted,
      builderPortion: a.builderPortion,
    }));
    const notified = (o.lastMatchSnapshot?.portions || []).length;
    dto.allocations = offerAllocs;
    dto.invoices = offerInvs;
    dto.transparency = {
      providerCount: providers.length,
      providers: providers.slice(0, 5),
      binsAcceptedTotal: providers.reduce(
        (s, p) => s + (Number(p.binsAccepted) || 0),
        0,
      ),
      notifiedProviderCount:
        Number(o.lastMatchSnapshot?.portionCount) || notified,
      pendingInvoiceCount: pendingInvs.length,
      pendingInvoiceAmount: pendingInvs.reduce(
        (s, inv) =>
          s +
          Math.max(
            0,
            (Number(inv.amount) || 0) - (Number(inv.paidAmount) || 0),
          ),
        0,
      ),
      paidInvoiceCount: paidInvs.length,
      invoiceCount: offerInvs.length,
      jobsitesRemaining: (dto.fulfillmentBreakdown?.byJobsite || []).filter(
        (s) => (s.remaining || 0) > 0,
      ).length,
      sizesRemaining: (dto.fulfillmentBreakdown?.bySize || []).filter(
        (s) => (s.remaining || 0) > 0,
      ).length,
    };
    return dto;
  });

  return {
    data,
    pagination: { page: Number(page), limit: Number(limit), total },
  };
}

export async function getCompanyOffer(userId, offerId) {
  const company = await getCompanyForUser(userId);
  if (company.status !== "approved") {
    throw new ForbiddenError(
      "Company must be approved to use Builder Offers",
    );
  }
  const offer = await BuilderOffer.findOne({
    _id: offerId,
    company: company._id,
  });
  if (!offer) throw new NotFoundError("Builder offer not found");
  const [allocations, counters, recommendation, invoices] = await Promise.all([
    BuilderOfferAllocation.find({
      offer: offer._id,
      status: { $ne: "cancelled" },
    })
      .populate("provider", "name email phone comp_name")
      .lean(),
    BuilderOfferCounter.find({ offer: offer._id }).sort({ createdAt: -1 }).lean(),
    getRecommendationForOffer(offer),
    BillingRecord.find({ "metadata.builderOfferId": String(offer._id) })
      .sort({ createdAt: -1 })
      .lean(),
  ]);
  const { enrichBillingRecordsForDisplay } = await import(
    "../company/commercialService.js"
  );
  const enrichedInvoices = await enrichBillingRecordsForDisplay(invoices, {
    offerFallback: offer,
  });
  const lastMatchSnapshot = await enrichLastMatchSnapshot(
    offer.lastMatchSnapshot,
  );
  const dto = publicOfferDto(offer, {
    allocations,
    counters,
    recommendation,
    invoices: enrichedInvoices,
  });
  dto.lastMatchSnapshot = lastMatchSnapshot;
  // Attach jobsite labels onto allocation lines from offer lines
  dto.allocations = (dto.allocations || []).map((a) => ({
    ...a,
    lines: (a.lines || []).map((al) => {
      const offerLine = resolveOfferLine(offer, al.lineId);
      return {
        ...al,
        siteName: offerLine?.siteName || "",
        city: offerLine?.city || "",
        state: offerLine?.state || "",
        jobsiteId: offerLine?.jobsite ? String(offerLine.jobsite) : null,
      };
    }),
  }));
  const pendingInvs = enrichedInvoices.filter((inv) =>
    ["open", "due", "partial"].includes(String(inv.status || "open")),
  );
  dto.transparency = {
    providerCount: dto.allocations.length,
    providers: dto.allocations.slice(0, 5).map((a) => ({
      id: a.provider?.id || a.provider,
      name: a.providerName || a.provider?.name || a.provider?.email || "Provider",
      email: a.providerEmail || a.provider?.email || "",
      phone: a.providerPhone || a.provider?.phone || "",
      binsAccepted: a.binsAccepted,
      builderPortion: a.builderPortion,
    })),
    binsAcceptedTotal: dto.allocations.reduce(
      (s, a) => s + (Number(a.binsAccepted) || 0),
      0,
    ),
    notifiedProviderCount:
      Number(lastMatchSnapshot?.portionCount) ||
      (lastMatchSnapshot?.portions || []).length ||
      0,
    pendingInvoiceCount: pendingInvs.length,
    pendingInvoiceAmount: pendingInvs.reduce(
      (s, inv) =>
        s +
        Math.max(0, (Number(inv.amount) || 0) - (Number(inv.paidAmount) || 0)),
      0,
    ),
    paidInvoiceCount: enrichedInvoices.filter((i) => i.status === "paid")
      .length,
    invoiceCount: enrichedInvoices.length,
    jobsitesRemaining: (dto.fulfillmentBreakdown?.byJobsite || []).filter(
      (s) => (s.remaining || 0) > 0,
    ).length,
    sizesRemaining: (dto.fulfillmentBreakdown?.bySize || []).filter(
      (s) => (s.remaining || 0) > 0,
    ).length,
  };
  return dto;
}

/**
 * Company withdraws/deletes an offer that has no accepted allocations.
 * Soft-cancels so admin history remains; blocked once any bins are committed.
 */
export async function cancelCompanyOffer(userId, offerId, body = {}) {
  const company = await requireApprovedCompany(userId);
  const offer = await BuilderOffer.findOne({
    _id: offerId,
    company: company._id,
  });
  if (!offer) throw new NotFoundError("Builder offer not found");

  if (["cancelled", "expired", "fulfilled"].includes(offer.status)) {
    throw new BadRequestError(`Offer is already ${offer.status}`);
  }

  const committed = Number(offer.binsCommitted) || 0;
  if (committed > 0) {
    throw new BadRequestError(
      "Cannot delete this offer — providers have already accepted bins. Cancel remaining work from allocations/orders instead.",
    );
  }

  const activeAllocations = await BuilderOfferAllocation.countDocuments({
    offer: offer._id,
    status: { $nin: ["cancelled", "declined"] },
    binsAccepted: { $gt: 0 },
  });
  if (activeAllocations > 0) {
    throw new BadRequestError(
      "Cannot delete this offer — it has accepted provider allocations",
    );
  }

  const notifiedIds = [...(offer.notifiedProviderIds || [])];
  offer.status = "cancelled";
  offer.cancelledAt = new Date();
  offer.cancelledReason =
    String(body.reason || "").trim() || "Deleted by commercial builder";
  offer.needsAdjustmentAt = null;
  offer.needsAdjustmentReason = "";
  await offer.save();

  await BuilderOfferAllocation.updateMany(
    { offer: offer._id, status: { $ne: "cancelled" } },
    { $set: { status: "cancelled" } },
  ).catch(() => {});

  await recordEvent({
    offer,
    actor: userId,
    actorRole: "company",
    type: "cancelled",
    payload: { reason: offer.cancelledReason, deletedByCompany: true },
  });

  const dto = publicOfferDto(offer);
  emitToUser(company.user, BUILDER_OFFER_SOCKET_EVENTS.updated, { offer: dto });
  await emitToAdmins(BUILDER_OFFER_SOCKET_EVENTS.updated, { offer: dto });

  for (const providerId of notifiedIds) {
    emitToUser(providerId, BUILDER_OFFER_SOCKET_EVENTS.updated, {
      offerId: offer._id,
      offer: dto,
    });
  }

  return dto;
}

export async function updateDraftOrAdjust(userId, offerId, body = {}) {
  const company = await requireApprovedCompany(userId);
  const offer = await BuilderOffer.findOne({
    _id: offerId,
    company: company._id,
  });
  if (!offer) throw new NotFoundError("Builder offer not found");

  const adjustable = ["draft", "open", "partially_fulfilled", "needs_adjustment"];
  if (!adjustable.includes(offer.status)) {
    throw new BadRequestError(`Cannot modify offer in status ${offer.status}`);
  }

  if (body.title != null) offer.title = body.title;
  if (body.regionLabel != null) offer.regionLabel = body.regionLabel;
  if (body.fulfillmentPreference) {
    offer.fulfillmentPreference = body.fulfillmentPreference;
  }
  if (body.rentalPeriodDays != null) {
    offer.rentalPeriodDays = Number(body.rentalPeriodDays);
  }
  if (body.material != null) offer.material = body.material;
  if (body.materialOther != null) offer.materialOther = body.materialOther;
  if (body.materialPhotoUrl != null) {
    offer.materialPhotoUrl = body.materialPhotoUrl;
  }
  if (body.includedTonnage != null) {
    offer.includedTonnage = Number(body.includedTonnage);
  }
  if (body.additionalTonnageRate != null) {
    offer.additionalTonnageRate = Number(body.additionalTonnageRate);
  }
  if (body.additionalDayRate != null) {
    offer.additionalDayRate = Number(body.additionalDayRate);
  }
  if (body.exchangeRequirements != null) {
    offer.exchangeRequirements = body.exchangeRequirements;
  }
  if (body.estimatedRecurringVolume != null) {
    offer.estimatedRecurringVolume = body.estimatedRecurringVolume;
  }
  if (body.advanceNotice != null) offer.advanceNotice = body.advanceNotice;
  if (body.deliveryWindow != null) offer.deliveryWindow = body.deliveryWindow;
  if (body.exchangeMode != null) offer.exchangeMode = body.exchangeMode;
  if (body.exchangeEveryDays != null) {
    offer.exchangeEveryDays = Number(body.exchangeEveryDays);
  }
  if (body.exchangeTurnaround != null) {
    offer.exchangeTurnaround = body.exchangeTurnaround;
  }
  if (body.exchangeTurnaroundCustom != null) {
    offer.exchangeTurnaroundCustom = body.exchangeTurnaroundCustom;
  }
  if (body.exchangeTurnaroundDate !== undefined) {
    offer.exchangeTurnaroundDate = body.exchangeTurnaroundDate
      ? new Date(body.exchangeTurnaroundDate)
      : null;
  }
  if (body.finalPickupMode != null) {
    offer.finalPickupMode = body.finalPickupMode;
  }
  if (body.finalPickupDate != null) {
    offer.finalPickupDate = body.finalPickupDate
      ? new Date(body.finalPickupDate)
      : null;
  }
  if (body.authorizedPickupName != null) {
    offer.authorizedPickupName = body.authorizedPickupName;
  }
  if (body.authorizedPickupPhone != null) {
    offer.authorizedPickupPhone = body.authorizedPickupPhone;
  }
  if (body.placementContactPhone != null) {
    offer.placementContactPhone = body.placementContactPhone;
  }
  if (body.eachServiceIsSeparateOrder != null) {
    offer.eachServiceIsSeparateOrder = Boolean(body.eachServiceIsSeparateOrder);
  }
  if (body.serviceType != null) offer.serviceType = body.serviceType;
  if (body.pricingSchedule) offer.pricingSchedule = body.pricingSchedule;

  if (Array.isArray(body.lines) && body.lines.length) {
    if (offer.binsCommitted > 0) {
      // Only allow price increases / remaining qty changes on open lines
      for (const patch of body.lines) {
        const line = offer.lines.id(patch.lineId || patch._id);
        if (!line) continue;
        if (patch.unitBuilderPrice != null) {
          line.unitBuilderPrice = Number(patch.unitBuilderPrice);
          line.lineBuilderTotal =
            line.unitBuilderPrice * Number(line.quantity);
        }
        if (patch.quantity != null && offer.status === "draft") {
          const qty = Math.max(1, Number(patch.quantity));
          line.quantity = qty;
          line.quantityRemaining = Math.max(0, qty - line.quantityCommitted);
          line.lineBuilderTotal = line.unitBuilderPrice * qty;
        }
      }
    } else {
      offer.lines = await hydrateLinesFromPayload(company, {
        ...body,
        rentalPeriodDays: offer.rentalPeriodDays,
      });
    }
  }

  if (offer.status === "needs_adjustment") {
    offer.needsAdjustmentAt = null;
    offer.needsAdjustmentReason = "";
  }

  applyTotals(offer);
  if (offer.status === "draft") {
    // stay draft unless submit
  } else if (offer.binsRemaining > 0) {
    offer.status = offer.binsCommitted > 0 ? "partially_fulfilled" : "open";
  }
  await offer.save();
  await recordEvent({
    offer,
    actor: userId,
    actorRole: "company",
    type: "adjusted",
    payload: { builderTotal: offer.builderTotal },
  });

  if (body.rematch || offer.status !== "draft") {
    await dispatchPortions(offer);
  }

  const companyUser = company.user?.toString?.() || company.user;
  emitToUser(companyUser, BUILDER_OFFER_SOCKET_EVENTS.updated, {
    offer: publicOfferDto(offer),
  });
  return publicOfferDto(offer);
}

export async function submitOffer(userId, offerId) {
  const company = await requireApprovedCompany(userId);
  const offer = await BuilderOffer.findOne({
    _id: offerId,
    company: company._id,
  });
  if (!offer) throw new NotFoundError("Builder offer not found");
  if (!["draft", "needs_adjustment"].includes(offer.status) && offer.binsCommitted === 0) {
    // allow resubmit from draft primarily
  }
  if (offer.status === "fulfilled") {
    throw new BadRequestError("Offer already fulfilled");
  }
  if (offer.status === "draft") {
    offer.status = "open";
  } else if (offer.status === "needs_adjustment") {
    offer.status = offer.binsCommitted > 0 ? "partially_fulfilled" : "open";
    offer.needsAdjustmentReason = "";
    offer.needsAdjustmentAt = null;
  }
  applyTotals(offer);
  await offer.save();
  await recordEvent({
    offer,
    actor: userId,
    actorRole: "company",
    type: "submitted",
    payload: { builderTotal: offer.builderTotal },
  });
  await dispatchPortions(offer);
  emitToUser(company.user, BUILDER_OFFER_SOCKET_EVENTS.created, {
    offer: publicOfferDto(offer),
  });
  await emitToAdmins(BUILDER_OFFER_SOCKET_EVENTS.updated, {
    offerId: offer._id,
    status: offer.status,
  });
  return publicOfferDto(offer);
}

export async function dispatchPortions(offerDoc) {
  const offer =
    offerDoc.lines != null
      ? offerDoc
      : await BuilderOffer.findById(offerDoc);
  if (!offer) return [];
  if (["fulfilled", "cancelled", "expired", "draft"].includes(offer.status)) {
    return [];
  }

  const portions = await matchBuilderOfferPortions(offer, { onlineOnly: false });
  offer.lastMatchedAt = new Date();
  offer.notifiedProviderIds = portions.map((p) => p.providerId);
  const providerIds = [
    ...new Set(portions.map((p) => p.providerId).filter(Boolean).map(String)),
  ];
  const providerUsers = providerIds.length
    ? await User.find({ _id: { $in: providerIds } })
        .select("name email phone comp_name")
        .lean()
    : [];
  const providerById = Object.fromEntries(
    providerUsers.map((u) => [String(u._id), u]),
  );
  offer.lastMatchSnapshot = {
    matchedAt: offer.lastMatchedAt,
    portionCount: portions.length,
    portions: portions.map((p) => {
      const u = providerById[String(p.providerId)];
      return {
        providerId: p.providerId,
        providerName: u?.name || u?.comp_name || "",
        providerEmail: u?.email || "",
        providerPhone: u?.phone || "",
        eligibleBins: p.eligibleBins,
        yourAvailablePortion: p.yourAvailablePortion,
        locations: p.locations,
        sizesRequired: p.sizesRequired,
        priorityScore: p.priorityScore,
        minDistanceMeters: p.minDistanceMeters,
        commercialEligible: p.commercialEligible,
      };
    }),
  };
  await offer.save();
  await recordEvent({
    offer,
    actorRole: "system",
    type: "matched",
    payload: { portionCount: portions.length },
  });

  const company = await Company.findById(offer.company).select("user").lean();
  for (const portion of portions) {
    await notifyProviderPortion({
      offer,
      portion,
      companyUserId: company?.user,
    });
    await recordEvent({
      offer,
      actor: portion.providerId,
      actorRole: "provider",
      type: "portion_notified",
      payload: {
        eligibleBins: portion.eligibleBins,
        yourAvailablePortion: portion.yourAvailablePortion,
        push: true,
      },
    });
  }

  return portions;
}

async function createChildOrderForLine({
  offer,
  company,
  providerId,
  line,
  quantity,
  allocationId,
  feeEligible,
  unitBuilderPrice,
}) {
  const lineTotal = unitBuilderPrice * quantity;
  const split = computeSplitFromLines([
    { amount: lineTotal, feeEligible },
  ]);
  const start = new Date(line.deliveryDate);
  const end = new Date(start);
  end.setDate(end.getDate() + Number(line.rentalDays || offer.rentalPeriodDays || 30));

  const materialText = [line.material || offer.material, line.materialOther || offer.materialOther]
    .filter(Boolean)
    .join(" — ");

  const order = await Order.create({
    user: company.user,
    to_id: providerId,
    company: company._id,
    jobSite: line.jobsite,
    commercialSize: line.size,
    status: "accepted",
    price: lineTotal,
    amount: split.providerPayoutTotal,
    quantity,
    num_days: line.rentalDays,
    start_date: start,
    end_date: end,
    location: sanitizeOrderLocation(line.placementGeo || line.location),
    address: line.address,
    companyPaymentMethod: company.paymentMethod || "invoice",
    orderKind: "standard",
    builderOffer: offer._id,
    builderOfferAllocation: allocationId,
    materialInformation: materialText,
    includedTons: offer.includedTonnage,
    overagePerTon: offer.additionalTonnageRate,
    placementLocation: line.placementLabel || "",
    placementNote: line.placementInstructions || "",
    placementPhotos: line.placementPhotoUrl ? [line.placementPhotoUrl] : [],
    service_type: mapOfferServiceToOrderType(offer.serviceType),
    metadata: {
      source: "builder_offer",
      eachServiceIsSeparateOrder: offer.eachServiceIsSeparateOrder !== false,
      exchangeMode: offer.exchangeMode,
      exchangeEveryDays: offer.exchangeEveryDays,
      exchangeTurnaround: offer.exchangeTurnaround,
      exchangeTurnaroundCustom: offer.exchangeTurnaroundCustom,
      exchangeTurnaroundDate: offer.exchangeTurnaroundDate,
      exchangeRequirements: offer.exchangeRequirements || "",
      advanceNotice: offer.advanceNotice,
      finalPickupMode: offer.finalPickupMode,
      finalPickupDate: offer.finalPickupDate,
      authorizedPickupName: offer.authorizedPickupName || "",
      authorizedPickupPhone: offer.authorizedPickupPhone || "",
      nextExchangeAt:
        offer.exchangeMode === "automatic" && offer.exchangeEveryDays
          ? (() => {
              const d = new Date(line.deliveryDate || Date.now());
              d.setDate(d.getDate() + Number(offer.exchangeEveryDays));
              return d;
            })()
          : null,
    },
  });
  return order;
}

/**
 * One Order per provider allocation (accept), even when the allocation
 * covers multiple sizes/jobsites. Multi-provider splits still create
 * one order per accepting provider.
 */
async function createOrderForAllocation({
  offer,
  company,
  providerId,
  allocation,
  allocLines,
}) {
  const resolvedLines = allocLines.map((al) => {
    const line = resolveOfferLine(offer, al.lineId);
    return { al, line };
  }).filter((row) => row.line);

  if (!resolvedLines.length) {
    throw new BadRequestError("No valid lines for allocation order");
  }

  // Prefer earliest delivery window as the order's operational primary fields.
  resolvedLines.sort((a, b) => {
    const da = new Date(a.line.deliveryDate || 0).getTime();
    const db = new Date(b.line.deliveryDate || 0).getTime();
    return da - db;
  });
  const primary = resolvedLines[0].line;
  const start = new Date(primary.deliveryDate || Date.now());
  const primaryRentalDays = Number(
    primary.rentalDays || offer.rentalPeriodDays || 30,
  );
  const end = new Date(start);
  end.setDate(end.getDate() + primaryRentalDays);

  const sizes = [...new Set(resolvedLines.map((r) => String(r.al.size || r.line.size || "")))];
  const sites = [
    ...new Set(
      resolvedLines.map(
        (r) => r.line.siteName || r.line.city || String(r.line.jobsite || ""),
      ),
    ),
  ].filter(Boolean);

  const materialText = [
    primary.material || offer.material,
    primary.materialOther || offer.materialOther,
  ]
    .filter(Boolean)
    .join(" — ");

  const order = await Order.create({
    user: company.user,
    to_id: providerId,
    company: company._id,
    jobSite: primary.jobsite,
    commercialSize: primary.size,
    status: "accepted",
    price: allocation.builderPortion,
    amount: allocation.providerPayout,
    quantity: allocation.binsAccepted,
    num_days: primaryRentalDays,
    start_date: start,
    end_date: end,
    location: sanitizeOrderLocation(primary.placementGeo || primary.location),
    address: primary.address,
    companyPaymentMethod: company.paymentMethod || "invoice",
    orderKind: "standard",
    builderOffer: offer._id,
    builderOfferAllocation: allocation._id,
    materialInformation: materialText,
    includedTons: offer.includedTonnage,
    overagePerTon: offer.additionalTonnageRate,
    placementLocation: primary.placementLabel || "",
    placementNote: primary.placementInstructions || "",
    placementPhotos: primary.placementPhotoUrl
      ? [primary.placementPhotoUrl]
      : [],
    service_type: mapOfferServiceToOrderType(offer.serviceType),
    metadata: {
      source: "builder_offer",
      builderOfferId: offer._id.toString(),
      allocationId: allocation._id.toString(),
      offerTitle: offer.title || "",
      serviceType: offer.serviceType || "dumpster",
      coalesced: resolvedLines.length > 1,
      lineCount: resolvedLines.length,
      sizes,
      sites,
      binsAccepted: allocation.binsAccepted,
      eachServiceIsSeparateOrder: offer.eachServiceIsSeparateOrder !== false,
      exchangeMode: offer.exchangeMode,
      exchangeEveryDays: offer.exchangeEveryDays,
      exchangeTurnaround: offer.exchangeTurnaround,
      exchangeTurnaroundCustom: offer.exchangeTurnaroundCustom,
      exchangeTurnaroundDate: offer.exchangeTurnaroundDate,
      exchangeRequirements: offer.exchangeRequirements || "",
      advanceNotice: offer.advanceNotice,
      deliveryWindow: primary.deliveryWindow || offer.deliveryWindow || "",
      finalPickupMode: offer.finalPickupMode,
      finalPickupDate: offer.finalPickupDate,
      authorizedPickupName: offer.authorizedPickupName || "",
      authorizedPickupPhone: offer.authorizedPickupPhone || "",
      rentalPeriodDays: offer.rentalPeriodDays || primaryRentalDays,
      awardStatus: "provider_confirmed",
      jobAwardedAt: new Date(),
      providerId: providerId ? String(providerId) : null,
      includedTonnage: offer.includedTonnage,
      additionalTonnageRate: offer.additionalTonnageRate,
      additionalDayRate: offer.additionalDayRate,
      placementContactPhone:
        primary.placementContactPhone || offer.placementContactPhone || "",
      material: offer.material || "",
      materialOther: offer.materialOther || "",
      projectName: primary.projectName || "",
      jobNumber: primary.jobNumber || "",
      poNumber: primary.poNumber || "",
      costCode: primary.costCode || "",
      billingReference: primary.billingReference || "",
      communityName: primary.communityName || "",
      division: primary.division || "",
      siteContactName: primary.siteContactName || "",
      siteContactPhone: primary.siteContactPhone || "",
      authorizedUsers: primary.authorizedUsers || "",
      serviceInstructions: primary.serviceInstructions || "",
      gateAccessInstructions: primary.gateAccessInstructions || "",
      deliveryRestrictions: primary.deliveryRestrictions || "",
      hoursAllowedOnsite: primary.hoursAllowedOnsite || "",
      materialRestrictions: primary.materialRestrictions || "",
      nextExchangeAt:
        offer.exchangeMode === "automatic" && offer.exchangeEveryDays
          ? (() => {
              const d = new Date(primary.deliveryDate || Date.now());
              d.setDate(d.getDate() + Number(offer.exchangeEveryDays));
              return d;
            })()
          : null,
      builderOfferLines: resolvedLines.map(({ al, line }) => ({
        lineId: al.lineId ? String(al.lineId) : null,
        size: al.size || line.size,
        quantity: al.quantity,
        unitBuilderPrice: al.unitBuilderPrice,
        lineBuilderTotal: al.lineBuilderTotal,
        platformFee: al.platformFee,
        providerPayout: al.providerPayout,
        feeEligible: al.feeEligible,
        jobsiteId: line.jobsite ? String(line.jobsite) : null,
        siteName: line.siteName || "",
        city: line.city || "",
        state: line.state || "",
        address: line.address || "",
        deliveryDate: line.deliveryDate || null,
        deliveryWindow: line.deliveryWindow || offer.deliveryWindow || "",
        rentalDays: line.rentalDays || offer.rentalPeriodDays || 30,
        placementInstructions: line.placementInstructions || "",
        placementContactPhone:
          line.placementContactPhone || offer.placementContactPhone || "",
        projectName: line.projectName || "",
        jobNumber: line.jobNumber || "",
        poNumber: line.poNumber || "",
        costCode: line.costCode || "",
        billingReference: line.billingReference || "",
        communityName: line.communityName || "",
        division: line.division || "",
        siteContactName: line.siteContactName || "",
        siteContactPhone: line.siteContactPhone || "",
        authorizedUsers: line.authorizedUsers || "",
        serviceInstructions: line.serviceInstructions || "",
        gateAccessInstructions: line.gateAccessInstructions || "",
        deliveryRestrictions: line.deliveryRestrictions || "",
        hoursAllowedOnsite: line.hoursAllowedOnsite || "",
        materialRestrictions: line.materialRestrictions || "",
        material: line.material || offer.material || "",
        materialOther: line.materialOther || offer.materialOther || "",
      })),
    },
  });

  return order;
}

function mapOfferServiceToOrderType(serviceType) {
  // Must match Order.service_type enum exactly.
  switch (serviceType) {
    case "junk":
      return "Junk Removal";
    case "porta":
      return "Porta Potty";
    case "tree":
      return "Tree Removal";
    case "dumpster":
    default:
      return "Dumbster";
  }
}

/** GeoJSON Point only when coordinates are present; otherwise omit (avoids 2dsphere index errors). */
function sanitizeOrderLocation(geo) {
  if (!geo || typeof geo !== "object") return undefined;
  const coords = geo.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return undefined;
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return undefined;
  return { type: "Point", coordinates: [lng, lat] };
}

function uniqueOrders(orders = []) {
  const map = new Map();
  for (const order of orders) {
    if (!order?._id) continue;
    map.set(String(order._id), order);
  }
  return [...map.values()];
}

export async function acceptPortion(providerId, offerId, body = {}) {
  const offer = await BuilderOffer.findById(offerId);
  if (!offer) throw new NotFoundError("Builder offer not found");
  if (!["open", "partially_fulfilled", "needs_adjustment"].includes(offer.status)) {
    throw new BadRequestError("Offer is not open for acceptance");
  }

  const company = await Company.findById(offer.company);
  if (!company) throw new NotFoundError("Company not found");

  const eligibility = await getProviderEligibleSelections(offer, providerId);
  if (!eligibility || eligibility.eligibleBins <= 0) {
    throw new ForbiddenError("You are not eligible for this builder offer portion");
  }

  const mode = body.mode === "select_quantity" ? "select_quantity" : "full_available";
  if (
    offer.fulfillmentPreference === "single_provider" &&
    mode === "select_quantity"
  ) {
    throw new BadRequestError("This offer requires a single provider for the full remaining quantity");
  }

  /** @type {Array<{ lineId: string, quantity: number }>} */
  let selections = [];
  if (mode === "full_available") {
    selections = eligibility.lineEligibilities.map((le) => ({
      lineId: le.lineId,
      quantity: le.eligibleQuantity,
    }));
  } else {
    selections = Array.isArray(body.selections) ? body.selections : [];
    if (!selections.length) {
      throw new BadRequestError("selections required for select_quantity");
    }
  }

  // Atomic-ish: reload and apply under remaining caps (conditional on remaining)
  const fresh = await BuilderOffer.findById(offerId);
  if (!fresh) throw new NotFoundError("Builder offer not found");
  const needBefore = summarizeOfferProgress(fresh).binsRemaining;
  const allocLines = [];
  let binsAccepted = 0;
  const payoutLines = [];

  for (const sel of selections) {
    const line = fresh.lines.id(sel.lineId);
    if (!line || (line.lineType !== "bin" && line.lineType !== "service_visit")) {
      throw new BadRequestError(`Invalid line ${sel.lineId}`);
    }
    const eligible =
      eligibility.lineEligibilities.find((e) => e.lineId === String(sel.lineId))
        ?.eligibleQuantity || 0;
    const qty = Math.min(
      Math.max(0, Number(sel.quantity) || 0),
      eligible,
      Number(line.quantityRemaining) || 0,
    );
    if (qty <= 0) continue;

    // Conditional remaining check to reduce oversell races
    const remainingBefore = Number(line.quantityRemaining) || 0;
    if (qty > remainingBefore) {
      throw new BadRequestError(
        `Quantity no longer available for ${line.size}-yard line`,
      );
    }

    line.quantityCommitted = (Number(line.quantityCommitted) || 0) + qty;
    line.quantityRemaining = Math.max(
      0,
      Number(line.quantity) - line.quantityCommitted,
    );
    line.status =
      line.quantityRemaining === 0
        ? "fulfilled"
        : line.quantityCommitted > 0
          ? "partial"
          : "open";

    const lineBuilderTotal = qty * Number(line.unitBuilderPrice);
    const split = computeSplitFromLines([
      { amount: lineBuilderTotal, feeEligible: line.feeEligible !== false },
    ]);
    allocLines.push({
      lineId: line._id,
      quantity: qty,
      size: line.size,
      unitBuilderPrice: line.unitBuilderPrice,
      lineBuilderTotal,
      platformFee: split.platformFeeTotal,
      providerPayout: split.providerPayoutTotal,
      feeEligible: line.feeEligible !== false,
      order: null,
    });
    binsAccepted += qty;
    payoutLines.push({
      amount: lineBuilderTotal,
      feeEligible: line.feeEligible !== false,
    });
  }

  if (binsAccepted <= 0) {
    throw new BadRequestError("No quantity could be allocated");
  }

  if (
    fresh.fulfillmentPreference === "single_provider" &&
    binsAccepted < needBefore
  ) {
    throw new BadRequestError(
      "Single-provider offers require accepting the full remaining quantity",
    );
  }

  const portionSplit = computeSplitFromLines(payoutLines);
  applyTotals(fresh);
  fresh.lastAcceptAt = new Date();
  if (fresh.status === "needs_adjustment" && fresh.binsRemaining > 0) {
    fresh.status = "partially_fulfilled";
    fresh.needsAdjustmentReason = "";
  }
  await fresh.save();

  const allocation = await BuilderOfferAllocation.create({
    offer: fresh._id,
    company: company._id,
    provider: providerId,
    status: "accepted",
    mode,
    binsAccepted,
    builderPortion: portionSplit.builderTotal,
    platformFee: portionSplit.platformFeeTotal,
    providerPayout: portionSplit.providerPayoutTotal,
    lines: allocLines,
    paymentMethod: company.paymentMethod || "invoice",
  });

  const ordersByLineIndex = [];
  const allHolds = [];
  const order = await createOrderForAllocation({
    offer: fresh,
    company,
    providerId,
    allocation,
    allocLines,
  });

  for (let i = 0; i < allocation.lines.length; i += 1) {
    const al = allocation.lines[i];
    const line = fresh.lines.id(al.lineId);
    allocation.lines[i].order = order._id;
    ordersByLineIndex[i] = order;

    try {
      const holds = await holdInventoryForAllocationLine({
        providerId,
        line,
        quantity: al.quantity,
        offer: fresh,
        orderId: order._id,
      });
      if (holds[0]?.dustbinId && !order.dustbin) {
        order.dustbin = holds[0].dustbinId;
        await order.save();
      }
      allHolds.push(...holds);
    } catch (holdErr) {
      logger.error("builder_offer.inventory_hold_failed", {
        error: holdErr?.message,
        orderId: order._id?.toString(),
      });
    }
  }
  allocation.inventoryHolds = allHolds;

  try {
    await settleAllocationBilling({
      company,
      offer: fresh,
      allocation,
      ordersByLineIndex,
    });
  } catch (billErr) {
    // Roll back inventory holds and fail the accept so money is never skipped
    await releaseInventoryHolds(allHolds).catch(() => {});
    for (const unique of uniqueOrders(ordersByLineIndex)) {
      await Order.findByIdAndUpdate(unique._id, { status: "cancelled" }).catch(
        () => {},
      );
    }
    await BuilderOfferAllocation.findByIdAndUpdate(allocation._id, {
      status: "cancelled",
    }).catch(() => {});
    // Restore line quantities
    for (const al of allocLines) {
      const line = fresh.lines.id(al.lineId);
      if (!line) continue;
      line.quantityCommitted = Math.max(
        0,
        (Number(line.quantityCommitted) || 0) - al.quantity,
      );
      line.quantityRemaining = Math.max(
        0,
        Number(line.quantity) - line.quantityCommitted,
      );
      line.status =
        line.quantityCommitted <= 0
          ? "open"
          : line.quantityRemaining === 0
            ? "fulfilled"
            : "partial";
    }
    applyTotals(fresh);
    await fresh.save();
    throw billErr;
  }

  await allocation.save();

  const matchedAt = fresh.lastMatchedAt
    ? new Date(fresh.lastMatchedAt).getTime()
    : null;
  const responseTimeMs =
    matchedAt != null && Number.isFinite(matchedAt)
      ? Math.max(0, Date.now() - matchedAt)
      : null;

  await recordEvent({
    offer: fresh,
    actor: providerId,
    actorRole: "provider",
    type: "accepted",
    payload: {
      binsAccepted,
      providerPayout: portionSplit.providerPayoutTotal,
      allocationId: allocation._id,
      billingRecordId: allocation.billingRecord,
      paymentHoldId: allocation.paymentHoldId,
    },
    extra: { quantity: binsAccepted, responseTimeMs },
  });

  emitToUser(company.user, BUILDER_OFFER_SOCKET_EVENTS.accepted, {
    offerId: fresh._id,
    allocation,
    offer: publicOfferDto(fresh),
    status: "job_awarded",
  });
  emitToUser(providerId, BUILDER_OFFER_SOCKET_EVENTS.accepted, {
    offerId: fresh._id,
    allocation,
    status: "provider_confirmed",
  });
  emitToUser(company.user, BUILDER_OFFER_SOCKET_EVENTS.updated, {
    offer: publicOfferDto(fresh),
  });
  await notifyCompanyOfferEvent({
    companyUserId: company.user,
    offer: fresh,
    title: "Job Awarded — Provider Confirmed",
    description: `${binsAccepted} unit(s) awarded on “${fresh.title || "Builder Offer"}”. ${fresh.binsCommitted} of ${fresh.binsRequested} committed (${fresh.fulfillmentPct}%). Provider is confirmed — authorized site users can see provider & status on the active order.`,
    eventKey: "accepted",
  });
  // Push confirmation to accepting provider as well
  {
    const provider = await User.findById(providerId)
      .select("fcmtoken name comp_name")
      .lean();
    await sendNotification({
      user: company.user.toString(),
      to_id: providerId.toString(),
      title: "Provider Confirmed — Job Awarded",
      description: `You locked ${binsAccepted} units · payout ${formatUsd(portionSplit.providerPayoutTotal)}. Builder has been notified.`,
      type: "offer",
      fcmtoken: provider?.fcmtoken || "",
      email: "",
      metadata: {
        kind: "builder_offer",
        offerId: fresh._id.toString(),
        screen: "builder_offer_accepted",
        allocationId: allocation._id.toString(),
        binsAccepted: String(binsAccepted),
        status: "provider_confirmed",
      },
    }).catch(() => {});
  }
  await emitToAdmins(BUILDER_OFFER_SOCKET_EVENTS.updated, {
    offerId: fresh._id,
    status: fresh.status,
    fulfillmentPct: fresh.fulfillmentPct,
  });

  if (fresh.binsRemaining > 0) {
    await dispatchPortions(fresh);
  }

  return {
    allocation,
    offer: publicOfferDto(fresh),
  };
}

export async function declinePortion(providerId, offerId, body = {}) {
  const offer = await BuilderOffer.findById(offerId);
  if (!offer) throw new NotFoundError("Builder offer not found");
  offer.notifiedProviderIds = (offer.notifiedProviderIds || []).filter(
    (id) => id.toString() !== String(providerId),
  );
  await offer.save();
  await recordEvent({
    offer,
    actor: providerId,
    actorRole: "provider",
    type: "rejected_portion",
    payload: { reason: body.reason || "" },
  });
  // Rematch remaining so other providers get portions
  if (
    !["fulfilled", "cancelled", "expired", "draft"].includes(offer.status) &&
    Number(offer.binsRemaining) > 0
  ) {
    await dispatchPortions(offer);
  }
  return { ok: true };
}

export async function allowCounters(userId, offerId) {
  const company = await requireApprovedCompany(userId);
  const offer = await BuilderOffer.findOne({
    _id: offerId,
    company: company._id,
  });
  if (!offer) throw new NotFoundError("Builder offer not found");
  offer.allowCounteroffers = true;
  offer.countersEnabledAt = new Date();
  if (offer.status !== "fulfilled") {
    offer.status = "needs_adjustment";
    offer.needsAdjustmentAt = new Date();
    offer.needsAdjustmentReason =
      offer.needsAdjustmentReason ||
      "Builder enabled provider counteroffers for remaining quantity";
  }
  await offer.save();
  emitToUser(company.user, BUILDER_OFFER_SOCKET_EVENTS.needsAdjustment, {
    offer: publicOfferDto(offer),
  });
  await dispatchPortions(offer);
  return publicOfferDto(offer);
}

export async function submitCounter(providerId, offerId, body = {}) {
  const offer = await BuilderOffer.findById(offerId);
  if (!offer) throw new NotFoundError("Builder offer not found");
  if (!offer.allowCounteroffers) {
    throw new BadRequestError("Counteroffers are not enabled on this offer");
  }
  const eligibility = await getProviderEligibleSelections(offer, providerId);
  if (!eligibility) {
    throw new ForbiddenError("Not eligible for this offer");
  }
  const lines = Array.isArray(body.lines) ? body.lines : [];
  if (!lines.length) throw new BadRequestError("Counter lines required");

  let requestedBuilderTotal = 0;
  const counterLines = lines.map((l) => {
    const qty = Math.max(1, Number(l.quantity) || 1);
    const price = Math.max(0, Number(l.requestedUnitPrice) || 0);
    requestedBuilderTotal += qty * price;
    return {
      lineId: l.lineId,
      quantity: qty,
      requestedUnitPrice: price,
    };
  });

  const counter = await BuilderOfferCounter.create({
    offer: offer._id,
    company: offer.company,
    provider: providerId,
    status: "pending",
    message: body.message || "",
    lines: counterLines,
    requestedBuilderTotal,
  });

  await recordEvent({
    offer,
    actor: providerId,
    actorRole: "provider",
    type: "counter_submitted",
    payload: { counterId: counter._id, requestedBuilderTotal },
  });

  const company = await Company.findById(offer.company).select("user");
  emitToUser(company?.user, BUILDER_OFFER_SOCKET_EVENTS.counter, {
    offerId: offer._id,
    counter,
  });
  await notifyCompanyOfferEvent({
    companyUserId: company?.user,
    offer,
    title: "Provider counteroffer received",
    description: `A provider countered at ${formatUsd(requestedBuilderTotal)} for remaining builder offer quantity.`,
    eventKey: "counter",
  });
  return counter;
}

export async function respondToCounter(userId, offerId, counterId, body = {}) {
  const company = await requireApprovedCompany(userId);
  const offer = await BuilderOffer.findOne({
    _id: offerId,
    company: company._id,
  });
  if (!offer) throw new NotFoundError("Builder offer not found");
  const counter = await BuilderOfferCounter.findOne({
    _id: counterId,
    offer: offer._id,
  });
  if (!counter || counter.status !== "pending") {
    throw new NotFoundError("Counter not found");
  }

  const accept = body.accept === true;
  counter.status = accept ? "accepted" : "rejected";
  counter.respondedAt = new Date();
  counter.respondedBy = userId;
  await counter.save();

  await recordEvent({
    offer,
    actor: userId,
    actorRole: "company",
    type: accept ? "counter_accepted" : "counter_rejected",
    payload: { counterId: counter._id },
  });

  if (accept) {
    for (const cl of counter.lines) {
      const line = offer.lines.id(cl.lineId);
      if (!line) continue;
      line.unitBuilderPrice = Number(cl.requestedUnitPrice);
      line.lineBuilderTotal = line.unitBuilderPrice * Number(line.quantity);
    }
    applyTotals(offer);
    offer.status = offer.binsCommitted > 0 ? "partially_fulfilled" : "open";
    offer.needsAdjustmentReason = "";
    await offer.save();
    await dispatchPortions(offer);
  }

  emitToUser(counter.provider, BUILDER_OFFER_SOCKET_EVENTS.counter, {
    offerId: offer._id,
    counter,
  });
  return { counter, offer: publicOfferDto(offer) };
}

export async function markNeedsAdjustment(offerId, reason = "") {
  const offer = await BuilderOffer.findById(offerId);
  if (!offer) return null;
  if (["fulfilled", "cancelled", "expired", "draft"].includes(offer.status)) {
    return offer;
  }
  if (offer.binsRemaining <= 0) return offer;
  offer.status = "needs_adjustment";
  offer.needsAdjustmentAt = new Date();
  offer.needsAdjustmentReason =
    reason ||
    `Current fulfillment ${offer.fulfillmentPct}%. ${offer.binsRemaining} bins remain unfulfilled.`;
  await offer.save();
  await recordEvent({
    offer,
    actorRole: "system",
    type: "needs_adjustment",
    payload: { reason: offer.needsAdjustmentReason },
  });
  const company = await Company.findById(offer.company).select("user");
  emitToUser(company?.user, BUILDER_OFFER_SOCKET_EVENTS.needsAdjustment, {
    offer: publicOfferDto(offer),
  });
  await notifyCompanyOfferEvent({
    companyUserId: company?.user,
    offer,
    title: "Your builder offer requires adjustment",
    description:
      offer.needsAdjustmentReason ||
      `Current fulfillment ${offer.fulfillmentPct}%. ${offer.binsRemaining} bins remain unfulfilled.`,
    eventKey: "needs_adjustment",
  });
  await emitToAdmins(BUILDER_OFFER_SOCKET_EVENTS.needsAdjustment, {
    offerId: offer._id,
  });
  return offer;
}

export async function scanStuckOffers() {
  const cutoff = new Date(Date.now() - BUILDER_OFFER_STUCK_HOURS * 3600 * 1000);
  const stuck = await BuilderOffer.find({
    status: { $in: ["open", "partially_fulfilled"] },
    binsRemaining: { $gt: 0 },
    $or: [
      { lastAcceptAt: { $lte: cutoff } },
      { lastAcceptAt: null, createdAt: { $lte: cutoff } },
    ],
  }).limit(50);
  for (const offer of stuck) {
    await markNeedsAdjustment(offer._id);
  }
  return stuck.length;
}

export async function scanExpiredOffers() {
  const now = new Date();
  const expired = await BuilderOffer.find({
    status: { $in: ["open", "partially_fulfilled", "needs_adjustment"] },
    expiresAt: { $ne: null, $lte: now },
  }).limit(50);
  for (const offer of expired) {
    offer.status = "expired";
    offer.cancelledReason = offer.cancelledReason || "Offer expired";
    await offer.save();
    await recordEvent({
      offer,
      actorRole: "system",
      type: "cancelled",
      payload: { reason: "expired", expiresAt: offer.expiresAt },
    });
    const company = await Company.findById(offer.company).select("user");
    emitToUser(company?.user, BUILDER_OFFER_SOCKET_EVENTS.updated, {
      offer: publicOfferDto(offer),
    });
    await notifyCompanyOfferEvent({
      companyUserId: company?.user,
      offer,
      title: "Builder offer expired",
      description: `${offer.title || "Your builder offer"} expired with ${offer.binsRemaining} bins remaining.`,
      eventKey: "expired",
    });
  }
  return expired.length;
}

export async function saveAsBlanket(userId, offerId, body = {}) {
  const company = await requireApprovedCompany(userId);
  const offer = await BuilderOffer.findOne({
    _id: offerId,
    company: company._id,
  });
  if (!offer) throw new NotFoundError("Builder offer not found");

  const name = body.name || offer.regionLabel || offer.title || "Approved Blanket Pricing";
  const rateCards = [];
  const bySize = new Map();
  for (const item of offer.pricingSchedule || []) {
    if (item.size) bySize.set(String(item.size), item);
  }
  for (const size of ["20", "30", "40"]) {
    const sched = bySize.get(size);
    const line = (offer.lines || []).find(
      (l) => l.lineType === "bin" && String(l.size) === size,
    );
    const unit = Number(sched?.unitBuilderPrice ?? line?.unitBuilderPrice ?? 0);
    if (unit <= 0) continue;
    rateCards.push({
      size,
      threeDayPrice: unit,
      sevenDayPrice: unit,
      fourteenDayPrice: unit,
      thirtyDayPrice: unit,
      enableFourteenDay: true,
      enableThirtyDay: true,
      perDiemRate: 0,
      includedTons: offer.includedTonnage || 0,
      overagePerTon: 0,
      overageEnforced: false,
    });
  }

  company.pricingPlan = {
    planType: "blanket",
    rateCards,
    regions: [],
    assignedAt: new Date(),
    assignedBy: userId,
  };
  // Store display name on a non-schema field via company notes if needed
  company.markModified("pricingPlan");
  await company.save();

  offer.savedAsBlanketAt = new Date();
  offer.regionLabel = offer.regionLabel || name;
  await offer.save();
  await recordEvent({
    offer,
    actor: userId,
    actorRole: "company",
    type: "blanket_saved",
    payload: { name, rateCards },
  });

  return {
    offer: publicOfferDto(offer),
    pricingPlan: company.pricingPlan,
    blanketName: name,
  };
}

export async function quickOrderFromBlanket(userId, body = {}) {
  const company = await requireApprovedCompany(userId);
  const plan = company.pricingPlan;
  if (!plan?.rateCards?.length) {
    throw new BadRequestError("No approved blanket pricing on this company");
  }
  const size = String(body.size);
  const card = plan.rateCards.find((c) => String(c.size) === size);
  if (!card) throw new BadRequestError(`No blanket rate for size ${size}`);

  const days = Number(body.rentalDays || body.rentalPeriodDays || 30);
  let unit = card.thirtyDayPrice || card.sevenDayPrice || card.threeDayPrice || 0;
  if (days <= 3) unit = card.threeDayPrice || unit;
  else if (days <= 7) unit = card.sevenDayPrice || unit;
  else if (days <= 14) unit = card.fourteenDayPrice || unit;

  const payload = {
    title: body.title || `${company.companyName} Quick Order`,
    regionLabel: body.regionLabel || "Blanket order",
    fulfillmentPreference: body.fulfillmentPreference || "multiple_providers",
    rentalPeriodDays: days,
    material: body.material || "",
    includedTonnage: card.includedTons || null,
    sourceBlanketPlanId: "company_pricing_plan",
    submit: true,
    pricingSchedule: [
      {
        key: `bin_${size}`,
        size,
        lineType: "bin",
        unitBuilderPrice: unit,
        feeEligible: true,
      },
    ],
    lines: [
      {
        jobsiteId: body.jobsiteId,
        size,
        quantity: Number(body.quantity) || 1,
        deliveryDate: body.deliveryDate,
        rentalDays: days,
        unitBuilderPrice: unit,
        lineType: "bin",
      },
    ],
  };
  return createOffer(userId, payload);
}

async function getRecommendationForOffer(offer) {
  const [acceptEvents, rejectEvents] = await Promise.all([
    BuilderOfferEvent.find({
      type: "accepted",
      zip: (offer.lines || []).find((l) => l.zip)?.zip || undefined,
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
    BuilderOfferEvent.find({ type: "rejected_portion" })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
  ]);
  return computeOfferRecommendation({ offer, acceptEvents, rejectEvents });
}

export async function getRecommendation(userId, offerId) {
  const company = await requireApprovedCompany(userId);
  const offer = await BuilderOffer.findOne({
    _id: offerId,
    company: company._id,
  });
  if (!offer) throw new NotFoundError("Builder offer not found");
  const recommendation = await getRecommendationForOffer(offer);
  await recordEvent({
    offer,
    actor: userId,
    actorRole: "company",
    type: "recommendation_viewed",
    payload: recommendation,
  });
  return recommendation;
}

export async function listProviderPortions(providerId) {
  const openOffers = await BuilderOffer.find({
    status: { $in: ["open", "partially_fulfilled", "needs_adjustment"] },
    binsRemaining: { $gt: 0 },
    notifiedProviderIds: providerId,
  })
    .sort({ updatedAt: -1 })
    .limit(50);

  const portions = [];
  for (const offer of openOffers) {
    const portion = await getProviderEligibleSelections(offer, providerId);
    if (portion) portions.push(portion);
  }
  return portions;
}

export async function listAdminOffers({ status, page = 1, limit = 20, companyId } = {}) {
  const query = {};
  if (status) query.status = status;
  if (companyId) query.company = companyId;
  const skip = (Math.max(1, Number(page)) - 1) * Math.max(1, Number(limit));
  const [rows, total] = await Promise.all([
    BuilderOffer.find(query)
      .populate("company", "companyName legalBusinessName status")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Math.max(1, Number(limit)))
      .lean(),
    BuilderOffer.countDocuments(query),
  ]);
  return {
    data: rows.map((o) => publicOfferDto(o)),
    pagination: { page: Number(page), limit: Number(limit), total },
  };
}

export async function getAdminOffer(offerId) {
  const offer = await BuilderOffer.findById(offerId).populate(
    "company",
    "companyName legalBusinessName status email phone",
  );
  if (!offer) throw new NotFoundError("Builder offer not found");
  const [allocations, counters, invoices] = await Promise.all([
    BuilderOfferAllocation.find({
      offer: offer._id,
      status: { $ne: "cancelled" },
    })
      .populate("provider", "name email phone comp_name")
      .lean(),
    BuilderOfferCounter.find({ offer: offer._id }).lean(),
    BillingRecord.find({ "metadata.builderOfferId": String(offer._id) })
      .sort({ createdAt: -1 })
      .lean(),
  ]);
  const { enrichBillingRecordsForDisplay } = await import(
    "../company/commercialService.js"
  );
  const enrichedInvoices = await enrichBillingRecordsForDisplay(invoices, {
    offerFallback: offer,
  });
  const lastMatchSnapshot = await enrichLastMatchSnapshot(
    offer.lastMatchSnapshot,
  );
  const dto = publicOfferDto(offer, {
    allocations,
    counters,
    invoices: enrichedInvoices,
  });
  dto.lastMatchSnapshot = lastMatchSnapshot;
  dto.allocations = (dto.allocations || []).map((a) => ({
    ...a,
    lines: (a.lines || []).map((al) => {
      const offerLine = resolveOfferLine(offer, al.lineId);
      return {
        ...al,
        siteName: offerLine?.siteName || "",
        city: offerLine?.city || "",
        state: offerLine?.state || "",
        jobsiteId: offerLine?.jobsite ? String(offerLine.jobsite) : null,
      };
    }),
  }));
  const pendingInvs = enrichedInvoices.filter((inv) =>
    ["open", "due", "partial"].includes(String(inv.status || "open")),
  );
  dto.transparency = {
    providerCount: dto.allocations.length,
    providers: dto.allocations.slice(0, 5).map((a) => ({
      id: a.provider?.id || a.provider,
      name: a.providerName || a.provider?.name || a.provider?.email || "Provider",
      email: a.providerEmail || a.provider?.email || "",
      phone: a.providerPhone || a.provider?.phone || "",
      binsAccepted: a.binsAccepted,
      builderPortion: a.builderPortion,
    })),
    binsAcceptedTotal: dto.allocations.reduce(
      (s, a) => s + (Number(a.binsAccepted) || 0),
      0,
    ),
    notifiedProviderCount:
      Number(lastMatchSnapshot?.portionCount) ||
      (lastMatchSnapshot?.portions || []).length ||
      0,
    pendingInvoiceCount: pendingInvs.length,
    pendingInvoiceAmount: pendingInvs.reduce(
      (s, inv) =>
        s +
        Math.max(0, (Number(inv.amount) || 0) - (Number(inv.paidAmount) || 0)),
      0,
    ),
    paidInvoiceCount: enrichedInvoices.filter((i) => i.status === "paid")
      .length,
    invoiceCount: enrichedInvoices.length,
    jobsitesRemaining: (dto.fulfillmentBreakdown?.byJobsite || []).filter(
      (s) => (s.remaining || 0) > 0,
    ).length,
    sizesRemaining: (dto.fulfillmentBreakdown?.bySize || []).filter(
      (s) => (s.remaining || 0) > 0,
    ).length,
  };
  return dto;
}

export async function adminPatchOffer(offerId, body = {}) {
  const offer = await BuilderOffer.findById(offerId);
  if (!offer) throw new NotFoundError("Builder offer not found");
  if (body.status) offer.status = body.status;
  if (body.cancelledReason) offer.cancelledReason = body.cancelledReason;
  if (body.status === "cancelled") offer.cancelledAt = new Date();
  await offer.save();
  await emitToAdmins(BUILDER_OFFER_SOCKET_EVENTS.updated, {
    offerId: offer._id,
    status: offer.status,
  });
  return publicOfferDto(offer);
}

export async function adminInviteProvider(offerId, providerId) {
  const offer = await BuilderOffer.findById(offerId);
  if (!offer) throw new NotFoundError("Builder offer not found");
  const company = await Company.findById(offer.company).select("user").lean();
  const portion = await getProviderEligibleSelections(offer, providerId);
  if (!portion) {
    const portions = await matchBuilderOfferPortions(offer, {
      onlineOnly: false,
    });
    const found = portions.find((p) => p.providerId === String(providerId));
    if (!found) {
      throw new BadRequestError("Provider has no matching inventory for this offer");
    }
    await notifyProviderPortion({
      offer,
      portion: found,
      companyUserId: company?.user,
    });
    return found;
  }
  if (!offer.notifiedProviderIds.some((id) => id.toString() === String(providerId))) {
    offer.notifiedProviderIds.push(providerId);
    await offer.save();
  }
  await notifyProviderPortion({
    offer,
    portion,
    companyUserId: company?.user,
  });
  return portion;
}

export async function listCompanyOffersAdmin(companyId, opts) {
  return listAdminOffers({ ...opts, companyId });
}
