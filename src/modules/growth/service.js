import GrowthProgramConfig from "../../models/GrowthProgramConfig.js";
import OperatorGrowthProfile from "../../models/OperatorGrowthProfile.js";
import FleetCatalogItem from "../../models/FleetCatalogItem.js";
import FinancingApplication from "../../models/FinancingApplication.js";
import Dumbster from "../../models/Dumbster.js";
import User from "../../models/user.js";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "../../utils/apiError.js";
import {
  applyGrowthPenalty,
  estimateMonthlyPayment,
  getOrCreateGrowthConfig,
  recomputeAllOperatorGrowth,
  recomputeOperatorGrowth,
  removeGrowthPenalty,
  resolvePackageForMetrics,
} from "../../utils/growthEngine.js";
import { notifyGrowthSafe } from "../../utils/growthNotify.js";

function packageUnlocked(config, profile, packageKey) {
  const packages = config.packages || [];
  const target = packages.find((p) => p.key === packageKey);
  if (!target) return { ok: false, reason: "unknown_package" };
  if (!profile?.qualityGate?.passed) {
    return { ok: false, reason: "quality_gate_failed" };
  }
  if ((profile.completedJobs60d || 0) < target.minJobs) {
    return { ok: false, reason: "insufficient_jobs" };
  }
  if ((profile.fleetCredits || 0) + 1e-9 < target.minCredits) {
    return { ok: false, reason: "insufficient_credits" };
  }
  if (
    target.requiresCommercialEligible &&
    !profile.qualityGate?.commercialEligible
  ) {
    return { ok: false, reason: "commercial_not_eligible" };
  }
  // Must be at or above package
  const sorted = [...packages].sort(
    (a, b) => a.minJobs - b.minJobs || a.minCredits - b.minCredits,
  );
  const currentIdx = sorted.findIndex(
    (p) => p.key === profile.currentPackageKey,
  );
  const targetIdx = sorted.findIndex((p) => p.key === packageKey);
  if (targetIdx < 0 || currentIdx < targetIdx) {
    return { ok: false, reason: "package_not_unlocked" };
  }
  return { ok: true, package: target };
}

class GrowthService {
  // ─── Operator ─────────────────────────────────────────────

  async getProfile(operatorId) {
    const result = await recomputeOperatorGrowth(operatorId, {
      notify: false,
      reason: "profile_read",
    });
    if (!result) {
      throw new NotFoundError("Growth profile not available for this user");
    }
    const { profile, config, currentPackage, nextPackage } = result;
    return {
      profile,
      currentPackage,
      nextPackage,
      config: {
        windowDays: config.windowDays,
        gmvDivisor: config.gmvDivisor,
        brandedMultiplier: config.brandedMultiplier,
        qualityGate: config.qualityGate,
        packages: config.packages,
        milestonePercent: config.milestonePercent,
      },
      copy: {
        headline: currentPackage
          ? `You're on ${currentPackage.label}`
          : "Growth Program",
        progressLabel: nextPackage?.key
          ? `${nextPackage.jobsRemaining} jobs and ${nextPackage.creditsRemaining} credits to ${nextPackage.label}`
          : "Top growth package reached",
        progressPercent: nextPackage?.progressPercent ?? 100,
      },
    };
  }

  async listCatalog({ branded, size, packageKey } = {}) {
    const query = { active: true };
    if (branded === "true" || branded === true) query.branded = true;
    if (branded === "false" || branded === false) query.branded = false;
    if (size) query.size = String(size);
    if (packageKey) query.packageKeys = packageKey;

    const items = await FleetCatalogItem.find(query)
      .sort({ cashPrice: 1 })
      .lean();
    return items.map((item) => ({
      ...item,
      financingEstimate: {
        termMonths: item.financing?.termMonths || 36,
        aprPercent: item.financing?.aprPercent || 0,
        estMonthlyPayment: estimateMonthlyPayment(
          item.cashPrice,
          item.financing,
        ),
      },
    }));
  }

