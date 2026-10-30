import OrderService from "./service.js";
import User from "../../models/User.js";
import Order from "../../models/Order.js";
import Tier from "../../models/Tier.js";
import JobSites from "../../models/JobSites.js";
import { PRICING_ROLES } from "../../utils/orderPricing.js";
import { sendEmail } from "../../utils/emailHelper.js";
import mongoose from "mongoose";
import logger from "../../config/logger.js";
const orderService = new OrderService();

export const fetchrequestOrder = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { page, limit, status } = req.query;
    // const id = req.params.id;
    let query = {};
    if (status) {
      query.status = status;
    } else {
      query.status = "pending";
    }
    // const tier = await Tier.findOne({ level: req.user.operatorStats.tier });
    // // if (id) {
    // //   query._id = { $lt: id };
    // // }
    // // query.user = userId;
    // if (tier) {
    //   const cutoffTime = new Date(
    //     Date.now() - tier.dispatchDelaySeconds * 1000,
    //   );
    //   query.createdAt = { $gte: cutoffTime };
    // }
    query.rejected_by = { $nin: [userId] };
    query.userIds = { $in: [userId] };
    if (!status || status === "pending") {
      query.to_id = null;
      // Wallet bookings reserve funds internally and store paymentId: null.
      // Stripe/card bookings always have a paymentId hold — same rule as
      // send-request-rentee duplicate-order guard in socket.js.
      query.$or = [
        { paymentId: { $ne: null } },
        { payment_type: "wallet" },
        { payment_type: "invoice" },
      ];
    }
    // console.log(query, "query");
    const orders = await orderService.fetchrequestOrder(
      query,
      parseInt(page),
      parseInt(limit),
      PRICING_ROLES.OWNER,
    );
    // await orderService.append();
    res.status(200).json(orders);
  } catch (error) {
    next(error);
  }
};

export const fetchUserrequests = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { page, limit, status } = req.query;
    const id = req.params.id;
    let query = {};
    if (status) {
      query.status = status;
    } else {
      query.status = "pending";
    }
    if (id) {
      query._id = { $lt: id };
    }
    query.rejected_by = { $nin: [userId] };
    query.accepted_by = { $nin: [userId] };
    query.userIds = { $in: [userId] };
    const orders = await orderService.fetchrequestOrder(
      query,
      parseInt(page),
      parseInt(limit),
      PRICING_ROLES.OWNER,
    );
    res.status(200).json(orders);
  } catch (error) {
    next(error);
  }
};

export const renterStats = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const stats = await orderService.renterStats(userId);
    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
};

export const renteeOrder = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { page, limit, status = "all", otherId, service_type, search, jobSite } = req.query;
    // const id = req.params.id;
    let query = {};
    if (status === "all" || !status) {
      query.status = { $in: ["pending", "accepted", "completed"] };
    } else {
      query.status = status;
    }

    if (req.query.otherId) {
      query.user = req.query.otherId;
    } else {
      query.user = userId;
    }
    const validServiceType = [
      "Dumbster",
      "Junk Removal",
      "Tree Removal",
      "Porta Potty",
    ];
    if (service_type && validServiceType.includes(service_type)) {
      query.service_type = service_type;
    }

    if (jobSite && typeof jobSite === "string" && jobSite !== "all") {
      query.jobSite = jobSite;
    }

    if (search && typeof search === "string" && search.trim()) {
      const safeSearch = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const searchRegex = { $regex: safeSearch, $options: "i" };

      // Also search associated JobSites matching siteName or address
      const matchingSites = await JobSites.find({
        $or: [
          { siteName: searchRegex },
          { address: searchRegex },
          { poNumber: searchRegex },
        ],
      }).select("_id");
      const matchingSiteIds = (matchingSites || []).map((s) => s._id);

      const orConditions = [
        { address: searchRegex },
        { "metadata.poNumber": searchRegex },
        { poNumber: searchRegex },
        { orderNumber: searchRegex },
        { unitNumber: searchRegex },
        { "deliveryWorkflow.unitNumber": searchRegex },
        { materialInformation: searchRegex },
        { category: searchRegex },
        { notes: searchRegex },
        { instructions: searchRegex },
      ];

      if (matchingSiteIds.length > 0) {
        orConditions.push({ jobSite: { $in: matchingSiteIds } });
      }

      query.$or = orConditions;
    }

    const orders = await orderService.renteeOrder(
      query,
      parseInt(page),
      parseInt(limit),
      PRICING_ROLES.CUSTOMER,
    );
    res.status(200).json({
      success: true,
      message: "Orders fetched successfully",
      data: orders,
    });
  } catch (error) {
    next(error);
  }
};

