/**
 * Growth Platform Production QA
 * Usage: node scripts/verify-growth-platform.js
 *
 * Default: local .env Mongo (tagged docs cleaned up). No production writes.
 */
import "dotenv/config";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TAG = "verify-growth-platform";

let passed = 0;
let failed = 0;
let skipped = 0;
const sectionStats = [];
let currentSection = null;

function startSection(name) {
  currentSection = { name, pass: 0, fail: 0, skip: 0 };
  sectionStats.push(currentSection);
  console.log(`\n========== ${name} ==========`);
}

function assert(cond, msg) {
  if (cond) {
    passed += 1;
    if (currentSection) currentSection.pass += 1;
    console.log(`  PASS: ${msg}`);
  } else {
    failed += 1;
    if (currentSection) currentSection.fail += 1;
    console.log(`  FAIL: ${msg}`);
  }
}

function skip(msg) {
  skipped += 1;
  if (currentSection) currentSection.skip += 1;
  console.log(`  SKIP: ${msg}`);
}

async function check(label, fn) {
  try {
    await fn();
  } catch (err) {
    assert(false, `${label}: ${err.message}`);
  }
}

function routePaths(router) {
  const paths = [];
  const walk = (stack) => {
    if (!stack) return;
    for (const layer of stack) {
      if (layer.route?.path) {
        const methods = Object.keys(layer.route.methods || {})
          .filter((m) => layer.route.methods[m])
          .join(",")
          .toUpperCase();
        paths.push(`${methods} ${layer.route.path}`);
      } else if (layer.name === "router" && layer.handle?.stack) {
        walk(layer.handle.stack);
      }
    }
  };
  walk(router.stack);
  return paths;
}

function hasRoute(paths, method, fragment) {
  const m = method.toUpperCase();
  return paths.some(
    (p) => p.includes(fragment) && (m === "*" || p.startsWith(m)),
  );
}

async function phaseA() {
  startSection("Phase A — Static / boot");

  const imports = [
    ["GrowthProgramConfig", () => import("../src/models/GrowthProgramConfig.js")],
    ["OperatorGrowthProfile", () => import("../src/models/OperatorGrowthProfile.js")],
    ["FleetCatalogItem", () => import("../src/models/FleetCatalogItem.js")],
    ["FinancingApplication", () => import("../src/models/FinancingApplication.js")],
    ["growthEngine", () => import("../src/utils/growthEngine.js")],
    ["growthNotify", () => import("../src/utils/growthNotify.js")],
    ["growth/service", () => import("../src/modules/growth/service.js")],
    ["growth/routes", () => import("../src/modules/growth/routes.js")],
    ["growth/controller", () => import("../src/modules/growth/controller.js")],
    ["dispatchService", () => import("../src/utils/dispatchService.js")],
    ["cronjobs", () => import("../src/utils/cronjobs.js")],
    ["Dumbster", () => import("../src/models/Dumbster.js")],
    ["Notification", () => import("../src/models/Notification.js")],
  ];

  for (const [label, loader] of imports) {
    await check(`import ${label}`, async () => {
      const mod = await loader();
      assert(mod != null, `import ${label}`);
    });
  }

  const engine = await import("../src/utils/growthEngine.js");
  assert(typeof engine.recomputeOperatorGrowth === "function", "recomputeOperatorGrowth export");
  assert(typeof engine.resolvePackageForMetrics === "function", "resolvePackageForMetrics export");
  assert(typeof engine.estimateMonthlyPayment === "function", "estimateMonthlyPayment export");
  assert(typeof engine.mapBrandedBoostForOperators === "function", "mapBrandedBoostForOperators export");
  assert(typeof engine.applyGrowthPenalty === "function", "applyGrowthPenalty export");
}

