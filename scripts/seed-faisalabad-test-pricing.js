/**
 * One-off: seed Faisalabad (Punjab) test market — all rates $30.
 * Usage: node scripts/seed-faisalabad-test-pricing.js
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import config from "../src/config/env.js";
import DumpsterPricingZone from "../src/models/DumpsterPricingZone.js";

dotenv.config();

const rates = [
  { size: "10-12", sizeLabel: "10 YD", includedTons: 1 },
  { size: "14-16", sizeLabel: "15 YD", includedTons: 1.5 },
  { size: "18-20", sizeLabel: "20 YD", includedTons: 2 },
  { size: "30", sizeLabel: "30 YD", includedTons: 3 },
  { size: "40", sizeLabel: "40 YD", includedTons: 4 },
].map((p) => ({
  ...p,
  materialType: "standard",
  oneDayPrice: 30,
  threeDayPrice: 30,
  sevenDayPrice: 30,
  overagePerTon: 30,
  extraDay: 30,
  providerPayout: null,
  binsAppFee: null,
}));

const doc = {
  state: "Punjab",
  stateCode: "PB",
  market: "Faisalabad",
  zone: "Faisalabad",
  description: "Test market — all rates $30",
  geo: {
    center: { type: "Point", coordinates: [73.1003265, 31.4005569] },
    radiusMiles: 40,
  },
  rates,
  status: "active",
};

async function main() {
  await mongoose.connect(config.get("mongodb"));
  const existing = await DumpsterPricingZone.findOne({
    state: "Punjab",
    market: "Faisalabad",
  });

  if (existing) {
    await DumpsterPricingZone.findByIdAndUpdate(existing._id, {
      $set: doc,
      $unset: { matchers: 1 },
    });
    console.log("Updated Faisalabad test rates");
  } else {
    await DumpsterPricingZone.create(doc);
    console.log("Created Faisalabad test rates");
  }

  const saved = await DumpsterPricingZone.findOne({
    market: "Faisalabad",
  }).lean();
  console.log(
    JSON.stringify(
      {
        _id: saved._id,
        state: saved.state,
        market: saved.market,
        geo: saved.geo,
        rates: saved.rates.map((r) => ({
          size: r.size,
          one: r.oneDayPrice,
          three: r.threeDayPrice,
          seven: r.sevenDayPrice,
        })),
      },
      null,
      2,
    ),
  );

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
