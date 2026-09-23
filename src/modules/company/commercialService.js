import Company from "../../models/Company.js";
import BillingRecord from "../../models/BillingRecord.js";
import Order from "../../models/Order.js";
import Dumbster from "../../models/Dumbster.js";
import User from "../../models/User.js";
import BuilderOffer from "../../models/BuilderOffer.js";
import BuilderOfferAllocation from "../../models/BuilderOfferAllocation.js";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "../../utils/apiError.js";
import {
  quoteCommercialDumpster,
  buildDefaultCommercialRateCards,
  fillDerivedPackagePrices,
  rateCardsNeedDerivedFill,
  computeOverageCharge,
  normalizeCommercialSize,
  commercialSizeToDumbsterSizes,
} from "../../utils/commercialPricing.js";
import {
  createOrAppendInvoiceLine,
  billOverageToInvoice,
} from "../../utils/commercialBilling.js";
import { notifyCommercialParties } from "../../utils/commercialNotify.js";
import { generateOTP } from "../../utils/Generator.js";
import DispatchService from "../../utils/dispatchService.js";
import {
  resolveCompanyTopTier,
  findNearbyDustbinProviders,
  buildServiceQueryForType,
} from "../../utils/dustbinMatching.js";
import { computeSplit } from "../../utils/paymentHold.js";
import { scheduleOrderExpiry } from "../../utils/orderExpiryService.js";
import logger from "../../config/logger.js";

async function getIo() {
  try {
    const mod = await import("../../socket/socket.js");
    return mod.io;
  } catch {
    return null;
  }
}

async function assertCompanyOwner(userId, companyId) {
  const company = await Company.findOne({ _id: companyId, user: userId });
  if (!company) {
    throw new ForbiddenError("Company not found or not owned by this user");
  }
  return company;
}

function recordTouchesJobsite(record, jobsiteId) {
  const jid = String(jobsiteId);
  const metaSites = record.metadata?.jobsites || record.display?.jobsites || [];
  if (metaSites.some((j) => String(j.id) === jid)) return true;
  return (record.lineItems || []).some(
    (li) => String(li.metadata?.jobsiteId || "") === jid,
  );
}

/**
 * Fill provider + jobsite display fields on BillingRecords (new + legacy).
 */
