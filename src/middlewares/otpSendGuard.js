import { assertOtpSendAllowed, getClientIp, normalizePhone } from "../utils/otpProtection.js";
import { logger } from "../config/logger.js";

export async function otpSendGuard(req, res, next) {
  if (req.skipOtpLimits || req.isStaticOtpPhone) {
    return next();
  }

  try {
    const phone = normalizePhone(req.body?.phone);
    if (phone) {
      req.body.phone = phone;
    }
    const ip = getClientIp(req);

    await assertOtpSendAllowed({ phone, ip });
    next();
  } catch (err) {
    if (err?.name === "BadRequestError" || err?.code === "BAD_REQUEST") {
      logger.warn("otp.protection.blocked", {
        phone: normalizePhone(req.body?.phone),
        ip: getClientIp(req),
        error: err.message,
        code: err.code,
      });
      return next(err);
    }

    // Fail OPEN: if the rate-limit backend (Redis) or this guard hits an
    // unexpected error, we must not lock legitimate users out of login. Log the
    // full error for diagnosis and let the request proceed — Twilio Verify's own
    // fraud/rate protections remain the backstop against abuse.
    logger.error("otp.protection.redis_failure", {
      phone: normalizePhone(req.body?.phone),
      ip: getClientIp(req),
      error: err?.message,
      name: err?.name,
      stack: err?.stack,
    });
    next();
  }
}
