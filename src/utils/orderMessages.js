/**
 * Shared order notification / timeline / transaction copy catalog.
 * Titles are short and role-clear; descriptions name service, order ref, and actor.
 *
 * Each builder returns:
 *  - `customer` / `operator` / `admin`: { title, description } for push + email.
 *  - `timeline`: { customer, operator, admin } — role-specific timeline copy.
 *  - `timelineMessage`: neutral/admin fallback (kept for backward compatibility).
 */

const SERVICE_LABELS = {
  Dumbster: "dumpster rental",
  "Porta Potty": "porta potty rental",
  "Junk Removal": "junk removal",
  "Tree Removal": "tree removal",
};

export function serviceLabel(serviceType) {
  return SERVICE_LABELS[serviceType] || serviceType || "service";
}

export function orderRef(order) {
  if (!order) return "#unknown";
  if (order.orderNumber) return `#${order.orderNumber}`;
  const id = order._id?.toString?.() || String(order._id || "");
  return id ? `#${id.slice(-6)}` : "#unknown";
}

function actors(ctx = {}) {
  return {
    customer: ctx.customerName || "Customer",
    provider: ctx.providerName || "Provider",
    service: serviceLabel(ctx.serviceType || ctx.service_type),
    ref: orderRef(ctx.order || { orderNumber: ctx.orderNumber, _id: ctx.orderId }),
  };
}

/** Word for the physical item, used in "on the way / dropped off" copy. */
function itemWord(ctx = {}) {
  const serviceType = ctx.serviceType || ctx.service_type;
  if (serviceType === "Dumbster") return "dumpster";
  if (serviceType === "Porta Potty") return "porta potty";
  return serviceLabel(serviceType);
}

/**
 * Build an OrderTimeline document body from a copy object, storing role-specific
 * text. Falls back to the neutral `timelineMessage` when a role variant is absent.
 */
export function timelineEntry(copy = {}) {
  const t = copy.timeline || {};
  const fallback = t.admin || copy.timelineMessage || "";
  return {
    message: fallback,
    customerMessage: t.customer || fallback,
    operatorMessage: t.operator || fallback,
  };
}

