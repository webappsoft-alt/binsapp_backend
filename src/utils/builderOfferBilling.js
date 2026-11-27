import BillingRecord from "../models/BillingRecord.js";
import BuilderOffer from "../models/BuilderOffer.js";
import BuilderOfferEvent from "../models/BuilderOfferEvent.js";
import User from "../models/User.js";
import {
  computeSplitFromLines,
  createOffSessionCharge,
  validateSavedCardPaymentMethod,
} from "./paymentHold.js";
import { notifyCommercialParties } from "./commercialNotify.js";
import { generateOTP } from "./Generator.js";
import logger from "../config/logger.js";
import { BadRequestError, NotFoundError } from "./apiError.js";

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function splitTotalEvenly(total, count) {
  const safeCount = Math.max(1, Math.floor(Number(count) || 1));
  const totalCents = Math.round((Number(total) || 0) * 100);
  const baseCents = Math.floor(totalCents / safeCount);
  const remainder = totalCents - baseCents * safeCount;
  const parts = [];
  for (let i = 0; i < safeCount; i += 1) {
    const cents = baseCents + (i < remainder ? 1 : 0);
    parts.push(cents / 100);
  }
  return parts;
}

function addDays(base, days) {
  const d = new Date(base || Date.now());
  d.setUTCDate(d.getUTCDate() + Math.max(0, Number(days) || 0));
  return d;
}

/**
 * Compute default multi-invoice installment schedule from offer settings.
 * Supports:
 * - scheduled_installments (including 1-load Acceptance + Pickup split)
 * - per_load (each completed load billed separately)
 * - grouped_loads (e.g., every 5 verified loads)
 * - paid_in_full (100% upon provider acceptance)
 */
export function buildDefaultInstallmentPlan(offer = {}) {
  const total = roundMoney(offer.builderTotal);
  const loads = Math.max(1, Math.floor(Number(offer.estimatedLoads) || 1));
  const mode = offer.billingMode || "scheduled_installments";
  const firstDelivery =
    (offer.lines || []).find((l) => l?.deliveryDate)?.deliveryDate ||
    new Date();
  const cadenceDays = Math.max(
    1,
    Number(offer.exchangeEveryDays) ||
      (loads > 1
        ? Math.max(1, Math.floor((Number(offer.rentalPeriodDays) || 30) / loads))
        : Number(offer.rentalPeriodDays) || 7),
  );

  if (total <= 0) return [];

  if (mode === "paid_in_full") {
    return [
      {
        index: 1,
        label: "Paid in Full (On Provider Acceptance)",
        trigger: "acceptance",
        loadNumber: 1,
        dueDate: new Date(),
        amount: total,
        status: "scheduled",
      },
    ];
  }

  if (mode === "grouped_loads") {
    const groupSize = Math.max(1, Number(offer.groupedLoadSize) || 5);
    const batchCount = Math.max(1, Math.ceil(loads / groupSize));
    const perLoadAmount = total / loads;
    const plan = [];
    let allocated = 0;
    for (let i = 0; i < batchCount; i += 1) {
      const startLoad = i * groupSize + 1;
      const endLoad = Math.min(loads, (i + 1) * groupSize);
      const countInBatch = endLoad - startLoad + 1;
      const amount =
        i === batchCount - 1
          ? roundMoney(Math.max(0, total - allocated))
          : roundMoney(perLoadAmount * countInBatch);
      allocated += amount;
      plan.push({
        index: i + 1,
        label: `Verified Loads ${startLoad}-${endLoad}`,
        trigger: "grouped_loads",
        loadNumber: startLoad,
        loadRangeEnd: endLoad,
        dueDate: addDays(firstDelivery, (endLoad - 1) * cadenceDays),
        amount,
        status: "scheduled",
      });
    }
    return plan;
  }

  if (mode === "per_load") {
    const parts = splitTotalEvenly(total, loads);
    return parts.map((amount, idx) => ({
      index: idx + 1,
      label:
        idx === 0
          ? "Load #1 (On Service Verification)"
          : `Load #${idx + 1} (On Completion)`,
      trigger: "load",
      loadNumber: idx + 1,
      dueDate: addDays(firstDelivery, idx * cadenceDays),
      amount,
      status: "scheduled",
    }));
  }

  // Default: scheduled_installments
  if (loads === 1) {
    const count = Math.max(1, Math.min(2, Number(offer.installmentCount) || 2));
    if (count === 1) {
      return [
        {
          index: 1,
          label: "Installment 1 (Provider Acceptance)",
          trigger: "acceptance",
          loadNumber: 1,
          dueDate: new Date(),
          amount: total,
          status: "scheduled",
        },
      ];
    }
    const [firstHalf, secondHalf] = splitTotalEvenly(total, 2);
    return [
      {
        index: 1,
        label: "Installment 1 (Upfront on Provider Acceptance)",
        trigger: "acceptance",
        loadNumber: 1,
        dueDate: new Date(),
        amount: firstHalf,
        status: "scheduled",
      },
      {
        index: 2,
        label: "Installment 2 (Due on Pickup Before Completion)",
        trigger: "pickup",
        loadNumber: 1,
        dueDate: addDays(firstDelivery, Number(offer.rentalPeriodDays) || 7),
        amount: secondHalf,
        status: "scheduled",
      },
    ];
  }

  const count = Math.max(1, Number(offer.installmentCount) || loads);
  const parts = splitTotalEvenly(total, count);
  return parts.map((amount, idx) => ({
    index: idx + 1,
    label:
      idx === 0
        ? "Installment 1 (Upfront on Acceptance)"
        : `Installment ${idx + 1} (Load #${Math.min(loads, idx + 1)})`,
    trigger: idx === 0 ? "acceptance" : "load",
    loadNumber: Math.min(loads, idx + 1),
    dueDate:
      idx === 0 ? new Date() : addDays(firstDelivery, idx * cadenceDays),
    amount,
    status: "scheduled",
  }));
}

