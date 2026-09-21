import { BadRequestError } from "../../utils/apiError.js";
import adminService from "./service.js";
export async function adminLogin(req, res, next) {
  try {
    const { email, password } = req.body;
    const user = await adminService.adminLogin(email, password);
    res.status(200).json({
      success: true,
      message: "Admin logged in successfully",
      data: user,
    });
  } catch (error) {
    next(error);
  }
}

export async function adminDashboard(req, res, next) {
  try {
    const dashboardData = await adminService.adminDashboard();
    res.status(200).json({
      success: true,
      message: "Admin dashboard data fetched successfully",
      data: dashboardData,
    });
  } catch (error) {
    next(error);
  }
}

export async function adminDeleteUser(req, res, next) {
  try {
    const user = await adminService.adminDeleteUser(req.params.id);
    res.status(200).json({
      success: true,
      message: "User deleted successfully",
      data: user,
    });
  } catch (error) {
    next(error);
  }
}

export async function adminUpdateUser(req, res, next) {
  try {
    const user = await adminService.adminUpdateUser(req.params.id, req.body);
    res.status(200).json({
      success: true,
      message: "User updated successfully",
      data: user,
    });
  } catch (error) {
    next(error);
  }
}

export async function adminSendEmail(req, res, next) {
  try {
    const { type, subject, html, users, isTemplate = false } = req.body;
    let query = {};
    const validTypes = ["all", "rentee", "renter", "users"];
    // console.log("method sendNotifications in adminController called", type);
    if (!validTypes.includes(type)) {
      throw new BadRequestError(
        "User Type is not valid, Valid types are: " + validTypes.join(", "),
      );
    }

    if (["rentee", "renter"].includes(type)) {
      query.$or = [{ role: type }, { type: type }];
    } else if (type == "users") {
      query._id = { $in: users };
    } else {
      query.$or = [
        { role: { $in: ["rentee", "renter"] } },
        { type: { $in: ["rentee", "renter"] } },
      ];
    }
    const result = await adminService.adminSendEmail(
      query,
      subject,
      html,
      isTemplate,
    );
    res.status(200).json({
      success: true,
      message: "Email sent successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function getAllUsers(req, res, next) {
  try {
    const {
      type,
      bins,
      search,
      page,
      limit,
      status,
      startDate,
      endDate,
      isStripeConnected,
      portaPotty,
      access_types = "all",
    } = req.query;
    let query = {};
    let conditions = [];
    // console.log(req.query);
    if (type !== "all") {
      conditions.push({ $or: [{ role: type }, { type: type }] });
    } else {
      conditions.push({
        $or: [
          { role: { $nin: ["temp", "admin"] } },
          { type: { $nin: ["temp", "admin"] } },
        ],
      });
    }

    switch (access_types) {
      case "company" || "commercial":
        conditions.push({ company: { $ne: null } });
        break;
      case "junkRemoval":
        conditions.push({ junkRemoval: { $ne: null } });
        break;
      case "treeRemoval":
        conditions.push({ treeRemoval: { $ne: null } });
        break;
      case "all":
        break;
    }

    if (bins == "pending") {
      conditions.push({ pendingCount: { $gt: 0 } });
    }
    if (bins == "verify") {
      conditions.push({ verifyCount: { $gt: 0 } });
    }
    if (bins == "reject") {
      conditions.push({ rejectCount: { $gt: 0 } });
    }

    if (portaPotty == "pending") {
      conditions.push({ PortaPottypendingCount: { $gt: 0 } });
    }
    if (portaPotty == "verify") {
      conditions.push({ PortaPottyverifyCount: { $gt: 0 } });
    }
    if (portaPotty == "reject") {
      conditions.push({ PortaPottyrejectCount: { $gt: 0 } });
    }

    if (status) {
      conditions.push({ status: status });
    } else {
      conditions.push({
        status: { $in: ["online", "offline", "deactivated"] },
      });
    }
    if (isStripeConnected == "true" && type == "renter") {
      conditions.push({ accountId: { $ne: null }, accountId_verified: true });
    } else if (isStripeConnected == "true" && type == "rentee") {
      conditions.push({ cus_id: { $ne: null } });
    } else if (isStripeConnected == "false" && type == "renter") {
      conditions.push({
        $or: [{ accountId: null }, { accountId_verified: false }],
      });
    } else if (isStripeConnected == "false" && type == "rentee") {
      conditions.push({ cus_id: null });
    }

    if (search) {
      const searchQuery = search;
      conditions.push({
        $or: [
          { name: { $regex: searchQuery, $options: "i" } },
          { email: { $regex: searchQuery, $options: "i" } },
          { phone: { $regex: searchQuery, $options: "i" } },
        ],
      });
    }

    // Combine all conditions with $and
    if (conditions.length > 0) {
      query.$and = conditions;
    }
    if (startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);

      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      query.createdAt = {
        $gte: start,
        $lte: end,
      };
    }
    // console.log(JSON.stringify(query, null, 2));
    const users = await adminService.getAllUsers(query, { page, limit });
    res.status(200).json({
      success: true,
      message: "Users fetched successfully",
      data: users,
    });
  } catch (error) {
    next(error);
  }
}

export async function adminSendNotifications(req, res, next) {
  try {
    const userId = req?.user?._id || "";

    const { type, supportId } = req.query;
    // console.log(req.query);
    const { title, description, users } = req.body;
    let query = {};
    const validTypes = ["all", "rentee", "renter", "users", "commercial"];
    // console.log("method sendNotifications in adminController called", type);
    if (!validTypes.includes(type)) {
      throw new BadRequestError(
        "User Type is not valid, Valid types are: " + validTypes.join(", "),
      );
    }

    if (["rentee", "renter"].includes(type)) {
      query.$or = [{ role: type }, { type: type }];
    } else if (type === "commercial") {
      query.$or = [
        { access_types: "company" },
        { company: { $exists: true, $ne: null } },
      ];
    } else if (type == "users") {
      query._id = { $in: users };
    } else {
      query.$or = [
        { role: { $in: ["rentee", "renter"] } },
        { type: { $in: ["rentee", "renter"] } },
      ];
    }
    const result = await adminService.sendNotifications(
      userId,
      {
        title,
        description,
        // users,
      },
      query,
      supportId,
    );
    res.status(200).json({
      success: true,
      message: "Notifications sent successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function getDashBoardUsersStats(req, res, next) {
  try {
    const { type } = req.query;
    const users = await adminService.getDashBoardUsersStats(type);
    res.status(200).json({
      success: true,
      message: "Users stats fetched successfully",
      data: users,
    });
  } catch (error) {
    next(error);
  }
}

export async function getDashBoardUsersGraphData(req, res, next) {
  try {
    const { startDate, endDate } = req.query;
    const users = await adminService.getDashBoardUsersGraphData({
      startDate,
      endDate,
    });
    res.status(200).json({
      success: true,
      message: "Users graph data fetched successfully",
      data: users,
    });
  } catch (error) {
    next(error);
  }
}

export async function getDashBoardDumpstersGraphData(req, res, next) {
  try {
    const { startDate, endDate } = req.query;
    const users = await adminService.getDashBoardDumpstersGraphData({
      startDate,
      endDate,
    });

    res.status(200).json({
      success: true,
      message: "Dumpsters graph data fetched successfully",
      data: users,
    });
  } catch (error) {
    next(error);
  }
}

export async function sendPushNotificationViaFCM(req, res, next) {
  try {
    const { fcmToken, title, description } = req.body;
    const result = await adminService.sendPushNotificationViaFCM({
      fcmToken,
      title,
      description,
    });
    res.status(200).json({
      success: true,
      message: "Push notification sent successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateJunkService(req, res, next) {
  try {
    const result = await adminService.adminUpdateJunkRemovalStatus(
      req.params.id,
      req.body,
    );
    res.status(200).json({
      success: true,
      message: "Junk service updated successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateTreeService(req, res, next) {
  try {
    const result = await adminService.adminUpdateTreeRemovalStatus(
      req.params.id,
      req.body,
    );
    res.status(200).json({
      success: true,
      message: "Tree service updated successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteJunkService(req, res, next) {
  try {
    const result = await adminService.adminDeleteJunkRemoval(req.params.id);
    res.status(200).json({
      success: true,
      message: "Junk removal request deleted successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteTreeService(req, res, next) {
  try {
    const result = await adminService.adminDeleteTreeRemoval(req.params.id);
    res.status(200).json({
      success: true,
      message: "Tree removal request deleted successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteCompanyService(req, res, next) {
  try {
    const result = await adminService.adminDeleteCompany(req.params.id);
    res.status(200).json({
      success: true,
      message: "Commercial builder request deleted successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function approveCompanyService(req, res, next) {
  try {
    const result = await adminService.adminUpdateCompanyStatus(req.params.id, {
      ...req.body,
      status: "approved",
    });
    // Seed dumpster-based rates (3/7 + derived 14/30) for newly approved builders
    try {
      const { ensureDefaultPricingPlan } =
        await import("../company/commercialService.js");
      await ensureDefaultPricingPlan(req.params.id, req.user?._id);
    } catch (seedErr) {
      console.error("Failed to seed default commercial pricing plan", seedErr);
    }
    res.status(200).json({
      success: true,
      message: "Commercial builder application approved",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function rejectCompanyService(req, res, next) {
  try {
    const result = await adminService.adminUpdateCompanyStatus(req.params.id, {
      ...req.body,
      status: "rejected",
    });
    res.status(200).json({
      success: true,
      message: "Commercial builder application rejected",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateCompanyStatus(req, res, next) {
  try {
    const result = await adminService.adminUpdateCompanyStatus(
      req.params.id,
      req.body,
    );
    if (req.body?.status === "approved") {
      try {
        const { ensureDefaultPricingPlan } =
          await import("../company/commercialService.js");
        await ensureDefaultPricingPlan(req.params.id, req.user?._id);
      } catch (seedErr) {
        console.error(
          "Failed to seed default commercial pricing plan",
          seedErr,
        );
      }
    }
    res.status(200).json({
      success: true,
      message: "Company status updated successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function upsertCompanyPricingPlan(req, res, next) {
  try {
    const { adminUpsertPricingPlan } =
      await import("../company/commercialService.js");
    const company = await adminUpsertPricingPlan(
      req.params.id,
      req.body,
      req.user._id,
    );
    res.status(200).json({
      success: true,
      message: "Pricing plan saved",
      data: company.pricingPlan,
    });
  } catch (error) {
    next(error);
  }
}

export async function getCompanyPricingPlan(req, res, next) {
  try {
    const { adminGetPricingPlan } =
      await import("../company/commercialService.js");
    const company = await adminGetPricingPlan(req.params.id);
    res.status(200).json({
      success: true,
      message: "Pricing plan fetched",
      data: company,
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteCompanyPricingPlan(req, res, next) {
  try {
    const { adminDeletePricingPlan } =
      await import("../company/commercialService.js");
    const company = await adminDeletePricingPlan(req.params.id);
    res.status(200).json({
      success: true,
      message: "Pricing plan removed",
      data: company,
    });
  } catch (error) {
    next(error);
  }
}

export async function setCompanyCommercialConfig(req, res, next) {
  try {
    const { adminSetCompanyConfig } =
      await import("../company/commercialService.js");
    const company = await adminSetCompanyConfig(
      req.params.id,
      req.body,
      req.user._id,
    );
    res.status(200).json({
      success: true,
      message: "Company commercial config updated",
      data: company,
    });
  } catch (error) {
    next(error);
  }
}

export async function adminListCompanyBilling(req, res, next) {
  try {
    const { adminListBilling } =
      await import("../company/commercialService.js");
    const result = await adminListBilling({
      companyId: req.query.companyId || req.params.id,
      status: req.query.status,
      page: req.query.page,
      limit: req.query.limit,
    });
    res.status(200).json({
      success: true,
      message: "Billing records fetched",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function adminMarkInvoicePaid(req, res, next) {
  try {
    const { adminMarkBillingPaid } =
      await import("../company/commercialService.js");
    const record = await adminMarkBillingPaid(
      req.params.billingId,
      req.user._id,
      req.body,
    );
    res.status(200).json({
      success: true,
      message: "Billing record updated",
      data: record,
    });
  } catch (error) {
    next(error);
  }
}

export async function getAllJunkRemoval(req, res, next) {
  try {
    const { page, limit, search, status } = req.query;
    let query = {};
    if (search) {
      query.$or = [{ "userId.name": { $regex: search, $options: "i" } }];
    }
    if (status) {
      query.status = status;
    }
    const junkRemoval = await adminService.getAllJunkRemoval(query, {
      page,
      limit,
    });
    res.status(200).json({
      success: true,
      message: "Junk removal fetched successfully",
      data: junkRemoval,
    });
  } catch (error) {
    next(error);
  }
}
export async function getAllTreeRemoval(req, res, next) {
  try {
    const { page, limit, search, status } = req.query;
    let query = {};
    if (search) {
      query.$or = [{ "userId.name": { $regex: search, $options: "i" } }];
    }
    if (status) {
      query.status = status;
    }
    const treeRemoval = await adminService.getAllTreeRemoval(query, {
      page,
      limit,
    });
    res.status(200).json({
      success: true,
      message: "Tree removal fetched successfully",
      data: treeRemoval,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateAdminManualReviewRequests(req, res, next) {
  try {
    const updated = await adminService.updateAdminManualReviewRequests(
      req.params.id,
      req.body,
    );
    res.status(200).json({
      success: true,
      message: "Admin manual review request updated successfully",
      data: updated,
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteAdminManualReviewRequests(req, res, next) {
  try {
    const deleted = await adminService.deleteAdminManualReviewRequests(
      req.params.id,
    );
    res.status(200).json({
      success: true,
      message: "Admin manual review request deleted successfully",
      data: deleted,
    });
  } catch (error) {
    next(error);
  }
}

export async function getAdminManualReviewRequestById(req, res, next) {
  try {
    const request = await adminService.getAdminManualReviewRequestById(
      req.params.id,
    );
    res.status(200).json({
      success: true,
      message: "Admin manual review request fetched successfully",
      data: request,
    });
  } catch (error) {
    next(error);
  }
}

export async function getAdminManualReviewRequests(req, res, next) {
  try {
    const { page, limit, status, userAcceptedStatus, service_type, userId } =
      req.query;
    let query = { status: { $ne: "deleted" } };
    if (status) {
      query.status = status;
    }
    if (userAcceptedStatus) {
      query.userAcceptedStatus = userAcceptedStatus;
    }
    if (userId) {
      query.userId = userId;
    }
    if (service_type) {
      query.service_type = service_type;
    }
    const adminManualReviewRequests =
      await adminService.getAdminManualReviewRequests(query, { page, limit });
    res.status(200).json({
      success: true,
      message: "Admin manual review requests fetched successfully",
      data: adminManualReviewRequests,
    });
  } catch (error) {
    next(error);
  }
}
export async function getUserByService(req, res, next) {
  try {
    const serviceType = req.query.service_type;
    const id = req.query.id;
    const { page, limit, search } = req.query;

    const result = await adminService.getUserbyService(
      serviceType,
      id,
      page,
      limit,
      search,
    );

    res.status(200).json({
      success: true,
      message: "Users by service fetched successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}
