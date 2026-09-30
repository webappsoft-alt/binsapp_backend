import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import config from "../config/env.js";
// import redis from "../config/redis.js";
import logger from "../config/logger.js";
// Stripe
import { generateOTP } from "../utils/Generator.js";
import { sendNotification } from "../utils/notifications.js";
//Models
import Dustbin from "../models/Dustbin.js";
import Dumbster from "../models/Dumbster.js";
import Order from "../models/Order.js";
import User from "../models/User.js";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import TransactionModel from "../models/Transaction.js";
import OrderTimeline from "../models/OrderTimeline.js";
import AdminManualReviewRequest from "../models/AdminManualReviewRequests.js";
// import
import mongoose from "mongoose";
import { sendOrderEmailToUser } from "../utils/emailservice.js";
import { isValidObjectId } from "../utils/_idvalidationhelper.js";
import { AssignOrder } from "../models/AssignOrder.js";
import { ForbiddenError } from "../utils/apiError.js";
import JobEvent from "../models/JobEvent.js";
import { ScoreEngine } from "../modules/scoring/scoreEngine.js";
import DispatchService from "../utils/dispatchService.js";
import { initDispatchWorker } from "../utils/dispatchWorker.js";
import { initOrderExpiryWorker } from "../utils/orderExpiryWorker.js";
import {
  verifyHold,
  verifyExtensionPayment,
  captureHold,
  releaseHold,
  computeSplit,
  stripeClient,
} from "../utils/paymentHold.js";
import {
  scheduleOrderExpiry,
  cancelOrderExpiry,
} from "../utils/orderExpiryService.js";
import { orderMessages, timelineEntry } from "../utils/orderMessages.js";
import { isDeliveredOnTime } from "../utils/deliveryTiming.js";
// import { orderChangeOfferTemplate } from "../utils/emailTemplate.js";
import {
  orderChangeOfferTemplate,
  buttonTemplate,
  offerAcceptedTemplate,
} from "../utils/emailTemplate.js";
import Support from "../models/Support.js";
import JunkRemoval from "../models/JunkRemoval.js";
import TreeRemoval from "../models/TreeRemoval.js";
import { formatOrderPayload, PRICING_ROLES } from "../utils/orderPricing.js";
import {
  buildDustbinMatchQuery,
  buildServiceQueryForType,
  findNearbyDustbinProviders,
  resolveCompanyTopTier,
} from "../utils/dustbinMatching.js";
import { findNearbyJunkOperators } from "../utils/junkOperatorMatching.js";
import Company from "../models/Company.js";
import {
  quoteCommercialDumpster,
  normalizeCommercialSize,
} from "../utils/commercialPricing.js";
import { createOrAppendInvoiceLine } from "../utils/commercialBilling.js";
import {
  applyGrowthPenalty,
  recomputeOperatorGrowth,
} from "../utils/growthEngine.js";
import { processTreeAnalysisInBackground } from "../utils/OpenAIVisionBackgroundProcessor.js";
import { processJunkAnalysisInBackground } from "../utils/JunkRemovalVisionProcessor.js";
// import ServicePayment from "../modules/services_payment/service.js";
import { initSalesAgentSocket } from "../modules/sales_agent/socket/salesAgentSocket.js";
import { initBuilderOfferSocket } from "../modules/builderOffer/socket.js";

// Map to track connected users (userId -> socketId)
export const connectedUsers = new Map();
// At the end of socket.js
export let io = null;
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

function isAdminReviewApproved(status) {
  return status === "accepted" || status === "approved";
}

async function consumeApprovedManualReview({ userId, reviewId, callback }) {
  if (!reviewId) return true;

  const review = await AdminManualReviewRequest.findOne({
    _id: reviewId,
    userId,
  });

  if (!review || !isAdminReviewApproved(review.status)) {
    callback({
      success: false,
      message: "Your request is not accepted by admin yet.",
    });
    return false;
  }

  if (review.userAcceptedStatus === "cancelled") {
    callback({
      success: false,
      message: `You already ${review.userAcceptedStatus.toUpperCase()} this request.`,
    });
    return false;
  }

  if (review.userAcceptedStatus === "pending") {
    await AdminManualReviewRequest.updateOne(
      { _id: review._id, userId },
      { userAcceptedStatus: "accepted" },
    );
  }

  return true;
}

function parseLocationCoordinates(location) {
  const coords = location?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) {
    return null;
  }
  const longitude = parseFloat(coords[0]);
  const latitude = parseFloat(coords[1]);
  if (Number.isNaN(longitude) || Number.isNaN(latitude)) {
    return null;
  }
  return { longitude, latitude };
}

function respondSocket(callback, payload) {
  if (typeof callback === "function") {
    callback(payload);
    return;
  }
  logger.warn("Socket handler invoked without callback", { payload });
}

// Helper function to check date overlap
function isOverlapping(
  newStartDate,
  newEndDate,
  existingStartDate,
  existingEndDate,
) {
  return newStartDate <= existingEndDate && newEndDate >= existingStartDate;
}

/**
 * Normalize a dumpster yard size for comparison. Handles numbers, plain strings,
 * "X Yard"/"X yd" suffixes, and range sizes like "18-20". Examples:
 *   30, "30", "30 Yard" -> "30"      |     "18-20", "18-20 Yard" -> "18-20"
 */
function normalizeYardSize(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value)
    .trim()
    .toLowerCase()
    .replace(/yards?|yd/g, "")
    .replace(/\s+/g, "");
  return normalized || null;
}

