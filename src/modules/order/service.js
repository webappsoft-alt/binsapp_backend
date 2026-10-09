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
}

export default OrderService;
