/**
 * Seed dumpster geographic pricing zones from the BINS APP market pricing V1 table.
 *
 * This data is ordinary configuration — not hardcoded product logic.
 * Additional states/markets/zones can be added via admin or further seed runs.
 *
 * Usage: node scripts/seed-dumpster-pricing-zones.js
 *        node scripts/seed-dumpster-pricing-zones.js --replace
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import config from "../src/config/env.js";
import DumpsterPricingZone from "../src/models/DumpsterPricingZone.js";
import { defaultIncludedTonsForSize } from "../src/utils/dumpsterZonePricing.js";

dotenv.config();

const replace = process.argv.includes("--replace");

/**
 * Yard size → catalog size key used by Dumbster model.
 * 10 YD → 10-12, 15 YD → 14-16, 20 YD → 18-20
 */
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
      // V1 editable defaults — Danish locks per-market values in admin
      overagePerTon,
      extraDay,
      providerPayout: null,
      binsAppFee: null,
    };
  });
}

/**
 * V1 market table: each cell is 1-Day / 3-Day / 7-Day.
 * Cities / counties / geo are matchers so nearby(lat,lng + address) can resolve a zone.
 */
const FLORIDA_MARKETS = [
  {
    market: "Orlando Metro",
    zone: "Orlando Metro",
    geo: { center: [-81.3792, 28.5383], radiusMiles: 45 },
    matchers: {
      cities: [
        "Orlando",
        "Winter Park",
        "Kissimmee",
        "Sanford",
        "Altamonte Springs",
        "Apopka",
        "Ocoee",
        "Winter Garden",
        "Clermont",
        "Oviedo",
        "Casselberry",
        "Maitland",
        "Lake Mary",
        "St. Cloud",
        "Saint Cloud",
      ],
      counties: ["Orange", "Seminole", "Osceola", "Lake"],
      zips: [],
      aliases: ["Orlando Metro", "Greater Orlando", "Central Florida Orlando"],
    },
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
    zone: "Tampa Bay",
    geo: { center: [-82.4572, 27.9506], radiusMiles: 45 },
    matchers: {
      cities: [
        "Tampa",
        "St. Petersburg",
        "Saint Petersburg",
        "Clearwater",
        "Brandon",
        "Largo",
        "Pinellas Park",
        "Wesley Chapel",
        "Riverview",
        "Temple Terrace",
        "Plant City",
        "Safety Harbor",
        "Dunedin",
      ],
      counties: ["Hillsborough", "Pinellas", "Pasco"],
      zips: [],
      aliases: ["Tampa Bay", "Tampa", "St Pete", "St. Pete"],
    },
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
    zone: "Jacksonville",
    geo: { center: [-81.6557, 30.3322], radiusMiles: 40 },
    matchers: {
      cities: [
        "Jacksonville",
        "Orange Park",
        "St. Augustine",
        "Saint Augustine",
        "Fleming Island",
        "Ponte Vedra",
        "Ponte Vedra Beach",
        "Jacksonville Beach",
        "Atlantic Beach",
        "Neptune Beach",
      ],
      counties: ["Duval", "Clay", "St. Johns", "Saint Johns"],
      zips: [],
      aliases: ["Jacksonville", "Jax", "Northeast Florida"],
    },
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
    zone: "Miami / Fort Lauderdale",
    geo: { center: [-80.1918, 25.7617], radiusMiles: 50 },
    matchers: {
      cities: [
        "Miami",
        "Fort Lauderdale",
        "Ft. Lauderdale",
        "Hollywood",
        "Hialeah",
        "Coral Gables",
        "Miami Beach",
        "Pembroke Pines",
        "Miramar",
        "Doral",
        "Aventura",
        "Homestead",
        "Florida City",
        "Davie",
        "Plantation",
        "Sunrise",
        "Pompano Beach",
        "Deerfield Beach",
        "Coral Springs",
      ],
      counties: ["Miami-Dade", "Broward"],
      zips: [],
      aliases: ["Miami", "Fort Lauderdale", "South Florida", "SoFlo"],
    },
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
    zone: "West Palm Beach",
    geo: { center: [-80.0534, 26.7153], radiusMiles: 40 },
    matchers: {
      cities: [
        "West Palm Beach",
        "Boca Raton",
        "Delray Beach",
        "Boynton Beach",
        "Jupiter",
        "Palm Beach Gardens",
        "Palm Beach",
        "Lake Worth",
        "Wellington",
        "Royal Palm Beach",
      ],
      counties: ["Palm Beach"],
      zips: [],
      aliases: ["West Palm Beach", "Palm Beach", "WPB"],
    },
    prices: {
      10: [350, 365, 375],
      15: [400, 410, 425],
      20: [470, 485, 499],
      30: [565, 580, 599],
      40: [655, 680, 699],
    },
  },
  {
    market: "Melbourne / Space Coast",
    zone: "Melbourne / Space Coast",
    geo: { center: [-80.6081, 28.0836], radiusMiles: 40 },
    matchers: {
      cities: [
        "Melbourne",
        "Palm Bay",
        "Cocoa",
        "Cocoa Beach",
        "Titusville",
        "Rockledge",
        "Merritt Island",
        "Viera",
        "Satellite Beach",
        "Indialantic",
      ],
      counties: ["Brevard"],
      zips: [],
      aliases: ["Melbourne", "Space Coast", "Brevard"],
    },
    prices: {
      10: [330, 340, 349],
      15: [375, 385, 399],
      20: [445, 460, 475],
      30: [540, 560, 575],
      40: [635, 655, 675],
    },
  },
  {
    market: "Daytona / Volusia",
    zone: "Daytona / Volusia",
    geo: { center: [-81.0228, 29.2108], radiusMiles: 40 },
    matchers: {
      cities: [
        "Daytona Beach",
        "Ormond Beach",
        "Port Orange",
        "Deltona",
        "New Smyrna Beach",
        "DeLand",
        "Deland",
        "Edgewater",
        "South Daytona",
      ],
      counties: ["Volusia"],
      zips: [],
      aliases: ["Daytona", "Daytona Beach", "Volusia"],
    },
    prices: {
      10: [375, 385, 399],
      15: [400, 410, 425],
      20: [515, 535, 549],
      30: [610, 630, 649],
      40: [730, 750, 775],
    },
  },
  {
    market: "Sarasota / Bradenton",
    zone: "Sarasota / Bradenton",
    geo: { center: [-82.5307, 27.3364], radiusMiles: 40 },
    matchers: {
      cities: [
        "Sarasota",
        "Bradenton",
        "Venice",
        "Lakewood Ranch",
        "Palmetto",
        "Siesta Key",
        "North Port",
        "Englewood",
      ],
      counties: ["Sarasota", "Manatee"],
      zips: [],
      aliases: ["Sarasota", "Bradenton", "Sarasota-Bradenton"],
    },
    prices: {
      10: [350, 365, 375],
      15: [400, 410, 425],
      20: [470, 485, 499],
      30: [565, 580, 599],
      40: [655, 680, 699],
    },
  },
  {
    market: "Fort Myers / Lee County",
    zone: "Fort Myers / Lee County",
    geo: { center: [-81.8723, 26.6406], radiusMiles: 40 },
    matchers: {
      cities: [
        "Fort Myers",
        "Ft. Myers",
        "Cape Coral",
        "Lehigh Acres",
        "Estero",
        "Bonita Springs",
        "Sanibel",
        "Fort Myers Beach",
      ],
      counties: ["Lee"],
      zips: [],
      aliases: ["Fort Myers", "Lee County", "Cape Coral"],
    },
    prices: {
      10: [375, 385, 399],
      15: [420, 435, 449],
      20: [470, 485, 499],
      30: [540, 560, 575],
      40: [635, 655, 675],
    },
  },
  {
    market: "Naples / Collier County",
    zone: "Naples / Collier County",
    geo: { center: [-81.7948, 26.142], radiusMiles: 35 },
    matchers: {
      cities: [
        "Naples",
        "Marco Island",
        "Immokalee",
        "Golden Gate",
        "East Naples",
        "North Naples",
      ],
      counties: ["Collier"],
      zips: [],
      aliases: ["Naples", "Collier County", "Collier"],
    },
    prices: {
      10: [400, 410, 425],
      15: [445, 460, 475],
      20: [495, 510, 525],
      30: [565, 580, 599],
      40: [655, 680, 699],
    },
  },
  {
    market: "Lakeland / Polk County",
    zone: "Lakeland / Polk County",
    geo: { center: [-81.9498, 28.0395], radiusMiles: 35 },
    matchers: {
      cities: [
        "Lakeland",
        "Winter Haven",
        "Bartow",
        "Auburndale",
        "Haines City",
        "Lake Wales",
        "Davenport",
        "Polk City",
      ],
      counties: ["Polk"],
      zips: [],
      aliases: ["Lakeland", "Polk County", "Polk"],
    },
    prices: {
      10: [330, 340, 349],
      15: [375, 385, 399],
      20: [420, 435, 449],
      30: [540, 560, 575],
      40: [635, 655, 675],
    },
  },
];

