import express from "express";
import { authenticate, admin } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import {
  applicationDecisionSchema,
  brandedDumbsterSchema,
  catalogItemSchema,
  catalogItemUpdateSchema,
  financingApplicationSchema,
  growthConfigSchema,
  operatorOverrideSchema,
  penaltySchema,
  removePenaltySchema,
} from "./validation.js";
import {
  adminApplyPenalty,
  adminRemovePenalty,
  adminListApplications,
  adminListCatalog,
  adminListOperators,
  createCatalogItem,
  decideApplication,
  deleteCatalogItem,
  getGrowthConfig,
  getGrowthProfile,
  listGrowthCatalog,
  listMyFinancingApplications,
  overrideOperator,
  setDumbsterBranded,
  submitFinancingApplication,
  updateCatalogItem,
  updateGrowthConfig,
} from "./controller.js";

const router = express.Router();

// ─── Operator (authenticated) ────────────────────────────────
router.get("/profile", authenticate, getGrowthProfile);
router.get("/catalog", authenticate, listGrowthCatalog);
router.post(
  "/financing-application",
  authenticate,
  validate(financingApplicationSchema),
  submitFinancingApplication,
);
router.get(
  "/financing-applications",
  authenticate,
  listMyFinancingApplications,
);

// ─── Admin (nested under same router; also mounted via /admin) ─
router.get("/admin/config", authenticate, admin, getGrowthConfig);
router.put(
  "/admin/config",
  authenticate,
  admin,
  validate(growthConfigSchema),
  updateGrowthConfig,
);

router.get("/admin/catalog", authenticate, admin, adminListCatalog);
router.post(
  "/admin/catalog",
  authenticate,
  admin,
  validate(catalogItemSchema),
  createCatalogItem,
);
router.put(
  "/admin/catalog/:id",
  authenticate,
  admin,
  validate(catalogItemUpdateSchema),
  updateCatalogItem,
);
router.delete("/admin/catalog/:id", authenticate, admin, deleteCatalogItem);

router.get("/admin/applications", authenticate, admin, adminListApplications);
router.put(
  "/admin/applications/:id",
  authenticate,
  admin,
  validate(applicationDecisionSchema),
  decideApplication,
);

router.get("/admin/operators", authenticate, admin, adminListOperators);
router.put(
  "/admin/operators/:id/override",
  authenticate,
  admin,
  validate(operatorOverrideSchema),
  overrideOperator,
);
router.post(
  "/admin/operators/:id/penalty",
  authenticate,
  admin,
  validate(penaltySchema),
  adminApplyPenalty,
);
router.post(
  "/admin/operators/:id/penalty/remove",
  authenticate,
  admin,
  validate(removePenaltySchema),
  adminRemovePenalty,
);

router.put(
  "/admin/dumbster/:id/branded",
  authenticate,
  admin,
  validate(brandedDumbsterSchema),
  setDumbsterBranded,
);

export default router;