export const renterCheckRate = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const check = await orderService.renterCheckRate(userId);
    res.status(200).json({
      success: true,
      message: "Rate checked successfully",
      data: check,
    });
  } catch (error) {
    next(error);
  }
};

export const completeOrder = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const applicationId = req.params.id;
    const { status } = req.body;
    const updatedSession = await orderService.completeOrder(
      applicationId,
      userId,
      status,
    );
    res.status(200).json(updatedSession);
  } catch (error) {
    next(error);
  }
};

export const updateOnItsWay = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const orderId = req.params.id;
    const updatedSession = await orderService.updateOnItsWay(userId, orderId);
    res.status(200).json({
      success: true,
      message: "You have set order on its way to dropoff location.",
      data: updatedSession,
    });
  } catch (error) {
    next(error);
  }
};

export const fetchRenterOrder = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { page, limit, status } = req.query;
    const query = { to_id: userId };
    if (status == "all" || !status) {
      query.status = { $in: ["pending", "accepted", "completed"] };
    } else {
      query.status = status;
    }

    // console.log(query, "query");
    const orders = await orderService.renteeOrder(
      query,
      parseInt(page),
      parseInt(limit),
      PRICING_ROLES.OWNER,
    );
    res.status(200).json({
      success: true,
      message: "Orders fetched successfully",
      data: orders,
    });
  } catch (error) {
    next(error);
  }
};

export const fetchrequestOrderRentee = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { page, limit, status } = req.query;
    let query = {};
    if (status) {
      query.status = status;
    } else {
      query.status = "pending";
    }
    if (req.user?.company) {
      query.$or = [{ user: userId }, { company: req.user.company }];
    } else {
      query.user = userId;
    }
    const orders = await orderService.fetchrequestOrder(
      query,
      parseInt(page),
      parseInt(limit),
      PRICING_ROLES.CUSTOMER,
    );
    res.status(200).json(orders);
  } catch (error) {
    next(error);
  }
};

export const getRenteeOrderById = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const orderId = req.params.id;
    const order = await orderService.getSingleOrder(
      orderId,
      userId,
      PRICING_ROLES.CUSTOMER,
    );
    res.status(200).json({
      success: true,
      message: "Order fetched successfully",
      data: order,
      order: order,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteRenterOrder = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const requestId = req.params.id;
    const result = await orderService.deleteUserOrder(requestId, userId);
    res.status(200).json({
      success: true,
      message: "Request cancelled successfully",
      paymentStatus: result.paymentStatus,
      data: result.order,
    });
  } catch (error) {
    next(error);
  }
};

export const checkRate = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const check = await orderService.checkRate(userId);
    res.status(200).json({
      success: true,
      message: "Rate checked successfully",
      data: check,
    });
  } catch (error) {
    next(error);
  }
};

export const adminOrder = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status, customerId, ownerId, search } = req.query;
    let query = {};
    if (status) {
      query.status = status;
    }

    if (customerId) {
      query.user = customerId;
    }
    if (ownerId) {
      query.to_id = ownerId;
    }
    if (req.query.commercial === "true") {
      query.company = { $exists: true, $ne: null };
    }
    if (search && String(search).trim()) {
      const trimmedSearch = String(search).trim();
      const escapedSearch = trimmedSearch.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
      const searchRegex = new RegExp(escapedSearch, "i");

      const matchingUsers = await User.find({
        $or: [
          { name: searchRegex },
          { email: searchRegex },
          { phone: searchRegex },
          { comp_name: searchRegex },
        ],
      })
        .select("_id")
        .limit(50)
        .lean();

      const matchingUserIds = matchingUsers.map((u) => u._id);

      const searchConditions = [
        { user: { $in: matchingUserIds } },
        { to_id: { $in: matchingUserIds } },
        { orderNumber: searchRegex },
      ];

      // Robust merge for search conditions with existing query
      if (Object.keys(query).length > 0) {
        query = { $and: [query, { $or: searchConditions }] };
      } else {
        query = { $or: searchConditions };
      }
    }
    const orders = await orderService.renteeOrder(
      query,
      parseInt(page) || 1,
      parseInt(limit) || 10,
      PRICING_ROLES.ADMIN,
    );
    res.status(200).json({
      success: true,
      message: "Orders fetched successfully",
      data: orders,
    });
  } catch (error) {
    next(error);
  }
};

