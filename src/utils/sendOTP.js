import logger from "../config/logger.js";
import TempUser from "../models/TempUser.js";
import { generateOTP } from "./Generator.js";
import { sendEmail } from "./emailHelper.js";
import config from "../config/env.js";
import axios from "axios";
const OTP_EXPIRY_MINUTES = 10;

const TWILIO_ERROR_HINTS = {
  20003:
    "Invalid Twilio Account SID or Auth Token. Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.",
  20404:
    "Twilio Verify Service not found. Check TWILIO_SERVICE_SID matches your Twilio account.",
  60200:
    "Invalid Twilio Verify parameter (often AppHash). Check TWILIO_APP_HASH is exactly 11 characters or unset.",
  60202:
    "Max verification attempts reached for this phone number. Try again later.",
  60203: "Max send attempts reached for this phone number. Try again later.",
  60212:
    "Too many verification requests for this phone number. Try again later.",
  60223: "Delivery to this phone number is blocked by Twilio.",
  21211: "Invalid phone number format. Use E.164 format, e.g. +923001234567.",
  21608:
    "Unverified phone number. Add it in Twilio console or upgrade the account.",
  21610: "SMS is not enabled for this Twilio account or destination.",
};

/**
 * Normalize Twilio API / Verify errors into a consistent shape for logs and API responses.
 */
export function parseTwilioError(err) {
  if (typeof err === "string" && err.trim()) {
    return {
      httpStatus: 502,
      twilioCode: null,
      twilioMessage: err.trim(),
      moreInfo: null,
      hint: null,
      message: err.trim(),
    };
  }

  if (!err || typeof err !== "object") {
    return {
      httpStatus: 502,
      twilioCode: null,
      twilioMessage: "Twilio request failed",
      moreInfo: null,
      hint: "Unexpected Twilio error. Check server logs.",
      message: "Twilio request failed",
    };
  }

  const httpStatus =
    typeof err.httpStatus === "number"
      ? err.httpStatus
      : typeof err.status === "number"
        ? err.status
        : typeof err.code?.status === "number"
          ? err.code.status
          : 502;

  const twilioCode =
    typeof err.twilioCode === "number"
      ? err.twilioCode
      : typeof err.code === "number"
        ? err.code
        : typeof err.code === "string" && /^\d+$/.test(err.code)
          ? Number(err.code)
          : null;

  const twilioMessage =
    typeof err.twilioMessage === "string" && err.twilioMessage
      ? err.twilioMessage
      : typeof err.message === "string" && err.message
        ? err.message
        : typeof err.code === "object" && err.code?.message
          ? String(err.code.message)
          : "Twilio request failed";

  const moreInfo =
    typeof err.more_info === "string"
      ? err.more_info
      : twilioCode
        ? `https://www.twilio.com/docs/errors/${twilioCode}`
        : null;

  let hint =
    (twilioCode && TWILIO_ERROR_HINTS[twilioCode]) ||
    (httpStatus === 401
      ? "Twilio rejected credentials (401). Verify TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_SERVICE_SID on the server."
      : null) ||
    "See twilioCode and moreInfo for details.";

  if (
    twilioCode === 60200 &&
    (twilioMessage.includes("`To`") || twilioMessage.includes("'To'"))
  ) {
    hint =
      "Invalid phone number format. US area codes cannot start with 0 or 1 (e.g., use a real US number like +1 202 555 0123).";
  }

  return {
    httpStatus,
    twilioCode,
    twilioMessage,
    moreInfo,
    hint,
    message: twilioCode
      ? `Twilio error ${twilioCode}: ${twilioMessage}${hint ? ` — ${hint}` : ""}`
      : twilioMessage,
  };
}

/**
 * Twilio Verify returns 60200 for empty or invalid AppHash. Omit unless exactly 11 chars
 * (Android SMS Retriever client hash length); Twilio validates the value.
 * @see https://www.twilio.com/docs/errors/60200
 */
