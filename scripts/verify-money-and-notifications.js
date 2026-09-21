import "dotenv/config";
import {
  computeSplit,
  getAddonFees,
  DRIVEWAY_PROTECTION_FEE,
  INSURANCE_PROTECTION_FEE,
} from "../src/utils/paymentHold.js";
import orderMessages from "../src/utils/orderMessages.js";

let failures = 0;
const assert = (cond, msg) => {
  if (!cond) {
    failures += 1;
    console.log("   FAIL:", msg);
  } else {
    console.log("   ok  :", msg);
  }
};

console.log("=== ADD-ON FEES ===");
console.log(`  Driveway protection: $${DRIVEWAY_PROTECTION_FEE}`);
console.log(`  Insurance protection: $${INSURANCE_PROTECTION_FEE}`);

console.log("\n=== PAYMENT SPLIT CALCULATIONS ===");
const scenarios = [
  { price: 550, driveaway: false, cancelation: false },
  { price: 550, driveaway: true, cancelation: false },
  { price: 550, driveaway: false, cancelation: true },
  { price: 550, driveaway: true, cancelation: true },
  { price: 300, driveaway: true, cancelation: true },
];

for (const s of scenarios) {
  const { amount, privacyAmount, platformFee } = computeSplit(s.price, s);
  const adminTotal = privacyAmount + platformFee;
  const expectedAddon =
    (s.driveaway ? DRIVEWAY_PROTECTION_FEE : 0) +
    (s.cancelation ? INSURANCE_PROTECTION_FEE : 0);
  console.log(
    `\nPrice $${s.price} | driveway=${s.driveaway} insurance=${s.cancelation}`,
  );
  console.log(`  add-ons (100% admin):   $${privacyAmount.toFixed(2)}`);
  console.log(`  base (price - add-ons): $${(s.price - privacyAmount).toFixed(2)}`);
  console.log(`  OWNER payout (85% base):$${amount.toFixed(2)}`);
  console.log(`  platform fee (15% base):$${platformFee.toFixed(2)}`);
  console.log(`  ADMIN total:            $${adminTotal.toFixed(2)}`);
  console.log(`  owner + admin = $${(amount + adminTotal).toFixed(2)} (want $${s.price})`);
  assert(getAddonFees(s) === expectedAddon, `add-ons == $${expectedAddon}`);
  assert(
    Math.abs(amount + adminTotal - s.price) < 0.001,
    "owner + admin == price (money conserved)",
  );
  assert(
    Math.abs(amount - (s.price - expectedAddon) * 0.85) < 0.001,
    "owner == base * 0.85",
  );
}

console.log("\n\n=== NOTIFICATION COPY (Dumbster order #TEST12) ===");
const ctx = {
  customerName: "Alice(customer)",
  providerName: "Bob(owner)",
  serviceType: "Dumbster",
  order: { orderNumber: "TEST12" },
  size: "20-yard",
  refunded: true,
  reason: "Damaged photos",
  dailyRate: 25,
  dayprice: 25,
  extra: 50,
  extendedDays: 2,
  extendedPrice: 100,
  newEndDate: "Jul 25, 2026",
  rate: 25,
};

const show = (name, copy) => {
  console.log(`\n--- ${name} ---`);
  if (copy.timelineMessage) console.log(`   timeline: ${copy.timelineMessage}`);
  if (copy.customer)
    console.log(`   -> CUSTOMER: [${copy.customer.title}] ${copy.customer.description}`);
  if (copy.operator)
    console.log(`   -> OWNER:    [${copy.operator.title}] ${copy.operator.description}`);
  if (copy.admin)
    console.log(`   -> ADMIN:    [${copy.admin.title}] ${copy.admin.description}`);
};

const events = [
  "requestCreated",
  "dispatchWave",
  "providerMatched",
  "opportunityMissed",
  "proofSubmitted",
  "proofAccepted",
  "proofRejected",
  "dropoff",
  "orderCompleted",
  "cancelRequested",
  "cancellationApproved",
  "cancellationRejected",
  "preMatchCancelled",
  "readyForPickup",
  "requestExpired",
  "rentalEndingSoon",
  "overdueDailyCharge",
  "orderExtended",
];
for (const e of events) {
  if (typeof orderMessages[e] === "function") show(e, orderMessages[e](ctx));
}

console.log("\n\n=== ROLE-CORRECTNESS ASSERTIONS ===");
// Owner-only phrasings that must never appear in a CUSTOMER message.
const ownerPhrases = [
  "you claimed",
  "you completed",
  "your payout",
  "payout is processing",
  "your cancellation request",
  "accept to claim",
  "another provider",
];
// Customer-only phrasings that must never appear in an OWNER message.
const customerPhrases = ["your payment has been refunded", "please review"];

for (const e of events) {
  if (typeof orderMessages[e] !== "function") continue;
  const c = orderMessages[e](ctx);
  if (c.customer) {
    const t = c.customer.description.toLowerCase();
    assert(
      !ownerPhrases.some((p) => t.includes(p)),
      `${e}.customer has no owner-only phrasing`,
    );
  }
  if (c.operator) {
    const t = c.operator.description.toLowerCase();
    assert(
      !customerPhrases.some((p) => t.includes(p)),
      `${e}.operator has no customer-only phrasing`,
    );
  }
}

console.log(
  `\n\n${failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED"}`,
);
process.exit(failures === 0 ? 0 : 1);
