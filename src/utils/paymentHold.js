import Stripe from "stripe";
import config from "../config/env.js";
import logger from "../config/logger.js";
import {
  PLATFORM_FEE_RATE,
  computeSplitFromLines,
} from "./builderOfferFees.js";

const stripe = new Stripe(config.get("stripe.secretKey"));

const VALID_HOLD_STATUSES = new Set(["requires_capture", "succeeded"]);

/**
 * Verify a PaymentIntent is in a hold-ready state (manual capture authorized).
 */
export async function verifyHold(paymentId) {
  try {
    const pi = await stripe.paymentIntents.retrieve(paymentId);
    if (!VALID_HOLD_STATUSES.has(pi.status)) {
      return {
        valid: false,
        status: pi.status,
        paymentIntent: pi,
        message: `Payment hold not active (status: ${pi.status})`,
      };
    }
    return { valid: true, status: pi.status, paymentIntent: pi };
  } catch (error) {
    logger.error("verifyHold failed", { paymentId, error: error.message });
    return { valid: false, message: error.message };
  }
}

/**
 * Cancel / release an uncaptured authorization hold.
 */
export async function releaseHold(paymentId) {
  try {
    const pi = await stripe.paymentIntents.retrieve(paymentId);
    if (pi.status === "canceled") {
      return { success: true, alreadyReleased: true, paymentIntent: pi };
    }
    if (pi.status === "succeeded") {
      return { success: false, message: "Payment already captured", paymentIntent: pi };
    }
    const canceled = await stripe.paymentIntents.cancel(paymentId);
    return { success: true, paymentIntent: canceled };
  } catch (error) {
    logger.error("releaseHold failed", { paymentId, error: error.message });
    return { success: false, message: error.message };
  }
}

/**
 * Capture funds from an authorized hold.
 */
export async function captureHold(paymentId, { amountToCapture } = {}) {
  try {
    const pi = await stripe.paymentIntents.retrieve(paymentId);
    if (pi.status === "succeeded") {
      return { success: true, alreadyCaptured: true, paymentIntent: pi };
    }
    if (pi.status !== "requires_capture") {
      return {
        success: false,
        message: `Cannot capture payment in status: ${pi.status}`,
        paymentIntent: pi,
      };
    }
    const captureParams = amountToCapture
      ? { amount_to_capture: Math.round(Number(amountToCapture) * 100) }
      : {};
    const captured = await stripe.paymentIntents.capture(paymentId, captureParams);
    return { success: true, paymentIntent: captured };
  } catch (error) {
    logger.error("captureHold failed", { paymentId, error: error.message });
    return { success: false, message: error.message };
  }
}

/**
 * Verify a captured extension PaymentIntent (immediate charge, not hold).
 */
export async function verifyExtensionPayment(
  paymentId,
  expectedAmountDollars,
  { userId } = {},
) {
  try {
    const pi = await stripe.paymentIntents.retrieve(paymentId);
    if (pi.status !== "succeeded") {
      return {
        valid: false,
        status: pi.status,
        paymentIntent: pi,
        message: `Extension payment not completed (status: ${pi.status})`,
      };
    }

    const expectedCents = Math.round(Number(expectedAmountDollars) * 100);
    if (pi.amount !== expectedCents) {
      return {
        valid: false,
        status: pi.status,
        paymentIntent: pi,
        message: "Extension payment amount does not match expected price.",
      };
    }

    if (userId && pi.metadata?.userId && pi.metadata.userId !== userId) {
      return {
        valid: false,
        status: pi.status,
        paymentIntent: pi,
        message: "Extension payment does not belong to this user.",
      };
    }

    return { valid: true, status: pi.status, paymentIntent: pi };
  } catch (error) {
    logger.error("verifyExtensionPayment failed", {
      paymentId,
      error: error.message,
    });
    return { valid: false, message: error.message };
  }
}

// Two optional protections selected at booking. Each goes 100% to admin and is
// excluded from the base before the 15% commission. The Order field names are
// legacy and do NOT match the product labels — beware:
//   Order.driveaway  === "Driveway protection"  => $50
//   Order.cancelation === "Insurance protection" => $39
// (The numeric metadata.insurance_protection mirrors the `cancelation` flag and
// is intentionally ignored to avoid double-counting the same add-on.)
export const DRIVEWAY_PROTECTION_FEE = 50;
export const INSURANCE_PROTECTION_FEE = 39;
export { PLATFORM_FEE_RATE, computeSplitFromLines };

/**
 * Sum the add-on protection fees that belong 100% to the platform/admin.
 */
/**
 * Create an off-session manual-capture hold against the customer's saved card.
 * Used by Builder Offer accepts when company.paymentMethod === "card".
 */
export async function createOffSessionHold({
  customerId,
  amountDollars,
  metadata = {},
}) {
  if (!customerId) {
    return { success: false, message: "No Stripe customer on file" };
  }
  const amountCents = Math.round(Number(amountDollars) * 100);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return { success: false, message: "Invalid hold amount" };
  }
  try {
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: "card",
    });
    const pm = paymentMethods.data?.[0];
    if (!pm) {
      return {
        success: false,
        message: "No saved card on file for this company account",
      };
    }
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: "usd",
      customer: customerId,
      payment_method: pm.id,
      capture_method: "manual",
      confirm: true,
      off_session: true,
      metadata: Object.fromEntries(
        Object.entries(metadata || {}).map(([k, v]) => [k, String(v ?? "")]),
      ),
    });
    if (!VALID_HOLD_STATUSES.has(paymentIntent.status)) {
      try {
        if (paymentIntent.status !== "canceled") {
          await stripe.paymentIntents.cancel(paymentIntent.id);
        }
      } catch (_) {
        /* ignore cancel race */
      }
      return {
        success: false,
        message: `Hold not authorized (status: ${paymentIntent.status})`,
        paymentIntent,
      };
    }
    return { success: true, paymentIntent, paymentId: paymentIntent.id };
  } catch (error) {
    logger.error("createOffSessionHold failed", { error: error.message });
    return { success: false, message: error.message };
  }
}

