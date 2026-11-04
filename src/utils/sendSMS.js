import axios from "axios";
import config from "../config/env.js";
import logger from "../config/logger.js";
import { normalizePhone } from "./phone.js";

export const SMS_STATUS_CALLBACK_PATH = "/api/sms/status-callback";
export const SMS_IN_TRANSIT_STATUSES = ["queued", "sending", "sent"];
export const SMS_FAILED_STATUSES = ["failed", "undelivered"];

// Twilio reports a few statuses our SmsLog enum doesn't have; fold them into ours.
const TWILIO_STATUS_MAP = {
  accepted: "queued",
  scheduled: "queued",
  partially_delivered: "sent",
  read: "delivered",
  canceled: "failed",
};

// Rank used so a late/out-of-order callback never moves a log backwards
// (e.g. a "sent" callback arriving after "delivered").
const STATUS_RANK = {
  queued: 0,
  sending: 0,
  sent: 1,
  mocked: 2,
  delivered: 2,
  undelivered: 2,
  failed: 2,
};

export function normalizeTwilioStatus(status) {
  const s = String(status || "").trim().toLowerCase();
  if (!s) return null;
  return TWILIO_STATUS_MAP[s] || (s in STATUS_RANK ? s : null);
}

/**
 * Public URL Twilio should POST delivery receipts to. Only returned when the
 * backend has a real public https domain configured (Twilio can't reach localhost).
 */