/**
 * Validate payment method BEFORE broadcast without placing any hold or charge.
 */
export async function verifyOfferPaymentReady({ company, offerTotal = 0 }) {
  if (!company) {
    throw new BadRequestError("Approved commercial company account is required");
  }
  const paymentMethod = company.paymentMethod || "card";
  if (paymentMethod === "card") {
    const owner = await User.findById(company.user).select("cus_id").lean();
    const check = await validateSavedCardPaymentMethod({
      customerId: owner?.cus_id,
    });
    if (!check.valid) {
      const err = new BadRequestError(
        check.message ||
          "Please save a valid payment card on the Terms & Payment step before broadcasting.",
      );
      err.code = check.code || "PAYMENT_METHOD_REQUIRED";
      throw err;
    }
    return {
      valid: true,
      paymentMethod: "card",
      cardSummary: check.cardSummary,
    };
  }

  // Invoice / Net terms requires approved program & credit limit check
  if (company.status !== "approved") {
    throw new BadRequestError(
      "Net invoice terms require an approved commercial credit account.",
    );
  }
  const limit = Number(company.invoiceTerms?.creditLimit) || 0;
  if (limit > 0 && Number(offerTotal) > limit) {
    throw new BadRequestError(
      `Estimated offer value ($${Number(offerTotal).toFixed(0)}) exceeds your approved Net terms limit ($${limit.toFixed(0)}). Switch to card or adjust scope.`,
    );
  }
  return { valid: true, paymentMethod: "invoice" };
}

/**
 * Recompute single contract ledger from BillingRecord documents.
 * Guarantees estimate, invoiced, collected, due, disputed and provider payout never blur together.
 */