export const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
      credentials: true,
    },
    transports: ["websocket", "polling"],
  });

  // Initialize BullMQ Dispatch Worker with io instance
  initDispatchWorker(io);
  initOrderExpiryWorker(io);
  initSalesAgentSocket(io);
  initBuilderOfferSocket(io);

  io.use(async (socket, next) => {
    try {
      // console.log(socket.handshake, "socket.handshake.auth");
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error("Authentication error: No token provided"));
      }

      const secret = config.get("jwtSecret");
      const decoded = jwt.verify(token, secret);
      // console.log("decoded", decoded);
      if (decoded.assignOrder) {
        const user = await AssignOrder.findById(decoded._id).populate(
          "subUserDetail",
        );
        if (!user) throw new ForbiddenError("User no longer exists");
        // console.log(user);
        // Optional: block non-active users
        // if (user.status === "completed" || user.status === "cancelled") {
        //   throw new ForbiddenError(`User account is ${user.status}`);
        // }

        // Attach to request
        socket.user = user.subUserDetail;
        socket.orderId = user.orderId;
        socket.assignBy = user.assignBy;
        // req.token = token;
        next();
      } else {
        const user = await User.findById(decoded._id);

        if (!user) {
          return next(new Error("Authentication error: User not found"));
        }

        socket.user = user;
        next();
      }
    } catch (err) {
      console.log(err);
      next(new Error("Authentication error: Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    /**
     * REAL-TIME COMMUNICATION ENGINE
     * This module handles all socket-based events including:
     * - Order Management & Requests
     * - Live Location Tracking
     * - Real-time Chat & Messaging
     * - Admin Notifications
     */
    logger.info(
      `New connection socketId: ${socket.id} (UserId: ${socket.user._id}, User Name:${socket.user.name})`,
    );

    connectedUsers.set(socket.user._id.toString(), socket.id);
    socket.join(`user_${socket.user._id}`);

    socket.on("reassignOrder", async (data, callback) => {
      try {
        const cb = typeof callback === "function" ? callback : () => {};

        // 1. Admin Authorization Check
        if (socket.user.role !== "admin") {
          return cb({
            success: false,
            message:
              "Unauthorized: Only system administrators can reassign orders",
          });
        }

        const { orderId, serviceType, operatorId } = data || {};

        if (!orderId || !operatorId) {
          return cb({
            success: false,
            message:
              "Both orderId and operatorId are required for order reassignment",
          });
        }

        if (!isValidObjectId(orderId) || !isValidObjectId(operatorId)) {
          return cb({
            success: false,
            message: "Invalid orderId or operatorId format provided",
          });
        }

        // 2. Fetch Order and populated details
        const order = await Order.findById(orderId)
          .populate("user")
          .populate("to_id")
          .populate("dumbster")
          .populate("portaPotty")
          .populate("junkRemoval")
          .populate("treeRemoval");

        if (!order) {
          return cb({
            success: false,
            message: "Order not found",
          });
        }

        const targetOperator = await User.findById(operatorId);
        if (!targetOperator) {
          return cb({
            success: false,
            message: "Target operator not found",
          });
        }

        const previousOperator = order.to_id;
        if (
          previousOperator &&
          previousOperator._id.toString() === operatorId.toString()
        ) {
          return cb({
            success: false,
            message: "This order is already assigned to the selected operator",
          });
        }

        // 3. Service Type Determination & Inventory Verification
        const rawServiceType = String(
          serviceType || order.service_type || "Dumbster",
        ).trim();
        const normalizedType = rawServiceType.toLowerCase();

        let assignedDustbin = null;

        if (
          normalizedType.includes("dumbster") ||
          normalizedType.includes("dumpster")
        ) {
          // Check target operator's active Dustbin listing for this Dumbster catalog ID
          const dumbsterId = order.dumbster?._id || order.dumbster;
          assignedDustbin = await Dustbin.findOne({
            user: targetOperator._id,
            dumbster: dumbsterId,
            verify: true,
            status: "active",
          });

          if (
            !assignedDustbin ||
            (assignedDustbin.quantity != null && assignedDustbin.quantity <= 0)
          ) {
            return cb({
              success: false,
              message:
                "The selected operator does not have available active inventory for this Dumpster service",
            });
          }
        } else if (
          normalizedType.includes("portapotty") ||
          normalizedType.includes("porta")
        ) {
          // Check target operator's active Dustbin listing for this PortaPotty catalog ID
          const portaPottyId = order.portaPotty?._id || order.portaPotty;
          assignedDustbin = await Dustbin.findOne({
            user: targetOperator._id,
            portaPotty: portaPottyId,
            verify: true,
            status: "active",
          });

          if (
            !assignedDustbin ||
            (assignedDustbin.quantity != null && assignedDustbin.quantity <= 0)
          ) {
            return cb({
              success: false,
              message:
                "The selected operator does not have available active inventory for this Porta Potty service",
            });
          }
        } else if (normalizedType.includes("junk")) {
          // Direct assignment for Junk Removal (no Dustbin inventory check)
        } else if (normalizedType.includes("tree")) {
          // Direct assignment for Tree Removal (no Dustbin inventory check)
        }

        // 4. Previous Operator Score Reduction & Event Logging
        if (previousOperator && previousOperator._id) {
          const prevOperatorId = previousOperator._id.toString();
          try {
            await JobEvent.create({
              operatorId: prevOperatorId,
              orderId: order._id,
              eventType: "JOB_CANCELLED",
            });

            // Recalculate performance score dynamically via ScoreEngine
            ScoreEngine.calculateOperatorScore(prevOperatorId).catch(
              (scoreErr) =>
                logger.error(
                  `Score recalculation failed on reassignment for previous operator ${prevOperatorId}`,
                  scoreErr,
                ),
            );
          } catch (jobEventErr) {
            logger.error(
              `Failed to log reassignment cancellation event for previous operator ${prevOperatorId}`,
              jobEventErr,
            );
          }

          // Send notification & socket event to Previous Operator informing them of reassignment
          const orderRefStr = order._id.toString().slice(-6).toUpperCase();
          const prevOpMessage = `Order #${orderRefStr} has been reassigned to another operator by Admin.`;

          await sendNotification({
            to_id: prevOperatorId,
            user: order.user?._id || order.user,
            title: "Order Reassigned by Admin",
            description: prevOpMessage,
            type: "order_reassigned",
            order: order._id,
            email: previousOperator.email || "",
            fcmtoken: previousOperator.fcmtoken || "",
            isImportant: true,
          }).catch((err) =>
            logger.warn("Failed to notify previous operator:", err.message),
          );

          const prevOpSocket = connectedUsers.get(prevOperatorId);
          if (prevOpSocket) {
            io.to(prevOpSocket).emit("order:reassigned_from", {
              orderId: order._id,
              message: prevOpMessage,
            });
          }
        }

        // 5. Update Order & Reassign to New Operator
        order.to_id = targetOperator._id;
        if (assignedDustbin) {
          order.dustbin = assignedDustbin._id;
        }
        order.status = "accepted";
        order.reAssign = true;
        // Reset sub-user/driver assignment if present
        if (order.deliveryWorkflow) {
          order.deliveryWorkflow.assignedDriver = null;
          order.deliveryWorkflow.assignedDriverName = "";
          order.deliveryWorkflow.assignedDriverPhone = "";
          order.deliveryWorkflow.status = "unassigned";
        }
        order.assignOrder = null;

        await order.save();

        // 6. Update Order Timeline
        const orderRef = order._id.toString().slice(-6).toUpperCase();
        const targetOpName =
          targetOperator.companyName ||
          targetOperator.name ||
          targetOperator.email ||
          "New Provider";

        await OrderTimeline.create({
          order: order._id,
          orderDeatil: order,
          message: `Order #${orderRef} reassigned by Admin to operator ${targetOpName}.`,
          customerMessage: `Your order #${orderRef} has been reassigned to provider ${targetOpName}.`,
          operatorMessage: `Admin reassigned order #${orderRef} to you.`,
        });

        // 7. Send Comprehensive Notification & Email to New Operator
        const startDateStr = order.start_date
          ? new Date(order.start_date).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : "N/A";
        const endDateStr = order.end_date
          ? new Date(order.end_date).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : "N/A";

        const newOpTitle = "New Order Reassigned To You!";
        const newOpDesc = `Admin reassigned Order #${orderRef} (${order.service_type || "Bin Service"}) to you. Delivery Address: ${order.address || "N/A"}. Scheduled Date: ${startDateStr}.`;

        const emailHtml = buttonTemplate(
          `https://api.binsapp.ai/order-details/${order._id}`,
          newOpTitle,
          `Hello ${targetOperator.name || "Operator"},<br><br>` +
            `An order has been directly reassigned to you by the Admin.<br><br>` +
            `<strong>Order Ref:</strong> #${orderRef}<br>` +
            `<strong>Service Type:</strong> ${order.service_type || "Bin Service"}<br>` +
            `<strong>Delivery Address:</strong> ${order.address || "N/A"}<br>` +
            `<strong>Delivery Date:</strong> ${startDateStr} - ${endDateStr}<br>` +
            `<strong>Total Amount:</strong> $${order.price || order.amount || 0}<br><br>` +
            `Please log into your dashboard to review full order details and dispatch your team.`,
        );

        await sendNotification({
          to_id: targetOperator._id,
          user: order.user?._id || order.user,
          title: newOpTitle,
          description: newOpDesc,
          type: "order_reassigned",
          order: order._id,
          email: targetOperator.email || "",
          fcmtoken: targetOperator.fcmtoken || "",
          isImportant: true,
          customEmailTemplate: true,
          html: emailHtml,
        }).catch((err) =>
          logger.warn("Failed to notify target operator:", err.message),
        );

        const targetOpSocket = connectedUsers.get(
          targetOperator._id.toString(),
        );
        if (targetOpSocket) {
          io.to(targetOpSocket).emit("order:reassigned_to", {
            success: true,
            message: "New order assigned by admin",
            order: formatOrderPayload(order, PRICING_ROLES.OWNER),
          });
        }

        // 8. Return Success Callback
        return cb({
          success: true,
          message: "Order reassigned successfully",
          data: formatOrderPayload(order, PRICING_ROLES.OWNER),
        });
      } catch (error) {
        logger.error("Error in reassignOrder socket listener:", error);
        const cb = typeof callback === "function" ? callback : () => {};
        return cb({
          success: false,
          message:
            error.message ||
            "An unexpected error occurred during order reassignment",
        });
      }
    });

    //==========================================
    //  AI Assessment for Tree Removal
    // ==========================================
    socket.on("analyze-tree-job", async (data, callback) => {
      logger.info(
        `🚀 [Socket: analyze-tree-job] Received request from client ${socket.id}`,
      );

      try {
        const { imageUrls, region = "global" } = data || {};

        // 1. Input Validation
        if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
          const validationError = {
            success: false,
            message:
              "At least one valid Firebase image URL is required in imageUrls array.",
          };
          logger.warn(
            `⚠️ [Socket: analyze-tree-job] Invalid payload from client ${socket.id}`,
          );

          if (typeof callback === "function") {
            return callback(validationError);
          }
          return socket.emit("tree-analysis-failed", validationError);
        }

        // 2. Process Background AI Vision & Pricing Engine
        const analysisResult = await processTreeAnalysisInBackground(
          imageUrls,
          region,
        );
        logger.info(
          `✅ [Socket: analyze-tree-job] Successfully processed tree analysis result: ${JSON.stringify(analysisResult, null, 2) || "N/A"}`,
        );

        const responsePayload = {
          success: true,
          userId: socket.user._id.toString() || null,
          data: analysisResult,
          timestamp: new Date().toISOString(),
        };

        logger.info(
          `✅ [Socket: analyze-tree-job] Successfully processed tree analysis for job: ${(socket.user._id.toString(), JSON.stringify(responsePayload, null, 2) || "N/A")}`,
        );

        // 3. Dual Response Handling (Callback + Emit event)
        if (typeof callback === "function") {
          callback(responsePayload);
        } else {
          socket.emit("tree-analysis-completed", responsePayload);
        }
      } catch (error) {
        logger.error(
          `❌ [Socket: analyze-tree-job] Error processing job: ${error.message}`,
          { stack: error.stack },
        );

        const errorPayload = {
          success: false,
          message: error.message || "An error occurred during tree analysis.",
        };

        if (typeof callback === "function") {
          callback(errorPayload);
        } else {
          socket.emit("tree-analysis-failed", errorPayload);
        }
      }
    });

    //==========================================
    //  AI Assessment for Junk Removal
    // ==========================================
    socket.on("analyze-junk-job", async (data, callback) => {
      logger.info(
        `🚀 [Socket: analyze-junk-job] Received request from client ${socket.id}`,
      );

      try {
        const { imageUrls, region = "global" } = data || {};

        // 1. Input Validation
        if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
          const validationError = {
            success: false,
            message:
              "At least one valid Firebase image URL is required in imageUrls array.",
          };
          logger.warn(
            `⚠️ [Socket: analyze-junk-job] Invalid payload from client ${socket.id}`,
          );
          if (typeof callback === "function") {
            return callback(validationError);
          }
          return socket.emit("junk-analysis-failed", validationError);
        }

        // 2. Process Background AI Vision & Pricing Engine
        const analysisResult = await processJunkAnalysisInBackground(
          imageUrls,
          region,
        );
        logger.info(
          `✅ [Socket: analyze-junk-job] Successfully processed junk analysis: ${JSON.stringify(analysisResult, null, 2) || "N/A"}`,
        );

        const responsePayload = {
          success: true,
          userId: socket.user._id.toString() || null,
          data: analysisResult,
          timestamp: new Date().toISOString(),
        };

        // 3. Dual Response Handling (Callback + Emit event)
        if (typeof callback === "function") {
          callback(responsePayload);
        } else {
          socket.emit("junk-analysis-completed", responsePayload);
        }
      } catch (error) {
        logger.error(
          `❌ [Socket: analyze-junk-job] Error processing job: ${error.message}`,
          { stack: error.stack },
        );

        const errorPayload = {
          success: false,
          message:
            error.message || "An error occurred during junk removal analysis.",
        };

        if (typeof callback === "function") {
          callback(errorPayload);
        } else {
          socket.emit("junk-analysis-failed", errorPayload);
        }
      }
    });

    socket.on("admin-manual-review", async (data, callback) => {
      logger.info(
        `🚀 [Socket: admin-manual-review] Received request from client ${socket.id}`,
      );

      try {
        const {
          start_date,
          end_date,
          location,
          time,
          images,
          address,
          service_type = "Tree Removal",
          metadata = {},
          companyId,
          jobSiteId,
          dumbsterId,
          price,
          num_days,
          materialInformation,
          insurance,
          image,
          placementLocation,
          placementNote,
          quantity,
          category,
          catagory,
          subCategory,
          subCatagory,
          portaPottyId,
          paymentId,
          driveaway,
          cancelation,
          cancellation_insurance,
          insurance_protection,
          payment_type,
          size,
          _id,
        } = data || {};

        const userId = socket.user?._id || data?.userId;

        const enrichedMetadata = {
          ...(typeof metadata === "object" ? metadata : {}),
          companyId,
          jobSiteId,
          dumbsterId,
          price,
          num_days,
          materialInformation,
          insurance,
          image,
          placementLocation,
          placementNote,
          quantity,
          category: category || catagory,
          subCategory: subCategory || subCatagory,
          portaPottyId,
          paymentId,
          driveaway,
          cancelation,
          cancellation_insurance,
          insurance_protection,
          payment_type,
          size,
        };

        const imageList = Array.isArray(images) ? images : image ? [image] : [];

        const updateData = {
          userId,
          start_date,
          end_date,
          location,
          time: Array.isArray(time) ? time : time ? [time] : [],
          images: imageList,
          address,
          service_type: normalizeServiceType(service_type),
          metadata: enrichedMetadata,
          status: "pending",
          userAcceptedStatus: "pending",
        };

        let manualReviewRequest;
        if (_id) {
          manualReviewRequest =
            await AdminManualReviewRequest.findByIdAndUpdate(_id, updateData, {
              new: true,
            });
        }
        if (!manualReviewRequest) {
          manualReviewRequest = new AdminManualReviewRequest(updateData);
          await manualReviewRequest.save();
        }

        // Broadcast real-time high-priority notification to Admin Dashboard
        const adminUsers = await User.find({
          $or: [{ type: "admin" }, { role: "admin" }],
        })
          .select("_id fcmtoken email")
          .lean();

        for (const adminUser of adminUsers) {
          await sendNotification({
            user: userId ? userId.toString() : "",
            to_id: adminUser._id.toString(),
            type: "admin-noti",
            title: "New Manual Review Request",
            description: `Custom quote request submitted for ${service_type} requiring manual intervention.`,
            fcmtoken: adminUser.fcmtoken || "",
            email: adminUser.email || "",
            request: manualReviewRequest._id,
            isImportant: true,
            metadata: {
              requestId: manualReviewRequest._id.toString(),
              service_type,
              userId: userId ? userId.toString() : "",
            },
          });
        }

        // Broadcast real-time WebSocket event to Admin Dashboard
        io.emit("admin-manual-review", {
          success: true,
          message: "New manual review request submitted",
          isImportant: true,
          data: manualReviewRequest,
        });

        const payload = {
          success: true,
          message: "Manual review request submitted successfully",
          data: manualReviewRequest,
        };

        if (typeof callback === "function") {
          callback(payload);
        } else {
          socket.emit("admin-manual-review-success", payload);
        }
      } catch (error) {
        logger.error(
          `❌ [Socket: admin-manual-review] Error processing manual review: ${error.message}`,
          { stack: error.stack },
        );

        const errorPayload = {
          success: false,
          message:
            error.message ||
            "An error occurred during manual review request submission.",
        };

        if (typeof callback === "function") {
          callback(errorPayload);
        } else {
          socket.emit("admin-manual-review-failed", errorPayload);
        }
      }
    });

    // ==========================================
    // ORDER MANAGEMENT & REQUESTS
    // ==========================================

    // Check Servivce Provider is Available or Not in that area or not

    socket.on(
      "check-service-provider-availability",
      async (
        {
          companyId,
          dumbsterId,
          start_date,
          end_date,
          location,
          num_days,
          time,
          materialInformation,
          quantity,
          // Accept both correct + misspelled keys from frontend
          service_type = "Dumbster",
          portaPottyId,
        },
        callback,
      ) => {
        try {
          const senderId = socket.user._id.toString();
          const resolvedServiceType = normalizeServiceType(service_type);
          const coords = parseLocationCoordinates(location);
          const requestedQuantity = Number(quantity) > 0 ? Number(quantity) : 1;

          if (!senderId) {
            return respondSocket(callback, {
              success: false,
              message: "Sender not found!",
            });
          }

          if (!coords) {
            return respondSocket(callback, {
              success: false,
              title: "Validation Error",
              message: "Valid location coordinates are required.",
            });
          }

          if (
            resolvedServiceType === "Dumbster" &&
            !isValidObjectId(dumbsterId)
          ) {
            return respondSocket(callback, {
              success: false,
              title: "Validation Error",
              message: "A valid dumpster id is required.",
            });
          }

          if (
            resolvedServiceType === "Porta Potty" &&
            !isValidObjectId(portaPottyId)
          ) {
            return respondSocket(callback, {
              success: false,
              title: "Validation Error",
              message: "A valid porta potty id is required.",
            });
          }

          const existingSearchingOrder = await Order.findOne({
            user: new mongoose.Types.ObjectId(senderId),
            status: "pending",
            paymentId: { $ne: null },
            to_id: null,
          });
          if (existingSearchingOrder) {
            return respondSocket(callback, {
              success: false,
              message:
                "You already have an active request searching for a provider.",
              existing: true,
            });
          }

          const uniqueUsersMap = new Map();
          let uniqueUserObjects = [];

          if (
            resolvedServiceType === "Dumbster" ||
            resolvedServiceType === "Porta Potty"
          ) {
            const { topTier, cascade: tierCascade } =
              await resolveCompanyTopTier(companyId);
            const serviceQuery = buildServiceQueryForType({
              serviceType: resolvedServiceType,
              dumbsterId,
              portaPottyId,
              verify: true,
            });

            const matchResult = await findNearbyDustbinProviders({
              serviceQuery,
              start_date,
              end_date,
              quantity: requestedQuantity,
              latitude: coords.latitude,
              longitude: coords.longitude,
              companyId,
              topTier,
              cascade: tierCascade,
              onlineOnly: false,
            });

            uniqueUserObjects = matchResult.providers;
            const {
              providersInArea,
              providersOnline,
              matchedTier,
              cascadedFrom,
            } = matchResult;

            logger.info("check-service-provider-availability.dumbster", {
              dumbsterId,
              companyId: companyId || null,
              topTier,
              tierCascade,
              matchedTier,
              cascadedFrom,
              providersInArea,
              providersOnline,
              customerCoords: [coords.longitude, coords.latitude],
            });

            if (providersInArea === 0) {
              return respondSocket(callback, {
                success: false,
                title: "Request Error",
                message: `${resolvedServiceType} not found in that area.`,
              });
            }

            return respondSocket(callback, {
              success: true,
              title: "Request Sent",
              message:
                providersOnline > 0
                  ? "Request sent successfully"
                  : "Service available in this area; providers are currently offline.",
              uniqueUserObjects: uniqueUserObjects.filter(
                (u) => u.status === "online",
              ),
              providersInArea,
              providersOnline,
            });
          } else if (resolvedServiceType === "Junk Removal") {
            // Fan out to nearby renters even without junk signup / Stripe.
            // Accept flow still requires insurance + signup + Stripe.
            uniqueUserObjects = await findNearbyJunkOperators({
              latitude: coords.latitude,
              longitude: coords.longitude,
              onlineOnly: true,
              excludeUserId: socket.user?._id,
            });
            if (uniqueUserObjects.length == 0) {
              return respondSocket(callback, {
                success: false,
                title: "Request Error",
                message: "No junk removal found in that area.",
              });
            }
          } else if (resolvedServiceType === "Tree Removal") {
            const userLng = coords.longitude;
            const userLat = coords.latitude;
            const milesToMeters = 1609.34;
            const maxDistanceInMeters = 50 * milesToMeters;
            const treeRemoval = await TreeRemoval.aggregate([
              {
                $geoNear: {
                  near: {
                    type: "Point",
                    coordinates: [userLng, userLat],
                  },
                  distanceField: "distanceInMeters",
                  maxDistance: maxDistanceInMeters,
                  spherical: true,
                },
              },
              {
                $match: {
                  status: "approved",
                },
              },
              {
                $lookup: {
                  from: "users",
                  localField: "userId",
                  foreignField: "_id",
                  as: "user",
                },
              },
              {
                $unwind: "$user",
              },
              {
                $match: {
                  "user.status": "online",
                },
              },
              {
                $addFields: {
                  distanceInMiles: { $divide: ["$distanceInMeters", 1609.34] },
                },
              },
            ]);
            treeRemoval.forEach((item) => {
              const user = item?.user;
              if (user && user.status === "online") {
                uniqueUsersMap.set(user._id.toString(), {
                  userId: user._id.toString(),
                  fcmtoken: user.fcmtoken,
                  email: user.email || "",
                });
              }
            });
            // console.log("List of Tree Removal", treeRemoval);
            uniqueUserObjects = Array.from(uniqueUsersMap.values());
            if (uniqueUserObjects.length == 0) {
              return respondSocket(callback, {
                success: false,
                title: "Request Error",
                message: "No tree removal found in that area.",
              });
            }
          } else {
            return respondSocket(callback, {
              success: false,
              title: "Validation Error",
              message: `Unsupported service type: ${service_type}`,
            });
          }
          if (uniqueUserObjects.length > 0) {
            return respondSocket(callback, {
              success: true,
              title: "Request Sent",
              message: "Request sent successfully",
              uniqueUserObjects: uniqueUserObjects,
            });
          }

          return respondSocket(callback, {
            success: false,
            title: "Request Error",
            message: "No service provider found in that area.",
          });
        } catch (error) {
          logger.error("check-service-provider-availability failed", {
            error: error.message,
            stack: error.stack,
            userId: socket.user?._id?.toString(),
            service_type,
          });
          respondSocket(callback, {
            success: false,
            title: "Error",
            message:
              error.message || "Failed to check service provider availability.",
          });
        }
      },
    );

    // send request to renter this socket run by Customer
    socket.on(
      "send-request-rentee",
      async (
        {
          companyId,
          jobSiteId,
          dumbsterId,
          start_date,
          end_date,
          price,
          location,
          address,
          num_days,
          time,
          materialInformation,
          insurance,
          image,
          placementLocation,
          placementNote,
          placementPhotos,
          drivewaySurfaceType,
          gateAccessCode,
          accessInstructions,
          obstaclesNotes,
          contactPreference,
          specialInstructions,
          quantity,
          // Accept both correct + misspelled keys from frontend
          category,
          catagory,
          subCategory,
          subCatagory,
          service_type = "Dumbster",
          images,
          // junkRemovalId,
          // treeRemovalId,
          portaPottyId,
          metadata,
          paymentId,
          driveaway,
          cancelation,
          cancellation_insurance,
          insurance_protection,
          payment_type,
          size,
          menual_review_id,
          manual_review_id,
        },
        callback,
      ) => {
        try {
          const senderId = socket.user._id.toString();
          service_type = normalizeServiceType(service_type);
          const reviewId = menual_review_id || manual_review_id;
          if (!senderId) {
            callback({
              success: false,
              message: "Sender not found!",
            });
            return;
          }

          // Commercial path only when a real company id is present. Consumer
          // bookings (no companyId) keep client price / stripe|wallet flow.
          // If companyId is sent but the selected dumpster is not a commercial
          // 20/30/40 size (or size cannot be resolved), fall back to consumer
          // pricing instead of hard-failing the request.
          let commercialCompany = null;
          let commercialQuote = null;
          let companyPaymentMethod = null;
          let authoritativePrice = Number(price);
          const resolvedCompanyId =
            companyId && isValidObjectId(companyId) ? companyId : null;

          if (resolvedCompanyId) {
            commercialCompany =
              await Company.findById(resolvedCompanyId).lean();
            if (!commercialCompany) {
              return callback({
                success: false,
                title: "Validation Error",
                message: "Company not found.",
              });
            }
            if (commercialCompany.status !== "approved") {
              return callback({
                success: false,
                title: "Company Pending",
                message: "Commercial builder account is not approved yet.",
              });
            }
            companyPaymentMethod = commercialCompany.paymentMethod || "card";

            let dumpsterSizeHint = null;
            if (dumbsterId && isValidObjectId(dumbsterId)) {
              const selectedDumpster = await Dumbster.findById(dumbsterId)
                .select("size")
                .lean();
              dumpsterSizeHint = normalizeCommercialSize(
                selectedDumpster?.size,
              );
            }
            const commercialSizeHint =
              normalizeCommercialSize(size) ||
              normalizeCommercialSize(metadata?.size) ||
              dumpsterSizeHint;

            // Quote when we have a commercial size or a job site (defaultSize).
            // Otherwise treat as a normal dumpster booking under this account.
            if (commercialSizeHint || jobSiteId) {
              try {
                commercialQuote = await quoteCommercialDumpster({
                  companyId: resolvedCompanyId,
                  jobSiteId,
                  size: commercialSizeHint || undefined,
                  numDays: num_days,
                  quantity,
                  dumbsterId,
                  location,
                });
                authoritativePrice = Number(commercialQuote.price);
              } catch (quoteErr) {
                return callback({
                  success: false,
                  title: "Quote Error",
                  message:
                    quoteErr.message || "Failed to calculate commercial price.",
                });
              }
            } else {
              logger.info("send-request-rentee.consumer_under_company", {
                companyId: resolvedCompanyId,
                dumbsterId: dumbsterId || null,
                reason: "no_commercial_size",
              });
            }
          }

          let resolvedPaymentType =
            payment_type === "wallet" ? "wallet" : "stripe";
          // Invoice only for true commercial quotes (not consumer dumpsters
          // booked while a companyId happens to be on the payload).
          if (
            resolvedCompanyId &&
            companyPaymentMethod === "invoice" &&
            commercialQuote
          ) {
            resolvedPaymentType = "invoice";
          }
          let holdResult = null;

          if (resolvedPaymentType === "invoice") {
            // Invoice accounts skip Stripe holds entirely.
          } else if (resolvedPaymentType === "wallet") {
            const walletUser = await User.findById(senderId)
              .select("balance")
              .lean();
            if (
              !walletUser ||
              Number(walletUser.balance || 0) < Number(authoritativePrice)
            ) {
              return callback({
                success: false,
                title: "Payment Error",
                message: "Insufficient wallet balance.",
              });
            }
          } else {
            if (!paymentId) {
              return callback({
                success: false,
                title: "Payment Required",
                message:
                  "Payment authorization is required before sending a request.",
              });
            }

            holdResult = await verifyHold(paymentId);
            if (!holdResult.valid) {
              return callback({
                success: false,
                title: "Payment Error",
                message: holdResult.message || "Payment hold is not active.",
              });
            }
          }

          const existingSearchingOrder = await Order.findOne({
            user: new mongoose.Types.ObjectId(senderId),
            status: "pending",
            to_id: null,
            $or: [
              { paymentId: { $ne: null } },
              { payment_type: "wallet" },
              { payment_type: "invoice" },
            ],
          });
          if (existingSearchingOrder) {
            return callback({
              success: false,
              message:
                "You already have an active request searching for a provider.",
              existing: true,
            });
          }

          const bookingCoords = parseLocationCoordinates(location);
          if (!bookingCoords) {
            return callback({
              success: false,
              title: "Validation Error",
              message: "Valid location coordinates are required.",
            });
          }

          const uniqueUsersMap = new Map();
          let uniqueUserObjects = [];

          if (service_type === "Dumbster" || service_type === "Porta Potty") {
            const { topTier, cascade: tierCascade } =
              await resolveCompanyTopTier(
                commercialQuote ? resolvedCompanyId : null,
              );
            const serviceQuery = buildServiceQueryForType({
              serviceType: service_type,
              dumbsterId,
              portaPottyId,
              verify: true,
            });

            const matchResult = await findNearbyDustbinProviders({
              serviceQuery,
              start_date,
              end_date,
              quantity,
              latitude: bookingCoords.latitude,
              longitude: bookingCoords.longitude,
              companyId: commercialQuote ? resolvedCompanyId : null,
              topTier,
              cascade: tierCascade,
              onlineOnly: true,
            });

            uniqueUserObjects = matchResult.providers;

            if (uniqueUserObjects.length === 0) {
              return callback({
                success: false,
                title: "Request Error",
                message:
                  matchResult.providersInArea > 0
                    ? `${service_type} providers are currently offline in that area.`
                    : `${service_type} not found in that area.`,
              });
            }
          } else if (service_type === "Junk Removal") {
            const junkReviewOk = await consumeApprovedManualReview({
              userId: socket.user._id,
              reviewId,
              callback,
            });
            if (!junkReviewOk) return;

            // Fan out to nearby renters even without junk signup / Stripe.
            // Accept still gates on Stripe + insurance / junk signup.
            uniqueUserObjects = await findNearbyJunkOperators({
              latitude: bookingCoords.latitude,
              longitude: bookingCoords.longitude,
              onlineOnly: true,
              excludeUserId: senderId,
            });
            if (uniqueUserObjects.length == 0) {
              callback({
                success: false,
                title: "Request Error",
                message: "No junk removal found in that area.",
              });
              return;
            }
          } else if (service_type === "Tree Removal") {
            const userLng = location.coordinates[0];
            const userLat = location.coordinates[1];
            const treeReviewOk = await consumeApprovedManualReview({
              userId: socket.user._id,
              reviewId,
              callback,
            });
            if (!treeReviewOk) return;
            const milesToMeters = 1609.34;
            const maxDistanceInMeters = 50 * milesToMeters;
            const treeRemoval = await TreeRemoval.aggregate([
              {
                $geoNear: {
                  near: {
                    type: "Point",
                    coordinates: [userLng, userLat],
                  },
                  distanceField: "distanceInMeters",
                  maxDistance: maxDistanceInMeters,
                  spherical: true,
                },
              },
              {
                $match: {
                  status: "approved",
                },
              },
              {
                $lookup: {
                  from: "users",
                  localField: "userId",
                  foreignField: "_id",
                  as: "user",
                },
              },
              {
                $unwind: "$user",
              },
              {
                $match: {
                  "user.status": "online",
                },
              },
              {
                $addFields: {
                  distanceInMiles: { $divide: ["$distanceInMeters", 1609.34] },
                },
              },
              {
                $match: {
                  $expr: {
                    $lte: ["$distanceInMiles", "$radius"],
                  },
                },
              },
            ]);

            treeRemoval.forEach((item) => {
              const user = item?.user;
              if (user && user.status === "online") {
                uniqueUsersMap.set(user._id.toString(), {
                  userId: user._id.toString(),
                  fcmtoken: user.fcmtoken,
                  email: user.email || "",
                });
              }
            });
            // console.log("List of Tree Removal", treeRemoval);
            uniqueUserObjects = Array.from(uniqueUsersMap.values());
            if (uniqueUserObjects.length == 0) {
              callback({
                success: false,
                title: "Request Error",
                message: "No tree removal found in that area.",
              });
              return;
            }
          }
          const orderNumber = generateOTP(5, { alphabet: true, numeric: true });
          const categoryFinal = category ?? catagory ?? "";
          const subCategoryFinal = subCategory ?? subCatagory ?? "";
          const orderMetadata = {
            ...(metadata || {}),
            paymentHoldStatus:
              resolvedPaymentType === "invoice"
                ? "invoice_pending"
                : resolvedPaymentType === "wallet"
                  ? "wallet_reserved"
                  : holdResult?.status === "requires_capture"
                    ? "requires_capture"
                    : "pending_webhook",
            insurance_protection:
              metadata?.insurance_protection || insurance_protection,
            cancellation_insurance:
              metadata?.cancellation_insurance || cancellation_insurance,
            ...(commercialQuote
              ? {
                  quoteSource: commercialQuote.source,
                  quoteBreakdown: commercialQuote.breakdown,
                }
              : {}),
          };
          const newRequest = await Order.create({
            user: senderId,
            dumbster: dumbsterId || commercialQuote?.dumbsterId || null,
            start_date,
            end_date,
            service_type,
            price: authoritativePrice,
            location,
            address,
            num_days,
            time,
            materialInformation,
            insurance,
            image,
            category: categoryFinal,
            subCategory: subCategoryFinal,
            placementLocation,
            placementNote,
            placementPhotos: Array.isArray(placementPhotos)
              ? placementPhotos
              : placementPhotos
                ? [placementPhotos]
                : [],
            drivewaySurfaceType: drivewaySurfaceType || "",
            gateAccessCode: gateAccessCode || "",
            accessInstructions: accessInstructions || "",
            obstaclesNotes: obstaclesNotes || "",
            contactPreference: contactPreference || "call_on_arrival",
            specialInstructions: specialInstructions || "",
            userIds: uniqueUserObjects.map((item) => item.userId),
            orderNumber,
            quantity,
            amount: computeSplit(authoritativePrice, {
              driveaway: driveaway || false,
              cancelation: cancelation || false,
            }).amount,
            company: commercialQuote ? resolvedCompanyId : null,
            jobSite: commercialQuote ? jobSiteId || null : null,
            images: images || [],
            metadata: orderMetadata,
            portaPotty: portaPottyId || null,
            paymentId:
              resolvedPaymentType === "wallet" ||
              resolvedPaymentType === "invoice"
                ? null
                : paymentId,
            payment_type: resolvedPaymentType,
            driveaway: driveaway || false,
            cancelation: cancelation || false,
            ...(commercialQuote
              ? {
                  commercialSize: commercialQuote.size,
                  includedTons: commercialQuote.tonnage.includedTons,
                  overagePerTon: commercialQuote.tonnage.overagePerTon,
                  overageEnforced: commercialQuote.tonnage.overageEnforced,
                  perDiemRateSnapshot: commercialQuote.breakdown.perDiemRate,
                  companyPaymentMethod: companyPaymentMethod,
                }
              : {}),
          });

          if (resolvedPaymentType === "invoice" && resolvedCompanyId) {
            try {
              const billing = await createOrAppendInvoiceLine({
                companyId: resolvedCompanyId,
                userId: senderId,
                orderId: newRequest._id,
                amount: authoritativePrice,
                type: "order",
                description: `Commercial dumpster order ${orderNumber}`,
                metadata: { source: "send-request-rentee" },
              });
              newRequest.billingRecord = billing._id;
              await newRequest.save();
            } catch (billErr) {
              logger.error("Failed to create commercial invoice line", billErr);
            }
          }

          const customerName = socket.user?.name || "a customer";
          const copy = orderMessages.requestCreated({
            customerName,
            serviceType: service_type,
            order: newRequest,
          });

          if (
            resolvedPaymentType !== "wallet" &&
            resolvedPaymentType !== "invoice" &&
            paymentId
          ) {
            const existingDebit = await TransactionModel.findOne({
              stripePaymentIntentId: paymentId,
              type: "debit",
            });
            if (!existingDebit) {
              await TransactionModel.create({
                user: senderId,
                order: newRequest._id,
                amount: Number(authoritativePrice),
                type: "debit",
                stripePaymentIntentId: paymentId,
                metadata: {
                  source: "socket",
                  driveaway: driveaway || false,
                  cancelation: cancelation || false,
                  reason: copy.transactionReason,
                },
              });
            }
          }

          scheduleOrderExpiry(
            newRequest._id,
            resolvedPaymentType === "wallet" ||
              resolvedPaymentType === "invoice"
              ? null
              : paymentId,
          ).catch((err) =>
            logger.error("Failed to schedule order expiry", err),
          );
          // Parallelize fetching of the populated order and the admin user
          const [request, adminUser] = await Promise.all([
            Order.findById(newRequest._id)
              .populate("user")
              .populate("dumbster")
              .populate("portaPotty"),
            User.findOne({ $or: [{ type: "admin" }, { role: "admin" }] })
              .select("type role fcmtoken")
              .lean(),
          ]);

          await OrderTimeline.create({
            order: newRequest._id,
            orderDeatil: request,
            ...timelineEntry(copy),
          });
          // Send response to the client immediately
          callback({
            success: true,
            title: copy.callback.title,
            message: copy.callback.message,
            ...(commercialQuote
              ? {
                  price: authoritativePrice,
                  quote: commercialQuote,
                  paymentMethod: companyPaymentMethod,
                }
              : {}),
          });
          // Uber-style dispatch: owner notifications are sent by tier waves only.
          const notificationPromises = [];
          DispatchService.initializeDispatchWaves(
            newRequest,
            uniqueUserObjects.map((u) => u.userId),
          ).catch((err) =>
            logger.error("Priority Dispatch Initialization failed", err),
          );

          if (adminUser) {
            notificationPromises.push(
              (async () => {
                io.to(`user_${adminUser._id.toString()}`).emit("admin-noti", {
                  success: true,
                  title: copy.admin.title,
                  message: copy.admin.description,
                  type: "request",
                });
                return sendNotification({
                  user: senderId,
                  to_id: adminUser._id.toString(),
                  description: copy.admin.description,
                  type: "request",
                  title: copy.admin.title,
                  fcmtoken: adminUser?.fcmtoken || "",
                  order: newRequest._id,
                  email: "",
                });
              })(),
            );
          }
          Promise.all(notificationPromises).catch((err) => {
            console.error("Error sending notifications:", err);
            logger.error("Error sending notifications:", err.message);
          });
        } catch (error) {
          console.log(error);
          logger.error("Error sending private message:", error.message);
          // Handle error
          callback({
            success: false,
            title: "Error",
            message: error.message,
          });
        }
      },
    );

    // ======================================
    // SEND REPEAT REQUEST RENTEE (isolated)
    // Hybrid: orderId + paymentId; pending claim to prior owner only
    // ======================================
    socket.on(
      "send-repeat-request-rentee",
      async (
        {
          orderId,
          paymentId,
          payment_type,
          start_date,
          end_date,
          num_days,
          time,
          location,
          address,
          driveaway,
          cancelation,
        },
        callback,
      ) => {
        try {
          const senderId = socket.user._id.toString();
          if (!senderId) {
            return callback({
              success: false,
              message: "Sender not found!",
            });
          }

          if (!orderId || !isValidObjectId(orderId)) {
            return callback({
              success: false,
              title: "Request Error",
              message: "A valid orderId is required for repeat requests.",
            });
          }

          const resolvedPaymentType =
            payment_type === "wallet" ? "wallet" : "stripe";

          const priorOrder = await Order.findOne({
            _id: orderId,
            user: senderId,
          });
          if (!priorOrder) {
            return callback({
              success: false,
              title: "Request Error",
              message: "Prior order not found.",
            });
          }

          const priorOwnerId =
            priorOrder.to_id?._id?.toString() ||
            priorOrder.to_id?.toString() ||
            null;
          if (!priorOwnerId) {
            return callback({
              success: false,
              title: "Request Error",
              message: "Prior order has no assigned provider to repeat with.",
            });
          }

          const serviceType = priorOrder.service_type || "Dumbster";
          const needsDustbin =
            serviceType === "Dumbster" || serviceType === "Porta Potty";
          if (needsDustbin && !priorOrder.dustbin) {
            return callback({
              success: false,
              title: "Request Error",
              message: "Prior order has no linked dustbin for repeat booking.",
            });
          }

          const price = Number(priorOrder.price) || 0;
          let holdResult = null;

          if (resolvedPaymentType === "wallet") {
            const walletUser = await User.findById(senderId)
              .select("balance")
              .lean();
            if (!walletUser || Number(walletUser.balance || 0) < price) {
              return callback({
                success: false,
                title: "Payment Error",
                message: "Insufficient wallet balance.",
              });
            }
          } else {
            if (!paymentId) {
              return callback({
                success: false,
                title: "Payment Required",
                message:
                  "Payment authorization is required before sending a repeat request.",
              });
            }

            holdResult = await verifyHold(paymentId);
            if (!holdResult.valid) {
              return callback({
                success: false,
                title: "Payment Error",
                message: holdResult.message || "Payment hold is not active.",
              });
            }
          }

          const existingSearchingOrder = await Order.findOne({
            user: new mongoose.Types.ObjectId(senderId),
            status: "pending",
            to_id: null,
            $or: [{ paymentId: { $ne: null } }, { payment_type: "wallet" }],
          });
          if (existingSearchingOrder) {
            return callback({
              success: false,
              message:
                "You already have an active request searching for a provider.",
              existing: true,
            });
          }

          const resolvedStart = start_date || priorOrder.start_date;
          const resolvedEnd = end_date || priorOrder.end_date;
          const resolvedNumDays =
            num_days != null ? num_days : priorOrder.num_days;
          const resolvedTime = time != null ? time : priorOrder.time;
          const resolvedLocation = location || priorOrder.location;
          const resolvedAddress =
            address != null ? address : priorOrder.address;
          const resolvedDriveaway =
            driveaway != null ? driveaway : priorOrder.driveaway || false;
          const resolvedCancelation =
            cancelation != null ? cancelation : priorOrder.cancelation || false;

          if (!resolvedStart || !resolvedEnd) {
            return callback({
              success: false,
              title: "Request Error",
              message: "start_date and end_date are required.",
            });
          }

          const startDateObj = new Date(resolvedStart);
          const endDateObj = new Date(resolvedEnd);
          // if (
          //   Number.isNaN(startDateObj.getTime()) ||
          //   Number.isNaN(endDateObj.getTime()) ||
          //   endDateObj.getTime() <= startDateObj.getTime()
          // ) {
          //   return callback({
          //     success: false,
          //     title: "Request Error",
          //     message: "Invalid start_date or end_date for repeat request.",
          //   });
          // }

          const quantity = priorOrder.quantity || 1;
          let ownerNotify = null;

          if (needsDustbin) {
            // Reuse the shared capacity rules (quantity minus overlapping
            // bookings) instead of the unreliable availableQuantity counter.
            const repeatMatchQuery = buildDustbinMatchQuery({
              serviceQuery: { _id: priorOrder.dustbin },
              start_date: resolvedStart,
              end_date: resolvedEnd,
              requestedQuantity: quantity,
            });
            const dustbins = await Dustbin.find(repeatMatchQuery)
              .populate("user", "status fcmtoken email name")
              .lean();

            if (!dustbins.length) {
              return callback({
                success: false,
                title: "Request Error",
                message:
                  "The prior provider's dumpster is not available for those dates.",
              });
            }

            const dustbinOwner = dustbins[0].user;
            ownerNotify = {
              userId: priorOwnerId,
              fcmtoken: dustbinOwner?.fcmtoken || "",
              email: dustbinOwner?.email || "",
            };
          }

          if (!ownerNotify) {
            const ownerUser = await User.findById(priorOwnerId)
              .select("fcmtoken email name")
              .lean();
            ownerNotify = {
              userId: priorOwnerId,
              fcmtoken: ownerUser?.fcmtoken || "",
              email: ownerUser?.email || "",
            };
          }

          const orderNumber = generateOTP(5, {
            alphabet: true,
            numeric: true,
          });
          const priorMeta =
            priorOrder.metadata && typeof priorOrder.metadata === "object"
              ? { ...priorOrder.metadata }
              : {};
          delete priorMeta.searchExpired;
          delete priorMeta.searchExpiredAt;
          delete priorMeta.matchedAt;
          delete priorMeta.paymentHoldStatus;
          delete priorMeta.expiryReminderSentForEndDate;

          const orderMetadata = {
            ...priorMeta,
            paymentHoldStatus:
              resolvedPaymentType === "wallet"
                ? "wallet_reserved"
                : holdResult?.status === "requires_capture"
                  ? "requires_capture"
                  : "pending_webhook",
            repeatOf: priorOrder._id,
            repeatTargetOwner: priorOwnerId,
          };

          const newRequest = await Order.create({
            user: senderId,
            dumbster: priorOrder.dumbster || null,
            portaPotty: priorOrder.portaPotty || null,
            junkRemoval: priorOrder.junkRemoval || null,
            treeRemoval: priorOrder.treeRemoval || null,
            dustbin: priorOrder.dustbin || null,
            start_date: startDateObj,
            end_date: endDateObj,
            service_type: serviceType,
            price,
            location: resolvedLocation,
            address: resolvedAddress,
            num_days: resolvedNumDays,
            time: resolvedTime,
            materialInformation: priorOrder.materialInformation,
            insurance: priorOrder.insurance,
            image: priorOrder.image,
            category: priorOrder.category,
            subCategory: priorOrder.subCategory,
            placementLocation: priorOrder.placementLocation,
            placementNote: priorOrder.placementNote,
            userIds: [priorOwnerId],
            orderNumber,
            quantity,
            amount: computeSplit(price, {
              driveaway: resolvedDriveaway,
              cancelation: resolvedCancelation,
            }).amount,
            company: priorOrder.company || null,
            images: priorOrder.images || [],
            metadata: orderMetadata,
            paymentId: resolvedPaymentType === "wallet" ? null : paymentId,
            payment_type: resolvedPaymentType,
            driveaway: resolvedDriveaway,
            cancelation: resolvedCancelation,
            status: "pending",
            to_id: null,
          });

          const customerName = socket.user?.name || "a customer";
          const copy = orderMessages.requestCreated({
            customerName,
            serviceType,
            order: newRequest,
          });

          if (resolvedPaymentType !== "wallet" && paymentId) {
            const existingDebit = await TransactionModel.findOne({
              stripePaymentIntentId: paymentId,
              type: "debit",
            });
            if (!existingDebit) {
              await TransactionModel.create({
                user: senderId,
                order: newRequest._id,
                amount: price,
                type: "debit",
                stripePaymentIntentId: paymentId,
                metadata: {
                  source: "socket",
                  flow: "repeat_request",
                  repeatOf: priorOrder._id,
                  driveaway: resolvedDriveaway,
                  cancelation: resolvedCancelation,
                  reason: copy.transactionReason,
                },
              });
            }
          }

          scheduleOrderExpiry(
            newRequest._id,
            resolvedPaymentType === "wallet" ? null : paymentId,
          ).catch((err) =>
            logger.error("Failed to schedule order expiry (repeat)", err),
          );

          const [request, adminUser] = await Promise.all([
            Order.findById(newRequest._id)
              .populate("user")
              .populate("dumbster")
              .populate("portaPotty"),
            User.findOne({ $or: [{ type: "admin" }, { role: "admin" }] })
              .select("type role fcmtoken")
              .lean(),
          ]);

          await OrderTimeline.create({
            order: newRequest._id,
            orderDeatil: request,
            ...timelineEntry(copy),
          });

          callback({
            success: true,
            title: copy.callback.title,
            message: copy.callback.message,
            order: formatOrderPayload(request, PRICING_ROLES.CUSTOMER),
          });

          const notificationPromises = [];

          DispatchService.initializeDispatchWaves(newRequest, [priorOwnerId], {
            immediate: true,
          }).catch((err) =>
            logger.error(
              "Priority Dispatch Initialization failed (Repeat Request)",
              err,
            ),
          );

          if (adminUser) {
            notificationPromises.push(
              (async () => {
                io.to(`user_${adminUser._id.toString()}`).emit("admin-noti", {
                  success: true,
                  title: copy.admin.title,
                  message: copy.admin.description,
                  type: "request",
                });
                return sendNotification({
                  user: senderId,
                  to_id: adminUser._id.toString(),
                  description: copy.admin.description,
                  type: "request",
                  title: copy.admin.title,
                  fcmtoken: adminUser?.fcmtoken || "",
                  order: newRequest._id,
                  email: "",
                });
              })(),
            );
          }

          Promise.all(notificationPromises).catch((err) => {
            logger.error("Error sending repeat request notifications:", err);
          });
        } catch (error) {
          logger.error("send-repeat-request-rentee failed", error);
          if (typeof callback === "function") {
            callback({
              success: false,
              title: "Error",
              message: error.message,
            });
          }
        }
      },
    );

    // ==========================================
    // LIVE LOCATION TRACKING
    // ==========================================

    // Event: Update user's current GPS coordinates and broadcast to the relevant party
    socket.on("location-sent", async (data, callback) => {
      const senderId = socket.user._id.toString();

      if (!senderId) {
        return callback({
          success: false,
          title: "Authentication Error",
          message: "Sender ID not found.",
        });
      }
      const { lat, lng, to_id, order } = data;
      const user = await User.findByIdAndUpdate(
        senderId,
        { currentlat: lat, currentlng: lng },
        { new: true },
      );

      // Resolve the order's live delivery state so the customer app can gate the
      // ETA: it should only be shown while the dumpster is actually on the way.
      // Also surface the origin (owner bin) and dropoff (customer) coordinates so
      // the map can place the start/end markers alongside the moving marker.
      let onway = false;
      let orderStatus = null;
      let originLocation = null;
      let dropoffLocation = null;
      if (order && isValidObjectId(order)) {
        const trackedOrder = await Order.findById(order)
          .select("onway status location dustbin")
          .populate({ path: "dustbin", select: "location" })
          .lean();
        if (trackedOrder) {
          onway = trackedOrder.onway === true;
          orderStatus = trackedOrder.status || null;
          dropoffLocation = trackedOrder.location || null;
          originLocation = trackedOrder.dustbin?.location || null;
        }
      }

      // Unified tracking channel: emit `location-update` with the same payload
      // shape as the HTTP paths (PUT /user/latlongs, POST /assign-order/updateLocation)
      // so the customer app has a single listener/parser for all live tracking.
      io.to(`user_${to_id}`).emit("location-update", {
        order,
        orderId: order,
        userId: senderId,
        currentlat: lat,
        currentlng: lng,
        onway,
        status: orderStatus,
        originLocation,
        dropoffLocation,
      });

      // DEPRECATED: legacy `location-recieved` (lat/lng shape). Kept temporarily
      // as a fallback while the app migrates to `location-update`. Remove once the
      // driver/owner apps route GPS exclusively through the HTTP endpoints.
      io.to(`user_${to_id}`).emit("location-recieved", {
        lat,
        lng,
        to_id,
        order,
        senderId,
        onway,
        status: orderStatus,
        showEta: onway,
        originLocation,
        dropoffLocation,
      });
      callback(user);
    });

    // Event: Renter responds to a pending request (Accept/Reject an offer)
    socket.on(
      "update-request-renter",
      async (
        { requestId, status, dustbin, price, junkRemoval, treeRemoval, size },
        callback,
      ) => {
        try {
          const senderId = socket.user._id.toString();
          if (!senderId) {
            return callback({
              success: false,
              title: "Authentication Error",
              message: "Sender ID not found.",
            });
          }
          // console.log("requestId", requestId, "senderId", senderId, "status", status, "dustbin", dustbin, "price", price, "junkRemoval", junkRemoval, "treeRemoval", treeRemoval);
          const order = await Order.findById(requestId)
            .populate(["user", "dumbster"])
            .lean();

          if (!order) {
            return callback({
              success: false,
              title: "Request Update",
              message: "Order not found.",
            });
          }

          if (order.status !== "pending" || order.to_id != null) {
            return callback({
              success: false,
              title: "Request Update",
              message: "This service has already been booked.",
            });
          }

          if (status == "rejected") {
            await Order.findByIdAndUpdate(requestId, {
              $addToSet: { rejected_by: senderId },
            });

            try {
              await JobEvent.create({
                operatorId: senderId,
                orderId: requestId,
                eventType: "JOB_REJECTED",
              });
              ScoreEngine.calculateOperatorScore(senderId).catch((err) =>
                logger.error("Score recalculation failed on rejection", err),
              );
            } catch (jobEventErr) {
              logger.error("Failed to log JOB_REJECTED event", jobEventErr);
            }

            const declineCopy = orderMessages.requestDeclined({
              providerName: socket.user.name,
              serviceType: order.service_type,
              order,
            });
            await OrderTimeline.create({
              order: requestId,
              orderDeatil: order,
              ...timelineEntry(declineCopy),
            });
            await sendNotification({
              user: senderId,
              to_id: order.user._id.toString(),
              description: declineCopy.customer.description,
              type: "request",
              title: declineCopy.customer.title,
              fcmtoken: order.user.fcmtoken,
              order: requestId,
              email: order.user?.email || "",
            });

            return callback({
              success: true,
              title: declineCopy.customer.title,
              message: declineCopy.customer.description,
            });
          }

          // Accept gates: operators may view/receive requests without Stripe or
          // junk insurance, but final acceptance is blocked until those are set.
          const accepter = await User.findById(senderId)
            .select(
              "accountId accountId_verified isInsured insuranceFile junkRemoval name",
            )
            .populate({
              path: "junkRemoval",
              select: "COI status userId",
            })
            .lean();

          const stripeReady = Boolean(
            accepter?.accountId_verified && accepter?.accountId,
          );
          if (!stripeReady) {
            return callback({
              success: false,
              code: "STRIPE_REQUIRED",
              title: "Stripe Connection Required",
              message:
                "Connect your Stripe account before accepting orders. You can still view incoming requests.",
            });
          }

          const isWalletOrder = order.payment_type === "wallet";
          const isInvoiceOrder = order.payment_type === "invoice";
          if (!isWalletOrder && !isInvoiceOrder && !order.paymentId) {
            return callback({
              success: false,
              title: "Request Update",
              message: "Payment hold not found for this order.",
            });
          }

          const allowedUserIds = (order.userIds || []).map((id) =>
            id.toString(),
          );
          if (allowedUserIds.length > 0 && !allowedUserIds.includes(senderId)) {
            return callback({
              success: false,
              title: "Request Update",
              message: "You are not eligible to accept this request.",
            });
          }

          const rejectedOperatorIds = (order.rejected_by || []).map((id) =>
            id.toString(),
          );
          if (rejectedOperatorIds.includes(senderId)) {
            return callback({
              success: false,
              title: "Request Update",
              message: "You already declined this request.",
            });
          }

          const serviceType = order.service_type || "Dumbster";
          const start = new Date(order.start_date);
          const end = new Date(order.end_date);
          let dustbinId = null;
          let linkedJunkRemovalId = null;
          let linkedTreeRemovalId = null;
          let bookingConflictMessage =
            "That Dustbin is already booked for the requested time period";

          if (serviceType === "Dumbster" || serviceType === "Porta Potty") {
            const findDustbin = await Dustbin.findById(dustbin).lean();
            if (!findDustbin) {
              return callback({
                success: false,
                title: "Request Update",
                message: "Dustbin not found.",
              });
            }

            if (findDustbin.user?.toString() !== senderId) {
              return callback({
                success: false,
                title: "Request Update",
                message: "This dustbin does not belong to your account.",
              });
            }

            if (!findDustbin.verify || findDustbin.status !== "active") {
              return callback({
                success: false,
                title: "Request Update",
                message: "Selected dustbin is not active.",
              });
            }

            const requestedQuantity =
              Number(order.quantity) > 0 ? Number(order.quantity) : 1;
            // Capacity = total quantity minus units reserved by bookings that
            // overlap the requested dates. `availableQuantity` is not trusted
            // (unreliable counter); `quantity` + `bookings` are the source of truth.
            const totalQuantity = Number(findDustbin.quantity ?? 1);
            const bookedUnits = (findDustbin.bookings || []).reduce(
              (sum, booking) => {
                if (
                  isOverlapping(start, end, booking.startDate, booking.endDate)
                ) {
                  const units =
                    Number(booking.quantity) > 0 ? Number(booking.quantity) : 1;
                  return sum + units;
                }
                return sum;
              },
              0,
            );
            const remainingQuantity = totalQuantity - bookedUnits;
            if (remainingQuantity < requestedQuantity) {
              return callback({
                success: false,
                title: "Request Update",
                message:
                  "Selected dustbin does not have enough available quantity for these dates.",
              });
            }

            if (serviceType === "Dumbster" && order.dumbster) {
              // The customer's `order.dumbster` is populated (a catalog object),
              // while the owner bin's `dumbster` is a catalog ObjectId. Accept
              // when the catalog IDs match OR the yard sizes are equal — owners
              // often register their bin against a different catalog entry that
              // has the same size.
              const orderCatalogId =
                order.dumbster?._id?.toString() ||
                order.dumbster?.toString() ||
                null;
              const binCatalogId = findDustbin.dumbster?.toString() || null;
              const idMatch =
                orderCatalogId &&
                binCatalogId &&
                orderCatalogId === binCatalogId;

              let sizeMatch = false;
              if (!idMatch) {
                const binCatalog = findDustbin.dumbster
                  ? await Dumbster.findById(findDustbin.dumbster)
                      .select("size")
                      .lean()
                  : null;
                const orderSize = normalizeYardSize(
                  order.dumbster?.size ?? order.size ?? size,
                );
                const binSize = normalizeYardSize(binCatalog?.size);
                sizeMatch = Boolean(
                  orderSize && binSize && orderSize === binSize,
                );
              }

              if (!idMatch && !sizeMatch) {
                return callback({
                  success: false,
                  title: "Request Update",
                  message:
                    "Selected dumpster size doesn't match the customer's requested dumpster size.",
                });
              }
            }

            if (
              serviceType === "Porta Potty" &&
              order.portaPotty &&
              findDustbin.portaPotty?.toString() !== order.portaPotty.toString()
            ) {
              return callback({
                success: false,
                title: "Request Update",
                message:
                  "Selected dustbin does not match the requested porta potty type.",
              });
            }

            // Date/quantity conflicts are already enforced by the capacity
            // check above (quantity minus overlapping bookings), which correctly
            // supports multi-unit dumpsters instead of rejecting on any overlap.
            dustbinId = dustbin;
          } else if (serviceType === "Junk Removal") {
            const junkRemovalId =
              junkRemoval ||
              accepter?.junkRemoval?._id ||
              accepter?.junkRemoval ||
              null;
            const findJunkRemoval = junkRemovalId
              ? await JunkRemoval.findById(junkRemovalId).lean()
              : null;

            const insured = Boolean(
              accepter?.isInsured ||
                accepter?.insuranceFile ||
                findJunkRemoval?.COI,
            );

            // Insurance-only path: operator uploaded COI without full junk signup.
            if (!findJunkRemoval) {
              if (!insured) {
                return callback({
                  success: false,
                  code: "INSURANCE_REQUIRED",
                  title: "Insurance Required",
                  message:
                    "Upload your insurance document before accepting junk removal or site cleanup orders.",
                });
              }
              bookingConflictMessage =
                "You are already booked for the requested time period";
            } else {
              if (findJunkRemoval.userId.toString() !== senderId) {
                return callback({
                  success: false,
                  title: "Request Update",
                  message: "Junk removal profile not found.",
                });
              }
              if (findJunkRemoval.status === "rejected") {
                return callback({
                  success: false,
                  title: "Request Update",
                  message:
                    "Your junk removal application was rejected. Please re-upload documents to continue.",
                });
              }

              if (!insured) {
                return callback({
                  success: false,
                  code: "INSURANCE_REQUIRED",
                  title: "Insurance Required",
                  message:
                    "Upload your insurance document before accepting junk removal or site cleanup orders.",
                });
              }

              // Keep user.isInsured in sync if COI exists but flag was never set.
              if (!accepter?.isInsured && findJunkRemoval.COI) {
                User.updateOne(
                  { _id: senderId },
                  {
                    $set: {
                      isInsured: true,
                      insuranceFile: findJunkRemoval.COI,
                    },
                  },
                ).catch((err) =>
                  logger.error("Failed to sync isInsured on accept", err),
                );
              }

              bookingConflictMessage =
                "You are already booked for the requested time period";
              if (findJunkRemoval.bookings) {
                for (const booking of findJunkRemoval.bookings) {
                  if (
                    isOverlapping(
                      start,
                      end,
                      booking.startDate,
                      booking.endDate,
                    )
                  ) {
                    return callback({
                      success: false,
                      title: "Request Update",
                      message: bookingConflictMessage,
                    });
                  }
                }
              }
              linkedJunkRemovalId = findJunkRemoval._id;
            }
          } else if (serviceType === "Tree Removal") {
            const treeRemovalId = treeRemoval;
            const findTreeRemoval =
              await TreeRemoval.findById(treeRemovalId).lean();
            if (!findTreeRemoval) {
              return callback({
                success: false,
                title: "Request Update",
                message: "Tree removal profile not found.",
              });
            }
            if (findTreeRemoval.userId.toString() !== senderId) {
              return callback({
                success: false,
                title: "Request Update",
                message: "Tree removal profile not found.",
              });
            }
            if (findTreeRemoval.status !== "approved") {
              return callback({
                success: false,
                title: "Request Update",
                message: "Tree removal profile is not approved.",
              });
            }
            bookingConflictMessage =
              "You are already booked for the requested time period";
            if (findTreeRemoval.bookings) {
              for (const booking of findTreeRemoval.bookings) {
                if (
                  isOverlapping(start, end, booking.startDate, booking.endDate)
                ) {
                  return callback({
                    success: false,
                    title: "Request Update",
                    message: bookingConflictMessage,
                  });
                }
              }
            }
            linkedTreeRemovalId = findTreeRemoval._id;
          }

          const provider = await User.findById(senderId)
            .select("accountId name")
            .lean();

          const matchUpdate = {
            to_id: senderId,
            status: "accepted",
            "metadata.matchedAt": new Date(),
            "metadata.providerAccountId": provider?.accountId || "",
          };
          if (dustbinId) matchUpdate.dustbin = dustbinId;
          if (linkedJunkRemovalId)
            matchUpdate.junkRemoval = linkedJunkRemovalId;
          if (linkedTreeRemovalId)
            matchUpdate.treeRemoval = linkedTreeRemovalId;

          const matchFilter = isInvoiceOrder
            ? {
                _id: requestId,
                status: "pending",
                to_id: null,
                payment_type: "invoice",
              }
            : isWalletOrder
              ? {
                  _id: requestId,
                  status: "pending",
                  to_id: null,
                  payment_type: "wallet",
                }
              : {
                  _id: requestId,
                  status: "pending",
                  to_id: null,
                  paymentId: { $ne: null },
                };

          const matchedOrder = await Order.findOneAndUpdate(
            matchFilter,
            { $set: matchUpdate },
            { new: true },
          )
            .populate("user")
            .populate("dumbster");

          if (!matchedOrder) {
            // Lost the race: another owner claimed this order moments earlier.
            // Return the same "opportunity missed" copy the other owners get.
            let missedCopy;
            try {
              const takenOrder = await Order.findById(requestId)
                .populate("dumbster")
                .lean();
              missedCopy = orderMessages.opportunityMissed({
                serviceType,
                order: takenOrder || { _id: requestId },
                size: takenOrder?.dumbster?.size || "",
              });
            } catch (lookupErr) {
              logger.error(
                "Failed to load taken order for missed-opportunity copy",
                lookupErr,
              );
              missedCopy = orderMessages.opportunityMissed({
                serviceType,
                order: { _id: requestId },
              });
            }

            if (io) {
              io.to(`user_${senderId}`).emit("request-unavailable", {
                success: true,
                orderId: requestId,
                title: missedCopy.operator.title,
                message: missedCopy.operator.description,
              });
            }

            return callback({
              success: false,
              title: missedCopy.operator.title,
              message: missedCopy.operator.description,
              orderId: requestId,
            });
          }

          try {
            if (serviceType === "Dumbster" || serviceType === "Porta Potty") {
              const findDustbin = await Dustbin.findById(dustbinId);
              findDustbin.bookings.push({
                startDate: start,
                endDate: end,
                quantity: matchedOrder.quantity,
              });
              findDustbin.availableQuantity =
                Number(findDustbin.availableQuantity) -
                Number(matchedOrder.quantity);
              await findDustbin.save();
            } else if (serviceType === "Junk Removal" && linkedJunkRemovalId) {
              const findJunkRemoval =
                await JunkRemoval.findById(linkedJunkRemovalId);
              findJunkRemoval.bookings.push({ startDate: start, endDate: end });
              await findJunkRemoval.save();
            } else if (serviceType === "Tree Removal" && linkedTreeRemovalId) {
              const findTreeRemoval =
                await TreeRemoval.findById(linkedTreeRemovalId);
              findTreeRemoval.bookings.push({ startDate: start, endDate: end });
              await findTreeRemoval.save();
            }
          } catch (bookingErr) {
            await Order.findByIdAndUpdate(requestId, {
              $set: { to_id: null, status: "pending" },
            });
            logger.error("Booking failed after match, rolled back", bookingErr);
            return callback({
              success: false,
              title: "Request Update",
              message: "Failed to reserve inventory. Please try again.",
            });
          }

          if (isWalletOrder) {
            const orderPrice = Number(matchedOrder.price) || 0;
            const { amount: ownerPayout } = computeSplit(orderPrice, {
              driveaway: matchedOrder.driveaway,
              cancelation: matchedOrder.cancelation,
            });
            const customerId =
              matchedOrder.user?._id?.toString() ||
              matchedOrder.user?.toString();

            const debitedCustomer = await User.findOneAndUpdate(
              {
                _id: customerId,
                balance: { $gte: orderPrice },
              },
              { $inc: { balance: -orderPrice } },
              { new: true },
            );

            if (!debitedCustomer) {
              try {
                if (
                  (serviceType === "Dumbster" ||
                    serviceType === "Porta Potty") &&
                  dustbinId
                ) {
                  const findDustbin = await Dustbin.findById(dustbinId);
                  if (findDustbin) {
                    findDustbin.bookings = (findDustbin.bookings || []).filter(
                      (booking) =>
                        !(
                          new Date(booking.startDate).getTime() ===
                            start.getTime() &&
                          new Date(booking.endDate).getTime() === end.getTime()
                        ),
                    );
                    findDustbin.availableQuantity =
                      Number(findDustbin.availableQuantity) +
                      Number(matchedOrder.quantity);
                    await findDustbin.save();
                  }
                }
              } catch (rollbackInventoryErr) {
                logger.error(
                  "Wallet settle inventory rollback failed",
                  rollbackInventoryErr,
                );
              }
              await Order.findByIdAndUpdate(requestId, {
                $set: { to_id: null, status: "pending" },
              });
              return callback({
                success: false,
                title: "Payment Error",
                message: "Insufficient wallet balance.",
              });
            }

            let settlementAdminId = null;
            let settlementCommission = 0;
            try {
              // Keep the closed wallet ledger balanced: customer pays the full
              // price, the owner receives their payout, and the platform's cut
              // (add-ons + 15% commission) is credited to the admin wallet.
              const platformCommission = Number(
                (orderPrice - Number(ownerPayout)).toFixed(2),
              );
              const adminForFee = await User.findOne({
                $or: [{ type: "admin" }, { role: "admin" }],
              })
                .select("_id")
                .lean();
              settlementCommission = platformCommission;
              settlementAdminId = adminForFee?._id || null;

              const balanceUpdates = [
                User.findByIdAndUpdate(senderId, {
                  $inc: { balance: Number(ownerPayout) },
                }),
              ];
              if (adminForFee && platformCommission > 0) {
                balanceUpdates.push(
                  User.findByIdAndUpdate(adminForFee._id, {
                    $inc: { balance: platformCommission },
                  }),
                );
              }
              await Promise.all(balanceUpdates);

              const settlementTxns = [
                TransactionModel.create({
                  user: customerId,
                  order: matchedOrder._id,
                  amount: orderPrice,
                  type: "debit",
                  stripePaymentIntentId: null,
                  metadata: {
                    source: "socket",
                    flow: "wallet_accept",
                    reason: "Wallet debit on provider accept",
                  },
                }),
                TransactionModel.create({
                  user: senderId,
                  order: matchedOrder._id,
                  amount: ownerPayout,
                  type: "credit",
                  stripePaymentIntentId: null,
                  metadata: {
                    source: "socket",
                    flow: "wallet_accept",
                    reason: "Wallet credit on provider accept",
                  },
                }),
              ];
              if (adminForFee && platformCommission > 0) {
                settlementTxns.push(
                  TransactionModel.create({
                    user: adminForFee._id,
                    order: matchedOrder._id,
                    amount: platformCommission,
                    type: "credit",
                    stripePaymentIntentId: null,
                    metadata: {
                      source: "socket",
                      flow: "wallet_accept",
                      reason: "Platform commission on provider accept",
                    },
                  }),
                );
              }
              await Promise.all(settlementTxns);

              matchedOrder.transfer = true;
              if (!matchedOrder.metadata) matchedOrder.metadata = {};
              matchedOrder.metadata.paymentHoldStatus = "wallet_settled";
              await matchedOrder.save();
            } catch (walletSettleErr) {
              // Best-effort reversal of every balance change applied above so a
              // failed settlement never leaves the wallet ledger out of balance.
              await User.findByIdAndUpdate(customerId, {
                $inc: { balance: orderPrice },
              });
              await User.findByIdAndUpdate(senderId, {
                $inc: { balance: -Number(ownerPayout) },
              });
              if (settlementAdminId && settlementCommission > 0) {
                await User.findByIdAndUpdate(settlementAdminId, {
                  $inc: { balance: -settlementCommission },
                });
              }
              await Order.findByIdAndUpdate(requestId, {
                $set: { to_id: null, status: "pending" },
              });
              logger.error("Wallet settle failed after match", walletSettleErr);
              return callback({
                success: false,
                title: "Payment Error",
                message: "Wallet settlement failed. Please try again.",
              });
            }
          } else if (matchedOrder.paymentId) {
            // Card order: capture the authorized hold now, so funds are
            // deducted from the customer's card the moment the owner accepts.
            // The payout transfer to the owner still happens later, at order
            // completion (via Stripe Connect).
            const captureResult = await captureHold(matchedOrder.paymentId);

            if (!captureResult.success && !captureResult.alreadyCaptured) {
              try {
                if (
                  (serviceType === "Dumbster" ||
                    serviceType === "Porta Potty") &&
                  dustbinId
                ) {
                  const findDustbin = await Dustbin.findById(dustbinId);
                  if (findDustbin) {
                    findDustbin.bookings = (findDustbin.bookings || []).filter(
                      (booking) =>
                        !(
                          new Date(booking.startDate).getTime() ===
                            start.getTime() &&
                          new Date(booking.endDate).getTime() === end.getTime()
                        ),
                    );
                    findDustbin.availableQuantity =
                      Number(findDustbin.availableQuantity) +
                      Number(matchedOrder.quantity);
                    await findDustbin.save();
                  }
                }
              } catch (rollbackInventoryErr) {
                logger.error(
                  "Inventory rollback after capture failure failed",
                  rollbackInventoryErr,
                );
              }

              await Order.findByIdAndUpdate(requestId, {
                $set: { to_id: null, status: "pending" },
              });
              logger.error(
                "Capture failed on operator accept",
                captureResult.message,
              );
              return callback({
                success: false,
                title: "Payment Error",
                message:
                  "Could not charge the customer's card. Please try again.",
              });
            }

            if (!matchedOrder.metadata) matchedOrder.metadata = {};
            matchedOrder.metadata.paymentHoldStatus = "captured";
            matchedOrder.metadata.capturedAt = new Date();
            await matchedOrder.save();
          }

          DispatchService.cancelRemainingWaves(requestId).catch((err) =>
            logger.error("Failed to cancel waves on operator match", err),
          );
          cancelOrderExpiry(requestId).catch((err) =>
            logger.error("Failed to cancel expiry job on match", err),
          );

          await User.findByIdAndUpdate(senderId, {
            $inc: {
              "ordersDetails.total": 1,
              "ordersDetails.accepted": 1,
            },
          });

          const providerName = provider?.name || socket.user.name;
          const customerName =
            matchedOrder.user?.name || order.user?.name || "Customer";
          const matchCopy = orderMessages.providerMatched({
            customerName,
            providerName,
            serviceType,
            order: matchedOrder,
          });

          await OrderTimeline.create({
            order: matchedOrder._id,
            orderDeatil: matchedOrder,
            ...timelineEntry(matchCopy),
          });

          try {
            const responseTimeMs =
              Date.now() - new Date(order.createdAt).getTime();
            await JobEvent.create({
              operatorId: senderId,
              orderId: requestId,
              eventType: "JOB_ACCEPTED",
              responseTimeMs,
            });
            ScoreEngine.calculateOperatorScore(senderId).catch((err) =>
              logger.error("Score recalculation failed on acceptance", err),
            );
          } catch (jobEventErr) {
            logger.error("Failed to log JOB_ACCEPTED event", jobEventErr);
          }

          const customerLink = `https://api.binsapp.ai/customer-orders?orderId=${matchedOrder._id}`;
          const ownerLink = `https://api.binsapp.ai/owner-orders?orderId=${matchedOrder._id}`;

          const matchNotifyPromises = [
            sendNotification({
              user: senderId,
              to_id: matchedOrder.user._id.toString(),
              description: matchCopy.customer.description,
              type: "order",
              title: matchCopy.customer.title,
              fcmtoken: matchedOrder.user?.fcmtoken,
              order: requestId,
              email: matchedOrder.user?.email || "",
              customEmailTemplate: true,
              html: buttonTemplate(
                customerLink,
                matchCopy.customer.title,
                matchCopy.customer.description,
              ),
            }),
            sendNotification({
              user: senderId,
              to_id: senderId,
              description: matchCopy.operator.description,
              type: "order",
              title: matchCopy.operator.title,
              fcmtoken: socket.user.fcmtoken,
              order: requestId,
              email: socket.user?.email || "",
              customEmailTemplate: true,
              html: buttonTemplate(
                ownerLink,
                matchCopy.operator.title,
                matchCopy.operator.description,
              ),
            }),
          ];

          io.to(`user_${matchedOrder.user._id.toString()}`).emit(
            "update-request-rentee",
            {
              success: true,
              order: formatOrderPayload(matchedOrder, PRICING_ROLES.CUSTOMER),
              title: matchCopy.customer.title,
              message: matchCopy.customer.description,
            },
          );

          io.to(`user_${senderId}`).emit("update-request-renter", {
            success: true,
            order: formatOrderPayload(matchedOrder, PRICING_ROLES.OWNER),
            orderId: matchedOrder._id.toString(),
            navigate: true,
            title: matchCopy.operator.title,
            message: matchCopy.operator.description,
          });

          const adminUser = await User.findOne({
            $or: [{ type: "admin" }, { role: "admin" }],
          })
            .select("fcmtoken")
            .lean();
          if (adminUser) {
            io.to(`user_${adminUser._id.toString()}`).emit("admin-noti", {
              success: true,
              title: matchCopy.admin.title,
              message: matchCopy.admin.description,
              type: "order",
            });
            matchNotifyPromises.push(
              sendNotification({
                user: senderId,
                to_id: adminUser._id.toString(),
                description: matchCopy.admin.description,
                type: "order",
                title: matchCopy.admin.title,
                fcmtoken: adminUser?.fcmtoken || "",
                order: requestId,
                email: "",
              }),
            );
          }

          // Notify the OTHER eligible owners that this request is now taken so
          // their live offers list updates and they stay engaged for the next one.
          try {
            const accepterId = senderId.toString();
            const rejectedSet = new Set(
              (matchedOrder.rejected_by || []).map((id) => id.toString()),
            );
            const otherOwnerIds = (matchedOrder.userIds || [])
              .map((id) => id.toString())
              .filter((id) => id !== accepterId && !rejectedSet.has(id));

            if (otherOwnerIds.length > 0) {
              const missedCopy = orderMessages.opportunityMissed({
                serviceType,
                order: matchedOrder,
                size:
                  matchedOrder.dumbster?.size ||
                  matchedOrder.portaPotty?.size ||
                  "",
              });

              const otherOwners = await User.find({
                _id: { $in: otherOwnerIds },
              })
                .select("_id fcmtoken email name")
                .lean();

              for (const owner of otherOwners) {
                io.to(`user_${owner._id}`).emit("request-unavailable", {
                  success: true,
                  orderId: matchedOrder._id,
                  title: missedCopy.operator.title,
                  message: missedCopy.operator.description,
                });

                matchNotifyPromises.push(
                  sendNotification({
                    user: senderId,
                    to_id: owner._id.toString(),
                    description: missedCopy.operator.description,
                    type: "request",
                    title: missedCopy.operator.title,
                    fcmtoken: owner.fcmtoken,
                    order: requestId,
                    email: "",
                  }),
                );
              }
            }
          } catch (missedErr) {
            logger.error(
              "Failed to notify other owners of missed opportunity",
              missedErr,
            );
          }

          let operatorDriversData = null;
          try {
            const AssignOrderService = (
              await import("../modules/assign_order/service.js")
            ).default;
            operatorDriversData =
              await AssignOrderService.getOperatorDrivers(senderId);
          } catch (driverErr) {
            logger.warn(
              "Failed to load operator drivers on accept:",
              driverErr.message,
            );
          }

          if (io) {
            io.to(`user_${senderId}`).emit("operator:assign-driver-prompt", {
              success: true,
              orderId: matchedOrder._id.toString(),
              order: formatOrderPayload(matchedOrder, PRICING_ROLES.OWNER),
              driversData: operatorDriversData,
              title: "Assign Driver",
              message:
                "Select an existing driver, assign to yourself, or add a new driver to dispatch this job.",
            });
          }

          return callback({
            success: true,
            order: formatOrderPayload(matchedOrder, PRICING_ROLES.OWNER),
            orderId: matchedOrder._id.toString(),
            navigate: true,
            driverAssignmentRequired: true,
            driversData: operatorDriversData,
            title: matchCopy.operator.title,
            message: matchCopy.operator.description,
          });
        } catch (error) {
          callback({
            success: false,
            title: "Request Update",
            message: error.message,
          });
        }
      },
    );

    // Event: Rentee accepts or rejects proof of work submitted by the renter
    socket.on(
      "accept-order-rentee",
      async ({ orderId, status, reason }, callback) => {
        try {
          const senderId = socket.user._id.toString();
          if (!senderId) {
            return callback({
              success: false,
              title: "Order Update",
              message: "Sender not found!",
            });
          }

          const allowedStatuses = ["accepted", "rejected"];
          if (!allowedStatuses.includes(status)) {
            return callback({
              success: false,
              title: "Order Update",
              message: "Status is invalid.",
            });
          }

          const existingOrder = await Order.findOne({
            _id: orderId,
            user: senderId,
            proofOfWorkDone: { $exists: true, $ne: [] },
          })
            .populate("to_id")
            .populate("user")
            .lean();

          if (!existingOrder) {
            return callback({
              success: false,
              title: "Order Update",
              message: "Order not found or proof of work is not available.",
            });
          }

          const isAccepted = status === "accepted";
          const updatePayload = isAccepted
            ? { proofOfWorkStatus: "accepted", reason: reason || "" }
            : { proofOfWorkStatus: "rejected", reason: reason || "" };

          const updatedSession = await Order.findByIdAndUpdate(
            orderId,
            updatePayload,
            { new: true, runValidators: true },
          )
            .populate("to_id")
            .populate("user");

          const renteeName = updatedSession.user?.name || "Customer";
          const renterName = updatedSession.to_id?.name || "Provider";
          const customerOrderLink = `https://api.binsapp.ai/customer-orders?orderId=${updatedSession._id}`;
          const ownerOrderLink = `https://api.binsapp.ai/owner-orders?orderId=${updatedSession._id}`;
          const powCtx = {
            customerName: renteeName,
            providerName: renterName,
            serviceType: updatedSession.service_type,
            order: updatedSession,
            reason,
          };
          const powCopy = isAccepted
            ? orderMessages.proofAccepted(powCtx)
            : orderMessages.proofRejected(powCtx);

          await OrderTimeline.create({
            order: updatedSession._id,
            orderDeatil: updatedSession,
            ...timelineEntry(powCopy),
          });

          const adminUser = await User.findOne({
            $or: [{ type: "admin" }, { role: "admin" }],
          })
            .select("fcmtoken")
            .lean();

          const notifyPromises = [
            sendNotification({
              user: senderId,
              to_id: updatedSession.to_id._id.toString(),
              description: powCopy.operator.description,
              type: "order",
              title: powCopy.operator.title,
              fcmtoken: updatedSession.to_id?.fcmtoken,
              order: updatedSession._id.toString(),
              noti: false,
              email: updatedSession.to_id?.email || "",
              customEmailTemplate: true,
              html: buttonTemplate(
                ownerOrderLink,
                powCopy.operator.title,
                powCopy.operator.description,
              ),
            }),
            sendNotification({
              user: senderId,
              to_id: updatedSession.user._id.toString(),
              description: powCopy.customer.description,
              type: "order",
              title: powCopy.customer.title,
              fcmtoken: updatedSession.user?.fcmtoken,
              order: updatedSession._id.toString(),
              noti: false,
              email: updatedSession.user?.email || "",
              customEmailTemplate: true,
              html: buttonTemplate(
                customerOrderLink,
                powCopy.customer.title,
                powCopy.customer.description,
              ),
            }),
          ];

          if (adminUser) {
            io.to(`user_${adminUser._id.toString()}`).emit("admin-noti", {
              success: true,
              title: powCopy.admin.title,
              message: powCopy.admin.description,
              type: "order",
            });
            notifyPromises.push(
              sendNotification({
                user: senderId,
                to_id: adminUser._id.toString(),
                description: powCopy.admin.description,
                type: "order",
                title: powCopy.admin.title,
                fcmtoken: adminUser?.fcmtoken || "",
                order: updatedSession._id.toString(),
                email: "",
              }),
            );
          }

          io.to(`user_${updatedSession.to_id._id.toString()}`).emit(
            "accept-order-renter",
            {
              success: true,
              order: formatOrderPayload(updatedSession, PRICING_ROLES.OWNER),
              title: powCopy.operator.title,
              message: powCopy.operator.description,
            },
          );

          io.to(`user_${senderId}`).emit("accept-order-rentee", {
            success: true,
            order: formatOrderPayload(updatedSession, PRICING_ROLES.CUSTOMER),
            title: powCopy.customer.title,
            message: powCopy.customer.description,
          });

          Promise.all(notifyPromises).catch((err) =>
            logger.error("Proof review notification failed", err),
          );

          if (typeof callback === "function") {
            callback({
              success: true,
              order: formatOrderPayload(updatedSession, PRICING_ROLES.CUSTOMER),
              title: powCopy.customer.title,
              message: powCopy.customer.description,
            });
          }
        } catch (error) {
          console.log(error);
          logger.error(error.message);
          if (typeof callback === "function") {
            callback({
              success: false,
              title: "Order Update",
              message: error.message,
            });
          }
        }
      },
    );

    // Event: Customer extends an active dumpster rental
    socket.on(
      "extend-order-renter",
      async (
        {
          orderId,
          extended_days,
          extended_days_price,
          new_end_date,
          extended_paymentId,
          payment_type,
        },
        callback,
      ) => {
        const fail = (title, message) => {
          if (typeof callback === "function") {
            callback({ success: false, title, message });
          }
        };

        try {
          const senderId = socket.user._id.toString();
          if (!senderId) {
            return fail("Order Update", "Sender not found!");
          }

          if (
            !orderId ||
            extended_days == null ||
            extended_days_price == null ||
            !new_end_date
          ) {
            return fail(
              "Order Update",
              "orderId, extended_days, extended_days_price, and new_end_date are required.",
            );
          }

          if (!isValidObjectId(orderId)) {
            return fail("Order Update", "Invalid order id.");
          }

          const days = Number(extended_days);
          const extensionPrice = Number(extended_days_price);
          if (!Number.isInteger(days) || days <= 0) {
            return fail(
              "Order Update",
              "extended_days must be a positive integer.",
            );
          }
          if (!Number.isFinite(extensionPrice) || extensionPrice <= 0) {
            return fail(
              "Order Update",
              "extended_days_price must be a positive number.",
            );
          }

          const newEndDate = new Date(new_end_date);
          if (Number.isNaN(newEndDate.getTime())) {
            return fail("Order Update", "new_end_date must be a valid date.");
          }

          const existingOrder = await Order.findOne({
            _id: orderId,
            user: senderId,
            service_type: { $in: ["Dumbster", "Porta Potty"] },
            status: "accepted",
            to_id: { $ne: null },
            dustbin: { $ne: null },
          }).populate(["to_id", "dustbin", "user"]);

          if (!existingOrder) {
            return fail(
              "Order Update",
              "Active dumpster order not found or not eligible for extension.",
            );
          }

          const resolvedPaymentType =
            payment_type === "wallet" ||
            (!payment_type && existingOrder.payment_type === "wallet")
              ? "wallet"
              : "stripe";

          if (resolvedPaymentType !== "wallet" && !extended_paymentId) {
            return fail(
              "Order Update",
              "extended_paymentId is required for Stripe extension payments.",
            );
          }

          const previousEndDate = new Date(existingOrder.end_date);
          if (Number.isNaN(previousEndDate.getTime())) {
            return fail("Order Update", "Order end date is invalid.");
          }
          if (newEndDate.getTime() <= previousEndDate.getTime()) {
            return fail(
              "Order Update",
              "new_end_date must be after the current order end date.",
            );
          }

          const expectedNewEnd = new Date(previousEndDate);
          expectedNewEnd.setUTCDate(expectedNewEnd.getUTCDate() + days);
          if (
            expectedNewEnd.toISOString().slice(0, 10) !==
            newEndDate.toISOString().slice(0, 10)
          ) {
            return fail(
              "Order Update",
              "new_end_date does not match the requested extension duration.",
            );
          }

          const dustbinDoc =
            existingOrder.dustbin?._id != null
              ? existingOrder.dustbin
              : await Dustbin.findById(existingOrder.dustbin);
          if (!dustbinDoc) {
            return fail("Order Update", "Linked dustbin not found.");
          }

          const dailyRate = Number(dustbinDoc.order_extension_price);
          const calculatedPrice = days * dailyRate;
          if (calculatedPrice !== extensionPrice) {
            return fail(
              "Order Update",
              "Extension price does not match server pricing.",
            );
          }

          const extensionCopy = orderMessages.orderExtended({
            customerName:
              existingOrder.user?.name || socket.user?.name || "Customer",
            serviceType: existingOrder.service_type,
            order: existingOrder,
            extendedDays: days,
            extendedPrice: extensionPrice,
            newEndDate,
          });

          const walletPaymentRef = `wallet_ext_${orderId}_${newEndDate.toISOString()}`;
          const paymentRef =
            resolvedPaymentType === "wallet"
              ? walletPaymentRef
              : extended_paymentId;
          const newEndDateIso = newEndDate.toISOString();

          const existingTxn =
            resolvedPaymentType === "wallet"
              ? await TransactionModel.findOne({
                  order: orderId,
                  type: "debit",
                  "metadata.flow": "order_extension",
                  "metadata.payment_type": "wallet",
                  "metadata.new_end_date_iso": newEndDateIso,
                }).lean()
              : await TransactionModel.findOne({
                  stripePaymentIntentId: extended_paymentId,
                  type: "debit",
                }).lean();

          if (existingTxn || existingOrder.extended_paymentId === paymentRef) {
            const currentOrder = await Order.findById(orderId)
              .populate("to_id")
              .populate("dustbin")
              .populate("user");
            if (typeof callback === "function") {
              callback({
                success: true,
                order: currentOrder,
                title: extensionCopy.customer.title,
                message: extensionCopy.customer.description,
              });
            }
            return;
          }

          if (resolvedPaymentType === "wallet") {
            const walletUser = await User.findById(senderId)
              .select("balance")
              .lean();
            if (
              !walletUser ||
              Number(walletUser.balance || 0) < extensionPrice
            ) {
              return fail("Payment Error", "Insufficient wallet balance.");
            }
          } else {
            const paymentResult = await verifyExtensionPayment(
              extended_paymentId,
              extensionPrice,
              { userId: senderId },
            );
            if (!paymentResult.valid) {
              return fail(
                "Payment Error",
                paymentResult.message ||
                  "Extension payment could not be verified.",
              );
            }
          }

          const startTime = new Date(existingOrder.start_date).getTime();
          const oldEndTime = previousEndDate.getTime();
          let bookingIndex = -1;

          for (let i = 0; i < (dustbinDoc.bookings || []).length; i++) {
            const booking = dustbinDoc.bookings[i];
            if (
              new Date(booking.startDate).getTime() === startTime &&
              new Date(booking.endDate).getTime() === oldEndTime
            ) {
              bookingIndex = i;
              break;
            }
          }

          if (bookingIndex === -1) {
            return fail(
              "Order Update",
              "Dustbin booking record not found for this order.",
            );
          }

          for (let i = 0; i < dustbinDoc.bookings.length; i++) {
            if (i === bookingIndex) continue;
            const booking = dustbinDoc.bookings[i];
            if (
              isOverlapping(
                existingOrder.start_date,
                newEndDate,
                booking.startDate,
                booking.endDate,
              )
            ) {
              return fail(
                "Order Update",
                "Extension conflicts with another dustbin booking.",
              );
            }
          }

          let walletOwnerPayout = 0;
          let walletOperatorId = null;
          let walletAdminId = null;
          let walletCommission = 0;

          if (resolvedPaymentType === "wallet") {
            const debitedCustomer = await User.findOneAndUpdate(
              {
                _id: senderId,
                balance: { $gte: extensionPrice },
              },
              { $inc: { balance: -extensionPrice } },
              { new: true },
            );
            if (!debitedCustomer) {
              return fail("Payment Error", "Insufficient wallet balance.");
            }

            walletOperatorId =
              existingOrder.to_id?._id?.toString() ||
              existingOrder.to_id?.toString();
            if (walletOperatorId) {
              const { amount: ownerPayout } = computeSplit(extensionPrice, {
                driveaway: false,
                cancelation: false,
              });
              walletOwnerPayout = Number(ownerPayout);
              await User.findByIdAndUpdate(walletOperatorId, {
                $inc: { balance: walletOwnerPayout },
              });
              await TransactionModel.create({
                user: walletOperatorId,
                order: orderId,
                amount: walletOwnerPayout,
                type: "credit",
                stripePaymentIntentId: null,
                metadata: {
                  source: "socket",
                  flow: "order_extension",
                  payment_type: "wallet",
                  extended_days: days,
                  new_end_date_iso: newEndDateIso,
                  reason: "Wallet credit for order extension",
                },
              });

              // Credit the platform's 15% commission to the admin wallet so the
              // closed wallet ledger stays balanced for extensions too.
              walletCommission = Number(
                (extensionPrice - walletOwnerPayout).toFixed(2),
              );
              const adminForFee = await User.findOne({
                $or: [{ type: "admin" }, { role: "admin" }],
              })
                .select("_id")
                .lean();
              walletAdminId = adminForFee?._id || null;
              if (walletAdminId && walletCommission > 0) {
                await User.findByIdAndUpdate(walletAdminId, {
                  $inc: { balance: walletCommission },
                });
                await TransactionModel.create({
                  user: walletAdminId,
                  order: orderId,
                  amount: walletCommission,
                  type: "credit",
                  stripePaymentIntentId: null,
                  metadata: {
                    source: "socket",
                    flow: "order_extension",
                    payment_type: "wallet",
                    extended_days: days,
                    reason: "Platform commission for order extension",
                  },
                });
              }
            }
          }

          dustbinDoc.bookings[bookingIndex].endDate = newEndDate;
          await dustbinDoc.save();

          const existingMeta = { ...(existingOrder.metadata || {}) };
          const extensionHistory = Array.isArray(existingMeta.extensionHistory)
            ? [...existingMeta.extensionHistory]
            : [];
          const extensionEntry = {
            extended_days: days,
            extended_days_price: extensionPrice,
            previous_end_date: previousEndDate,
            new_end_date: newEndDate,
            extended_paymentId: paymentRef,
            payment_type: resolvedPaymentType,
            dailyRate,
            requestedBy: senderId,
            processedAt: new Date(),
          };
          extensionHistory.push(extensionEntry);

          const updatedOrder = await Order.findOneAndUpdate(
            {
              _id: orderId,
              user: senderId,
              status: "accepted",
              end_date: previousEndDate,
            },
            {
              $set: {
                end_date: newEndDate,
                extended_days: days,
                extended_price: extensionPrice,
                new_end_date: newEndDate,
                extended_paymentId: paymentRef,
                metadata: {
                  ...existingMeta,
                  extensionDetails: extensionEntry,
                  extensionHistory,
                },
              },
              $inc: {
                num_days: days,
                price: extensionPrice,
                total_price: extensionPrice,
              },
            },
            { new: true, runValidators: true },
          )
            .populate("to_id")
            .populate("dustbin")
            .populate("user");

          if (!updatedOrder) {
            if (resolvedPaymentType === "wallet") {
              await User.findByIdAndUpdate(senderId, {
                $inc: { balance: extensionPrice },
              });
              if (walletOperatorId && walletOwnerPayout > 0) {
                await User.findByIdAndUpdate(walletOperatorId, {
                  $inc: { balance: -walletOwnerPayout },
                });
              }
              if (walletAdminId && walletCommission > 0) {
                await User.findByIdAndUpdate(walletAdminId, {
                  $inc: { balance: -walletCommission },
                });
              }
            }
            return fail(
              "Order Update",
              "Order could not be extended. It may have been updated concurrently.",
            );
          }

          await TransactionModel.create({
            user: senderId,
            order: orderId,
            amount: extensionPrice,
            type: "debit",
            stripePaymentIntentId:
              resolvedPaymentType === "wallet" ? null : extended_paymentId,
            metadata: {
              source: "socket",
              flow: "order_extension",
              payment_type: resolvedPaymentType,
              extended_days: days,
              dailyRate,
              previous_end_date: previousEndDate,
              new_end_date: newEndDate,
              new_end_date_iso: newEndDateIso,
              reason: extensionCopy.transactionReason,
            },
          });

          await OrderTimeline.create({
            order: orderId,
            orderDeatil: updatedOrder,
            ...timelineEntry(extensionCopy),
          });

          if (typeof callback === "function") {
            callback({
              success: true,
              order: formatOrderPayload(updatedOrder, PRICING_ROLES.CUSTOMER),
              title: extensionCopy.customer.title,
              message: extensionCopy.customer.description,
            });
          }

          const operatorId = updatedOrder.to_id?._id?.toString();
          const customerLink = `https://api.binsapp.ai/customer-orders?orderId=${orderId}`;
          const ownerLink = `https://api.binsapp.ai/owner-orders?orderId=${orderId}`;

          const notifyPromises = [
            sendNotification({
              user: senderId,
              to_id: senderId,
              description: extensionCopy.customer.description,
              type: "order",
              title: extensionCopy.customer.title,
              fcmtoken:
                updatedOrder.user?.fcmtoken || socket.user?.fcmtoken || "",
              order: orderId,
              email: updatedOrder.user?.email || socket.user?.email || "",
              customEmailTemplate: true,
              html: buttonTemplate(
                customerLink,
                extensionCopy.customer.title,
                extensionCopy.customer.description,
              ),
            }),
          ];

          if (operatorId) {
            io.to(`user_${operatorId}`).emit("extend-order-renter", {
              success: true,
              order: formatOrderPayload(updatedOrder, PRICING_ROLES.OWNER),
              title: extensionCopy.operator.title,
              message: extensionCopy.operator.description,
            });
            notifyPromises.push(
              sendNotification({
                user: senderId,
                to_id: operatorId,
                description: extensionCopy.operator.description,
                type: "order",
                title: extensionCopy.operator.title,
                fcmtoken: updatedOrder.to_id?.fcmtoken || "",
                order: orderId,
                email: updatedOrder.to_id?.email || "",
                customEmailTemplate: true,
                html: buttonTemplate(
                  ownerLink,
                  extensionCopy.operator.title,
                  extensionCopy.operator.description,
                ),
              }),
            );
          }

          const adminUser = await User.findOne({
            $or: [{ type: "admin" }, { role: "admin" }],
          })
            .select("fcmtoken")
            .lean();

          if (adminUser) {
            io.to(`user_${adminUser._id.toString()}`).emit("admin-noti", {
              success: true,
              title: extensionCopy.admin.title,
              message: extensionCopy.admin.description,
              type: "order",
            });
            notifyPromises.push(
              sendNotification({
                user: senderId,
                to_id: adminUser._id.toString(),
                description: extensionCopy.admin.description,
                type: "order",
                title: extensionCopy.admin.title,
                fcmtoken: adminUser?.fcmtoken || "",
                order: orderId,
                email: "",
              }),
            );
          }

          Promise.all(notifyPromises).catch((err) =>
            logger.error("Extension notifications failed", err),
          );
        } catch (error) {
          logger.error("extend-order-renter failed", error);
          fail("Order Update", error.message || "Failed to extend order.");
        }
      },
    );

    // Event: Renter confirms the Proof of Work Done has been submitted
    socket.on(
      "proofofworkdone-order-renter",
      async ({ orderId, proofOfWorkDone }, callback) => {
        try {
          const senderId = socket.user._id.toString();
          if (!senderId) {
            if (typeof callback === "function") {
              callback({
                success: false,
                title: "Order Update",
                message: "Sender not found!",
              });
            }
            return;
          }
          const updatedSession = await Order.findOneAndUpdate(
            {
              _id: orderId,
              status: "accepted",
              to_id: senderId,
            },
            { proofOfWorkDone: proofOfWorkDone },
            { new: true, runValidators: true },
          )
            .populate("to_id")
            .populate("user")
            .populate("dumbster")
            .populate("dustbin");
          if (updatedSession == null) {
            if (typeof callback === "function") {
              callback({
                success: false,
                title: "Order Update",
                message: "Order not found.",
              });
            }
            return io.to(`user_${senderId}`).emit("update-order-renter", {
              success: false,
              title: "Order Update",
              message: "Order not found.",
            });
          }

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
              user: senderId,
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
                user: senderId,
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

          io.to(`user_${senderId}`).emit("proofofworkdone-order-renter", {
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

          if (typeof callback === "function") {
            callback({
              success: true,
              title: submitCopy.operator.title,
              message: submitCopy.operator.description,
            });
          }
        } catch (error) {
          console.log(error);
          logger.error(error.message);
        }
      },
    );

    // Event: Renter confirms the dumpster has been dropped off at the customer's location
    socket.on(
      "dropoff-order-renter",
      async ({ orderId, dropoffimage }, callback) => {
        try {
          const senderId = socket.user._id.toString();
          if (!senderId) {
            if (typeof callback === "function") {
              callback({
                success: false,
                title: "Order Update",
                message: "Sender not found!",
              });
            }
            return;
          }
          // console.log(orderId, dropoffimage, callback, "orderId, dropoffimage");
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
            if (typeof callback === "function") {
              callback({
                success: false,
                title: "Order Update",
                message: "Order not found.",
              });
            }
            return io.to(`user_${senderId}`).emit("update-order-renter", {
              success: false,
              title: "Order Update",
              message: "Order not found.",
            });
          }

          updatedSession.dropoffimage = dropoffimage;
          await updatedSession.save();

          const dropCopy = orderMessages.dropoff({
            customerName: updatedSession.user?.name,
            providerName: updatedSession.to_id?.name,
            serviceType: updatedSession.service_type,
            order: updatedSession,
          });

          await OrderTimeline.create({
            order: updatedSession._id,
            orderDeatil: updatedSession,
            ...timelineEntry(dropCopy),
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
              user: senderId,
              to_id: updatedSession.user._id.toString(),
              description: dropCopy.customer.description,
              type: "order",
              title: dropCopy.customer.title,
              fcmtoken: updatedSession.user.fcmtoken,
              order: updatedSession._id.toString(),
              noti: false,
              email: updatedSession.user?.email || "",
              customEmailTemplate: true,
              html: buttonTemplate(
                customerLink,
                dropCopy.customer.title,
                dropCopy.customer.description,
              ),
            }),
            sendNotification({
              user: updatedSession.to_id._id.toString(),
              to_id: updatedSession.to_id._id.toString(),
              description: dropCopy.operator.description,
              type: "order",
              title: dropCopy.operator.title,
              fcmtoken: updatedSession.to_id.fcmtoken,
              order: updatedSession._id.toString(),
              noti: false,
              email: updatedSession.to_id?.email || "",
              customEmailTemplate: true,
              html: buttonTemplate(
                ownerLink,
                dropCopy.operator.title,
                dropCopy.operator.description,
              ),
            }),
          ];

          if (adminUser) {
            io.to(`user_${adminUser._id.toString()}`).emit("admin-noti", {
              success: true,
              title: dropCopy.admin.title,
              message: dropCopy.admin.description,
              type: "order",
            });
            notifyPromises.push(
              sendNotification({
                user: senderId,
                to_id: adminUser._id.toString(),
                description: dropCopy.admin.description,
                type: "order",
                title: dropCopy.admin.title,
                fcmtoken: adminUser?.fcmtoken || "",
                order: updatedSession._id.toString(),
                email: "",
              }),
            );
          }

          io.to(`user_${senderId}`).emit("dropoff-order-renter", {
            success: true,
            order: formatOrderPayload(updatedSession, PRICING_ROLES.OWNER),
            title: dropCopy.operator.title,
            message: dropCopy.operator.description,
          });
          io.to(`user_${updatedSession.user._id.toString()}`).emit(
            "dropoff-order-rentee",
            {
              success: true,
              order: formatOrderPayload(updatedSession, PRICING_ROLES.CUSTOMER),
              title: dropCopy.customer.title,
              message: dropCopy.customer.description,
            },
          );

          Promise.all(notifyPromises).catch((err) =>
            logger.error("Dropoff notification failed", err),
          );

          if (typeof callback === "function") {
            callback({
              success: true,
              title: dropCopy.operator.title,
              message: dropCopy.operator.description,
            });
          }
        } catch (error) {
          console.log(error);
          logger.error(error.message);
        }
      },
    );

    // Event: Renter updates the order status (e.g., Complete or Cancel), processes Stripe payouts/refund requests
    socket.on("update-order-renter", async ({ orderId, status }, callback) => {
      try {
        const senderId = socket.user._id.toString();
        if (!senderId) {
          callback({
            success: false,
            title: "Order Update",
            message: "Sender not found!",
          });
          return;
        }

        const validStatuses = ["completed", "cancelled"];

        if (!validStatuses.includes(status)) {
          callback({
            success: false,
            title: "Order Update",
            message: "Status is invalid",
          });
          return;
        }

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
          callback({
            success: false,
            title: "Order Update",
            message: "Order not found.",
          });
          return;
        }

        const serviceType = updatedSession.service_type || "Dumbster";
        const startTime = new Date(updatedSession.start_date).getTime();
        const endTime = new Date(updatedSession.end_date).getTime();

        if (serviceType === "Dumbster" || serviceType === "Porta Potty") {
          const dustbin = await Dustbin.findById(updatedSession.dustbin);
          if (!dustbin) {
            callback({
              success: false,
              title: "Dustbin Update",
              message: "Dustbin not found",
            });
            return;
          }

          // Find and remove the booking
          dustbin.bookings = dustbin.bookings.filter((booking) => {
            return !(
              new Date(booking.startDate).getTime() === startTime &&
              new Date(booking.endDate).getTime() === endTime
            );
          });

          dustbin.availableQuantity =
            Number(dustbin.availableQuantity) + Number(updatedSession.quantity);

          await dustbin.save();
        } else if (serviceType === "Junk Removal") {
          const junkRemovalId =
            updatedSession.junkRemoval?._id ||
            updatedSession.to_id?.junkRemoval ||
            updatedSession.to_id?.junkRemoval?._id;

          if (junkRemovalId) {
            const jr = await JunkRemoval.findById(junkRemovalId);
            if (jr) {
              jr.bookings = (jr.bookings || []).filter((booking) => {
                return !(
                  new Date(booking.startDate).getTime() === startTime &&
                  new Date(booking.endDate).getTime() === endTime
                );
              });
              await jr.save();
            }
          }
        } else if (serviceType === "Tree Removal") {
          const treeRemovalId =
            updatedSession.treeRemoval?._id ||
            updatedSession.to_id?.treeRemoval ||
            updatedSession.to_id?.treeRemoval?._id;

          if (treeRemovalId) {
            const tr = await TreeRemoval.findById(treeRemovalId);
            if (tr) {
              tr.bookings = (tr.bookings || []).filter((booking) => {
                return !(
                  new Date(booking.startDate).getTime() === startTime &&
                  new Date(booking.endDate).getTime() === endTime
                );
              });
              await tr.save();
            }
          }
        }

        if (status === "cancelled") {
          const cancelCopy = orderMessages.cancelRequested({
            customerName: updatedSession.user?.name,
            providerName: updatedSession.to_id?.name,
            serviceType,
            order: updatedSession,
          });

          updatedSession.cancelation_request = true;
          await updatedSession.save();
          await OrderTimeline.create({
            order: updatedSession._id,
            orderDeatil: updatedSession,
            ...timelineEntry(cancelCopy),
          });
          await User.findByIdAndUpdate(senderId, {
            $inc: {
              "ordersDetails.accepted": -1,
              "ordersDetails.cancelled": 1,
            },
          });

          try {
            await JobEvent.create({
              operatorId: senderId,
              orderId: orderId,
              eventType: "JOB_CANCELLED",
            });
            ScoreEngine.calculateOperatorScore(senderId).catch((err) =>
              logger.error("Score recalculation failed on cancel", err),
            );
          } catch (jobEventErr) {
            logger.error("Failed to log JOB_CANCELLED event", jobEventErr);
          }

          const cancelNotify = [
            sendNotification({
              user: updatedSession.to_id._id.toString(),
              to_id: updatedSession.to_id._id.toString(),
              description: cancelCopy.operator.description,
              type: "order",
              title: cancelCopy.operator.title,
              fcmtoken: updatedSession.to_id.fcmtoken,
              order: orderId,
              noti: false,
              customEmailTemplate: true,
              html: buttonTemplate(
                `https://api.binsapp.ai/owner-orders?orderId=${orderId}`,
                cancelCopy.operator.title,
                cancelCopy.operator.description,
              ),
              email: updatedSession.to_id?.email || "",
            }),
            sendNotification({
              user: senderId,
              to_id: updatedSession.user._id.toString(),
              description: cancelCopy.customer.description,
              type: "order",
              title: cancelCopy.customer.title,
              fcmtoken: updatedSession.user.fcmtoken,
              order: orderId,
              noti: false,
              email: updatedSession.user?.email || "",
              customEmailTemplate: true,
              html: buttonTemplate(
                `https://api.binsapp.ai/customer-orders?orderId=${orderId}`,
                cancelCopy.customer.title,
                cancelCopy.customer.description,
              ),
            }),
          ];

          const cancelAdmin = await User.findOne({
            $or: [{ type: "admin" }, { role: "admin" }],
          })
            .select("fcmtoken")
            .lean();
          if (cancelAdmin) {
            io.to(`user_${cancelAdmin._id.toString()}`).emit("admin-noti", {
              success: true,
              title: cancelCopy.admin.title,
              message: cancelCopy.admin.description,
              type: "order",
            });
            cancelNotify.push(
              sendNotification({
                user: senderId,
                to_id: cancelAdmin._id.toString(),
                description: cancelCopy.admin.description,
                type: "order",
                title: cancelCopy.admin.title,
                fcmtoken: cancelAdmin?.fcmtoken || "",
                order: orderId,
                email: "",
              }),
            );
          }

          io.to(`user_${senderId}`).emit("cancel-order-renter", {
            success: true,
            order: formatOrderPayload(updatedSession, PRICING_ROLES.OWNER),
            title: cancelCopy.operator.title,
            message: cancelCopy.operator.description,
          });
          io.to(`user_${updatedSession.user._id.toString()}`).emit(
            "cancel-order-rentee",
            {
              success: true,
              order: formatOrderPayload(updatedSession, PRICING_ROLES.CUSTOMER),
              title: cancelCopy.customer.title,
              message: cancelCopy.customer.description,
            },
          );

          Promise.all(cancelNotify).catch((err) =>
            logger.error("Cancel request notification failed", err),
          );

          callback({
            success: true,
            title: cancelCopy.operator.title,
            message: cancelCopy.operator.description,
            order: formatOrderPayload(updatedSession, PRICING_ROLES.OWNER),
          });
          return;
        }

        const completeCopy = orderMessages.orderCompleted({
          customerName: updatedSession.user?.name,
          providerName: updatedSession.to_id?.name,
          serviceType,
          order: updatedSession,
        });

        // "Settled" means the owner has already been paid (transfer done).
        // Capture now happens at accept-time, so paymentHoldStatus === "captured"
        // alone must NOT short-circuit the payout transfer here.
        const alreadySettled = updatedSession.transfer === true;

        const { amount, privacyAmount } = computeSplit(updatedSession.price, {
          driveaway: updatedSession.driveaway,
          cancelation: updatedSession.cancelation,
        });

        if (
          !alreadySettled &&
          updatedSession.payment_type !== "wallet" &&
          updatedSession.paymentId
        ) {
          try {
            const captureResult = await captureHold(updatedSession.paymentId);
            if (!captureResult.success && !captureResult.alreadyCaptured) {
              updatedSession.transfer = false;
              logger.error(
                "Capture failed on order completion",
                captureResult.message,
              );
            } else if (
              updatedSession.to_id?.accountId &&
              !updatedSession.transfer
            ) {
              const transfer = await stripeClient.transfers.create({
                amount: Math.round(Number(amount) * 100),
                currency: "usd",
                destination: updatedSession.to_id.accountId,
                transfer_group: updatedSession._id.toString(),
              });
              if (transfer.id) {
                updatedSession.transferId = transfer.id;
                updatedSession.transfer = true;
                const transferMetadata = {
                  reason: completeCopy.transactionReason,
                  orderId: updatedSession._id,
                  service_type: serviceType,
                  price: updatedSession.price,
                  privacyAmount,
                  amount,
                };
                if (updatedSession.dumbster?._id) {
                  transferMetadata.dumbsterId = updatedSession.dumbster._id;
                }
                if (updatedSession.dustbin?._id) {
                  transferMetadata.dustbinId = updatedSession.dustbin._id;
                }
                if (updatedSession.junkRemoval?._id) {
                  transferMetadata.junkRemovalId =
                    updatedSession.junkRemoval._id;
                }
                if (updatedSession.treeRemoval?._id) {
                  transferMetadata.treeRemovalId =
                    updatedSession.treeRemoval._id;
                }

                await TransactionModel.create({
                  user: updatedSession.to_id._id,
                  order: updatedSession._id,
                  amount,
                  stripePaymentIntentId: updatedSession.paymentId,
                  type: "credit",
                  metadata: transferMetadata,
                });
              }
            }
            if (!updatedSession.metadata) updatedSession.metadata = {};
            updatedSession.metadata.paymentHoldStatus = "captured";
          } catch (error) {
            updatedSession.transfer = false;
            logger.error("Settlement failed on order completion", error);
          }
        }
        updatedSession.status = status;
        await updatedSession.save();
        await OrderTimeline.create({
          order: updatedSession._id,
          orderDeatil: updatedSession,
          ...timelineEntry(completeCopy),
        });
        await Promise.all([
          User.findByIdAndUpdate(
            senderId,
            {
              $inc: {
                "ordersDetails.completed": 1,
                "ordersDetails.accepted": -1,
                "binsCredit.available": 1,
                "binsCredit.total": 1,
              },
            },
            { upsert: true, new: true },
          ),
          User.findByIdAndUpdate(
            updatedSession.user._id,
            {
              $inc: {
                "binsCredit.available": 1,
                "binsCredit.total": 1,
              },
            },
            { upsert: true, new: true },
          ),
        ]);

        try {
          const effectiveEnd =
            updatedSession.new_end_date || updatedSession.end_date;
          const completedOnTime = isDeliveredOnTime(effectiveEnd);
          await JobEvent.create({
            operatorId: senderId,
            orderId: orderId,
            eventType: "JOB_COMPLETED",
            revenueGenerated: updatedSession.price || 0,
            onTime: completedOnTime,
          });
          ScoreEngine.calculateOperatorScore(senderId).catch((err) =>
            logger.error("Score recalculation failed on completion", err),
          );
          recomputeOperatorGrowth(senderId, {
            notify: true,
            reason: "order_completed_socket",
          }).catch((err) =>
            logger.error("Growth recompute failed on completion", err),
          );
        } catch (jobEventErr) {
          logger.error("Failed to log JOB_COMPLETED event", jobEventErr);
        }

        callback({
          success: true,
          order: formatOrderPayload(updatedSession, PRICING_ROLES.OWNER),
          title: completeCopy.operator.title,
          message: completeCopy.operator.description,
        });

        const completeNotify = [
          sendNotification({
            user: senderId,
            to_id: updatedSession.user._id.toString(),
            description: completeCopy.customer.description,
            type: "order",
            title: completeCopy.customer.title,
            fcmtoken: updatedSession.user.fcmtoken,
            order: orderId,
            noti: false,
            email: "",
          }),
          sendNotification({
            user: updatedSession.to_id._id.toString(),
            to_id: updatedSession.to_id._id.toString(),
            description: completeCopy.operator.description,
            type: "order",
            title: completeCopy.operator.title,
            fcmtoken: updatedSession.to_id.fcmtoken,
            order: orderId,
            noti: false,
            email: "",
          }),
        ];

        if (updatedSession.user?.email) {
          completeNotify.push(
            sendOrderEmailToUser(
              updatedSession.user?.email,
              orderId,
              updatedSession.address,
              updatedSession.price,
              updatedSession.to_id.name,
              updatedSession.to_id.phone,
              true,
            ),
          );
        }
        if (updatedSession.to_id?.email) {
          completeNotify.push(
            sendOrderEmailToUser(
              updatedSession.to_id?.email,
              orderId,
              updatedSession.address,
              updatedSession.price,
              updatedSession.user?.name,
              updatedSession.user?.phone,
              false,
            ),
          );
        }

        io.to(`user_${senderId}`).emit("update-order-renter", {
          success: true,
          order: formatOrderPayload(updatedSession, PRICING_ROLES.OWNER),
          title: completeCopy.operator.title,
          message: completeCopy.operator.description,
        });
        io.to(`user_${updatedSession.user._id.toString()}`).emit(
          "update-order-rentee",
          {
            success: true,
            order: formatOrderPayload(updatedSession, PRICING_ROLES.CUSTOMER),
            title: completeCopy.customer.title,
            message: completeCopy.customer.description,
          },
        );

        const adminUser = await User.findOne({
          $or: [{ type: "admin" }, { role: "admin" }],
        })
          .select("fcmtoken")
          .lean();

        if (adminUser) {
          io.to(`user_${adminUser._id.toString()}`).emit("admin-noti", {
            success: true,
            title: completeCopy.admin.title,
            message: completeCopy.admin.description,
            type: "order",
          });
          completeNotify.push(
            sendNotification({
              user: senderId,
              to_id: adminUser._id.toString(),
              description: completeCopy.admin.description,
              type: "order",
              title: completeCopy.admin.title,
              fcmtoken: adminUser?.fcmtoken || "",
              order: orderId,
              email: "",
            }),
          );
        }

        Promise.all(completeNotify).catch((err) =>
          logger.error("Order completion notification failed", err),
        );
      } catch (error) {
        console.log(error);
        callback({
          success: false,
          title: "Order Update",
          message: error.message,
        });
      }
    });

    // Event: Customer cancels before a provider is matched
    socket.on("cancel-order-rentee", async ({ orderId }, callback) => {
      try {
        const senderId = socket.user._id.toString();
        if (!senderId) {
          return callback({
            success: false,
            title: "Order Cancel",
            message: "Sender not found!",
          });
        }

        const order = await Order.findOne({
          _id: orderId,
          user: senderId,
          status: "pending",
          to_id: null,
          paymentId: { $ne: null },
        }).populate("user");

        if (!order) {
          return callback({
            success: false,
            title: "Order Cancel",
            message: "Active searching order not found.",
          });
        }

        if (order.paymentId) {
          await releaseHold(order.paymentId);

          // Reverse the booking-time hold debit so the customer's ledger nets
          // to zero (the hold was released, so no money was actually taken).
          const bookingDebit = await TransactionModel.findOne({
            order: orderId,
            stripePaymentIntentId: order.paymentId,
            type: "debit",
          });
          if (bookingDebit) {
            const alreadyReversed = await TransactionModel.findOne({
              order: orderId,
              stripePaymentIntentId: order.paymentId,
              type: "credit",
              "metadata.flow": "booking_cancel_reversal",
            });
            if (!alreadyReversed) {
              await TransactionModel.create({
                user: bookingDebit.user,
                order: orderId,
                amount: bookingDebit.amount,
                type: "credit",
                stripePaymentIntentId: order.paymentId,
                metadata: {
                  source: "socket",
                  flow: "booking_cancel_reversal",
                  reason: "Hold released — booking authorization reversed",
                },
              });
            }
          }
        }

        const cancelCopy = orderMessages.preMatchCancelled({
          customerName: order.user?.name || socket.user?.name,
          serviceType: order.service_type,
          order,
        });

        const cancelled = await Order.findByIdAndUpdate(
          orderId,
          {
            $set: {
              status: "cancelled",
              "metadata.searchExpired": false,
              "metadata.cancelledBy": "customer",
              "metadata.paymentHoldStatus": "cancelled",
            },
          },
          { new: true },
        );

        await OrderTimeline.create({
          order: orderId,
          orderDeatil: cancelled,
          ...timelineEntry(cancelCopy),
        });

        await DispatchService.cancelRemainingWaves(orderId);
        await cancelOrderExpiry(orderId);

        const notifyPromises = [
          sendNotification({
            user: senderId,
            to_id: senderId,
            description: cancelCopy.customer.description,
            type: "order",
            title: cancelCopy.customer.title,
            fcmtoken: order.user?.fcmtoken || socket.user?.fcmtoken || "",
            order: orderId,
            email: order.user?.email || "",
          }),
        ];

        if (order.userIds?.length) {
          for (const userId of order.userIds) {
            io.to(`user_${userId.toString()}`).emit("cancel-order-renter", {
              success: true,
              order: formatOrderPayload(cancelled, PRICING_ROLES.OWNER),
              title: cancelCopy.operator.title,
              message: cancelCopy.operator.description,
            });
            notifyPromises.push(
              sendNotification({
                user: senderId,
                to_id: userId.toString(),
                description: cancelCopy.operator.description,
                type: "order",
                title: cancelCopy.operator.title,
                order: orderId,
                email: "",
                noti: false,
              }),
            );
          }
        }

        const adminUser = await User.findOne({
          $or: [{ type: "admin" }, { role: "admin" }],
        })
          .select("fcmtoken")
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
              user: senderId,
              to_id: adminUser._id.toString(),
              description: cancelCopy.admin.description,
              type: "order",
              title: cancelCopy.admin.title,
              fcmtoken: adminUser?.fcmtoken || "",
              order: orderId,
              email: "",
            }),
          );
        }

        io.to(`user_${senderId}`).emit("cancel-order-rentee", {
          success: true,
          order: formatOrderPayload(cancelled, PRICING_ROLES.CUSTOMER),
          title: cancelCopy.customer.title,
          message: cancelCopy.customer.description,
        });

        Promise.all(notifyPromises).catch((err) =>
          logger.error("Pre-match cancel notification failed", err),
        );

        if (typeof callback === "function") {
          callback({
            success: true,
            order: formatOrderPayload(cancelled, PRICING_ROLES.CUSTOMER),
            title: cancelCopy.customer.title,
            message: cancelCopy.customer.description,
          });
        }
      } catch (error) {
        logger.error("cancel-order-rentee failed", error);
        if (typeof callback === "function") {
          callback({
            success: false,
            title: "Order Cancel",
            message: error.message,
          });
        }
      }
    });

    // ==========================================
    // Ready To PickUp
    // ==========================================

    socket.on("ready-to-pickup", async (data, callback) => {
      try {
        const { orderId } = data;
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
          callback({
            success: false,
            message: "Order not found",
          });
          return;
        }
        order.readyToPickup = true;
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

        const adminUser = await User.findOne({
          $or: [{ type: "admin" }, { role: "admin" }],
        })
          .select("fcmtoken")
          .lean();
        if (adminUser) {
          io.to(`user_${adminUser._id.toString()}`).emit("admin-noti", {
            success: true,
            title: pickupCopy.admin.title,
            message: pickupCopy.admin.description,
            type: "order",
          });
          notifyPromises.push(
            sendNotification({
              user: order.user._id.toString(),
              to_id: adminUser._id.toString(),
              description: pickupCopy.admin.description,
              type: "order",
              title: pickupCopy.admin.title,
              fcmtoken: adminUser?.fcmtoken || "",
              order: orderId,
              email: "",
            }),
          );
        }

        io.to(`user_${order.user._id.toString()}`).emit("update-order-rentee", {
          success: true,
          order: formatOrderPayload(order, PRICING_ROLES.CUSTOMER),
          title: pickupCopy.customer.title,
          message: pickupCopy.customer.description,
        });
        io.to(`user_${order.to_id._id.toString()}`).emit(
          "update-order-renter",
          {
            success: true,
            order: formatOrderPayload(order, PRICING_ROLES.OWNER),
            title: pickupCopy.operator.title,
            message: pickupCopy.operator.description,
          },
        );

        Promise.all(notifyPromises).catch((err) =>
          logger.error("Ready-to-pickup notification failed", err),
        );

        callback({
          success: true,
          title: pickupCopy.customer.title,
          message: pickupCopy.customer.description,
        });
        return;
      } catch (error) {
        console.log(error);
        callback({
          success: false,
          message: error.message,
        });
      }
    });

    // ==========================================
    // COMMERCIAL: SWAP REQUEST + WEIGHT
    // ==========================================

    socket.on("swap-request", async (payload, callback) => {
      try {
        const senderId = socket.user._id.toString();
        const { createSwapRequest, updateSwapStatus } =
          await import("../modules/company/commercialService.js");
        if (payload?.status && payload?.orderId) {
          const order = await updateSwapStatus(
            senderId,
            payload.orderId,
            payload.status,
            { role: payload.role || "customer" },
          );
          return callback?.({ success: true, order });
        }
        const result = await createSwapRequest(
          senderId,
          payload.orderId,
          payload,
        );
        return callback?.({ success: true, ...result });
      } catch (error) {
        logger.error("swap-request socket failed", error);
        return callback?.({
          success: false,
          title: "Swap Request",
          message: error.message,
        });
      }
    });

    socket.on("record-weight", async (payload, callback) => {
      try {
        const senderId = socket.user._id.toString();
        const { recordOrderWeight } =
          await import("../modules/company/commercialService.js");
        const result = await recordOrderWeight(
          senderId,
          payload.orderId,
          payload.actualWeight ?? payload.weight,
        );
        return callback?.({ success: true, ...result });
      } catch (error) {
        logger.error("record-weight socket failed", error);
        return callback?.({
          success: false,
          title: "Weight Recording",
          message: error.message,
        });
      }
    });

    // ==========================================
    // OPERATOR DRIVER MANAGEMENT & DRIVER WORKFLOW
    // ==========================================

    socket.on("operator:get-drivers", async (data, callback) => {
      try {
        const senderId = socket.user._id.toString();
        const AssignOrderService = (
          await import("../modules/assign_order/service.js")
        ).default;
        const result = await AssignOrderService.getOperatorDrivers(senderId);
        return callback?.({ success: true, ...result });
      } catch (error) {
        logger.error("operator:get-drivers error:", error);
        return callback?.({ success: false, message: error.message });
      }
    });

    socket.on("operator:add-driver", async (data, callback) => {
      try {
        const senderId = socket.user._id.toString();
        const AssignOrderService = (
          await import("../modules/assign_order/service.js")
        ).default;
        const driver = await AssignOrderService.addOperatorDriver(
          senderId,
          data,
        );
        return callback?.({
          success: true,
          message: "Driver saved successfully",
          driver,
        });
      } catch (error) {
        logger.error("operator:add-driver error:", error);
        return callback?.({ success: false, message: error.message });
      }
    });

    socket.on("operator:assign-driver", async (data, callback) => {
      try {
        const senderId = socket.user._id.toString();
        const AssignOrderService = (
          await import("../modules/assign_order/service.js")
        ).default;
        const { order, assignLink } =
          await AssignOrderService.assignDriverToOrder(senderId, data);
        return callback?.({
          success: true,
          message: "Driver assigned successfully",
          order,
          assignLink,
        });
      } catch (error) {
        logger.error("operator:assign-driver error:", error);
        return callback?.({ success: false, message: error.message });
      }
    });

    socket.on("operator:dispatch-job", async (data, callback) => {
      try {
        const senderId = socket.user._id.toString();
        const AssignOrderService = (
          await import("../modules/assign_order/service.js")
        ).default;
        const order = await AssignOrderService.dispatchJob(senderId, data);
        return callback?.({
          success: true,
          message: "Job dispatched successfully",
          order,
        });
      } catch (error) {
        logger.error("operator:dispatch-job error:", error);
        return callback?.({ success: false, message: error.message });
      }
    });

    socket.on("operator:change-driver", async (data, callback) => {
      try {
        const senderId = socket.user._id.toString();
        const AssignOrderService = (
          await import("../modules/assign_order/service.js")
        ).default;
        const order = await AssignOrderService.changeDriver(senderId, data);
        return callback?.({
          success: true,
          message: "Driver reassigned successfully",
          order,
        });
      } catch (error) {
        logger.error("operator:change-driver error:", error);
        return callback?.({ success: false, message: error.message });
      }
    });

    socket.on("operator:dashboard-live", async (data, callback) => {
      try {
        const senderId = socket.user._id.toString();
        const AssignOrderService = (
          await import("../modules/assign_order/service.js")
        ).default;
        const dashboard =
          await AssignOrderService.getOperatorLiveDashboard(senderId);
        return callback?.({ success: true, ...dashboard });
      } catch (error) {
        logger.error("operator:dashboard-live error:", error);
        return callback?.({ success: false, message: error.message });
      }
    });

    socket.on("driver:get-job-details", async ({ orderId }, callback) => {
      try {
        const driverId = socket.user._id.toString();
        const AssignOrderService = (
          await import("../modules/assign_order/service.js")
        ).default;
        const job = await AssignOrderService.getDriverJobDetails(
          driverId,
          orderId,
        );
        return callback?.({ success: true, job });
      } catch (error) {
        logger.error("driver:get-job-details error:", error);
        return callback?.({ success: false, message: error.message });
      }
    });

    socket.on("driver:en-route", async (data, callback) => {
      try {
        const driverId = socket.user._id.toString();
        const AssignOrderService = (
          await import("../modules/assign_order/service.js")
        ).default;
        const job = await AssignOrderService.driverEnRoute(driverId, data);
        return callback?.({
          success: true,
          message: "Status updated to en route",
          job,
        });
      } catch (error) {
        logger.error("driver:en-route error:", error);
        return callback?.({ success: false, message: error.message });
      }
    });

    socket.on("driver:arrived", async (data, callback) => {
      try {
        const driverId = socket.user._id.toString();
        const AssignOrderService = (
          await import("../modules/assign_order/service.js")
        ).default;
        const job = await AssignOrderService.driverArrived(driverId, data);
        return callback?.({ success: true, message: "Arrival recorded", job });
      } catch (error) {
        logger.error("driver:arrived error:", error);
        return callback?.({ success: false, message: error.message });
      }
    });

    socket.on("driver:upload-delivery-proof", async (data, callback) => {
      try {
        const driverId = socket.user._id.toString();
        const AssignOrderService = (
          await import("../modules/assign_order/service.js")
        ).default;
        const job = await AssignOrderService.uploadDeliveryProof(
          driverId,
          data,
        );
        return callback?.({
          success: true,
          message: "Proof uploaded successfully",
          job,
        });
      } catch (error) {
        logger.error("driver:upload-delivery-proof error:", error);
        return callback?.({ success: false, message: error.message });
      }
    });

    socket.on("driver:complete-delivery", async (data, callback) => {
      try {
        const driverId = socket.user._id.toString();
        const AssignOrderService = (
          await import("../modules/assign_order/service.js")
        ).default;
        const job = await AssignOrderService.completeDelivery(driverId, data);
        return callback?.({
          success: true,
          message: "Delivery completed successfully",
          job,
        });
      } catch (error) {
        logger.error("driver:complete-delivery error:", error);
        return callback?.({ success: false, message: error.message });
      }
    });

    socket.on("driver:pickup-en-route", async (data, callback) => {
      try {
        const driverId = socket.user._id.toString();
        const AssignOrderService = (
          await import("../modules/assign_order/service.js")
        ).default;
        const job = await AssignOrderService.driverEnRoute(driverId, {
          ...data,
          workflowType: "pickup",
        });
        return callback?.({
          success: true,
          message: "Status updated to pickup en route",
          job,
        });
      } catch (error) {
        logger.error("driver:pickup-en-route error:", error);
        return callback?.({ success: false, message: error.message });
      }
    });

    socket.on("driver:pickup-arrived", async (data, callback) => {
      try {
        const driverId = socket.user._id.toString();
        const AssignOrderService = (
          await import("../modules/assign_order/service.js")
        ).default;
        const job = await AssignOrderService.driverArrived(driverId, {
          ...data,
          workflowType: "pickup",
        });
        return callback?.({
          success: true,
          message: "Pickup arrival recorded",
          job,
        });
      } catch (error) {
        logger.error("driver:pickup-arrived error:", error);
        return callback?.({ success: false, message: error.message });
      }
    });

    socket.on("driver:report-pickup-issue", async (data, callback) => {
      try {
        const driverId = socket.user._id.toString();
        const AssignOrderService = (
          await import("../modules/assign_order/service.js")
        ).default;
        const job = await AssignOrderService.reportPickupIssue(driverId, data);
        return callback?.({
          success: true,
          message: "Issue reported to operator",
          job,
        });
      } catch (error) {
        logger.error("driver:report-pickup-issue error:", error);
        return callback?.({ success: false, message: error.message });
      }
    });

    socket.on("driver:upload-pickup-proof", async (data, callback) => {
      try {
        const driverId = socket.user._id.toString();
        const AssignOrderService = (
          await import("../modules/assign_order/service.js")
        ).default;
        const job = await AssignOrderService.uploadPickupProof(driverId, data);
        return callback?.({
          success: true,
          message: "Pickup proof uploaded",
          job,
        });
      } catch (error) {
        logger.error("driver:upload-pickup-proof error:", error);
        return callback?.({ success: false, message: error.message });
      }
    });

    socket.on("driver:complete-pickup", async (data, callback) => {
      try {
        const driverId = socket.user._id.toString();
        const AssignOrderService = (
          await import("../modules/assign_order/service.js")
        ).default;
        const job = await AssignOrderService.completePickup(driverId, data);
        return callback?.({
          success: true,
          message: "Pickup completed successfully",
          job,
        });
      } catch (error) {
        logger.error("driver:complete-pickup error:", error);
        return callback?.({ success: false, message: error.message });
      }
    });

    socket.on("driver:complete-swap", async (data, callback) => {
      try {
        const driverId = socket.user._id.toString();
        const AssignOrderService = (
          await import("../modules/assign_order/service.js")
        ).default;
        const job = await AssignOrderService.completeSwap(driverId, data);
        return callback?.({
          success: true,
          message: "Dumpster swap completed successfully",
          job,
        });
      } catch (error) {
        logger.error("driver:complete-swap error:", error);
        return callback?.({ success: false, message: error.message });
      }
    });

    // ==========================================
    // CHAT & MESSAGING
    // ==========================================

    // send message
    socket.on("send:message", async (data, callback) => {
      try {
        const cb = typeof callback === "function" ? callback : () => {};
        const {
          conversation_id,
          participant_id,
          content,
          type = "text",
          attachment = null,
          duration = null,
          dimensions = null,
          thumbnail = null,
          serviceType = "trips", // Default to trips if not specified
          serviceReference = null,
          metadata = {},
        } = data || {};

        // 1. Input Validation
        if (!conversation_id && !participant_id) {
          return cb({
            success: false,
            error: "Either conversation_id or participant_id is required",
          });
        }

        if (conversation_id && !isValidObjectId(conversation_id)) {
          return cb({
            success: false,
            error: "Invalid conversation ID",
          });
        }

        if (
          participant_id &&
          !conversation_id &&
          !isValidObjectId(participant_id)
        ) {
          return cb({
            success: false,
            error: "Invalid participant ID",
          });
        }

        // Validate message content based on type
        if (type === "text" && (!content || content.trim() === "")) {
          return cb({
            success: false,
            error: "Text message content cannot be empty",
          });
        }

        if (["image", "voice", "file"].includes(type) && !attachment) {
          return cb({
            success: false,
            error: `${type} message requires attachment`,
          });
        }

        // 2. Determine Sender ID
        const currentUserId = socket.assignBy
          ? new mongoose.Types.ObjectId(socket.assignBy)
          : new mongoose.Types.ObjectId(socket.user._id);

        let conversation = null;
        let targetReceiverId = null;

        // 3. Conversation Lookup / Creation
        if (conversation_id) {
          // Flow 1: Direct message using existing conversation_id
          conversation = await Conversation.findById(conversation_id).populate(
            "participants",
          );

          if (!conversation) {
            return cb({
              success: false,
              error: "Conversation not found",
            });
          }

          // Find the other participant in this conversation
          const otherParticipant = conversation.participants.find(
            (p) =>
              (p._id ? p._id.toString() : p.toString()) !==
              currentUserId.toString(),
          );
          targetReceiverId = otherParticipant
            ? otherParticipant._id || otherParticipant
            : participant_id && isValidObjectId(participant_id)
              ? new mongoose.Types.ObjectId(participant_id)
              : currentUserId;
        } else {
          // Flow 2: 1-to-1 chat lookup/creation using participant_id
          if (currentUserId.toString() === participant_id.toString()) {
            return cb({
              success: false,
              error: "You cannot message yourself",
            });
          }

          const participantId = new mongoose.Types.ObjectId(participant_id);
          const targetUser = await User.findById(participantId).lean();
          if (!targetUser) {
            return cb({
              success: false,
              error: "Participant not found",
            });
          }

          targetReceiverId = participantId;

          conversation = await Conversation.findOne({
            participants: {
              $all: [currentUserId, participantId],
            },
          }).populate("participants");

          if (!conversation) {
            const createdConversation = new Conversation({
              participants: [currentUserId, participantId],
              messages: [],
              metadata: metadata,
              status: "active",
            });
            await createdConversation.save();
            conversation = await Conversation.findById(
              createdConversation._id,
            ).populate("participants");
          }
        }

        // 4. Build Message Data
        const messageData = {
          conversationId: conversation._id,
          senderId: currentUserId,
          type,
          receiverId: targetReceiverId,
        };

        if (type === "text") {
          messageData.content = content;
        }

        if (["image", "voice", "file"].includes(type) && attachment) {
          messageData.attachment = {
            url: attachment.url,
            filename: attachment.filename,
            mimetype: attachment.mimetype,
            size: attachment.size,
          };

          if (type === "voice" && attachment.duration) {
            messageData.attachment.duration = attachment.duration;
          }

          if (type === "image" && dimensions) {
            messageData.attachment.dimensions = dimensions;
          }
        }

        if (type === "image" && thumbnail) {
          messageData.thumbnail = thumbnail;
        }

        // 5. Save Message & Update Conversation
        const message = new Message(messageData);
        await message.save();

        conversation.messages.push(message._id);
        conversation.lastMessage = message._id;
        conversation.lastActivity = new Date();
        await conversation.save();

        const populatedMessage = await message.populate("senderId");

        // 6. Notify & Emit to Participants
        conversation.participants.forEach(async (participantDoc) => {
          const pId = (participantDoc._id || participantDoc).toString();
          if (pId !== socket.user._id.toString()) {
            sendNotification({
              user: currentUserId.toString(),
              to_id: pId,
              type: "message",
              fcmtoken: participantDoc.fcmtoken || "",
              description: `${socket.user.name || "A user"} sent you a ${type} message`,
              title: "New Message",
              metadata: {
                conversationId: conversation._id.toString(),
                messageId: message._id.toString(),
                message: JSON.stringify(populatedMessage),
              },
            });
          }
          io.to(`user_${pId}`).emit("new:message", {
            conversationId: conversation._id,
            message: populatedMessage,
          });
        });

        return cb({ success: true, message: populatedMessage });
      } catch (error) {
        logger.error("Error handling send:message:", error);
        const cb = typeof callback === "function" ? callback : () => {};
        return cb({ success: false, error: error.message });
      }
    });

    // Handle message replies
    socket.on("reply:message", async (data, callback) => {
      try {
        const {
          participant_id,
          content,
          type = "text",
          replyTo,
          attachment = null,
          duration = null,
          dimensions = null,
          thumbnail = null,
          serviceType = "trips", // Default to trips if not specified
          serviceReference = null,
          metadata = {},
        } = data;

        if (!isValidObjectId(participant_id)) {
          callback({ success: false, error: "Invalid participant ID" });
          return;
        }

        if (!isValidObjectId(replyTo)) {
          callback({ success: false, error: "Invalid reply message ID" });
          return;
        }

        // Verify the original message exists and user has access
        const originalMessage = await Message.findById(replyTo);
        if (!originalMessage) {
          callback({ success: false, error: "Original message not found" });
          return;
        }

        // Verify user is a participant in the conversation
        let currentUserId;
        if (socket.assignBy) {
          currentUserId = new mongoose.Types.ObjectId(socket.assignBy);
        } else {
          currentUserId = new mongoose.Types.ObjectId(socket.user._id);
        }

        const participantId = new mongoose.Types.ObjectId(participant_id);

        let conversation = await Conversation.findOne({
          participants: {
            $all: [currentUserId, participantId],
          },
        });

        if (!conversation) {
          // Validate serviceType for new conversation
          const validServiceTypes = [
            "trips",
            "shippings",
            "parkings",
            "rentals",
            "tours",
          ];
          if (!validServiceTypes.includes(serviceType)) {
            callback({
              success: false,
              error: `Invalid service type. Must be one of: ${validServiceTypes.join(
                ", ",
              )}`,
            });
            return;
          }

          const createdConversation = new Conversation({
            participants: [socket.user._id, participant_id],
            messages: [],
            serviceType: serviceType,
            serviceReference: serviceReference,
            metadata: metadata,
            status: "active",
          });
          await createdConversation.save();
          conversation = createdConversation;
        }

        // Validate message content based on type
        if (type === "text" && (!content || content.trim() === "")) {
          callback({
            success: false,
            error: "Text message content cannot be empty",
          });
          return;
        }

        if (["image", "voice", "file"].includes(type) && !attachment) {
          callback({
            success: false,
            error: `${type} message requires attachment`,
          });
          return;
        }

        // Prepare message data
        const messageData = {
          conversationId: conversation._id,
          senderId: currentUserId,
          type,
          receiverId: participant_id,
          replyTo: replyTo,
        };

        // Add content for text messages
        if (type === "text") {
          messageData.content = content;
        }

        // Add attachment data for non-text messages
        if (["image", "voice", "file"].includes(type) && attachment) {
          messageData.attachment = {
            url: attachment.url,
            filename: attachment.filename,
            mimetype: attachment.mimetype,
            size: attachment.size,
          };

          if (type === "voice" && duration) {
            messageData.attachment.duration = duration;
          }

          if (type === "image" && dimensions) {
            messageData.attachment.dimensions = dimensions;
          }
        }

        if (type === "image" && thumbnail) {
          messageData.thumbnail = thumbnail;
        }

        // Create and save message
        const message = new Message(messageData);
        await message.save();

        // Update reply count on original message
        await Message.findByIdAndUpdate(replyTo, {
          $inc: { "metadata.replyCount": 1 },
        });

        // Add message to conversation
        conversation.messages.push(message._id);
        conversation.lastMessage = message._id;
        conversation.lastActivity = new Date();
        await conversation.save();

        // Populate sender details and original message
        const populatedMessage = await message.populate([
          {
            path: "senderId",
            select: "first_name sur_name profile.publicAvatar",
          },
          { path: "replyTo", select: "content type attachment senderId" },
        ]);

        // Emit message to all participants
        conversation.participants.forEach((participantId) => {
          io.to(`user_${participantId}`).emit("new:message", {
            conversationId: conversation._id,
            message: populatedMessage,
          });
        });

        if (callback) {
          callback({ success: true, message: populatedMessage });
        }
      } catch (error) {
        console.error("Error in reply:message handler:", error);
        logger.error("Error handling reply:message:", error);
        if (callback) {
          callback({ success: false, error: error.message });
        }
      }
    });

    // Handle message reactions
    socket.on("react:message", async (data, callback) => {
      try {
        const { messageId, emoji } = data;

        if (!isValidObjectId(messageId)) {
          callback({ success: false, error: "Invalid message ID" });
          return;
        }

        // Validate emoji (basic validation)
        if (!emoji || typeof emoji !== "string" || emoji.length > 10) {
          callback({ success: false, error: "Invalid emoji" });
          return;
        }

        const message = await Message.findById(messageId);
        if (!message) {
          callback({ success: false, error: "Message not found" });
          return;
        }

        // Verify user is a participant in the conversation
        const conversation = await Conversation.findById(
          message.conversationId,
        );
        if (!conversation.participants.includes(socket.user._id)) {
          callback({
            success: false,
            error: "Not authorized to react to this message",
          });
          return;
        }

        const userId = socket.user._id.toString();
        const reactions = message.reactions || new Map();

        // Toggle reaction
        if (reactions.has(emoji)) {
          const emojiReactions = reactions.get(emoji);
          if (emojiReactions.has(userId)) {
            // Remove reaction
            emojiReactions.delete(userId);
            if (emojiReactions.size === 0) {
              reactions.delete(emoji);
            }
          } else {
            // Add reaction
            emojiReactions.set(userId, socket.user._id);
          }
        } else {
          // Add new emoji reaction
          const emojiReactions = new Map();
          emojiReactions.set(userId, socket.user._id);
          reactions.set(emoji, emojiReactions);
        }

        // Calculate total reaction count
        let totalReactions = 0;
        for (const emojiReactions of reactions.values()) {
          totalReactions += emojiReactions.size;
        }

        // Update message
        await Message.findByIdAndUpdate(messageId, {
          reactions: reactions,
          "metadata.reactionCount": totalReactions,
        });

        // Emit reaction update to all participants
        conversation.participants.forEach((participantId) => {
          io.to(`user_${participantId}`).emit("message:reaction", {
            messageId: messageId,
            emoji: emoji,
            userId: userId,
            reactionCount: totalReactions,
            reactions: Object.fromEntries(reactions),
          });
        });

        if (callback) {
          callback({
            success: true,
            emoji: emoji,
            reactionCount: totalReactions,
            reactions: Object.fromEntries(reactions),
          });
        }
      } catch (error) {
        console.error("Error in react:message handler:", error);
        logger.error("Error handling react:message:", error);
        if (callback) {
          callback({ success: false, error: error.message });
        }
      }
    });

    // Handle typing indicator
    socket.on("typing:start", (data) => {
      const { participant_id } = data;
      if (isValidObjectId(participant_id)) {
        socket.to(`user_${participant_id}`).emit("user:typing", {
          userId: socket.user._id,
          isTyping: true,
          timestamp: new Date(),
        });
      }
    });

    socket.on("typing:stop", (data) => {
      const { participant_id } = data;
      if (isValidObjectId(participant_id)) {
        socket.to(`user_${participant_id}`).emit("user:typing", {
          userId: socket.user._id,
          isTyping: false,
          timestamp: new Date(),
        });
      }
    });

    // Handle message delivery status
    socket.on("message:delivered", async (data, callback) => {
      try {
        const { messageId } = data;

        if (!isValidObjectId(messageId)) {
          callback({ success: false, error: "Invalid message ID" });
          return;
        }

        const message = await Message.findById(messageId);
        if (!message) {
          callback({ success: false, error: "Message not found" });
          return;
        }

        // Verify user is the receiver
        if (message.receiverId.toString() !== socket.user._id.toString()) {
          callback({
            success: false,
            error: "Not authorized to mark this message as delivered",
          });
          return;
        }

        // Update delivery status
        await Message.findByIdAndUpdate(messageId, {
          "deliveryStatus.delivered": true,
          "deliveryStatus.deliveredAt": new Date(),
        });

        // Notify sender
        const senderSocketId = connectedUsers.get(message.senderId.toString());
        if (senderSocketId) {
          io.to(senderSocketId).emit("message:status", {
            messageId: messageId,
            status: "delivered",
            timestamp: new Date(),
          });
        }

        if (callback) {
          callback({ success: true, status: "delivered" });
        }
      } catch (error) {
        console.error("Error in message:delivered handler:", error);
        logger.error("Error handling message:delivered:", error);
        if (callback) {
          callback({ success: false, error: error.message });
        }
      }
    });

    // Handle message read status
    socket.on("message:read", async (data, callback) => {
      try {
        const { messageId } = data;

        if (!isValidObjectId(messageId)) {
          callback({ success: false, error: "Invalid message ID" });
          return;
        }

        const message = await Message.findById(messageId);
        if (!message) {
          callback({ success: false, error: "Message not found" });
          return;
        }

        // Verify user is the receiver
        if (message.receiverId.toString() !== socket.user._id.toString()) {
          callback({
            success: false,
            error: "Not authorized to mark this message as read",
          });
          return;
        }

        // Update read status
        await Message.findByIdAndUpdate(messageId, {
          "deliveryStatus.read": true,
          "deliveryStatus.readAt": new Date(),
        });

        // Notify sender
        const senderSocketId = connectedUsers.get(message.senderId.toString());
        if (senderSocketId) {
          io.to(senderSocketId).emit("message:status", {
            messageId: messageId,
            status: "read",
            timestamp: new Date(),
          });
        }

        if (callback) {
          callback({ success: true, status: "read" });
        }
      } catch (error) {
        console.error("Error in message:read handler:", error);
        logger.error("Error handling message:read:", error);
        if (callback) {
          callback({ success: false, error: error.message });
        }
      }
    });

    socket.on("bin-approve-view", async ({}) => {
      const senderId = Object.keys(connectedUsers).find((userId) =>
        connectedUsers[userId].has(socket.id),
      );
      if (!senderId) {
        return socket.emit("socket_error", { message: "Sender not found!" });
      }

      await updateBadgeCount(senderId, { bin: 0 });

      const userData = await getUserBadgeData(senderId);
      io.to(senderId).emit("bin-approve", userData);
    });

    //BIN ORDER VIEW
    socket.on("Sidebar:count", async (type, callback) => {
      try {
        let count = 0;
        if (type === "order") {
          count = await Order.countDocuments({ isAdminSeen: false });
        } else if (type === "support") {
          count = await Support.countDocuments({ isAdminSeen: false });
        } else if (type === "menual_review_request") {
          const treeCount = await AdminManualReviewRequest.countDocuments({
            status: "pending",
            service_type: "Tree Removal",
          });
          const junkCount = await AdminManualReviewRequest.countDocuments({
            status: "pending",
            service_type: "Junk Removal",
          });
          count = {
            tree: treeCount,
            junk: junkCount,
          };
        }
        callback({ success: true, count });
      } catch (error) {
        console.error("Error in order:count handler:", error);
        logger.error("Error handling order:count:", error);
        callback({ success: false, error: error.message });
      }
    });

    // Order View Badge Count
    socket.on("Sidebar:view", async (type, callback) => {
      try {
        let count;
        if (type === "order") {
          count = await Order.updateMany(
            { isAdminSeen: false },
            { isAdminSeen: true },
          );
        } else if (type === "support") {
          count = await Support.updateMany(
            { isAdminSeen: false },
            { isAdminSeen: true },
          );
        }
        callback({ success: true, count });
      } catch (error) {
        console.error("Error in order:view handler:", error);
        logger.error("Error handling order:view:", error);
        callback({ success: false, error: error.message });
      }
    });

    // Handle disconnect
    socket.on("disconnect", () => {
      connectedUsers.delete(socket.user._id.toString());
      logger.info(
        `User disconnected: ${socket.user._id}, socket id: ${socket.id}`,
      );
    });
  });

  return io;
};