export async function enrichBillingRecordsForDisplay(
  records = [],
  { offerFallback = null } = {},
) {
  if (!records.length) return records;

  const allocationIds = [
    ...new Set(
      records
        .map((r) => r.metadata?.allocationId)
        .filter(Boolean)
        .map(String),
    ),
  ];
  const offerIds = [
    ...new Set(
      records
        .map((r) => r.metadata?.builderOfferId)
        .filter(Boolean)
        .map(String),
    ),
  ];
  if (offerFallback?._id) {
    offerIds.push(String(offerFallback._id));
  }

  const [allocations, offers] = await Promise.all([
    allocationIds.length
      ? BuilderOfferAllocation.find({ _id: { $in: allocationIds } })
          .populate("provider", "name email phone comp_name")
          .lean()
      : [],
    offerIds.length
      ? BuilderOffer.find({ _id: { $in: offerIds } })
          .select("title lines")
          .lean()
      : [],
  ]);

  const allocById = Object.fromEntries(
    allocations.map((a) => [String(a._id), a]),
  );
  const offerById = Object.fromEntries(
    offers.map((o) => [String(o._id), o]),
  );
  if (offerFallback?._id) {
    offerById[String(offerFallback._id)] = offerFallback.toObject
      ? offerFallback.toObject()
      : offerFallback;
  }

  return records.map((row) => {
    const meta = { ...(row.metadata || {}) };
    const offerId = meta.builderOfferId ? String(meta.builderOfferId) : null;
    const offer = offerId ? offerById[offerId] : null;
    const allocation = meta.allocationId
      ? allocById[String(meta.allocationId)]
      : null;
    const providerDoc =
      allocation?.provider && typeof allocation.provider === "object"
        ? allocation.provider
        : null;

    if (!meta.providerName && providerDoc) {
      meta.providerId = String(providerDoc._id || allocation.provider);
      meta.providerName = providerDoc.name || providerDoc.comp_name || "";
      meta.providerEmail = providerDoc.email || "";
      meta.providerPhone = providerDoc.phone || "";
    }
    if (!meta.offerTitle && offer?.title) {
      meta.offerTitle = offer.title;
    }

    const lineItems = (row.lineItems || []).map((li) => {
      const lm = { ...(li.metadata || {}) };
      if (!lm.siteName && lm.lineId && offer?.lines) {
        const offerLine = (offer.lines || []).find(
          (l) => String(l._id) === String(lm.lineId),
        );
        if (offerLine) {
          lm.jobsiteId = offerLine.jobsite
            ? String(offerLine.jobsite)
            : lm.jobsiteId || null;
          lm.siteName = offerLine.siteName || "";
          lm.city = offerLine.city || "";
          lm.state = offerLine.state || "";
        }
      }
      // Legacy lines without lineId: try match by size on offer
      if (!lm.siteName && lm.size && offer?.lines) {
        const offerLine = (offer.lines || []).find(
          (l) =>
            (l.lineType || "bin") === "bin" &&
            String(l.size) === String(lm.size),
        );
        if (offerLine) {
          lm.jobsiteId = offerLine.jobsite
            ? String(offerLine.jobsite)
            : null;
          lm.siteName = offerLine.siteName || "";
          lm.city = offerLine.city || "";
          lm.state = offerLine.state || "";
          if (!lm.lineId && offerLine._id) lm.lineId = String(offerLine._id);
        }
      }
      return { ...li, metadata: lm };
    });

    let jobsites = Array.isArray(meta.jobsites) ? [...meta.jobsites] : [];
    if (!jobsites.length) {
      const map = new Map();
      for (const li of lineItems) {
        const id = li.metadata?.jobsiteId
          ? String(li.metadata.jobsiteId)
          : li.metadata?.siteName
            ? `name:${li.metadata.siteName}`
            : null;
        if (!id) continue;
        if (!map.has(id)) {
          map.set(id, {
            id: li.metadata?.jobsiteId || null,
            siteName: li.metadata?.siteName || "",
            city: li.metadata?.city || "",
            state: li.metadata?.state || "",
          });
        }
      }
      jobsites = [...map.values()];
      meta.jobsites = jobsites;
    }

    const primary = jobsites[0] || null;
    const display = {
      providerName: meta.providerName || "",
      providerEmail: meta.providerEmail || "",
      providerPhone: meta.providerPhone || "",
      providerId: meta.providerId || null,
      offerTitle: meta.offerTitle || "",
      jobsites,
      primaryJobsiteLabel: primary
        ? [primary.siteName, primary.city].filter(Boolean).join(" · ")
        : "",
      paymentMethod: meta.paymentMethod || null,
    };

    return {
      ...row,
      metadata: meta,
      lineItems,
      display,
    };
  });
}

export async function getQuoteForUser(userId, body) {
  const user = await User.findById(userId).select("company access_types").lean();
  const companyId = body.companyId || user?.company;
  if (!companyId) {
    throw new BadRequestError("No company associated with this account");
  }
  if (user?.company && body.companyId && String(user.company) !== String(body.companyId)) {
    throw new ForbiddenError("companyId does not match your account");
  }

  return quoteCommercialDumpster({
    companyId,
    jobSiteId: body.jobSiteId,
    size: body.size,
    numDays: body.numDays ?? body.num_days,
    quantity: body.quantity,
    dumbsterId: body.dumbsterId,
    zip: body.zip,
    regionName: body.regionName,
    location: body.location,
    rotationType: body.rotationType || "initial",
  });
}

