import Dustbin from "../../models/Dustbin.js";
import Order from "../../models/Order.js";
import {
  NotFoundError,
  UnauthorizedError,
  BadRequestError,
  ForbiddenError,
} from "../../utils/apiError.js";
import { sendNotification } from "../../utils/notifications.js";
import { io, connectedUsers } from "../../socket/socket.js";
import { refundPayment } from "../../utils/StripePayment.js";
import { getAddonFees, computeSplit } from "../../utils/paymentHold.js";
import OrderTimeline from "../../models/OrderTimeline.js";
import {
  buttonTemplate,
  offerAcceptedTemplate,
  orderChangeOfferTemplate,
} from "../../utils/emailTemplate.js";
import JobEvent from "../../models/JobEvent.js";
import { ScoreEngine } from "../scoring/scoreEngine.js";
import User from "../../models/User.js";
import logger from "../../config/logger.js";
import DispatchService from "../../utils/dispatchService.js";
import { cancelOrderExpiry } from "../../utils/orderExpiryService.js";
import orderMessages, { timelineEntry } from "../../utils/orderMessages.js";
import { isDeliveredOnTime } from "../../utils/deliveryTiming.js";
import TransactionModel from "../../models/Transaction.js";
import AdminManualReviewRequest from "../../models/AdminManualReviewRequests.js";
import {
  applyRolePricingToList,
  formatOrderPayload,
  formatTimelineEntries,
  PRICING_ROLES,
} from "../../utils/orderPricing.js";
import {
  applyGrowthPenalty,
  recomputeOperatorGrowth,
} from "../../utils/growthEngine.js";
import mongoose from "mongoose";
import Rating from "../../models/Rating.js";
import { AssignOrder, SubUserDetail } from "../../models/AssignOrder.js";

