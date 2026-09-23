import mongoose from "mongoose";
import Order from "../models/Order.js";
import Vehicle from "../models/Vehicle.js";
import User from "../models/User.js";
import VirtualCard from "../models/VirtualCard.js";
import TransactionHistory from "../models/TransactionHistory.js";
import PaymentHolding from "../models/tempHold.js";
import { logger } from "../config/logger.js";
import {
  BadRequestError,
  NotFoundError,
  InternalServerError,
} from "./apiError.js";

/**
 * Parse check-in date and time from order into a Date object
 * @param {Object} order - Order object with startDate.date and startDate.time
 * @returns {Date} Parsed check-in datetime
 */
function parseCheckInDateTime(order) {
  if (!order.startDate || !order.startDate.date) {
    throw new BadRequestError("Order must have a valid startDate.date");
  }

  const dateStr = order.startDate.date;
  const timeStr = order.startDate.time || "00:00";

  // Parse date string (assuming format like "2023-12-25" or ISO format)
  let checkInDate;
  try {
    checkInDate = new Date(dateStr);
    if (isNaN(checkInDate.getTime())) {
      throw new BadRequestError("Invalid date format in startDate.date");
    }
  } catch (error) {
    throw new BadRequestError("Invalid date format in startDate.date");
  }

  // Parse time string (format: "HH:MM")
  const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!timeMatch) {
    throw new BadRequestError(
      "Invalid time format in startDate.time. Expected HH:MM",
    );
  }

  const hours = parseInt(timeMatch[1], 10);
  const minutes = parseInt(timeMatch[2], 10);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new BadRequestError(
      "Invalid time values. Hours must be 0-23, minutes must be 0-59",
    );
  }

  // Set time on the date
  checkInDate.setHours(hours, minutes, 0, 0);

  return checkInDate;
}

/**
 * Calculate number of nights from hours
 * @param {number} hours - Duration in hours
 * @returns {number} Number of nights (rounded up)
 */
function calculateNights(hours) {
  if (!hours || hours <= 0) {
    throw new BadRequestError(
      "Order must have a valid hours value greater than 0",
    );
  }
  return Math.ceil(hours / 24);
}

/**
 * Calculate time until check-in
 * @param {Date} checkInDate - Check-in datetime
 * @returns {Object} Object with hoursUntilCheckIn and daysUntilCheckIn
 */
function calculateTimeUntilCheckIn(checkInDate) {
  const now = new Date();
  const diffMs = checkInDate.getTime() - now.getTime();
  const hoursUntilCheckIn = diffMs / (1000 * 60 * 60);
  const daysUntilCheckIn = hoursUntilCheckIn / 24;

  return {
    hoursUntilCheckIn,
    daysUntilCheckIn,
  };
}

/**
 * Process refund: Update VirtualCard, create TransactionHistory, update Order
 * @param {Object} order - Order object
 * @param {number} refundAmount - Amount to refund
 * @param {Object} calculation - Calculation details
 * @returns {Promise<Object>} Processing result
 */
