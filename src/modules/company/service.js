import logger from "../../config/logger.js";
import Company from "../../models/Company.js";
import User from "../../models/User.js";
import JobSite from "../../models/JobSites.js";
import Order from "../../models/Order.js";
import Rating from "../../models/Rating.js";
import {
  BadRequestError,
  NotFoundError,
  ConflictError,
} from "../../utils/apiError.js";
import { sendNotification } from "../../utils/notifications.js";
import adminService from "../admin/service.js";

function normalizeJobSiteImages(data) {
  if (!data || typeof data !== "object") return data;
  const list = [];
  const push = (val) => {
    if (!val) return;
    if (typeof val === "string") {
      const trimmed = val.trim();
      if (!trimmed) return;
      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            parsed.forEach(push);
            return;
          }
        } catch (_) {}
      }
      if (trimmed.includes(",")) {
        trimmed.split(",").forEach((item) => push(item.trim()));
        return;
      }
      list.push(trimmed);
      return;
    }
    if (Array.isArray(val)) {
      val.forEach(push);
      return;
    }
    if (typeof val === "object") {
      push(val.url || val.image || val.src || val.placementPhotoUrl);
    }
  };

  push(data.placementPhotos);
  push(data.placement_photos);
  push(data.images);
  push(data.placement_photo);
  push(data.placementPhotoUrl);
  push(data.placementPhoto);
  push(data.dropoff_image);
  push(data.image);

  const uniquePhotos = [...new Set(list)];
  const primary = uniquePhotos[0] || "";

  return {
    ...data,
    placementPhotos: uniquePhotos,
    images: uniquePhotos,
    placementPhotoUrl: data.placementPhotoUrl || primary,
    dropoff_image: data.dropoff_image || primary,
    image: data.image || primary,
  };
}

class CompanyService {
  constructor() {
    this.logger = logger;
    this.Company = Company;
    this.BadRequestError = BadRequestError;
    this.NotFoundError = NotFoundError;
    this.ConflictError = ConflictError;
    this.User = User;
    this.JobSite = JobSite;
    this.Order = Order;
    this.Rating = Rating;
  }
  normalizeCompanyPayload(companyData = {}) {
    const payload = { ...companyData };
    // Validation/Swagger historically use `name`; the model field is `companyName`.
    if (payload.name != null && payload.companyName == null) {
      payload.companyName = payload.name;
    }
    delete payload.name;
    return payload;
  }