  async submitFinancingApplication(operatorId, body) {
    const { packageKey, items } = body;
    const recomputed = await recomputeOperatorGrowth(operatorId, {
      notify: false,
      reason: "financing_apply",
    });
    if (!recomputed) {
      throw new ForbiddenError("Only operators can apply for financing");
    }
    const { profile, config } = recomputed;
    const unlock = packageUnlocked(config, profile, packageKey);
    if (!unlock.ok) {
      throw new ForbiddenError(
        `Package ${packageKey} is not unlocked (${unlock.reason})`,
      );
    }

    const catalogIds = items.map((i) => i.catalogItemId);
    const catalogItems = await FleetCatalogItem.find({
      _id: { $in: catalogIds },
      active: true,
    }).lean();
    if (catalogItems.length !== catalogIds.length) {
      throw new BadRequestError("One or more catalog items are invalid");
    }
    const byId = new Map(catalogItems.map((c) => [c._id.toString(), c]));

    const requestedItems = items.map((i) => {
      const cat = byId.get(String(i.catalogItemId));
      return {
        catalogItem: cat._id,
        qty: i.qty || 1,
        branded: Boolean(i.branded ?? cat.branded),
        cashPriceSnapshot: cat.cashPrice,
        manufacturerSnapshot: cat.manufacturer,
        sizeSnapshot: cat.size,
      };
    });

    const application = await FinancingApplication.create({
      operator: operatorId,
      packageKey,
      profileSnapshot: {
        completedJobs60d: profile.completedJobs60d,
        gmv60d: profile.gmv60d,
        fleetCredits: profile.fleetCredits,
        currentPackageKey: profile.currentPackageKey,
        qualityGate: profile.qualityGate,
        computedAt: profile.computedAt,
      },
      requestedItems,
      status: "pending",
    });

    const operator = await User.findById(operatorId)
      .select("name email fcmtoken")
      .lean();

    notifyGrowthSafe({
      operator,
      type: "financing_application_received",
      title: "Financing application received",
      description: `Your financing application for the ${packageKey} package was submitted and is pending review.`,
      notifyAdmin: true,
      metadata: {
        action: "financing_application_received",
        applicationId: application._id.toString(),
        packageKey,
      },
    });

    return application;
  }

  async listMyApplications(operatorId) {
    return FinancingApplication.find({ operator: operatorId })
      .sort({ createdAt: -1 })
      .populate("requestedItems.catalogItem")
      .lean();
  }

  // ─── Admin config / catalog / applications ─────────────────

  async getConfig() {
    return getOrCreateGrowthConfig();
  }

  async updateConfig(body) {
    const config = await getOrCreateGrowthConfig();
    const fields = [
      "windowDays",
      "gmvDivisor",
      "brandedMultiplier",
      "milestonePercent",
      "qualityGate",
      "penalties",
      "packages",
    ];
    for (const key of fields) {
      if (body[key] !== undefined) {
        if (key === "qualityGate" || key === "penalties") {
          config[key] = {
            ...(config[key]?.toObject?.() || config[key] || {}),
            ...body[key],
          };
        } else {
          config[key] = body[key];
        }
      }
    }
    await config.save();
    return config;
  }

  async adminListCatalog({ active, search } = {}) {
    const query = {};
    if (active === "true" || active === true) query.active = true;
    if (active === "false" || active === false) query.active = false;
    if (search) query.manufacturer = { $regex: search, $options: "i" };
    const defaultStats = {
      active: 0,
      inactive: 0,
      total: 0,
    };
    const [data, stats] = await Promise.all([
      FleetCatalogItem.find(query).sort({ updatedAt: -1 }).lean(),
      FleetCatalogItem.aggregate([
        {
          $group: {
            _id: null,
            active: { $sum: { $cond: ["$active", 1, 0] } },
            inactive: { $sum: { $cond: ["$active", 0, 1] } },
            total: { $sum: 1 },
          },
        },
      ]),
    ]);
    return {
      data,
      stats: stats?.[0] || defaultStats,
    };
  }

  async createCatalogItem(body) {
    return FleetCatalogItem.create(body);
  }

