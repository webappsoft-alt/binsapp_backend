import Joi from "joi";

export const createCompanyValidation = Joi.object({
  name: Joi.string().required(),
  email: Joi.string().email().required().lowercase().trim(),
  phone: Joi.string().required(),
  taxInfo: Joi.string().allow("", null).optional(),
  address: Joi.string().allow("", null).optional(),
  city: Joi.string().allow("", null).optional(),
  state: Joi.string().allow("", null).optional(),
  zip: Joi.string().allow("", null).optional(),
  country: Joi.string().allow("", null).optional(),
  COI: Joi.string().allow("", null).optional(),
  W9: Joi.string().allow("", null).optional(),
  onBoardingDocs: Joi.string().allow("", null).optional(),
  logo: Joi.string().allow("", null).optional(),
  EIN: Joi.string().optional().allow("", null),
  primaryContact: Joi.object({
    name: Joi.string().required(),
    email: Joi.string().email().optional().allow("", null),
    phone: Joi.string().optional().allow("", null),
    title: Joi.string().required(),
  }).optional(),
  accountsPayableEmail: Joi.string().email().allow("", null).optional(),
  expectedMonthlyVolume: Joi.number().allow("", null).optional(),
  PO: Joi.boolean().optional(),
  taxExempt: Joi.string().allow("", null).optional(),
  authorizedSigner: Joi.object({
    name: Joi.string().required(),
    email: Joi.string().email().optional().allow("", null),
    phone: Joi.string().optional().allow("", null),
    title: Joi.string().required(),
  }).optional(),
});
export const updateCompanyValidation = Joi.object({
  name: Joi.string().optional().allow("", null),
  email: Joi.string().email().optional().allow("", null),
  phone: Joi.string().optional().allow("", null),
  taxInfo: Joi.string().allow("", null).optional(),
  address: Joi.string().allow("", null).optional(),
  city: Joi.string().allow("", null).optional(),
  state: Joi.string().allow("", null).optional(),
  zip: Joi.string().allow("", null).optional(),
  country: Joi.string().allow("", null).optional(),
  COI: Joi.string().allow("", null).optional(),
  W9: Joi.string().allow("", null).optional(),
  onBoardingDocs: Joi.string().allow("", null).optional(),
  logo: Joi.string().allow("", null).optional(),
  isTaxExempt: Joi.boolean().optional(),
});

export const adminUpdateCompanyStatusValidation = Joi.object({
  status: Joi.string().valid("pending", "approved", "rejected").required(),
  isCOIApproved: Joi.boolean().optional(),
  COI_notes: Joi.string().optional(),
  isW9Approved: Joi.boolean().optional(),
  W9_notes: Joi.string().optional(),
  reason: Joi.when("status", {
    is: "rejected",
    then: Joi.string().trim().min(1).required(),
    otherwise: Joi.string().allow("", null).optional(),
  }),
  notes: Joi.string().allow("", null).optional(),
  isTaxExempt: Joi.boolean().optional(),
});

const deliveryWindowEnum = ["Morning", "Afternoon", "Evening", "SpecificTime"];

export const createJobSiteValidation = Joi.object({
  siteName: Joi.string().required(),
  projectName: Joi.string().allow("", null).optional(),
  communityName: Joi.string().allow("", null).optional(),
  division: Joi.string().allow("", null).optional(),
  jobNumber: Joi.string().allow("", null).optional(),
  poNumber: Joi.string().allow("", null).optional(),
  costCode: Joi.string().allow("", null).optional(),
  billingReference: Joi.string().allow("", null).optional(),
  siteContactName: Joi.string().allow("", null).optional(),
  siteContactPhone: Joi.string().allow("", null).optional(),
  authorizedUsers: Joi.string().allow("", null).optional(),
  serviceInstructions: Joi.string().allow("", null).optional(),
  gateAccessInstructions: Joi.string().allow("", null).optional(),
  deliveryRestrictions: Joi.string().allow("", null).optional(),
  hoursAllowedOnsite: Joi.string().allow("", null).optional(),
  materialRestrictions: Joi.string().allow("", null).optional(),
  address: Joi.string().required(),
  location: Joi.object({
    type: Joi.string().valid("Point").required(),
    coordinates: Joi.array().items(Joi.number()).required(),
  }).required(),
  city: Joi.string().allow("", null).optional(),
  state: Joi.string().allow("", null).optional(),
  zip: Joi.string().allow("", null).optional(),
  notes: Joi.string().allow("", null).optional(),
  instructions: Joi.string().allow("", null).optional(),
  placementInstructions: Joi.string().allow("", null).optional(),
  placementPhotoUrl: Joi.string().allow("", null).optional(),
  placementGeo: Joi.object({
    type: Joi.string().valid("Point").required(),
    coordinates: Joi.array().items(Joi.number()).length(2).required(),
  }).optional().allow(null),
  image: Joi.string().allow("", null).optional(),
  num_days: Joi.number().optional(),
  quantity: Joi.number().optional(),
  time: Joi.string().optional(),
  materialInformation: Joi.string().optional(),
  category: Joi.string().optional(),
  subCategory: Joi.string().optional(),
  dropoff_image: Joi.string().optional(),
  dumbsterId: Joi.string().optional().allow(null, ""),
  portaPottyId: Joi.string().optional().allow(null, ""),
  serviceType: Joi.string()
    .valid("dumpster", "junk", "porta", "tree")
    .optional(),
  placementLocation: Joi.string().optional(),
  accessNotes: Joi.string().optional(),
  defaultSize: Joi.string().valid("10", "15", "20", "30", "40").optional().allow(null),
  // Single legacy string or array of windows
  deliveryWindows: Joi.alternatives()
    .try(
      Joi.string().valid(...deliveryWindowEnum),
      Joi.array()
        .items(Joi.string().valid(...deliveryWindowEnum))
        .min(1),
    )
    .optional(),
  deliveryTime: Joi.date().optional().allow(null),
}).options({ stripUnknown: true });

