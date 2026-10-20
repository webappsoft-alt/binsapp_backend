import { normalizePhone, phoneLookupVariants } from "./phone.js";

/**
 * Test numbers that skip Twilio send/verify (fixed OTP 1234).
 * Includes +923117384180 (03117384180) and +923394013218 (03394013218).
 */
export const STATIC_OTP_PHONES = new Set([
  "+923403538631",
  "+923240044897",
  "+923164128898",
  "+923117384180",
  "+923394013218",
  "+1234567890",
  "+923003388990",
  "+923003388991",
  "+13123654789",
  "+923270060485",
  "+923240044896",
  "+923240044895",
  "+923240044894",
  "+923240044893",
  "+923240044892",
  "+923240044891",
  "+923240044890",
  "+923240044889",
  "+923240044888",
  "+923186159112",
  "+923022070825",
  "+923001234567",
  "+923132748554",
  "+923131748554",
  "+923467893622",
  "+923703839371",
  "+923230752769",
  "+923390126756",
  "+13105550115",
  "+13105550116",
  "+13123987457",
  "+13123987456"
]);

export function isStaticOtpPhone(phone) {
  if (!phone) return false;
  const raw = String(phone).trim();
  const normalized = normalizePhone(phone);
  if (STATIC_OTP_PHONES.has(normalized)) {
    return true;
  }
  const variants = new Set([
    raw,
    normalized,
    ...phoneLookupVariants(phone),
    ...phoneLookupVariants(normalized),
  ]);
  for (const variant of variants) {
    const v = normalizePhone(variant);
    if (v && STATIC_OTP_PHONES.has(v)) {
      return true;
    }
  }
  return false;
}

/** Skip Redis / express rate limits for static test numbers. */
export function shouldSkipOtpLimits(phone) {
  return isStaticOtpPhone(phone);
}
