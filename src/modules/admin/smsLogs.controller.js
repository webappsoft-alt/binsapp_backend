import SmsLog from "../../models/SmsLog.js";
import { sendSMS, syncTwilioMessageStatus } from "../../utils/sendSMS.js";
import logger from "../../config/logger.js";

/**
 * Get paginated SMS logs with search, status filtering, and overall delivery stats
 */
export async function getAdminSmsLogs(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const { status, type, search } = req.query;

    const filter = {};

    if (status && status !== "all") {
      filter.status = status;
    }

    if (type && type !== "all") {
      filter.type = type;
    }

    if (search && search.trim()) {
      const q = search.trim();
      filter.$or = [
        { to: { $regex: q, $options: "i" } },
        { from: { $regex: q, $options: "i" } },
        { sid: { $regex: q, $options: "i" } },
        { body: { $regex: q, $options: "i" } },
      ];
    }

    const [logs, total, totalAll, deliveredCount, failedCount, sentCount] =
      await Promise.all([
        SmsLog.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        SmsLog.countDocuments(filter),
        SmsLog.countDocuments({}),
        SmsLog.countDocuments({ status: "delivered" }),
        SmsLog.countDocuments({ status: { $in: ["failed", "undelivered"] } }),
        SmsLog.countDocuments({ status: { $in: ["sent", "queued", "sending"] } }),
      ]);

    const deliveryRate =
      totalAll > 0 ? Math.round((deliveredCount / totalAll) * 100) : 100;

    return res.status(200).json({
      success: true,
      data: {
        logs,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit) || 1,
        },
        stats: {
          totalAll,
          delivered: deliveredCount,
          sent: sentCount,
          failed: failedCount,
          deliveryRate: `${deliveryRate}%`,
        },
      },
    });
  } catch (error) {
    logger.error("getAdminSmsLogs error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch SMS logs",
    });
  }
}

/**
 * Dispatch a manual SMS from Admin portal
 */
export async function sendAdminSms(req, res) {
  try {
    const { to, body, type = "test_sms" } = req.body;

    if (!to || !body) {
      return res.status(400).json({
        success: false,
        message: "Recipient phone number ('to') and message ('body') are required.",
      });
    }

    const result = await sendSMS({
      to,
      body,
      type: type || "test_sms",
      metadata: { initiatedBy: req.user?._id || "admin", manual: true },
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error || "SMS dispatch failed.",
      });
    }

    // Also record an in-app notification for admin so it appears in the notification center
    try {
      const Notification = (await import("../../models/Notification.js")).default;
      const adminId = req.user?._id;
      if (adminId) {
        await Notification.create({
          user: adminId,
          to_id: adminId,
          type: "admin-noti",
          description: `Direct SMS dispatched to ${to} via ${result.from || "BINSAPP"} (Status: ${result.status || "sent"})`,
          isImportant: false,
          seen: false,
        });
      }
    } catch (notifErr) {
      logger.warn("Failed to create admin notification for test SMS:", notifErr);
    }

    return res.status(200).json({
      success: true,
      message: `SMS successfully dispatched via ${result.from || "BINSAPP"}`,
      data: result,
    });
  } catch (error) {
    logger.error("sendAdminSms error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to dispatch SMS",
    });
  }
}

/**
 * Resend an existing SMS message by log ID
 */
export async function resendAdminSms(req, res) {
  try {
    const { id } = req.params;
    const log = await SmsLog.findById(id);

    if (!log) {
      return res.status(404).json({
        success: false,
        message: "SMS log record not found.",
      });
    }

    const result = await sendSMS({
      to: log.to,
      body: log.body,
      type: log.type,
      metadata: {
        ...(log.metadata || {}),
        resentFromLogId: log._id.toString(),
      },
    });

    return res.status(200).json({
      success: true,
      message: "SMS resent successfully.",
      data: result,
    });
  } catch (error) {
    logger.error("resendAdminSms error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to resend SMS",
    });
  }
}

/**
 * Sync fresh status from Twilio REST API for a given SMS log SID
 */
export async function syncAdminSmsStatus(req, res) {
  try {
    const { id } = req.params;
    const log = await SmsLog.findById(id);

    if (!log) {
      return res.status(404).json({
        success: false,
        message: "SMS log record not found.",
      });
    }

    if (!log.sid) {
      return res.status(400).json({
        success: false,
        message: "This SMS has no Twilio SID (was not dispatched to Twilio).",
      });
    }

    const syncResult = await syncTwilioMessageStatus(log.sid);

    if (!syncResult.success) {
      return res.status(400).json({
        success: false,
        message: syncResult.error || "Failed to sync status from Twilio.",
      });
    }

    const updatedLog = await SmsLog.findById(id);

    return res.status(200).json({
      success: true,
      message: `Status synced: ${syncResult.status}`,
      data: updatedLog,
    });
  } catch (error) {
    logger.error("syncAdminSmsStatus error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to sync SMS status",
    });
  }
}
