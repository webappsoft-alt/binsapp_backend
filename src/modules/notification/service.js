import Notification from "../../models/Notification.js";
import { NotFoundError } from "../../utils/apiError.js";

class NotificationService {
  async getApplicationDetails(query, options) {
    console.log(JSON.stringify(query,null,2));
    const notifications = await Notification.find(query)
      .populate([
        "user",
        "to_id",
        {
          path: "order",
          populate: {
            path: "dumbster",
          },
        },
      ])
      .sort({ createdAt: -1 })
      .skip((options.page - 1) * options.limit)
      .limit(options.limit);
    await Notification.updateMany(query, {
      $set: {
        seen: true,
      },
    });
    // console.log(JSON.stringify(notifications,null,2));
    const total = await Notification.countDocuments(query);
    return {
      notifications,
      total,
      pages: Math.ceil(total / options.limit),
      currentPage: options.page,
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