export const quoteValidation = Joi.object({
  companyId: Joi.string().optional(),
  jobSiteId: Joi.string().optional().allow(null, ""),
  size: Joi.string().valid("10", "15", "20", "30", "40").optional(),
  numDays: Joi.number().integer().min(1).optional(),
  num_days: Joi.number().integer().min(1).optional(),
  quantity: Joi.number().integer().min(1).max(100).optional(),
  dumbsterId: Joi.string().optional().allow(null, ""),
  portaPottyId: Joi.string().optional().allow(null, ""),
  zip: Joi.string().optional().allow("", null),
  regionName: Joi.string().optional().allow("", null),
  /** initial = first drop; empty_redeliver = exchange / empty & return */
  rotationType: Joi.string()
    .valid("initial", "empty_redeliver")
    .optional()
    .default("initial"),
  location: Joi.object({
    type: Joi.string().valid("Point").optional(),
    coordinates: Joi.array().items(Joi.number()).optional(),
  }).optional(),
}).options({ stripUnknown: true });

export const swapRequestValidation = Joi.object({
  orderId: Joi.string().optional(),
  size: Joi.string().valid("10", "15", "20", "30", "40").optional(),
  sameSize: Joi.boolean().optional(),
  windowStart: Joi.date().optional(),
  windowEnd: Joi.date().optional(),
  notes: Joi.string().allow("", null).optional(),
}).options({ stripUnknown: true });

export const pricingPlanValidation = Joi.object({
  planType: Joi.string()
    .valid("blanket", "regional", "multi_region")
    .required(),
  rateCards: Joi.array()
    .items(
      Joi.object({
        size: Joi.string().valid("10", "15", "20", "30", "40").required(),
        threeDayPrice: Joi.number().min(0).optional(),
        sevenDayPrice: Joi.number().min(0).optional(),
        fourteenDayPrice: Joi.number().min(0).optional(),
        thirtyDayPrice: Joi.number().min(0).optional(),
        enableFourteenDay: Joi.boolean().optional(),
        enableThirtyDay: Joi.boolean().optional(),
        perDiemRate: Joi.number().min(0).optional(),
        includedTons: Joi.number().min(0).optional(),
        overagePerTon: Joi.number().min(0).optional(),
        overageEnforced: Joi.boolean().optional(),
      }),
    )
    .optional(),
  regions: Joi.array()
    .items(
      Joi.object({
        name: Joi.string().required(),
        zips: Joi.array().items(Joi.string()).optional(),
        geo: Joi.object({
          type: Joi.string().valid("Point").optional(),
          coordinates: Joi.array().items(Joi.number()).optional(),
        }).optional(),
        rateCards: Joi.array().items(Joi.object()).optional(),
      }),
    )
    .optional(),
}).options({ stripUnknown: true });

export const companyConfigValidation = Joi.object({
  paymentMethod: Joi.string().valid("card", "invoice").optional(),
  invoiceTerms: Joi.object({
    netDays: Joi.number().integer().min(0).optional(),
    creditLimit: Joi.number().min(0).optional(),
  }).optional(),
  serviceAreas: Joi.array()
    .items(
      Joi.object({
        name: Joi.string().allow("").optional(),
        zips: Joi.array().items(Joi.string()).optional(),
      }),
    )
    .optional(),
  minOperatorTier: Joi.number().integer().min(1).allow(null).optional(),
  requiredDocs: Joi.object({
    w9: Joi.boolean().optional(),
    coi: Joi.boolean().optional(),
  }).optional(),
  negotiatedRotationTerms: Joi.object({
    enabled: Joi.boolean().optional(),
    includedDaysPerRotation: Joi.number().min(0).allow(null).optional(),
    includedTonsPerRotation: Joi.number().min(0).allow(null).optional(),
    overagePerTon: Joi.number().min(0).allow(null).optional(),
    extraDay: Joi.number().min(0).allow(null).optional(),
    sizes: Joi.array()
      .items(
        Joi.object({
          size: Joi.string().valid("10", "15", "20", "30", "40").required(),
          initialDelivery: Joi.number().min(0).allow(null).optional(),
          emptyAndRedeliver: Joi.number().min(0).allow(null).optional(),
        }),
      )
      .optional(),
  }).optional(),
}).options({ stripUnknown: true });