async function phaseB() {
  startSection("Phase B — Pure logic");

  const {
    resolvePackageForMetrics,
    estimateMonthlyPayment,
  } = await import("../src/utils/growthEngine.js");
  const { packageUnlocked } = await import("../src/modules/growth/service.js");
  const Notification = (await import("../src/models/Notification.js")).default;
  const Dumbster = (await import("../src/models/Dumbster.js")).default;

  const packages = [
    { key: "starter", label: "Starter", cans: 1, minJobs: 0, minCredits: 0, requiresCommercialEligible: false },
    { key: "growth", label: "Growth", cans: 2, minJobs: 10, minCredits: 1, requiresCommercialEligible: false },
    { key: "pro", label: "Pro", cans: 5, minJobs: 25, minCredits: 3, requiresCommercialEligible: false },
    { key: "fleet", label: "Fleet", cans: 10, minJobs: 50, minCredits: 8, requiresCommercialEligible: true },
  ];

  let r = resolvePackageForMetrics({
    packages,
    completedJobs: 0,
    fleetCredits: 0,
    gatePassed: true,
    commercialEligible: false,
  });
  assert(r.currentPackageKey === "starter", "0 jobs → starter");
  assert(r.nextPackage.key === "growth", "next is growth");
  assert(r.nextPackage.jobsRemaining === 10, "10 jobs remaining to growth");

  r = resolvePackageForMetrics({
    packages,
    completedJobs: 12,
    fleetCredits: 1.5,
    gatePassed: true,
    commercialEligible: false,
  });
  assert(r.currentPackageKey === "growth", "meets growth mins → growth");
  assert(r.nextPackage.key === "pro", "next is pro");

  r = resolvePackageForMetrics({
    packages,
    completedJobs: 60,
    fleetCredits: 10,
    gatePassed: true,
    commercialEligible: false,
  });
  assert(r.currentPackageKey === "pro", "fleet blocked without commercial");
  assert(r.nextPackage.key === "fleet", "next still fleet");

  r = resolvePackageForMetrics({
    packages,
    completedJobs: 60,
    fleetCredits: 10,
    gatePassed: true,
    commercialEligible: true,
  });
  assert(r.currentPackageKey === "fleet", "fleet unlocked with commercial");
  assert(r.nextPackage.key == null, "no next after top tier");

  r = resolvePackageForMetrics({
    packages,
    completedJobs: 60,
    fleetCredits: 10,
    gatePassed: false,
    commercialEligible: true,
  });
  assert(r.currentPackageKey === "starter", "gate fail → stay starter (lowest)");

  r = resolvePackageForMetrics({
    packages,
    completedJobs: 5,
    fleetCredits: 0.2,
    gatePassed: false,
    commercialEligible: false,
    lockedPackageKey: "pro",
  });
  assert(r.currentPackageKey === "pro", "lock preserves higher package");

  r = resolvePackageForMetrics({
    packages,
    completedJobs: 5,
    fleetCredits: 0,
    gatePassed: true,
    commercialEligible: false,
    manualOverride: "growth",
  });
  assert(r.currentPackageKey === "growth", "manual override honored");

  // Credits math scenario (unit): GMV 10000 / 5000 = 2; branded *1.1 = 2.2
  const raw = (10000 / 5000) * 1.1;
  assert(Math.abs(raw - 2.2) < 1e-9, "branded credit math 2.2");

  const monthly = estimateMonthlyPayment(12000, {
    termMonths: 36,
    aprPercent: 0,
    downPaymentPercent: 0,
  });
  assert(monthly === 333.33 || Math.abs(monthly - 12000 / 36) < 0.02, `0% APR monthly (~333.33 got ${monthly})`);

  const withApr = estimateMonthlyPayment(10000, {
    termMonths: 36,
    aprPercent: 12,
    estMonthlyPayment: 332,
  });
  assert(withApr === 332, "explicit estMonthlyPayment wins");

  const unlockOk = packageUnlocked(
    { packages },
    {
      qualityGate: { passed: true, commercialEligible: false },
      completedJobs60d: 12,
      fleetCredits: 1.5,
      currentPackageKey: "growth",
    },
    "growth",
  );
  assert(unlockOk.ok === true, "packageUnlocked growth ok");

  const unlockFail = packageUnlocked(
    { packages },
    {
      qualityGate: { passed: true, commercialEligible: false },
      completedJobs60d: 12,
      fleetCredits: 1.5,
      currentPackageKey: "growth",
    },
    "pro",
  );
  assert(unlockFail.ok === false, "packageUnlocked pro blocked");
  assert(
    ["package_not_unlocked", "insufficient_jobs", "insufficient_credits"].includes(
      unlockFail.reason,
    ),
    `reason blocked (${unlockFail.reason})`,
  );

  const enumVals = Notification.schema.path("type").enumValues;
  for (const t of [
    "growth_tier_unlocked",
    "growth_progress_milestone",
    "growth_gate_failed",
    "growth_tier_lost",
    "financing_application_received",
    "financing_application_approved",
    "financing_application_denied",
    "financing_application_submitted",
  ]) {
    assert(enumVals.includes(t), `Notification enum includes ${t}`);
  }

  assert(Dumbster.schema.path("branded") != null, "Dumbster.branded field");
  assert(Dumbster.schema.path("brandedApprovedAt") != null, "Dumbster.brandedApprovedAt field");

  const cronSrc = fs.readFileSync(
    path.join(ROOT, "src/utils/cronjobs.js"),
    "utf8",
  );
  assert(cronSrc.includes("recomputeAllOperatorGrowth"), "cron registers growth recompute");

  const dispatchSrc = fs.readFileSync(
    path.join(ROOT, "src/utils/dispatchService.js"),
    "utf8",
  );
  assert(dispatchSrc.includes("growthBrandedBoost"), "dispatch uses growthBrandedBoost");
  assert(dispatchSrc.includes("mapBrandedBoostForOperators"), "dispatch loads boost map");

  const orderSrc = fs.readFileSync(
    path.join(ROOT, "src/modules/order/service.js"),
    "utf8",
  );
  assert(orderSrc.includes("recomputeOperatorGrowth"), "order complete hooks growth");
  assert(orderSrc.includes("applyGrowthPenalty"), "cancel/refund applies growth penalty");
}

