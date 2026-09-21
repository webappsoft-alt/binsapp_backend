import Order from "../../models/Order.js";
import TransactionModel from "../../models/Transaction.js";
import OrderTimeline from "../../models/OrderTimeline.js";
import DispatchService from "../../utils/dispatchService.js";
import { cancelOrderExpiry } from "../../utils/orderExpiryService.js";
import { releaseHold } from "../../utils/paymentHold.js";
import logger from "../../config/logger.js";

async function markWebhookProcessed(order, eventId, extraSet = {}) {
  const webhookEventIds = order.metadata?.webhookEventIds || [];
  if (webhookEventIds.includes(eventId)) {
    return { alreadyProcessed: true, order };
  }

  const updated = await Order.findByIdAndUpdate(
    order._id,
    {
      $set: extraSet,
      $addToSet: { "metadata.webhookEventIds": eventId },
    },
    { new: true },
  );
  return { alreadyProcessed: false, order: updated };
}

async function findOrderByPaymentIntent(paymentIntent) {
  return Order.findOne({ paymentId: paymentIntent.id });
}

async function ensureDebitTransaction(order, paymentIntent, source = "webhook") {
  const existing = await TransactionModel.findOne({
    stripePaymentIntentId: paymentIntent.id,
    type: "debit",
  });
  if (existing) return existing;

  return TransactionModel.create({
    user: order.user,
    order: order._id,
    amount: order.price,
    type: "debit",
    stripePaymentIntentId: paymentIntent.id,
    metadata: {
      source,
      driveaway: order.driveaway,
      cancelation: order.cancelation,
    },
  });
}

export async function handleAmountCapturableUpdated(event) {
  const paymentIntent = event.data.object;
  const order = await findOrderByPaymentIntent(paymentIntent);
  if (!order) {
    logger.info(
      `Webhook ${event.id}: no order yet for PI ${paymentIntent.id}`,
    );
    return { handled: false, reason: "order_not_found" };
  }

  const { alreadyProcessed, order: updated } = await markWebhookProcessed(
    order,
    event.id,
    {
      "metadata.paymentHoldStatus": "requires_capture",
      "metadata.holdConfirmedAt": new Date(),
    },
  );
  if (alreadyProcessed) return { handled: true, skipped: true };

  await ensureDebitTransaction(updated, paymentIntent);

  await OrderTimeline.create({
    order: updated._id,
    orderDeatil: updated,
    message: "Payment hold confirmed via Stripe webhook.",
  });

  return { handled: true, orderId: updated._id };
}

export async function handlePaymentIntentSucceeded(event) {
  const paymentIntent = event.data.object;
  const order = await findOrderByPaymentIntent(paymentIntent);
  if (!order) {
    return { handled: false, reason: "order_not_found" };
  }

  const { alreadyProcessed } = await markWebhookProcessed(order, event.id, {
    "metadata.paymentHoldStatus": "captured",
  });
  if (alreadyProcessed) return { handled: true, skipped: true };

  await OrderTimeline.create({
    order: order._id,
    orderDeatil: order,
    message: "Payment captured successfully (Stripe webhook).",
  });

  return { handled: true, orderId: order._id };
}

export async function handlePaymentIntentCanceled(event) {
  const paymentIntent = event.data.object;
  const order = await findOrderByPaymentIntent(paymentIntent);
  if (!order) {
    return { handled: false, reason: "order_not_found" };
  }

  if (order.status !== "pending" || order.to_id != null) {
    return { handled: true, skipped: true, reason: "order_not_searching" };
  }

  const { alreadyProcessed } = await markWebhookProcessed(order, event.id, {
    status: "cancelled",
    "metadata.paymentHoldStatus": "cancelled",
    "metadata.holdReleasedBy": "stripe",
  });
  if (alreadyProcessed) return { handled: true, skipped: true };

  await DispatchService.cancelRemainingWaves(order._id);
  await cancelOrderExpiry(order._id);

  await OrderTimeline.create({
    order: order._id,
    orderDeatil: order,
    message: "Payment hold released via Stripe webhook.",
  });

  return { handled: true, orderId: order._id };
}

export async function handlePaymentIntentFailed(event) {
  const paymentIntent = event.data.object;
  const order = await findOrderByPaymentIntent(paymentIntent);
  if (!order) {
    return { handled: false, reason: "order_not_found" };
  }

  logger.error(`Payment failed for order ${order._id}`, {
    paymentIntentId: paymentIntent.id,
    lastError: paymentIntent.last_payment_error,
  });

  await markWebhookProcessed(order, event.id, {
    "metadata.paymentHoldStatus": "failed",
  });

  return { handled: true, orderId: order._id };
}

export async function processStripeWebhookEvent(event) {
  switch (event.type) {
    case "payment_intent.amount_capturable_updated":
      return handleAmountCapturableUpdated(event);
    case "payment_intent.succeeded":
      return handlePaymentIntentSucceeded(event);
    case "payment_intent.canceled":
      return handlePaymentIntentCanceled(event);
    case "payment_intent.payment_failed":
      return handlePaymentIntentFailed(event);
    default:
      return { handled: false, reason: "unhandled_event_type" };
  }
}
