import User from "../models/user.js";
import { sendNotification } from "./notifications.js";
import { buttonTemplate } from "./emailTemplate.js";
import logger from "../config/logger.js";

async function findAdminUser() {
  return User.findOne({ $or: [{ type: "admin" }, { role: "admin" }] })
    .select("_id fcmtoken email name")
    .lean();
}

/**
 * Notify an operator (and optionally admin) about growth-platform events.
 */
export async function notifyGrowthEvent({
  operator,
  type,
  title,
  description,
  notifyAdmin = false,
  metadata = {},
  link,
}) {
  const operatorId =
    operator?._id?.toString?.() || operator?.toString?.() || null;
  if (!operatorId) return;

  let operatorDoc = operator;
  if (!operator?.fcmtoken && !operator?.email) {
    operatorDoc = await User.findById(operatorId)
      .select("_id fcmtoken email name")
      .lean();
  }

  const promises = [
    sendNotification({
      user: operatorId,
      to_id: operatorId,
      type,
      title,
      description,
      fcmtoken: operatorDoc?.fcmtoken || "",
      email: operatorDoc?.email || "",
      customEmailTemplate: Boolean(link),
      html: link ? buttonTemplate(link, title, description) : undefined,
      metadata: { ...metadata, link },
    }),
  ];

  if (notifyAdmin) {
    const admin = await findAdminUser();
    if (admin?._id) {
      promises.push(
        sendNotification({
          user: operatorId,
          to_id: admin._id,
          type:
            type === "financing_application_received"
              ? "financing_application_submitted"
              : "admin-noti",
          title,
          description,
          fcmtoken: admin.fcmtoken || "",
          email: admin.email || "",
          metadata: { ...metadata, operatorId },
        }),
      );
    }
  }

  await Promise.allSettled(promises);
}

export async function notifyGrowthSafe(args) {
  try {
    await notifyGrowthEvent(args);
  } catch (err) {
    logger.error("growth notify failed", {
      type: args?.type,
      error: err?.message,
    });
  }
}
