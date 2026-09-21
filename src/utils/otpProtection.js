import redis from "../config/redis.js";
import config from "../config/env.js";
import { logger } from "../config/logger.js";
import { BadRequestError } from "./apiError.js";
import { normalizePhone } from "./phone.js";
import { isStaticOtpPhone } from "./staticOtpPhones.js";

function protectionConfig() {
  return config.get("otpProtection");
}

export { normalizePhone, phoneLookupVariants } from "./phone.js";

export function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}

function allowedPrefixes() {
  const raw = protectionConfig().allowedPrefixes;
  if (!raw || typeof raw !== "string") return ["+1"];
  return raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}

function pkWhitelistPhones() {
  const raw = protectionConfig().pkWhitelist;
  if (!raw || typeof raw !== "string") return new Set();
  return new Set(
    raw
      .split(",")
      .map((p) => normalizePhone(p))
      .filter(Boolean),
  );
}

function secondsUntilUtcMidnight() {
  const now = new Date();
  const midnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  );
  return Math.max(60, Math.ceil((midnight - now.getTime()) / 1000));
}

function isPhoneRegionAllowed(phone) {
  if (isStaticOtpPhone(phone)) {
    return true;
  }

  const prefixes = allowedPrefixes();
  if (prefixes.some((prefix) => phone.startsWith(prefix))) {
    return true;
  }

  // Fallback: allow explicitly whitelisted +92 numbers even when +92 is not an open prefix.
  if (phone.startsWith("+92")) {
    return pkWhitelistPhones().has(phone);
  }

  return false;
}

/**
 * Enforce OTP send limits before any Twilio call.
 * Throws BadRequestError — same status (400) so mobile clients show the message.
 */
export async function assertOtpSendAllowed({ phone, ip }) {
  const cfg = protectionConfig();
  if (!cfg.enabled) return;

  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    throw new BadRequestError("Phone number is required");
  }

  if (isStaticOtpPhone(phone) || isStaticOtpPhone(normalizedPhone)) {
    return;
  }

  if (!isPhoneRegionAllowed(normalizedPhone)) {
    logger.warn("otp.protection.region_blocked", {
      phone: normalizedPhone,
      ip,
      allowedPrefixes: allowedPrefixes(),
      pkWhitelistCount: pkWhitelistPhones().size,
    });
    throw new BadRequestError("Phone number region is not supported");
  }

  const cooldownKey = `otp:cooldown:phone:${normalizedPhone}`;
  const cooldownSet = await redis.set(
    cooldownKey,
    "1",
    "EX",
    cfg.phoneCooldownSec,
    "NX",
  );
  if (cooldownSet === null) {
    const ttl = await redis.ttl(cooldownKey);
    throw new BadRequestError(
      `Please wait ${Math.max(ttl, 1)} seconds before requesting another code.`,
    );
  }

  const phoneDayKey = `otp:count:phone:${normalizedPhone}`;
  const phoneCount = await redis.incr(phoneDayKey);
  if (phoneCount === 1) {
    await redis.expire(phoneDayKey, 24 * 60 * 60);
  }
  if (phoneCount > cfg.phoneMaxPerDay) {
    await redis.decr(phoneDayKey);
    await redis.del(cooldownKey);
    throw new BadRequestError(
      "OTP limit exceeded for this phone number. Please try again tomorrow.",
    );
  }

  // Per-IP throttling is OFF by default. Behind a proxy/load balancer or with
  // mobile CGNAT, all clients can collapse to a single IP (the LB/nginx address
  // or one carrier gateway), which turns these per-IP checks into a broken
  // global limiter that blocks unrelated, legitimate users. Only enable this
  // once the real client IP is correctly propagated (X-Forwarded-For + trust
  // proxy). Per-phone limits, the global daily cap, and Twilio Fraud Guard
  // remain the actual abuse controls.
  let ipCount = null;
  let distinctPhones = null;
  if (cfg.ipLimitsEnabled) {
    const ipHourKey = `otp:count:ip:${ip}`;
    ipCount = await redis.incr(ipHourKey);
    if (ipCount === 1) {
      await redis.expire(ipHourKey, 60 * 60);
    }
    if (ipCount > cfg.ipMaxPerHour) {
      await redis.decr(phoneDayKey);
      await redis.del(cooldownKey);
      logger.warn("otp.protection.ip_hourly_limit", { ip, ipCount });
      throw new BadRequestError(
        "Too many verification attempts from this network. Please try again in an hour.",
      );
    }

    const ipPhonesKey = `otp:phones:ip:${ip}`;
    await redis.sadd(ipPhonesKey, normalizedPhone);
    distinctPhones = await redis.scard(ipPhonesKey);
    // Set the 1-hour TTL only when the window has no expiry yet, so the set
    // truly expires ~1h later instead of being refreshed on every call.
    if ((await redis.ttl(ipPhonesKey)) < 0) {
      await redis.expire(ipPhonesKey, 60 * 60);
    }
    if (distinctPhones > cfg.ipDistinctPhonesMax) {
      await redis.decr(phoneDayKey);
      await redis.del(cooldownKey);
      logger.warn("otp.protection.distinct_phone_flood", {
        ip,
        distinctPhones,
        phone: normalizedPhone,
      });
      throw new BadRequestError(
        "Too many verification attempts from this network. Please try again in an hour.",
      );
    }
  }

  const globalDayKey = "otp:count:global:daily";
  const globalCount = await redis.incr(globalDayKey);
  if (globalCount === 1) {
    await redis.expire(globalDayKey, secondsUntilUtcMidnight());
  }
  if (cfg.globalDailyMax > 0 && globalCount > cfg.globalDailyMax) {
    await redis.decr(phoneDayKey);
    await redis.decr(globalDayKey);
    await redis.del(cooldownKey);
    logger.error("otp.protection.global_daily_cap_reached", {
      globalCount,
      cap: cfg.globalDailyMax,
      phone: normalizedPhone,
      ip,
    });
    throw new BadRequestError(
      "Verification service is temporarily unavailable. Please try again later.",
    );
  }

  logger.info("otp.protection.allowed", {
    phone: normalizedPhone,
    ip,
    phoneCount,
    ipCount,
    distinctPhones,
    globalCount,
  });
}
