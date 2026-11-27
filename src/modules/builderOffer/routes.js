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
  adjustInvoice,
  adjustOffer,
  adminGetOffer,
  adminInvite,
  adminListOffers,
  adminPatchOffer,
  allowCounters,
  cancelOffer,
  collectPickupPayment,
  createOffer,
  createSetupIntent,
  declinePortion,
  getOffer,
  getPaymentSetup,
  getRecommendation,
  listOffers,
  listPortions,
  payOrRetryInvoice,
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
router.post(
  "/orders/:orderId/collect-pickup-payment",
  collectPickupPayment,
);

// Company routes are also mounted under /company/builder-offers
export const companyBuilderOfferRouter = express.Router();
companyBuilderOfferRouter.use(authenticate);
companyBuilderOfferRouter.get("/payment-setup", getPaymentSetup);
companyBuilderOfferRouter.post("/setup-intent", createSetupIntent);
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
companyBuilderOfferRouter.post(
  "/:id/invoices/:billingId/pay",
  payOrRetryInvoice,
);
companyBuilderOfferRouter.post(
  "/:id/invoices/:billingId/retry",
  payOrRetryInvoice,
);
companyBuilderOfferRouter.post(
  "/:id/invoices/:billingId/adjust",
  adjustInvoice,
);

export const adminBuilderOfferRouter = express.Router();
adminBuilderOfferRouter.use(authenticate, admin);
adminBuilderOfferRouter.get("/", adminListOffers);
adminBuilderOfferRouter.get("/:id", adminGetOffer);
adminBuilderOfferRouter.patch("/:id", adminPatchOffer);
adminBuilderOfferRouter.post("/:id/invite", adminInvite);

export default router;