  async updateCatalogItem(id, body) {
    const item = await FleetCatalogItem.findByIdAndUpdate(id, body, {
      new: true,
      runValidators: true,
    });
    if (!item) throw new NotFoundError("Catalog item not found");
    return item;
  }

  async deleteCatalogItem(id) {
    const item = await FleetCatalogItem.findByIdAndDelete(id);
    if (!item) throw new NotFoundError("Catalog item not found");
    return { deleted: true, id };
  }

  async adminListApplications({ status, page = 1, limit = 20, search } = {}) {
    const query = {};
    if (status) query.status = status;

    if (search && search.trim() !== "") {
      const matchingUsers = await User.find({
        $or: [
          { name: { $regex: search.trim(), $options: "i" } },
          { email: { $regex: search.trim(), $options: "i" } },
          { phone: { $regex: search.trim(), $options: "i" } },
        ],
      })
        .select("_id")
        .lean();

      const userIds = matchingUsers.map((u) => u._id);
      query.operator = { $in: userIds };
    }

    const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
    const [data, total, stats] = await Promise.all([
      FinancingApplication.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit) || 20)
        .populate("operator", "name email phone rating")
        .populate("requestedItems.catalogItem")
        .lean(),
      FinancingApplication.countDocuments(query),
      FinancingApplication.aggregate([
        {
          $group: {
            _id: null,
            approved: {
              $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] },
            },
            pending: {
              $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
            },
            denied: {
              $sum: { $cond: [{ $eq: ["$status", "denied"] }, 1, 0] },
            },
            withdrawn: {
              $sum: { $cond: [{ $eq: ["$status", "withdrawn"] }, 1, 0] },
            },
            in_review: {
              $sum: { $cond: [{ $eq: ["$status", "in_review"] }, 1, 0] },
            },
            total: { $sum: 1 },
          },
        },
      ]),
    ]);
    const defaultStats = {
      approved: 0,
      pending: 0,
      denied: 0,
      withdrawn: 0,
      in_review: 0,
      total: 0,
    };
    return {
      data,
      stats: stats[0] || defaultStats,
      pagination: {
        page: Number(page) || 1,
        limit: Number(limit) || 20,
        total,
        pages: Math.ceil(total / (Number(limit) || 20)) || 1,
      },
    };
  }

  async decideApplication(id, adminId, body) {
    const app = await FinancingApplication.findById(id);
    if (!app) throw new NotFoundError("Application not found");

    const prev = app.status;
    app.status = body.status;
    if (body.adminNotes !== undefined) app.adminNotes = body.adminNotes;
    if (body.decisionTerms) {
      app.decisionTerms = {
        ...(app.decisionTerms?.toObject?.() || app.decisionTerms || {}),
        ...body.decisionTerms,
      };
    }
    if (["approved", "denied"].includes(body.status)) {
      app.decidedBy = adminId;
      app.decidedAt = new Date();
    }
    await app.save();

    if (body.status !== prev && ["approved", "denied"].includes(body.status)) {
      const operator = await User.findById(app.operator)
        .select("name email fcmtoken")
        .lean();
      const approved = body.status === "approved";
      notifyGrowthSafe({
        operator,
        type: approved
          ? "financing_application_approved"
          : "financing_application_denied",
        title: approved
          ? "Financing application approved"
          : "Financing application denied",
        description: approved
          ? `Your financing application for ${app.packageKey} was approved.`
          : `Your financing application for ${app.packageKey} was denied.${
              body.adminNotes ? ` Note: ${body.adminNotes}` : ""
            }`,
        metadata: {
          action: body.status,
          applicationId: app._id.toString(),
          packageKey: app.packageKey,
        },
      });
    }

    return app;
  }

  async adminListOperators({
    sort = "credits",
    page = 1,
    limit = 50,
    search,
  } = {}) {
    const sortMap = {
      credits: { fleetCredits: -1 },
      tier: { currentPackageKey: 1, fleetCredits: -1 },
      jobs: { completedJobs60d: -1 },
      gmv: { gmv60d: -1 },
      recent: { computedAt: -1 },
    };
    const query = {};
    if (search && search.trim() !== "") {
      const matchingUsers = await User.find({
        $or: [
          { name: { $regex: search.trim(), $options: "i" } },
          { email: { $regex: search.trim(), $options: "i" } },
          { phone: { $regex: search.trim(), $options: "i" } },
        ],
      })
        .select("_id")
        .lean();

      const userIds = matchingUsers.map((u) => u._id);
      query.operator = { $in: userIds };
    }
    const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
    const [data, total] = await Promise.all([
      OperatorGrowthProfile.find(query)
        .sort(sortMap[sort] || sortMap.credits)
        .skip(skip)
        .limit(Number(limit) || 50)
        .populate(
          "operator",
          "name email phone rating status accountId_verified",
        )
        .lean(),
      OperatorGrowthProfile.countDocuments({}),
    ]);
    return {
      data,
      pagination: {
        page: Number(page) || 1,
        limit: Number(limit) || 50,
        total,
        pages: Math.ceil(total / (Number(limit) || 50)) || 1,
      },
    };
  }

  async overrideOperator(operatorId, body) {
    const user = await User.findById(operatorId).select("_id role").lean();
    if (!user) throw new NotFoundError("Operator not found");

    if (body.clearOverride) {
      await OperatorGrowthProfile.findOneAndUpdate(
        { operator: operatorId },
        {
          $set: {
            manualPackageOverride: null,
            qualificationLockedUntil: null,
          },
        },
        { upsert: true },
      );
      return recomputeOperatorGrowth(operatorId, {
        notify: false,
        reason: "admin_clear_override",
      });
    }

    const config = await getOrCreateGrowthConfig();
    if (
      body.packageKey &&
      !config.packages.some((p) => p.key === body.packageKey)
    ) {
      throw new BadRequestError("Unknown packageKey");
    }

    const lockDays = body.lockDays ?? 30;
    const lockedUntil =
      lockDays > 0
        ? new Date(Date.now() + lockDays * 24 * 60 * 60 * 1000)
        : null;

    await OperatorGrowthProfile.findOneAndUpdate(
      { operator: operatorId },
      {
        $set: {
          manualPackageOverride: body.packageKey || null,
          currentPackageKey: body.packageKey || "starter",
          qualificationLockedUntil: lockedUntil,
        },
        $setOnInsert: { operator: operatorId },
      },
      { upsert: true },
    );

    return recomputeOperatorGrowth(operatorId, {
      notify: true,
      reason: "admin_override",
    });
  }

  async setDumbsterBranded(dumbsterId, branded) {
    const update = {
      branded: Boolean(branded),
      brandedApprovedAt: branded ? new Date() : null,
      updatedAt: new Date(),
    };
    const item = await Dumbster.findByIdAndUpdate(dumbsterId, update, {
      new: true,
    });
    if (!item) throw new NotFoundError("Dumbster not found");
    return item;
  }

  async adminApplyPenalty(operatorId, body) {
    const note = String(body.note || "").trim();
    if (note.length < 3) {
      throw new BadRequestError(
        "Penalty reason is required (min 3 characters)",
      );
    }
    return applyGrowthPenalty(operatorId, {
      type: body.type,
      orderId: body.orderId || null,
      note,
      value: body.value,
      source: "admin",
    });
  }

  async adminRemovePenalty(operatorId, body) {
    try {
      return await removeGrowthPenalty(operatorId, {
        penaltyId: body.penaltyId,
        reason: String(body.reason || "").trim(),
        source: "admin",
      });
    } catch (err) {
      const msg = err?.message || "Failed to remove penalty";
      if (/not found/i.test(msg)) throw new NotFoundError(msg);
      throw new BadRequestError(msg);
    }
  }

  async runDailyRecompute() {
    return recomputeAllOperatorGrowth({ notify: true });
  }

  // Exported for tests
  packageUnlocked = packageUnlocked;
  resolvePackageForMetrics = resolvePackageForMetrics;
}

export default new GrowthService();
export { packageUnlocked };
