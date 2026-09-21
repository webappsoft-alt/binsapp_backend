import config from "../config/env.js";
import stripe from "stripe";
const stripeConfig = config.get("stripe.secretKey");
const stripeconfig = new stripe(stripeConfig);
export const getPaymentDone = async (cus_id, amount) => {
  const paymentMethods = await stripeconfig.paymentMethods.list({
    customer: cus_id,
    type: "card",
  });
  try {
    const paymentIntent = await stripeconfig.paymentIntents.create({
      amount: Number(amount) * 100,
      currency: "usd",
      // In the latest version of the API, specifying the `automatic_payment_methods` parameter is optional because Stripe enables its functionality by default.
      automatic_payment_methods: { enabled: true },
      customer: cus_id,
      payment_method: paymentMethods.data[0].id,
      return_url: "https://example.com/order/123/complete",
      off_session: true,
      confirm: true,
    });
    if (
      [
        "requires_confirmation",
        "requires_action",
        "requires_capture",
        "processing",
        "canceled",
      ].includes(paymentIntent.status)
    ) {
      await stripe.paymentIntents.cancel(paymentIntent.id);
    }
    return paymentIntent;
  } catch (err) {
    // requires_payment_method, requires_confirmation, requires_action, processing, requires_capture, canceled, or succeeded
    return { status: "canceled" };
  }
};

export const refundPayment = async (payment_intentId, amount) => {
  try {
    const pi = await stripeconfig.paymentIntents.retrieve(payment_intentId);

    // Uncaptured authorization hold: there is nothing to refund, so release
    // (cancel) the hold instead. A cancelled PaymentIntent frees the funds.
    if (
      ["requires_capture", "requires_confirmation", "requires_payment_method"].includes(
        pi.status,
      )
    ) {
      const canceled = await stripeconfig.paymentIntents.cancel(payment_intentId);
      return { status: "succeeded", released: true, paymentIntent: canceled };
    }

    if (pi.status !== "succeeded") {
      return { status: "failed", failure_reason: `cannot_refund_status_${pi.status}` };
    }

    const refund = await stripeconfig.refunds.create({
      payment_intent: payment_intentId,
      amount: Number(amount) * 100,
    });
    if (["failed", "canceled"].includes(refund.status)) {
      return { status: "failed", failure_reason: refund.failure_reason || refund.status };
    }
    return refund;
  } catch (err) {
    // pending, requires_action, succeeded, failed, or canceled
    return { status: "failed", failure_reason: err?.message || "unknown" };
  }
};