function appendAppHashIfValid(params, hash) {
  const raw = hash;
  const appHash = typeof raw === "string" ? raw.trim() : "";
  if (!appHash) {
    return;
  }
  if (appHash.length === 11) {
    params.append("AppHash", appHash);
    return;
  }
  logger.warn(
    "TWILIO_APP_HASH must be exactly 11 characters for Twilio Verify; omitting AppHash so SMS still works",
  );
}

export async function sendOtp(email, type = "mfa") {
  // const
  const code = generateOTP(6, { numeric: true });
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
  await TempUser.findOneAndUpdate(
    { email, type },
    { code, expiresAt, type, attempts: 0 },
    { upsert: true, new: true },
  );
  await sendEmail({
    to: email,
    subject: "Your OTP Code",
    html: `
    <div style="font-family: Arial, sans-serif; color: #333;">
      <h2>Hello 👋</h2>
      <p>Use the following One-Time Password (OTP) to complete your verification:</p>
      <h1 style="background: #f3f3f3; padding: 10px 20px; border-radius: 6px; display: inline-block;">
        ${code}
      </h1>
      <p>This OTP will expire in <strong>10 minutes</strong>.</p>
      <p>If you didn’t request this, please ignore this email.</p>
      <br />
      <p>Thanks,<br />The Utecho Team</p>
    </div>
  `,
  });
  return { message: "OTP sent to your email", code };
}

export async function sendSMSOTP(phone, hash) {
  try {
    const body = new URLSearchParams();
    body.append("To", phone);
    body.append("Channel", "sms");
    appendAppHashIfValid(body, hash);

    // Twilio Verify composes the SMS body itself; we only control To/Channel/
    // AppHash. Log what we forward so QA can confirm the client hash reached
    // Twilio (Twilio appends it as the SMS Retriever last line when present).
    const forwardedHash = body.get("AppHash");
    logger.info("sendSMSOTP.twilio_request", {
      channel: "sms",
      appHashForwarded: Boolean(forwardedHash),
      appHashLength: forwardedHash ? forwardedHash.length : 0,
    });

    const response = await axios.post(
      `https://verify.twilio.com/v2/Services/${config.get(
        "twilio.serviceSid",
      )}/Verifications`,
      body,
      {
        auth: {
          username: config.get("twilio.accountSid"),
          password: config.get("twilio.authToken"),
        },
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    );

    return { success: true, data: response.data };
  } catch (error) {
    const twilioStatus = error?.response?.status;
    const twilioData = error?.response?.data;
    const payload =
      twilioData == null
        ? { message: error?.message || "Could not reach Twilio", status: 502 }
        : typeof twilioData === "object"
          ? { ...twilioData, status: twilioStatus ?? twilioData.status }
          : { message: String(twilioData), status: twilioStatus };
    const parsed = parseTwilioError(payload);
    logger.error("Error sending verification code:", {
      phone,
      axiosMessage: error?.message,
      ...parsed,
    });
    return {
      success: false,
      error: parsed,
    };
  }
}

export async function verifyCode(phone, code) {
  try {
    const response = await axios.post(
      `https://verify.twilio.com/v2/Services/${config.get(
        "twilio.serviceSid",
      )}/VerificationCheck`,
      new URLSearchParams({
        To: phone,
        Code: code,
      }),
      {
        auth: {
          username: config.get("twilio.accountSid"),
          password: config.get("twilio.authToken"),
        },
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    );

    if (response.data.status === "approved") {
      return { success: true, message: "Verification successful!" };
    } else {
      return {
        success: false,
        message: "Verification failed. Please check the code and try again.",
      };
    }
  } catch (error) {
    const twilioStatus = error?.response?.status;
    const twilioData = error?.response?.data || {};
    const parsed = parseTwilioError({ ...twilioData, status: twilioStatus });
    logger.error("Error verifying verification code:", {
      phone,
      code,
      ...parsed,
    });
    return {
      success: false,
      error: parsed,
    };
  }
}