export async function recomputeContractLedger(offerDoc, preloadedRecords = null) {
  if (!offerDoc?._id) return null;
  const records =
    preloadedRecords ||
    (await BillingRecord.find({
      $or: [
        { contract: offerDoc._id },
        { "metadata.builderOfferId": String(offerDoc._id) },
      ],
    }).lean());

  const estimatedContractValue = roundMoney(offerDoc.builderTotal);
  let invoicedTotal = 0;
  let collectedTotal = 0;
  let unpaidDueTotal = 0;
  let disputedTotal = 0;
  let refundedTotal = 0;
  let futureRemainingTotal = 0;
  let providerEarnedTotal = 0;
  let providerEligiblePayoutTotal = 0;
  let providerDisbursedTotal = 0;

  for (const r of records) {
    if (r.status === "void") continue;
    const amt = Math.max(0, Number(r.amount) || 0);
    const paid = Math.max(0, Number(r.paidAmount) || 0);
    const outstanding = Math.max(0, amt - paid);

    if (r.status === "scheduled") {
      futureRemainingTotal += amt;
    } else {
      invoicedTotal += amt;
      if (r.status === "disputed") {
        disputedTotal += outstanding;
      } else if (["open", "due", "partial", "failed"].includes(r.status)) {
        unpaidDueTotal += outstanding;
      }
    }

    collectedTotal += paid;

    for (const adj of r.adjustments || []) {
      if (adj.type === "refund") {
        refundedTotal += Math.abs(Number(adj.amount) || 0);
      }
    }

    const earned = Number(r.providerEarnedAmount) || 0;
    if (r.providerPayoutStatus === "eligible") {
      providerEarnedTotal += earned;
      providerEligiblePayoutTotal += Math.max(
        0,
        earned - (Number(r.providerDisbursedAmount) || 0),
      );
    } else if (r.providerPayoutStatus === "disbursed") {
      providerEarnedTotal += earned;
      providerDisbursedTotal += Number(r.providerDisbursedAmount) || earned;
    }
  }

  if (
    records.length === 0 &&
    offerDoc.billingMode &&
    ["per_load", "grouped_loads"].includes(offerDoc.billingMode)
  ) {
    futureRemainingTotal = estimatedContractValue;
  }

  const ledger = {
    estimatedContractValue,
    invoicedTotal: roundMoney(invoicedTotal),
    collectedTotal: roundMoney(collectedTotal),
    unpaidDueTotal: roundMoney(unpaidDueTotal),
    disputedTotal: roundMoney(disputedTotal),
    refundedTotal: roundMoney(refundedTotal),
    futureRemainingTotal: roundMoney(futureRemainingTotal),
    providerEarnedTotal: roundMoney(providerEarnedTotal),
    providerEligiblePayoutTotal: roundMoney(providerEligiblePayoutTotal),
    providerDisbursedTotal: roundMoney(providerDisbursedTotal),
  };

  offerDoc.contractLedger = ledger;
  return ledger;
}

/**
 * Generate contract invoices upon award & immediately charge acceptance installment if applicable.
 * If initial acceptance charge fails, rolls back created BillingRecords and throws so accept cancels atomically.
 */