export const adminCancelRequestUpdate = async (req, res, next) => {
  try {
    const { status } = req.body;
    const orderId = req.params.id;
    const updatedSession = await orderService.adminCancelRequestUpdate(
      orderId,
      status,
      req.user._id,
    );
    res.status(200).json({
      success: true,
      message: "Request updated successfully",
      data: updatedSession,
    });
  } catch (error) {
    next(error);
  }
};

export const adminRefunedRequestUpdate = async (req, res, next) => {
  try {
    const orderId = req.params.id;
    const updatedSession = await orderService.adminRefunedRequestUpdate(
      orderId,
      req.user._id,
    );
    res.status(200).json({
      success: true,
      message: "Request updated successfully",
      data: updatedSession,
    });
  } catch (error) {
    next(error);
  }
};

export const adminTransferRequestUpdate = async (req, res, next) => {
  try {
    const orderId = req.params.id;
    const updatedSession = await orderService.adminTransferRequestUpdate(
      orderId,
      req.user._id,
    );
    res.status(200).json({
      success: true,
      message: "Request updated successfully",
      data: updatedSession,
    });
  } catch (error) {
    next(error);
  }
};

export const getOrderLiveLocation = async (req, res, next) => {
  try {
    const orderId = req.params.id;
    const location = await orderService.getOrderLiveLocation(
      orderId,
      req.user._id,
    );
    res.status(200).json({
      success: true,
      message: "Order live location fetched successfully",
      data: location,
    });
  } catch (error) {
    next(error);
  }
};

export const getOrderTimeline = async (req, res, next) => {
  try {
    const orderId = req.params.id;
    // Renter endpoint = owner/operator view; rentee endpoint = customer view.
    const url = req.originalUrl || "";
    const role = url.includes("/renter/")
      ? "operator"
      : url.includes("/rentee/")
        ? "customer"
        : "admin";
    const orderTimeline = await orderService.getOrderTimeline(orderId, role);
    res.status(200).json({
      success: true,
      message: "Order timeline fetched successfully",
      data: orderTimeline,
    });
  } catch (error) {
    next(error);
  }
};

export const adminDeleteOrder = async (req, res, next) => {
  try {
    const orderId = req.params.id;
    const updatedSession = await orderService.deleteAdminOrder(orderId);
    res.status(200).json({
      success: true,
      message: "Order deleted successfully",
      data: updatedSession,
    });
  } catch (error) {
    next(error);
  }
};