async function processRefund(order, refundAmount, calculation) {
  if (refundAmount <= 0) {
    return {
      transactionId: null,
      orderStatus: order.status,
      cardBalanceAfter: null,
      processedAt: null,
    };
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Get user's virtual card
    const user = await User.findById(order.user || order.createdby).session(
      session,
    );
    if (!user) {
      throw new NotFoundError("User not found for this order");
    }

    // Find user's active virtual card
    const virtualCard = await VirtualCard.findOne({
      user: user._id,
      status: "ACTIVE",
    }).session(session);

    if (!virtualCard) {
      throw new NotFoundError("No active virtual card found for user");
    }

    // Get current balance
    const balanceBefore = parseFloat(virtualCard.balance);

    // Update virtual card balance
    const updatedCard = await VirtualCard.findByIdAndUpdate(
      virtualCard._id,
      {
        $inc: { balance: refundAmount },
        $set: { updatedAt: new Date() },
      },
      { new: true, session },
    );

    const balanceAfter = parseFloat(updatedCard.balance);

    // Create transaction history within session
    const transaction = new TransactionHistory({
      type: "REFUND",
      status: "COMPLETED",
      amount: refundAmount,
      currency: order.currency || "CHF",
      user: user._id,
      virtualCard: virtualCard._id,
      description: `Refund for order ${order._id} - ${calculation.policy} policy`,
      metadata: {
        orderId: order._id.toString(),
        policy: calculation.policy,
        calculation: calculation,
        refundAmount: refundAmount,
      },
      balanceBefore: balanceBefore,
      balanceAfter: balanceAfter,
      processedAt: new Date(),
    });
    await transaction.save({ session });

    // Update order status
    const orderStatus = order.status === "cancelled" ? "refunded" : "cancelled";
    await Order.findByIdAndUpdate(
      order._id,
      {
        $set: {
          status: orderStatus,
          updatedAt: new Date(),
        },
      },
      { session },
    );

    // Handle PaymentHolding if exists (related to this card)
    const paymentHolding = await PaymentHolding.findOne({
      user: user._id,
      card: virtualCard._id,
      status: "pending",
    }).session(session);

    if (paymentHolding) {
      // Release the holding if refund amount covers it
      if (refundAmount >= paymentHolding.amount) {
        await PaymentHolding.findByIdAndUpdate(
          paymentHolding._id,
          {
            $set: {
              status: "released",
              updatedAt: new Date(),
            },
          },
          { session },
        );
      }
    }

    await session.commitTransaction();

    return {
      transactionId: transaction._id.toString(),
      orderStatus: orderStatus,
      cardBalanceAfter: balanceAfter,
      processedAt: new Date(),
    };
  } catch (error) {
    await session.abortTransaction();
    logger.error("Error processing refund", {
      error: error.message,
      orderId: order._id,
      refundAmount,
      stack: error.stack,
    });
    throw error;
  } finally {
    await session.endSession();
  }
}

/**
 * Flexible Cancellation Policy
 * - Full refund if cancelled at least 24 hours before check-in
 * - If cancelled less than 24 hours before check-in:
 *   - First night is non-refundable
 *   - Unused nights are refunded
 * @param {Object} order - Order object
 * @returns {Promise<Object>} Refund calculation and processing result
 */
export const Flexible = async (order) => {
  try {
    // Validate order
    if (!order || !order._id) {
      throw new BadRequestError("Invalid order object");
    }

    if (!order.totalPrice || order.totalPrice <= 0) {
      throw new BadRequestError("Order must have a valid totalPrice");
    }

    // Parse check-in date and calculate time until check-in
    const checkInDate = parseCheckInDateTime(order);
    const { hoursUntilCheckIn, daysUntilCheckIn } =
      calculateTimeUntilCheckIn(checkInDate);

    // Calculate nights
    const totalNights = calculateNights(order.hours);
    const pricePerNight = order.totalPrice / totalNights;

    // Determine if cancelled before check-in
    const cancelledBeforeCheckIn = hoursUntilCheckIn > 0;

    // Calculate refund based on policy
    let refundAmount = 0;
    let firstNightCost = 0;
    let refundableNights = 0;
    let nonRefundableAmount = 0;
    let fullRefund = false;
    let firstNightNonRefundable = false;
    let remainingNightsRefund = 0;
    let remainingNightsRefundPercentage = 0;

    if (!cancelledBeforeCheckIn) {
      // Already past check-in, no refund
      refundAmount = 0;
      nonRefundableAmount = order.totalPrice;
      refundableNights = 0;
    } else if (hoursUntilCheckIn >= 24) {
      // Full refund if cancelled at least 24 hours before check-in
      refundAmount = order.totalPrice;
      fullRefund = true;
      refundableNights = totalNights;
      nonRefundableAmount = 0;
      remainingNightsRefund = totalNights;
      remainingNightsRefundPercentage = 100;
    } else {
      // Less than 24 hours before check-in
      // First night is non-refundable, unused nights are refunded
      firstNightCost = pricePerNight;
      firstNightNonRefundable = true;
      refundableNights = totalNights - 1;
      remainingNightsRefund = refundableNights;
      remainingNightsRefundPercentage = 100; // All remaining nights refunded
      refundAmount = refundableNights * pricePerNight;
      nonRefundableAmount = firstNightCost;
    }

    // Build calculation object
    const calculation = {
      policy: "Flexible",
      totalNights,
      pricePerNight,
      cancelledBeforeCheckIn,
      hoursUntilCheckIn,
      daysUntilCheckIn,
      firstNightCost,
      refundableNights,
      refundableAmount: refundAmount,
      nonRefundableAmount,
      breakdown: {
        fullRefund,
        firstNightNonRefundable,
        remainingNightsRefund,
        remainingNightsRefundPercentage,
      },
    };

    // Process refund
    const processing = await processRefund(order, refundAmount, calculation);

    return {
      success: true,
      refundAmount,
      calculation,
      processing,
    };
  } catch (error) {
    logger.error("Error in Flexible cancellation policy", {
      error: error.message,
      orderId: order?._id,
      stack: error.stack,
    });

    if (error instanceof BadRequestError || error instanceof NotFoundError) {
      throw error;
    }

    throw new InternalServerError(
      "Failed to process Flexible cancellation policy",
    );
  }
};

