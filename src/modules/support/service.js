import {
  NotFoundError,
  UnauthorizedError,
  BadRequestError,
  ForbiddenError,
} from "../../utils/apiError.js";
import User from "../../models/User.js";
import { sendNotification } from "../../utils/notifications.js";
import Support from "../../models/Support.js";
import { generateOTP } from "../../utils/Generator.js";
import logger from "../../config/logger.js";
import { io } from "../../socket/socket.js";
class SupportService {
  async createSupport(userId, data) {
    try {
      const { email, msg, name, phone } = data;

      const support = new Support({
        user: userId || null,
        email: email ? String(email).trim().toLowerCase() : "",
        phone: phone ? String(phone).trim() : "",
        msg: String(msg || "").trim(),
        name: String(name || "").trim(),
        supportId: "SP-" + generateOTP(10),
      });

      await support.save();

      const adminUser = await User.findOne({ role: "admin" }).lean();
      if (adminUser?._id) {
        io.to(adminUser._id.toString()).emit("admin-noti", {
          success: true,
          title: "New Support Ticket",
          message: `A User have created a new Support ticket!`,
          type: "support",
        });
        sendNotification({
          user: userId || "",
          to_id: adminUser._id.toString(),
          description: `A User have created a new Support ticket!`,
          type: "support",
          title: "New Support Ticket",
          fcmtoken: adminUser?.fcmtoken || "",
          email: "",
          isImportant: true,
        }).catch((err) => logger.warn("Failed to send admin push notification:", err?.message));
      }
      return support;
    } catch (error) {
      logger.error(error);
      throw error;
    }
  }

  async getSupport(query, page, limit) {
    try {
      const [support, totalCount, openCount, attendedCount] = await Promise.all([
        Support.find(query)
          .sort({ _id: -1 })
          .populate("user")
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        Support.countDocuments(query),
        Support.countDocuments({ attended: false }),
        Support.countDocuments({ attended: true }),
      ]);
      const totalPages = Math.ceil(totalCount / limit);
      return {
        support,
        totalPages,
        totalCount,
        counts: {
          all: openCount + attendedCount,
          open: openCount,
          attended: attendedCount,
        },
      };
    } catch (error) {
      logger.error(error);
      throw error;
    }
  }

  async getSupportById(id) {
    try {
      const support = await Support.findById(id).populate("user").lean();
      if (!support) {
        throw new NotFoundError("Support ticket not found");
      }
      return support;
    } catch (error) {
      logger.error(error);
      throw error;
    }
  }

  async attendTheSupport(serviceId) {
    try {
      const service = await Support.findOneAndUpdate(
        { _id: serviceId },
        {
          attended: true,
          updated_at: Date.now(),
        },
        { new: true },
      ).populate("user");
      if (!service) {
        throw new NotFoundError("Service not found");
      }
      return service;
    } catch (error) {
      logger.error(error);
      throw error;
    }
  }

  async deleteSupport(serviceId) {
    try {
      const service = await Support.findOneAndDelete({ _id: serviceId });
      if (!service) {
        throw new NotFoundError("Service not found");
      }
      return service;
    } catch (error) {
      logger.error(error);
      throw error;
    }
  }
}

export default new SupportService();
