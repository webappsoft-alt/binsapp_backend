import { normalizePhone } from "../utils/phone.js";
import { isStaticOtpPhone } from "../utils/staticOtpPhones.js";
import { logger } from "../config/logger.js";

/**
 * Runs first on /send-otp: normalize phone on the request and flag static test numbers
 * so every downstream limiter (express-rate-limit + Redis) can skip them.
 */
export function otpPhonePrep(req, res, next) {
  const raw = req.body?.phone;
  const normalized = normalizePhone(raw);

  if (normalized) {
    req.body.phone = normalized;
  }

  req.isStaticOtpPhone =
    isStaticOtpPhone(raw) || (normalized ? isStaticOtpPhone(normalized) : false);
  req.skipOtpLimits = req.isStaticOtpPhone;

  if (req.isStaticOtpPhone) {
    logger.info("otp.static_limits_bypass", {
      rawPhone: raw,
      normalizedPhone: normalized,
    });
  }

  next();
}