export async function listCompanyBilling(
  userId,
  { page = 1, limit = 20, status, builderOfferId, jobsiteId } = {},
) {
  const company = await Company.findOne({ user: userId }).lean();
  if (!company) throw new NotFoundError("Company not found");

  const query = { company: company._id };
  if (status) query.status = status;
  if (builderOfferId) {
    query["metadata.builderOfferId"] = String(builderOfferId);
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(200, Math.max(1, Number(limit) || 20));
  const skip = (pageNum - 1) * limitNum;

  // When filtering by jobsite, enrich then filter (legacy rows lack jobsite indexes).
  if (jobsiteId) {
    const all = await BillingRecord.find(query)
      .populate("order")
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();
    const enriched = await enrichBillingRecordsForDisplay(all);
    const filtered = enriched.filter((r) =>
      recordTouchesJobsite(r, jobsiteId),
    );
    const total = filtered.length;
    const data = filtered.slice(skip, skip + limitNum);
    return {
      data,
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 1,
    };
  }

  const [records, total] = await Promise.all([
    BillingRecord.find(query)
      .populate("order")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    BillingRecord.countDocuments(query),
  ]);

  const data = await enrichBillingRecordsForDisplay(records);

  return {
    data,
    page: pageNum,
    limit: limitNum,
    total,
    totalPages: Math.ceil(total / limitNum) || 1,
  };
}

export async function adminSetCompanyConfig(companyId, config, adminId) {
  const allowed = {};
  if (config.paymentMethod != null) {
    if (!["card", "invoice"].includes(config.paymentMethod)) {
      throw new BadRequestError("paymentMethod must be card or invoice");
    }
    allowed.paymentMethod = config.paymentMethod;
  }
  if (config.invoiceTerms != null) {
    allowed.invoiceTerms = {
      netDays: Number(config.invoiceTerms.netDays) || 30,
      creditLimit: Number(config.invoiceTerms.creditLimit) || 0,
    };
  }
  if (config.serviceAreas != null) {
    allowed.serviceAreas = config.serviceAreas;
  }
  if (config.minOperatorTier !== undefined) {
    allowed.minOperatorTier =
      config.minOperatorTier == null ? null : Number(config.minOperatorTier);
  }
  if (config.requiredDocs != null) {
    allowed.requiredDocs = {
      w9: Boolean(config.requiredDocs.w9),
      coi: Boolean(config.requiredDocs.coi),
    };
  }
  if (config.negotiatedRotationTerms != null) {
    const t = config.negotiatedRotationTerms;
    allowed.negotiatedRotationTerms = {
      enabled: Boolean(t.enabled),
      includedDaysPerRotation:
        t.includedDaysPerRotation == null || t.includedDaysPerRotation === ""
          ? null
          : Number(t.includedDaysPerRotation),
      includedTonsPerRotation:
        t.includedTonsPerRotation == null || t.includedTonsPerRotation === ""
          ? null
          : Number(t.includedTonsPerRotation),
      overagePerTon:
        t.overagePerTon == null || t.overagePerTon === ""
          ? null
          : Number(t.overagePerTon),
      extraDay:
        t.extraDay == null || t.extraDay === "" ? null : Number(t.extraDay),
      sizes: (t.sizes || [])
        .filter((s) => s && s.size)
        .map((s) => ({
          size: String(s.size),
          initialDelivery:
            s.initialDelivery == null || s.initialDelivery === ""
              ? null
              : Number(s.initialDelivery),
          emptyAndRedeliver:
            s.emptyAndRedeliver == null || s.emptyAndRedeliver === ""
              ? null
              : Number(s.emptyAndRedeliver),
        })),
    };
  }

  const company = await Company.findByIdAndUpdate(
    companyId,
    { $set: allowed },
    { new: true, runValidators: true },
  );
  if (!company) throw new NotFoundError("Company not found");

  notifyCommercialParties({
    actorId: adminId,
    customer: await User.findById(company.user).select("email fcmtoken name").lean(),
    type: "company",
    title: "Company settings updated",
    description: "Your commercial account settings were updated by admin.",
    metadata: { action: "company_config_updated", companyId },
  }).catch((err) => logger.error(err));

  return company;
}

export async function adminUpsertPricingPlan(companyId, planPayload, adminId) {
  const company = await Company.findById(companyId);
  if (!company) throw new NotFoundError("Company not found");

  const planType = planPayload.planType || "blanket";
  if (!["blanket", "regional", "multi_region"].includes(planType)) {
    throw new BadRequestError("Invalid planType");
  }

  const rateCards = (planPayload.rateCards || []).map((c) =>
    fillDerivedPackagePrices(c),
  );
  const regions = (planPayload.regions || []).map((r) => ({
    ...r,
    rateCards: (r.rateCards || []).map((c) => fillDerivedPackagePrices(c)),
  }));

  company.pricingPlan = {
    planType,
    rateCards,
    regions,
    assignedAt: new Date(),
    assignedBy: adminId,
  };
  await company.save();

  const owner = await User.findById(company.user).select("email fcmtoken name").lean();
  notifyCommercialParties({
    actorId: adminId,
    customer: owner,
    type: "plan_assigned",
    title: "Pricing plan assigned",
    description: `Your commercial pricing plan (${planType}) has been updated.`,
    metadata: {
      action: "plan_assigned",
      companyId: companyId.toString(),
      planType,
    },
  }).catch((err) => logger.error(err));

  return company;
}

/**
 * Ensure every builder has blanket rate cards from dumpster base rates,
 * with 14/30-day packages derived from 3/7-day prices.
 * Safe to call for new approvals and existing builders with empty/partial plans.
 */
export async function ensureDefaultPricingPlan(companyId, adminId = null) {
  const company = await Company.findById(companyId);
  if (!company) throw new NotFoundError("Company not found");

  const plan = company.pricingPlan || {};
  const existingCards = plan.rateCards || [];
  const hasAnyPricing = existingCards.some(
    (c) =>
      Number(c.threeDayPrice) > 0 ||
      Number(c.sevenDayPrice) > 0 ||
      Number(c.perDiemRate) > 0 ||
      Number(c.includedTons) > 0,
  );

  let changed = false;

  if (!hasAnyPricing) {
    const defaults = await buildDefaultCommercialRateCards();
    company.pricingPlan = {
      planType: plan.planType || "blanket",
      rateCards: defaults,
      regions: plan.regions || [],
      assignedAt: new Date(),
      assignedBy: adminId || plan.assignedBy || null,
    };
    changed = true;
  } else if (rateCardsNeedDerivedFill(existingCards)) {
    company.pricingPlan = {
      ...(company.pricingPlan?.toObject?.() || company.pricingPlan || {}),
      planType: plan.planType || "blanket",
      rateCards: existingCards.map((c) => fillDerivedPackagePrices(c)),
      regions: (plan.regions || []).map((r) => ({
        ...(r.toObject?.() || r),
        rateCards: (r.rateCards || []).map((c) => fillDerivedPackagePrices(c)),
      })),
    };
    changed = true;
  }

  if (changed) {
    await company.save();
  }

  return company;
}

export async function adminGetPricingPlan(companyId) {
  // Keep all builders (including newly approved) on dumpster-based defaults + derived 14/30
  const company = await ensureDefaultPricingPlan(companyId);
  return {
    pricingPlan: company.pricingPlan,
    companyName: company.companyName,
    paymentMethod: company.paymentMethod,
    negotiatedRotationTerms: company.negotiatedRotationTerms || null,
  };
}

export async function adminDeletePricingPlan(companyId) {
  const company = await Company.findByIdAndUpdate(
    companyId,
    { $unset: { pricingPlan: 1 } },
    { new: true },
  );
  if (!company) throw new NotFoundError("Company not found");
  return company;
}

export async function adminListBilling({ companyId, status, page = 1, limit = 20 } = {}) {
  const query = {};
  if (companyId) query.company = companyId;
  if (status) query.status = status;
  const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
  const [records, total] = await Promise.all([
    BillingRecord.find(query)
      .populate("company order user")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit) || 20)
      .lean(),
    BillingRecord.countDocuments(query),
  ]);
  const data = await enrichBillingRecordsForDisplay(records);
  return {
    data,
    page: Number(page) || 1,
    limit: Number(limit) || 20,
    total,
    totalPages: Math.ceil(total / (Number(limit) || 20)),
  };
}