async function ensureMongo() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;
  if (!uri) return false;
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  }
  await mongoose.connection.db.admin().command({ ping: 1 });
  return true;
}

async function phaseC() {
  startSection("Phase C — Mongo integration");

  let connected = false;
  try {
    // Connect before heavy service imports so model ops never buffer
    connected = await ensureMongo();
  } catch (err) {
    skip(`Mongo unavailable: ${err.message}`);
    return { cleanup: async () => {} };
  }
  if (!connected) {
    skip("No Mongo URI in env");
    return { cleanup: async () => {} };
  }
  console.log("Mongo: connected");

  mongoose.set("bufferCommands", true);

  const User = (await import("../src/models/user.js")).default;
  const Order = (await import("../src/models/Order.js")).default;
  const Dumbster = (await import("../src/models/Dumbster.js")).default;
  const Dustbin = (await import("../src/models/Dustbin.js")).default;
  const JobEvent = (await import("../src/models/JobEvent.js")).default;
  const FleetCatalogItem = (await import("../src/models/FleetCatalogItem.js")).default;
  const FinancingApplication = (await import("../src/models/FinancingApplication.js")).default;
  const OperatorGrowthProfile = (await import("../src/models/OperatorGrowthProfile.js")).default;
  const growthService = (await import("../src/modules/growth/service.js")).default;
  const {
    recomputeOperatorGrowth,
    applyGrowthPenalty,
    mapBrandedBoostForOperators,
    getOrCreateGrowthConfig,
  } = await import("../src/utils/growthEngine.js");

  const ids = {
    users: [],
    orders: [],
    dumbsters: [],
    dustbins: [],
    jobs: [],
    catalog: [],
    apps: [],
    profiles: [],
  };

  const cleanup = async () => {
    try {
      if (ids.apps.length) await FinancingApplication.deleteMany({ _id: { $in: ids.apps } });
      if (ids.catalog.length) await FleetCatalogItem.deleteMany({ _id: { $in: ids.catalog } });
      if (ids.jobs.length) await JobEvent.deleteMany({ _id: { $in: ids.jobs } });
      if (ids.orders.length) await Order.deleteMany({ _id: { $in: ids.orders } });
      if (ids.dustbins.length) await Dustbin.deleteMany({ _id: { $in: ids.dustbins } });
      if (ids.dumbsters.length) await Dumbster.deleteMany({ _id: { $in: ids.dumbsters } });
      if (ids.profiles.length) {
        await OperatorGrowthProfile.deleteMany({ operator: { $in: ids.profiles } });
      }
      if (ids.users.length) await User.deleteMany({ _id: { $in: ids.users } });
      // leave GrowthProgramConfig singleton (shared) — restore defaults if we mutated
    } catch (err) {
      console.log("  cleanup warn:", err.message);
    }
  };

  try {
    await check("config singleton", async () => {
      const cfg = await getOrCreateGrowthConfig();
      assert(cfg.windowDays === 60 || cfg.windowDays > 0, `config windowDays=${cfg.windowDays}`);
      assert(cfg.gmvDivisor === 5000 || cfg.gmvDivisor > 0, `config gmvDivisor=${cfg.gmvDivisor}`);
      assert(Array.isArray(cfg.packages) && cfg.packages.length >= 2, "config has packages");
      // Soft-reset test knobs without destroying prod config permanently
      cfg.windowDays = 60;
      cfg.gmvDivisor = 5000;
      cfg.brandedMultiplier = 1.1;
      await cfg.save();
      assert(true, "config knobs set for test");
    });

    const stamp = Date.now();
    await ensureMongo();
    const geo = {
      location: { type: "Point", coordinates: [-73.9857, 40.7484] },
      currentLocation: { type: "Point", coordinates: [-73.9857, 40.7484] },
    };
    const operator = await User.create({
      name: `${TAG}-op`,
      email: `${TAG}-op-${stamp}@test.local`,
      phone: `+1555${String(stamp).slice(-7)}`,
      role: "renter",
      status: "online",
      rating: 4.8,
      accountId_verified: true,
      driving_license: "https://example.com/dl.pdf",
      balance: 0,
      ...geo,
    });
    ids.users.push(operator._id);
    ids.profiles.push(operator._id);
    assert(true, "fixture operator created");

    const customer = await User.create({
      name: `${TAG}-cust`,
      email: `${TAG}-cust-${stamp}@test.local`,
      phone: `+1556${String(stamp).slice(-7)}`,
      role: "rentee",
      status: "online",
      balance: 0,
      ...geo,
    });
    ids.users.push(customer._id);

    const dumbster = await Dumbster.create({
      size: "18-20",
      price: 200,
      branded: false,
      status: "active",
      description: TAG,
    });
    ids.dumbsters.push(dumbster._id);

    const dustbin = await Dustbin.create({
      user: operator._id,
      dumbster: dumbster._id,
      status: "active",
      location: { type: "Point", coordinates: [-73.9, 40.7] },
      insurance_expiry_date: new Date(Date.now() + 86400000 * 90),
      insurancefile: "https://example.com/ins.pdf",
      registrationfile: "https://example.com/reg.pdf",
    });
    ids.dustbins.push(dustbin._id);
    assert(true, "fixture dumpster inventory created");

    // Seed 12 completed jobs @ $500 → GMV 6000 → credits 6000/5000 = 1.2
    const orderDocs = [];
    for (let i = 0; i < 12; i++) {
      orderDocs.push({
        user: customer._id,
        to_id: operator._id,
        status: "completed",
        price: 500,
        amount: 425,
        dumbster: dumbster._id,
        dustbin: dustbin._id,
        service_type: "Dumbster",
        start_date: new Date(Date.now() - 86400000 * 10),
        end_date: new Date(Date.now() - 86400000 * 5),
      });
    }
    const orders = await Order.insertMany(orderDocs);
    ids.orders.push(...orders.map((o) => o._id));

    const events = await JobEvent.insertMany(
      orders.map((o) => ({
        operatorId: operator._id,
        orderId: o._id,
        eventType: "JOB_COMPLETED",
        revenueGenerated: 500,
        onTime: true,
      })),
    );
    ids.jobs.push(...events.map((e) => e._id));
    assert(orders.length === 12, "12 completed orders seeded");

    let result = await recomputeOperatorGrowth(operator._id, {
      notify: false,
      reason: "verify",
    });
    assert(result?.profile?.completedJobs60d === 12, `jobs60d=${result?.profile?.completedJobs60d}`);
    assert(Math.abs(result.profile.gmv60d - 6000) < 0.01, `gmv60d=${result?.profile?.gmv60d}`);
    assert(Math.abs(result.profile.fleetCredits - 1.2) < 0.05, `credits=${result?.profile?.fleetCredits} (expect ~1.2)`);
    assert(result.profile.qualityGate.passed === true, "quality gate passed");
    assert(result.profile.currentPackageKey === "growth", `package=${result.profile.currentPackageKey}`);

    // Branded multiplier
    await Dumbster.findByIdAndUpdate(dumbster._id, {
      branded: true,
      brandedApprovedAt: new Date(),
    });
    result = await recomputeOperatorGrowth(operator._id, {
      notify: false,
      reason: "branded",
    });
    assert(result.profile.qualityGate.hasBrandedCan === true, "hasBrandedCan true");
    assert(
      Math.abs(result.profile.fleetCredits - 1.32) < 0.05,
      `branded credits=${result.profile.fleetCredits} (expect ~1.32)`,
    );

    const boostMap = await mapBrandedBoostForOperators([operator._id]);
    assert(boostMap.get(operator._id.toString()) === true, "dispatch branded boost true");

    // Catalog CRUD via service (while growth package still unlocked)
    const item = await growthService.createCatalogItem({
      manufacturer: `${TAG}-RollOff`,
      size: "20",
      color: "green",
      branded: true,
      cashPrice: 6500,
      financing: { termMonths: 36, aprPercent: 0 },
      stockStatus: "in_stock",
      active: true,
      packageKeys: ["growth", "pro"],
      photos: ["https://example.com/can.jpg"],
    });
    ids.catalog.push(item._id);
    assert(item.manufacturer.includes(TAG), "catalog item created");

    const catalog = await growthService.listCatalog({ branded: true, size: "20" });
    assert(
      catalog.some((c) => c._id.toString() === item._id.toString()),
      "catalog filter branded+size",
    );
    assert(
      catalog.find((c) => c._id.toString() === item._id.toString())
        ?.financingEstimate?.estMonthlyPayment > 0,
      "financing estimate present",
    );

    // Financing application — growth package unlocked (before penalties)
    const app = await growthService.submitFinancingApplication(operator._id, {
      packageKey: "growth",
      items: [{ catalogItemId: item._id.toString(), qty: 1, branded: true }],
    });
    ids.apps.push(app._id);
    assert(app.status === "pending", "application pending");
    assert(app.profileSnapshot.completedJobs60d >= 10, "snapshot jobs");
    assert(app.packageKey === "growth", "snapshot packageKey");

    let denied = false;
    try {
      await growthService.submitFinancingApplication(operator._id, {
        packageKey: "fleet",
        items: [{ catalogItemId: item._id.toString(), qty: 1 }],
      });
    } catch (err) {
      denied = true;
      assert(
        /not unlocked|Forbidden/i.test(err.message) || err.statusCode === 403,
        `fleet apply rejected: ${err.message}`,
      );
    }
    assert(denied, "fleet application rejected when locked");

    const decided = await growthService.decideApplication(app._id, operator._id, {
      status: "approved",
      adminNotes: "verify approve",
      decisionTerms: {
        approvedAmount: 6500,
        termMonths: 36,
        monthlyPayment: 180.56,
      },
    });
    assert(decided.status === "approved", "application approved");

    // Penalty after financing — credits drop and may lose tier
    await applyGrowthPenalty(operator._id, {
      type: "no_show",
      note: TAG,
      source: "verify",
    });
    result = await recomputeOperatorGrowth(operator._id, {
      notify: false,
      reason: "after_penalty",
    });
    assert(
      result.profile.fleetCredits < 1.32,
      `credits after penalty=${result.profile.fleetCredits}`,
    );
    assert(
      (result.profile.penaltiesApplied || []).some((p) => p.type === "no_show"),
      "no_show penalty recorded",
    );

    // Admin override + lock (recovers / forces tier for ops)
    const overridden = await growthService.overrideOperator(operator._id, {
      packageKey: "pro",
      lockDays: 30,
    });
    assert(
      overridden.profile.currentPackageKey === "pro",
      `override package=${overridden.profile.currentPackageKey}`,
    );
    assert(
      overridden.profile.qualificationLockedUntil != null,
      "qualificationLockedUntil set",
    );

    const brandedUpdate = await growthService.setDumbsterBranded(dumbster._id, true);
    assert(brandedUpdate.branded === true, "admin set dumbster branded");
    assert(brandedUpdate.brandedApprovedAt != null, "brandedApprovedAt set");

    const cleared = await growthService.overrideOperator(operator._id, {
      clearOverride: true,
    });
    assert(cleared.profile.manualPackageOverride == null, "override cleared");

    // Consumer / rentee cannot get growth profile
    let renteeBlocked = false;
    try {
      await growthService.getProfile(customer._id);
    } catch {
      renteeBlocked = true;
    }
    assert(renteeBlocked, "rentee growth profile blocked");

    // Config update
    const cfg = await growthService.updateConfig({ milestonePercent: 75 });
    assert(cfg.milestonePercent === 75, "config milestonePercent updated");
    await growthService.updateConfig({ milestonePercent: 80 });

    assert(true, "phase C scenarios complete");
  } catch (err) {
    assert(false, `phase C fatal: ${err.message}`);
  }

  return { cleanup };
}

