import Notification from "../models/Notification.js";
import logger from "../config/logger.js";
// `io` is a live binding set once initSocket() runs; it stays null in contexts
// without a socket server (e.g. worker threads), so emits are guarded below.
import { io } from "../socket/socket.js";

export const countUnreadNotifications = (userId) =>
  Notification.countDocuments({ to_id: userId, seen: false });

/** Push the recipient's current unread total (badge) over their socket room. */
export const emitNotificationCount = async (userId) => {
  if (!io || !userId) return null;
  try {
    const unreadCount = await countUnreadNotifications(userId);
    io.to(`user_${userId.toString()}`).emit("notification:count", { unreadCount });
    return unreadCount;
  } catch (err) {
    logger.error("notification:count emit failed", err);
    return null;
  }
};

/**
 * Real-time delivery of a freshly saved notification to its recipient, including the
 * updated unread total so badges never need an API round-trip.
 */
export const emitNewNotification = async (notification) => {
  const toId = notification?.to_id;
  if (!io || !toId) return;
  try {
    const unreadCount = await countUnreadNotifications(toId);
    io.to(`user_${toId.toString()}`).emit("new:notification", {
      _id: notification._id,
      title: notification.title,
      body: notification.description,
      description: notification.description,
      type: notification.type,
      seen: notification.seen,
      createdAt: notification.createdAt,
      order: notification.order,
      request: notification.request,
      dustbin: notification.dustbin,
      isImportant: Boolean(notification.isImportant),
      metadata: notification.metadata || null,
      unreadCount,
    });
  } catch (err) {
    logger.error("new:notification emit failed", err);
  }
};
