/**
 * Seed the default global Tree Removal pricing configuration.
 * Usage: node scripts/seed-tree-removal-pricing.js
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import config from "../src/config/env.js";
import TreeRemovalAdminConfiguration from "../src/models/TreeRemovalAdminConfiguration.js";
import { TREE_REMOVAL_DEFAULT_CONFIG } from "../src/utils/treeRemovalDefaults.js";

dotenv.config();

async function seed() {
  const uri = config.get("mongodb");
  await mongoose.connect(uri);
  console.log("Connected to MongoDB");

  const existing = await TreeRemovalAdminConfiguration.findOne({
    region: "global",
    service_type: "tree_removal",
  });

  if (existing) {
    await TreeRemovalAdminConfiguration.findByIdAndUpdate(existing._id, {
      $set: TREE_REMOVAL_DEFAULT_CONFIG,
    });
    console.log(`Updated existing global config: ${existing._id}`);
  } else {
    const created = await TreeRemovalAdminConfiguration.create(
      TREE_REMOVAL_DEFAULT_CONFIG,
    );
    console.log(`Created global config: ${created._id}`);
  }

  await mongoose.disconnect();
  console.log("Done.");
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
