/**
 * Insert-only: add Florida Market Pricing zones if missing.
 * Does NOT delete or overwrite existing zones. Does NOT touch other collections.
 *
 * Usage: node scripts/seed-florida-markets-insert-only.js
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import config from "../src/config/env.js";
import DumpsterPricingZone from "../src/models/DumpsterPricingZone.js";
import { defaultIncludedTonsForSize } from "../src/utils/dumpsterZonePricing.js";

dotenv.config();

const YARD_TO_CATALOG = {
  10: { size: "10-12", sizeLabel: "10 YD" },
  15: { size: "14-16", sizeLabel: "15 YD" },
  20: { size: "18-20", sizeLabel: "20 YD" },
  30: { size: "30", sizeLabel: "30 YD" },
  40: { size: "40", sizeLabel: "40 YD" },
};

function buildRates(priceMap, { overagePerTon = 85, extraDay = 50 } = {}) {
  return Object.entries(priceMap).map(([yard, [one, three, seven]]) => {
    const meta = YARD_TO_CATALOG[Number(yard)];
    return {
      size: meta.size,
      sizeLabel: meta.sizeLabel,
      materialType: "standard",
      oneDayPrice: one,
      threeDayPrice: three,
      sevenDayPrice: seven,
      includedTons: defaultIncludedTonsForSize(meta.size),
      overagePerTon,
      extraDay,
      providerPayout: null,
      binsAppFee: null,
    };
  });
}

/** Florida V1 markets — same data as seed-dumpster-pricing-zones.js */
const FLORIDA_MARKETS = [
  {
    market: "Orlando Metro",
    geo: { center: [-81.3792, 28.5383], radiusMiles: 45 },
    prices: {
      10: [375, 385, 399],
      15: [400, 410, 425],
      20: [470, 485, 499],
      30: [565, 580, 599],
      40: [655, 680, 699],
    },
  },
  {
    market: "Tampa Bay",
    geo: { center: [-82.4572, 27.9506], radiusMiles: 40 },
    prices: {
      10: [330, 340, 349],
      15: [375, 385, 399],
      20: [470, 485, 499],
      30: [540, 560, 575],
      40: [680, 705, 725],
    },
  },
  {
    market: "Jacksonville",
    geo: { center: [-81.6557, 30.3322], radiusMiles: 40 },
    prices: {
      10: [350, 365, 375],
      15: [400, 410, 425],
      20: [470, 485, 499],
      30: [540, 560, 575],
      40: [635, 655, 675],
    },
  },
  {
    market: "Miami / Fort Lauderdale",
    geo: { center: [-80.1918, 25.7617], radiusMiles: 45 },
    prices: {
      10: [400, 410, 425],
      15: [445, 460, 475],
      20: [515, 535, 549],
      30: [610, 630, 649],
      40: [705, 725, 749],
    },
  },
  {
    market: "West Palm Beach",
    geo: { center: [-80.0534, 26.7153], radiusMiles: 35 },
    prices: {
      10: [350, 365, 375],
      15: [400, 410, 425],
      20: [470, 485, 499],
      30: [565, 580, 599],
      40: [655, 680, 699],
    },
  },
  {
    market: "Fort Myers / Naples",
    geo: { center: [-81.8723, 26.6406], radiusMiles: 40 },
    prices: {
      10: [350, 365, 375],
      15: [400, 410, 425],
      20: [470, 485, 499],
      30: [540, 560, 575],
      40: [635, 655, 675],
    },
  },
  {
    market: "Sarasota / Bradenton",
    geo: { center: [-82.5307, 27.3364], radiusMiles: 35 },
    prices: {
      10: [350, 365, 375],
      15: [400, 410, 425],
      20: [470, 485, 499],
      30: [540, 560, 575],
      40: [655, 680, 699],
    },
  },
  {
    market: "Gainesville",
    geo: { center: [-82.3248, 29.6516], radiusMiles: 30 },
    prices: {
      10: [330, 340, 349],
      15: [375, 385, 399],
      20: [445, 460, 475],
      30: [540, 560, 575],
      40: [635, 655, 675],
    },
  },
  {
    market: "Daytona / Deltona",
    geo: { center: [-81.0228, 29.2108], radiusMiles: 35 },
    prices: {
      10: [350, 365, 375],
      15: [400, 410, 425],
      20: [470, 485, 499],
      30: [565, 580, 599],
      40: [655, 680, 699],
    },
  },
  {
    market: "Melbourne / Palm Bay",
    geo: { center: [-80.6081, 28.0836], radiusMiles: 35 },
    prices: {
      10: [350, 365, 375],
      15: [400, 410, 425],
      20: [470, 485, 499],
      30: [565, 580, 599],
      40: [655, 680, 699],
    },
  },
  {
    market: "Pensacola / Destin",
    geo: { center: [-87.2169, 30.4213], radiusMiles: 45 },
    prices: {
      10: [330, 340, 349],
      15: [375, 385, 399],
      20: [445, 460, 475],
      30: [540, 560, 575],
      40: [635, 655, 675],
    },
  },
];

async function main() {
  const uri = config.get("mongodb");
  if (!uri) {
    console.error("mongodb URI missing");
    process.exit(1);
  }

  // Mask credentials in log
  const masked = String(uri).replace(/:\/\/([^:]+):([^@]+)@/, "://$1:***@");
  console.log("Connecting:", masked.slice(0, 80) + "…");

  await mongoose.connect(uri);
  console.log("Connected. Insert-only Florida market pricing (no deletes, no overwrites).");

  let created = 0;
  let skipped = 0;

  for (const marketDef of FLORIDA_MARKETS) {
    const existing = await DumpsterPricingZone.findOne({
      state: "Florida",
      market: marketDef.market,
      isGlobal: { $ne: true },
    }).lean();

    if (existing) {
      skipped += 1;
      console.log(`Skip (exists): ${marketDef.market}`);
      continue;
    }

    const [lng, lat] = marketDef.geo.center;
    await DumpsterPricingZone.create({
      state: "Florida",
      stateCode: "FL",
      market: marketDef.market,
      zone: marketDef.market,
      description: `BINS APP Florida Market Pricing V1 — ${marketDef.market}`,
      geo: {
        center: { type: "Point", coordinates: [lng, lat] },
        radiusMiles: marketDef.geo.radiusMiles,
      },
      rates: buildRates(marketDef.prices, {
        overagePerTon: marketDef.overagePerTon ?? 85,
        extraDay: marketDef.extraDay ?? 50,
      }),
      status: "active",
      isGlobal: false,
    });
    created += 1;
    console.log(`Created: ${marketDef.market}`);
  }

  // Ensure single Global Rate row exists (non-destructive)
  const globalExists = await DumpsterPricingZone.findOne({ isGlobal: true }).lean();
  if (!globalExists) {
    const orlando = FLORIDA_MARKETS[0];
    await DumpsterPricingZone.create({
      state: "Global",
      stateCode: "",
      market: "Global Rate",
      zone: "Global Rate",
      description: "Platform-wide fallback when no geo market matches",
      isGlobal: true,
      rates: buildRates(orlando.prices, { overagePerTon: 85, extraDay: 50 }),
      status: "active",
    });
    created += 1;
    console.log("Created: Global Rate");
  } else {
    skipped += 1;
    console.log("Skip (exists): Global Rate");
  }

  console.log(`\nDone. created=${created} skipped=${skipped}`);
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