export async function createContractInvoicesOnAward({
  company,
  offer,
  allocation,
  ordersByLineIndex = [],
}) {
  const paymentMethod = company.paymentMethod || "card";
  allocation.paymentMethod = paymentMethod;

  const owner = await User.findById(company.user)
    .select("cus_id fcmtoken email")
    .lean();
  const provider = await User.findById(allocation.provider)
    .select("name email phone comp_name")
    .lean();

  const plan =
    Array.isArray(offer.installmentPlan) && offer.installmentPlan.length
      ? offer.installmentPlan.map((p) =>
          typeof p.toObject === "function" ? p.toObject() : { ...p },
        )
      : buildDefaultInstallmentPlan(offer);

  const firstOrderId = ordersByLineIndex.find(Boolean)?._id || null;
  const jobsitesById = new Map();
  for (const al of allocation.lines || []) {
    const offerLine = (offer.lines || []).find(
      (l) => String(l._id) === String(al.lineId),
    );
    const jobsiteId = offerLine?.jobsite ? String(offerLine.jobsite) : null;
    if (jobsiteId) {
      jobsitesById.set(jobsiteId, {
        id: jobsiteId,
        siteName: offerLine?.siteName || "",
        city: offerLine?.city || "",
        state: offerLine?.state || "",
      });
    }
  }

  const splitRatio =
    Number(allocation.builderPortion) > 0
      ? Number(allocation.providerPayout) / Number(allocation.builderPortion)
      : 0.85;

  const netDays = Number(company.invoiceTerms?.netDays) || 30;
  const invoicePrefix = `INV-${generateOTP(6, { alphabet: true, numeric: true })}`;
  const createdRecords = [];

  try {
    for (let idx = 0; idx < plan.length; idx += 1) {
      const item = plan[idx];
      const invNum = `${invoicePrefix}-${String(idx + 1).padStart(2, "0")}`;
      const amount = roundMoney(item.amount);
      const earnedShare = roundMoney(amount * splitRatio);
      const isAcceptanceTrigger = item.trigger === "acceptance";

      let status = isAcceptanceTrigger ? "open" : "scheduled";
      let paidAmount = 0;
      let paidAt = null;
      let providerPayoutStatus = "pending_collection";
      const attempts = [];

      if (isAcceptanceTrigger && amount > 0 && paymentMethod === "card") {
        if (!owner?.cus_id) {
          throw new BadRequestError(
            "Company card setup is missing. Please save a card before provider acceptance.",
          );
        }
        const charge = await createOffSessionCharge({
          customerId: owner.cus_id,
          amountDollars: amount,
          description: `${offer.title || "Builder Offer"} · ${item.label || `Installment ${idx + 1}`}`,
          metadata: {
            source: "builder_offer",
            builderOfferId: offer._id.toString(),
            allocationId: allocation._id.toString(),
            companyId: company._id.toString(),
            installmentIndex: String(idx + 1),
          },
          idempotencyKey: `bo-award-${offer._id}-${allocation._id}-${idx + 1}`,
        });
        attempts.push({
          attemptedAt: new Date(),
          status: charge.success ? "succeeded" : "failed",
          paymentIntentId: charge.paymentId || "",
          amount,
          errorMessage: charge.success ? "" : charge.message || "Charge failed",
        });
        if (!charge.success) {
          throw new BadRequestError(
            charge.message ||
              "Initial installment payment failed on the builder's card. Job not activated.",
          );
        }
        status = "paid";
        paidAmount = amount;
        paidAt = new Date();
        providerPayoutStatus = "eligible";
        allocation.paymentHoldId = charge.paymentId;
      }

      const dueDate =
        item.dueDate ||
        addDays(new Date(), isAcceptanceTrigger ? netDays : (idx + 1) * 7);

      const record = await BillingRecord.create({
        company: company._id,
        user: company.user,
        order: firstOrderId,
        contract: offer._id,
        installmentIndex: idx + 1,
        triggerType: item.trigger || "load",
        invoiceNumber: invNum,
        status,
        amount,
        paidAmount,
        providerEarnedAmount: earnedShare,
        providerDisbursedAmount: 0,
        providerPayoutStatus,
        dueDate,
        paidAt,
        paymentAttempts: attempts,
        lineItems: [
          {
            type: "builder_offer",
            description: `${offer.title || "Builder Offer"} · ${item.label || `Installment ${idx + 1}`}`,
            amount,
            order: firstOrderId,
            metadata: {
              source: "builder_offer",
              builderOfferId: offer._id.toString(),
              allocationId: allocation._id.toString(),
              installmentIndex: idx + 1,
              trigger: item.trigger,
              loadNumber: item.loadNumber || null,
            },
            createdAt: new Date(),
          },
        ],
        metadata: {
          source: "builder_offer",
          builderOfferId: offer._id.toString(),
          allocationId: allocation._id.toString(),
          installmentIndex: idx + 1,
          installmentCount: plan.length,
          trigger: item.trigger,
          loadNumber: item.loadNumber || null,
          loadRangeEnd: item.loadRangeEnd || null,
          billingMode: offer.billingMode || "scheduled_installments",
          paymentMethod,
          paymentHoldId:
            attempts.find((a) => a.paymentIntentId)?.paymentIntentId || null,
          offerTitle: offer.title || "",
          serviceType: offer.serviceType || "dumpster",
          estimatedLoads: offer.estimatedLoads || 1,
          binsAccepted: allocation.binsAccepted,
          platformFee: roundMoney(amount - earnedShare),
          providerPayout: earnedShare,
          providerId: allocation.provider ? String(allocation.provider) : null,
          providerName: provider?.name || provider?.comp_name || "",
          providerEmail: provider?.email || "",
          providerPhone: provider?.phone || "",
          jobsites: [...jobsitesById.values()],
          commercialTerms: {
            rentalPeriodDays: offer.rentalPeriodDays,
            estimatedLoads: offer.estimatedLoads || 1,
            billingMode: offer.billingMode || "scheduled_installments",
            includedTonnage: offer.includedTonnage,
            additionalTons: offer.additionalTons || 0,
            additionalTonnageRate: offer.additionalTonnageRate,
            additionalDayRate: offer.additionalDayRate,
            exchangeMode: offer.exchangeMode,
            exchangeEveryDays: offer.exchangeEveryDays,
            material: offer.material,
            eachServiceIsSeparateOrder:
              offer.eachServiceIsSeparateOrder !== false,
          },
        },
      });

      createdRecords.push(record);
      plan[idx] = {
        ...item,
        billingRecord: record._id,
        status:
          status === "paid"
            ? "paid"
            : isAcceptanceTrigger
              ? "due"
              : "scheduled",
        paidAt,
      };
    }

    offer.installmentPlan = plan;
    await recomputeContractLedger(offer, createdRecords);
    await offer.save();

    const primaryRecord = createdRecords[0] || null;
    const pickupPlanItem = plan.find((p) => p.trigger === "pickup");

    for (const order of ordersByLineIndex.filter(Boolean)) {
      order.billingRecord = primaryRecord?._id || null;
      order.estimatedLoads = Number(offer.estimatedLoads) || 1;
      order.loadSequenceNumber = 1;
      order.payment_type = paymentMethod === "card" ? "stripe" : "invoice";
      if (allocation.paymentHoldId) {
        order.paymentId = allocation.paymentHoldId;
      }
      if (pickupPlanItem && pickupPlanItem.status !== "paid") {
        order.awaitingPickupPayment = true;
        order.pickupBillingRecord = pickupPlanItem.billingRecord;
      }
      await order.save();
    }

    allocation.billingRecord = primaryRecord?._id || null;

    if (primaryRecord) {
      await notifyCommercialParties({
        actorId: company.user,
        customer: {
          _id: company.user,
          email: company.accountsPayableEmail || owner?.email,
          fcmtoken: owner?.fcmtoken,
        },
        type: "invoice_created",
        title:
          primaryRecord.status === "paid"
            ? "1st Installment Charged & Invoice Schedule Active"
            : "Builder Contract Invoices Created",
        description:
          primaryRecord.status === "paid"
            ? `Installment 1 (${primaryRecord.invoiceNumber}) for $${primaryRecord.amount.toFixed(2)} paid on acceptance. Total ${createdRecords.length} invoice(s) scheduled.`
            : `${createdRecords.length} invoice(s) generated for ${offer.title || "Builder Offer"}.`,
        orderId: firstOrderId?.toString?.() || firstOrderId,
        metadata: {
          action: "invoice_created",
          kind: "builder_offer",
          offerId: offer._id.toString(),
          invoiceId: primaryRecord._id.toString(),
          invoiceNumber: primaryRecord.invoiceNumber,
          screen: "builder_offer_detail",
        },
      }).catch((err) =>
        logger.error("builder_offer.multi_invoice_notify_failed", {
          error: err?.message,
        }),
      );
    }

    return createdRecords;
  } catch (err) {
    // Clean up any partial invoices created in this failed accept transaction
    if (createdRecords.length) {
      await BillingRecord.deleteMany({
        _id: { $in: createdRecords.map((r) => r._id) },
      }).catch(() => {});
    }
    throw err;
  }
}

