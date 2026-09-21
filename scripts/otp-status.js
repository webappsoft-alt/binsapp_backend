/**
 * Inspect (and optionally reset) the OTP rate-limit state for a phone number.
 *
 * IMPORTANT: run this ON THE SERVER, where REDIS_URL points to the production
 * Redis the app actually uses. Running it from a laptop will hit whatever Redis
 * your local .env points to (often a different instance).
 *
 * All OTP limits are Redis-backed (otpProtection), so this script can read and
 * clear them per number — unlike the old in-memory express limiter.
 *
 * Usage:
 *   node scripts/otp-status.js --list                  # list every number with usage + blocked flag
 *   node scripts/otp-status.js +19895780202            # show status for one number (read-only)
 *   node scripts/otp-status.js +19895780202 --reset    # clear this number's limits
 */
import "dotenv/config";
import Redis from "ioredis";
import config from "../src/config/env.js";
import { normalizePhone } from "../src/utils/phone.js";

const argv = process.argv.slice(2);
const RESET = argv.includes("--reset");
const LIST = argv.includes("--list");
const rawPhone = argv.find((a) => !a.startsWith("--"));

function fmtTtl(ttl) {
  if (ttl === -2) return "no key";
  if (ttl === -1) return "no expiry";
  if (ttl < 60) return `${ttl}s`;
  if (ttl < 3600) return `${Math.round(ttl / 60)}m`;
  return `${(ttl / 3600).toFixed(1)}h`;
}

async function scanKeys(redis, pattern) {
  const found = [];
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 500);
    cursor = next;
    found.push(...keys);
  } while (cursor !== "0");
  return found;
}

function newRedis() {
  const url = new URL(process.env.REDIS_URL);
  return {
    redis: new Redis(process.env.REDIS_URL, {
      tls: url.protocol === "rediss:" ? {} : undefined,
      maxRetriesPerRequest: 3,
    }),
    url,
  };
}

async function listAll() {
  const cfg = config.get("otpProtection");
  const { redis, url } = newRedis();
  console.log(`Redis: ${url.hostname}:${url.port}\n`);

  const countKeys = await scanKeys(redis, "otp:count:phone:*");
  const cooldownKeys = await scanKeys(redis, "otp:cooldown:phone:*");

  const phones = new Set();
  countKeys.forEach((k) => phones.add(k.replace("otp:count:phone:", "")));
  cooldownKeys.forEach((k) => phones.add(k.replace("otp:cooldown:phone:", "")));

  if (phones.size === 0) {
    console.log("No per-number OTP state in Redis (nobody is rate-limited).");
    await redis.quit();
    return;
  }

  const rows = [];
  for (const phone of phones) {
    const [count, cooldownTtl, dayTtl] = await Promise.all([
      redis.get(`otp:count:phone:${phone}`),
      redis.ttl(`otp:cooldown:phone:${phone}`),
      redis.ttl(`otp:count:phone:${phone}`),
    ]);
    const used = parseInt(count || "0", 10);
    const blocked =
      used >= cfg.phoneMaxPerDay || cooldownTtl > 0;
    rows.push({ phone, used, cap: cfg.phoneMaxPerDay, cooldownTtl, dayTtl, blocked });
  }

  rows.sort((a, b) => Number(b.blocked) - Number(a.blocked) || b.used - a.used);

  console.log(`=== ${rows.length} number(s) with OTP state ===`);
  for (const r of rows) {
    console.log(
      `${r.blocked ? "🔴 BLOCKED" : "🟢 ok     "}  ${r.phone.padEnd(16)}  ` +
        `today ${r.used}/${r.cap} (resets ${fmtTtl(r.dayTtl)})  ` +
        `cooldown ${r.cooldownTtl > 0 ? fmtTtl(r.cooldownTtl) : "-"}`,
    );
  }
  const blockedCount = rows.filter((r) => r.blocked).length;
  console.log(
    `\n${blockedCount} blocked. Reset one with: node scripts/otp-status.js <phone> --reset`,
  );
  await redis.quit();
}

async function main() {
  if (!process.env.REDIS_URL) {
    console.error("REDIS_URL is not set. Run this on the server (or set REDIS_URL).");
    process.exit(1);
  }

  if (LIST) {
    return listAll();
  }

  if (!rawPhone) {
    console.error("Provide a phone number, e.g. node scripts/otp-status.js +19895780202 [--reset]");
    process.exit(1);
  }
  if (!process.env.REDIS_URL) {
    console.error("REDIS_URL is not set. Run this on the server (or set REDIS_URL).");
    process.exit(1);
  }

  const phone = normalizePhone(rawPhone) || rawPhone;
  const cfg = config.get("otpProtection");

  const url = new URL(process.env.REDIS_URL);
  const redis = new Redis(process.env.REDIS_URL, {
    tls: url.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: 3,
  });
  console.log(`Redis: ${url.hostname}:${url.port}`);
  console.log(`Phone (normalized): ${phone}\n`);

  const cooldownKey = `otp:cooldown:phone:${phone}`;
  const phoneDayKey = `otp:count:phone:${phone}`;
  const globalDayKey = "otp:count:global:daily";

  const [cooldownTtl, dayCount, dayTtl, globalCount] = await Promise.all([
    redis.ttl(cooldownKey),
    redis.get(phoneDayKey),
    redis.ttl(phoneDayKey),
    redis.get(globalDayKey),
  ]);

  const dayUsed = parseInt(dayCount || "0", 10);
  const globalUsed = parseInt(globalCount || "0", 10);

  console.log("=== STATUS ===");
  console.log(
    `Cooldown (min ${cfg.phoneCooldownSec}s between sends): ${
      cooldownTtl > 0 ? `ACTIVE, ${fmtTtl(cooldownTtl)} left` : "clear"
    }`,
  );
  console.log(
    `Per-number today: ${dayUsed} / ${cfg.phoneMaxPerDay} sends (resets in ${fmtTtl(dayTtl)})`,
  );
  console.log(
    `Global today: ${globalUsed} / ${cfg.globalDailyMax} sends`,
  );
  console.log(`Per-IP limits enabled: ${cfg.ipLimitsEnabled}`);

  // Verdict
  const reasons = [];
  if (cooldownTtl > 0)
    reasons.push(`cooldown active (${fmtTtl(cooldownTtl)} left)`);
  if (dayUsed >= cfg.phoneMaxPerDay)
    reasons.push(`daily cap reached (${dayUsed}/${cfg.phoneMaxPerDay})`);
  if (cfg.globalDailyMax > 0 && globalUsed >= cfg.globalDailyMax)
    reasons.push(`global daily cap reached`);

  console.log(
    `\nVERDICT: ${reasons.length ? "BLOCKED — " + reasons.join("; ") : "CLEAR — this number can request an OTP now"}`,
  );

  if (RESET) {
    const removed = await redis.del(cooldownKey, phoneDayKey);
    console.log(`\n--reset applied: cleared ${removed} key(s) for ${phone}.`);
    console.log("This number can request an OTP immediately now.");
  } else {
    console.log("\n(Read-only. Add --reset to clear this number's limits.)");
  }

  await redis.quit();
}

main().catch(async (err) => {
  console.error("otp-status failed:", err);
  process.exit(1);
});