/**
 * Flexible Non-Refundable Cancellation Policy
 * - Check order.metadata.isNonRefundable
 * - If true: No refund
 * - If false or missing: Apply Flexible policy
 * @param {Object} order - Order object
 * @returns {Promise<Object>} Refund calculation and processing result
 */
export const FlexibleNonRefundable = async (order) => {
  try {
    // Validate order
    if (!order || !order._id) {
      throw new BadRequestError("Invalid order object");
    }

    // Check if non-refundable option was selected
    const isNonRefundable =
      order.metadata &&
      (order.metadata.get
        ? order.metadata.get("isNonRefundable")
        : order.metadata.isNonRefundable);

    if (isNonRefundable === true) {
      // No refund for non-refundable bookings
      const checkInDate = parseCheckInDateTime(order);
      const { hoursUntilCheckIn, daysUntilCheckIn } =
        calculateTimeUntilCheckIn(checkInDate);
      const totalNights = calculateNights(order.hours);
      const pricePerNight = order.totalPrice / totalNights;

      const calculation = {
        policy: "FlexibleNonRefundable",
        totalNights,
        pricePerNight,
        cancelledBeforeCheckIn: hoursUntilCheckIn > 0,
        hoursUntilCheckIn,
        daysUntilCheckIn,
        firstNightCost: pricePerNight,
        refundableNights: 0,
        refundableAmount: 0,
        nonRefundableAmount: order.totalPrice,
        breakdown: {
          fullRefund: false,
          firstNightNonRefundable: false,
          remainingNightsRefund: 0,
          remainingNightsRefundPercentage: 0,
          isNonRefundable: true,
        },
      };

      const processing = await processRefund(order, 0, calculation);

      return {
        success: true,
        refundAmount: 0,
        calculation,
        processing,
      };
    }

    // Apply Flexible policy if not non-refundable
    return await Flexible(order);
  } catch (error) {
    logger.error("Error in FlexibleNonRefundable cancellation policy", {
      error: error.message,
      orderId: order?._id,
      stack: error.stack,
    });

    if (error instanceof BadRequestError || error instanceof NotFoundError) {
      throw error;
    }

    throw new InternalServerError(
      "Failed to process FlexibleNonRefundable cancellation policy",
    );
  }
};

/**
 * Moderate Cancellation Policy
 * - Full refund if cancelled at least 5 days before check-in
 * - If cancelled within 5 days:
 *   - First night is non-refundable
 *   - 50% refund for remaining nights
 * @param {Object} order - Order object
 * @returns {Promise<Object>} Refund calculation and processing result
 */
