import { computeSplit } from "./paymentHold.js";

export const PRICING_ROLES = {
  CUSTOMER: "customer",
  OWNER: "owner",
  ADMIN: "admin",
  DRIVER: "driver",
};

/**
 * Convert a Mongoose document (or plain object) to a plain order payload.
 */
export function toPlainOrder(order) {
  if (!order || typeof order !== "object") return order;
  if (typeof order.toObject === "function") {
    return order.toObject({ virtuals: true, flattenMaps: true });
  }
  return { ...order };
}

function resolveCustomerTotal(order) {
  const price = Number(order.price);
  if (Number.isFinite(price) && price > 0) return price;
  return 0;
}

function resolveOwnerEarnings(order) {
  const stored = Number(order.amount);
  if (Number.isFinite(stored) && stored > 0) return stored;
  return computeSplit(resolveCustomerTotal(order), {
    driveaway: order.driveaway,
    cancelation: order.cancelation,
  }).amount;
}

function displayAmountForRole(customerTotal, ownerEarnings, role) {
  switch (role) {
    case PRICING_ROLES.OWNER:
      return ownerEarnings;
    case PRICING_ROLES.ADMIN:
      return customerTotal;
    case PRICING_ROLES.DRIVER:
      return undefined;
    case PRICING_ROLES.CUSTOMER:
    default:
      return customerTotal;
  }
}

/**
 * Shape order pricing for the requesting role.
 *
 * Frontend reads `price` and sometimes `amount` — both are aligned so no app
 * changes are required.
 *
 * - Customer: full amount paid
 * - Owner: earnings after 15% commission (excl. add-ons)
 * - Admin: raw DB values kept; adds breakdown fields
 * - Driver: financial/payout fields scrubbed; operational/placement data intact
 */
export function applyRolePricing(order, role = PRICING_ROLES.CUSTOMER) {
  const plain = toPlainOrder(order);
  if (!plain) return plain;

  if (role === PRICING_ROLES.DRIVER) {
    const {
      price,
      amount,
      total_price,
      displayPrice,
      paymentId,
      transferId,
      transfer,
      refunded,
      extended_price,
      extended_paymentId,
      companyPrice,
      perDiemRateSnapshot,
      includedTons,
      overagePerTon,
      overageAmount,
      billingRecord,
      ...driverOperationalPayload
    } = plain;
    return driverOperationalPayload;
  }

  const customerTotal = resolveCustomerTotal(plain);
  const ownerEarnings = resolveOwnerEarnings(plain);
  const displayAmount = displayAmountForRole(
    customerTotal,
    ownerEarnings,
    role,
  );

  const pricingFields = {
    customerTotal,
    ownerEarnings,
  };

  switch (role) {
    case PRICING_ROLES.OWNER:
      return {
        ...plain,
        ...pricingFields,
        price: ownerEarnings,
        amount: ownerEarnings,
        displayPrice: ownerEarnings,
        ...(plain.total_price > 0 ? { total_price: ownerEarnings } : {}),
      };
    case PRICING_ROLES.ADMIN:
      return {
        ...plain,
        ...pricingFields,
        displayPrice: customerTotal,
      };
    case PRICING_ROLES.CUSTOMER:
    default:
      return {
        ...plain,
        ...pricingFields,
        price: customerTotal,
        amount: customerTotal,
        displayPrice: customerTotal,
        ...(plain.total_price > 0 ? { total_price: customerTotal } : {}),
      };
  }
}

export function formatOrderPayload(order, role) {
  return applyRolePricing(order, role);
}

export function applyRolePricingToList(orders, role) {
  if (!Array.isArray(orders)) return orders;
  return orders.map((order) => applyRolePricing(order, role));
}

/** Map timeline/API role strings to pricing roles. */
export function pricingRoleFromContext(role) {
  if (role === "driver" || role === "subUser") {
    return PRICING_ROLES.DRIVER;
  }
  if (role === "operator" || role === "owner" || role === "renter") {
    return PRICING_ROLES.OWNER;
  }
  if (role === "admin") {
    return PRICING_ROLES.ADMIN;
  }
  return PRICING_ROLES.CUSTOMER;
}

/** Format nested `orderId` on assign-order records (owner/driver view). */
export function formatAssignOrderRecord(assignOrder, role = PRICING_ROLES.OWNER) {
  if (!assignOrder || typeof assignOrder !== "object") return assignOrder;
  const plain = toPlainOrder(assignOrder);
  if (plain.orderId && typeof plain.orderId === "object") {
    return {
      ...plain,
      orderId: applyRolePricing(plain.orderId, role),
    };
  }
  return plain;
}

export function formatAssignOrderList(assignOrders, role = PRICING_ROLES.OWNER) {
  if (!Array.isArray(assignOrders)) return assignOrders;
  return assignOrders.map((record) => formatAssignOrderRecord(record, role));
}

/** Format timeline entries that embed a full order snapshot. */
export function formatTimelineEntries(entries, role = PRICING_ROLES.CUSTOMER) {
  if (!Array.isArray(entries)) return entries;
  const pricingRole = pricingRoleFromContext(role);
  return entries.map((entry) => {
    const formatted = { ...entry };
    if (pricingRole === PRICING_ROLES.ADMIN) {
      delete formatted.orderDeatil;
      return formatted;
    }
    if (formatted.orderDeatil && typeof formatted.orderDeatil === "object") {
      if (formatted.orderDeatil.findorder) {
        formatted.orderDeatil = {
          ...formatted.orderDeatil,
          findorder: applyRolePricing(
            formatted.orderDeatil.findorder,
            pricingRole,
          ),
        };
      } else if (formatted.orderDeatil.price != null || formatted.orderDeatil.amount != null) {
        formatted.orderDeatil = applyRolePricing(
          formatted.orderDeatil,
          pricingRole,
        );
      }
    }
    return formatted;
  });
}

/** Format getAssignOrder response `{ details, token }`. */
export function formatAssignOrderDetailsResponse(result, role = PRICING_ROLES.OWNER) {
  if (!result || typeof result !== "object") return result;
  return {
    ...result,
    details: formatAssignOrderRecord(result.details, role),
  };
}