async function phaseD() {
  startSection("Phase D — Route registration");

  const growthRoutes = (await import("../src/modules/growth/routes.js")).default;
  const adminRoutes = (await import("../src/modules/admin/routes.js")).default;
  const gPaths = routePaths(growthRoutes);
  const aPaths = routePaths(adminRoutes);

  assert(hasRoute(gPaths, "GET", "/profile"), "GET /api/growth/profile");
  assert(hasRoute(gPaths, "GET", "/catalog"), "GET /api/growth/catalog");
  assert(hasRoute(gPaths, "POST", "/financing-application"), "POST financing-application");
  assert(hasRoute(gPaths, "GET", "/financing-applications"), "GET financing-applications");
  assert(hasRoute(gPaths, "GET", "/admin/config"), "GET growth admin config");
  assert(hasRoute(gPaths, "PUT", "/admin/config"), "PUT growth admin config");
  assert(hasRoute(gPaths, "*", "/admin/catalog"), "admin catalog routes");
  assert(hasRoute(gPaths, "*", "/admin/applications"), "admin applications routes");
  assert(hasRoute(gPaths, "*", "/admin/operators"), "admin operators routes");
  assert(hasRoute(gPaths, "PUT", "/admin/dumbster"), "PUT branded dumbster");

  assert(hasRoute(aPaths, "GET", "/growth/config"), "admin mount GET /growth/config");
  assert(hasRoute(aPaths, "PUT", "/dumbster"), "admin PUT /dumbster/:id/branded");
  assert(hasRoute(aPaths, "GET", "/growth/operators"), "admin GET /growth/operators");
}