export const getUserSocketId = (userId) => {
  return connectedUsers.get(userId.toString()) || null;
};

export const broadcastToUser = (io, userId, event, data) => {
  io.to(`user_${userId}`).emit(event, {
    ...data,
    timestamp: new Date(),
  });
};

export const forceDisconnectUser = (
  io,
  userId,
  reason = "Force disconnect",
) => {
  const socketId = connectedUsers.get(userId.toString());
  if (socketId) {
    const socket = io.sockets.sockets.get(socketId);
    if (socket) {
      socket.emit("force_disconnect", { reason });
      socket.disconnect(true);
    }
  }
};

export const getConnectedUsersCount = () => {
  return connectedUsers.size;
};

export const getConnectedUsers = () => {
  return Array.from(connectedUsers.keys());
};

const allSeen = async (senderId, recipientId) => {
  try {
    const conversation = await Conversation.findOne({
      participants: { $all: [senderId, recipientId] },
    });

    if (conversation) {
      const otherId = conversation.participants.filter(
        (id) => id.toString() !== senderId,
      );

      await Message.updateMany(
        { conversationId: conversation._id, sender: otherId[0] },
        { $set: { seen: true } },
      );
    }
    return 0;
  } catch (error) {
    return 0;
  }
};

const getNewUserConversations = async (
  user_id,
  conversation_id,
  lastMessage,
) => {
  try {
    // Extract the user ID from the parameters
    const userId = user_id;
    const conversationId = conversation_id;
    const conversation = await Conversation.findOne({ _id: conversationId })
      .select("-messageId")
      .populate("participants")
      .lean();

    if (!conversation) {
      throw new Error("Conversation not found");
    }
    const otherId = conversation.participants.filter(
      (id) => id._id.toString() !== userId.toString(),
    );
    conversation.otherUser = otherId[0];
    delete conversation.participants;
    const unseenMessages = await Message.countDocuments({
      conversationId: conversation._id,
      sender: otherId[0]?._id,
      seen: false,
    });
    conversation.lastMsg = lastMessage;
    conversation.unseen = unseenMessages;
    return conversation;
  } catch (error) {
    console.log(error);
    // If an error occurs during the execution, throw it
  }
};