export async function adminMarkBillingPaid(billingId, adminId, { paidAmount, notes } = {}) {
  const record = await BillingRecord.findById(billingId);
  if (!record) throw new NotFoundError("Billing record not found");

  const amount = paidAmount != null ? Number(paidAmount) : Number(record.amount);
  record.paidAmount = amount;
  record.status = amount >= Number(record.amount) ? "paid" : "partial";
  record.paidAt = new Date();
  if (notes) record.notes = notes;
  record.metadata = {
    ...(record.metadata || {}),
    markedPaidBy: adminId,
    markedPaidAt: new Date(),
  };
  await record.save();

  const owner = await User.findById(record.user).select("email fcmtoken name").lean();
  notifyCommercialParties({
    actorId: adminId,
    customer: owner,
    type: "invoice_due",
    title: "Invoice payment recorded",
    description: `Invoice ${record.invoiceNumber} marked as ${record.status}.`,
    orderId: record.order?.toString(),
    metadata: {
      action: "invoice_paid",
      invoiceId: record._id.toString(),
      status: record.status,
    },
  }).catch((err) => logger.error(err));

  return record;
}

/**
 * Create a swap request on an active commercial order.
 * Pickup stays on the existing order; a linked drop-off order is created.
 */
export async function createSwapRequest(userId, orderId, payload = {}) {
  const order = await Order.findById(orderId)
    .populate("user company dumbster to_id jobSite")
    .exec();
  if (!order) throw new NotFoundError("Order not found");
  if (!order.company) {
    throw new BadRequestError("Swap requests are only available for commercial orders");
  }
  if (order.status !== "accepted") {
    throw new BadRequestError("Only active accepted orders can be swapped");
  }
  if (String(order.user._id || order.user) !== String(userId)) {
    throw new ForbiddenError("Not your order");
  }
  if (order.swapRequest?.status && !["none", "cancelled"].includes(order.swapRequest.status)) {
    throw new BadRequestError("A swap request is already in progress for this order");
  }

  const requestedSize =
    normalizeCommercialSize(payload.size) ||
    order.commercialSize ||
    normalizeCommercialSize(order.dumbster?.size) ||
    "20";
  const sameSize =
    payload.sameSize != null
      ? Boolean(payload.sameSize)
      : requestedSize ===
        (order.commercialSize || normalizeCommercialSize(order.dumbster?.size));

  const windowStart = payload.windowStart
    ? new Date(payload.windowStart)
    : (() => {
        const d = new Date();
        d.setUTCDate(d.getUTCDate() + 1);
        d.setUTCHours(8, 0, 0, 0);
        return d;
      })();
  const windowEnd = payload.windowEnd
    ? new Date(payload.windowEnd)
    : (() => {
        const d = new Date(windowStart);
        d.setUTCHours(17, 0, 0, 0);
        return d;
      })();

  const quote = await quoteCommercialDumpster({
    companyId: order.company._id || order.company,
    jobSiteId: order.jobSite?._id || order.jobSite,
    size: requestedSize,
    numDays: order.num_days || 3,
    location: order.location,
    rotationType: "empty_redeliver",
  });

  let dumbsterId = quote.dumbsterId || order.dumbster?._id || order.dumbster;
  if (!dumbsterId) {
    const sizes = commercialSizeToDumbsterSizes(requestedSize);
    const dump = await Dumbster.findOne({ size: { $in: sizes }, status: "active" }).lean();
    dumbsterId = dump?._id;
  }

  const companyId = order.company._id || order.company;
  const { topTier, cascade: tierCascade } =
    await resolveCompanyTopTier(companyId);
  const coords = order.location?.coordinates || [];
  const longitude = coords[0];
  const latitude = coords[1];

  let providers = [];
  if (latitude != null && longitude != null && dumbsterId) {
    const matchResult = await findNearbyDustbinProviders({
      serviceQuery: buildServiceQueryForType({
        serviceType: "Dumbster",
        dumbsterId,
      }),
      start_date: windowStart,
      end_date: windowEnd,
      quantity: order.quantity || 1,
      latitude,
      longitude,
      companyId,
      topTier,
      cascade: tierCascade,
      onlineOnly: false,
    });
    providers = matchResult.providers || [];
  }

  const paymentMethod =
    order.companyPaymentMethod ||
    order.company?.paymentMethod ||
    "card";

  const dropoffOrder = await Order.create({
    user: order.user._id || order.user,
    company: companyId,
    jobSite: order.jobSite?._id || order.jobSite || null,
    dumbster: dumbsterId,
    start_date: windowStart,
    end_date: new Date(
      windowStart.getTime() +
        (Number(order.num_days) || 3) * 24 * 60 * 60 * 1000,
    ),
    service_type: "Dumbster",
    price: quote.price,
    amount: computeSplit(quote.price, { driveaway: false, cancelation: false }).amount,
    location: order.location,
    address: order.address,
    num_days: order.num_days,
    time: order.time,
    materialInformation: order.materialInformation,
    category: order.category,
    subCategory: order.subCategory,
    placementLocation: order.placementLocation,
    placementNote: order.placementNote,
    quantity: order.quantity || 1,
    orderNumber: generateOTP(5, { alphabet: true, numeric: true }),
    userIds: providers.map((p) => p.userId),
    status: "pending",
    payment_type: paymentMethod === "invoice" ? "invoice" : order.payment_type,
    paymentId: null,
    companyPaymentMethod: paymentMethod,
    commercialSize: requestedSize,
    includedTons: quote.tonnage.includedTons,
    overagePerTon: quote.tonnage.overagePerTon,
    overageEnforced: quote.tonnage.overageEnforced,
    perDiemRateSnapshot: quote.breakdown.perDiemRate,
    orderKind: "swap_dropoff",
    metadata: (() => {
      const parentMeta = order.metadata || {};
      const everyDays = Math.max(1, Number(parentMeta.exchangeEveryDays) || 3);
      let nextExchangeAt = null;
      if (parentMeta.exchangeMode === "automatic") {
        const d = new Date(windowStart);
        d.setDate(d.getDate() + everyDays);
        nextExchangeAt = d;
      }
      return {
        swapOf: order._id.toString(),
        quoteSource: quote.source,
        paymentHoldStatus:
          paymentMethod === "invoice" ? "invoice_pending" : "pending_webhook",
        source: parentMeta.source || "builder_offer",
        builderOfferId: parentMeta.builderOfferId,
        eachServiceIsSeparateOrder: parentMeta.eachServiceIsSeparateOrder !== false,
        exchangeMode: parentMeta.exchangeMode,
        exchangeEveryDays: parentMeta.exchangeEveryDays,
        exchangeTurnaround: parentMeta.exchangeTurnaround,
        exchangeTurnaroundCustom: parentMeta.exchangeTurnaroundCustom,
        exchangeTurnaroundDate: parentMeta.exchangeTurnaroundDate,
        exchangeRequirements: parentMeta.exchangeRequirements || "",
        advanceNotice: parentMeta.advanceNotice,
        finalPickupMode: parentMeta.finalPickupMode,
        finalPickupDate: parentMeta.finalPickupDate,
        authorizedPickupName: parentMeta.authorizedPickupName || "",
        authorizedPickupPhone: parentMeta.authorizedPickupPhone || "",
        nextExchangeAt,
      };
    })(),
    swapRequest: {
      // Replacement unit starts clean so future empty/redeliver (manual or auto) can run.
      status: "none",
      linkedPickupOrder: order._id,
      requestedBy: userId,
      requestedAt: new Date(),
      notes: payload.notes || "",
    },
  });

  order.orderKind = order.orderKind === "standard" ? "swap_pickup" : order.orderKind;
  order.readyToPickup = true;
  order.swapRequest = {
    status: "requested",
    requestedSize,
    sameSize,
    windowStart,
    windowEnd,
    linkedPickupOrder: order._id,
    linkedDropoffOrder: dropoffOrder._id,
    requestedBy: userId,
    requestedAt: new Date(),
    notes: payload.notes || "",
  };
  await order.save();

  dropoffOrder.swapRequest.linkedDropoffOrder = dropoffOrder._id;
  await dropoffOrder.save();

  if (paymentMethod === "invoice") {
    await createOrAppendInvoiceLine({
      companyId,
      userId,
      orderId: dropoffOrder._id,
      amount: quote.price,
      type: "swap",
      description: `Swap drop-off (${requestedSize} yd)`,
      metadata: { swapOf: order._id.toString() },
    });
    dropoffOrder.billingRecord = (
      await BillingRecord.findOne({ order: dropoffOrder._id })
    )?._id;
    await dropoffOrder.save();
  }

  if (providers.length) {
    DispatchService.initializeDispatchWaves(
      dropoffOrder,
      providers.map((p) => p.userId),
    ).catch((err) => logger.error("Swap dispatch init failed", err));
  }
  scheduleOrderExpiry(dropoffOrder._id, null).catch(() => {});

  const customer = order.user;
  const operator = order.to_id;
  await notifyCommercialParties({
    actorId: userId,
    customer,
    operator,
    type: "swap_requested",
    title: "Swap requested",
    description: `A ${requestedSize}-yard swap was requested for order ${order.orderNumber}.`,
    orderId: order._id.toString(),
    customerLink: `https://api.binsapp.ai/customer-orders?orderId=${order._id}`,
    operatorLink: `https://api.binsapp.ai/owner-orders?orderId=${order._id}`,
    metadata: {
      action: "swap_requested",
      dropoffOrderId: dropoffOrder._id.toString(),
      size: requestedSize,
    },
  });

  const io = await getIo();
  if (io) {
    if (operator) {
      io.to(`user_${operator._id || operator}`).emit("swap-request-renter", {
        success: true,
        order,
        dropoffOrder,
        title: "Swap requested",
        message: `Customer requested a ${requestedSize}-yard swap.`,
      });
    }
    io.to(`user_${userId}`).emit("swap-request-rentee", {
      success: true,
      order,
      dropoffOrder,
      title: "Swap requested",
      message: "Your swap request was submitted.",
    });
  }

  return { pickupOrder: order, dropoffOrder };
}