class OrderService {
  async fetchrequestOrder(
    query,
    page = 1,
    limit = 10,
    role = PRICING_ROLES.CUSTOMER,
  ) {
    const orders = await Order.find(query)
      .populate([
        "user",
        "dumbster",
        "portaPotty",
        "to_id",
        {
          path: "assignOrder",
          populate: {
            path: "subUserDetail",
          },
        },
      ])
      .sort({ _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const total = await Order.countDocuments(query);

    if (orders.length === 0) {
      return {
        orders: [],
        page,
        limit,
        total: 0,
        currentPage: page,
        totalPages: 0,
      };
    }

    return {
      orders: applyRolePricingToList(orders, role),
      page,
      limit,
      total,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
    };
  }
  async renterStats(to_id) {
    try {
      const applications = await Order.find({ to_id })
        .select("amount status")
        .lean();

      const pendingOrder = applications.filter(
        (item) => item.status == "pending",
      ).length;
      const acceptedOrder = applications.filter(
        (item) => item.status == "accepted",
      ).length;
      const completeOrder = applications.filter(
        (item) => item.status == "completed",
      );
      const totalEarning = completeOrder.reduce(
        (a, b) => a + Number(b.amount),
        0,
      );
      return {
        completeOrder: completeOrder.length,
        acceptedOrder,
        pendingOrder,
        totalEarning,
      };
    } catch (error) {
      throw error;
    }
  }
  static async append() {
    try {
      await Order.updateMany(
        { materialInformation: { $exists: false } },
        { materialInformation: "New Information" },
      );
    } catch (error) {
      throw error;
    }
  }
  async completeOrder(applicationId, userId, status) {
    try {
      const updatedSession = await Order.findOneAndUpdate(
        { _id: applicationId, status: "accepted", to_id: userId },
        {
          status: status,
        },
        { new: true },
      )
        .populate("to_id")
        .populate("user");
      if (updatedSession == null) {
        throw new NotFoundError("Order not found");
      }
      const dustbin = await Dustbin.findById(updatedSession.dustbin);
      if (!dustbin) {
        throw new NotFoundError("Dustbin not found");
      }

      // Find and remove the booking
      dustbin.bookings = dustbin.bookings.filter((booking) => {
        return !(
          new Date(booking.startDate).getTime() ===
          new Date(updatedSession.start_date).getTime() &&
          new Date(booking.endDate).getTime() ===
          new Date(updatedSession.end_date).getTime()
        );
      });

      await dustbin.save();
      const link = `https://api.binsapp.ai/customer-orders?orderId=${updatedSession._id}`;

      await sendNotification({
        user: userId,
        to_id: updatedSession.user._id,
        description:
          `Your Offer has been completed by ` + updatedSession?.to_id?.name,
        type: "order",
        title: "Offer completed",
        fcmtoken: updatedSession.user.fcmtoken,
        order: applicationId,
        noti: false,
        email: updatedSession.user?.email || "",
        html: offerAcceptedTemplate(link),
        customEmailTemplate: true,
      });

      // Log Operator Activity and Recalculate Score
      try {
        const effectiveEnd =
          updatedSession.new_end_date || updatedSession.end_date;
        const completedOnTime = isDeliveredOnTime(effectiveEnd);
        await JobEvent.create({
          operatorId: updatedSession.to_id._id,
          orderId: updatedSession._id,
          eventType: "JOB_COMPLETED",
          revenueGenerated: updatedSession.price || 0,
          onTime: completedOnTime,
        });
        await ScoreEngine.calculateOperatorScore(updatedSession.to_id._id);
        recomputeOperatorGrowth(updatedSession.to_id._id, {
          notify: true,
          reason: "order_completed",
        }).catch((growthErr) =>
          logger.error("Failed to recompute growth profile", growthErr),
        );
      } catch (scoreErr) {
        logger.error("Failed to update operator score", scoreErr);
      }

      return formatOrderPayload(updatedSession, PRICING_ROLES.OWNER);
    } catch (error) {
      throw error;
    }
  }
  async renteeOrder(
    query,
    page = 1,
    limit = 10,
    role = PRICING_ROLES.CUSTOMER,
  ) {
    try {
      const orders = await Order.find(query)
        .populate([
          "user",
          "dumbster",
          "dustbin",
          "to_id",
          "userIds",
          "rejected_by",
          "accepted_by",
          "portaPotty",
          "treeRemoval",
          "junkRemoval",
          "company",
          {
            path: "assignOrder",
            populate: {
              path: "subUserDetail",
            },
          },
        ])
        .sort({ _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();
      const total = await Order.countDocuments(query);
      return {
        orders: applyRolePricingToList(orders || [], role),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      throw error;
    }
  }
  async updateOnItsWay(senderId, orderId) {
    const updatedSession = await Order.findOne({
      _id: orderId,
      status: "accepted",
      to_id: senderId,
    })
      .populate("to_id")
      .populate("user");

    if (updatedSession == null) {
      throw new NotFoundError("Order not found");
    }

    if (updatedSession.onway == true) {
      throw new BadRequestError("Order is already set on its way!");
    }

    const onwayCopy = orderMessages.onTheWay({
      customerName: updatedSession.user?.name,
      providerName: updatedSession.to_id?.name,
      serviceType: updatedSession.service_type,
      order: updatedSession,
    });

    updatedSession.onway = true;
    await updatedSession.save();
    await OrderTimeline.create({
      order: updatedSession._id,
      orderDeatil: updatedSession,
      ...timelineEntry(onwayCopy),
    });
    const link = `https://api.binsapp.ai/customer-orders?orderId=${updatedSession._id}`;
    await sendNotification({
      user: senderId,
      to_id: updatedSession.user._id.toString(),
      description: onwayCopy.customer.description,
      type: "order",
      title: onwayCopy.customer.title,
      fcmtoken: updatedSession.user.fcmtoken,
      order: orderId,
      noti: true,
      email: updatedSession.user?.email || "",
      customEmailTemplate: true,
      html: buttonTemplate(
        link,
        onwayCopy.customer.title,
        onwayCopy.customer.description,
      ),
    });
    const socket = connectedUsers.get(updatedSession.user._id.toString());
    io.to(socket).emit("onway-order-rentee", {
      success: true,
      order: formatOrderPayload(updatedSession, PRICING_ROLES.CUSTOMER),
      title: onwayCopy.customer.title,
      message: onwayCopy.customer.description,
    });

    return formatOrderPayload(updatedSession, PRICING_ROLES.OWNER);
  }
  async deleteUserOrder(Id, userId) {
    try {
      const order = await Order.findOne({ _id: Id, user: userId }).populate(
        "user",
      );
      if (!order) {
        throw new NotFoundError("Order not found");
      }

      // Only a still-searching (pending, unmatched) request may be cancelled.
      if (order.status !== "pending" || order.to_id != null) {
        throw new BadRequestError(
          "Request can no longer be cancelled because it has been accepted.",
        );
      }

      // Reverse the customer's payment.
      let paymentStatus = "none";
      if (order.payment_type === "wallet") {
        // Wallet funds are only debited when an owner accepts, so a pending
        // request has nothing to credit back.
        paymentStatus = "wallet_no_charge";
      } else if (order.paymentId) {
        const reversal = await refundPayment(
          order.paymentId,
          Number(order.price) || 0,
        );
        if (reversal.released) {
          paymentStatus = "hold_released";
        } else if (["succeeded", "pending"].includes(reversal.status)) {
          paymentStatus = "refunded";
        } else {
          paymentStatus = "reversal_failed";
          logger.error("Customer cancel payment reversal failed", {
            orderId: order._id?.toString(),
            reason: reversal.failure_reason,
          });
        }
      }

      // Mark cancelled (keep the record for history/audit) rather than deleting.
      const cancelled = await Order.findByIdAndUpdate(
        Id,
        {
          $set: {
            status: "cancelled",
            refunded:
              paymentStatus === "refunded" || paymentStatus === "hold_released",
            "metadata.searchExpired": false,
            "metadata.cancelledBy": "customer",
            "metadata.paymentHoldStatus": "cancelled",
            "metadata.paymentReversal": paymentStatus,
            "metadata.cancelledAt": new Date(),
          },
        },
        { new: true },
      );

      // Reverse the booking-time hold debit so the customer's ledger nets to
      // zero (the hold was released / refunded, so no money was actually taken).
      if (order.paymentId && paymentStatus !== "reversal_failed") {
        const bookingDebit = await TransactionModel.findOne({
          order: Id,
          stripePaymentIntentId: order.paymentId,
          type: "debit",
        });
        if (bookingDebit) {
          const alreadyReversed = await TransactionModel.findOne({
            order: Id,
            stripePaymentIntentId: order.paymentId,
            type: "credit",
            "metadata.flow": "booking_cancel_reversal",
          });
          if (!alreadyReversed) {
            await TransactionModel.create({
              user: bookingDebit.user,
              order: Id,
              amount: bookingDebit.amount,
              type: "credit",
              stripePaymentIntentId: order.paymentId,
              metadata: {
                source: "http",
                flow: "booking_cancel_reversal",
                reason: "Hold released — booking authorization reversed",
              },
            });
          }
        }
      }

      // Stop pending dispatch waves and the auto-expiry job.
      await DispatchService.cancelRemainingWaves(Id).catch((err) =>
        logger.error("cancelRemainingWaves failed on customer cancel", err),
      );
      await cancelOrderExpiry(Id).catch((err) =>
        logger.error("cancelOrderExpiry failed on customer cancel", err),
      );

      const cancelCopy = orderMessages.preMatchCancelled({
        customerName: order.user?.name,
        serviceType: order.service_type,
        order,
      });

      await OrderTimeline.create({
        order: Id,
        orderDeatil: cancelled,
        ...timelineEntry(cancelCopy),
      });

      // Remove it from every notified owner's live request feed.
      if (order.userIds?.length) {
        for (const ownerId of order.userIds) {
          io.to(`user_${ownerId.toString()}`).emit("cancel-order-renter", {
            success: true,
            order: formatOrderPayload(cancelled, PRICING_ROLES.OWNER),
            orderId: Id,
            title: cancelCopy.operator.title,
            message: cancelCopy.operator.description,
          });
        }
      }

      const notifyPromises = [];

      // Notify admin.
      const adminUser = await User.findOne({
        $or: [{ type: "admin" }, { role: "admin" }],
      })
        .select("_id fcmtoken")
        .lean();
      if (adminUser) {
        io.to(`user_${adminUser._id.toString()}`).emit("admin-noti", {
          success: true,
          title: cancelCopy.admin.title,
          message: cancelCopy.admin.description,
          type: "order",
        });
        notifyPromises.push(
          sendNotification({
            user: userId.toString(),
            to_id: adminUser._id.toString(),
            description: cancelCopy.admin.description,
            type: "order",
            title: cancelCopy.admin.title,
            fcmtoken: adminUser?.fcmtoken || "",
            order: Id,
            email: "",
          }),
        );
      }

      // Confirm to the customer.
      io.to(`user_${userId.toString()}`).emit("cancel-order-rentee", {
        success: true,
        order: formatOrderPayload(cancelled, PRICING_ROLES.CUSTOMER),
        title: cancelCopy.customer.title,
        message: cancelCopy.customer.description,
      });

      Promise.all(notifyPromises).catch((err) =>
        logger.error("Customer cancel notification failed", err),
      );

      return {
        order: formatOrderPayload(cancelled, PRICING_ROLES.CUSTOMER),
        paymentStatus,
      };
    } catch (error) {
      throw error;
    }
  }
  async checkRate(userId) {
    try {
      const findOrder = await Order.findOne({
        user: userId,
        renteeRate: false,
        status: "completed",
      })
        .populate("to_id")
        .populate("user")
        .populate("dumbster")
        .populate("dustbin")
        .lean();
      if (!findOrder) {
        throw new NotFoundError("Order not found");
      }
      await Order.findByIdAndUpdate(
        findOrder._id,
        { renteeRate: true },
        { new: true },
      );
      return formatOrderPayload(findOrder, PRICING_ROLES.CUSTOMER);
    } catch (error) {
      throw error;
    }
  }
  async renterCheckRate(userId) {
    try {
      const findOrder = await Order.findOne({
        to_id: userId,
        renterRate: false,
        status: "completed",
      })
        .populate("to_id")
        .populate("user")
        .populate("dumbster")
        .populate("dustbin")
        .populate("portaPotty")
        .lean();
      if (!findOrder) {
        throw new NotFoundError("Order not found");
      }
      await Order.findByIdAndUpdate(
        findOrder._id,
        { renterRate: true },
        { new: true },
      );
      return formatOrderPayload(findOrder, PRICING_ROLES.OWNER);
    } catch (error) {
      throw error;
    }
  }
  async adminCancelRequestUpdate(orderId, status, adminId) {
    try {
      const findOrder = await Order.findById(orderId).populate(
        "to_id user dumbster dustbin portaPotty",
      );

      if (!findOrder) {
        throw new NotFoundError("Order not found");
      }

      if (status == "accepted") {
        // Protection add-ons are non-refundable (kept by admin); refund the base.
        const privacyAmount = getAddonFees({
          driveaway: findOrder.driveaway,
          cancelation: findOrder.cancelation,
        });
        const amount = Number(findOrder.price) - privacyAmount; // base refunded
        const isWallet = findOrder.payment_type === "wallet";
        const customerId = findOrder.user._id.toString();
        const ownerId =
          findOrder.to_id?._id?.toString() || findOrder.to_id?.toString();

        let refundOk = false;

        if (isWallet) {
          // Wallet: refund the base to the customer and claw back the owner
          // payout + admin commission that were credited at accept-time. Add-ons
          // stay with the admin (non-refundable). Ledger nets to: customer
          // −addons, owner 0, admin +addons.
          const ownerPayout = Number(
            computeSplit(Number(findOrder.price), {
              driveaway: findOrder.driveaway,
              cancelation: findOrder.cancelation,
            }).amount,
          );
          const commission = Number((amount - ownerPayout).toFixed(2));

          const adminForFee = await User.findOne({
            $or: [{ type: "admin" }, { role: "admin" }],
          })
            .select("_id")
            .lean();

          const walletOps = [
            User.findByIdAndUpdate(customerId, { $inc: { balance: amount } }),
          ];
          if (ownerId && ownerPayout > 0) {
            walletOps.push(
              User.findByIdAndUpdate(ownerId, {
                $inc: { balance: -ownerPayout },
              }),
            );
          }
          if (adminForFee && commission > 0) {
            walletOps.push(
              User.findByIdAndUpdate(adminForFee._id, {
                $inc: { balance: -commission },
              }),
            );
          }
          await Promise.all(walletOps);

          const clawbackTxns = [
            TransactionModel.create({
              user: customerId,
              order: orderId,
              amount,
              type: "credit",
              stripePaymentIntentId: null,
              metadata: {
                source: "http",
                flow: "admin_cancel_refund",
                payment_type: "wallet",
                reason: "Base refunded to customer on admin cancellation",
              },
            }),
          ];
          if (ownerId && ownerPayout > 0) {
            clawbackTxns.push(
              TransactionModel.create({
                user: ownerId,
                order: orderId,
                amount: ownerPayout,
                type: "debit",
                stripePaymentIntentId: null,
                metadata: {
                  source: "http",
                  flow: "admin_cancel_clawback",
                  payment_type: "wallet",
                  reason: "Owner payout reversed on admin cancellation",
                },
              }),
            );
          }
          if (adminForFee && commission > 0) {
            clawbackTxns.push(
              TransactionModel.create({
                user: adminForFee._id,
                order: orderId,
                amount: commission,
                type: "debit",
                stripePaymentIntentId: null,
                metadata: {
                  source: "http",
                  flow: "admin_cancel_clawback",
                  payment_type: "wallet",
                  reason: "Platform commission reversed on admin cancellation",
                },
              }),
            );
          }
          await Promise.all(clawbackTxns);
          refundOk = true;
        } else {
          // Card: refund the base via Stripe. The owner was not paid yet
          // (transfer only happens at completion), so no clawback is needed.
          const refund = await refundPayment(findOrder.paymentId, amount);
          refundOk = ["succeeded", "pending"].includes(refund.status);

          if (refundOk) {
            await TransactionModel.create({
              user: customerId,
              order: orderId,
              amount,
              type: "credit",
              stripePaymentIntentId: findOrder.paymentId,
              metadata: {
                source: "http",
                flow: "admin_cancel_refund",
                reason: "Base refunded to customer on admin cancellation",
              },
            });
          } else {
            logger.error("Admin cancel refund failed", {
              orderId: findOrder._id?.toString(),
              reason: refund.failure_reason,
            });
          }
        }

        findOrder.cancelation_request = false;
        findOrder.status = "cancelled";
        findOrder.refunded = refundOk;
        await findOrder.save();

        const cancelApprovedCopy = orderMessages.cancellationApproved({
          customerName: findOrder.user?.name,
          providerName: findOrder.to_id?.name,
          serviceType: findOrder.service_type,
          order: findOrder,
          refunded: findOrder.refunded,
        });

        // Customer-facing: their order was cancelled by the provider.
        await sendNotification({
          user: findOrder.to_id._id.toString(),
          to_id: findOrder.user._id.toString(),
          description: cancelApprovedCopy.customer.description,
          type: "order",
          title: cancelApprovedCopy.customer.title,
          fcmtoken: findOrder.user.fcmtoken,
          order: orderId,
          noti: false,
          email: findOrder.user?.email || "",
        });

        // Owner-facing: their cancellation request was approved.
        await sendNotification({
          user: adminId,
          to_id: findOrder.to_id._id.toString(),
          description: cancelApprovedCopy.operator.description,
          type: "order",
          title: cancelApprovedCopy.operator.title,
          fcmtoken: findOrder.to_id.fcmtoken,
          order: orderId,
          noti: false,
          email: findOrder.to_id?.email || "",
        });

        // Log Operator Cancellation Activity and Recalculate Score
        try {
          await JobEvent.create({
            operatorId: findOrder.to_id._id,
            orderId: findOrder._id,
            eventType: "JOB_CANCELLED",
            revenueGenerated: 0,
          });
          await ScoreEngine.calculateOperatorScore(findOrder.to_id._id);
          if (refundOk) {
            applyGrowthPenalty(findOrder.to_id._id, {
              type: "refund",
              orderId: findOrder._id,
              note: "Admin cancellation refund",
              source: "admin_cancel",
            }).catch((err) =>
              logger.error("Growth refund penalty failed", err),
            );
          } else {
            recomputeOperatorGrowth(findOrder.to_id._id, {
              notify: true,
              reason: "order_cancelled",
            }).catch((err) =>
              logger.error("Growth recompute on cancel failed", err),
            );
          }
        } catch (scoreErr) {
          logger.error(
            "Failed to update operator score on cancellation",
            scoreErr,
          );
        }

        io.to(`user_${findOrder.user._id.toString()}`).emit(
          "cancel-order-rentee",
          {
            success: true,
            order: findOrder,
            title: cancelApprovedCopy.customer.title,
            message: cancelApprovedCopy.customer.description,
          },
        );
        io.to(`user_${findOrder.to_id._id.toString()}`).emit(
          "cancel-order-status",
          {
            success: true,
            order: findOrder,
            title: cancelApprovedCopy.operator.title,
            message: cancelApprovedCopy.operator.description,
          },
        );
      } else {
        const cancelRejectedCopy = orderMessages.cancellationRejected({
          serviceType: findOrder.service_type,
          order: findOrder,
        });
        await sendNotification({
          user: adminId,
          to_id: findOrder.to_id._id.toString(),
          description: cancelRejectedCopy.operator.description,
          type: "order",
          title: cancelRejectedCopy.operator.title,
          fcmtoken: findOrder.to_id.fcmtoken,
          order: orderId,
          noti: false,
          email: findOrder.to_id?.email || "",
        });
        findOrder.cancelation_request = false;
        await findOrder.save();
        io.to(`user_${findOrder.to_id._id.toString()}`).emit(
          "cancel-order-status",
          {
            success: true,
            order: findOrder,
            title: cancelRejectedCopy.operator.title,
            message: cancelRejectedCopy.operator.description,
          },
        );
      }
      return {
        findOrder,
      };
    } catch (error) {
      logger.error("adminCancelRequestUpdate error", error);
      throw error;
    }
  }

  async adminRefunedRequestUpdate(orderId, adminId) {
    try {
      const findOrder = await Order.findById(orderId).populate(
        "to_id user dumbster dustbin portaPotty",
      );

      if (!findOrder) {
        throw new NotFoundError("Order not found");
      }

      findOrder.refunded = true;
      await findOrder.save();

      await sendNotification({
        user: adminId,
        to_id: findOrder.user._id.toString(),
        description: `Your Order payment has been refunded by admin!`,
        type: "order",
        title: "Order update",
        fcmtoken: findOrder.user.fcmtoken,
        order: orderId,
        noti: false,
        email: findOrder.user?.email || "",
      });
      io.to(findOrder.user._id.toString()).emit("cancel-order-payment", {
        success: true,
        order: findOrder,
        title: "Order Update",
        message: `Your Order payment has been refunded by admin!`,
      });
    } catch (error) {
      logger.error("adminRefunedRequestUpdate error", error);
      throw error;
    }
  }

  async adminTransferRequestUpdate(orderId, adminId) {
    try {
      const findOrder = await Order.findById(orderId).populate(
        "to_id user dumbster dustbin portaPotty",
      );

      if (!findOrder) {
        throw new NotFoundError("No order found.");
      }

      findOrder.transfer = true;
      await findOrder.save();

      await sendNotification({
        user: adminId,
        to_id: findOrder.to_id._id.toString(),
        description: `Your Order payment has been transfer to you by admin.`,
        type: "order",
        title: "Order update",
        fcmtoken: findOrder.to_id.fcmtoken,
        order: orderId,
        noti: false,
        email: findOrder.to_id?.email || "",
      });

      io.to(findOrder.to_id?._id?.toString()).emit("completed-order-payment", {
        success: true,
        order: findOrder,
        title: "Order Update",
        message: `Your Order payment has been transfer to you by admin.`,
      });
      return findOrder;
    } catch (error) {
      logger.error("adminTransferRequestUpdate error", error);
      throw error;
    }
  }
  /**
   * Returns the latest known driver/dumpster coordinates for an order so the map
   * can seed the marker if a socket `location-update` was missed. Prefers the
   * assigned sub-driver's location, then falls back to the order owner's live
   * coordinates. Only the order's customer or owner may read it.
   */
  async getOrderLiveLocation(orderId, requesterId) {
    const order = await Order.findById(orderId)
      .populate("to_id", "currentlat currentlng name")
      .populate({
        path: "assignOrder",
        populate: { path: "subUserDetail", select: "location name" },
      })
      .lean();
    if (!order) throw new NotFoundError("Order not found");

    const requester = requesterId?.toString();
    const isCustomer = order.user?.toString() === requester;
    const isOwner = order.to_id?._id?.toString() === requester;
    if (!isCustomer && !isOwner) {
      throw new ForbiddenError("You are not allowed to track this order.");
    }

    let currentlat = null;
    let currentlng = null;
    let driverId = null;
    let driverName = null;

    const subDriver = order.assignOrder?.subUserDetail;
    const subCoords = subDriver?.location?.coordinates;
    if (Array.isArray(subCoords) && subCoords.length === 2) {
      currentlng = subCoords[0];
      currentlat = subCoords[1];
      driverId = subDriver._id;
      driverName = subDriver.name || null;
    } else if (order.to_id) {
      currentlat = order.to_id.currentlat ?? null;
      currentlng = order.to_id.currentlng ?? null;
      driverId = order.to_id._id;
      driverName = order.to_id.name || null;
    }

    return {
      orderId: order._id,
      userId: driverId,
      driverName,
      currentlat,
      currentlng,
      onway: order.onway === true,
      status: order.status,
      hasLocation: currentlat != null && currentlng != null,
    };
  }

  async getOrderTimeline(orderId, role = "admin") {
    try {
      const entries = await OrderTimeline.find({
        order: orderId,
      })
        .sort({ createdAt: 1 })
        .lean();
      const withMessages = entries.map((entry) => {
        let message = entry.message;
        if (role === "customer" && entry.customerMessage) {
          message = entry.customerMessage;
        } else if (role === "operator" && entry.operatorMessage) {
          message = entry.operatorMessage;
        } else if (role === "admin" && entry.adminMessage) {
          message = entry.adminMessage;
        }
        return { ...entry, message };
      });
      return formatTimelineEntries(withMessages, role);
    } catch (error) {
      logger.error("getOrderTimeline error", error);
      throw error;
    }
  }

  async getSingleOrder(orderId, userId, role = PRICING_ROLES.CUSTOMER) {
    if (!orderId) throw new BadRequestError("Order ID is required");

    const order = await Order.findById(orderId)
      .populate([
        "user",
        "dumbster",
        "portaPotty",
        "to_id",
        {
          path: "assignOrder",
          populate: {
            path: "subUserDetail",
          },
        },
      ])
      .lean();

    if (!order) {
      throw new NotFoundError("Order not found");
    }

    const requester = userId ? userId.toString() : null;
    const isCustomer =
      order.user?._id?.toString() === requester ||
      order.user?.toString() === requester;
    const isOwner =
      order.to_id?._id?.toString() === requester ||
      order.to_id?.toString() === requester;
    const isDriver =
      order.assignOrder?.subUserDetail?._id?.toString() === requester;

    if (requester && !isCustomer && !isOwner && !isDriver) {
      const userDoc = await User.findById(userId).select("type role").lean();
      const isAdmin = userDoc?.type === "admin" || userDoc?.role === "admin";
      if (!isAdmin) {
        throw new ForbiddenError("You are not authorized to view this order");
      }
    }

    return formatOrderPayload(order, role);
  }
  async deleteAdminOrder(Id) {
    try {
      const deletedSession = await Order.findByIdAndDelete({
        _id: Id,
      });
      if (deletedSession == null) {
        throw new NotFoundError("Order not found");
      }
      return deletedSession;
    } catch (error) {
      throw error;
    }
  }
  async getAdminManualReviewRequest(query, { page, limit }) {
    try {
      const adminManualReviewRequests = await AdminManualReviewRequest.find(
        query,
      )
        .populate("userId")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();
      const total = await AdminManualReviewRequest.countDocuments(query);
      const totalPages = Math.ceil(total / limit);
      const currentPage = parseInt(page);
      return {
        adminManualReviewRequests,
        total,
        totalPages,
        currentPage,
        page,
        limit,
      };
    } catch (error) {
      logger.error("getAdminManualReviewRequest error", error);
      throw error;
    }
  }
  async udpateAdminManualReviewRequest(id, data) {
    try {
      const adminManualReviewRequest =
        await AdminManualReviewRequest.findByIdAndUpdate(id, data, {
          new: true,
        });
      if (!adminManualReviewRequest) {
        throw new NotFoundError("Manual review request not found");
      }
      return adminManualReviewRequest;
    } catch (error) {
      logger.error("udpateAdminManualReviewRequest error", error);
      throw error;
    }
  }

  async getRenterCalendarOrders({
    userId,
    startDate,
    endDate,
    service_type,
    status,
    driverId,
  }) {
    try {
      const query = { to_id: userId };

      // Status filtering:
      if (status && status !== "all") {
        query.status = status;
      } else {
        query.status = { $in: ["accepted", "completed", "pending"] };
      }

      // Service type filtering:
      if (service_type && service_type !== "all") {
        if (
          service_type.toLowerCase() === "dumpster" ||
          service_type.toLowerCase() === "dumbster"
        ) {
          query.service_type = { $in: ["Dumbster", "Dumpster"] };
        } else {
          query.service_type = new RegExp(`^${service_type}$`, "i");
        }
      }

      // Date range filtering:
      if (startDate || endDate) {
        const start = startDate ? new Date(startDate) : new Date(0);
        const end = endDate ? new Date(endDate) : new Date("2100-01-01");
        end.setHours(23, 59, 59, 999);

        query.$and = [
          {
            $or: [
              { start_date: { $lte: end } },
              { createdAt: { $lte: end } },
            ],
          },
          {
            $or: [
              { end_date: { $gte: start } },
              {
                $and: [
                  { $or: [{ end_date: null }, { end_date: { $exists: false } }] },
                  { $or: [{ start_date: { $gte: start } }, { createdAt: { $gte: start } }] },
                ],
              },
            ],
          },
        ];
      }

      const orders = await Order.find(query)
        .populate([
          { path: "user", select: "name email phone avatar" },
          "dumbster",
          "dustbin",
          "to_id",
          "portaPotty",
          "treeRemoval",
          "junkRemoval",
          "company",
          {
            path: "assignOrder",
            populate: {
              path: "subUserDetail",
              select: "name phone avatar status",
            },
          },
        ])
        .sort({ start_date: 1, createdAt: 1 })
        .lean();

      let filteredOrders = orders;
      if (driverId && driverId !== "all") {
        filteredOrders = orders.filter((o) => {
          const subId =
            o.assignOrder?.subUserDetail?._id?.toString() ||
            o.assignOrder?.subUserDetail?.toString();
          return subId === driverId.toString();
        });
      }

      const pricedOrders = applyRolePricingToList(
        filteredOrders || [],
        PRICING_ROLES.OWNER,
      );

      const now = new Date();

      const calendarEvents = pricedOrders.map((order) => {
        const sDate = order.start_date || order.createdAt;
        const eDate = order.end_date || sDate;

        const startObj = new Date(sDate);
        const endObj = new Date(eDate);
        const diffTime = Math.abs(endObj - startObj);
        const calculatedDays = Math.max(
          1,
          Math.ceil(diffTime / (1000 * 60 * 60 * 24)),
        );
        const numDays = order.num_days || calculatedDays;

        const isMultiDay =
          order.service_type === "Dumbster" ||
          order.service_type === "Dumpster" ||
          order.service_type === "Porta Potty" ||
          endObj.toDateString() !== startObj.toDateString();

        const isOverdue = order.status === "accepted" && endObj < now;

        let daysRemaining = 0;
        if (order.status === "accepted") {
          const diffRemaining = endObj - now;
          daysRemaining = Math.ceil(diffRemaining / (1000 * 60 * 60 * 24));
        }

        let serviceType = order.service_type;
        if (serviceType === "Dumbster") serviceType = "Dumpster";

        let assetTitle = serviceType;
        if (serviceType === "Dumpster") {
          assetTitle = order.dumbster?.size
            ? `${order.dumbster.size} Yard Dumpster`
            : "Dumpster Rental";
          if (order.dustbin?.bin_number || order.dustbin?.dustbin_number) {
            assetTitle += ` (#${order.dustbin.bin_number || order.dustbin.dustbin_number})`;
          }
        } else if (serviceType === "Porta Potty") {
          assetTitle = order.portaPotty?.type
            ? `${order.portaPotty.type} Porta Potty`
            : "Porta Potty Rental";
        } else if (serviceType === "Junk Removal") {
          assetTitle = order.junkRemoval?.name || "Junk Removal Job";
        } else if (serviceType === "Tree Removal") {
          assetTitle = order.treeRemoval?.name || "Tree Removal Job";
        }

        return {
          id: order._id,
          orderId: order._id,
          title: `${assetTitle} — ${order.user?.name || "Customer"}`,
          assetTitle,
          service_type: serviceType,
          status: order.status,
          startDate: sDate,
          endDate: eDate,
          validDate: eDate,
          numDays,
          isMultiDay,
          isOverdue,
          daysRemaining,
          readyToPickup: Boolean(order.readyToPickup),
          amount: order.amount || order.price || 0,
          price: order.price || order.amount || 0,
          address: order.address || "",
          location: order.location,
          placement: {
            location: order.placementLocation || "",
            note: order.placementNote || "",
            gateCode: order.gateAccessCode || "",
            surface: order.drivewaySurfaceType || "",
            accessInstructions: order.accessInstructions || "",
            placementPhotos: order.placementPhotos || [],
          },
          customer: {
            id: order.user?._id,
            name: order.user?.name || "Customer",
            phone: order.user?.phone || "",
            email: order.user?.email || "",
            avatar: order.user?.avatar || "",
          },
          driver: order.assignOrder?.subUserDetail
            ? {
              id: order.assignOrder.subUserDetail._id,
              name: order.assignOrder.subUserDetail.name,
              phone: order.assignOrder.subUserDetail.phone,
              avatar: order.assignOrder.subUserDetail.avatar,
              status: order.assignOrder.status,
              assignmentType: order.assignOrder.assignmentType,
            }
            : null,
          assignOrderId: order.assignOrder?._id || null,
          details: {
            dumpster: order.dumbster,
            portaPotty: order.portaPotty,
            junkRemoval: order.junkRemoval,
            treeRemoval: order.treeRemoval,
            dustbin: order.dustbin,
            category: order.category,
            subCategory: order.subCategory,
          },
          createdAt: order.createdAt,
          rawOrder: order,
        };
      });

      const totalOrders = calendarEvents.length;
      const activeRentals = calendarEvents.filter(
        (e) => e.status === "accepted",
      ).length;
      const completedCount = calendarEvents.filter(
        (e) => e.status === "completed",
      ).length;
      const overdueCount = calendarEvents.filter((e) => e.isOverdue).length;

      const todayStr = now.toISOString().split("T")[0];
      const dropoffsToday = calendarEvents.filter((e) => {
        const s = new Date(e.startDate).toISOString().split("T")[0];
        return s === todayStr;
      }).length;

      const pickupsToday = calendarEvents.filter((e) => {
        const en = new Date(e.endDate).toISOString().split("T")[0];
        return en === todayStr && e.status === "accepted";
      }).length;

      const totalRevenue = calendarEvents.reduce(
        (acc, item) => acc + (Number(item.amount) || Number(item.price) || 0),
        0,
      );

      return {
        events: calendarEvents,
        summary: {
          totalOrders,
          activeRentals,
          completedCount,
          overdueCount,
          dropoffsToday,
          pickupsToday,
          totalRevenue,
        },
      };
    } catch (error) {
      logger.error("getRenterCalendarOrders error", error);
      throw error;
    }
  }

  async getRenterReportsAnalytics({
    userId,
    timeRange = "30d",
    startDate,
    endDate,
  }) {
    try {
      const providerObjectId = new mongoose.Types.ObjectId(userId);

      // Determine date bounds based on timeRange or explicit dates
      let dateFilter = null;
      const now = new Date();

      if (startDate || endDate) {
        const start = startDate ? new Date(startDate) : new Date(0);
        const end = endDate ? new Date(endDate) : new Date();
        end.setHours(23, 59, 59, 999);
        dateFilter = { $gte: start, $lte: end };
      } else if (timeRange === "7d") {
        const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        dateFilter = { $gte: start };
      } else if (timeRange === "30d") {
        const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        dateFilter = { $gte: start };
      } else if (timeRange === "90d") {
        const start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        dateFilter = { $gte: start };
      } else if (timeRange === "ytd") {
        const start = new Date(now.getFullYear(), 0, 1);
        dateFilter = { $gte: start };
      }

      const matchQuery = { to_id: providerObjectId };
      if (dateFilter) {
        matchQuery.createdAt = dateFilter;
      }

      // Execute in parallel for millisecond response times
      const [orderAgg, driverStats, ratingStats] = await Promise.all([
        // 1. Orders single-pass multi-facet aggregation
        Order.aggregate([
          { $match: matchQuery },
          {
            $facet: {
              kpiSummary: [
                {
                  $group: {
                    _id: null,
                    totalJobs: { $sum: 1 },
                    completedJobs: {
                      $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
                    },
                    activeJobs: {
                      $sum: {
                        $cond: [
                          {
                            $in: [
                              "$status",
                              ["accepted", "active", "dispatched", "en_route", "arrived"],
                            ],
                          },
                          1,
                          0,
                        ],
                      },
                    },
                    pendingJobs: {
                      $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
                    },
                    cancelledJobs: {
                      $sum: {
                        $cond: [
                          {
                            $or: [
                              { $eq: ["$status", "cancelled"] },
                              { $eq: ["$cancelation", true] },
                              { $eq: ["$cancelation_request", true] },
                            ],
                          },
                          1,
                          0,
                        ],
                      },
                    },
                    grossRevenue: {
                      $sum: {
                        $cond: [
                          { $ne: ["$status", "cancelled"] },
                          { $ifNull: ["$amount", { $ifNull: ["$price", 0] }] },
                          0,
                        ],
                      },
                    },
                    scaleOverageAmount: {
                      $sum: { $ifNull: ["$overageAmount", 0] },
                    },
                  },
                },
              ],
              byService: [
                {
                  $group: {
                    _id: { $ifNull: ["$service_type", "Dumbster"] },
                    count: { $sum: 1 },
                    revenue: {
                      $sum: {
                        $cond: [
                          { $ne: ["$status", "cancelled"] },
                          { $ifNull: ["$amount", { $ifNull: ["$price", 0] }] },
                          0,
                        ],
                      },
                    },
                  },
                },
              ],
              weeklyTrend: [
                { $match: { createdAt: { $ne: null } } },
                {
                  $group: {
                    _id: {
                      year: { $isoWeekYear: "$createdAt" },
                      week: { $isoWeek: "$createdAt" },
                    },
                    firstDate: { $min: "$createdAt" },
                    jobs: { $sum: 1 },
                    revenue: {
                      $sum: {
                        $cond: [
                          { $ne: ["$status", "cancelled"] },
                          { $ifNull: ["$amount", { $ifNull: ["$price", 0] }] },
                          0,
                        ],
                      },
                    },
                  },
                },
                { $sort: { firstDate: 1 } },
                { $limit: 12 },
              ],
              customerCohort: [
                { $match: { user: { $ne: null } } },
                { $sort: { createdAt: 1 } },
                {
                  $group: {
                    _id: "$user",
                    orderCount: { $sum: 1 },
                    totalSpend: {
                      $sum: {
                        $cond: [
                          { $ne: ["$status", "cancelled"] },
                          { $ifNull: ["$amount", { $ifNull: ["$price", 0] }] },
                          0,
                        ],
                      },
                    },
                    lastOrderAt: { $max: "$createdAt" },
                    lastServiceType: { $last: "$service_type" },
                  },
                },
                { $sort: { lastOrderAt: -1, orderCount: -1 } },
                { $limit: 20 },
                {
                  $lookup: {
                    from: "users",
                    localField: "_id",
                    foreignField: "_id",
                    as: "customerInfo",
                  },
                },
                {
                  $unwind: {
                    path: "$customerInfo",
                    preserveNullAndEmptyArrays: true,
                  },
                },
                {
                  $project: {
                    _id: 1,
                    orderCount: 1,
                    totalSpend: 1,
                    lastOrderAt: 1,
                    lastServiceType: 1,
                    name: {
                      $ifNull: [
                        "$customerInfo.name",
                        { $ifNull: ["$customerInfo.comp_name", "Valued Customer"] },
                      ],
                    },
                    email: "$customerInfo.email",
                    phone: "$customerInfo.phone",
                  },
                },
              ],
              serviceAreas: [
                { $match: { address: { $ne: null, $nin: ["", null] } } },
                {
                  $group: {
                    _id: "$address",
                    jobs: { $sum: 1 },
                    revenue: {
                      $sum: {
                        $cond: [
                          { $ne: ["$status", "cancelled"] },
                          { $ifNull: ["$amount", { $ifNull: ["$price", 0] }] },
                          0,
                        ],
                      },
                    },
                  },
                },
                { $sort: { jobs: -1 } },
                { $limit: 6 },
              ],
              equipmentBreakdown: [
                {
                  $group: {
                    _id: {
                      $cond: [
                        { $in: ["$service_type", ["Dumbster", "Dumpster"]] },
                        {
                          $ifNull: [
                            "$category",
                            { $ifNull: ["$commercialSize", "Dumpster Standard"] },
                          ],
                        },
                        { $ifNull: ["$service_type", "Unit"] },
                      ],
                    },
                    count: { $sum: 1 },
                    revenue: {
                      $sum: {
                        $cond: [
                          { $ne: ["$status", "cancelled"] },
                          { $ifNull: ["$amount", { $ifNull: ["$price", 0] }] },
                          0,
                        ],
                      },
                    },
                  },
                },
                { $sort: { count: -1 } },
                { $limit: 6 },
              ],
              payments: [
                {
                  $group: {
                    _id: { $ifNull: ["$payment_type", "stripe"] },
                    count: { $sum: 1 },
                    revenue: {
                      $sum: {
                        $cond: [
                          { $ne: ["$status", "cancelled"] },
                          { $ifNull: ["$amount", { $ifNull: ["$price", 0] }] },
                          0,
                        ],
                      },
                    },
                  },
                },
              ],
              cancellationReasons: [
                {
                  $match: {
                    $or: [
                      { status: "cancelled" },
                      { cancelation: true },
                      { cancelation_request: true },
                    ],
                  },
                },
                {
                  $group: {
                    _id: {
                      $cond: [
                        {
                          $and: [
                            { $ne: ["$reason", ""] },
                            { $ne: ["$reason", null] },
                          ],
                        },
                        "$reason",
                        "Customer Rescheduled / Order Cancelled",
                      ],
                    },
                    count: { $sum: 1 },
                  },
                },
                { $sort: { count: -1 } },
                { $limit: 5 },
              ],
            },
          },
        ]),

        // 2. Driver performance aggregation
        AssignOrder.aggregate([
          { $match: { assignBy: providerObjectId } },
          {
            $lookup: {
              from: "subuserdetails",
              localField: "subUserDetail",
              foreignField: "_id",
              as: "driver",
            },
          },
          { $unwind: { path: "$driver", preserveNullAndEmptyArrays: true } },
          {
            $lookup: {
              from: "orders",
              localField: "orderId",
              foreignField: "_id",
              as: "order",
            },
          },
          { $unwind: { path: "$order", preserveNullAndEmptyArrays: true } },
          {
            $group: {
              _id: "$subUserDetail",
              name: { $first: { $ifNull: ["$driver.name", "Field Driver"] } },
              phone: { $first: { $ifNull: ["$driver.phone", ""] } },
              status: { $first: { $ifNull: ["$driver.status", "active"] } },
              totalAssignments: { $sum: 1 },
              completedJobs: {
                $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
              },
              revenueGenerated: {
                $sum: {
                  $cond: [
                    { $eq: ["$status", "completed"] },
                    {
                      $ifNull: [
                        "$order.amount",
                        { $ifNull: ["$order.price", 0] },
                      ],
                    },
                    0,
                  ],
                },
              },
            },
          },
          { $sort: { completedJobs: -1, revenueGenerated: -1 } },
        ]),

        // 3. Ratings & CSAT
        Rating.aggregate([
          { $match: { to_id: providerObjectId } },
          {
            $lookup: {
              from: "users",
              localField: "user",
              foreignField: "_id",
              as: "reviewer",
            },
          },
          { $unwind: { path: "$reviewer", preserveNullAndEmptyArrays: true } },
          {
            $group: {
              _id: null,
              avgRating: { $avg: "$rating" },
              totalReviews: { $sum: 1 },
              reviews: {
                $push: {
                  rating: "$rating",
                  review: "$review",
                  createdAt: "$createdAt",
                  userName: { $ifNull: ["$reviewer.name", "Verified Customer"] },
                },
              },
            },
          },
        ]),
      ]);

      const facetResult = orderAgg?.[0] || {};
      const kpiRaw = facetResult.kpiSummary?.[0] || {
        totalJobs: 0,
        completedJobs: 0,
        activeJobs: 0,
        pendingJobs: 0,
        cancelledJobs: 0,
        grossRevenue: 0,
        scaleOverageAmount: 0,
      };

      const totalJobs = kpiRaw.totalJobs || 0;
      const completedJobs = kpiRaw.completedJobs || 0;
      const activeJobs = kpiRaw.activeJobs || 0;
      const cancelledJobs = kpiRaw.cancelledJobs || 0;
      const grossRevenue = Number(kpiRaw.grossRevenue || 0);
      const completionRate =
        totalJobs > 0 ? Number(((completedJobs / totalJobs) * 100).toFixed(1)) : 0;
      const cancellationRate =
        totalJobs > 0 ? Number(((cancelledJobs / totalJobs) * 100).toFixed(1)) : 0;

      // P&L benchmark calculations based on real gross revenue
      const landfillCosts = Math.round(grossRevenue * 0.196);
      const driverPayroll = Math.round(grossRevenue * 0.145);
      const fuelMaintenance = Math.round(grossRevenue * 0.05);
      const operatingExpenses = landfillCosts + driverPayroll + fuelMaintenance;
      const netProfit = grossRevenue - operatingExpenses;
      const netMargin =
        grossRevenue > 0
          ? Number(((netProfit / grossRevenue) * 100).toFixed(1))
          : 0;

      // Service category breakdown format
      const rawByService = facetResult.byService || [];
      const serviceMap = {
        dumpster: { count: 0, rev: 0 },
        porta: { count: 0, rev: 0 },
        tree: { count: 0, rev: 0 },
        junk: { count: 0, rev: 0 },
      };

      rawByService.forEach((item) => {
        const idLower = String(item._id || "").toLowerCase();
        const price = Number(item.revenue || 0);
        const count = Number(item.count || 0);
        if (
          idLower.includes("dump") ||
          idLower.includes("dumb") ||
          idLower.includes("bin")
        ) {
          serviceMap.dumpster.count += count;
          serviceMap.dumpster.rev += price;
        } else if (idLower.includes("porta") || idLower.includes("potty")) {
          serviceMap.porta.count += count;
          serviceMap.porta.rev += price;
        } else if (idLower.includes("tree")) {
          serviceMap.tree.count += count;
          serviceMap.tree.rev += price;
        } else if (idLower.includes("junk")) {
          serviceMap.junk.count += count;
          serviceMap.junk.rev += price;
        }
      });

      const totalServiceRev =
        serviceMap.dumpster.rev +
        serviceMap.porta.rev +
        serviceMap.tree.rev +
        serviceMap.junk.rev;

      const formattedServices = [
        {
          name: "Dumpster Rentals",
          key: "dumpster",
          count: serviceMap.dumpster.count,
          rev: Math.round(serviceMap.dumpster.rev),
          pct:
            totalServiceRev > 0
              ? Number(((serviceMap.dumpster.rev / totalServiceRev) * 100).toFixed(1))
              : 0,
          color: "#0ea5e9",
        },
        {
          name: "Porta Potty Rentals",
          key: "porta",
          count: serviceMap.porta.count,
          rev: Math.round(serviceMap.porta.rev),
          pct:
            totalServiceRev > 0
              ? Number(((serviceMap.porta.rev / totalServiceRev) * 100).toFixed(1))
              : 0,
          color: "#8b5cf6",
        },
        {
          name: "Tree Removal Services",
          key: "tree",
          count: serviceMap.tree.count,
          rev: Math.round(serviceMap.tree.rev),
          pct:
            totalServiceRev > 0
              ? Number(((serviceMap.tree.rev / totalServiceRev) * 100).toFixed(1))
              : 0,
          color: "#10b981",
        },
        {
          name: "Junk Removal Services",
          key: "junk",
          count: serviceMap.junk.count,
          rev: Math.round(serviceMap.junk.rev),
          pct:
            totalServiceRev > 0
              ? Number(((serviceMap.junk.rev / totalServiceRev) * 100).toFixed(1))
              : 0,
          color: "#f59e0b",
        },
      ];

      // Weekly trend format for Apex Charts
      const rawTrend = facetResult.weeklyTrend || [];
      const trendCategories = rawTrend.map((t, idx) => `Week ${idx + 1}`);
      const trendRevenue = rawTrend.map((t) => Math.round(Number(t.revenue || 0)));
      const trendExpenses = trendRevenue.map((r) => Math.round(r * 0.391)); // 39.1% total opex

      // Customer retention calculation & Automated Follow-Up Reminders
      const customers = facetResult.customerCohort || [];
      const totalUniqueCustomers = customers.length;
      const repeatCustomers = customers.filter((c) => c.orderCount > 1).length;
      const repeatBookingRate =
        totalUniqueCustomers > 0
          ? Number(((repeatCustomers / totalUniqueCustomers) * 100).toFixed(1))
          : 0;
      const avgCustomerLTV =
        totalUniqueCustomers > 0
          ? Math.round(grossRevenue / totalUniqueCustomers)
          : 0;

      const followUpReminders = customers.map((c) => {
        const lastDate = c.lastOrderAt ? new Date(c.lastOrderAt) : new Date();
        const daysAgo = Math.max(
          0,
          Math.floor((now - lastDate) / (1000 * 60 * 60 * 24)),
        );
        const service = c.lastServiceType || "Dumpster";
        let status = "recent";
        let badge = "Recent Customer";
        if (daysAgo >= 60) {
          status = "due_60";
          badge = "60d+ Follow-Up Due";
        } else if (daysAgo >= 30) {
          status = "due_30";
          badge = "30d+ Warm Re-engagement";
        }

        let pitch = `Hi ${c.name}, checking in from BINS Dumpster! Need any upcoming dumpster rental or junk removal services? We're ready to help!`;
        const svcLower = service.toLowerCase();
        if (svcLower.includes("junk")) {
          pitch = `Hi ${c.name}, it's been ${daysAgo} days since your last junk removal job. Having any new seasonal cleanouts or clutter? Book with us this week and get priority dispatch!`;
        } else if (svcLower.includes("dump") || svcLower.includes("dumb")) {
          pitch = `Hi ${c.name}, need another roll-off dumpster for an upcoming renovation or cleanout project? We have bins available for quick delivery!`;
        } else if (svcLower.includes("tree")) {
          pitch = `Hi ${c.name}, checking in after your tree removal! Let us know if you need any seasonal branch trimming or debris hauling.`;
        } else if (svcLower.includes("porta") || svcLower.includes("potty")) {
          pitch = `Hi ${c.name}, planning any upcoming job sites or events? We have fresh sanitized portable restrooms ready for drop-off.`;
        }

        return {
          id: c._id,
          name: c.name || "Customer Account",
          email: c.email || "",
          phone: c.phone || "",
          orderCount: c.orderCount,
          count: `${c.orderCount} Jobs`,
          spend: Math.round(c.totalSpend || 0),
          lastOrderAt: c.lastOrderAt,
          lastServiceType: service,
          daysAgo,
          status,
          badge,
          suggestedPitch: pitch,
        };
      });

      // Driver performance table
      const formattedDrivers = (driverStats || []).map((d) => {
        const total = d.totalAssignments || 0;
        const comp = d.completedJobs || 0;
        const rate = total > 0 ? ((comp / total) * 100).toFixed(1) : "100.0";
        return {
          id: d._id,
          name: d.name || "Field Driver",
          phone: d.phone,
          status: d.status,
          jobs: comp,
          rev: Math.round(d.revenueGenerated || 0),
          onTime: `${rate}%`,
          rating: "5.0 ★",
        };
      });

      // Service areas
      const formattedAreas = (facetResult.serviceAreas || []).map((a) => {
        const jobs = a.jobs || 0;
        const rev = Math.round(Number(a.revenue || 0));
        const avg = jobs > 0 ? Math.round(rev / jobs) : 0;
        return {
          zone: String(a._id || "Local Delivery Area").slice(0, 36),
          jobs,
          rev,
          avg,
        };
      });

      // Equipment / Units
      const formattedEquipment = (facetResult.equipmentBreakdown || []).map((eq) => {
        const count = eq.count || 0;
        const rev = Math.round(Number(eq.revenue || 0));
        return {
          unit: eq._id ? `${eq._id}` : "Standard Equipment",
          deployed: count,
          rev,
          utilization: `${Math.min(95, 70 + count * 5)}%`,
        };
      });

      // Payment settlement
      const rawPayments = facetResult.payments || [];
      let settledStripe = 0;
      let net30Invoice = 0;
      rawPayments.forEach((p) => {
        const type = String(p._id || "").toLowerCase();
        const rev = Math.round(Number(p.revenue || 0));
        if (type === "stripe" || type === "card" || type === "wallet") {
          settledStripe += rev;
        } else if (type === "invoice") {
          net30Invoice += rev;
        }
      });

      // Ratings & CSAT
      const ratingRaw = ratingStats?.[0] || {};
      const avgRating = ratingRaw.avgRating
        ? Number(Number(ratingRaw.avgRating).toFixed(1))
        : 5.0;
      const totalReviews = ratingRaw.totalReviews || 0;
      const topReviews = (ratingRaw.reviews || []).slice(0, 3);

      return {
        timeRange,
        kpi: {
          totalJobs,
          completed: completedJobs,
          active: activeJobs,
          cancelled: cancelledJobs,
          completionRate,
          cancellationRate,
          grossRevenue: Math.round(grossRevenue),
          operatingExpenses,
          netProfit,
          netMargin,
          landfillCosts,
          driverPayroll,
          fuelMaintenance,
          scaleOverageAmount: Math.round(kpiRaw.scaleOverageAmount || 0),
        },
        services: {
          items: formattedServices,
          series: formattedServices.map((s) => s.rev),
          labels: formattedServices.map((s) => s.name),
        },
        trend: {
          categories:
            trendCategories.length > 0
              ? trendCategories
              : ["Week 1", "Week 2", "Week 3", "Week 4"],
          revenueSeries:
            trendRevenue.length > 0 ? trendRevenue : [0, 0, 0, 0],
          expenseSeries:
            trendExpenses.length > 0 ? trendExpenses : [0, 0, 0, 0],
        },
        retention: {
          repeatBookingRate,
          avgCustomerLTV,
          totalUniqueCustomers,
          topAccounts: followUpReminders.slice().sort((a, b) => b.spend - a.spend).slice(0, 5),
          followUpReminders: followUpReminders.slice().sort((a, b) => b.daysAgo - a.daysAgo),
        },
        drivers: formattedDrivers,
        serviceAreas: formattedAreas,
        equipment: formattedEquipment,
        invoicing: {
          settledPayouts: settledStripe,
          net30Invoices: net30Invoice,
          scaleOverweightFees: Math.round(kpiRaw.scaleOverageAmount || 0),
          overdueAmount: Math.round(net30Invoice * 0.05),
        },
        ratings: {
          overallRating: avgRating,
          verifiedReviewsCount: totalReviews,
          recentReviews: topReviews,
        },
        cancellations: {
          reasons: facetResult.cancellationReasons || [],
        },
      };
    } catch (error) {
      logger.error("getRenterReportsAnalytics error", error);
      throw error;
    }
  }

  async getRenterCustomersDirectory({
    userId,
    search = "",
    tab = "all",
    limit = 10,
    page = 1,
  }) {
    try {
      const providerObjectId = new mongoose.Types.ObjectId(userId);
      const now = Date.now();

      // Single-pass aggregation of all unique customers served by this provider
      const customersRaw = await Order.aggregate([
        { $match: { to_id: providerObjectId, user: { $ne: null } } },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: "$user",
            orderCount: { $sum: 1 },
            completedCount: {
              $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
            },
            activeCount: {
              $sum: {
                $cond: [
                  {
                    $in: [
                      "$status",
                      ["accepted", "active", "dispatched", "en_route", "arrived", "pending"],
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            totalSpend: {
              $sum: {
                $cond: [
                  { $ne: ["$status", "cancelled"] },
                  { $ifNull: ["$amount", { $ifNull: ["$price", 0] }] },
                  0,
                ],
              },
            },
            lastOrderAt: { $max: "$createdAt" },
            firstOrderAt: { $min: "$createdAt" },
            lastServiceType: { $first: "$service_type" },
            addresses: {
              $addToSet: {
                $cond: [
                  {
                    $and: [
                      { $ne: ["$address", null] },
                      { $ne: ["$address", ""] },
                    ],
                  },
                  "$address",
                  "$$REMOVE",
                ],
              },
            },
            recentOrders: {
              $push: {
                orderId: "$_id",
                status: "$status",
                price: { $ifNull: ["$amount", { $ifNull: ["$price", 0] }] },
                serviceType: { $ifNull: ["$service_type", "Dumpster"] },
                createdAt: "$createdAt",
                address: "$address",
              },
            },
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "customerInfo",
          },
        },
        { $unwind: { path: "$customerInfo", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 1,
            orderCount: 1,
            completedCount: 1,
            activeCount: 1,
            totalSpend: 1,
            lastOrderAt: 1,
            firstOrderAt: 1,
            lastServiceType: 1,
            addresses: 1,
            recentOrders: { $slice: ["$recentOrders", 5] },
            name: {
              $ifNull: [
                "$customerInfo.name",
                { $ifNull: ["$customerInfo.comp_name", "Customer Account"] },
              ],
            },
            compName: { $ifNull: ["$customerInfo.comp_name", ""] },
            email: { $ifNull: ["$customerInfo.email", ""] },
            profilePic: {
              $ifNull: [
                "$customerInfo.profilePicture",
                {
                  $ifNull: [
                    "$customerInfo.photoUrl",
                    {
                      $ifNull: [
                        "$customerInfo.profile_picture",
                        {
                          $ifNull: [
                            "$customerInfo.image",
                            { $ifNull: ["$customerInfo.avatar", ""] },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        },
      ]);

      // Calculate days ago, retention status, and contextual pitch for each client
      let allEnriched = customersRaw.map((c) => {
        const lastDate = c.lastOrderAt ? new Date(c.lastOrderAt) : new Date();
        const daysAgo = Math.max(
          0,
          Math.floor((now - lastDate.getTime()) / (1000 * 60 * 60 * 24))
        );
        const service = c.lastServiceType || "Dumpster";
        const svcLower = service.toLowerCase();

        let statusKey = "regular";
        let statusBadge = "Active Account";
        const followupDue = daysAgo >= 30;

        if (daysAgo >= 60) {
          statusKey = "due_60";
          statusBadge = "60d+ Follow-Up Due";
        } else if (daysAgo >= 30) {
          statusKey = "due_30";
          statusBadge = "30d+ Warm Re-engagement";
        } else if (c.orderCount > 1 || c.totalSpend >= 500) {
          statusKey = "vip";
          statusBadge = "VIP Repeat Client";
        } else if (daysAgo <= 7) {
          statusKey = "new_recent";
          statusBadge = "Recent Active";
        }

        const isCommercial =
          Boolean(c.compName && c.compName.trim().length > 0) ||
          c.orderCount >= 3 ||
          c.totalSpend >= 1000;

        let pitch = `Hi ${c.name}, checking in from BINS Dumpster! Need any upcoming dumpster rental or waste management services? We have units available for priority dispatch!`;
        if (svcLower.includes("junk")) {
          pitch = `Hi ${c.name}, it's been ${daysAgo} days since your last junk removal job. Having any new seasonal cleanouts or clutter? Book with us this week and get priority dispatch!`;
        } else if (svcLower.includes("dump") || svcLower.includes("dumb")) {
          pitch = `Hi ${c.name}, need another roll-off dumpster for an upcoming renovation or cleanout project? We have bins available for quick delivery!`;
        } else if (svcLower.includes("tree")) {
          pitch = `Hi ${c.name}, checking in after your tree removal! Let us know if you need any seasonal branch trimming or debris hauling.`;
        } else if (svcLower.includes("porta") || svcLower.includes("potty")) {
          pitch = `Hi ${c.name}, planning any upcoming job sites or events? We have fresh sanitized portable restrooms ready for drop-off.`;
        }

        return {
          id: c._id,
          name: c.name,
          compName: c.compName,
          email: c.email,
          phone: c.phone,
          profilePic: c.profilePic,
          orderCount: c.orderCount,
          completedCount: c.completedCount,
          activeCount: c.activeCount,
          totalSpend: Math.round(c.totalSpend || 0),
          lastOrderAt: c.lastOrderAt,
          firstOrderAt: c.firstOrderAt,
          daysAgo,
          lastServiceType: service,
          addresses: (c.addresses || []).filter(Boolean),
          recentOrders: c.recentOrders || [],
          statusKey,
          statusBadge,
          followupDue,
          isCommercial,
          suggestedPitch: pitch,
        };
      });

      // Global CRM KPIs
      const totalCustomers = allEnriched.length;
      const followupsDueCount = allEnriched.filter((c) => c.followupDue).length;
      const repeatCustomersCount = allEnriched.filter((c) => c.orderCount > 1).length;
      const commercialCount = allEnriched.filter((c) => c.isCommercial).length;
      const totalLifetimeRev = allEnriched.reduce((sum, c) => sum + c.totalSpend, 0);
      const repeatRate =
        totalCustomers > 0
          ? Number(((repeatCustomersCount / totalCustomers) * 100).toFixed(1))
          : 0;
      const avgCustomerLTV =
        totalCustomers > 0 ? Math.round(totalLifetimeRev / totalCustomers) : 0;

      // Filter by search query if provided
      if (search && search.trim()) {
        const query = search.trim().toLowerCase();
        allEnriched = allEnriched.filter(
          (c) =>
            (c.name && c.name.toLowerCase().includes(query)) ||
            (c.compName && c.compName.toLowerCase().includes(query)) ||
            (c.email && c.email.toLowerCase().includes(query)) ||
            (c.phone && c.phone.includes(query)) ||
            (c.addresses && c.addresses.some((a) => a.toLowerCase().includes(query)))
        );
      }

      // Filter by tab
      if (tab === "followups") {
        allEnriched = allEnriched
          .filter((c) => c.followupDue)
          .sort((a, b) => b.daysAgo - a.daysAgo);
      } else if (tab === "repeat") {
        allEnriched = allEnriched
          .filter((c) => c.orderCount > 1 || c.totalSpend >= 500)
          .sort((a, b) => b.totalSpend - a.totalSpend);
      } else if (tab === "commercial") {
        allEnriched = allEnriched
          .filter((c) => c.isCommercial)
          .sort((a, b) => b.totalSpend - a.totalSpend);
      } else if (tab === "recent") {
        allEnriched = allEnriched
          .filter((c) => c.daysAgo <= 30)
          .sort((a, b) => a.daysAgo - b.daysAgo);
      } else {
        // 'all' default sort: latest active first
        allEnriched.sort((a, b) => new Date(b.lastOrderAt) - new Date(a.lastOrderAt));
      }

      const totalFiltered = allEnriched.length;
      const currentPage = Math.max(1, parseInt(page, 10) || 1);
      const perPage = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));
      const totalPages = Math.ceil(totalFiltered / perPage) || 1;
      const startIndex = (currentPage - 1) * perPage;
      const paginatedCustomers = allEnriched.slice(startIndex, startIndex + perPage);

      return {
        summary: {
          totalCustomers,
          followupsDueCount,
          repeatCustomersCount,
          commercialCount,
          repeatRate,
          avgCustomerLTV,
          totalLifetimeRev,
        },
        customers: paginatedCustomers,
        pagination: {
          page: currentPage,
          limit: perPage,
          totalPages,
          totalCount: totalFiltered,
          hasNextPage: currentPage < totalPages,
          hasPrevPage: currentPage > 1,
        },
        totalFiltered,
      };
    } catch (error) {
      logger.error("getRenterCustomersDirectory error", error);
      throw error;
    }
  }

  async getRenterCustomerDetail({ userId, customerId }) {
    try {
      const providerObjectId = new mongoose.Types.ObjectId(userId);
      const customerObjectId = new mongoose.Types.ObjectId(customerId);
      const now = Date.now();

      // Fetch customer user record
      const customerUser = await User.findById(customerObjectId)
        .select(
          "name comp_name email phone profilePicture photoUrl image avatar createdAt location city state country address"
        )
        .lean();

      if (!customerUser) {
        throw new NotFoundError("Customer account not found");
      }

      // Fetch all orders for this customer fulfilled by this provider
      const orders = await Order.find({
        to_id: providerObjectId,
        user: customerObjectId,
      })
        .sort({ createdAt: -1 })
        .populate("dumbster")
        .populate("junkRemoval")
        .populate("treeRemoval")
        .populate("portaPotty")
        .lean();

      let totalSpend = 0;
      let completedCount = 0;
      let activeCount = 0;
      let pendingCount = 0;
      let cancelledCount = 0;
      const addressesSet = new Set();

      const enrichedOrders = orders.map((o) => {
        const orderAmount = Number(o.amount || o.price || o.total_price || 0);
        if (o.status !== "cancelled") {
          totalSpend += orderAmount;
        }

        if (o.status === "completed") {
          completedCount += 1;
        } else if (o.status === "pending") {
          pendingCount += 1;
        } else if (o.status === "cancelled") {
          cancelledCount += 1;
        } else {
          activeCount += 1;
        }

        if (o.address) {
          addressesSet.add(o.address);
        }

        const isCompleted = o.status === "completed";
        const isCancelled = o.status === "cancelled";
        const isAccepted = ["accepted", "active", "dispatched", "completed"].includes(o.status);
        const isOnWay = Boolean(o.onway || o.driveaway || isCompleted);
        const isDelivered = Boolean(o.readyToPickup || o.dropoffimage || isCompleted);

        const timeline = [
          {
            key: "created",
            label: "Order Placed",
            description: "Customer submitted booking request",
            date: o.createdAt,
            completed: true,
          },
          {
            key: "confirmed",
            label: "Confirmed by Operator",
            description: isCancelled ? "Order was cancelled" : "Booking accepted & scheduled",
            date: o.createdAt,
            completed: isAccepted || isCompleted,
          },
          {
            key: "dispatched",
            label: "Dispatched / En Route",
            description: "Driver dispatched to job site",
            date: o.start_date || o.createdAt,
            completed: isOnWay,
          },
          {
            key: "service",
            label: "Service Active / Delivered",
            description: "Equipment on site / work in progress",
            date: o.start_date || o.createdAt,
            completed: isDelivered,
          },
          {
            key: "completed",
            label: "Completed & Settled",
            description: "Bin hauled / job finished & invoiced",
            date: o.end_date || o.updatedAt || o.createdAt,
            completed: isCompleted,
          },
        ];

        return {
          id: o._id,
          orderNumber: String(o._id).slice(-6).toUpperCase(),
          serviceType: o.service_type || "Dumpster",
          status: o.status || "pending",
          price: orderAmount,
          address: o.address || "Job Site Location",
          createdAt: o.createdAt,
          startDate: o.start_date,
          endDate: o.end_date,
          numDays: o.num_days || 1,
          paymentType: o.payment_type || "stripe",
          paymentId: o.paymentId,
          driveaway: o.driveaway,
          onway: o.onway,
          readyToPickup: o.readyToPickup,
          images: o.images || [],
          dropoffimage: o.dropoffimage,
          details: o.dumbster || o.junkRemoval || o.treeRemoval || o.portaPotty || null,
          timeline,
        };
      });

      const orderCount = orders.length;
      const lastOrder = orders[0];
      const firstOrder = orders[orders.length - 1];
      const lastDate = lastOrder?.createdAt ? new Date(lastOrder.createdAt) : new Date();
      const daysAgo = Math.max(0, Math.floor((now - lastDate.getTime()) / (1000 * 60 * 60 * 24)));

      let statusBadge = "Active Account";
      if (daysAgo >= 60) statusBadge = "60d+ Follow-Up Due";
      else if (daysAgo >= 30) statusBadge = "30d+ Warm Re-engagement";
      else if (orderCount > 1 || totalSpend >= 500) statusBadge = "VIP Repeat Client";
      else if (daysAgo <= 7) statusBadge = "Recent Active";

      const profilePic =
        customerUser.profilePicture ||
        customerUser.photoUrl ||
        customerUser.image ||
        customerUser.avatar ||
        "";

      return {
        customer: {
          id: customerUser._id,
          name: customerUser.name || customerUser.comp_name || "Customer Account",
          compName: customerUser.comp_name || "",
          email: customerUser.email || "",
          phone: customerUser.phone || "",
          profilePic,
          memberSince: customerUser.createdAt,
          address: customerUser.address || "",
          city: customerUser.city || "",
          state: customerUser.state || "",
          country: customerUser.country || "",
          addresses: Array.from(addressesSet),
          statusBadge,
          daysAgo,
          isCommercial: Boolean(customerUser.comp_name) || orderCount >= 3 || totalSpend >= 1000,
        },
        stats: {
          totalSpend: Math.round(totalSpend),
          orderCount,
          completedCount,
          activeCount,
          pendingCount,
          cancelledCount,
          firstOrderAt: firstOrder?.createdAt,
          lastOrderAt: lastOrder?.createdAt,
          lastServiceType: lastOrder?.service_type || "Dumpster",
        },
        orders: enrichedOrders,
      };
    } catch (error) {
      logger.error("getRenterCustomerDetail error", error);
      throw error;
    }
  }

  static async markOrderReadyToPickup({
    orderId,
    userId,
    user,
    requestType = "routine",
    requestedByName,
    requestedByRole = "Superintendent",
    notes = "",
  }) {
    const order = await Order.findById(orderId).populate([
      "user",
      "to_id",
      {
        path: "assignOrder",
        populate: {
          path: "subUserDetail",
        },
      },
    ]);
    if (!order) {
      throw new NotFoundError("Order not found");
    }

    order.readyToPickup = true;
    if (!order.pickupWorkflow) {
      order.pickupWorkflow = {};
    }
    order.pickupWorkflow.status = "ready";
    order.pickupWorkflow.requestedAt = new Date();
    order.pickupWorkflow.requestedBy = userId || order.user?._id || order.user;
    order.pickupWorkflow.requestedByName =
      requestedByName || user?.name || order.user?.name || "Superintendent";
    order.pickupWorkflow.requestedByRole = requestedByRole;
    order.pickupWorkflow.requestType = requestType;
    order.pickupWorkflow.requestNotes = notes;
    await order.save();

    const pickupCopy = orderMessages.readyForPickup({
      customerName: order.user?.name,
      serviceType: order.service_type,
      order,
    });

    await OrderTimeline.create({
      order: order._id,
      orderDeatil: order,
      ...timelineEntry(pickupCopy),
    });

    const notifyPromises = [
      sendNotification({
        user: order.user._id.toString(),
        to_id: order.to_id._id.toString(),
        description: pickupCopy.operator.description,
        type: "order",
        title: pickupCopy.operator.title,
        fcmtoken: order.to_id.fcmtoken,
        order: orderId,
        noti: false,
        email: "",
      }),
      sendNotification({
        user: order.user._id.toString(),
        to_id: order.user._id.toString(),
        description: pickupCopy.customer.description,
        type: "order",
        title: pickupCopy.customer.title,
        fcmtoken: order.user.fcmtoken,
        order: orderId,
        noti: false,
        email: "",
      }),
    ];

    if (order.assignOrder?.subUserDetail?._id) {
      notifyPromises.push(
        sendNotification({
          user: order.user._id.toString(),
          to_id: order.assignOrder.subUserDetail._id.toString(),
          description: pickupCopy.operator.description,
          type: "order",
          title: pickupCopy.operator.title,
          fcmtoken: order.assignOrder.subUserDetail?.fcmtoken || "",
          order: orderId,
          noti: false,
          email: "",
        }),
      );
    }

    Promise.all(notifyPromises).catch((err) =>
      logger.error("Ready-to-pickup REST notification failed", err),
    );

    try {
      if (io) {
        io.to(`user_${order.user._id.toString()}`).emit("update-order-rentee", {
          success: true,
          order: formatOrderPayload(order, PRICING_ROLES.CUSTOMER),
          title: pickupCopy.customer.title,
          message: pickupCopy.customer.description,
        });
        io.to(`user_${order.to_id._id.toString()}`).emit("update-order-renter", {
          success: true,
          order: formatOrderPayload(order, PRICING_ROLES.OWNER),
          title: pickupCopy.operator.title,
          message: pickupCopy.operator.description,
        });
      }
    } catch (sockErr) {
      logger.warn("Socket broadcast on ready-to-pickup REST fallback", sockErr);
    }

    return order;
  }
}

export default OrderService;