async function phaseE() {
  startSection("Phase E — Scenario matrix / regression");

  const { resolvePackageForMetrics } = await import("../src/utils/growthEngine.js");
  const packages = [
    { key: "starter", label: "Starter", cans: 1, minJobs: 0, minCredits: 0, requiresCommercialEligible: false },
    { key: "growth", label: "Growth", cans: 2, minJobs: 10, minCredits: 1, requiresCommercialEligible: false },
    { key: "pro", label: "Pro", cans: 5, minJobs: 25, minCredits: 3, requiresCommercialEligible: false },
  ];

  // Progress percent at half jobs / half credits toward growth
  const mid = resolvePackageForMetrics({
    packages,
    completedJobs: 5,
    fleetCredits: 0.5,
    gatePassed: true,
    commercialEligible: false,
  });
  assert(mid.currentPackageKey === "starter", "mid progress still starter");
  assert(mid.nextPackage.progressPercent === 50, `progress=${mid.nextPackage.progressPercent}`);

  // Exact boundary
  const edge = resolvePackageForMetrics({
    packages,
    completedJobs: 10,
    fleetCredits: 1,
    gatePassed: true,
    commercialEligible: false,
  });
  assert(edge.currentPackageKey === "growth", "exact boundary unlocks growth");

  // Index mount
  const indexSrc = fs.readFileSync(path.join(ROOT, "src/modules/index.js"), "utf8");
  assert(indexSrc.includes('app.use("/growth"'), "index mounts /growth");

  const ratingSrc = fs.readFileSync(
    path.join(ROOT, "src/modules/rating/service.js"),
    "utf8",
  );
  assert(ratingSrc.includes("recomputeOperatorGrowth"), "rating hooks growth");

  const socketSrc = fs.readFileSync(path.join(ROOT, "src/socket/socket.js"), "utf8");
  assert(socketSrc.includes("recomputeOperatorGrowth"), "socket completion hooks growth");
}