/**
 * Trigger/collect an installment invoice on Load #K, grouped-load batch, or 1-Load Pickup.
 */
export async function triggerScheduledContractInvoice({
  offerId,
  triggerType, // "load" | "pickup" | "grouped_loads"
  loadNumber = null,
  orderId = null,
}) {
  const offer = await BuilderOffer.findById(offerId);
  if (!offer) return { success: true, skipped: true };

  const plan = offer.installmentPlan || [];
  let matchIdx = -1;
  if (triggerType === "pickup") {
    matchIdx = plan.findIndex(
      (p) => p.trigger === "pickup" && p.status !== "paid" && p.status !== "cancelled",
    );
  } else if (triggerType === "grouped_loads" || (triggerType === "load" && offer.billingMode === "grouped_loads")) {
    matchIdx = plan.findIndex(
      (p) =>
        p.trigger === "grouped_loads" &&
        p.status !== "paid" &&
        p.status !== "cancelled" &&
        Number(loadNumber || 0) >= Number(p.loadRangeEnd || 0),
    );
  } else {
    matchIdx = plan.findIndex(
      (p) =>
        p.trigger === "load" &&
        p.status !== "paid" &&
        p.status !== "cancelled" &&
        Number(p.loadNumber) === Number(loadNumber),
    );
  }

  if (matchIdx === -1) return { success: true, noMatchingPendingInvoice: true };

  const item = plan[matchIdx];
  const record = item.billingRecord
    ? await BillingRecord.findById(item.billingRecord)
    : null;
  if (!record || record.status === "paid") {
    return { success: true, alreadyPaid: true, invoice: record };
  }

  const Company = (await import("../models/Company.js")).default;
  const company = await Company.findById(offer.company).lean();
  const owner = company
    ? await User.findById(company.user).select("cus_id fcmtoken email").lean()
    : null;

  const paymentMethod =
    record.metadata?.paymentMethod || company?.paymentMethod || "card";

  if (paymentMethod === "card") {
    const charge = await createOffSessionCharge({
      customerId: owner?.cus_id,
      amountDollars: record.amount,
      description: `${offer.title || "Builder Offer"} · ${item.label || `Installment #${item.index}`}`,
      metadata: {
        source: "builder_offer",
        builderOfferId: offer._id.toString(),
        billingRecordId: record._id.toString(),
        installmentIndex: String(item.index),
        triggerType,
      },
      idempotencyKey: `bo-trigger-${record._id}-attempt-${(item.retryCount || 0) + 1}`,
    });

    record.paymentAttempts = record.paymentAttempts || [];
    record.paymentAttempts.push({
      attemptedAt: new Date(),
      status: charge.success ? "succeeded" : "failed",
      paymentIntentId: charge.paymentId || "",
      amount: record.amount,
      errorMessage: charge.success ? "" : charge.message || "Payment failed",
    });

    if (charge.success) {
      record.status = "paid";
      record.paidAmount = record.amount;
      record.paidAt = new Date();
      record.providerPayoutStatus = "eligible";
      await record.save();

      offer.installmentPlan[matchIdx].status = "paid";
      offer.installmentPlan[matchIdx].paidAt = new Date();
      offer.installmentPlan[matchIdx].failureReason = "";
      await recomputeContractLedger(offer);
      await offer.save();

      await BuilderOfferEvent.create({
        offer: offer._id,
        company: offer.company,
        type:
          triggerType === "pickup"
            ? "pickup_payment_collected"
            : "installment_charged",
        payload: {
          billingRecordId: record._id,
          invoiceNumber: record.invoiceNumber,
          amount: record.amount,
          loadNumber,
        },
      }).catch(() => {});

      await notifyCommercialParties({
        actorId: company?.user,
        customer: {
          _id: company?.user,
          email: company?.accountsPayableEmail || owner?.email,
          fcmtoken: owner?.fcmtoken,
        },
        type: "invoice_created",
        title: `${item.label || "Installment"} Charged`,
        description: `Invoice ${record.invoiceNumber} ($${record.amount.toFixed(2)}) was charged automatically for ${offer.title || "Builder Offer"}.`,
        orderId: orderId?.toString?.() || record.order?.toString?.(),
        metadata: {
          kind: "builder_offer",
          offerId: offer._id.toString(),
          invoiceId: record._id.toString(),
        },
      }).catch(() => {});

      return { success: true, invoice: record };
    }

    // Card charge failed: mark due/failed & pause future rotations cleanly
    record.status = "failed";
    await record.save();

    offer.installmentPlan[matchIdx].status = "failed";
    offer.installmentPlan[matchIdx].failureReason =
      charge.message || "Card declined";
    offer.installmentPlan[matchIdx].retryCount =
      (offer.installmentPlan[matchIdx].retryCount || 0) + 1;
    offer.installmentPlan[matchIdx].lastAttemptAt = new Date();
    if (triggerType !== "pickup") {
      offer.rotationsPaused = true;
      offer.rotationsPausedReason = `Installment #${item.index} (${record.invoiceNumber}) payment failed: ${charge.message || "Card declined"}`;
      offer.rotationsPausedAt = new Date();
    }
    await recomputeContractLedger(offer);
    await offer.save();

    await BuilderOfferEvent.create({
      offer: offer._id,
      company: offer.company,
      type: "payment_failed",
      payload: {
        billingRecordId: record._id,
        invoiceNumber: record.invoiceNumber,
        error: charge.message,
      },
    }).catch(() => {});

    await notifyCommercialParties({
      actorId: company?.user,
      customer: {
        _id: company?.user,
        email: company?.accountsPayableEmail || owner?.email,
        fcmtoken: owner?.fcmtoken,
      },
      type: "payment_failed",
      title: "Installment Payment Failed — Action Required",
      description: `Automatic payment failed for ${record.invoiceNumber} ($${record.amount.toFixed(2)}). Please update or retry payment to keep your schedule active.`,
      orderId: orderId?.toString?.() || record.order?.toString?.(),
      metadata: {
        kind: "builder_offer",
        offerId: offer._id.toString(),
        invoiceId: record._id.toString(),
        screen: "builder_offer_detail",
      },
    }).catch(() => {});

    return {
      success: false,
      requiresPaymentModal: true,
      invoice: record,
      message: charge.message || "Card payment failed",
    };
  }

  // Net invoice flow: mark invoice DUE and send notification
  record.status = "due";
  await record.save();
  offer.installmentPlan[matchIdx].status = "due";
  await recomputeContractLedger(offer);
  await offer.save();

  await notifyCommercialParties({
    actorId: company?.user,
    customer: {
      _id: company?.user,
      email: company?.accountsPayableEmail || owner?.email,
      fcmtoken: owner?.fcmtoken,
    },
    type: "invoice_due",
    title: "Milestone Invoice Now Due",
    description: `Invoice ${record.invoiceNumber} ($${record.amount.toFixed(2)}) for ${item.label || "service milestone"} is now due.`,
    orderId: orderId?.toString?.() || record.order?.toString?.(),
    metadata: {
      kind: "builder_offer",
      offerId: offer._id.toString(),
      invoiceId: record._id.toString(),
    },
  }).catch(() => {});

  return { success: true, invoice: record };
}

