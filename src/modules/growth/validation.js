import Joi from "joi";

export const financingApplicationSchema = Joi.object({
  packageKey: Joi.string().required(),
  items: Joi.array()
    .items(
      Joi.object({
        catalogItemId: Joi.string().required(),
        qty: Joi.number().integer().min(1).default(1),
        branded: Joi.boolean().default(false),
      }),
    )
    .min(1)
    .required(),
});

export const growthConfigSchema = Joi.object({
  windowDays: Joi.number().integer().min(1).max(365),
  gmvDivisor: Joi.number().min(1),
  brandedMultiplier: Joi.number().min(1).max(5),
  milestonePercent: Joi.number().min(1).max(99),
  qualityGate: Joi.object({
    minRating: Joi.number().min(0).max(5),
    minOnTimeRate: Joi.number().min(0).max(1),
    maxCancellationRate: Joi.number().min(0).max(1),
    requireStripeVerified: Joi.boolean(),
    requireDocsCurrent: Joi.boolean(),
  }),
  penalties: Joi.object({
    late: Joi.number().min(0),
    no_show: Joi.number().min(0),
    prohibited_material: Joi.number().min(0),
    chargeback: Joi.number().min(0),
    refund: Joi.number().min(0),
  }),
  packages: Joi.array().items(
    Joi.object({
      key: Joi.string().required(),
      label: Joi.string().required(),
      cans: Joi.number().integer().min(0).required(),
      minJobs: Joi.number().integer().min(0).required(),
      minCredits: Joi.number().min(0).required(),
      requiresCommercialEligible: Joi.boolean().default(false),
    }),
  ),
}).min(1);

export const catalogItemSchema = Joi.object({
  manufacturer: Joi.string().required(),
  size: Joi.string()
    .valid("10", "12", "14", "15", "16", "18", "20", "30", "40")
    .required(),
  color: Joi.string().allow(""),
  branded: Joi.boolean(),
  specs: Joi.string().allow(""),
  photos: Joi.array().items(Joi.string().allow("")),
  cashPrice: Joi.number().min(0).required(),
  financing: Joi.object({
    termMonths: Joi.number().integer().min(1),
    aprPercent: Joi.number().min(0),
    estMonthlyPayment: Joi.number().min(0).allow(null),
    downPaymentPercent: Joi.number().min(0).max(100),
  }),
  stockStatus: Joi.string().valid(
    "in_stock",
    "low_stock",
    "out_of_stock",
    "preorder",
  ),
  active: Joi.boolean(),
  packageKeys: Joi.array().items(Joi.string()),
});

export const catalogItemUpdateSchema = catalogItemSchema.fork(
  ["manufacturer", "size", "cashPrice"],
  (s) => s.optional(),
);

export const applicationDecisionSchema = Joi.object({
  status: Joi.string()
    .valid("pending", "in_review", "approved", "denied", "withdrawn")
    .required(),
  adminNotes: Joi.string().allow(""),
  decisionTerms: Joi.object({
    approvedAmount: Joi.number().min(0).allow(null),
    termMonths: Joi.number().integer().min(1).allow(null),
    aprPercent: Joi.number().min(0).allow(null),
    monthlyPayment: Joi.number().min(0).allow(null),
    notes: Joi.string().allow(""),
  }),
});

export const operatorOverrideSchema = Joi.object({
  packageKey: Joi.string().allow(null),
  lockDays: Joi.number().integer().min(0).max(365).default(30),
  clearOverride: Joi.boolean().default(false),
});

export const brandedDumbsterSchema = Joi.object({
  branded: Joi.boolean().required(),
});

export const penaltySchema = Joi.object({
  type: Joi.string()
    .valid("late", "no_show", "prohibited_material", "chargeback", "refund")
    .required(),
  orderId: Joi.string().allow(null, ""),
  note: Joi.string().trim().min(3).max(500).required().messages({
    "string.min": "Penalty reason is required (min 3 characters)",
    "any.required": "Penalty reason is required",
  }),
  value: Joi.number().min(0).allow(null),
});

export const removePenaltySchema = Joi.object({
  penaltyId: Joi.string().required(),
  reason: Joi.string().allow("").max(500).default(""),
});
