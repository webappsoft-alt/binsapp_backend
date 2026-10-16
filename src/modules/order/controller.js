import OrderService from "./service.js";
import User from "../../models/User.js";
import Tier from "../../models/Tier.js";
import JobSites from "../../models/JobSites.js";
import { PRICING_ROLES } from "../../utils/orderPricing.js";
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
    if (status === "all") {
      query.status = { $in: ["accepted", "completed"] };
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
    if (status == "all") {
      query.status = { $in: ["accepted", "completed"] };
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
    const { page, limit, status, customerId, ownerId, search } = req.query;
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
    if (search) {
      const matchingUsers = await User.find({
        $or: [
          { name: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
          { phone: { $regex: search, $options: "i" } },
          { comp_name: { $regex: search, $options: "i" } },
        ],
      })
        .select("_id")
        .lean();

      const matchingUserIds = matchingUsers.map((u) => u._id);

      const searchConditions = [
        { user: { $in: matchingUserIds } },
        { to_id: { $in: matchingUserIds } },
        { orderNumber: { $regex: search, $options: "i" } },
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
      parseInt(page),
      parseInt(limit),
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