export async function updateSwapStatus(actorId, orderId, status, { role } = {}) {
  const order = await Order.findById(orderId).populate("user company to_id");
  if (!order) throw new NotFoundError("Order not found");
  if (!order.company) throw new BadRequestError("Not a commercial order");
  if (!order.swapRequest || order.swapRequest.status === "none") {
    throw new BadRequestError("No swap request on this order");
  }

  const allowed = ["accepted", "completed", "cancelled", "dispatched"];
  if (!allowed.includes(status)) {
    throw new BadRequestError("Invalid swap status");
  }

  order.swapRequest.status = status;
  await order.save();

  if (order.swapRequest.linkedDropoffOrder) {
    await Order.findByIdAndUpdate(order.swapRequest.linkedDropoffOrder, {
      $set: { "swapRequest.status": status },
    });
  }

  const type =
    status === "accepted"
      ? "swap_accepted"
      : status === "completed"
        ? "swap_completed"
        : "swap_requested";

  await notifyCommercialParties({
    actorId,
    customer: order.user,
    operator: order.to_id,
    type,
    title: `Swap ${status}`,
    description: `Swap request for order ${order.orderNumber} is now ${status}.`,
    orderId: order._id.toString(),
    metadata: { action: `swap_${status}`, role },
  });

  return order;
}

