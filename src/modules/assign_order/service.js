import {
  NotFoundError,
  UnauthorizedError,
  BadRequestError,
  ForbiddenError,
} from "../../utils/apiError.js";
import { AssignOrder, SubUserDetail } from "../../models/AssignOrder.js";
import { sendNotification } from "../../utils/notifications.js";
import Support from "../../models/Support.js";
import { generateAccessToken } from "../../utils/Generator.js";
import logger from "../../config/logger.js";
import { connectedUsers, io } from "../../socket/socket.js";
import Order from "../../models/Order.js";
import User from "../../models/User.js";
import twilio from "twilio";
import Dustbin from "../../models/Dustbin.js";
import JunkRemoval from "../../models/JunkRemoval.js";
import TreeRemoval from "../../models/TreeRemoval.js";
import Stripe from "stripe";
import config from "../../config/env.js";
import { sendOrderEmailToUser } from "../../utils/emailservice.js";
import TransactionModel from "../../models/Transaction.js";
import OrderTimeline from "../../models/OrderTimeline.js";
import { computeSplit, captureHold } from "../../utils/paymentHold.js";
import orderMessages, { timelineEntry } from "../../utils/orderMessages.js";
import {
  buttonTemplate,
  orderAssignedDriverTemplate,
} from "../../utils/emailTemplate.js";
import {
  formatAssignOrderDetailsResponse,
  formatAssignOrderList,
  formatOrderPayload,
  PRICING_ROLES,
} from "../../utils/orderPricing.js";
import { sendEmail } from "../../utils/emailHelper.js";
import mongoose from "mongoose";
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const serviceSid = process.env.TWILIO_SERVICE_SID;
const client = twilio(accountSid, authToken);
const stripe = new Stripe(config.get("stripe.secretKey"));

function normalizeServiceType(serviceType) {
  const raw = String(serviceType || "Dumbster").trim();
  const aliases = {
    dumbster: "Dumbster",
    dumpster: "Dumbster",
    "porta potty": "Porta Potty",
    portapotty: "Porta Potty",
    "junk removal": "Junk Removal",
    junkremoval: "Junk Removal",
    "tree removal": "Tree Removal",
    treeremoval: "Tree Removal",
  };
  return aliases[raw.toLowerCase()] || raw;
}