function toZoneDoc(marketDef) {
  const [lng, lat] = marketDef.geo.center;
  return {
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
      // Per-market lockable defaults (edit in admin anytime)
      overagePerTon: marketDef.overagePerTon ?? 85,
      extraDay: marketDef.extraDay ?? 50,
    }),
    status: "active",
  };
}

async function seed() {
  const uri = config.get("mongodb");
  await mongoose.connect(uri);
  console.log("Connected to MongoDB");

  if (replace) {
    const deleted = await DumpsterPricingZone.deleteMany({
      stateCode: "FL",
      state: "Florida",
    });
    console.log(`Removed ${deleted.deletedCount} existing Florida pricing zones`);
  }

  let created = 0;
  let updated = 0;

  for (const marketDef of FLORIDA_MARKETS) {
    const doc = toZoneDoc(marketDef);
    const existing = await DumpsterPricingZone.findOne({
      state: doc.state,
      market: doc.market,
      zone: doc.zone,
    });

    if (existing) {
      await DumpsterPricingZone.findByIdAndUpdate(existing._id, {
        $set: doc,
        $unset: { matchers: 1 },
      });
      updated += 1;
      console.log(`Updated: ${doc.market}`);
    } else {
      await DumpsterPricingZone.create(doc);
      created += 1;
      console.log(`Created: ${doc.market}`);
    }
  }

  console.log(`Done. created=${created} updated=${updated}`);
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