export const recordOrderWeight = async (req, res, next) => {
  try {
    const { recordOrderWeight: recordWeight } =
      await import("../company/commercialService.js");
    const result = await recordWeight(
      req.user._id,
      req.params.id,
      req.body.actualWeight ?? req.body.weight,
      req.body.scaleSlipImage ?? req.body.slipImage ?? req.body.image,
    );
    res.status(200).json({
      success: true,
      message: "Weight recorded successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const addOrderSurchargeController = async (req, res, next) => {
  try {
    const { addOrderSurcharge } =
      await import("../company/commercialService.js");
    const result = await addOrderSurcharge(
      req.user._id,
      req.params.id,
      {
        type: req.body.type,
        title: req.body.title,
        description: req.body.description,
        amount: req.body.amount,
        images: req.body.images,
      },
    );
    res.status(200).json({
      success: true,
      message: "Surcharge added and billed successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const updateSwapStatusRenter = async (req, res, next) => {
  try {
    const { updateSwapStatus } =
      await import("../company/commercialService.js");
    const order = await updateSwapStatus(
      req.user._id,
      req.params.id,
      req.body.status,
      { role: "operator" },
    );
    res.status(200).json({
      success: true,
      message: "Swap status updated",
      data: order,
    });
  } catch (error) {
    next(error);
  }
};

export const getAdminManualReviewRequest = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    let query = {
      userId: req.user._id,
      userAcceptedStatus: "pending",
      status: { $ne: "deleted" },
    };

    if (req.query.status) {
      query.status = req.query.status;
    }

    if (req.query.service_type) {
      query.service_type = req.query.service_type;
    }

    const adminManualReviewRequests =
      await orderService.getAdminManualReviewRequest(query, { page, limit });
    res.status(200).json({
      success: true,
      message: "Admin manual review requests fetched successfully",
      data: adminManualReviewRequests,
    });
  } catch (error) {
    next(error);
  }
};

export const updateAdminManualReviewRequest = async (req, res, next) => {
  try {
    const updatedSession = await orderService.udpateAdminManualReviewRequest(
      req.params.id,
      req.body,
    );
    res.status(200).json({
      success: true,
      message: "Admin manual review request updated successfully",
      data: updatedSession,
    });
  } catch (error) {
    next(error);
  }
};

export const getRenterCalendarOrders = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { startDate, endDate, service_type, status, driverId } = req.query;

    const calendarData = await orderService.getRenterCalendarOrders({
      userId,
      startDate,
      endDate,
      service_type,
      status,
      driverId,
    });

    res.status(200).json({
      success: true,
      message: "Calendar orders fetched successfully",
      data: calendarData,
    });
  } catch (error) {
    next(error);
  }
};

export const getRenterReportsAnalytics = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { timeRange, startDate, endDate } = req.query;

    const analyticsData = await orderService.getRenterReportsAnalytics({
      userId,
      timeRange,
      startDate,
      endDate,
    });

    res.status(200).json({
      success: true,
      message: "Reports analytics fetched successfully",
      data: analyticsData,
    });
  } catch (error) {
    next(error);
  }
};

