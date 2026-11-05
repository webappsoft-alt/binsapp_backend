import mongoose from "mongoose";
import Notification from "../../models/Notification.js";
import { NotFoundError } from "../../utils/apiError.js";
import { emitNotificationCount } from "../../utils/notificationEvents.js";

class NotificationService {
  /**
   * Paginated notifications for `query`.
   * options.markSeen (default true) keeps the legacy behaviour of marking everything matching
   * the query as seen; the admin panel passes false and marks only what it displays.
   * options.countsFor (a user id) adds the user's unread / important totals for badges and tabs.
   */
  async getApplicationDetails(query, options = {}) {
    const safePage = Math.max(1, Number(options.page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(options.limit) || 10));
    const markSeen = options.markSeen !== false;

    const [notifications, total, unreadCount, importantCount] = await Promise.all([
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
      options.countsFor
        ? Notification.countDocuments({ to_id: options.countsFor, seen: false })
        : Promise.resolve(undefined),
      options.countsFor
        ? Notification.countDocuments({ to_id: options.countsFor, isImportant: true })
        : Promise.resolve(undefined),
    ]);

    if (markSeen) {
      // Asynchronously mark notifications as seen without blocking response
      Notification.updateMany(query, {
        $set: {
          seen: true,
        },
      }).catch((err) =>
        console.error("Async notification updateMany failed:", err)
      );
    }

    return {
      notifications,
      total,
      pages: Math.ceil(total / safeLimit),
      currentPage: safePage,
      hasMore: safePage * safeLimit < total,
      ...(unreadCount !== undefined ? { unreadCount } : {}),
      ...(importantCount !== undefined ? { importantCount } : {}),
    };
  }

  /** Mark only the given notifications (owned by userId) as seen; returns the new unread total. */
  async markSeen(userId, ids = []) {
    const validIds = (Array.isArray(ids) ? ids : [])
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .slice(0, 200);
    let modified = 0;
    if (validIds.length) {
      const res = await Notification.updateMany(
        { _id: { $in: validIds }, to_id: userId, seen: false },
        { $set: { seen: true } },
      );
      modified = res?.modifiedCount || 0;
    }
    // Keep every open tab/device of this user in sync in real time.
    const pushed = await emitNotificationCount(userId);
    const unreadCount =
      pushed ?? (await Notification.countDocuments({ to_id: userId, seen: false }));
    return { modified, unreadCount };
  }

  async getUnreadCount(userId) {
    return Notification.countDocuments({ to_id: userId, seen: false });
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