  async createCompany(userId, companyData) {
    try {
      const normalized = this.normalizeCompanyPayload(companyData);
      const existingCompany = await this.Company.findOne({ user: userId });
      if (existingCompany) {
        const updatedCompany = await this.Company.findByIdAndUpdate(
          existingCompany._id,
          {
            ...normalized,
            status: "pending",
          },
          {
            new: true,
            runValidators: true,
          },
        );
        const adminUser = await this.User.findOne({
          $or: [{ type: "admin" }, { role: "admin" }],
        }).select("fcmtoken _id");
        if (adminUser) {
          await sendNotification({
            user: userId.toString(),
            to_id: adminUser._id.toString(),
            description: `${normalized?.companyName || "A company"} updated its company information please check and verify`,
            title: `${existingCompany?.companyName || "Company"} updated its company information`,
            fcmtoken: adminUser.fcmtoken,
            type: "admin-noti",
            email: "",
          });
        }
        return updatedCompany;
      } else {
        const company = await this.Company.create({
          ...normalized,
          user: userId,
        });
        await this.User.findByIdAndUpdate(userId, {
          company: company._id,
          compnay_status: "pending",
        });
        const adminUser = await this.User.findOne({
          $or: [{ type: "admin" }, { role: "admin" }],
        }).select("fcmtoken _id");
        if (adminUser) {
          await sendNotification({
            user: userId.toString(),
            to_id: adminUser._id.toString(),
            description: `New company ${normalized?.companyName || company.companyName} has been created please verify and approve it`,
            title: `New Company ${normalized?.companyName || company.companyName} Created`,
            fcmtoken: adminUser.fcmtoken,
            type: "admin-noti",
            email: "",
          });
        }
        return company;
      }
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async getCompanyByIdAdmin(id) {
    try {
      const company = await this.Company.findById(id).populate("user").lean();
      if (!company) {
        throw new this.NotFoundError("Company not found");
      }
      if (company.user?._id) {
        const userSummary = await this.constructor.calculateUserOrderSummary(
          company.user._id,
        );
        company.user = { ...company.user, ...userSummary };
      }
      return company;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async updateCompany(companyId, companyData) {
    try {
      const company = await this.Company.findByIdAndUpdate(
        companyId,
        this.normalizeCompanyPayload(companyData),
        {
          new: true,
          runValidators: true,
        },
      );
      if (!company) {
        throw new this.NotFoundError("Company not found");
      }
      return company;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }
  async getUserCompany(userId) {
    try {
      const company = await this.Company.findOne({ user: userId });
      if (!company) {
        throw new this.NotFoundError("Company not found");
      }
      return company;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }
  async getAllCompanies(
    query = {},
    { page = 1, limit = 10, sortBy = "updatedAt", sortOrder = "desc" } = {},
  ) {
    try {
      page = Math.max(parseInt(page, 10) || 1, 1);
      limit = Math.max(parseInt(limit, 10) || 10, 1);

      const allowedSortFields = new Set(["createdAt", "updatedAt", "_id"]);
      const sortField = allowedSortFields.has(sortBy) ? sortBy : "updatedAt";
      const sortDirection = String(sortOrder).toLowerCase() === "asc" ? 1 : -1;
      const sort = { [sortField]: sortDirection, _id: -1 };

      const companies = await this.Company.find(query)
        .populate("user")
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();
      const total = await this.Company.countDocuments(query);
      const updatedCompanies = await Promise.all(
        companies.map(async (company) => {
          if (!company.user || !company.user._id) return company;

          // Static method call (Isay private # banaya tha toh waise call karein)
          const userSummary = await this.constructor.calculateUserOrderSummary(
            company.user._id,
          );

          return {
            ...company,
            user: {
              ...company.user,
              ...userSummary,
            },
          };
        }),
      );
      // Global status counts for admin badges (ignore list filters like status/search)
      const statsArray = await this.Company.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            pending: {
              $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
            },
            approved: {
              $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] },
            },
            rejected: {
              $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] },
            },
          },
        },
      ]);

      const companyStats = statsArray[0] || {
        total: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
      };

