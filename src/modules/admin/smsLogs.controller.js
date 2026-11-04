import SmsLog from "../../models/SmsLog.js";
import crypto from "crypto";
import config from "../../config/env.js";
import {
  sendSMS,
  syncTwilioMessageStatus,
  applySmsStatusUpdate,
  getSmsStatusCallbackUrl,
  SMS_IN_TRANSIT_STATUSES,
  SMS_FAILED_STATUSES,
} from "../../utils/sendSMS.js";
import logger from "../../config/logger.js";

// Only ask Twilio about recent in-transit messages; older ones won't change anymore.
const LIVE_SYNC_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function parseDate(value, endOfDay = false) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  // Plain YYYY-MM-DD → cover the whole day
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    if (endOfDay) d.setUTCHours(23, 59, 59, 999);
    else d.setUTCHours(0, 0, 0, 0);
  }
  return d;
}

/**
 * Pull fresh carrier status for in-transit rows on the current page and
 * patch them in place, so a load/refresh always shows the real status.
 */
async function syncInTransitLogs(logs) {
  const cutoff = Date.now() - LIVE_SYNC_WINDOW_MS;
  const pending = logs.filter(
    (l) =>
      l.sid &&
      /^(SM|MM)/.test(l.sid) &&
      SMS_IN_TRANSIT_STATUSES.includes(l.status) &&
      new Date(l.createdAt).getTime() >= cutoff
  );
  if (!pending.length) return 0;

  const results = await Promise.allSettled(
    pending.map((l) => syncTwilioMessageStatus(l.sid))
  );
  let changed = 0;
  results.forEach((r, i) => {
    const fresh = r.status === "fulfilled" && r.value?.success ? r.value.log : null;
    if (fresh && fresh.status !== pending[i].status) {
      Object.assign(pending[i], {
        status: fresh.status,
        errorCode: fresh.errorCode,
        errorMessage: fresh.errorMessage,
        updatedAt: fresh.updatedAt,
      });
      changed++;
    }
  });
  return changed;
}

/**
 * Get paginated SMS logs with search, status filtering, and overall delivery stats
 */
export async function getAdminSmsLogs(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const { status, type, search, startDate, endDate } = req.query;
    const shouldSync = req.query.sync !== "false";

    const conditions = [];

    if (status && status !== "all") {
      // Tabs are status groups: "sent" = in transit, "failed" = failed/undelivered
      if (status === "sent" || status === "in_transit") {
        conditions.push({ status: { $in: SMS_IN_TRANSIT_STATUSES } });
      } else if (status === "failed") {
        conditions.push({ status: { $in: SMS_FAILED_STATUSES } });
      } else {
        conditions.push({ status });
      }
    }

    const from = parseDate(startDate);
    const to = parseDate(endDate, true);
    if (from || to) {
      const createdAt = {};
      if (from) createdAt.$gte = from;
      if (to) createdAt.$lte = to;
      conditions.push({ createdAt });
    }

    if (type && type !== "all") {
      if (type === "dispatch_alert") {
        conditions.push({
          $or: [
            { type: { $in: ["dispatch_alert", "driver_on_way", "dropoff_done"] } },
            {
              body: {
                $regex:
                  "dumpster has been|driver is on the way|truck arriving|placement|driver has arrived|collect the dumpster",
                $options: "i",
              },
            },
          ],
        });
      } else if (type === "order_reminder") {
        conditions.push({
          $or: [
            { type: "order_reminder" },
            {
              body: {
                $regex: "reminder|complete your order|order place",
                $options: "i",
              },
            },
          ],
        });
      } else {
        conditions.push({ type });
      }
    }

    if (search && search.trim()) {
      const q = escapeRegex(search.trim());
      conditions.push({
        $or: [
          { to: { $regex: q, $options: "i" } },
          { from: { $regex: q, $options: "i" } },
          { sid: { $regex: q, $options: "i" } },
          { body: { $regex: q, $options: "i" } },
        ],
      });
    }

    const filter = conditions.length > 0 ? { $and: conditions } : {};

    const [logs, total] = await Promise.all([
      SmsLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      SmsLog.countDocuments(filter),
    ]);

    if (shouldSync) {
      try {
        await syncInTransitLogs(logs);
      } catch (syncErr) {
        logger.warn("getAdminSmsLogs live sync failed:", syncErr?.message);
      }
    }

    // Counted after the sync so the cards match the rows just refreshed
    const [totalAll, deliveredCount, failedCount, sentCount] = await Promise.all([
      SmsLog.countDocuments({}),
      SmsLog.countDocuments({ status: "delivered" }),
      SmsLog.countDocuments({ status: { $in: SMS_FAILED_STATUSES } }),
      SmsLog.countDocuments({ status: { $in: SMS_IN_TRANSIT_STATUSES } }),
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

/**
 * Twilio StatusCallback webhook (public, no auth). Twilio POSTs form fields
 * MessageSid / MessageStatus / ErrorCode every time a message changes state.
 */
export async function smsStatusCallback(req, res) {
  try {
    const authToken =
      config.get("twilio.authToken") || process.env.TWILIO_AUTH_TOKEN;
    const signature = req.get("X-Twilio-Signature");
    const callbackUrl = getSmsStatusCallbackUrl();

    if (authToken && callbackUrl) {
      const params = req.body || {};
      const payload = Object.keys(params)
        .sort()
        .reduce((acc, key) => acc + key + params[key], callbackUrl);
      const expected = crypto
        .createHmac("sha1", authToken)
        .update(Buffer.from(payload, "utf-8"))
        .digest("base64");
      const valid =
        signature &&
        signature.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
      if (!valid) {
        logger.warn("smsStatusCallback: invalid Twilio signature");
        return res.status(403).send("Invalid signature");
      }
    }

    const { MessageSid, SmsSid, MessageStatus, SmsStatus, ErrorCode, ErrorMessage } =
      req.body || {};
    await applySmsStatusUpdate({
      sid: MessageSid || SmsSid,
      status: MessageStatus || SmsStatus,
      errorCode: ErrorCode,
      errorMessage: ErrorMessage,
    });

    return res.status(204).end();
  } catch (error) {
    logger.error("smsStatusCallback error:", error);
    // 200 so Twilio doesn't retry-storm on our own errors
    return res.status(200).end();
  }
}