/**
 * Builder manually pays or retries any open / due / failed / pickup installment invoice.
 */
export async function payOrRetryOfferInvoice({ userId, offerId, billingId }) {
  const Company = (await import("../models/Company.js")).default;
  const company = await Company.findOne({ user: userId });
  if (!company) throw new NotFoundError("Company not found");

  const offer = await BuilderOffer.findOne({
    _id: offerId,
    company: company._id,
  });
  if (!offer) throw new NotFoundError("Builder offer not found");

  const record = await BillingRecord.findOne({
    _id: billingId,
    company: company._id,
    $or: [
      { contract: offer._id },
      { "metadata.builderOfferId": String(offer._id) },
    ],
  });
  if (!record) throw new NotFoundError("Invoice not found");
  if (record.status === "paid") {
    return {
      alreadyPaid: true,
      invoice: record,
      contractLedger: offer.contractLedger,
      installmentPlan: offer.installmentPlan,
      rotationsPaused: Boolean(offer.rotationsPaused),
    };
  }

  const outstanding = Math.max(
    0,
    roundMoney((Number(record.amount) || 0) - (Number(record.paidAmount) || 0)),
  );

  if (outstanding > 0) {
    const owner = await User.findById(company.user).select("cus_id").lean();
    const charge = await createOffSessionCharge({
      customerId: owner?.cus_id,
      amountDollars: outstanding,
      description: `${offer.title || "Builder Offer"} · Retry ${record.invoiceNumber}`,
      metadata: {
        source: "builder_offer",
        builderOfferId: offer._id.toString(),
        billingRecordId: record._id.toString(),
        retry: "true",
      },
    });

    record.paymentAttempts = record.paymentAttempts || [];
    record.paymentAttempts.push({
      attemptedAt: new Date(),
      status: charge.success ? "succeeded" : "failed",
      paymentIntentId: charge.paymentId || "",
      amount: outstanding,
      errorMessage: charge.success ? "" : charge.message || "Payment failed",
    });

    if (!charge.success) {
      record.status = "failed";
      await record.save();
      await BuilderOfferEvent.create({
        offer: offer._id,
        company: company._id,
        actor: userId,
        actorRole: "company",
        type: "payment_failed",
        payload: {
          billingRecordId: record._id,
          invoiceNumber: record.invoiceNumber,
          error: charge.message,
        },
      }).catch(() => {});
      throw new BadRequestError(
        charge.message || "Payment attempt failed. Please update your saved card.",
      );
    }

    record.paidAmount = record.amount;
  }

  record.status = "paid";
  record.paidAt = new Date();
  if ((Number(record.paidAmount) || 0) > 0) {
    record.providerPayoutStatus = "eligible";
  }
  await record.save();

  const planIdx = (offer.installmentPlan || []).findIndex(
    (p) => String(p.billingRecord) === String(record._id),
  );
  if (planIdx !== -1) {
    offer.installmentPlan[planIdx].status = "paid";
    offer.installmentPlan[planIdx].paidAt = new Date();
    offer.installmentPlan[planIdx].failureReason = "";
  }

  // Clear awaitingPickupPayment on linked Order if this settled pickup
  const Order = (await import("../models/Order.js")).default;
  await Order.updateMany(
    { pickupBillingRecord: record._id, awaitingPickupPayment: true },
    {
      $set: {
        awaitingPickupPayment: false,
        pickupPaymentSettledAt: new Date(),
      },
    },
  ).catch(() => {});

  const remainingFailed = await BillingRecord.countDocuments({
    contract: offer._id,
    status: "failed",
  });
  if (offer.rotationsPaused && remainingFailed === 0) {
    offer.rotationsPaused = false;
    offer.rotationsPausedReason = "";
    offer.rotationsPausedAt = null;
    await BuilderOfferEvent.create({
      offer: offer._id,
      company: company._id,
      actor: userId,
      actorRole: "company",
      type: "rotations_resumed",
      payload: { billingRecordId: record._id },
    }).catch(() => {});
  }

  await recomputeContractLedger(offer);
  await offer.save();

  await BuilderOfferEvent.create({
    offer: offer._id,
    company: company._id,
    actor: userId,
    actorRole: "company",
    type: "payment_retried",
    payload: {
      billingRecordId: record._id,
      invoiceNumber: record.invoiceNumber,
      amount: outstanding,
    },
  }).catch(() => {});

  return {
    invoice: record,
    contractLedger: offer.contractLedger,
    installmentPlan: offer.installmentPlan,
    rotationsPaused: Boolean(offer.rotationsPaused),
  };
}