export async function recordOrderWeight(operatorId, orderId, actualWeight) {
  const order = await Order.findById(orderId).populate("user company to_id");
  if (!order) throw new NotFoundError("Order not found");
  if (!order.company) {
    throw new BadRequestError("Weight recording is for commercial orders only");
  }
  if (String(order.to_id?._id || order.to_id) !== String(operatorId)) {
    throw new ForbiddenError("Only the assigned operator can record weight");
  }

  const weight = Number(actualWeight);
  if (!Number.isFinite(weight) || weight < 0) {
    throw new BadRequestError("actualWeight must be a non-negative number");
  }

  const overage = computeOverageCharge({
    actualWeight: weight,
    includedTons: order.includedTons,
    overagePerTon: order.overagePerTon,
    overageEnforced: order.overageEnforced,
  });

  order.actualWeight = weight;
  order.weightRecordedAt = new Date();
  order.weightRecordedBy = operatorId;
  order.overageTons = overage.overageTons;
  order.overageAmount = overage.amount;
  order.overageStatus = overage.billed
    ? "billed"
    : overage.mayApply
      ? "may_apply"
      : "none";
  await order.save();

  if (overage.billed && overage.amount > 0) {
    const paymentMethod =
      order.companyPaymentMethod || order.company?.paymentMethod || "card";
    if (paymentMethod === "invoice") {
      await billOverageToInvoice({
        companyId: order.company._id || order.company,
        userId: order.user._id || order.user,
        orderId: order._id,
        amount: overage.amount,
        overageTons: overage.overageTons,
      });
    } else {
      await User.findByIdAndUpdate(order.user._id || order.user, {
        $inc: { balance: -overage.amount },
      });
    }
  }

  await notifyCommercialParties({
    actorId: operatorId,
    customer: order.user,
    operator: order.to_id,
    type: "overage_recorded",
    title: overage.billed
      ? "Overage billed"
      : overage.mayApply
        ? "Weight recorded (overage may apply)"
        : "Weight recorded",
    description: overage.billed
      ? `Overage of ${overage.overageTons} tons ($${overage.amount}) was billed.`
      : overage.mayApply
        ? `Weight ${weight} tons recorded; overage of ${overage.overageTons} tons may apply.`
        : `Weight ${weight} tons recorded within included allowance.`,
    orderId: order._id.toString(),
    metadata: {
      action: "overage_recorded",
      actualWeight: weight,
      overageTons: overage.overageTons,
      overageAmount: overage.amount,
      overageStatus: order.overageStatus,
    },
  });

  const io = await getIo();
  if (io) {
    io.to(`user_${order.user._id || order.user}`).emit("weight-recorded-rentee", {
      success: true,
      order,
      overage,
    });
    io.to(`user_${operatorId}`).emit("weight-recorded-renter", {
      success: true,
      order,
      overage,
    });
  }

  return { order, overage };
}

export { assertCompanyOwner };