export const Moderate = async (order) => {
  try {
    // Validate order
    if (!order || !order._id) {
      throw new BadRequestError("Invalid order object");
    }

    if (!order.totalPrice || order.totalPrice <= 0) {
      throw new BadRequestError("Order must have a valid totalPrice");
    }

    // Parse check-in date and calculate time until check-in
    const checkInDate = parseCheckInDateTime(order);
    const { hoursUntilCheckIn, daysUntilCheckIn } =
      calculateTimeUntilCheckIn(checkInDate);

    // Calculate nights
    const totalNights = calculateNights(order.hours);
    const pricePerNight = order.totalPrice / totalNights;

    // Determine if cancelled before check-in
    const cancelledBeforeCheckIn = hoursUntilCheckIn > 0;

    // Calculate refund based on policy
    let refundAmount = 0;
    let firstNightCost = 0;
    let refundableNights = 0;
    let nonRefundableAmount = 0;
    let fullRefund = false;
    let firstNightNonRefundable = false;
    let remainingNightsRefund = 0;
    let remainingNightsRefundPercentage = 0;

    if (!cancelledBeforeCheckIn) {
      // Already past check-in, no refund
      refundAmount = 0;
      nonRefundableAmount = order.totalPrice;
      refundableNights = 0;
    } else if (daysUntilCheckIn >= 5) {
      // Full refund if cancelled at least 5 days before check-in
      refundAmount = order.totalPrice;
      fullRefund = true;
      refundableNights = totalNights;
      nonRefundableAmount = 0;
      remainingNightsRefund = totalNights;
      remainingNightsRefundPercentage = 100;
    } else {
      // Within 5 days of check-in
      // First night is non-refundable, 50% refund for remaining nights
      firstNightCost = pricePerNight;
      firstNightNonRefundable = true;
      refundableNights = totalNights - 1;
      remainingNightsRefund = refundableNights;
      remainingNightsRefundPercentage = 50; // 50% of remaining nights
      const remainingNightsAmount = refundableNights * pricePerNight;
      refundAmount = remainingNightsAmount * 0.5; // 50% of remaining nights
      nonRefundableAmount = firstNightCost + remainingNightsAmount * 0.5;
    }

    // Build calculation object
    const calculation = {
      policy: "Moderate",
      totalNights,
      pricePerNight,
      cancelledBeforeCheckIn,
      hoursUntilCheckIn,
      daysUntilCheckIn,
      firstNightCost,
      refundableNights,
      refundableAmount: refundAmount,
      nonRefundableAmount,
      breakdown: {
        fullRefund,
        firstNightNonRefundable,
        remainingNightsRefund,
        remainingNightsRefundPercentage,
      },
    };

    // Process refund
    const processing = await processRefund(order, refundAmount, calculation);

    return {
      success: true,
      refundAmount,
      calculation,
      processing,
    };
  } catch (error) {
    logger.error("Error in Moderate cancellation policy", {
      error: error.message,
      orderId: order?._id,
      stack: error.stack,
    });

    if (error instanceof BadRequestError || error instanceof NotFoundError) {
      throw error;
    }

    throw new InternalServerError(
      "Failed to process Moderate cancellation policy",
    );
  }
};

/**
 * Moderate Non-Refundable Cancellation Policy
 * - Check order.metadata.isNonRefundable
 * - If true: No refund
 * - If false or missing: Apply Moderate policy
 * @param {Object} order - Order object
 * @returns {Promise<Object>} Refund calculation and processing result
 */
export const ModerateNonRefundable = async (order) => {
  try {
    // console.log("Order Metadata", order);
    // Validate order
    if (!order || !order._id) {
      throw new BadRequestError("Invalid order object");
    }

    // Check if non-refundable option was selected
    const isNonRefundable =
      order.metadata &&
      (order.metadata.get
        ? order.metadata.get("isNonRefundable")
        : order.metadata.isNonRefundable);

    if (isNonRefundable === true) {
      // No refund for non-refundable bookings
      const checkInDate = parseCheckInDateTime(order);
      const { hoursUntilCheckIn, daysUntilCheckIn } =
        calculateTimeUntilCheckIn(checkInDate);
      const totalNights = calculateNights(order.hours);
      const pricePerNight = order.totalPrice / totalNights;

      const calculation = {
        policy: "ModerateNonRefundable",
        totalNights,
        pricePerNight,
        cancelledBeforeCheckIn: hoursUntilCheckIn > 0,
        hoursUntilCheckIn,
        daysUntilCheckIn,
        firstNightCost: pricePerNight,
        refundableNights: 0,
        refundableAmount: 0,
        nonRefundableAmount: order.totalPrice,
        breakdown: {
          fullRefund: false,
          firstNightNonRefundable: false,
          remainingNightsRefund: 0,
          remainingNightsRefundPercentage: 0,
          isNonRefundable: true,
        },
      };

      const processing = await processRefund(order, 0, calculation);

      return {
        success: true,
        refundAmount: 0,
        calculation,
        processing,
      };
    }

    // Apply Moderate policy if not non-refundable
    return await Moderate(order);
  } catch (error) {
    logger.error("Error in ModerateNonRefundable cancellation policy", {
      error: error.message,
      orderId: order?._id,
      stack: error.stack,
    });

    if (error instanceof BadRequestError || error instanceof NotFoundError) {
      throw error;
    }

    throw new InternalServerError(
      "Failed to process ModerateNonRefundable cancellation policy",
    );
  }
};
