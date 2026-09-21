/**
 * Clear OTP protection state from Redis (blocks, per-IP/per-phone counters,
 * cooldowns). Use this to instantly unblock a user who is wrongly rate-limited.
 *
 * Usage:
 *   node scripts/clear-otp-blocks.js --all                 # dry run, all otp:* keys
 *   node scripts/clear-otp-blocks.js --all --apply         # delete all otp:* keys
 *   node scripts/clear-otp-blocks.js --phone +19895780202 --apply
 *   node scripts/clear-otp-blocks.js --ip 1.2.3.4 --apply
 *   node scripts/clear-otp-blocks.js --blocks --apply      # only otp:block:ip:* keys
 *
 * Requires REDIS_URL in the environment (.env).
 */
import "dotenv/config";
import Redis from "ioredis";

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const ALL = argv.includes("--all");
const BLOCKS_ONLY = argv.includes("--blocks");
const getVal = (flag) => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : null;
};
const PHONE = getVal("--phone");
const IP = getVal("--ip");

function patterns() {
  if (BLOCKS_ONLY) return ["otp:block:ip:*"];
  if (PHONE) {
    return [
      `otp:cooldown:phone:${PHONE}`,
      `otp:count:phone:${PHONE}`,
    ];
  }
  if (IP) {
    return [
      `otp:block:ip:${IP}`,
      `otp:count:ip:${IP}`,
      `otp:phones:ip:${IP}`,
    ];
  }
  if (ALL) return ["otp:*"];
  return [];
}

async function scanKeys(redis, pattern) {
  // Exact key (no glob) — check existence directly.
  if (!pattern.includes("*")) {
    const exists = await redis.exists(pattern);
    return exists ? [pattern] : [];
  }
  const found = [];
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 500);
    cursor = next;
    found.push(...keys);
  } while (cursor !== "0");
  return found;
}

async function main() {
  const pats = patterns();
  if (pats.length === 0) {
    console.error(
      "Specify a target: --all | --blocks | --phone <e164> | --ip <ip>. Add --apply to delete.",
    );
    process.exit(1);
  }
  if (!process.env.REDIS_URL) {
    console.error("REDIS_URL is not set in the environment (.env).");
    process.exit(1);
  }

  const url = new URL(process.env.REDIS_URL);
  const redis = new Redis(process.env.REDIS_URL, {
    tls: url.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: 3,
  });

  const allKeys = new Set();
  for (const pat of pats) {
    const keys = await scanKeys(redis, pat);
    keys.forEach((k) => allKeys.add(k));
  }
  const keys = [...allKeys];

  console.log(`${APPLY ? "APPLY" : "DRY RUN"} — patterns: ${pats.join(", ")}`);
  console.log(`Matched ${keys.length} key(s):`);
  for (const k of keys) {
    const ttl = await redis.ttl(k);
    console.log(`  ${k} (ttl=${ttl}s)`);
  }

  if (APPLY && keys.length > 0) {
    const removed = await redis.del(...keys);
    console.log(`Deleted ${removed} key(s).`);
  } else if (!APPLY) {
    console.log("Re-run with --apply to delete these keys.");
  }

  await redis.quit();
}

main().catch(async (err) => {
  console.error("clear-otp-blocks failed:", err);
  process.exit(1);
});