/**
 * Append a logged credit note / overage / dispute adjustment instead of silently editing amounts.
 */
export async function adjustContractInvoice({
  actorId,
  offerId,
  billingId,
  type = "manual",
  amount,
  reason = "",
}) {
  const offer = await BuilderOffer.findById(offerId);
  if (!offer) throw new NotFoundError("Builder offer not found");

  const record = await BillingRecord.findOne({
    _id: billingId,
    $or: [
      { contract: offer._id },
      { "metadata.builderOfferId": String(offer._id) },
    ],
  });
  if (!record) throw new NotFoundError("Invoice not found");

  const delta = Number(amount) || 0;
  record.adjustments = record.adjustments || [];
  record.adjustments.push({
    type,
    amount: delta,
    reason: String(reason || "").trim(),
    createdAt: new Date(),
    createdBy: actorId || null,
  });

  if (type === "dispute") {
    record.status = "disputed";
    record.providerPayoutStatus = "held";
  } else {
    record.amount = Math.max(0, roundMoney((Number(record.amount) || 0) + delta));
    record.lineItems.push({
      type: "adjustment",
      description: `${type.toUpperCase()}: ${reason || "Invoice adjustment"}`,
      amount: delta,
      order: record.order || null,
      metadata: { adjustmentType: type },
      createdAt: new Date(),
    });
  }
  await record.save();

  await recomputeContractLedger(offer);
  await offer.save();

  await BuilderOfferEvent.create({
    offer: offer._id,
    company: offer.company,
    actor: actorId || null,
    actorRole: "company",
    type: "invoice_adjusted",
    payload: {
      billingRecordId: record._id,
      adjustmentType: type,
      amount: delta,
      reason,
    },
  }).catch(() => {});

  return { invoice: record, contractLedger: offer.contractLedger };
}