export const orderMessages = {
  requestCreated(ctx) {
    const { customer, service, ref } = actors(ctx);
    return {
      timelineMessage: `${customer} created ${service} request ${ref}; searching for providers.`,
      timeline: {
        customer: `You requested a ${service} ${ref}. We're finding a provider near you.`,
        operator: `New ${service} request ${ref} from ${customer}.`,
        admin: `${customer} created ${service} request ${ref}; searching for providers.`,
      },
      operator: {
        title: "New Service Request",
        description: `${customer} requested a ${service} ${ref}. Accept to claim.`,
      },
      admin: {
        title: "New Service Request",
        description: `${customer} submitted a ${service} request ${ref}.`,
      },
      transactionReason: `Payment hold authorized for ${service} order ${ref}`,
      callback: {
        title: "Request Sent",
        message: `Your ${service} request ${ref} has been sent to nearby providers.`,
      },
    };
  },

  requestDeclined(ctx) {
    const { customer, provider, service, ref } = actors(ctx);
    return {
      timelineMessage: `${provider} declined request ${ref}.`,
      timeline: {
        customer: `${provider} declined your ${service} request ${ref}.`,
        operator: `You declined ${service} request ${ref}.`,
        admin: `${provider} declined ${customer}'s ${service} request ${ref}.`,
      },
      customer: {
        title: "Request Declined",
        description: `${provider} declined your ${service} request ${ref}.`,
      },
    };
  },

  providerMatched(ctx) {
    const { customer, provider, service, ref } = actors(ctx);
    const onTheWayLabel = itemWord(ctx);
    return {
      timelineMessage: `${provider} accepted ${customer}'s ${service} order ${ref}.`,
      timeline: {
        customer: `${provider} accepted your ${service} order ${ref}.`,
        operator: `You accepted ${service} order ${ref} from ${customer}.`,
        admin: `${provider} accepted ${customer}'s ${service} order ${ref}.`,
      },
      customer: {
        title: "Order Accepted",
        description: `${provider} accepted your ${service} order ${ref}. You'll be notified when the ${onTheWayLabel} is on the way.`,
      },
      operator: {
        title: "Job Assigned",
        description: `You accepted ${service} order ${ref} from ${customer}.`,
      },
      admin: {
        title: "Order Matched",
        description: `${provider} matched to ${customer}'s ${service} order ${ref}.`,
      },
    };
  },

  proofSubmitted(ctx) {
    const { customer, provider, service, ref } = actors(ctx);
    return {
      timelineMessage: `${provider} submitted proof of work for ${service} order ${ref}.`,
      timeline: {
        customer: `${provider} submitted proof of work for your ${service} order ${ref}. Please review.`,
        operator: `You submitted proof of work for ${service} order ${ref}.`,
        admin: `${provider} submitted proof of work for ${service} order ${ref}.`,
      },
      customer: {
        title: "Proof of Work Submitted",
        description: `${provider} submitted proof of work for ${service} order ${ref}. Please review.`,
      },
      operator: {
        title: "Proof of Work Submitted",
        description: `Your proof of work for ${service} order ${ref} was sent to ${customer}.`,
      },
      admin: {
        title: "Proof of Work Submitted",
        description: `${provider} submitted proof for ${service} order ${ref}.`,
      },
    };
  },

  proofAccepted(ctx) {
    const { customer, provider, service, ref } = actors(ctx);
    return {
      timelineMessage: `${customer} accepted proof of work for ${service} order ${ref}.`,
      timeline: {
        customer: `You accepted the proof of work for ${service} order ${ref}.`,
        operator: `${customer} accepted your proof of work for ${service} order ${ref}.`,
        admin: `${customer} accepted proof of work from ${provider} for ${service} order ${ref}.`,
      },
      customer: {
        title: "Proof of Work Accepted",
        description: `You accepted proof of work from ${provider} for ${service} order ${ref}.`,
      },
      operator: {
        title: "Proof of Work Accepted",
        description: `${customer} accepted your proof of work for ${service} order ${ref}.`,
      },
      admin: {
        title: "Proof of Work Accepted",
        description: `${customer} accepted proof from ${provider} on ${ref}.`,
      },
    };
  },

  proofRejected(ctx) {
    const { customer, provider, service, ref } = actors(ctx);
    const reasonSuffix = ctx.reason ? ` Reason: ${ctx.reason}` : "";
    return {
      timelineMessage: `${customer} rejected proof of work for ${service} order ${ref}.${reasonSuffix}`,
      timeline: {
        customer: `You rejected the proof of work for ${service} order ${ref}.${reasonSuffix}`,
        operator: `${customer} rejected your proof of work for ${service} order ${ref}.${reasonSuffix} Please submit updated proof.`,
        admin: `${customer} rejected proof of work from ${provider} for ${service} order ${ref}.${reasonSuffix}`,
      },
      customer: {
        title: "Proof of Work Rejected",
        description: `You rejected proof of work from ${provider} for ${service} order ${ref}.${reasonSuffix} Work is not financially completed.`,
      },
      operator: {
        title: "Proof of Work Rejected",
        description: `${customer} rejected your proof of work for ${service} order ${ref}.${reasonSuffix} Please submit updated proof.`,
      },
      admin: {
        title: "Proof of Work Rejected",
        description: `${customer} rejected proof from ${provider} on ${service} order ${ref}.${reasonSuffix}`,
      },
    };
  },

  /** Owner tapped "On my way" — heading to the dropoff location. */
  onTheWay(ctx) {
    const { customer, provider, service, ref } = actors(ctx);
    const item = itemWord(ctx);
    return {
      timelineMessage: `${provider} is on the way to the dropoff location for ${service} order ${ref}.`,
      timeline: {
        customer: `${provider} is on the way to drop off your ${item} for order ${ref}.`,
        operator: `You marked yourself on the way for ${service} order ${ref}.`,
        admin: `${provider} is on the way to drop off ${service} order ${ref} for ${customer}.`,
      },
      customer: {
        title: "Provider On the Way",
        description: `${provider} is on the way to drop off your ${item} for order ${ref}.`,
      },
      operator: {
        title: "On the Way",
        description: `You marked yourself on the way to drop off ${service} order ${ref} for ${customer}.`,
      },
      admin: {
        title: "Provider On the Way",
        description: `${provider} is on the way to drop off ${service} order ${ref} for ${customer}.`,
      },
    };
  },

  dropoff(ctx) {
    const { customer, provider, service, ref } = actors(ctx);
    const isDumpster =
      ctx.serviceType === "Dumbster" || ctx.service_type === "Dumbster";
    const customerTitle = isDumpster ? "Dumpster Dropped Off" : "Service Dropped Off";
    const item = itemWord(ctx);
    return {
      timelineMessage: `${provider} confirmed drop off for ${service} order ${ref}.`,
      timeline: {
        customer: `${provider} dropped off your ${item} for order ${ref}.`,
        operator: `You confirmed drop off for ${service} order ${ref}.`,
        admin: `${provider} dropped off ${service} order ${ref} for ${customer}.`,
      },
      customer: {
        title: customerTitle,
        description: `${provider} dropped off your ${service} order ${ref}.`,
      },
      operator: {
        title: "Dropoff Confirmed",
        description: `You marked dropoff complete for ${service} order ${ref}.`,
      },
      admin: {
        title: "Dropoff Confirmed",
        description: `${provider} dropped off ${service} order ${ref} for ${customer}.`,
      },
    };
  },

  orderCompleted(ctx) {
    const { customer, provider, service, ref } = actors(ctx);
    return {
      timelineMessage: `${provider} completed ${service} order ${ref}; payment settlement started.`,
      timeline: {
        customer: `Your ${service} order ${ref} is completed. Payment is being settled.`,
        operator: `You completed ${service} order ${ref}. Payout is processing.`,
        admin: `${provider} completed ${service} order ${ref} for ${customer}; payout processing.`,
      },
      customer: {
        title: "Order Completed",
        description: `${provider} completed your ${service} order ${ref}. Payment is being settled.`,
      },
      operator: {
        title: "Order Completed",
        description: `You completed ${service} order ${ref}. Payout is processing.`,
      },
      admin: {
        title: "Order Completed",
        description: `${provider} completed ${service} order ${ref} for ${customer}.`,
      },
      transactionReason: `Provider payout for completed ${service} order ${ref}`,
    };
  },

  cancelRequested(ctx) {
    const { customer, provider, service, ref } = actors(ctx);
    return {
      timelineMessage: `${provider} requested cancellation of ${service} order ${ref}; awaiting admin review.`,
      timeline: {
        customer: `${provider} requested to cancel your ${service} order ${ref}. Admin will review.`,
        operator: `You requested to cancel ${service} order ${ref}. Admin will review.`,
        admin: `${provider} requested cancellation of ${service} order ${ref} (${customer}).`,
      },
      operator: {
        title: "Cancellation Requested",
        description: `Your cancel request for ${service} order ${ref} was sent to Admin.`,
      },
      customer: {
        title: "Cancellation Requested",
        description: `${provider} requested cancellation of ${service} order ${ref}. Admin will review.`,
      },
      admin: {
        title: "Cancellation Requested",
        description: `${provider} requested cancel on ${service} order ${ref} (${customer}).`,
      },
    };
  },

  preMatchCancelled(ctx) {
    const { customer, service, ref } = actors(ctx);
    return {
      timelineMessage: `${customer} cancelled ${service} request ${ref} before match; hold released.`,
      timeline: {
        customer: `You cancelled ${service} request ${ref} before it was matched. Payment hold released.`,
        operator: `${customer} cancelled ${service} request ${ref}.`,
        admin: `${customer} cancelled unmatched ${service} request ${ref}; hold released.`,
      },
      customer: {
        title: "Request Cancelled",
        description: `You cancelled ${service} request ${ref}. Payment hold released.`,
      },
      operator: {
        title: "Request Cancelled",
        description: `${customer} cancelled ${service} request ${ref}.`,
      },
      admin: {
        title: "Request Cancelled",
        description: `${customer} cancelled unmatched ${service} request ${ref}. Hold released.`,
      },
    };
  },

  readyForPickup(ctx) {
    const { customer, service, ref } = actors(ctx);
    return {
      timelineMessage: `${customer} marked ${service} order ${ref} ready for pickup.`,
      timeline: {
        customer: `You marked ${service} order ${ref} ready for pickup.`,
        operator: `${customer} marked ${service} order ${ref} ready for pickup.`,
        admin: `${customer} marked ${service} order ${ref} ready for pickup.`,
      },
      operator: {
        title: "Ready for Pickup",
        description: `${customer} marked ${service} order ${ref} ready for pickup.`,
      },
      customer: {
        title: "Ready for Pickup",
        description: `You marked ${service} order ${ref} ready for pickup.`,
      },
      admin: {
        title: "Ready for Pickup",
        description: `${customer} marked ${service} order ${ref} ready for pickup.`,
      },
    };
  },

  requestExpired(ctx) {
    const { customer, service, ref } = actors(ctx);
    return {
      timelineMessage: `No provider accepted ${service} request ${ref} within 24 hours; hold released.`,
      timeline: {
        customer: `Your ${service} request ${ref} expired with no available provider. Payment hold released.`,
        operator: `The ${service} request ${ref} from ${customer} expired with no match.`,
        admin: `${customer}'s ${service} request ${ref} expired unmatched; hold released.`,
      },
      customer: {
        title: "Request Expired",
        description: `No provider was available for your ${service} request ${ref} within 24 hours. Payment hold released.`,
      },
      operator: {
        title: "Request Expired",
        description: `The ${service} request ${ref} from ${customer} expired with no match.`,
      },
      admin: {
        title: "Request Expired",
        description: `${customer}'s ${service} request ${ref} expired unmatched. Hold released.`,
      },
    };
  },

  rentalEndingSoon(ctx) {
    const { customer, service, ref } = actors(ctx);
    const rate = ctx.dailyRate ?? ctx.rate ?? 0;
    return {
      customer: {
        title: "Rental Ending Soon",
        description: `Your rental period for ${service} order ${ref} ends in less than 24 hours. Would you like to extend your rental for $${rate}/day?`,
      },
      operator: {
        title: "Rental Ending Soon",
        description: `${customer}'s ${service} order ${ref} rental period ends in less than 24 hours. The customer may request an extension.`,
      },
      admin: {
        title: "Rental Ending Soon",
        description: `${customer}'s ${service} order ${ref} ends in less than 24 hours. Extension rate: $${rate}/day.`,
      },
    };
  },

  overdueDailyCharge(ctx) {
    const { customer, service, ref } = actors(ctx);
    const dayprice = ctx.dayprice ?? ctx.dailyRate ?? 0;
    const extra = ctx.extra ?? 0;
    return {
      customer: {
        title: "Overdue Rental Charge",
        description: `Your ${service} order ${ref} is past its end date. A daily overdue charge of $${dayprice} was applied. Mark ready for pickup or extend your rental.`,
      },
      operator: {
        title: "Overdue Rental Charge",
        description: `${customer}'s ${service} order ${ref} is overdue. A daily charge of $${dayprice} was applied.`,
      },
      admin: {
        title: "Overdue Rental Charge",
        description: `Daily overdue charge of $${dayprice} applied to ${customer}'s ${service} order ${ref}. Accumulated extra: $${extra}.`,
      },
    };
  },

  orderExtended(ctx) {
    const { customer, service, ref } = actors(ctx);
    const days = ctx.extendedDays ?? ctx.extended_days ?? 0;
    const price = ctx.extendedPrice ?? ctx.extended_days_price ?? 0;
    const dateLabel =
      ctx.newEndDate instanceof Date
        ? ctx.newEndDate.toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
          })
        : ctx.newEndDate || "the new end date";
    return {
      timelineMessage: `${customer} extended ${service} order ${ref} by ${days} day(s); new end date ${dateLabel}.`,
      timeline: {
        customer: `You extended ${service} order ${ref} by ${days} day(s). New end date: ${dateLabel}.`,
        operator: `${customer} extended ${service} order ${ref} by ${days} day(s). New end date: ${dateLabel}.`,
        admin: `${customer} extended ${service} order ${ref} by ${days} day(s) ($${price}); new end date ${dateLabel}.`,
      },
      customer: {
        title: "Rental Extended",
        description: `You extended ${service} order ${ref} by ${days} day(s). New end date: ${dateLabel}.`,
      },
      operator: {
        title: "Rental Extended",
        description: `${customer} extended ${service} order ${ref} by ${days} day(s).`,
      },
      admin: {
        title: "Rental Extended",
        description: `${customer} extended ${service} order ${ref} by ${days} days ($${price}).`,
      },
      transactionReason: `Extension payment for ${service} order ${ref} (${days} days)`,
    };
  },

  /** Dispatch wave — operator only (customer already requested earlier). */
  dispatchWave(ctx) {
    const { customer, service, ref } = actors(ctx);
    return {
      operator: {
        title: "New Service Request",
        description: `${customer} requested a ${service} ${ref}. Accept to claim.`,
      },
    };
  },

  /** Admin approved a provider's request to cancel an accepted order. */
  cancellationApproved(ctx) {
    const { customer, provider, service, ref } = actors(ctx);
    const refundNote = ctx.refunded
      ? " Your payment has been refunded."
      : "";
    return {
      timelineMessage: `Admin approved cancellation of ${service} order ${ref}; order cancelled.`,
      timeline: {
        customer: `Your ${service} order ${ref} was cancelled by ${provider}.${refundNote}`,
        operator: `Your cancellation request for ${service} order ${ref} was approved by admin; order cancelled.`,
        admin: `Approved ${provider}'s cancellation of ${service} order ${ref} for ${customer}.`,
      },
      customer: {
        title: "Order Cancelled",
        description: `Your ${service} order ${ref} was cancelled by ${provider}.${refundNote}`,
      },
      operator: {
        title: "Cancellation Approved",
        description: `Your cancellation request for ${service} order ${ref} was approved by admin. The order is now cancelled.`,
      },
      admin: {
        title: "Cancellation Approved",
        description: `${provider}'s cancellation of ${service} order ${ref} for ${customer} was approved.`,
      },
    };
  },

  /** Admin rejected a provider's request to cancel an accepted order. */
  cancellationRejected(ctx) {
    const { service, ref } = actors(ctx);
    return {
      timelineMessage: `Admin rejected cancellation of ${service} order ${ref}.`,
      timeline: {
        operator: `Your cancellation request for ${service} order ${ref} was rejected by admin. Please complete the order.`,
        admin: `Rejected cancellation of ${service} order ${ref}.`,
      },
      operator: {
        title: "Cancellation Rejected",
        description: `Your cancellation request for ${service} order ${ref} was rejected by admin. Please complete the order.`,
      },
    };
  },

  /**
   * Sent to the OTHER eligible owners once a request has been claimed by
   * someone else — an engagement nudge, not a competitor call-out.
   */
  opportunityMissed(ctx) {
    const { service, ref } = actors(ctx);
    const sizePart = ctx.size ? `${ctx.size} ` : "";
    return {
      operator: {
        title: "Opportunity Missed",
        description: `The ${sizePart}${service} order ${ref} was just accepted by another provider. Stay tuned—grab the next one quickly!`,
      },
    };
  },
};

export default orderMessages;