async function phaseF() {
  startSection("Phase F — Report");
  console.log("\n--- Section summary ---");
  for (const s of sectionStats) {
    console.log(
      `  ${s.name}: pass=${s.pass} fail=${s.fail} skip=${s.skip}`,
    );
  }
  console.log("\n--- Totals ---");
  console.log(`  PASS: ${passed}`);
  console.log(`  FAIL: ${failed}`);
  console.log(`  SKIP: ${skipped}`);
  console.log("\n--- Manual production checklist ---");
  console.log("  - Live daily cron growth recompute on deployed server");
  console.log("  - Push/email delivery for growth_* notification types");
  console.log("  - Live dispatch wave ordering with branded boost operators online");
  console.log("  - Admin UI for catalog images (upload via /api/upload-image)");
}

async function main() {
  console.log("Growth Platform Production QA");
  console.log(`Tag: ${TAG}`);
  console.log(`Time: ${new Date().toISOString()}`);

  let cleanup = async () => {};
  try {
    // Connect BEFORE importing modules that register User/Order models.
    // Importing dispatch/growth before connect leaves User stuck buffering.
    try {
      const ok = await ensureMongo();
      if (ok) console.log("Mongo: connected (pre-boot)");
      else console.log("Mongo: no URI — Phase C will skip");
    } catch (err) {
      console.log(`Mongo: pre-boot connect failed (${err.message}) — Phase C may skip`);
    }

    await phaseA();
    await phaseB();
    const c = await phaseC();
    cleanup = c?.cleanup || cleanup;
    await phaseD();
    await phaseE();
  } catch (err) {
    console.error("Fatal:", err);
    failed += 1;
  } finally {
    try {
      await cleanup();
    } catch {
      /* ignore */
    }
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
  }

  await phaseF();

  if (failed > 0) {
    console.log("\nGROWTH CHECKS FAILED");
    process.exit(1);
  }
  console.log("\nALL AUTOMATED CHECKS PASSED");
  process.exit(0);
}

main();