export const getRenterCustomersDirectory = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { search, tab, limit, page } = req.query;

    const data = await orderService.getRenterCustomersDirectory({
      userId,
      search,
      tab,
      limit,
      page,
    });

    res.status(200).json({
      success: true,
      message: "Customer directory fetched successfully",
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const getRenterCustomerDetail = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { customerId } = req.params;

    const data = await orderService.getRenterCustomerDetail({
      userId,
      customerId,
    });

    res.status(200).json({
      success: true,
      message: "Customer details fetched successfully",
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const sendRenterCrmFollowupController = async (req, res, next) => {
  try {
    const providerId = req.user._id;
    const { customerId, message, channel } = req.body;

    const data = await orderService.sendRenterCrmFollowup({
      providerId,
      customerId,
      message,
      channel,
    });

    res.status(200).json({
      success: true,
      message: "Follow-up pitch sent successfully via all active channels",
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const markReadyToPickup = async (req, res, next) => {
  try {
    const { orderId, requestType, requestedByName, requestedByRole, notes } = req.body;
    const result = await orderService.markOrderReadyToPickup({
      orderId: orderId || req.params.id,
      userId: req.user._id,
      user: req.user,
      requestType,
      requestedByName,
      requestedByRole,
      notes,
    });
    res.status(200).json({
      success: true,
      message: "Order marked ready for pickup successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const emailOrderInvoiceController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { recipientEmail, invoiceUrl, docType = "invoice", subject, message } = req.body;

    const order = await Order.findById(id).populate("user company to_id");
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const toEmail = recipientEmail || order.company?.email || order.user?.email;
    if (!toEmail) {
      return res.status(400).json({ success: false, message: "Customer email not found on order." });
    }

    const orderRef = order.orderNumber || `#ORD-${String(order._id).slice(-6).toUpperCase()}`;
    const emailSubject =
      subject || `Official ${docType === "receipt" ? "Receipt" : "Invoice"} for Order ${orderRef} - Bins & Dumpsters`;

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden;">
        <div style="background: #11ba41; padding: 24px 30px; text-align: center; color: #ffffff;">
          <h1 style="margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">Bins & Dumpsters Commercial Network</h1>
          <p style="margin: 6px 0 0 0; font-size: 13px; opacity: 0.95;">Official ${docType === "receipt" ? "Payment Receipt" : "Commercial Tax Invoice"}</p>
        </div>
        <div style="padding: 30px 32px; color: #0f172a;">
          <p style="font-size: 15px; font-weight: 600; margin: 0 0 16px 0;">Hello ${order.company?.companyName || order.user?.name || "Valued Customer"},</p>
          <p style="font-size: 13px; color: #475569; line-height: 1.6; margin: 0 0 20px 0;">
            Please find your official ${docType === "receipt" ? "payment receipt" : "tax invoice"} for order <strong>${orderRef}</strong>.
            ${message ? `<br><br><em>Note: ${message}</em>` : ""}
          </p>

          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px 20px; margin-bottom: 24px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <tr>
                <td style="color: #64748b; padding: 4px 0;">Order Reference:</td>
                <td style="text-align: right; font-weight: 700; color: #0f172a;">${orderRef}</td>
              </tr>
              <tr>
                <td style="color: #64748b; padding: 4px 0;">Service Type:</td>
                <td style="text-align: right; font-weight: 600; color: #0f172a;">${order.service_type || "Dumpster Rental"}</td>
              </tr>
              <tr>
                <td style="color: #64748b; padding: 4px 0;">Delivery Address:</td>
                <td style="text-align: right; font-weight: 600; color: #0f172a;">${order.address || "—"}</td>
              </tr>
              <tr style="border-top: 1px solid #cbd5e1;">
                <td style="padding: 10px 0 4px 0; font-weight: 800; font-size: 15px; color: #0f172a;">Total Amount:</td>
                <td style="padding: 10px 0 4px 0; text-align: right; font-weight: 800; font-size: 16px; color: #11ba41;">$${(Number(order.price) || 0).toFixed(2)}</td>
              </tr>
            </table>
          </div>

          ${
            invoiceUrl
              ? `
          <div style="text-align: center; margin: 28px 0 20px 0;">
            <a href="${invoiceUrl}" target="_blank" style="background: #11ba41; color: #ffffff; padding: 12px 28px; border-radius: 10px; font-weight: 700; font-size: 13px; text-decoration: none; display: inline-block; box-shadow: 0 2px 8px rgba(17,186,65,0.25);">
              View & Download Full Invoice →
            </a>
          </div>
          <p style="font-size: 11px; color: #94a3b8; text-align: center; margin: 0 0 16px 0;">
            Link: <a href="${invoiceUrl}" style="color: #11ba41; word-break: break-all;">${invoiceUrl}</a>
          </p>
          `
              : ""
          }

          <p style="font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 16px; margin-top: 24px; text-align: center;">
            Thank you for choosing Bins & Dumpsters for your waste management and equipment rental needs.
          </p>
        </div>
      </div>
    `;

    const emailRes = await sendEmail({
      to: toEmail,
      subject: emailSubject,
      text: `Your ${docType} for Order ${orderRef}: Total $${(Number(order.price) || 0).toFixed(2)}. View invoice: ${invoiceUrl || "in portal"}`,
      html: htmlContent,
    });

    if (emailRes?.success === false) {
      return res.status(500).json({
        success: false,
        message: `Failed to send email: ${emailRes.error || "Server error"}`,
      });
    }

    return res.status(200).json({
      success: true,
      message: `Invoice successfully emailed to ${toEmail}!`,
      data: { recipientEmail: toEmail, invoiceUrl },
    });
  } catch (error) {
    next(error);
  }
};

export const sendTransactionInvoiceController = async (req, res, next) => {
  try {
    const {
      transactionId,
      orderId,
      invoiceImageUrl,
      invoiceNumber,
      recipientEmail,
      recipientPhone,
      customerName = 'Valued Customer',
      amount = '$0.00',
      type = 'debit',
      reason = 'Payment Settlement',
    } = req.body;

    const providerId = req.user?._id;
    const provider = await User.findById(providerId);
    const providerName = provider?.comp_name || provider?.name || "BINS Hauler";

    // Find order if orderId provided
    let order = null;
    let customer = null;
    if (orderId && mongoose.Types.ObjectId.isValid(orderId)) {
      order = await Order.findById(orderId).populate("user company to_id");
      if (order?.user) customer = order.user;
    }

    const targetEmail = recipientEmail || customer?.email || order?.company?.email;
    const targetPhone = recipientPhone || customer?.phone || order?.company?.phone;
    const targetUserId = customer?._id?.toString() || (order?.user?._id ? order.user._id.toString() : null);

    const orderRef = order?.orderNumber || (invoiceNumber ? invoiceNumber : `#TXN-${String(transactionId || '').slice(-6).toUpperCase()}`);
    const results = {
      email: false,
      sms: false,
      inApp: false,
      chat: false,
    };

    // 1. EMAIL with embedded invoice image
    if (targetEmail) {
      try {
        const emailSubject = `Official Payment Receipt & Invoice (${orderRef}) - Bins & Dumpsters`;
        const emailHtml = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden;">
            <div style="background: #0f172a; padding: 24px 30px; text-align: center; color: #ffffff;">
              <h1 style="margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.5px; color: #11ba41;">Bins & Dumpsters Commercial Network</h1>
              <p style="margin: 6px 0 0 0; font-size: 13px; color: #94a3b8;">Official Payment Receipt & Statement</p>
            </div>
            <div style="padding: 24px 28px; color: #0f172a;">
              <p style="font-size: 15px; font-weight: 700; margin: 0 0 10px 0;">Hello ${customerName},</p>
              <p style="font-size: 13px; color: #475569; line-height: 1.5; margin: 0 0 20px 0;">
                Please find your official payment invoice & receipt for transaction <strong>${orderRef}</strong>.
              </p>

              ${invoiceImageUrl ? `
                <div style="margin: 20px 0; text-align: center;">
                  <img src="${invoiceImageUrl}" alt="Invoice Receipt" style="width: 100%; max-width: 600px; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0,0,0,0.06);" />
                </div>
                <div style="text-align: center; margin: 18px 0 24px 0;">
                  <a href="${invoiceImageUrl}" target="_blank" style="background: #11ba41; color: #ffffff; padding: 12px 28px; border-radius: 10px; font-weight: 700; font-size: 13px; text-decoration: none; display: inline-block;">
                    View & Download High-Resolution Receipt →
                  </a>
                </div>
              ` : ''}

              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px 20px; font-size: 13px; margin-bottom: 20px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                  <span style="color: #64748b;">Invoice Reference:</span>
                  <span style="font-weight: 700;">${orderRef}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                  <span style="color: #64748b;">Charge Description:</span>
                  <span style="font-weight: 600;">${reason}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                  <span style="color: #64748b;">Transaction Type:</span>
                  <span style="font-weight: 600; text-transform: uppercase;">${type}</span>
                </div>
                <div style="display: flex; justify-content: space-between; border-top: 1px solid #e2e8f0; padding-top: 8px; font-size: 15px; font-weight: 800;">
                  <span>Amount:</span>
                  <span style="color: #11ba41;">${amount}</span>
                </div>
              </div>

              <p style="font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 14px; text-align: center;">
                Generated by ${providerName} via Bins & Dumpsters Platform.
              </p>
            </div>
          </div>
        `;

        await sendEmail({
          to: targetEmail,
          subject: emailSubject,
          text: `Official Receipt for Order ${orderRef}: ${amount} (${reason}). View: ${invoiceImageUrl || 'in portal'}`,
          html: emailHtml,
        });
        results.email = true;
      } catch (err) {
        logger.error("sendTransactionInvoiceController: Email error", err);
      }
    }

    // 2. IN-APP & PUSH NOTIFICATION
    if (targetUserId) {
      try {
        const { sendNotification } = await import("../../utils/notifications.js");
        const fcmToken = customer?.fcmtoken || "";
        await sendNotification({
          user: providerId.toString(),
          to_id: targetUserId,
          type: "invoice",
          title: `Official Invoice & Receipt #${orderRef}`,
          description: `Your payment receipt for ${amount} (${reason}) has been issued.`,
          fcmtoken: fcmToken,
          isImportant: true,
          order: orderId || undefined,
          metadata: {
            action: "view_invoice",
            imageUrl: invoiceImageUrl,
            orderRef,
            amount,
          },
        });
        results.inApp = true;
      } catch (err) {
        logger.error("sendTransactionInvoiceController: Notification error", err);
      }
    }

    // 3. SMS (Twilio)
    if (targetPhone) {
      try {
        const { sendSMS } = await import("../../utils/sendSMS.js");
        const smsBody = `Bins & Dumpsters: Official Invoice #${orderRef} for ${amount} (${reason}) has been issued. View receipt: ${invoiceImageUrl || 'in your account'}`;
        await sendSMS({
          to: targetPhone,
          body: smsBody,
        });
        results.sms = true;
      } catch (err) {
        logger.error("sendTransactionInvoiceController: SMS error", err);
      }
    }

    // 4. WEBSITE CHAT MESSAGE
    if (targetUserId) {
      try {
        const Conversation = (await import("../../models/Conversation.js")).default;
        const Message = (await import("../../models/Message.js")).default;
        const { io } = await import("../../socket/socket.js");

        const providerObjectId = new mongoose.Types.ObjectId(providerId);
        const customerObjectId = new mongoose.Types.ObjectId(targetUserId);

        let conversation = await Conversation.findOne({
          participants: { $all: [providerObjectId, customerObjectId] },
        });

        if (!conversation) {
          conversation = new Conversation({
            participants: [providerObjectId, customerObjectId],
            status: "active",
            lastActivity: new Date(),
          });
          await conversation.save();
        }

        const chatText = `📄 Official Invoice & Payment Receipt #${orderRef}\nAmount: ${amount}\nReason: ${reason}${invoiceImageUrl ? `\nReceipt Image: ${invoiceImageUrl}` : ''}`;
        const messageDoc = new Message({
          senderId: providerObjectId,
          receiverId: customerObjectId,
          conversationId: conversation._id,
          type: "text",
          content: chatText,
          timestamp: new Date(),
          status: "sent",
          deliveryStatus: {
            sent: true,
            delivered: false,
            read: false,
            sentAt: new Date(),
          },
        });
        await messageDoc.save();

        conversation.messages.push(messageDoc._id);
        conversation.lastMessage = messageDoc._id;
        conversation.lastActivity = new Date();
        await conversation.save();

        if (io) {
          io.to(`user_${customerObjectId.toString()}`).emit("new:message", {
            conversationId: conversation._id,
            message: messageDoc,
          });
        }
        results.chat = true;
      } catch (err) {
        logger.error("sendTransactionInvoiceController: Chat error", err);
      }
    }

    return res.status(200).json({
      success: true,
      message: "Invoice successfully sent via Email, In-App Alert, SMS & Website Chat!",
      data: results,
    });
  } catch (error) {
    next(error);
  }
};

export const sendDispatchAlertController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      alertType = "driver_on_way",
      customMessage = "",
      title = "",
      sendSms = true,
      sendPush = true,
      actionLink = "",
    } = req.body;

    const order = await Order.findById(id).populate("user company to_id");
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const { sendDispatchAlertToCustomer } = await import(
      "../../utils/dispatchAlertService.js"
    );
    const result = await sendDispatchAlertToCustomer({
      order,
      alertType,
      customMessage,
      title,
      sendSms,
      sendPush,
      actionLink,
      senderId: req.user?._id?.toString(),
    });

    res.status(200).json({
      success: true,
      message: "Dispatch notification successfully dispatched to customer!",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getAdminOrderById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const mongoose = (await import("mongoose")).default;
    const isValidObjectId = mongoose.Types.ObjectId.isValid(id);

    const query = isValidObjectId
      ? { $or: [{ _id: id }, { order_id: id }] }
      : { order_id: id };

    const order = await Order.findOne(query)
      .populate([
        "user",
        "dumbster",
        "dustbin",
        "portaPotty",
        "treeRemoval",
        "junkRemoval",
        "company",
        "jobSite",
        "to_id",
        {
          path: "userIds",
          select:
            "name comp_name email phone profilePicture rating total_reviews location address",
        },
        {
          path: "rejected_by",
          select:
            "name comp_name email phone profilePicture rating total_reviews",
        },
        {
          path: "accepted_by",
          select:
            "name comp_name email phone profilePicture rating total_reviews",
        },
        {
          path: "assignOrder",
          populate: {
            path: "subUserDetail",
          },
        },
        {
          path: "builderOffer",
        },
      ])
      .lean();

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Order fetched successfully",
      data: order,
      order,
    });
  } catch (error) {
    next(error);
  }
};