      return {
        data: updatedCompanies,
        stats: companyStats,
        pagination: {
          page,
          limit,
          total,

        },
      };
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }
  static async calculateUserOrderSummary(userId) {
    try {
      const userOrders = await Order.find({ user: userId }).lean();
      const rating = await Rating.find({ to_id: userId }).lean();

      const totalRating = rating.length;
      const averageRating =
        totalRating > 0
          ? rating.reduce((acc, curr) => acc + curr.rating, 0) / totalRating
          : 0;

      const totalOrders = userOrders.length;
      const completedOrders = userOrders.filter(
        (o) => o.status === "completed",
      ).length;

      const totalOrderPrice = userOrders.reduce(
        (acc, curr) => acc + (curr.price || 0),
        0,
      );
      const avrageOrderPrice =
        totalOrders > 0 ? totalOrderPrice / totalOrders : 0;

      return {
        averageRating: Number(averageRating.toFixed(2)), // Clean decimal
        totalOrders,
        completedOrders,
        avrageOrderPrice: Number(avrageOrderPrice.toFixed(2)),
        totalOrderPrice,
        totalRating,
      };
    } catch (error) {
      console.error(error);
      this.logger.error(error);
      throw error;
    }
  }
  async adminUpdateCompanyStatus(companyId, data) {
    try {
      return await adminService.adminUpdateCompanyStatus(companyId, data);
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async createJobSite(userId, companyId, jobSiteData) {
    try {
      const company = await this.Company.findOne({
        user: userId,
        _id: companyId,
        status: "approved",
      });
      if (!company) {
        throw new this.NotFoundError("Invalid Company");
      }
      const normalizedData = normalizeJobSiteImages(jobSiteData);
      const jobSite = await this.JobSite.create({
        ...normalizedData,
        company: companyId,
        user: userId,
      });
      return jobSite;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }
  async updateJobSite(jobSiteId, jobSiteData) {
    try {
      const normalizedData = normalizeJobSiteImages(jobSiteData);
      const jobSite = await this.JobSite.findByIdAndUpdate(
        jobSiteId,
        normalizedData,
        {
          new: true,
          runValidators: true,
        },
      );
      if (!jobSite) {
        throw new this.NotFoundError("Job site not found");
      }
      return jobSite;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }
  async getJobSite(query = {}, { page = 1, limit = 10 }) {
    try {
      const safePage = Math.max(1, Number(page) || 1);
      const safeLimit = Math.max(1, Math.min(100, Number(limit) || 10));

      const [jobSites, total] = await Promise.all([
        this.JobSite.find(query)
          .populate("user", "name comp_name email phone")
          .populate("company", "companyName legalBusinessName status")
          .populate("dumbsterId", "name size price image tons weight")
          .populate("portaPottyId", "name price type")
          .sort({ createdAt: -1 })
          .skip((safePage - 1) * safeLimit)
          .limit(safeLimit)
          .lean(),
        this.JobSite.countDocuments(query),
      ]);

      const formattedSites = jobSites.map((obj) => {
        if (!obj.placementPhotos || !obj.placementPhotos.length) {
          const fallback = obj.placementPhotoUrl || obj.dropoff_image || obj.image;
          obj.placementPhotos = fallback ? [fallback] : [];
        }
        if (!obj.images || !obj.images.length) {
          obj.images = obj.placementPhotos;
        }
        return obj;
      });

      return {
        data: formattedSites,
        pagination: {
          page: safePage,
          limit: safeLimit,
          total,
        },
      };
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }
  async deleteJobSite(jobSiteId) {
    try {
      const jobSite = await this.JobSite.findByIdAndDelete(jobSiteId);
      if (!jobSite) {
        throw new this.NotFoundError("Job site not found");
      }
      return jobSite;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async getCompanyOverview(userId, companyId) {
    try {
      const mongoose = await import("mongoose");
      const userObjectId = new mongoose.default.Types.ObjectId(String(userId));
      const companyObjectId = companyId
        ? new mongoose.default.Types.ObjectId(String(companyId))
        : null;

      // 1. Fetch Company Record
      let company = null;
      if (companyObjectId) {
        company = await this.Company.findById(companyObjectId).lean();
      }
      if (!company) {
        company = await this.Company.findOne({ user: userObjectId }).lean();
      }

      const monthlyBudget = Number(company?.expectedMonthlyVolume || 0);
      const creditLimit = Number(company?.invoiceTerms?.creditLimit || 0);

      // 2. Build match condition for Orders
      const orderOr = [{ user: userObjectId }];
      if (company?._id) {
        orderOr.push({ company: company._id });
      }
      const matchCriteria = {
        $or: orderOr,
        status: { $ne: "cancelled" },
      };

      const now = new Date();
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

      // 3. Run all overview database queries in PARALLEL via Promise.all
      const siteQuery = company?._id
        ? { $or: [{ user: userObjectId }, { company: company._id }] }
        : { user: userObjectId };

      const [
        [analyticsResult],
        allJobSites,
        activeEquipment,
        upcomingDeliveries,
      ] = await Promise.all([
        this.Order.aggregate([
        { $match: matchCriteria },
        {
          $facet: {
            financials: [
              {
                $group: {
                  _id: null,
                  allTimeSpend: {
                    $sum: { $ifNull: ["$total_price", { $ifNull: ["$price", 0] }] },
                  },
                  thisMonthSpend: {
                    $sum: {
                      $cond: [
                        { $gte: ["$createdAt", currentMonthStart] },
                        { $ifNull: ["$total_price", { $ifNull: ["$price", 0] }] },
                        0,
                      ],
                    },
                  },
                  lastMonthSpend: {
                    $sum: {
                      $cond: [
                        {
                          $and: [
                            { $gte: ["$createdAt", lastMonthStart] },
                            { $lt: ["$createdAt", currentMonthStart] },
                          ],
                        },
                        { $ifNull: ["$total_price", { $ifNull: ["$price", 0] }] },
                        0,
                      ],
                    },
                  },
                  totalTons: {
                    $sum: {
                      $ifNull: [
                        "$actualWeight",
                        { $ifNull: ["$includedTons", 0] },
                      ],
                    },
                  },
                  totalOrdersCount: { $sum: 1 },
                },
              },
            ],
            statusCounts: [
              {
                $group: {
                  _id: null,
                  activeUnitsCount: {
                    $sum: {
                      $cond: [
                        {
                          $and: [
                            { $eq: ["$status", "accepted"] },
                            {
                              $in: [
                                "$service_type",
                                ["Dumbster", "Porta Potty"],
                              ],
                            },
                          ],
                        },
                        1,
                        0,
                      ],
                    },
                  },
                  pickupReadyCount: {
                    $sum: {
                      $cond: [
                        {
                          $and: [
                            { $eq: ["$status", "accepted"] },
                            { $eq: ["$readyToPickup", true] },
                          ],
                        },
                        1,
                        0,
                      ],
                    },
                  },
                  pendingSwapCount: {
                    $sum: {
                      $cond: [
                        {
                          $in: [
                            "$swapRequest.status",
                            ["requested", "accepted", "dispatched"],
                          ],
                        },
                        1,
                        0,
                      ],
                    },
                  },
                  upcomingDeliveriesCount: {
                    $sum: {
                      $cond: [
                        {
                          $or: [
                            { $eq: ["$status", "pending"] },
                            {
                              $and: [
                                { $eq: ["$status", "accepted"] },
                                { $gt: ["$start_date", now] },
                              ],
                            },
                          ],
                        },
                        1,
                        0,
                      ],
                    },
                  },
                },
              },
            ],
            projectAllocations: [
              {
                $group: {
                  _id: "$jobSite",
                  totalSpend: {
                    $sum: { $ifNull: ["$total_price", { $ifNull: ["$price", 0] }] },
                  },
                  orderCount: { $sum: 1 },
                  activeCount: {
                    $sum: {
                      $cond: [{ $eq: ["$status", "accepted"] }, 1, 0],
                    },
                  },
                },
              },
            ],
          },
        },
      ]),
      this.JobSite.find(siteQuery)
        .select("projectName siteName address poNumber costCode")
        .lean(),
      this.Order.find({
        ...matchCriteria,
        status: "accepted",
        service_type: { $in: ["Dumbster", "Porta Potty"] },
      })
        .select(
          "orderNumber status service_type start_date end_date price total_price dumbster portaPotty jobSite swapRequest readyToPickup num_days to_id"
        )
        .populate("dumbster", "name size price tons weight image")
        .populate("portaPotty", "name price type")
        .populate("jobSite", "siteName address poNumber")
        .populate("to_id", "comp_name name")
        .sort({ createdAt: -1 })
        .limit(6)
        .lean(),
      this.Order.find({
        ...matchCriteria,
        $or: [
          { status: "pending" },
          { status: "accepted", start_date: { $gte: now } },
        ],
      })
        .select(
          "orderNumber status service_type start_date end_date price total_price dumbster jobSite to_id"
        )
        .populate("dumbster", "name size price tons weight image")
        .populate("jobSite", "siteName address poNumber")
        .populate("to_id", "comp_name name")
        .sort({ start_date: 1 })
        .limit(5)
        .lean(),
    ]);

    const fin = analyticsResult?.financials?.[0] || {};
    const counts = analyticsResult?.statusCounts?.[0] || {};
    const rawProjectAllocations = analyticsResult?.projectAllocations || [];

    const thisMonthSpend = fin.thisMonthSpend || 0;
    const budgetPct =
      monthlyBudget > 0
        ? Math.min(100, Math.round((thisMonthSpend / monthlyBudget) * 100))
        : 0;

      const siteMap = new Map();
      allJobSites.forEach((s) => {
        siteMap.set(String(s._id), s);
      });

      const projectBreakdown = [];
      const accountedSiteIds = new Set();

      rawProjectAllocations.forEach((item) => {
        const sId = item._id ? String(item._id) : null;
        if (sId && siteMap.has(sId)) {
          accountedSiteIds.add(sId);
          const site = siteMap.get(sId);
          projectBreakdown.push({
            jobSiteId: sId,
            name: site.projectName || site.siteName || "General Project",
            siteName: site.siteName,
            address: site.address,
            poNumber: site.poNumber || "—",
            costCode: site.costCode || "—",
            totalSpend: item.totalSpend || 0,
            activeCount: item.activeCount || 0,
            orderCount: item.orderCount || 0,
          });
        } else if (item.totalSpend > 0) {
          projectBreakdown.push({
            jobSiteId: null,
            name: "Unassigned Orders",
            siteName: "Direct Site Orders",
            address: "—",
            poNumber: "—",
            costCode: "—",
            totalSpend: item.totalSpend || 0,
            activeCount: item.activeCount || 0,
            orderCount: item.orderCount || 0,
          });
        }
      });

      // Add remaining registered jobsites that have 0 spend so far
      allJobSites.forEach((site) => {
        const sId = String(site._id);
        if (!accountedSiteIds.has(sId)) {
          projectBreakdown.push({
            jobSiteId: sId,
            name: site.projectName || site.siteName || "New Project",
            siteName: site.siteName,
            address: site.address,
            poNumber: site.poNumber || "—",
            costCode: site.costCode || "—",
            totalSpend: 0,
            activeCount: 0,
            orderCount: 0,
          });
        }
      });

      // Sort project breakdown by total spend descending
      projectBreakdown.sort((a, b) => b.totalSpend - a.totalSpend);



      return {
        company: {
          id: company?._id || null,
          name:
            company?.companyName ||
            company?.legalBusinessName ||
            "Commercial Operations",
          status: company?.status || "approved",
          isApproved: (company?.status || "approved") === "approved",
          monthlyBudget,
          creditLimit,
        },
        financials: {
          thisMonthSpend,
          lastMonthSpend: fin.lastMonthSpend || 0,
          allTimeSpend: fin.allTimeSpend || 0,
          monthlyBudget,
          budgetPct,
          totalTonsEstimated: fin.totalTons || 0,
        },
        counts: {
          activeUnits: counts.activeUnitsCount || 0,
          pickupReady: counts.pickupReadyCount || 0,
          pendingSwaps: counts.pendingSwapCount || 0,
          upcomingDeliveries: counts.upcomingDeliveriesCount || 0,
          totalOrders: fin.totalOrdersCount || 0,
          totalJobSites: allJobSites.length,
        },
        projectBreakdown,
        activeEquipment,
        upcomingDeliveries,
      };
    } catch (error) {
      this.logger.error("Error in getCompanyOverview:", error);
      throw error;
    }
  }

  async getCompanyRotations(userId, companyId, query = {}) {
    try {
      const mongoose = await import("mongoose");
      const userObjectId = new mongoose.default.Types.ObjectId(String(userId));
      const companyObjectId = companyId
        ? new mongoose.default.Types.ObjectId(String(companyId))
        : null;

      const orderOr = [{ user: userObjectId }];
      if (companyObjectId) {
        orderOr.push({ company: companyObjectId });
      }

      const match = {
        $or: orderOr,
        service_type: { $in: ["Dumbster", "Porta Potty"] },
      };

      if (query.jobsiteId && mongoose.default.isValidObjectId(query.jobsiteId)) {
        match.jobSite = new mongoose.default.Types.ObjectId(String(query.jobsiteId));
      }
      if (query.serviceType && query.serviceType !== "all") {
        match.service_type = query.serviceType === "porta" ? "Porta Potty" : "Dumbster";
      }

      // Fetch all relevant orders with populated references
      const orders = await this.Order.find(match)
        .populate("dumbster")
        .populate("portaPotty")
        .populate("jobSite")
        .populate("to_id", "name comp_name phone email image")
        .populate("swapRequest.linkedDropoffOrder")
        .populate("swapRequest.linkedPickupOrder")
        .sort({ updatedAt: -1, createdAt: -1 })
        .limit(150)
        .lean();

      // Fetch all jobsites for filtering dropdown
      const siteQuery = companyObjectId
        ? { $or: [{ user: userObjectId }, { company: companyObjectId }] }
        : { user: userObjectId };
      const jobSites = await this.JobSite.find(siteQuery).lean();

      const now = new Date();
      const twoDaysFromNow = new Date(now.getTime() + 48 * 60 * 60 * 1000);

      const columns = {
        requested: [],    // Pending dispatch / not yet on the way
        dispatched: [],   // Driver on the way / en route
        active: [],       // Deployed on site, running rental
        swapping: [],     // Swap in progress
        pickup_ready: [], // Ready for final haul away
        completed: [],    // Completed recently
      };

      let expiringSoonCount = 0;
      const activeJobsiteIds = new Set();

      orders.forEach((order) => {
        const status = (order.status || "").toLowerCase();
        const swapStatus = order.swapRequest?.status || "none";
        const isSwapping = ["requested", "accepted", "dispatched"].includes(swapStatus);
        const isPickupReady = order.readyToPickup === true && status !== "completed";
        const isOnWay = Boolean(order.onway || order.deliveryWorkflow?.enRouteAt);

        if (order.jobSite?._id) {
          activeJobsiteIds.add(String(order.jobSite._id));
        }

        // Check if rental expiring soon
        if (order.rental_end_date && status === "accepted") {
          const endDate = new Date(order.rental_end_date);
          if (endDate <= twoDaysFromNow && endDate >= now) {
            expiringSoonCount += 1;
            order.isExpiringSoon = true;
          }
        }

        if (status === "cancelled") {
          return; // omit cancelled
        }

        if (status === "completed") {
          if (columns.completed.length < 15) {
            columns.completed.push(order);
          }
          return;
        }

        if (isSwapping) {
          columns.swapping.push(order);
          return;
        }

        if (isPickupReady) {
          columns.pickup_ready.push(order);
          return;
        }

        if (isOnWay) {
          columns.dispatched.push(order);
          return;
        }

        if (status === "accepted") {
          columns.active.push(order);
          return;
        }

        if (status === "pending") {
          columns.requested.push(order);
          return;
        }

        // fallback to active
        columns.active.push(order);
      });

      const summary = {
        totalOrders: orders.length,
        totalActiveOnSite: columns.active.length,
        totalSwapping: columns.swapping.length,
        totalPickupReady: columns.pickup_ready.length,
        totalDispatched: columns.dispatched.length,
        totalRequested: columns.requested.length,
        expiringSoonCount,
        activeJobsitesCount: activeJobsiteIds.size,
        totalRegisteredSites: jobSites.length,
      };

      return {
        summary,
        columns,
        jobSites: jobSites.map((s) => ({
          _id: s._id,
          siteName: s.siteName,
          projectName: s.projectName,
          address: s.address,
          poNumber: s.poNumber,
          costCode: s.costCode,
        })),
      };
    } catch (error) {
      this.logger.error("Error in getCompanyRotations:", error);
      throw error;
    }
  }

  async batchCommercialRotationAction(userId, companyId, { action, orderIds = [], payload = {} }) {
    try {
      if (!Array.isArray(orderIds) || orderIds.length === 0) {
        throw new this.BadRequestError("No order IDs provided for batch action");
      }

      const results = [];
      const errors = [];

      for (const orderId of orderIds) {
        try {
          const order = await this.Order.findById(orderId);
          if (!order) {
            errors.push({ orderId, error: "Order not found" });
            continue;
          }

          if (action === "batch_pickup") {
            order.readyToPickup = true;
            await order.save();
            results.push({ orderId, status: "marked_pickup_ready" });
          } else if (action === "batch_swap") {
            const { createSwapRequest } = await import("./commercialService.js");
            const res = await createSwapRequest(userId, orderId, payload);
            results.push({ orderId, status: "swap_requested", data: res });
          } else {
            throw new this.BadRequestError(`Unknown batch action: ${action}`);
          }
        } catch (err) {
          errors.push({ orderId, error: err.message });
        }
      }

      return {
        success: true,
        action,
        processedCount: results.length,
        errorCount: errors.length,
        results,
        errors,
      };
    } catch (error) {
      this.logger.error("Error in batchCommercialRotationAction:", error);
      throw error;
    }
  }
}

const companyService = new CompanyService();
export default companyService;