export function getSmsStatusCallbackUrl() {
  const base = String(
    config.get("appinfo.backendURL") || process.env.APP_BACKEND_DOMAIN || ""
  )
    .trim()
    .replace(/\/+$/, "");
  if (!/^https:\/\//i.test(base) || base.includes("api.backend.com")) return null;
  return `${base}${SMS_STATUS_CALLBACK_PATH}`;
}

/**
 * Write a carrier status onto the SmsLog with this SID and notify admins over the socket.
 * Used by both the Twilio status webhook and the REST sync.
 */
export async function applySmsStatusUpdate({ sid, status, errorCode, errorMessage }) {
  const next = normalizeTwilioStatus(status);
  if (!sid || !next) return null;

  const SmsLog = (await import("../models/SmsLog.js")).default;
  const current = await SmsLog.findOne({ sid }).select("status").lean();
  if (!current) return null;

  const currentRank = STATUS_RANK[current.status] ?? 0;
  if (current.status !== next && STATUS_RANK[next] < currentRank) {
    return current;
  }

  const updated = await SmsLog.findOneAndUpdate(
    { sid },
    {
      status: next,
      errorCode: errorCode ? String(errorCode) : null,
      errorMessage: errorMessage || null,
    },
    { new: true }
  ).lean();

  if (updated && current.status !== updated.status) {
    emitSmsStatusToAdmins(updated).catch(() => {});
  }
  return updated;
}

async function emitSmsStatusToAdmins(log) {
  const { io } = await import("../socket/socket.js");
  if (!io) return;
  const User = (await import("../models/User.js")).default;
  const admins = await User.find({ $or: [{ type: "admin" }, { role: "admin" }] })
    .select("_id")
    .lean();
  const payload = {
    _id: log._id,
    sid: log.sid,
    status: log.status,
    errorCode: log.errorCode,
    errorMessage: log.errorMessage,
    updatedAt: log.updatedAt,
  };
  for (const a of admins) {
    io.to(`user_${a._id.toString()}`).emit("sms-status-updated", payload);
  }
}

/**
 * Sends a direct SMS message using the Twilio REST API.
 * Gracefully handles sandbox/unverified numbers and dev environments without crashing.
 *
 * @param {Object} options
 * @param {string} options.to - Recipient phone number in E.164 or local format
 * @param {string} options.body - Text message content
 * @returns {Promise<{ success: boolean, sid?: string, message?: string, error?: any }>}
 */
export async function sendSMS({
  to,
  body,
  mediaUrl,
  type = "general",
  metadata = {},
} = {}) {
  try {
    const rawPhone = normalizePhone(to);
    if (!rawPhone) {
      logger.warn("sendSMS: No recipient phone number provided.");
      return { success: false, message: "Missing phone number" };
    }

    if (!body || !body.trim()) {
      logger.warn("sendSMS: Empty message body.");
      return { success: false, message: "Missing message body" };
    }

    const accountSid =
      config.get("twilio.accountSid") || process.env.TWILIO_ACCOUNT_SID;
    const authToken =
      config.get("twilio.authToken") || process.env.TWILIO_AUTH_TOKEN;
    const fromPhone =
      process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_FROM || "+18557434287";
    const serviceSid =
      config.get("twilio.serviceSid") || process.env.TWILIO_SERVICE_SID;

    // Determine 'From' sender:
    // US & Canada (+1) carriers do NOT support Alphanumeric Sender IDs and require an E.164 / Toll-Free number.
    // International numbers (e.g. Pakistan +92, UK +44, etc.) support Alphanumeric Sender IDs like "BINSAPP"
    // which displays the brand name directly as the SMS sender header instead of a random number!
    const isUSCanada = rawPhone.startsWith("+1");
    const alphaSender =
      process.env.TWILIO_ALPHANUMERIC_SENDER || "BINSAPP";

    let primaryFrom = fromPhone;
    if (!isUSCanada && alphaSender) {
      primaryFrom = alphaSender;
    }

    // In dev / test or when credentials are not configured, log mock dispatch
    if (!accountSid || !authToken) {
      logger.info(`[SMS MOCK DISPATCH] To: ${rawPhone} | Message: ${body}`);
      let mockLog = null;
      try {
        const SmsLog = (await import("../models/SmsLog.js")).default;
        mockLog = await SmsLog.create({
          to: rawPhone,
          from: primaryFrom,
          body: body.trim(),
          channel: mediaUrl ? "MMS" : "SMS",
          mediaUrl: mediaUrl || null,
          type: type || "general",
          metadata: metadata || {},
          status: "mocked",
        });
      } catch (e) {
        logger.error("sendSMS mock log error:", e);
      }
      return {
        success: true,
        mocked: true,
        sid: "MOCK_" + Date.now(),
        from: primaryFrom,
        status: "mocked",
        logId: mockLog?._id,
        message: "SMS logged (Twilio credentials not set)",
      };
    }

    const postMessage = async (fromVal) => {
      const p = new URLSearchParams();
      p.append("To", rawPhone);
      p.append("Body", body.trim());
      // Explicitly bypass Twilio SMS Pumping / Carrier risk filtering for trusted transactional alerts
      p.append("RiskCheck", "disable");

      // Ask Twilio to POST delivery receipts back so SmsLog.status leaves "sent"
      const statusCallback = getSmsStatusCallbackUrl();
      if (statusCallback) {
        p.append("StatusCallback", statusCallback);
      }

      // Attach MMS picture for destinations that support it (US/Canada with phone number sender)
      if (mediaUrl && fromVal && fromVal.startsWith("+")) {
        p.append("MediaUrl", mediaUrl);
      }

      if (fromVal) {
        p.append("From", fromVal);
      } else if (serviceSid && serviceSid.startsWith("MG")) {
        p.append("MessagingServiceSid", serviceSid);
      } else {
        throw new Error("No valid Twilio From number or ServiceSid configured");
      }

      return axios.post(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        p.toString(),
        {
          auth: {
            username: accountSid,
            password: authToken,
          },
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );
    };

    // Log to DB if MongoDB is available
    let logEntry = null;
    try {
      const SmsLog = (await import("../models/SmsLog.js")).default;
      logEntry = await SmsLog.create({
        to: rawPhone,
        from: primaryFrom,
        body: body.trim(),
        channel: mediaUrl ? "MMS" : "SMS",
        mediaUrl: mediaUrl || null,
        type: type || "general",
        metadata: metadata || {},
        status: "sending",
      });
    } catch (dbErr) {
      logger.error("sendSMS db log creation error:", dbErr);
    }

    let res;
    let actualFrom = primaryFrom;
    try {
      res = await postMessage(primaryFrom);
    } catch (primaryErr) {
      // If alphanumeric sender fails for any destination, fallback to fromPhone number
      if (primaryFrom !== fromPhone && fromPhone) {
        logger.info(
          `[SMS FALLBACK] Primary sender ${primaryFrom} failed, retrying with ${fromPhone}`
        );
        actualFrom = fromPhone;
        res = await postMessage(fromPhone);
      } else {
        if (logEntry) {
          const errData = primaryErr?.response?.data;
          await logEntry.updateOne({
            status: "failed",
            errorCode: errData?.code || "FAIL",
            errorMessage: errData?.message || primaryErr.message,
          }).catch(() => {});
        }
        throw primaryErr;
      }
    }

    const sid = res.data?.sid || null;
    const twilioStatus = normalizeTwilioStatus(res.data?.status) || "sent";

    if (logEntry) {
      await logEntry.updateOne({
        sid,
        from: actualFrom,
        status: twilioStatus,
      }).catch(() => {});
    }

    logger.info(
      `[SMS DISPATCHED] To: ${rawPhone} | From: ${actualFrom} | SID: ${sid || "ok"} | Status: ${twilioStatus}`
    );
    return {
      success: true,
      sid,
      from: actualFrom,
      status: twilioStatus,
      logId: logEntry?._id,
      log: logEntry,
    };
  } catch (error) {
    const errData = error?.response?.data;
    logger.warn(`sendSMS warning for ${to}: ${errData?.message || error?.message}`);
    return {
      success: false,
      error: errData?.message || error?.message,
    };
  }
}

/**
 * Sync the latest carrier delivery status from Twilio REST API for a given message SID
 *
 * @param {string} sid - Twilio Message SID (starts with SM or MM)
 * @returns {Promise<{ success: boolean, status?: string, data?: any, error?: string }>}
 */
export async function syncTwilioMessageStatus(sid) {
  try {
    if (!sid) {
      return { success: false, error: "Missing message SID" };
    }

    const accountSid =
      config.get("twilio.accountSid") || process.env.TWILIO_ACCOUNT_SID;
    const authToken =
      config.get("twilio.authToken") || process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      return { success: false, error: "Twilio credentials not configured" };
    }

    const res = await axios.get(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages/${sid}.json`,
      {
        auth: {
          username: accountSid,
          password: authToken,
        },
      }
    );

    const freshStatus = res.data?.status; // delivered, sent, failed, undelivered, queued
    const errorCode = res.data?.error_code || null;
    const errorMessage = res.data?.error_message || null;

    // Update in database if SmsLog exists
    let log = null;
    try {
      log = await applySmsStatusUpdate({ sid, status: freshStatus, errorCode, errorMessage });
    } catch (dbErr) {
      // Non-blocking
    }

    return {
      success: true,
      status: log?.status || normalizeTwilioStatus(freshStatus) || freshStatus,
      log,
      errorCode,
      errorMessage,
      data: res.data,
    };
  } catch (err) {
    return {
      success: false,
      error: err?.response?.data?.message || err.message,
    };
  }
}

