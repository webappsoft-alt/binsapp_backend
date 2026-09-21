import express from "express";
import { authenticate, admin } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import {
  acceptPortionValidation,
  counterValidation,
  createOfferValidation,
  quickOrderValidation,
} from "./validation.js";
import {
  acceptPortion,
  adjustOffer,
  adminGetOffer,
  adminInvite,
  adminListOffers,
  adminPatchOffer,
  allowCounters,
  cancelOffer,
  createOffer,
  declinePortion,
  getOffer,
  getRecommendation,
  listOffers,
  listPortions,
  quickOrder,
  respondCounter,
  saveBlanket,
  submitCounter,
  submitOffer,
  updateOffer,
} from "./controller.js";

const router = express.Router();

router.use(authenticate);

// Provider portions (renter)
router.get("/portions", listPortions);
router.post(
  "/:id/accept",
  validate(acceptPortionValidation),
  acceptPortion,
);
router.post("/:id/decline", declinePortion);
router.post("/:id/counter", validate(counterValidation), submitCounter);

// Company routes are also mounted under /company/builder-offers
export const companyBuilderOfferRouter = express.Router();
companyBuilderOfferRouter.use(authenticate);
companyBuilderOfferRouter.post(
  "/",
  validate(createOfferValidation),
  createOffer,
);
companyBuilderOfferRouter.get("/", listOffers);
companyBuilderOfferRouter.post(
  "/quick-order",
  validate(quickOrderValidation),
  quickOrder,
);
companyBuilderOfferRouter.get("/:id", getOffer);
companyBuilderOfferRouter.patch("/:id", updateOffer);
companyBuilderOfferRouter.post("/:id/submit", submitOffer);
companyBuilderOfferRouter.post("/:id/adjust", adjustOffer);
companyBuilderOfferRouter.post("/:id/cancel", cancelOffer);
companyBuilderOfferRouter.delete("/:id", cancelOffer);
companyBuilderOfferRouter.post("/:id/allow-counters", allowCounters);
companyBuilderOfferRouter.post("/:id/save-blanket", saveBlanket);
companyBuilderOfferRouter.get("/:id/recommendation", getRecommendation);
companyBuilderOfferRouter.post(
  "/:id/counters/:counterId/respond",
  respondCounter,
);

export const adminBuilderOfferRouter = express.Router();
adminBuilderOfferRouter.use(authenticate, admin);
adminBuilderOfferRouter.get("/", adminListOffers);
adminBuilderOfferRouter.get("/:id", adminGetOffer);
adminBuilderOfferRouter.patch("/:id", adminPatchOffer);
adminBuilderOfferRouter.post("/:id/invite", adminInvite);

export default router;
