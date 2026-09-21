import {
  NotFoundError,
  UnauthorizedError,
  BadRequestError,
  ForbiddenError,
} from "../../utils/apiError.js";
import User from "../../models/user.js";
import { sendNotification } from "../../utils/notifications.js";
import Support from "../../models/Support.js";
import { generateOTP } from "../../utils/Generator.js";
import logger from "../../config/logger.js";
import { io } from "../../socket/socket.js";
class SupportService {
  async createSupport(userId, data) {
    try {
      const { email, msg, name } = data;

      const support = new Support({
        user: userId,
        email,
        msg,
        name,
        supportId: "SP-" + generateOTP(10),
      });

      await support.save();

      const adminUser = await User.findOne({ role: "admin" }).lean();
      // console.log("adminUser", adminUser);
      io.to(adminUser?._id.toString()).emit("admin-noti", {
        success: true,
        title: "New Support Ticket",
        message: `A User have created a new Support ticket!`,
        type: "support",
      });
      await sendNotification({
        user: userId,
        to_id: adminUser._id.toString(),
        description: `A User have created a new Support ticket!`,
        type: "support",
        title: "New Support Ticket",
        fcmtoken: adminUser?.fcmtoken || "",
        email: "",
        isImportant: true,
      });
      return support;
    } catch (error) {
      logger.error(error);
      throw error;
    }
  }

  async getSupport(query, page, limit) {
    try {
      const support = await Support.find(query)
        .sort({ _id: -1 })
        .populate("user")
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();
      const totalCount = await Support.countDocuments(query);
      const totalPages = Math.ceil(totalCount / limit);
      return { support, totalPages, totalCount };
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
