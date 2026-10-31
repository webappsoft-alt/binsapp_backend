import Notification from "../../models/Notification.js";
import { NotFoundError } from "../../utils/apiError.js";

class NotificationService {
  async getApplicationDetails(query, options = {}) {
    const safePage = Math.max(1, Number(options.page) || 1);
    const safeLimit = Math.max(1, Number(options.limit) || 10);

    const [notifications, total] = await Promise.all([
      Notification.find(query)
        .populate("user", "name comp_name email profilePicture")
        .populate("to_id", "name comp_name email")
        .populate({
          path: "order",
          select: "orderNumber status total_price service_type dumbster",
          populate: {
            path: "dumbster",
            select: "name size price",
          },
        })
        .sort({ createdAt: -1 })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit)
        .lean(),
      Notification.countDocuments(query),
    ]);

    // Asynchronously mark notifications as seen without blocking response
    Notification.updateMany(query, {
      $set: {
        seen: true,
      },
    }).catch((err) =>
      console.error("Async notification updateMany failed:", err)
    );

    return {
      notifications,
      total,
      pages: Math.ceil(total / safeLimit),
      currentPage: safePage,
    };
  }
  async deleteNotification(notiId, userId) {
    const notification = await Notification.findOneAndDelete({
      _id: notiId,
      user: userId,
    });
    if (!notification) {
      throw new NotFoundError("Notification not found");
    }
    return notification;
  }
}

export default new NotificationService();
