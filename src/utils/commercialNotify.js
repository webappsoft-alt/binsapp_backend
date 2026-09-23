import User from "../models/User.js";
import { sendNotification } from "./notifications.js";
import { buttonTemplate } from "./emailTemplate.js";
import logger from "../config/logger.js";

async function getIo() {
  try {
    const mod = await import("../socket/socket.js");
    return mod.io;
  } catch {
    return null;
  }
}

async function findAdminUser() {
  return User.findOne({ $or: [{ type: "admin" }, { role: "admin" }] })
    .select("_id fcmtoken email name")
    .lean();
}

/**
 * Notify customer + optional operator + admin (push/email/in-app + admin-noti).
 */
export async function notifyCommercialParties({
  actorId,
  customer,
  operator,
  type,
  title,
  description,
  orderId,
  emailHtml,
  metadata = {},
  notifyAdmin = true,
  customerLink,
  operatorLink,
}) {
  const promises = [];
  const customerId =
    customer?._id?.toString?.() || customer?.toString?.() || null;
  const operatorId =
    operator?._id?.toString?.() || operator?.toString?.() || null;
  let fromId = actorId?.toString?.() || customerId || operatorId;

  if (customerId) {
    promises.push(
      sendNotification({
        user: fromId,
        to_id: customerId,
        description,
        type,
        title,
        fcmtoken: customer?.fcmtoken || "",
        order: orderId || undefined,
        email: customer?.email || "",
        customEmailTemplate: Boolean(emailHtml || customerLink),
        html:
          emailHtml ||
          (customerLink
            ? buttonTemplate(customerLink, title, description)
            : undefined),
        metadata: { ...metadata, orderId, link: customerLink },
      }),
    );
  }

  if (operatorId) {
    promises.push(
      sendNotification({
        user: fromId,
        to_id: operatorId,
        description,
        type,
        title,
        fcmtoken: operator?.fcmtoken || "",
        order: orderId || undefined,
        email: operator?.email || "",
        customEmailTemplate: Boolean(operatorLink),
        html: operatorLink
          ? buttonTemplate(operatorLink, title, description)
          : undefined,
        metadata: { ...metadata, orderId, link: operatorLink },
      }),
    );
  }

  if (notifyAdmin) {
    const adminUser = await findAdminUser();
    if (adminUser) {
      if (!fromId) fromId = adminUser._id.toString();
      try {
        const io = await getIo();
        if (io) {
          io.to(`user_${adminUser._id.toString()}`).emit("admin-noti", {
            success: true,
            title,
            message: description,
            type,
            orderId,
            metadata,
          });
        }
      } catch (err) {
        logger.error("admin-noti emit failed", err);
      }
      promises.push(
        sendNotification({
          user: fromId,
          to_id: adminUser._id.toString(),
          description,
          type: type === "lead_received" ? "lead_received" : "admin-noti",
          title,
          fcmtoken: adminUser.fcmtoken || "",
          order: orderId || undefined,
          email: "",
          metadata: { ...metadata, orderId },
        }),
      );
    }
  }

  await Promise.all(promises).catch((err) =>
    logger.error("notifyCommercialParties failed", err),
  );
}

export { findAdminUser };
