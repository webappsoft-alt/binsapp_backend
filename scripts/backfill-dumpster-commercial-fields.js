/**
 * Backfill dumpster company_* commercial fields from Commercial Global Pricing
 * (and fill 14/30 + toggles from existing company 3/7 when global card is empty).
 *
 * Usage: node scripts/backfill-dumpster-commercial-fields.js
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import config from "../src/config/env.js";
import Dumbster from "../src/models/Dumbster.js";
import {
  commercialSizeToDumbsterSizes,
  ensureGlobalCommercialPricing,
  deriveExtendedPackagePrices,
  normalizeCommercialSize,
} from "../src/utils/commercialPricing.js";

dotenv.config();

const COMMERCIAL_TO_CATALOG = {
  "10": ["10-12"],
  "15": ["14-16"],
  "20": ["18-20"],
  "30": ["30"],
  "40": ["40"],
};

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function numOrNull(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function main() {
  const uri = config.get("mongodb");
  if (!uri) {
    console.error("mongodb URI missing in config");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("Connected to MongoDB");

  const globalDoc = await ensureGlobalCommercialPricing();
  const rateCards = globalDoc?.rateCards || [];
  const negotiated = globalDoc?.negotiatedRotationTerms || {};

  console.log(`Global commercial rate cards: ${rateCards.length}`);
  console.log(`Negotiated enabled: ${Boolean(negotiated.enabled)}`);

  let updated = 0;
  let skipped = 0;

  for (const size of ["10", "15", "20", "30", "40"]) {
    const card =
      rateCards.find((c) => normalizeCommercialSize(c.size) === size) || null;
    const sizeNeg =
      (negotiated.sizes || []).find(
        (s) => normalizeCommercialSize(s.size) === size,
      ) || null;

    const catalogSizes =
      COMMERCIAL_TO_CATALOG[size] || commercialSizeToDumbsterSizes(size);

    const dumpsters = await Dumbster.find({
      size: { $in: catalogSizes },
    });

    if (!dumpsters.length) {
      console.log(`  ${size}yd → no dumpsters for ${catalogSizes.join(",")}`);
      continue;
    }

    for (const d of dumpsters) {
      const three =
        num(card?.threeDayPrice) ||
        num(d.company_three_days_price) ||
        num(d.three_days_price);
      const seven =
        num(card?.sevenDayPrice) ||
        num(d.company_seven_days_price) ||
        num(d.seven_days_price);
      const derived = deriveExtendedPackagePrices(three, seven);

      const fourteen =
        num(card?.fourteenDayPrice) ||
        num(d.company_fourteen_days_price) ||
        derived.fourteenDayPrice;
      const thirty =
        num(card?.thirtyDayPrice) ||
        num(d.company_thirty_days_price) ||
        derived.thirtyDayPrice;

      const perDiem =
        num(card?.perDiemRate) ||
        num(d.company_per_dim_rate) ||
        num(d.company_day_price_km) ||
        num(d.per_dim_rate);

      const includedTons =
        num(card?.includedTons) || num(d.tons);
      const overagePerTon =
        num(card?.overagePerTon) || num(d.overagePerTon);

      const $set = {
        company_three_days_price:
          num(d.company_three_days_price) || three,
        company_seven_days_price:
          num(d.company_seven_days_price) || seven,
        company_fourteen_days_price: fourteen,
        company_thirty_days_price: thirty,
        company_enable_fourteen_day:
          card?.enableFourteenDay != null
            ? Boolean(card.enableFourteenDay)
            : Boolean(d.company_enable_fourteen_day) || derived.enableFourteenDay,
        company_enable_thirty_day:
          card?.enableThirtyDay != null
            ? Boolean(card.enableThirtyDay)
            : Boolean(d.company_enable_thirty_day) || derived.enableThirtyDay,
        company_overage_enforced:
          card?.overageEnforced != null
            ? Boolean(card.overageEnforced)
            : d.company_overage_enforced !== false,
        company_per_dim_rate: perDiem,
        updatedAt: new Date(),
      };

      // Prefer commercial base price from 3-day if company_price empty
      if (!num(d.company_price) && three > 0) {
        $set.company_price = Math.round(three / 1.2) || three;
      }

      if (includedTons > 0 && !num(d.tons)) {
        $set.tons = includedTons;
      }
      if (overagePerTon > 0 && !num(d.overagePerTon)) {
        $set.overagePerTon = overagePerTon;
      }

      // Negotiated for this size (from global commercial config)
      if (negotiated.enabled || d.company_negotiated_enabled) {
        $set.company_negotiated_enabled = Boolean(
          negotiated.enabled || d.company_negotiated_enabled,
        );
        if (negotiated.includedDaysPerRotation != null) {
          $set.company_included_days_per_rotation = numOrNull(
            negotiated.includedDaysPerRotation,
          );
        }
        if (negotiated.includedTonsPerRotation != null) {
          $set.company_included_tons_per_rotation = numOrNull(
            negotiated.includedTonsPerRotation,
          );
        }
        if (negotiated.overagePerTon != null) {
          $set.company_negotiated_overage_per_ton = numOrNull(
            negotiated.overagePerTon,
          );
        }
        if (negotiated.extraDay != null) {
          $set.company_negotiated_extra_day = numOrNull(negotiated.extraDay);
        }
        if (sizeNeg) {
          if (sizeNeg.initialDelivery != null) {
            $set.company_initial_delivery = numOrNull(sizeNeg.initialDelivery);
          }
          if (sizeNeg.emptyAndRedeliver != null) {
            $set.company_empty_and_redeliver = numOrNull(
              sizeNeg.emptyAndRedeliver,
            );
          }
        }
      }

      await Dumbster.updateOne({ _id: d._id }, { $set });
      updated += 1;
      console.log(
        `  ✓ ${d.size} (${d._id}) → 3d=${$set.company_three_days_price} 7d=${$set.company_seven_days_price} 14d=${fourteen} 30d=${thirty}`,
      );
    }
  }

  // Also fill dumpsters that have company 3/7 but no matching commercial size card path
  // (e.g. 6-8) — derive 14/30 only if company prices exist
  const leftovers = await Dumbster.find({
    size: { $nin: ["10-12", "14-16", "18-20", "30", "40"] },
    $or: [
      { company_three_days_price: { $gt: 0 } },
      { company_seven_days_price: { $gt: 0 } },
      { company_price: { $gt: 0 } },
    ],
  });

  for (const d of leftovers) {
    if (
      num(d.company_fourteen_days_price) > 0 ||
      num(d.company_thirty_days_price) > 0
    ) {
      skipped += 1;
      continue;
    }
    const three = num(d.company_three_days_price);
    const seven = num(d.company_seven_days_price);
    if (!three && !seven) {
      skipped += 1;
      continue;
    }
    const derived = deriveExtendedPackagePrices(three, seven);
    await Dumbster.updateOne(
      { _id: d._id },
      {
        $set: {
          company_fourteen_days_price: derived.fourteenDayPrice,
          company_thirty_days_price: derived.thirtyDayPrice,
          company_enable_fourteen_day: derived.enableFourteenDay,
          company_enable_thirty_day: derived.enableThirtyDay,
          company_overage_enforced:
            d.company_overage_enforced !== false,
          updatedAt: new Date(),
        },
      },
    );
    updated += 1;
    console.log(`  ✓ leftover ${d.size} (${d._id}) derived 14/30`);
  }

  console.log(`\nDone. Updated=${updated}, skipped=${skipped}`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