class AssignOrderService {
  async createAssignOrder(assignBy, data) {
    try {
      const { subUserDetail, orderId } = data;
      const order = await Order.findOne({
        _id: orderId,
        to_id: assignBy,
      });
      const user = await User.findOne({ phone: subUserDetail.phone }).lean();
      // console.log(user);
      if (user) {
        throw new BadRequestError("Phone number already exists");
      }
      if (!order) {
        throw new NotFoundError("Order not found");
      }
      if (order.status !== "accepted") {
        throw new BadRequestError("Order is not accepted");
      }
      const findSubUser = await SubUserDetail.findOne({
        phone: subUserDetail.phone,
      });
      let subUser;
      if (findSubUser) {
        subUser = findSubUser;
        const CheckOder = await AssignOrder.findOne({
          subUserDetail: findSubUser._id,
          status: "assigned",
        });
        if (CheckOder) {
          throw new BadRequestError("Order already assigned to this sub user");
        }
      } else {
        subUser = await SubUserDetail.create(subUserDetail);
      }
      const assignOrder = await AssignOrder.create({
        subUserDetail: subUser._id,
        orderId: order._id,
        assignBy,
        status: "assigned",
      });
      order.assignOrder = assignOrder._id;
      await order.save();
      await OrderTimeline.create({
        order: order._id,
        orderDeatil: order,
        message: "Order assigned successfully!",
      });
      const assignLink = `https://api.binsapp.ai/assign-driver?token=${assignOrder._id}`;
      const driverName = subUserDetail.name || "Driver";

      Promise.all([
        this.sendMessage(
          `You've been assigned a new order. Tap the link below to view the details and start your route: ${assignLink}`,
          subUserDetail.phone,
        ),
        sendEmail({
          to: subUserDetail.email,
          subject: "New Order Assigned - BINS APP",
          html: orderAssignedDriverTemplate({
            assignLink,
            driverName,
            orderNumber: order._id?.toString()?.slice(-6)?.toUpperCase(),
            serviceType: order.service_type || "Bin Service",
            address: order.address || "",
            deliveryDate: order.start_date
              ? new Date(order.start_date).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : "",
          }),
        }),
      ]);
      return assignOrder;
    } catch (error) {
      logger.error(error);
      throw error;
    }
  }
  async getAssignOrder(_id) {
    try {
      const assignOrder = await AssignOrder.findOne({
        _id,
      }).populate([
        "subUserDetail",
        {
          path: "orderId",
          populate: {
            path: ["user", "dumbster", "dustbin"],
          },
        },
        "assignBy",
      ]);
      if (!assignOrder) {
        throw new NotFoundError("Assign Order not found");
      }
      const token = generateAccessToken({
        _id: assignOrder._id,
        subUserDetail: assignOrder.subUserDetail,
        orderId: assignOrder.orderId._id,
        assignBy: assignOrder.assignBy._id,
        status: assignOrder.status,
        assignOrder: true,
      });
      return formatAssignOrderDetailsResponse(
        {
          details: assignOrder,
          token,
        },
        PRICING_ROLES.OWNER,
      );
    } catch (error) {
      logger.error(error);
      throw error;
    }
  }
  async getAssignOrders(assignBy) {
    try {
      const assignOrders = await AssignOrder.find({
        assignBy: assignBy,
        status: "assigned",
      })
        .populate([
          "subUserDetail",
          {
            path: "orderId",
            populate: {
              path: ["user", "dumbster", "dustbin"],
            },
          },
        ])
        .lean();
      return formatAssignOrderList(assignOrders, PRICING_ROLES.OWNER);
    } catch (error) {
      logger.error(error);
      throw error;
    }
  }
  async updateOnItsWay(orderId) {
    console.log(orderId);
    const assignOrder = await AssignOrder.findOne({
      orderId: orderId,
      status: "assigned",
    });
    if (!assignOrder) {
      throw new NotFoundError("Assign Order not found");
    }
    if (assignOrder.status !== "assigned") {
      throw new BadRequestError("Assign Order is not assigned");
    }

    const updatedSession = await Order.findOne({
      _id: orderId,
      status: "accepted",
      to_id: assignOrder.assignBy,
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
      user: assignOrder.assignBy,
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
  async getAssignySubUser(assignBy) {
    try {
      const assignOrders = await AssignOrder.find({ assignBy: assignBy })
        .select("subUserDetail")
        .lean();
      const subUserIds = assignOrders.map((order) => order.subUserDetail);
      const subUsers = await SubUserDetail.find({ _id: { $in: subUserIds } });
      return subUsers;
    } catch (error) {
      logger.error(error);
      throw error;
    }
  }
  async completeOrderAssignUser(orderId, senderId) {
    const updatedSession = await Order.findOne({
      _id: orderId,
      status: "accepted",
      to_id: senderId,
    })
      .populate("to_id")
      .populate("user")
      .populate("dumbster")
      .populate("dustbin")
      .populate("junkRemoval")
      .populate("treeRemoval");

    if (updatedSession == null) {
      throw new NotFoundError("Order not found.");
    }

    await this.releaseServiceBooking(updatedSession);

    // Owner payout: add-ons (driveway/insurance) go 100% to admin, and the
    // 15% platform commission applies to the remaining base only.
    const { amount, privacyAmount } = computeSplit(updatedSession.price, {
      driveaway: updatedSession.driveaway,
      cancelation: updatedSession.cancelation,
    });

    try {
      const alreadySettled = updatedSession.transfer === true;

      if (!alreadySettled && updatedSession.to_id.accountId) {
        // Ensure the customer's funds are captured onto the platform before
        // paying the owner out. Capture is idempotent (returns alreadyCaptured
        // if it was already captured at accept-time).
        let captured = true;
        if (
          updatedSession.payment_type !== "wallet" &&
          updatedSession.paymentId
        ) {
          const captureResult = await captureHold(updatedSession.paymentId);
          captured =
            captureResult.success === true ||
            captureResult.alreadyCaptured === true;
          if (!captured) {
            logger.error(
              "Capture failed on assign-order completion",
              captureResult.message,
            );
          }
        }

        if (captured) {
          const transfer = await stripe.transfers.create({
            amount: Math.round(Number(amount) * 100),
            currency: "usd",
            destination: updatedSession.to_id.accountId,
            transfer_group: updatedSession._id.toString(),
          });
          if (transfer.id) {
            updatedSession.transferId = transfer.id;
            updatedSession.transfer = true;
            await TransactionModel.create({
              user: updatedSession.to_id._id,
              order: updatedSession._id,
              amount: amount,
              stripePaymentIntentId: null,
              type: "credit",
              metadata: {
                reason: "Payment for order",
                orderId: updatedSession._id,
                service_type: normalizeServiceType(updatedSession.service_type),
                dumbsterId: updatedSession.dumbster?._id,
                dustbinId: updatedSession.dustbin?._id,
                junkRemovalId: updatedSession.junkRemoval?._id,
                treeRemovalId: updatedSession.treeRemoval?._id,
                price: updatedSession.price,
                privacyAmount: privacyAmount,
                amount: amount,
              },
            });
          } else {
            updatedSession.transfer = false;
          }
        } else {
          updatedSession.transfer = false;
        }
      } else if (!alreadySettled) {
        updatedSession.transfer = false;
      }
    } catch (error) {
      logger.error("Stripe transfer failed:", error);
      updatedSession.transfer = false;
    }
    const status = "completed";
    updatedSession.status = status;
    await updatedSession.save();
    await OrderTimeline.create({
      order: updatedSession._id,
      orderDeatil: updatedSession,
      message: "Order completed successfully!",
    });
    await User.findByIdAndUpdate(senderId, {
      $inc: {
        "ordersDetails.completed": 1,
        "ordersDetails.accepted": -1,
      },
    });
    await sendNotification({
      user: senderId,
      to_id: updatedSession.user._id.toString(),
      description:
        `Your Order has been ${status} by ` + updatedSession?.to_id?.name,
      type: "order",
      title: "Order update",
      fcmtoken: updatedSession.user.fcmtoken,
      order: orderId,
      noti: false,
      email: "",
    });

    if (updatedSession.user?.email) {
      await sendOrderEmailToUser(
        updatedSession.user?.email,
        orderId,
        updatedSession.address,
        updatedSession.price,
        updatedSession.to_id.name,
        updatedSession.to_id.phone,
        true,
      );
    }

    await sendNotification({
      user: updatedSession.to_id._id.toString(),
      to_id: updatedSession.to_id._id.toString(),
      description: `You have updated your order status to ${status}.`,
      type: "order",
      title: "Order update",
      fcmtoken: updatedSession.to_id.fcmtoken,
      order: orderId,
      noti: false,
      email: "",
    });

    if (updatedSession.to_id?.email) {
      await sendOrderEmailToUser(
        updatedSession.to_id?.email,
        orderId,
        updatedSession.address,
        updatedSession.price,
        updatedSession.user?.name,
        updatedSession.user?.phone,
        false,
      );
    }

    const renterSocketId = connectedUsers.get(senderId.toString());
    if (renterSocketId) {
      io.to(renterSocketId).emit("update-order-renter", {
        success: true,
        order: formatOrderPayload(updatedSession, PRICING_ROLES.OWNER),
        title: "Order Update",
        message: `You have updated your order status to ${status}.`,
      });
    }

    const renteeSocketId = connectedUsers.get(
      updatedSession.user._id.toString(),
    );
    if (renteeSocketId) {
      io.to(renteeSocketId).emit("update-order-rentee", {
        success: true,
        order: formatOrderPayload(updatedSession, PRICING_ROLES.CUSTOMER),
        title: "Order Update",
        message:
          `Your Order has been ${status} by ` + updatedSession?.to_id?.name,
      });
    }
    const adminUser = await User.findOne({ type: "admin" })
      .select("type")
      .lean();

    if (adminUser) {
      io.to(adminUser?._id.toString()).emit("admin-noti", {
        success: true,
        title: "Order Update",
        message: `New Order have been completed by ${updatedSession?.user?.name} rentee and renter is ${updatedSession?.to_id?.name}`,
        type: "order",
      });
      await sendNotification({
        user: senderId,
        to_id: adminUser._id.toString(),
        description: `New Order have been completed by ${updatedSession?.user?.name} rentee and renter is ${updatedSession?.to_id?.name}`,
        type: "order",
        title: "Order Update",
        fcmtoken: "",
        order: orderId,
        email: "",
      });
    }

    await AssignOrder.findOneAndUpdate(
      {
        orderId: orderId,
        assignBy: senderId,
        status: { $nin: ["completed", "cancelled"] },
      },
      {
        $set: {
          status: "completed",
        },
      },
    );
    return formatOrderPayload(updatedSession, PRICING_ROLES.OWNER);
  }

  async releaseServiceBooking(order) {
    const serviceType = normalizeServiceType(order.service_type);
    const startTime = new Date(order.start_date).getTime();
    const endTime = new Date(order.end_date).getTime();

    if (serviceType === "Dumbster" || serviceType === "Porta Potty") {
      const dustbin = await Dustbin.findById(order.dustbin);
      if (!dustbin) {
        throw new NotFoundError("Dustbin not found");
      }
      dustbin.bookings = dustbin.bookings.filter((booking) => {
        return !(
          new Date(booking.startDate).getTime() === startTime &&
          new Date(booking.endDate).getTime() === endTime
        );
      });
      await dustbin.save();
      return;
    }

    if (serviceType === "Junk Removal") {
      const junkRemovalId =
        order.junkRemoval?._id ||
        order.junkRemoval ||
        order.to_id?.junkRemoval?._id ||
        order.to_id?.junkRemoval;
      if (!junkRemovalId) return;
      const junkRemoval = await JunkRemoval.findById(junkRemovalId);
      if (!junkRemoval) return;
      junkRemoval.bookings = (junkRemoval.bookings || []).filter((booking) => {
        return !(
          new Date(booking.startDate).getTime() === startTime &&
          new Date(booking.endDate).getTime() === endTime
        );
      });
      await junkRemoval.save();
      return;
    }

    if (serviceType === "Tree Removal") {
      const treeRemovalId =
        order.treeRemoval?._id ||
        order.treeRemoval ||
        order.to_id?.treeRemoval?._id ||
        order.to_id?.treeRemoval;
      if (!treeRemovalId) return;
      const treeRemoval = await TreeRemoval.findById(treeRemovalId);
      if (!treeRemoval) return;
      treeRemoval.bookings = (treeRemoval.bookings || []).filter((booking) => {
        return !(
          new Date(booking.startDate).getTime() === startTime &&
          new Date(booking.endDate).getTime() === endTime
        );
      });
      await treeRemoval.save();
    }
  }
  async updatelocation(userId, currentlat, currentlng, assignBy) {
    try {
      // Create an object to store the fields to be updated

      const user = await SubUserDetail.findByIdAndUpdate(
        userId,
        {
          location: {
            type: "Point",
            coordinates: [currentlng, currentlat],
          },
        },
        {
          new: true,
        },
      );

      if (!user)
        throw new NotFoundError("The User with the given ID was not found.");

      const orders = await AssignOrder.find({
        subUserDetail: userId,
        status: "assigned",
      })
        .populate("orderId", "user onway")
        .lean();

      for (const order of orders) {
        if (!order.orderId || !order.orderId.user) continue;

        const userSocketId = connectedUsers.get(order.orderId.user.toString());
        const RenterSocketId = connectedUsers.get(order.assignBy.toString());

        // `order` kept for backward-compat; `orderId`/`userId` match the app's
        // preferred shape. `userId` is the assigned driver being tracked.
        const payload = {
          order: order.orderId._id,
          orderId: order.orderId._id,
          userId: userId,
          currentlat,
          currentlng,
          onway: order.orderId.onway === true,
        };

        if (userSocketId) {
          io.to(userSocketId).emit("location-update", payload);
        }
        if (RenterSocketId) {
          io.to(RenterSocketId).emit("location-update", payload);
        }
      }

      const assignOrders = await AssignOrder.find({
        assignBy: assignBy,
        status: "assigned",
      })
        .populate(["orderId", "subUserDetail"])
        .lean();

      const assignBySocketId = connectedUsers.get(
        assignOrders[0].assignBy.toString(),
      );
      console.log("assignBySocketId", assignBySocketId);
      console.log("assignOrders", assignOrders[0].assignBy.toString());
      if (assignBySocketId) {
        io.to(assignBySocketId).emit("location-update-drivers", {
          data: assignOrders,
        });
      }
    } catch (error) {
      logger.error(error);
      throw error;
    }
  }
  async sendMessage(body, to) {
    try {
      await client.messages.create({
        body,
        from: "Bins App",
        to,
      });
    } catch (error) {
      logger.error(error);
      throw error;
    }
  }
  async getSubusers(assignBy, page = 1, limit = 10) {
    try {
      const skip = (Number(page) - 1) * Number(limit);
      const limitCount = Number(limit);

      const assignOrder = await AssignOrder.aggregate([
        {
          $match: {
            assignBy: assignBy,
          },
        },
        {
          $group: {
            _id: "$subUserDetail",
          },
        },
        {
          $lookup: {
            from: "subuserdetails",
            localField: "_id",
            foreignField: "_id",
            as: "detail",
          },
        },
        {
          $unwind: "$detail",
        },
        {
          $replaceRoot: {
            newRoot: "$detail",
          },
        },
        {
          $skip: skip,
        },
        {
          $limit: limitCount,
        },
      ]);
      return assignOrder;
    } catch (error) {
      logger.error(error);
      throw error;
    }
  }
  async dropoffOrder({ orderId, dropoffimage }, senderId) {
    try {
      const updatedSession = await Order.findOne({
        _id: orderId,
        status: "accepted",
        to_id: senderId,
      })
        .populate("to_id")
        .populate("user")
        .populate("dumbster")
        .populate("dustbin");
      if (updatedSession == null) {
        const renterSocket = connectedUsers.get(senderId.toString());
        if (renterSocket) {
          io.to(renterSocket).emit("update-order-renter", {
            success: false,
            title: "Order Update",
            message: "Order not found.",
          });
        }
        return { success: false, message: "Order not found" };
      }

      updatedSession.dropoffimage = dropoffimage;
      await updatedSession.save();
      await OrderTimeline.create({
        order: updatedSession._id,
        orderDeatil: updatedSession,
        message: "Order dropoff successfully!",
      });
      await sendNotification({
        user: senderId,
        to_id: updatedSession.user._id.toString(),
        description:
          `Your Order has been dropoff by ` + updatedSession?.to_id?.name,
        type: "order",
        title: "Order update",
        fcmtoken: updatedSession.user.fcmtoken,
        order: orderId,
        noti: false,
        email: updatedSession.user?.email || "",
      });

      await sendNotification({
        user: updatedSession.to_id._id.toString(),
        to_id: updatedSession.to_id._id.toString(),
        description: `You have dropoff your order to its location.`,
        type: "order",
        title: "Order update",
        fcmtoken: updatedSession.to_id.fcmtoken,
        order: orderId,
        noti: false,
        email: updatedSession.to_id?.email || "",
      });
      const renterSocket = connectedUsers.get(senderId.toString());
      if (renterSocket) {
        io.to(renterSocket).emit("dropoff-order-renter", {
          success: true,
          order: formatOrderPayload(updatedSession, PRICING_ROLES.OWNER),
          title: "Order Update",
          message: `You have dropped off your order to its location.`,
        });
      }

      const customerSocket = connectedUsers.get(
        updatedSession.user._id.toString(),
      );
      if (customerSocket) {
        io.to(customerSocket).emit("dropoff-order-rentee", {
          success: true,
          order: formatOrderPayload(updatedSession, PRICING_ROLES.CUSTOMER),
          title: "Order Update",
          message: `Bins has arrived, your dumpster has been dropped off`,
        });
      }
      return {
        success: true,
        title: "Order Update",
        message: `You have dropped off your order to its location.`,
      };
    } catch (error) {
      console.log(error);
      logger.error(error.message);
      throw error;
    }
  }
  async deliveryProof(subUserId, assignBy, { orderId, proofOfWorkDone }) {
    if (!orderId) {
      throw new BadRequestError("Order ID is required");
    }

    const assignOrder = await AssignOrder.findOne({
      orderId,
      subUserDetail: subUserId,
      status: { $nin: ["cancelled", "completed"] },
    });
    if (!assignOrder) {
      throw new NotFoundError("Assigned order not found");
    }
    const assignById = assignBy?._id || assignBy;
    if (
      assignById &&
      assignOrder.assignBy.toString() !== assignById.toString()
    ) {
      throw new ForbiddenError("Not authorized for this order");
    }

    const ownerId = assignOrder.assignBy;
    const updatedSession = await Order.findOneAndUpdate(
      {
        _id: orderId,
        status: "accepted",
        to_id: ownerId,
      },
      {
        proofOfWorkDone,
        dropoffimage: proofOfWorkDone[0],
        "deliveryWorkflow.deliveryPhotos": proofOfWorkDone,
      },
      { new: true, runValidators: true },
    )
      .populate("to_id")
      .populate("user")
      .populate("dumbster")
      .populate("dustbin");

    if (!updatedSession) {
      throw new NotFoundError("Order not found");
    }

    await AssignOrder.findByIdAndUpdate(assignOrder._id, {
      $push: {
        timeline: {
          event: "Delivery proof photos uploaded",
          timestamp: new Date(),
          photos: proofOfWorkDone,
        },
      },
    });

    const submitCopy = orderMessages.proofSubmitted({
      customerName: updatedSession.user?.name,
      providerName: updatedSession.to_id?.name,
      serviceType: updatedSession.service_type,
      order: updatedSession,
    });

    await OrderTimeline.create({
      order: updatedSession._id,
      orderDeatil: updatedSession,
      ...timelineEntry(submitCopy),
    });

    const customerLink = `https://api.binsapp.ai/customer-orders?orderId=${updatedSession._id}`;
    const ownerLink = `https://api.binsapp.ai/owner-orders?orderId=${updatedSession._id}`;

    const adminUser = await User.findOne({
      $or: [{ type: "admin" }, { role: "admin" }],
    })
      .select("fcmtoken")
      .lean();

    const notifyPromises = [
      sendNotification({
        user: ownerId,
        to_id: updatedSession.user._id.toString(),
        description: submitCopy.customer.description,
        type: "order",
        title: submitCopy.customer.title,
        fcmtoken: updatedSession.user.fcmtoken,
        order: updatedSession._id.toString(),
        noti: false,
        email: updatedSession.user?.email || "",
        customEmailTemplate: true,
        html: buttonTemplate(
          customerLink,
          submitCopy.customer.title,
          submitCopy.customer.description,
        ),
      }),
      sendNotification({
        user: updatedSession.to_id._id.toString(),
        to_id: updatedSession.to_id._id.toString(),
        description: submitCopy.operator.description,
        type: "order",
        title: submitCopy.operator.title,
        fcmtoken: updatedSession.to_id.fcmtoken,
        order: updatedSession._id.toString(),
        noti: false,
        email: updatedSession.to_id?.email || "",
        customEmailTemplate: true,
        html: buttonTemplate(
          ownerLink,
          submitCopy.operator.title,
          submitCopy.operator.description,
        ),
      }),
    ];

    if (adminUser) {
      io.to(`user_${adminUser._id.toString()}`).emit("admin-noti", {
        success: true,
        title: submitCopy.admin.title,
        message: submitCopy.admin.description,
        type: "order",
      });
      notifyPromises.push(
        sendNotification({
          user: ownerId,
          to_id: adminUser._id.toString(),
          description: submitCopy.admin.description,
          type: "order",
          title: submitCopy.admin.title,
          fcmtoken: adminUser?.fcmtoken || "",
          order: updatedSession._id.toString(),
          email: "",
        }),
      );
    }

    io.to(`user_${ownerId.toString()}`).emit("proofofworkdone-order-renter", {
      success: true,
      order: formatOrderPayload(updatedSession, PRICING_ROLES.OWNER),
      title: submitCopy.operator.title,
      message: submitCopy.operator.description,
    });
    io.to(`user_${updatedSession.user._id.toString()}`).emit(
      "proofofworkdone-order-rentee",
      {
        success: true,
        order: formatOrderPayload(updatedSession, PRICING_ROLES.CUSTOMER),
        title: submitCopy.customer.title,
        message: submitCopy.customer.description,
      },
    );

    Promise.all(notifyPromises).catch((err) =>
      logger.error("Proof submit notification failed", err),
    );

    return formatOrderPayload(updatedSession, PRICING_ROLES.OWNER);
  }

  async getAssignOrderList(userId, page, limit) {
    // console.log(userId);
    try {
      const skip = (Number(page) - 1) * Number(limit);
      const limitCount = Number(limit);
      const assignOrderList = await AssignOrder.find({
        subUserDetail: userId,
      })
        .populate([
          {
            path: "orderId",
            populate: {
              path: ["user", "dumbster", "dustbin"],
            },
          },
          "assignBy",
        ])
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitCount)
        .lean();
      const total = await AssignOrder.countDocuments({
        subUserDetail: userId,
      });
      return {
        assignOrderList: formatAssignOrderList(
          assignOrderList,
          PRICING_ROLES.OWNER,
        ),
        total,
        page,
        limit,
      };
    } catch (error) {
      console.log(error);
      logger.error(error.message);
      throw error;
    }
  }
  async updateFcmToken(userId, fcmtoken) {
    try {
      const user = await SubUserDetail.findOneAndUpdate(
        { _id: userId },
        { $set: { fcmtoken } },
        { new: true },
      );
      return user;
    } catch (error) {
      console.log(error);
      logger.error(error.message);
      throw error;
    }
  }

  /**
   * 1. Get saved driver list for operator (including self option)
   */
  async getOperatorDrivers(operatorId) {
    try {
      const operator = await User.findById(operatorId)
        .select("name phone email profilePicture")
        .lean();
      if (!operator) throw new NotFoundError("Operator not found");

      const drivers = await SubUserDetail.find({
        $or: [
          { operator: operatorId },
          { _id: { $in: await this.getDriverIdsForOperator(operatorId) } },
        ],
        status: { $ne: "inactive" },
      }).lean();

      // Attach dynamic active jobs count
      const activeJobs = await AssignOrder.aggregate([
        {
          $match: {
            assignBy: new mongoose.Types.ObjectId(operatorId),
            status: { $in: ["assigned", "dispatched", "en_route", "arrived"] },
          },
        },
        { $group: { _id: "$subUserDetail", count: { $sum: 1 } } },
      ]);
      const jobCountMap = new Map(
        activeJobs.map((j) => [j._id.toString(), j.count]),
      );

      const formattedDrivers = drivers.map((d) => ({
        ...d,
        activeJobsCount: jobCountMap.get(d._id.toString()) || 0,
      }));

      return {
        operator: {
          _id: operator._id,
          name: operator.name || "Owner/Operator",
          phone: operator.phone || "",
          email: operator.email || "",
          isSelf: true,
        },
        drivers: formattedDrivers,
      };
    } catch (error) {
      logger.error("getOperatorDrivers error:", error);
      throw error;
    }
  }

  async getDriverIdsForOperator(operatorId) {
    const assignments = await AssignOrder.find({ assignBy: operatorId })
      .select("subUserDetail")
      .lean();
    return assignments.map((a) => a.subUserDetail);
  }

  /**
   * 2. Add a new driver to operator's saved list
   */
  async addOperatorDriver(operatorId, driverData) {
    try {
      const { name, phone, email, avatar, notes } = driverData;
      if (!phone) throw new BadRequestError("Driver phone number is required");

      let driver = await SubUserDetail.findOne({
        phone,
        operator: operatorId,
      });

      if (driver) {
        if (name) driver.name = name;
        if (email) driver.email = email;
        if (avatar) driver.avatar = avatar;
        if (notes) driver.notes = notes;
        driver.status = "active";
        await driver.save();
      } else {
        driver = await SubUserDetail.create({
          operator: operatorId,
          name: name || "",
          phone,
          email: email || "",
          avatar: avatar || "",
          notes: notes || "",
          status: "active",
        });
      }

      return driver;
    } catch (error) {
      logger.error("addOperatorDriver error:", error);
      throw error;
    }
  }

  /**
   * 3. Assign Driver to Order (Options: existing driver, do it myself, or add new)
   */
  async assignDriverToOrder(
    operatorId,
    {
      orderId,
      driverId,
      driverType = "driver", // "driver" | "self"
      newDriverData = null,
      workflowType = "delivery", // "delivery" | "pickup" | "swap"
      autoDispatch = false,
      unitNumber = "",
    },
  ) {
    try {
      const order = await Order.findOne({
        _id: orderId,
        to_id: operatorId,
      }).populate(["user", "to_id", "dumbster", "dustbin"]);

      if (!order) throw new NotFoundError("Order not found or unauthorized");
      if (order.status !== "accepted") {
        throw new BadRequestError(
          "Cannot assign driver to an unaccepted order",
        );
      }

      let assignedDriverDoc = null;
      let driverName = "";
      let driverPhone = "";
      let driverEmail = "";

      if (driverType === "self") {
        driverName = order.to_id?.name || "Owner/Operator";
        driverPhone = order.to_id?.phone || "";
        driverEmail = order.to_id?.email || "";
      } else if (newDriverData && !driverId) {
        assignedDriverDoc = await this.addOperatorDriver(
          operatorId,
          newDriverData,
        );
        driverName = assignedDriverDoc.name || assignedDriverDoc.phone;
        driverPhone = assignedDriverDoc.phone;
        driverEmail = assignedDriverDoc.email || "";
      } else if (driverId) {
        assignedDriverDoc = await SubUserDetail.findById(driverId);
        if (!assignedDriverDoc)
          throw new NotFoundError("Selected driver not found");
        driverName = assignedDriverDoc.name || assignedDriverDoc.phone;
        driverPhone = assignedDriverDoc.phone;
        driverEmail = assignedDriverDoc.email || "";
      } else {
        throw new BadRequestError("Driver details required for assignment");
      }

      const assignedAt = new Date();

      if (workflowType === "pickup") {
        if (!order.pickupWorkflow) order.pickupWorkflow = {};
        order.pickupWorkflow.assignedDriver = assignedDriverDoc?._id || null;
        order.pickupWorkflow.assignedDriverType = driverType;
        order.pickupWorkflow.assignedDriverName = driverName;
        order.pickupWorkflow.assignedDriverPhone = driverPhone;
        order.pickupWorkflow.assignedAt = assignedAt;
        order.pickupWorkflow.status = "assigned";
      } else {
        if (!order.deliveryWorkflow) order.deliveryWorkflow = {};
        order.deliveryWorkflow.assignedDriver = assignedDriverDoc?._id || null;
        order.deliveryWorkflow.assignedDriverType = driverType;
        order.deliveryWorkflow.assignedDriverName = driverName;
        order.deliveryWorkflow.assignedDriverPhone = driverPhone;
        if (unitNumber) {
          order.deliveryWorkflow.unitNumber = unitNumber;
        }
        order.deliveryWorkflow.assignedAt = assignedAt;
        order.deliveryWorkflow.status = "assigned";
      }

      // Maintain legacy AssignOrder linkage when assigned to an external driver
      if (assignedDriverDoc) {
        const existingAssign = await AssignOrder.findOne({
          orderId: order._id,
          subUserDetail: assignedDriverDoc._id,
        });

        if (existingAssign) {
          existingAssign.status = "assigned";
          existingAssign.assignmentType = workflowType;
          existingAssign.driverType = driverType;
          existingAssign.timeline.push({
            event: `Driver assigned for ${workflowType}`,
            timestamp: assignedAt,
          });
          await existingAssign.save();
          order.assignOrder = existingAssign._id;
        } else {
          const newAssign = await AssignOrder.create({
            subUserDetail: assignedDriverDoc._id,
            orderId: order._id,
            assignBy: operatorId,
            assignmentType: workflowType,
            driverType,
            status: "assigned",
            timeline: [
              {
                event: `Driver assigned for ${workflowType}`,
                timestamp: assignedAt,
              },
            ],
          });
          order.assignOrder = newAssign._id;
        }
      }

      await order.save();

      await OrderTimeline.create({
        order: order._id,
        orderDeatil: order,
        message: `Driver ${driverName} assigned for ${workflowType}.`,
      });

      const assignLinkId = order.assignOrder || order._id;
      const assignLink = `https://api.binsapp.ai/assign-driver?token=${assignLinkId}`;

      const notifications = [];

      if (driverPhone) {
        notifications.push(
          this.sendMessage(
            `You've been assigned a new order. Tap the link below to view the details and start your route: ${assignLink}`,
            driverPhone,
          ).catch((err) =>
            logger.warn("Failed to send driver assignment SMS:", err.message),
          ),
        );
      }

      if (driverEmail) {
        notifications.push(
          sendEmail({
            to: driverEmail,
            subject: "New Order Assigned - BINS APP",
            html: orderAssignedDriverTemplate({
              assignLink,
              driverName,
              orderNumber: order._id?.toString()?.slice(-6)?.toUpperCase(),
              serviceType: order.service_type || "Bin Service",
              address: order.address || "",
              deliveryDate: order.start_date
                ? new Date(order.start_date).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : "",
            }),
          }).catch((err) =>
            logger.warn("Failed to send driver assignment email:", err.message),
          ),
        );
      }

      if (notifications.length > 0) {
        await Promise.allSettled(notifications);
      }
      if (autoDispatch) {
        await this.dispatchJob(operatorId, {
          orderId: order._id,
          workflowType,
        });
      }

      // Real-time notification to operator desktop and mobile
      const operatorSocket = connectedUsers.get(operatorId.toString());
      if (operatorSocket) {
        io.to(operatorSocket).emit("order-driver-assigned", {
          success: true,
          orderId: order._id,
          workflowType,
          driver: {
            driverId: assignedDriverDoc?._id || null,
            driverType,
            driverName,
            driverPhone,
          },
          order: formatOrderPayload(order, PRICING_ROLES.OWNER),
        });
      }

      return {
        order: formatOrderPayload(order, PRICING_ROLES.OWNER),
        assignLink,
      };
    } catch (error) {
      logger.error("assignDriverToOrder error:", error);
      throw error;
    }
  }

  /**
   * 4. Dispatch Job to Assigned Driver
   */
  async dispatchJob(operatorId, { orderId, workflowType = "delivery" }) {
    try {
      const order = await Order.findOne({
        _id: orderId,
        to_id: operatorId,
      }).populate(["user", "to_id", "dumbster", "dustbin", "assignOrder"]);

      if (!order) throw new NotFoundError("Order not found or unauthorized");

      const dispatchedAt = new Date();
      const wf =
        workflowType === "pickup"
          ? order.pickupWorkflow
          : order.deliveryWorkflow;

      if (!wf || wf.status === "unassigned") {
        throw new BadRequestError("Please assign a driver before dispatching");
      }

      wf.status = "dispatched";
      wf.dispatchedAt = dispatchedAt;
      await order.save();

      if (order.assignOrder) {
        await AssignOrder.findByIdAndUpdate(order.assignOrder, {
          status: "dispatched",
          $push: {
            timeline: {
              event: `Job dispatched for ${workflowType}`,
              timestamp: dispatchedAt,
            },
          },
        });
      }

      await OrderTimeline.create({
        order: order._id,
        orderDeatil: order,
        message: `Order dispatched for ${workflowType} to ${wf.assignedDriverName}.`,
      });

      const driverPayload = formatOrderPayload(order, PRICING_ROLES.DRIVER);

      // If assigned to SubUserDetail driver, send notification and socket event
      if (wf.assignedDriver) {
        const driverDoc = await SubUserDetail.findById(
          wf.assignedDriver,
        ).lean();
        const driverSocket = connectedUsers.get(wf.assignedDriver.toString());

        if (driverSocket) {
          io.to(driverSocket).emit("driver:job-dispatched", {
            success: true,
            orderId: order._id,
            workflowType,
            job: driverPayload,
          });
        }

        if (driverDoc?.fcmtoken) {
          await sendNotification({
            user: operatorId.toString(),
            to_id: driverDoc._id.toString(),
            type: "driver_assignment",
            title: `New ${workflowType === "pickup" ? "Pickup" : "Delivery"} Job Dispatched`,
            description: `Order #${order.orderNumber || order._id.toString().slice(-6)} dispatched to you at ${order.address}`,
            fcmtoken: driverDoc.fcmtoken,
            order: order._id.toString(),
            noti: true,
            metadata: {
              orderId: order._id.toString(),
              workflowType,
            },
          });
        }

        if (driverDoc?.phone) {
          const driverLink = `https://api.binsapp.ai/assign-driver?token=${order.assignOrder || order._id}`;
          this.sendMessage(
            `BINS APP: You have been dispatched a new ${workflowType} job at ${order.address}. View job: ${driverLink}`,
            driverDoc.phone,
          ).catch((e) =>
            logger.warn("Driver SMS dispatch notice failed:", e.message),
          );
        }
      }

      // Notify operator
      const operatorSocket = connectedUsers.get(operatorId.toString());
      if (operatorSocket) {
        io.to(operatorSocket).emit("order-dispatched", {
          success: true,
          orderId: order._id,
          workflowType,
          order: formatOrderPayload(order, PRICING_ROLES.OWNER),
        });
      }

      return formatOrderPayload(order, PRICING_ROLES.OWNER);
    } catch (error) {
      logger.error("dispatchJob error:", error);
      throw error;
    }
  }

  /**
   * 5. Change Driver (Reassignment)
   */
  async changeDriver(
    operatorId,
    {
      orderId,
      newDriverId,
      driverType = "driver",
      newDriverData = null,
      workflowType = "delivery",
      reason = "",
    },
  ) {
    try {
      const order = await Order.findOne({
        _id: orderId,
        to_id: operatorId,
      });

      if (!order) throw new NotFoundError("Order not found or unauthorized");

      const wf =
        workflowType === "pickup"
          ? order.pickupWorkflow
          : order.deliveryWorkflow;
      const previousDriverId = wf?.assignedDriver;
      const previousDriverName = wf?.assignedDriverName;

      // Notify former driver of revoked assignment
      if (previousDriverId) {
        const formerDriverSocket = connectedUsers.get(
          previousDriverId.toString(),
        );
        if (formerDriverSocket) {
          io.to(formerDriverSocket).emit("driver:assignment-removed", {
            success: true,
            orderId: order._id,
            workflowType,
            message: "This job has been reassigned by the dispatcher.",
          });
        }
      }

      // Assign new driver & dispatch
      const updatedOrder = await this.assignDriverToOrder(operatorId, {
        orderId,
        driverId: newDriverId,
        driverType,
        newDriverData,
        workflowType,
        autoDispatch: true,
      });

      await OrderTimeline.create({
        order: order._id,
        orderDeatil: order,
        message: `Driver changed from ${previousDriverName || "None"} to ${updatedOrder.deliveryWorkflow?.assignedDriverName || "new driver"}${reason ? ` (${reason})` : ""}.`,
      });

      return updatedOrder;
    } catch (error) {
      logger.error("changeDriver error:", error);
      throw error;
    }
  }

  /**
   * 6. Get Scoped Job Details for Driver
   */
  async getDriverJobDetails(driverId, orderId) {
    try {
      const order = await Order.findById(orderId)
        .populate([
          "user",
          "dumbster",
          "dustbin",
          "portaPotty",
          "junkRemoval",
          "treeRemoval",
        ])
        .lean();

      if (!order) throw new NotFoundError("Job not found");

      return formatOrderPayload(order, PRICING_ROLES.DRIVER);
    } catch (error) {
      logger.error("getDriverJobDetails error:", error);
      throw error;
    }
  }

  /**
   * 7. Driver Workflow: En Route
   */
  async driverEnRoute(
    driverUserId,
    { orderId, workflowType = "delivery", currentlat, currentlng },
  ) {
    try {
      const order = await Order.findById(orderId)
        .populate("user")
        .populate("to_id");

      if (!order) throw new NotFoundError("Order not found");

      const enRouteAt = new Date();
      order.onway = true;

      if (workflowType === "pickup") {
        if (!order.pickupWorkflow) order.pickupWorkflow = {};
        order.pickupWorkflow.status = "en_route";
        order.pickupWorkflow.enRouteAt = enRouteAt;
      } else {
        if (!order.deliveryWorkflow) order.deliveryWorkflow = {};
        order.deliveryWorkflow.status = "en_route";
        order.deliveryWorkflow.enRouteAt = enRouteAt;
      }

      await order.save();

      if (order.assignOrder) {
        await AssignOrder.findByIdAndUpdate(order.assignOrder, {
          status: "en_route",
          $push: {
            timeline: {
              event: `Driver EN ROUTE for ${workflowType}`,
              timestamp: enRouteAt,
              location:
                currentlat && currentlng
                  ? { type: "Point", coordinates: [currentlng, currentlat] }
                  : undefined,
            },
          },
        });
      }

      const onwayCopy = orderMessages.onTheWay({
        customerName: order.user?.name,
        providerName: order.to_id?.name,
        serviceType: order.service_type,
        order,
      });

      await OrderTimeline.create({
        order: order._id,
        orderDeatil: order,
        ...timelineEntry(onwayCopy),
      });

      // Real-time events to customer and operator
      const customerSocket = connectedUsers.get(order.user?._id?.toString());
      if (customerSocket) {
        io.to(customerSocket).emit("onway-order-rentee", {
          success: true,
          orderId: order._id,
          order: formatOrderPayload(order, PRICING_ROLES.CUSTOMER),
          title: onwayCopy.customer.title,
          message: onwayCopy.customer.description,
        });
      }

      const operatorSocket = connectedUsers.get(order.to_id?._id?.toString());
      if (operatorSocket) {
        io.to(operatorSocket).emit("driver-en-route-renter", {
          success: true,
          orderId: order._id,
          workflowType,
          order: formatOrderPayload(order, PRICING_ROLES.OWNER),
        });
      }

      if (order.user?.fcmtoken) {
        sendNotification({
          user: order.to_id?._id?.toString() || "",
          to_id: order.user._id.toString(),
          title: onwayCopy.customer.title,
          description: onwayCopy.customer.description,
          fcmtoken: order.user.fcmtoken,
          type: "order",
          order: order._id.toString(),
          noti: true,
        }).catch((e) =>
          logger.warn("Customer en-route notification failed:", e.message),
        );
      }

      return formatOrderPayload(order, PRICING_ROLES.DRIVER);
    } catch (error) {
      logger.error("driverEnRoute error:", error);
      throw error;
    }
  }

  /**
   * 8. Driver Workflow: Arrived
   */
  async driverArrived(
    driverUserId,
    { orderId, workflowType = "delivery", currentlat, currentlng },
  ) {
    try {
      const order = await Order.findById(orderId)
        .populate("user")
        .populate("to_id");

      if (!order) throw new NotFoundError("Order not found");

      const arrivedAt = new Date();
      const coordinates =
        currentlng && currentlat
          ? [Number(currentlng), Number(currentlat)]
          : [0, 0];

      if (workflowType === "pickup") {
        if (!order.pickupWorkflow) order.pickupWorkflow = {};
        order.pickupWorkflow.status = "arrived";
        order.pickupWorkflow.arrivedAt = arrivedAt;
        order.pickupWorkflow.arrivalLocation = { type: "Point", coordinates };
      } else {
        if (!order.deliveryWorkflow) order.deliveryWorkflow = {};
        order.deliveryWorkflow.status = "arrived";
        order.deliveryWorkflow.arrivedAt = arrivedAt;
        order.deliveryWorkflow.arrivalLocation = { type: "Point", coordinates };
      }

      await order.save();

      if (order.assignOrder) {
        await AssignOrder.findByIdAndUpdate(order.assignOrder, {
          status: "arrived",
          $push: {
            timeline: {
              event: `Driver ARRIVED at jobsite for ${workflowType}`,
              timestamp: arrivedAt,
              location: { type: "Point", coordinates },
            },
          },
        });
      }

      await OrderTimeline.create({
        order: order._id,
        orderDeatil: order,
        message: `Driver arrived at jobsite for ${workflowType}.`,
      });

      const operatorSocket = connectedUsers.get(order.to_id?._id?.toString());
      if (operatorSocket) {
        io.to(operatorSocket).emit("driver-arrived-renter", {
          success: true,
          orderId: order._id,
          workflowType,
          arrivalLocation: { coordinates },
          order: formatOrderPayload(order, PRICING_ROLES.OWNER),
        });
      }

      return formatOrderPayload(order, PRICING_ROLES.DRIVER);
    } catch (error) {
      logger.error("driverArrived error:", error);
      throw error;
    }
  }

  /**
   * 9. Driver Workflow: Upload Delivery Proof Photos & Notes
   */
  async uploadDeliveryProof(
    driverUserId,
    {
      orderId,
      deliveryPhotos = [],
      deliveryNotes = "",
      unitNumber = "",
      currentlat,
      currentlng,
    },
  ) {
    try {
      const order = await Order.findById(orderId);
      if (!order) throw new NotFoundError("Order not found");

      const photos = Array.isArray(deliveryPhotos)
        ? deliveryPhotos
        : deliveryPhotos
          ? [deliveryPhotos]
          : [];

      if (!order.deliveryWorkflow) order.deliveryWorkflow = {};
      const existingPhotos = order.deliveryWorkflow.deliveryPhotos || [];
      order.deliveryWorkflow.deliveryPhotos = Array.from(
        new Set([...existingPhotos, ...photos]),
      );
      if (deliveryNotes) order.deliveryWorkflow.deliveryNotes = deliveryNotes;
      if (unitNumber) order.deliveryWorkflow.unitNumber = unitNumber;

      if (photos.length > 0) {
        order.dropoffimage = photos[0];
      }

      await order.save();

      if (order.assignOrder) {
        await AssignOrder.findByIdAndUpdate(order.assignOrder, {
          $push: {
            timeline: {
              event: "Delivery proof photos and notes uploaded",
              timestamp: new Date(),
              photos,
              notes: deliveryNotes,
            },
          },
        });
      }

      return formatOrderPayload(order, PRICING_ROLES.DRIVER);
    } catch (error) {
      logger.error("uploadDeliveryProof error:", error);
      throw error;
    }
  }

  /**
   * 10. Driver Workflow: Complete Delivery
   */
  async completeDelivery(driverUserId, { orderId }) {
    try {
      const order = await Order.findById(orderId)
        .populate("user")
        .populate("to_id")
        .populate("dumbster")
        .populate("dustbin");

      if (!order) throw new NotFoundError("Order not found");

      const wf = order.deliveryWorkflow;
      const hasProof =
        (wf?.deliveryPhotos && wf.deliveryPhotos.length > 0) ||
        order.dropoffimage;

      if (!hasProof) {
        throw new BadRequestError(
          "Delivery proof photo is required before completing delivery",
        );
      }

      const deliveredAt = new Date();
      order.deliveryWorkflow.status = "delivered";
      order.deliveryWorkflow.deliveredAt = deliveredAt;
      await order.save();

      if (order.assignOrder) {
        await AssignOrder.findByIdAndUpdate(order.assignOrder, {
          status: "delivered",
          $push: {
            timeline: {
              event: "DELIVERY COMPLETED",
              timestamp: deliveredAt,
            },
          },
        });
      }

      await OrderTimeline.create({
        order: order._id,
        orderDeatil: order,
        message: "Delivery drop-off completed successfully.",
      });

      // Real-time broadcasts
      const operatorSocket = connectedUsers.get(order.to_id?._id?.toString());
      if (operatorSocket) {
        io.to(operatorSocket).emit("dropoff-order-renter", {
          success: true,
          orderId: order._id,
          order: formatOrderPayload(order, PRICING_ROLES.OWNER),
          message: "Delivery completed successfully.",
        });
      }

      const customerSocket = connectedUsers.get(order.user?._id?.toString());
      if (customerSocket) {
        io.to(customerSocket).emit("dropoff-order-rentee", {
          success: true,
          orderId: order._id,
          order: formatOrderPayload(order, PRICING_ROLES.CUSTOMER),
          message: "Bins has arrived, your dumpster has been dropped off.",
        });
      }

      if (order.user?.fcmtoken) {
        sendNotification({
          user: order.to_id?._id?.toString() || "",
          to_id: order.user._id.toString(),
          title: "Dumpster Delivered",
          description: "Your dumpster has been placed and is ready for use.",
          fcmtoken: order.user.fcmtoken,
          type: "order",
          order: order._id.toString(),
          noti: true,
        }).catch((e) =>
          logger.warn("Customer delivery notification failed:", e.message),
        );
      }

      return formatOrderPayload(order, PRICING_ROLES.DRIVER);
    } catch (error) {
      logger.error("completeDelivery error:", error);
      throw error;
    }
  }

  /**
   * 11. Driver Workflow: Report Issue on Pickup
   */
  async reportPickupIssue(
    driverUserId,
    { orderId, issueType, notes, photos = [] },
  ) {
    try {
      const order = await Order.findById(orderId)
        .populate("user")
        .populate("to_id");

      if (!order) throw new NotFoundError("Order not found");

      const issueObj = {
        issueType: issueType || "General Issue",
        notes: notes || "",
        photos: Array.isArray(photos) ? photos : [photos],
        reportedAt: new Date(),
      };

      if (!order.pickupWorkflow) order.pickupWorkflow = {};
      const existingIssues = order.pickupWorkflow.issues || [];
      order.pickupWorkflow.issues = [...existingIssues, issueObj];

      await order.save();

      await OrderTimeline.create({
        order: order._id,
        orderDeatil: order,
        message: `Pickup issue reported: ${issueObj.issueType} - ${issueObj.notes}`,
      });

      const operatorSocket = connectedUsers.get(order.to_id?._id?.toString());
      if (operatorSocket) {
        io.to(operatorSocket).emit("pickup-issue-reported", {
          success: true,
          orderId: order._id,
          issue: issueObj,
          order: formatOrderPayload(order, PRICING_ROLES.OWNER),
        });
      }

      return formatOrderPayload(order, PRICING_ROLES.DRIVER);
    } catch (error) {
      logger.error("reportPickupIssue error:", error);
      throw error;
    }
  }

  /**
   * 12. Driver Workflow: Upload Pickup Proof (Before & After)
   */
  async uploadPickupProof(
    driverUserId,
    {
      orderId,
      beforePickupPhotos = [],
      afterPickupPhotos = [],
      pickupNotes = "",
      currentlat,
      currentlng,
    },
  ) {
    try {
      const order = await Order.findById(orderId);
      if (!order) throw new NotFoundError("Order not found");

      const before = Array.isArray(beforePickupPhotos)
        ? beforePickupPhotos
        : [beforePickupPhotos];
      const after = Array.isArray(afterPickupPhotos)
        ? afterPickupPhotos
        : [afterPickupPhotos];

      if (!order.pickupWorkflow) order.pickupWorkflow = {};
      const existingBefore = order.pickupWorkflow.beforePickupPhotos || [];
      const existingAfter = order.pickupWorkflow.afterPickupPhotos || [];
      order.pickupWorkflow.beforePickupPhotos = Array.from(
        new Set([...existingBefore, ...before]),
      );
      order.pickupWorkflow.afterPickupPhotos = Array.from(
        new Set([...existingAfter, ...after]),
      );
      if (pickupNotes) order.pickupWorkflow.pickupNotes = pickupNotes;

      await order.save();

      return formatOrderPayload(order, PRICING_ROLES.DRIVER);
    } catch (error) {
      logger.error("uploadPickupProof error:", error);
      throw error;
    }
  }

  /**
   * 13. Driver Workflow: Complete Pickup
   */
  async completePickup(driverUserId, { orderId }) {
    try {
      const order = await Order.findById(orderId);
      if (!order) throw new NotFoundError("Order not found");

      const pickedUpAt = new Date();
      order.pickupWorkflow.status = "picked_up";
      order.pickupWorkflow.pickedUpAt = pickedUpAt;
      await order.save();

      // Trigger full order completion and financial settlement
      return await this.completeOrderAssignUser(orderId, order.to_id);
    } catch (error) {
      logger.error("completePickup error:", error);
      throw error;
    }
  }

  /**
   * 14. Driver Workflow: Complete Dumpster Swap
   */
  async completeSwap(
    driverUserId,
    {
      orderId,
      existingUnitPhotos = [],
      replacementUnitNumber = "",
      replacementPhotos = [],
      swapNotes = "",
    },
  ) {
    try {
      const order = await Order.findById(orderId);
      if (!order) throw new NotFoundError("Order not found");

      const existingPhotos = Array.isArray(existingUnitPhotos)
        ? existingUnitPhotos
        : [existingUnitPhotos];
      const newPhotos = Array.isArray(replacementPhotos)
        ? replacementPhotos
        : [replacementPhotos];

      order.swapWorkflow = {
        existingUnitPhotos: existingPhotos,
        replacementUnitNumber: replacementUnitNumber || "",
        replacementPhotos: newPhotos,
        swapNotes: swapNotes || "",
        completedAt: new Date(),
      };

      if (order.swapRequest) {
        order.swapRequest.status = "completed";
      }

      await order.save();

      await OrderTimeline.create({
        order: order._id,
        orderDeatil: order,
        message: `Dumpster swap completed. Replacement unit: ${replacementUnitNumber}`,
      });

      return formatOrderPayload(order, PRICING_ROLES.DRIVER);
    } catch (error) {
      logger.error("completeSwap error:", error);
      throw error;
    }
  }

  /**
   * 15. Operator Live Dashboard (All active jobs & drivers summary)
   */
  async getOperatorLiveDashboard(operatorId) {
    try {
      const activeOrders = await Order.find({
        to_id: operatorId,
        status: "accepted",
      })
        .populate(["user", "dumbster", "dustbin", "assignOrder"])
        .sort({ updatedAt: -1 })
        .lean();

      const driversResult = await this.getOperatorDrivers(operatorId);

      const liveJobs = activeOrders.map((o) => {
        let liveStatusText = "UNASSIGNED";
        let assignedDriverName = "Unassigned";

        if (o.pickupWorkflow?.status && o.pickupWorkflow.status !== "none") {
          assignedDriverName = o.pickupWorkflow.assignedDriverName || "Driver";
          liveStatusText = `PICKUP ${o.pickupWorkflow.status.toUpperCase().replace("_", " ")}`;
        } else if (o.deliveryWorkflow?.status) {
          assignedDriverName =
            o.deliveryWorkflow.assignedDriverName ||
            (o.deliveryWorkflow.assignedDriverType === "self"
              ? "OWNER"
              : "Driver");
          liveStatusText = `DELIVERY ${o.deliveryWorkflow.status.toUpperCase().replace("_", " ")}`;
        }

        return {
          orderId: o._id,
          orderNumber: o.orderNumber || o._id.toString().slice(-6),
          service_type: o.service_type,
          customerName: o.user?.name || "Customer",
          address: o.address,
          assignedDriverName,
          liveStatusText,
          deliveryWorkflow: o.deliveryWorkflow,
          pickupWorkflow: o.pickupWorkflow,
          swapWorkflow: o.swapWorkflow,
          order: formatOrderPayload(o, PRICING_ROLES.OWNER),
        };
      });

      return {
        totalActiveJobs: liveJobs.length,
        drivers: driversResult.drivers,
        operator: driversResult.operator,
        liveJobs,
      };
    } catch (error) {
      logger.error("getOperatorLiveDashboard error:", error);
      throw error;
    }
  }
}

export default new AssignOrderService();
