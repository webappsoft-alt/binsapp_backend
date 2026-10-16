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
      const jobSites = await this.JobSite.find(query)
        .populate(["user", "company", "dumbsterId", "portaPottyId"])
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit);
      const total = await this.JobSite.countDocuments(query);
      const formattedSites = jobSites.map((doc) => {
        const obj = doc.toObject ? doc.toObject() : { ...doc };
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
}

const companyService = new CompanyService();
export default companyService;