/**
 * Verify that a Stripe customer has at least one saved tokenized card on file.
 * Does NOT place a hold or capture any money (safe for pre-broadcast check).
 */
export async function validateSavedCardPaymentMethod({ customerId }) {
  if (!customerId) {
    return {
      valid: false,
      code: "missing_stripe_customer",
      message: "Add a payment card before broadcasting this builder offer.",
    };
  }
  try {
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: "card",
      limit: 5,
    });
    const pm = paymentMethods.data?.[0];
    if (!pm) {
      return {
        valid: false,
        code: "no_saved_card",
        message: "No saved payment card found. Save a card before broadcasting.",
      };
    }
    return {
      valid: true,
      paymentMethodId: pm.id,
      cardSummary: {
        id: pm.id,
        brand: pm.card?.brand || "card",
        last4: pm.card?.last4 || "****",
        expMonth: pm.card?.exp_month || null,
        expYear: pm.card?.exp_year || null,
      },
    };
  } catch (error) {
    logger.error("validateSavedCardPaymentMethod failed", {
      customerId,
      error: error.message,
    });
    return {
      valid: false,
      code: "stripe_lookup_failed",
      message: error.message || "Could not verify saved payment method",
    };
  }
}

/**
 * Create a $0 Stripe SetupIntent so a builder can save a tokenized card before broadcast.
 */
export async function createCardSetupIntent({ customerId, userId, email, name }) {
  try {
    let resolvedCusId = customerId;
    if (!resolvedCusId) {
      const customer = await stripe.customers.create({
        ...(email ? { email } : {}),
        ...(name ? { name } : {}),
        metadata: { userId: String(userId || "") },
      });
      resolvedCusId = customer.id;
    }
    const setupIntent = await stripe.setupIntents.create({
      customer: resolvedCusId,
      payment_method_types: ["card"],
      usage: "off_session",
      metadata: {
        userId: String(userId || ""),
        purpose: "builder_offer_card_setup",
      },
    });
    return {
      success: true,
      customerId: resolvedCusId,
      clientSecret: setupIntent.client_secret,
      setupIntentId: setupIntent.id,
    };
  } catch (error) {
    logger.error("createCardSetupIntent failed", { error: error.message });
    return { success: false, message: error.message };
  }
}

/**
 * Charge a saved tokenized card off-session immediately (e.g., 1st installment on accept
 * or subsequent load/milestone installment). Never stores raw card details.
 */
export async function createOffSessionCharge({
  customerId,
  amountDollars,
  metadata = {},
  description = "",
  idempotencyKey = null,
}) {
  if (!customerId) {
    return { success: false, message: "No Stripe customer on file" };
  }
  const amountCents = Math.round(Number(amountDollars) * 100);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return { success: false, message: "Invalid charge amount" };
  }
  try {
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: "card",
      limit: 5,
    });
    const pm = paymentMethods.data?.[0];
    if (!pm) {
      return {
        success: false,
        message: "No saved card on file for this company account",
      };
    }
    const reqOpts = idempotencyKey ? { idempotencyKey } : undefined;
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency: "usd",
        customer: customerId,
        payment_method: pm.id,
        capture_method: "automatic",
        confirm: true,
        off_session: true,
        ...(description ? { description } : {}),
        metadata: Object.fromEntries(
          Object.entries(metadata || {}).map(([k, v]) => [k, String(v ?? "")]),
        ),
      },
      reqOpts,
    );
    if (paymentIntent.status !== "succeeded") {
      try {
        if (!["succeeded", "canceled"].includes(paymentIntent.status)) {
          await stripe.paymentIntents.cancel(paymentIntent.id);
        }
      } catch (_) {
        /* ignore cancel race */
      }
      return {
        success: false,
        message: `Payment could not be completed automatically (status: ${paymentIntent.status})`,
        paymentIntent,
      };
    }
    return {
      success: true,
      paymentIntent,
      paymentId: paymentIntent.id,
      cardLast4: pm.card?.last4 || "",
      cardBrand: pm.card?.brand || "",
    };
  } catch (error) {
    logger.error("createOffSessionCharge failed", { error: error.message });
    return {
      success: false,
      message: error.message || "Card payment failed",
      code: error.code || error.raw?.code || "charge_failed",
    };
  }
}

export function getAddonFees({ driveaway = false, cancelation = false } = {}) {
  let addon = 0;
  if (driveaway) addon += DRIVEWAY_PROTECTION_FEE;
  if (cancelation) addon += INSURANCE_PROTECTION_FEE;
  return addon;
}

/**
 * Compute the provider (owner) payout.
 *
 * Business rule: driveway + insurance add-ons go 100% to admin. The platform
 * commission (15%) applies ONLY to the remaining base (total minus add-ons).
 *
 *   base        = price - addonFees
 *   ownerAmount = base - base * 0.15   (i.e. base * 0.85)
 *   adminAmount = addonFees + base * 0.15
 *
 * `privacyAmount` (the add-on total) is returned for transaction records.
 */
export function computeSplit(
  price,
  { driveaway = false, cancelation = false } = {},
) {
  const basePrice = Number(price) || 0;
  const privacyAmount = getAddonFees({ driveaway, cancelation });
  const base = basePrice - privacyAmount;
  const platformFee = base * PLATFORM_FEE_RATE;
  const amount = base - platformFee;

  return { amount, privacyAmount, basePrice, platformFee };
}

export { stripe as stripeClient };
